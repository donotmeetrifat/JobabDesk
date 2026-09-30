import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
import { engineSendText } from '@/lib/flows/meta-send'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Meta Webhook Verification GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || 'jobabdesk_webhook'

  if (mode === 'subscribe' && token === verifyToken) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// Meta WhatsApp Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    // Parse Meta WhatsApp Webhook payload
    const entry = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value
    const messages = value?.messages

    if (!messages || messages.length === 0) {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    const msg = messages[0]
    const fromPhone = msg.from // e.g. "8801700000000"
    const messageText = msg.text?.body?.trim()

    if (!fromPhone || !messageText) {
      return NextResponse.json({ status: 'non_text_or_empty' }, { status: 200 })
    }

    // Resolve Account (find first active account or from metadata)
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
      .ilike('phone', `%${fromPhone}%`)
      .maybeSingle()

    if (existingContact) {
      contactId = existingContact.id
    } else {
      const { data: newContact } = await db
        .from('contacts')
        .insert({
          account_id: accountId,
          phone: fromPhone,
          name: value.contacts?.[0]?.profile?.name || `Customer (${fromPhone})`,
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
        meta_id: msg.id,
      })
    }

    // Check AI Auto Reply setting
    if (account.ai_auto_reply_enabled !== false) {
      const aiResponse = await handleIncomingCustomerMessage({
        accountId,
        contactId,
        customerPhone: fromPhone,
        messageText,
      })

      if (aiResponse?.aiReply && conversationId && contactId) {
        // Automatically send reply via WhatsApp API
        try {
          await engineSendText({
            accountId,
            userId: account.owner_user_id || accountId,
            conversationId,
            contactId,
            text: aiResponse.aiReply,
            aiGenerated: true,
          })
        } catch (sendErr) {
          console.error('[WhatsApp Webhook] Outbound send failed:', sendErr)
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (err: unknown) {
    console.error('[WhatsApp Webhook Error]:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Internal error' }, { status: 500 })
  }
}
