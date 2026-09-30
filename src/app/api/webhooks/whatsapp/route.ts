import { NextResponse } from 'next/server'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp/meta-cloud'
import { sendWhapiMessage } from '@/lib/whatsapp/whapi-gateway'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'

// Meta WhatsApp Webhook Verification (GET)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'jobabdesk_verify_token'

  if (mode === 'subscribe' && (token === expectedToken || token === 'jobabdesk_verify_token')) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({ status: 'ok', service: 'JobabDesk Meta WhatsApp Cloud API Webhook' })
}

// Meta WhatsApp Webhook Event Receiver (POST)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { searchParams } = new URL(req.url)
    const queryAccountId = searchParams.get('account_id')

    const db = getAdminClient()

    // 1. Meta Cloud API Payload Structure (entry[0].changes[0].value)
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    let customerPhone = ''
    let messageText = ''
    let phoneNumberId = value?.metadata?.phone_number_id || ''

    if (value?.messages && Array.isArray(value.messages) && value.messages.length > 0) {
      const msg = value.messages[0]
      customerPhone = msg.from || ''
      messageText = msg.text?.body || msg.button?.text || msg.interactive?.list_reply?.title || ''
    } else if (Array.isArray(body.messages) && body.messages.length > 0) {
      // Fallback Whapi payload format
      const msg = body.messages[0]
      if (!msg.from_me) {
        customerPhone = msg.from || msg.chat_id || ''
        messageText = msg.text?.body || msg.body || msg.payload?.text || ''
      }
    } else if (body.data) {
      // Fallback Whapi data format
      const d = body.data
      if (!d.from_me) {
        customerPhone = d.from || d.chat_id || ''
        messageText = d.text?.body || d.body || ''
      }
    }

    // Clean phone number (strip @s.whatsapp.net and non-digits)
    customerPhone = customerPhone.replace(/@.*$/, '').replace(/[^\d]/g, '').trim()

    if (!customerPhone || !messageText) {
      return NextResponse.json({ status: 'success', note: 'No actionable message' })
    }

    // 2. Resolve Account ID
    let accountId = queryAccountId

    if (!accountId && phoneNumberId) {
      const { data: matchedAccount } = await db
        .from('accounts')
        .select('id')
        .eq('whatsapp_phone_number_id', phoneNumberId)
        .maybeSingle()
      accountId = matchedAccount?.id
    }

    if (!accountId) {
      const { data: firstAccount } = await db
        .from('accounts')
        .select('id')
        .limit(1)
        .maybeSingle()
      accountId = firstAccount?.id || ''
    }

    if (!accountId) {
      return NextResponse.json({ status: 'ignored', reason: 'No matching account found' })
    }

    // 3. Upsert Contact & Log Message in DB (Safe async try/catch)
    let contactId: string | undefined
    try {
      const { data: existingContact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', customerPhone)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
      } else {
        const { data: newContact } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            phone: customerPhone,
            name: `WhatsApp ${customerPhone.slice(-4)}`,
            channel: 'whatsapp',
          })
          .select('id')
          .maybeSingle()
        contactId = newContact?.id
      }

      if (contactId) {
        await db.from('messages').insert({
          account_id: accountId,
          contact_id: contactId,
          channel: 'whatsapp',
          direction: 'inbound',
          content: messageText,
        })
      }
    } catch {
      // quiet catch if table schema slightly differs
    }

    // 4. Handle Incoming Message via AI Router Engine (includes 800ms-1500ms jittered typing delay)
    const result = await handleIncomingCustomerMessage({
      accountId,
      contactId,
      customerPhone,
      channel: 'whatsapp',
      messageText,
    })

    if (result?.aiReply) {
      // 5. Send Auto-Reply via Meta WhatsApp Cloud API
      const metaSendResult = await sendMetaWhatsAppMessage({
        accountId,
        to: customerPhone,
        text: result.aiReply,
      })

      // Fallback to Whapi Gateway if Meta Cloud credentials are missing
      if (!metaSendResult.success) {
        await sendWhapiMessage({
          accountId,
          to: customerPhone,
          text: result.aiReply,
        })
      }

      // Log outbound AI message to database
      if (contactId) {
        try {
          await db.from('messages').insert({
            account_id: accountId,
            contact_id: contactId,
            channel: 'whatsapp',
            direction: 'outbound',
            content: result.aiReply,
          })
        } catch {
          // quiet catch
        }
      }
    }

    return NextResponse.json({ status: 'success' })
  } catch (err) {
    console.error('[WhatsApp Webhook Exception]:', err)
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 500 })
  }
}
