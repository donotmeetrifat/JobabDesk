import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'

// Meta Messenger Webhook Verification GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken =
    process.env.MESSENGER_VERIFY_TOKEN ||
    process.env.META_VERIFY_TOKEN ||
    'jobabdesk_verify_token'

  if (mode === 'subscribe' && (token === verifyToken || token === 'jobabdesk_verify_token')) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new Response('Forbidden', { status: 403 })
}

async function resolveOwnerUserId(db: any, accountId: string): Promise<string> {
  const { data: acc } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle()

  if (acc?.owner_user_id) return acc.owner_user_id

  const { data: prof } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  if (prof?.user_id) return prof.user_id

  const { data: anyProf } = await db
    .from('profiles')
    .select('user_id')
    .limit(1)
    .maybeSingle()

  return anyProf?.user_id || ''
}

// Meta Messenger Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    const entry = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]
    if (!messaging) {
      return NextResponse.json({ status: 'ignored', reason: 'No messaging payload' }, { status: 200 })
    }

    const isEcho = Boolean(messaging?.message?.is_echo)
    const pageId = entry?.id || (isEcho ? messaging?.sender?.id : messaging?.recipient?.id) || ''
    const customerPsid = isEcho ? messaging?.recipient?.id : messaging?.sender?.id
    const messageText = messaging?.message?.text?.trim()
    const messageId = messaging?.message?.mid

    if (!customerPsid || !messageText) {
      return NextResponse.json({ status: 'ignored', reason: 'No actionable text or sender' }, { status: 200 })
    }

    // Resolve Account matching Facebook Page ID
    let accountId = ''
    let pageAccessToken = ''

    if (pageId) {
      const { data: matchedAccount } = await db
        .from('accounts')
        .select('id, facebook_page_access_token')
        .eq('facebook_page_id', pageId)
        .maybeSingle()
      accountId = matchedAccount?.id || ''
      pageAccessToken = matchedAccount?.facebook_page_access_token || ''
    }

    if (!accountId) {
      const { data: firstAccount } = await db
        .from('accounts')
        .select('id, facebook_page_access_token')
        .not('facebook_page_id', 'is', null)
        .limit(1)
        .maybeSingle()
      accountId = firstAccount?.id || ''
      pageAccessToken = firstAccount?.facebook_page_access_token || ''
    }

    if (!accountId) {
      return NextResponse.json({ status: 'no_account' }, { status: 200 })
    }

    const ownerUserId = await resolveOwnerUserId(db, accountId)

    // 1. Find or create Contact in contacts table
    let contactId = ''
    const { data: existingContact } = await db
      .from('contacts')
      .select('id, name')
      .eq('account_id', accountId)
      .eq('phone', customerPsid)
      .maybeSingle()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      let customerName = `Messenger User (${customerPsid.slice(-4)})`
      if (pageAccessToken) {
        try {
          const profileRes = await fetch(
            `https://graph.facebook.com/v19.0/${customerPsid}?fields=first_name,last_name,name&access_token=${encodeURIComponent(pageAccessToken)}`
          )
          const profileJson = await profileRes.json()
          if (profileJson.name) {
            customerName = profileJson.name
          } else if (profileJson.first_name) {
            customerName = `${profileJson.first_name} ${profileJson.last_name || ''}`.trim()
          }
        } catch {
          // ignore profile fetch failure
        }
      }

      const { data: newContact, error: createContactErr } = await db
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: ownerUserId,
          phone: customerPsid,
          name: customerName,
        })
        .select('id')
        .maybeSingle()

      if (newContact) {
        contactId = newContact.id
      } else {
        const { data: retryContact } = await db
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .or(`phone.eq.${customerPsid},phone_normalized.eq.${customerPsid.replace(/\D/g, '')}`)
          .maybeSingle()
        contactId = retryContact?.id || ''
      }
    }

    if (!contactId) {
      return NextResponse.json({ status: 'error', reason: 'Failed to resolve contact' }, { status: 500 })
    }

    // 2. Find or create Conversation in conversations table
    let conversationId = ''
    const nowIso = new Date().toISOString()
    const { data: existingConv } = await db
      .from('conversations')
      .select('id, unread_count')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
      await db
        .from('conversations')
        .update({
          last_message_text: messageText,
          last_message_at: nowIso,
          unread_count: isEcho ? existingConv.unread_count : (existingConv.unread_count || 0) + 1,
          status: 'open',
          updated_at: nowIso,
        })
        .eq('id', existingConv.id)
    } else {
      const { data: newConv } = await db
        .from('conversations')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          user_id: ownerUserId,
          status: 'open',
          last_message_text: messageText,
          last_message_at: nowIso,
          unread_count: isEcho ? 0 : 1,
        })
        .select('id')
        .maybeSingle()

      if (newConv) {
        conversationId = newConv.id
      } else {
        const { data: retryConv } = await db
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .maybeSingle()
        conversationId = retryConv?.id || ''
      }
    }

    // 3. Save Message into messages table (deduplicated by messageId)
    if (conversationId) {
      if (messageId) {
        const { data: dupMsg } = await db
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('message_id', messageId)
          .maybeSingle()

        if (dupMsg) {
          return NextResponse.json({ status: 'already_processed' }, { status: 200 })
        }
      }

      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: isEcho ? 'agent' : 'customer',
        content_type: 'text',
        content_text: messageText,
        message_id: messageId || null,
        status: 'delivered',
        created_at: nowIso,
      })
    }

    // 4. Process AI auto-reply if not an echo message
    if (!isEcho) {
      const result = await handleIncomingCustomerMessage({
        accountId,
        contactId,
        customerPhone: customerPsid,
        channel: 'messenger',
        messageText,
      })

      if (result?.aiReply && pageAccessToken) {
        try {
          const sendRes = await fetch(
            `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: customerPsid },
                message: { text: result.aiReply },
              }),
            }
          )
          const sendData = await sendRes.json()
          const replyMid = sendData?.message_id

          if (conversationId) {
            await db.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'bot',
              content_type: 'text',
              content_text: result.aiReply,
              message_id: replyMid || null,
              status: 'delivered',
              created_at: new Date().toISOString(),
            })

            await db
              .from('conversations')
              .update({
                last_message_text: result.aiReply,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversationId)
          }
        } catch (sendErr) {
          console.error('[Messenger Graph API Dispatch Error]:', sendErr)
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (err: unknown) {
    console.error('[Messenger Webhook Exception]:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Internal error' }, { status: 500 })
  }
}
