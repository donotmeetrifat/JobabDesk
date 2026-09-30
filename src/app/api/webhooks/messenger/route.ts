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

// Meta Messenger Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    const entry = body?.entry?.[0]
    const pageId = entry?.id || ''
    const messaging = entry?.messaging?.[0]
    const senderId = messaging?.sender?.id
    const messageText = messaging?.message?.text?.trim()

    if (!senderId || !messageText) {
      return NextResponse.json({ status: 'ignored', reason: 'No actionable message' }, { status: 200 })
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

    // Find or create Contact
    let contactId: string | null = null
    try {
      const { data: existingContact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', senderId)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            phone: senderId,
            name: `Messenger User (${senderId.slice(-4)})`,
            channel: 'messenger',
          })
          .select('id')
          .maybeSingle()

        contactId = newContact?.id || null
      }
    } catch {
      // quiet catch
    }

    // Save Customer Message
    try {
      if (contactId) {
        await db.from('messages').insert({
          account_id: accountId,
          contact_id: contactId,
          channel: 'messenger',
          direction: 'inbound',
          content: messageText,
        })
      }
    } catch {
      // quiet catch
    }

    // Process AI auto-reply (includes jittered typing simulation)
    const result = await handleIncomingCustomerMessage({
      accountId,
      contactId: contactId || undefined,
      customerPhone: senderId,
      channel: 'messenger',
      messageText,
    })

    if (result?.aiReply && pageAccessToken) {
      // Send Auto-Reply via Meta Graph API Send Endpoint
      try {
        await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: { text: result.aiReply },
          }),
        })
      } catch (sendErr) {
        console.error('[Messenger Graph API Dispatch Error]:', sendErr)
      }

      // Save AI reply message log
      if (contactId) {
        try {
          await db.from('messages').insert({
            account_id: accountId,
            contact_id: contactId,
            channel: 'messenger',
            direction: 'outbound',
            content: result.aiReply,
          })
        } catch {
          // quiet catch
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (err: unknown) {
    console.error('[Messenger Webhook Exception]:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Internal error' }, { status: 500 })
  }
}
