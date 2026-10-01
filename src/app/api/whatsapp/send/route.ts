import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  sendMessageToConversation,
  validateSendMessageParams,
  SendMessageError,
} from '@/lib/whatsapp/send-message'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createAdminClient(url, serviceKey)
}

// The dashboard's outbound-send endpoint. It owns auth, per-user rate
// limiting, and the two ways the UI targets a thread — an existing
// `conversation_id` (inbox) or a `contact_id` (Contact detail →
// find-or-create the conversation). The actual Meta plumbing (validate
// → send → persist → pause flows) lives in the shared
// `sendMessageToConversation` core, which the public `/api/v1/messages`
// endpoint reuses. This route is a thin adapter: resolve the
// conversation, delegate, then map `SendMessageError` back onto the
// dashboard's internal `{ error }` shape.
export async function POST(request: Request) {
  try {
    // Requires the 'agent' role, matching both `canSendMessages` and the
    // `messages_modify` RLS policy (migration 017).
    //
    // Resolving `account_id` off the profile — which any 'viewer' has —
    // was previously the only gate. RLS did block the message INSERT, but
    // the send core calls Meta BEFORE it persists, so a viewer's request
    // still delivered a real WhatsApp message to the customer and merely
    // failed to record it (surfacing as "sent to Meta but failed to save
    // to DB"). RLS can't un-send that, so the role check belongs here.
    const { supabase, accountId, userId } = await requireRole('agent')

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${userId}`, RATE_LIMITS.send)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      // `conversation_id` targets an existing thread (inbox). `contact_id`
      // lets a caller initiate from a contact that may have no conversation
      // yet (Contact detail → Send template) — we find-or-create one below.
      conversation_id: conversationIdInput,
      contact_id,
      message_type,
      content_text,
      media_url,
      filename,
      template_name,
      template_language,
      template_params,
      template_message_params,
      interactive_payload,
      reply_to_message_id,
    } = body

    if ((!conversationIdInput && !contact_id) || !message_type) {
      return NextResponse.json(
        {
          error:
            'Either conversation_id or contact_id, plus message_type, are required',
        },
        { status: 400 }
      )
    }

    // Validate the message shape up front — before the contact_id path
    // finds-or-creates a conversation — so an invalid payload 400s
    // without leaving an orphan empty conversation behind.
    try {
      validateSendMessageParams({
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        templateName: template_name,
        interactivePayload: interactive_payload,
      })
    } catch (err) {
      if (err instanceof SendMessageError) {
        return NextResponse.json({ error: err.message }, { status: err.status })
      }
      throw err
    }

    // Resolve the target conversation. With `conversation_id` we load the
    // existing thread; with `contact_id` we find-or-create one for the
    // contact so a business-initiated template send (Contact detail view)
    // reuses the shared send core below.
    let conversationId: string | null = null

    if (conversationIdInput) {
      const { data, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationIdInput)
        .eq('account_id', accountId)
        .single()

      if (convError || !data) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }
      conversationId = data.id
    } else {
      // contact_id path: verify the contact is in this account first so a
      // caller can't open a conversation against someone else's contact.
      const { data: contactRow, error: contactErr } = await supabase
        .from('contacts')
        .select('id')
        .eq('id', contact_id)
        .eq('account_id', accountId)
        .maybeSingle()

      if (contactErr || !contactRow) {
        return NextResponse.json(
          { error: 'Contact not found' },
          { status: 404 }
        )
      }

      const resolved = await findOrCreateConversation(
        supabase,
        accountId,
        userId,
        contact_id
      )
      if (!resolved) {
        return NextResponse.json(
          { error: 'Failed to open a conversation for this contact' },
          { status: 500 }
        )
      }
      conversationId = resolved
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Check if target conversation is a Facebook Messenger contact
    const admin = getAdminClient()
    const { data: convData } = await admin
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversationId)
      .maybeSingle()

    let contact = (convData as any)?.contact
    if (!contact && convData?.contact_id) {
      const { data: directContact } = await admin
        .from('contacts')
        .select('*')
        .eq('id', convData.contact_id)
        .maybeSingle()
      contact = directContact
    }

    let psid = contact?.phone || ''
    // If contact.phone is missing or a UUID, look up valid contact in account
    if (!psid || psid.includes('-')) {
      const { data: realContact } = await admin
        .from('contacts')
        .select('phone')
        .eq('account_id', accountId)
        .eq('company', 'Facebook Messenger')
        .not('phone', 'like', '%-%')
        .limit(1)
        .maybeSingle()
      if (realContact?.phone) {
        psid = realContact.phone
      }
    }

    const isMessenger =
      contact?.channel === 'messenger' ||
      contact?.company === 'Facebook Messenger' ||
      (psid && !psid.includes('-') && !psid.startsWith('+') && !isNaN(Number(psid)) && psid.length > 9)

    if (isMessenger && content_text) {
      const { data: accountRow } = await admin
        .from('accounts')
        .select('facebook_page_access_token')
        .eq('id', accountId)
        .maybeSingle()

      let fbToken = accountRow?.facebook_page_access_token || ''
      if (!fbToken) {
        const { data: chan } = await admin
          .from('channel_connections')
          .select('metadata')
          .eq('account_id', accountId)
          .eq('channel_type', 'messenger')
          .maybeSingle()
        fbToken = chan?.metadata?.access_token || chan?.metadata?.accessToken || ''
      }
      if (!fbToken) {
        const { data: anyChan } = await admin
          .from('channel_connections')
          .select('metadata')
          .eq('channel_type', 'messenger')
          .limit(1)
          .maybeSingle()
        fbToken = anyChan?.metadata?.access_token || anyChan?.metadata?.accessToken || ''
      }

      if (fbToken && psid && !psid.includes('-')) {
        let activePageToken = fbToken
        try {
          const meRes = await fetch(
            `https://graph.facebook.com/v20.0/me?fields=id,category&access_token=${encodeURIComponent(fbToken)}`
          )
          if (meRes.ok) {
            const meData = await meRes.json()
            if (!meData?.category) {
              // User token — resolve Page token via /me/accounts
              const accsRes = await fetch(
                `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(fbToken)}`
              )
              if (accsRes.ok) {
                const accsData = await accsRes.json()
                const pages = accsData?.data || []
                if (pages.length > 0 && pages[0].access_token) {
                  activePageToken = pages[0].access_token
                }
              }
            }
          }
        } catch {}

        let fbRes = await fetch(
          `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(activePageToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: psid },
              messaging_type: 'RESPONSE',
              message: { text: content_text },
            }),
          }
        )
        let fbJson = await fbRes.json()

        // If window error, retry with MESSAGE_TAG
        if (!fbRes.ok && (fbJson?.error?.code === 10 || fbJson?.error?.message?.includes('window') || fbJson?.error?.error_subcode === 2018001)) {
          fbRes = await fetch(
            `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(activePageToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: psid },
                messaging_type: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
                message: { text: content_text },
              }),
            }
          )
          fbJson = await fbRes.json()
        }

        if (!fbRes.ok || fbJson.error || !fbJson.message_id) {
          return NextResponse.json(
            { error: fbJson.error?.message || 'Failed to dispatch via Meta Messenger' },
            { status: 400 }
          )
        }

        const fbMid = fbJson.message_id
        const nowIso = new Date().toISOString()

        const { data: insertedMsg } = await admin
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_type: 'agent',
            content_type: 'text',
            content_text,
            message_id: fbMid,
            status: 'sent',
            created_at: nowIso,
          })
          .select('id')
          .single()

        await admin
          .from('conversations')
          .update({
            last_message_text: content_text,
            last_message_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', conversationId)

        return NextResponse.json({
          success: true,
          message_id: insertedMsg?.id || fbMid,
          whatsapp_message_id: fbMid,
        })
      }
    }

    // Delegate to the shared send core (validates, sends to Meta with
    // phone-variant retry, persists, pauses active flow runs). Its
    // `SendMessageError` carries a machine code + HTTP status; the
    // dashboard maps it to the internal `{ error }` shape.
    try {
      const result = await sendMessageToConversation(supabase, accountId, {
        conversationId,
        messageType: message_type,
        contentText: content_text,
        mediaUrl: media_url,
        filename,
        templateName: template_name,
        templateLanguage: template_language,
        templateParams: template_params,
        templateMessageParams: template_message_params,
        interactivePayload: interactive_payload,
        replyToMessageId: reply_to_message_id,
      })

      return NextResponse.json({
        success: true,
        message_id: result.messageId,
        whatsapp_message_id: result.whatsappMessageId,
      })
    } catch (err) {
      if (err instanceof SendMessageError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status }
        )
      }
      throw err
    }
  } catch (error) {
    // requireRole throws Unauthorized/Forbidden; toErrorResponse maps
    // those to 401/403 and collapses anything else to a generic 500.
    console.error('Error in WhatsApp send POST:', error)
    return toErrorResponse(error)
  }
}

type SendSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Return the contact's conversation id in this account, creating one if
 * it doesn't exist yet. Mirrors the webhook's find-or-create so an
 * inbound-then-outbound (or outbound-first) sequence converges on a single
 * thread per contact. Runs under the caller's RLS — the conversations_insert
 * policy requires account agent membership, which the caller already is.
 */
async function findOrCreateConversation(
  supabase: SendSupabase,
  accountId: string,
  userId: string,
  contactId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('Error creating conversation for contact send:', error.message)
    return null
  }

  return created.id
}
