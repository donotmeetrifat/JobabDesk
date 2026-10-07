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
import { createClient as createAdminClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co';
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createAdminClient(url, serviceKey);
}

async function saveReactionToDb({
  admin,
  supabase,
  messageId,
  conversationId,
  userId,
  emoji,
}: {
  admin: any;
  supabase: any;
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
}) {
  if (emoji === '') {
    // Delete reaction
    const delAdmin = await admin
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('actor_type', 'agent')
      .eq('actor_id', userId);

    if (delAdmin.error) {
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('actor_type', 'agent')
        .eq('actor_id', userId);
    }
    return null;
  }

  const payload = {
    message_id: messageId,
    conversation_id: conversationId,
    actor_type: 'agent',
    actor_id: userId,
    emoji,
  };

  // Check if reaction row already exists
  const { data: existing } = await admin
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('actor_type', 'agent')
    .eq('actor_id', userId)
    .maybeSingle();

  if (existing?.id) {
    const { data: upData, error: upErr } = await admin
      .from('message_reactions')
      .update({ emoji })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (upData && !upErr) return upData;

    const { data: fbData } = await supabase
      .from('message_reactions')
      .update({ emoji })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    return fbData || { id: existing.id, ...payload, created_at: new Date().toISOString() };
  } else {
    const { data: insData, error: insErr } = await admin
      .from('message_reactions')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (insData && !insErr) return insData;

    const { data: fbIns } = await supabase
      .from('message_reactions')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (fbIns) return fbIns;

    const { data: upsertData } = await admin
      .from('message_reactions')
      .upsert(payload, { onConflict: 'message_id,actor_type,actor_id' })
      .select('*')
      .maybeSingle();

    return upsertData || { id: `agent-${Date.now()}`, ...payload, created_at: new Date().toISOString() };
  }
}

/**
 * POST /api/whatsapp/react
 *
 * Body: { message_id: <internal UUID>, emoji: <single emoji or "" to remove> }
 *
 * Sends the reaction to Meta (Messenger or WhatsApp) and mirrors it into `message_reactions`
 * (delete on empty emoji). Customer-side reactions are handled by webhooks — this route only writes `actor_type = 'agent'` rows.
 */
export async function POST(request: Request) {
  try {
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

    const admin = getAdminClient();

    // 1. Resolve target message
    const { data: targetMessage, error: msgError } = await admin
      .from('messages')
      .select('id, message_id, conversation_id')
      .eq('id', message_id)
      .maybeSingle();

    if (msgError || !targetMessage) {
      console.warn('[react] Message not found:', message_id, msgError?.message);
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (!targetMessage.message_id) {
      return NextResponse.json(
        { error: 'Cannot react to a message that has not been sent to Meta' },
        { status: 400 },
      );
    }

    // 2. Resolve conversation (bypassing RLS with admin client)
    const { data: conversation, error: convError } = await admin
      .from('conversations')
      .select('*')
      .eq('id', targetMessage.conversation_id)
      .maybeSingle();

    if (convError || !conversation) {
      console.warn('[react] Conversation not found:', targetMessage.conversation_id, convError?.message);
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 },
      );
    }

    const effectiveAccountId = conversation.account_id || accountId;

    // 3. Resolve contact
    let contact: any = null;
    if (conversation.contact_id) {
      const { data: directContact } = await admin
        .from('contacts')
        .select('*')
        .eq('id', conversation.contact_id)
        .maybeSingle();
      contact = directContact;
    }

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
      const { data: accountRow } = await admin
        .from('accounts')
        .select('facebook_page_access_token, facebook_page_id')
        .eq('id', effectiveAccountId)
        .maybeSingle();

      let fbToken = accountRow?.facebook_page_access_token || '';
      let fbPageId = accountRow?.facebook_page_id || '';

      if (!fbToken) {
        const { data: chan } = await admin
          .from('channel_connections')
          .select('metadata, external_account_id')
          .eq('account_id', effectiveAccountId)
          .eq('channel_type', 'messenger')
          .maybeSingle();
        fbToken = chan?.metadata?.access_token || chan?.metadata?.accessToken || '';
        if (!fbPageId) fbPageId = chan?.external_account_id || '';
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
      const savedReaction = await saveReactionToDb({
        admin,
        supabase,
        messageId: targetMessage.id,
        conversationId: targetMessage.conversation_id,
        userId,
        emoji,
      });

      return NextResponse.json({ success: true, reaction: savedReaction });
    }

    // WhatsApp flow
    const sendTarget = resolveContactSendTarget(contact);
    if (!sendTarget) {
      return NextResponse.json(
        { error: 'Contact has no phone number or WhatsApp user ID' },
        { status: 400 },
      );
    }

    // WhatsApp config + access token.
    const { data: config, error: configError } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', effectiveAccountId)
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

    // Mirror into DB using safe multi-strategy helper
    const savedReaction = await saveReactionToDb({
      admin,
      supabase,
      messageId: targetMessage.id,
      conversationId: targetMessage.conversation_id,
      userId,
      emoji,
    });

    return NextResponse.json({ success: true, reaction: savedReaction });
  } catch (error) {
    console.error('Error in react POST:', error);
    return toErrorResponse(error);
  }
}
