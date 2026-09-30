import { NextResponse } from 'next/server'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
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

// Webhook Verification (GET)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === 'jobabdesk_verify_token') {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ status: 'ok', service: 'JobabDesk Whapi Gateway Webhook' })
}

// Incoming Webhook Events (POST)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { searchParams } = new URL(req.url)
    const queryAccountId = searchParams.get('account_id')

    // Find first active account if account_id not provided in URL
    const db = getAdminClient()
    let accountId = queryAccountId

    if (!accountId) {
      const { data: firstAccount } = await db
        .from('accounts')
        .select('id')
        .limit(1)
        .maybeSingle()
      accountId = firstAccount?.id || ''
    }

    if (!accountId) {
      return NextResponse.json({ status: 'ignored', reason: 'No account configured' })
    }

    // Extract message & sender phone number from Whapi / Meta payload
    let customerPhone = ''
    let messageText = ''

    if (Array.isArray(body.messages) && body.messages.length > 0) {
      const msg = body.messages[0]
      if (!msg.from_me) {
        customerPhone = msg.from || msg.chat_id || ''
        messageText = msg.text?.body || msg.body || msg.payload?.text || ''
      }
    } else if (body.data) {
      const d = body.data
      if (!d.from_me) {
        customerPhone = d.from || d.chat_id || ''
        messageText = d.text?.body || d.body || ''
      }
    }

    // Clean phone number (strip @s.whatsapp.net)
    customerPhone = customerPhone.replace(/@.*$/, '').trim()

    if (customerPhone && messageText) {
      // Execute AI router engine with anti-ban human typing delay & per-contact mute verification
      const result = await handleIncomingCustomerMessage({
        accountId,
        customerPhone,
        channel: 'whatsapp',
        messageText,
      })

      if (result?.aiReply) {
        // Send AI response back via Whapi Gateway
        await sendWhapiMessage({
          accountId,
          to: customerPhone,
          text: result.aiReply,
        })
      }
    }

    return NextResponse.json({ status: 'success' })
  } catch (err) {
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 500 })
  }
}
