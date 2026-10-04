import { NextResponse } from 'next/server'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp/meta-cloud'
import { sendWhapiMessage } from '@/lib/whatsapp/whapi-gateway'
import { autoUpdateContactFromChatMessage } from '@/lib/contacts/auto-extract'
import { detectAndCreateOrderFromChat } from '@/lib/orders/auto-create-order'
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

      // Handle inbound WhatsApp reaction
      if (msg.reaction || msg.type === 'reaction') {
        const reaction = msg.reaction
        const reactionMid = reaction?.message_id
        const emoji = reaction?.emoji || ''
        const rawFrom = (msg.from || '').replace(/@.*$/, '').replace(/[^\d]/g, '').trim()

        if (reactionMid) {
          const { data: targetMessage } = await db
            .from('messages')
            .select('id, conversation_id')
            .eq('message_id', reactionMid)
            .maybeSingle()

          if (targetMessage) {
            let contactId: string | null = null
            if (rawFrom) {
              const { data: ct } = await db
                .from('contacts')
                .select('id')
                .eq('phone', rawFrom)
                .maybeSingle()
              if (ct?.id) contactId = ct.id
            }

            if (!emoji) {
              let delQuery = db
                .from('message_reactions')
                .delete()
                .eq('message_id', targetMessage.id)
                .eq('actor_type', 'customer')
              if (contactId) delQuery = delQuery.eq('actor_id', contactId)
              await delQuery
            } else {
              let exQuery = db
                .from('message_reactions')
                .select('id')
                .eq('message_id', targetMessage.id)
                .eq('actor_type', 'customer')
              if (contactId) exQuery = exQuery.eq('actor_id', contactId)
              const { data: exReaction } = await exQuery.maybeSingle()

              if (exReaction?.id) {
                await db
                  .from('message_reactions')
                  .update({ emoji })
                  .eq('id', exReaction.id)
              } else {
                await db
                  .from('message_reactions')
                  .insert({
                    message_id: targetMessage.id,
                    conversation_id: targetMessage.conversation_id,
                    actor_type: 'customer',
                    actor_id: contactId || null,
                    emoji,
                  })
              }
            }

            await db
              .from('conversations')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', targetMessage.conversation_id)

            return NextResponse.json({ status: 'reaction_handled', emoji })
          }
        }
      }

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

        // Auto extract and update customer's own contact record with any address/number provided
        await autoUpdateContactFromChatMessage({
          contactId,
          accountId,
          messageText,
          supabase: db,
        }).catch((e) => console.warn('[WhatsApp] Auto-update contact error:', e))

        detectAndCreateOrderFromChat({
          accountId,
          contactId,
          customerPhone,
          channel: 'whatsapp',
          messageText,
          supabase: db,
        }).catch((e) => console.warn('[WhatsApp] Auto-create order error:', e))
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
