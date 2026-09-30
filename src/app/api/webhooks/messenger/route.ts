import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Meta Messenger Webhook Verification GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.MESSENGER_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'jobabdesk_webhook'

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// Meta Messenger Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    const entry = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]
    const senderId = messaging?.sender?.id
    const messageText = messaging?.message?.text?.trim()

    if (!senderId || !messageText) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    // Resolve Account
    const { data: accounts } = await db.from('accounts').select('id, owner_user_id, ai_auto_reply_enabled').limit(1)
    const account = accounts?.[0]
    if (!account) {
      return NextResponse.json({ status: 'no_account' }, { status: 200 })
    }

    const accountId = account.id

    // Find or create Contact
    let contactId: string | null = null
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
        })
        .select('id')
        .single()

      contactId = newContact?.id || null
    }

    // Find or create Conversation
    let conversationId: string | null = null
    if (contactId) {
      const { data: existingConv } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv } = await db
          .from('conversations')
          .insert({
            account_id: accountId,
            contact_id: contactId,
            status: 'open',
          })
          .select('id')
          .single()
        conversationId = newConv?.id || null
      }
    }

    // Save Customer Message
    if (conversationId) {
      await db.from('messages').insert({
        account_id: accountId,
        conversation_id: conversationId,
        sender_type: 'customer',
        content_text: messageText,
        meta_id: messaging?.message?.mid || null,
      })
    }

    // Process AI auto-reply
    if (account.ai_auto_reply_enabled !== false) {
      const aiResponse = await handleIncomingCustomerMessage({
        accountId,
        contactId,
        customerPhone: senderId,
        messageText,
      })

      if (aiResponse?.aiReply && conversationId) {
        // Save AI reply message
        await db.from('messages').insert({
          account_id: accountId,
          conversation_id: conversationId,
          sender_type: 'agent',
          content_text: aiResponse.aiReply,
        })
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (err: unknown) {
    console.error('[Messenger Webhook Error]:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Internal error' }, { status: 500 })
  }
}
