import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendReactionMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { resolveContactSendTarget } from '@/lib/whatsapp/wa-identity';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

/**
 * POST /api/whatsapp/react
 *
 * Body: { message_id: <internal UUID>, emoji: <single emoji or "" to remove> }
 *
 * Sends the reaction to Meta and mirrors it into `message_reactions`
 * (delete on empty emoji). Customer-side reactions are handled by the
 * webhook — this route only writes `actor_type = 'agent'` rows.
 */
export async function POST(request: Request) {
  try {
    // Reacting is a write operation (`canSendMessages`), and it pushes the
    // reaction to Meta before mirroring it locally — so, as on /send, a
    // missing role check let a read-only viewer put a visible reaction on
    // the customer's message even though RLS blocked the local mirror.
    const { supabase, accountId, userId } = await requireRole('agent');

    const limit = checkRateLimit(`react:${userId}`, RATE_LIMITS.react);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json();
    const { message_id, emoji } = body as {
      message_id?: string;
      emoji?: string;
    };

    if (!message_id || typeof emoji !== 'string') {
      return NextResponse.json(
        { error: 'message_id and emoji are required' },
        { status: 400 },
      );
    }

    // Resolve target message + its conversation; verify ownership.
    const { data: targetMessage, error: msgError } = await supabase
      .from('messages')
      .select('id, message_id, conversation_id')
      .eq('id', message_id)
      .maybeSingle();

    if (msgError || !targetMessage) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (!targetMessage.message_id) {
      // No Meta ID yet — usually a sending/failed agent message. We can't
      // tell Meta to react to a message it never received.
      return NextResponse.json(
        { error: 'Cannot react to a message that has not been sent to Meta' },
        { status: 400 },
      );
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, account_id, channel, contact:contacts(phone, wa_user_id, company, channel)')
      .eq('id', targetMessage.conversation_id)
      .eq('account_id', accountId)
      .maybeSingle();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    }

    const contact = Array.isArray(conversation.contact)
      ? conversation.contact[0]
      : conversation.contact;

    const psid = contact?.phone || '';
    const isMessenger =
      conversation?.channel === 'messenger' ||
      contact?.channel === 'messenger' ||
      contact?.company === 'Facebook Messenger' ||
      (psid && !psid.includes('-') && !psid.startsWith('+') && !isNaN(Number(psid)) && psid.length > 9);

    if (isMessenger) {
      if (!psid || psid.includes('-')) {
        return NextResponse.json(
          { error: 'Contact has no valid Facebook Messenger PSID' },
          { status: 400 },
        );
      }

      // 1. Fetch Facebook Page Access Token
      const { data: accountRow } = await supabase
        .from('accounts')
        .select('facebook_page_access_token, facebook_page_id')
        .eq('id', accountId)
        .maybeSingle();

      let fbToken = accountRow?.facebook_page_access_token || '';
      let fbPageId = accountRow?.facebook_page_id || '';

      if (!fbToken) {
        const { data: chan } = await supabase
          .from('channel_connections')
          .select('metadata, external_account_id')
          .eq('account_id', accountId)
          .eq('channel_type', 'messenger')
          .maybeSingle();
        fbToken = chan?.metadata?.access_token || chan?.metadata?.accessToken || '';
        if (!fbPageId) fbPageId = chan?.external_account_id || '';
      }

      if (!fbToken) {
        const { data: anyChan } = await supabase
          .from('channel_connections')
          .select('metadata, external_account_id')
          .eq('channel_type', 'messenger')
          .limit(1)
          .maybeSingle();
        fbToken = anyChan?.metadata?.access_token || anyChan?.metadata?.accessToken || '';
        if (!fbPageId) fbPageId = anyChan?.external_account_id || '';
      }

      if (!fbToken) {
        return NextResponse.json(
          { error: 'Facebook Page Access Token not configured for this account' },
          { status: 400 },
        );
      }

      // 2. Resolve real Page Token if a User Token was stored
      let activePageToken = fbToken;
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=id,category&access_token=${encodeURIComponent(fbToken)}`
        );
        if (meRes.ok) {
          const meData = await meRes.json();
          if (!meData?.category) {
            const accsRes = await fetch(
              `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(fbToken)}`
            );
            if (accsRes.ok) {
              const accsData = await accsRes.json();
              const pages = accsData?.data || [];
              if (pages.length > 0) {
                if (fbPageId) {
                  const match = pages.find((p: any) => p.id === fbPageId);
                  if (match?.access_token) activePageToken = match.access_token;
                }
                if (activePageToken === fbToken && pages[0].access_token) {
                  activePageToken = pages[0].access_token;
                }
              }
            }
            if (activePageToken === fbToken) {
              const assignedRes = await fetch(
                `https://graph.facebook.com/v20.0/me/assigned_pages?fields=id,access_token&access_token=${encodeURIComponent(fbToken)}`
              );
              if (assignedRes.ok) {
                const assignedData = await assignedRes.json();
                const pages = assignedData?.data || [];
                if (pages.length > 0 && pages[0].access_token) {
                  activePageToken = pages[0].access_token;
                }
              }
            }
          }
        }
      } catch {}

      // 3. Dispatch reaction to Facebook Messenger Send API
      const actionPayload = emoji
        ? {
            recipient: { id: psid },
            sender_action: 'react',
            payload: {
              message_id: targetMessage.message_id,
              reaction: emoji,
            },
          }
        : {
            recipient: { id: psid },
            sender_action: 'unreact',
            payload: {
              message_id: targetMessage.message_id,
            },
          };

      const fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(activePageToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actionPayload),
        }
      );

      const fbJson = await fbRes.json().catch(() => ({}));
      if (!fbRes.ok || fbJson.error) {
        console.error('[messenger/react] Meta error:', fbJson?.error);
        return NextResponse.json(
          { error: fbJson?.error?.message || 'Meta Messenger API error while sending reaction' },
          { status: 502 },
        );
      }

      // 4. Mirror reaction into message_reactions in DB
      if (emoji === '') {
        const { error: delError } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', targetMessage.id)
          .eq('actor_type', 'agent')
          .eq('actor_id', userId);

        if (delError) {
          console.error('[messenger/react] DB delete failed:', delError.message);
          return NextResponse.json(
            { error: 'Reaction sent to Meta but DB delete failed' },
            { status: 500 },
          );
        }
      } else {
        const { error: upsertError } = await supabase.from('message_reactions').upsert(
          {
            message_id: targetMessage.id,
            conversation_id: targetMessage.conversation_id,
            actor_type: 'agent',
            actor_id: userId,
            emoji,
          },
          { onConflict: 'message_id,actor_type,actor_id' },
        );

        if (upsertError) {
          console.error('[messenger/react] DB upsert failed:', upsertError.message);
          return NextResponse.json(
            { error: 'Reaction sent to Meta but DB upsert failed' },
            { status: 500 },
          );
        }
      }

      return NextResponse.json({ success: true });
    }

    // WhatsApp flow
    // Phone number, or the business-scoped user ID for a contact Meta
    // never gave us a number for (issue #519).
    const sendTarget = resolveContactSendTarget(contact);
    if (!sendTarget) {
      return NextResponse.json(
        { error: 'Contact has no phone number or WhatsApp user ID' },
        { status: 400 },
      );
    }

    // WhatsApp config + access token. Account-scoped post-multi-user.
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .single();

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured.' },
        { status: 400 },
      );
    }

    const accessToken = decrypt(config.access_token);

    try {
      await sendReactionMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to: sendTarget.target,
        targetMessageId: targetMessage.message_id,
        emoji,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('[whatsapp/react] Meta send failed:', message);
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 502 },
      );
    }

    // Mirror into DB. Empty emoji = removal.
    if (emoji === '') {
      const { error: delError } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', targetMessage.id)
        .eq('actor_type', 'agent')
        .eq('actor_id', userId);

      if (delError) {
        console.error('[whatsapp/react] DB delete failed:', delError.message);
        return NextResponse.json(
          { error: 'Reaction sent to Meta but DB delete failed' },
          { status: 500 },
        );
      }
    } else {
      // Upsert. The unique constraint (message_id, actor_type, actor_id)
      // lets us swap emoji in a single statement.
      const { error: upsertError } = await supabase.from('message_reactions').upsert(
        {
          message_id: targetMessage.id,
          conversation_id: targetMessage.conversation_id,
          actor_type: 'agent',
          actor_id: userId,
          emoji,
        },
        { onConflict: 'message_id,actor_type,actor_id' },
      );

      if (upsertError) {
        console.error('[whatsapp/react] DB upsert failed:', upsertError.message);
        return NextResponse.json(
          { error: 'Reaction sent to Meta but DB upsert failed' },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // requireRole throws Unauthorized/Forbidden; toErrorResponse maps
    // those to 401/403 and collapses anything else to a generic 500.
    console.error('Error in WhatsApp react POST:', error);
    return toErrorResponse(error);
  }
}
