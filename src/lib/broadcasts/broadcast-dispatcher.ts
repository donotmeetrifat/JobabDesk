import { createClient } from '@supabase/supabase-js'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp/meta-cloud'
import { sendWhapiMessage } from '@/lib/whatsapp/whapi-gateway'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export function isFacebookPsid(val: string | null | undefined): boolean {
  if (!val) return false
  const clean = val.trim()
  return /^\d{12,24}$/.test(clean)
}

/**
 * Resolves Meta Page Access Token from accounts and channel_connections
 */
export async function resolveMetaPageAccessToken(db: any, accountId?: string | null): Promise<string> {
  let pageAccessToken = ''
  try {
    if (accountId) {
      const { data: acc } = await db
        .from('accounts')
        .select('facebook_page_access_token, facebook_page_id')
        .eq('id', accountId)
        .maybeSingle()

      if (acc?.facebook_page_access_token) {
        pageAccessToken = acc.facebook_page_access_token
      }
    }

    if (!pageAccessToken && accountId) {
      const { data: chan } = await db
        .from('channel_connections')
        .select('metadata')
        .eq('account_id', accountId)
        .eq('channel_type', 'messenger')
        .maybeSingle()
      pageAccessToken = chan?.metadata?.access_token || chan?.metadata?.accessToken || ''
    }

    if (!pageAccessToken) {
      const { data: anyChan } = await db
        .from('channel_connections')
        .select('metadata')
        .eq('channel_type', 'messenger')
        .limit(1)
        .maybeSingle()
      pageAccessToken = anyChan?.metadata?.access_token || anyChan?.metadata?.accessToken || ''
    }

    // If User Access Token, resolve to Page Access Token via /me/accounts
    if (pageAccessToken) {
      const meRes = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,category&access_token=${encodeURIComponent(pageAccessToken)}`
      ).catch(() => null)

      if (meRes && meRes.ok) {
        const meData = await meRes.json().catch(() => null)
        if (!meData?.category) {
          const accsRes = await fetch(
            `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(pageAccessToken)}`
          ).catch(() => null)

          if (accsRes && accsRes.ok) {
            const accsData = await accsRes.json().catch(() => null)
            const pages = accsData?.data || []
            if (pages.length > 0 && pages[0].access_token) {
              pageAccessToken = pages[0].access_token
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[BroadcastDispatcher] Error resolving Page Token:', err)
  }

  return pageAccessToken
}

/**
 * Send Facebook Messenger broadcast message using Meta Graph API
 */
export async function sendMessengerBroadcastMessage({
  db,
  accountId,
  customerPsid,
  text,
  mediaUrl,
}: {
  db: any
  accountId: string
  customerPsid: string
  text: string
  mediaUrl?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const pageAccessToken = await resolveMetaPageAccessToken(db, accountId)
    if (!pageAccessToken) {
      return { success: false, error: 'Facebook Page token not found' }
    }

    const payloadMessage: Record<string, unknown> = { text }
    if (mediaUrl) {
      payloadMessage.attachment = {
        type: 'image',
        payload: {
          url: mediaUrl,
          is_reusable: true,
        },
      }
    }

    // Attempt 1: Standard RESPONSE (within 24h window)
    let fbRes = await fetch(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: customerPsid },
          messaging_type: 'RESPONSE',
          message: payloadMessage,
        }),
      }
    )
    let fbJson = await fbRes.json().catch(() => ({}))

    // Attempt 2: If standard response failed, retry with CONFIRMED_EVENT_UPDATE tag
    if (!fbRes.ok || fbJson.error) {
      fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: customerPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'CONFIRMED_EVENT_UPDATE',
            message: payloadMessage,
          }),
        }
      )
      fbJson = await fbRes.json().catch(() => ({}))
    }

    // Attempt 3: Fallback with ACCOUNT_UPDATE tag
    if (!fbRes.ok || fbJson.error) {
      fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: customerPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'ACCOUNT_UPDATE',
            message: payloadMessage,
          }),
        }
      )
      fbJson = await fbRes.json().catch(() => ({}))
    }

    if (fbRes.ok && fbJson.message_id) {
      return { success: true, messageId: fbJson.message_id }
    }

    const errMsg = fbJson?.error?.message || `HTTP ${fbRes.status}`
    return { success: false, error: errMsg }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network exception sending to Messenger' }
  }
}

/**
 * Send WhatsApp broadcast message using Meta Cloud API or Whapi Gateway
 */
export async function sendWhatsAppBroadcastMessage({
  db,
  accountId,
  phone,
  text,
  templateName,
  templateLanguage,
  templateParams,
  headerMediaUrl,
}: {
  db: any
  accountId: string
  phone: string
  text?: string
  templateName?: string
  templateLanguage?: string
  templateParams?: string[]
  headerMediaUrl?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // 1. Template send via Meta WhatsApp
    if (templateName && templateName.trim() !== '') {
      let account = null
      if (accountId) {
        const { data } = await db
          .from('accounts')
          .select('whatsapp_phone_number_id, whatsapp_access_token')
          .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
          .maybeSingle()
        account = data
      }
      if (!account) {
        const { data } = await db
          .from('accounts')
          .select('whatsapp_phone_number_id, whatsapp_access_token')
          .limit(1)
          .maybeSingle()
        account = data
      }

      const phoneNumberId = account?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID
      const accessToken = account?.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN

      if (phoneNumberId && accessToken) {
        const result = await sendTemplateMessage({
          phoneNumberId,
          accessToken,
          to: phone,
          templateName,
          language: templateLanguage || 'en_US',
          params: templateParams,
          messageParams: headerMediaUrl ? { headerMediaUrl } : undefined,
        }).catch((err) => {
          console.warn('[BroadcastDispatcher] Meta template error:', err)
          return null
        })

        if (result && result.messageId) {
          return { success: true, messageId: result.messageId }
        }
      }
    }

    // 2. Custom text send via Meta WhatsApp Cloud API
    const msgText = text || 'Notification'
    const metaRes = await sendMetaWhatsAppMessage({
      accountId,
      to: phone,
      text: msgText,
      supabase: db,
    })

    if (metaRes.success) {
      return metaRes
    }

    // 3. Fallback to Whapi Gateway
    const whapiRes = await sendWhapiMessage({
      accountId,
      to: phone,
      text: msgText,
      supabase: db,
    })

    if (whapiRes.success) {
      return { success: true, messageId: whapiRes.messageId }
    }

    return { success: false, error: metaRes.error || 'WhatsApp message dispatch failed' }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Exception sending WhatsApp broadcast' }
  }
}

/**
 * Personalize message text by substituting {{name}}, {{phone}}, {{company}}, {{1}}, {{2}}
 */
export function personalizeText(
  text: string,
  contact: { name?: string | null; phone?: string | null; company?: string | null },
  params?: string[]
): string {
  let result = text
  const name = contact.name || 'Customer'
  const phone = contact.phone || ''
  const company = contact.company || ''

  result = result.replace(/{{\s*name\s*}}/gi, name)
  result = result.replace(/{{\s*phone\s*}}/gi, phone)
  result = result.replace(/{{\s*company\s*}}/gi, company)

  if (Array.isArray(params)) {
    params.forEach((param, index) => {
      const placeholder = new RegExp(`{{\\s*${index + 1}\\s*}}`, 'g')
      result = result.replace(placeholder, param)
    })
  }

  return result
}

/**
 * Main fanout task: executes broadcast delivery across WhatsApp and Messenger
 */
export async function executeBroadcastDelivery(broadcastId: string): Promise<void> {
  const db = getAdminClient()

  // 1. Fetch broadcast record
  const { data: broadcast, error: bcError } = await db
    .from('broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .single()

  if (bcError || !broadcast) {
    console.error('[BroadcastDispatcher] Broadcast not found:', broadcastId)
    return
  }

  // 2. Fetch pending recipients
  const { data: recipients, error: recError } = await db
    .from('broadcast_recipients')
    .select('*, contact:contacts(*)')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending')

  if (recError || !recipients || recipients.length === 0) {
    // If no pending, mark as sent/completed
    await db
      .from('broadcasts')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', broadcastId)
    return
  }

  let sentCount = Number(broadcast.sent_count) || 0
  let failedCount = Number(broadcast.failed_count) || 0
  const accountId = broadcast.account_id

  // 3. Process in batches of 10
  const BATCH_SIZE = 10
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (recipient) => {
        const contact = recipient.contact
        if (!contact) {
          failedCount++
          await db
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: 'Contact record missing or deleted',
            })
            .eq('id', recipient.id)
          return
        }

        const recipientChannel = recipient.channel || broadcast.channel || 'all'
        const psid = contact.messenger_id || (isFacebookPsid(contact.phone) ? contact.phone : null)
        const phone = contact.phone && !isFacebookPsid(contact.phone) ? contact.phone : null

        // Determine destination: Messenger or WhatsApp
        let isMessenger = false
        if (recipientChannel === 'messenger' && psid) {
          isMessenger = true
        } else if (recipientChannel === 'whatsapp' && phone) {
          isMessenger = false
        } else if (psid && !phone) {
          isMessenger = true
        } else if (phone && !psid) {
          isMessenger = false
        } else if (psid) {
          isMessenger = true
        }

        const messageText = personalizeText(
          broadcast.message_text || broadcast.template_name || 'Hello {{name}}',
          contact,
          recipient.template_params
        )

        let sendResult: { success: boolean; messageId?: string; error?: string } = {
          success: false,
          error: 'No valid channel destination found',
        }

        if (isMessenger && psid) {
          sendResult = await sendMessengerBroadcastMessage({
            db,
            accountId,
            customerPsid: psid,
            text: messageText,
            mediaUrl: broadcast.template_variables?.header_media_url as string | undefined,
          })
        } else if (phone) {
          sendResult = await sendWhatsAppBroadcastMessage({
            db,
            accountId,
            phone,
            text: messageText,
            templateName: broadcast.template_name,
            templateLanguage: broadcast.template_language,
            templateParams: recipient.template_params,
            headerMediaUrl: broadcast.template_variables?.header_media_url as string | undefined,
          })
        }

        const now = new Date().toISOString()
        if (sendResult.success) {
          sentCount++
          await db
            .from('broadcast_recipients')
            .update({
              status: 'sent',
              sent_at: now,
              whatsapp_message_id: sendResult.messageId || null,
              error_message: null,
            })
            .eq('id', recipient.id)

          // Mirror into messages table if conversation exists
          try {
            const { data: conv } = await db
              .from('conversations')
              .select('id')
              .eq('contact_id', contact.id)
              .maybeSingle()

            if (conv?.id) {
              await db.from('messages').insert({
                conversation_id: conv.id,
                sender_type: 'agent',
                content_type: 'text',
                content_text: messageText,
                status: 'delivered',
                message_id: sendResult.messageId || null,
                created_at: now,
              })
              await db
                .from('conversations')
                .update({ last_message_text: messageText, updated_at: now })
                .eq('id', conv.id)
            }
          } catch {}
        } else {
          failedCount++
          await db
            .from('broadcast_recipients')
            .update({
              status: 'failed',
              error_message: sendResult.error || 'Failed to dispatch',
            })
            .eq('id', recipient.id)
        }
      })
    )

    // Update aggregate counts after each batch
    await db
      .from('broadcasts')
      .update({
        sent_count: sentCount,
        failed_count: failedCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId)

    // Modest delay between batches to remain well within Meta rate limits
    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  // 4. Mark final broadcast status
  const finalStatus = failedCount > 0 && sentCount === 0 ? 'failed' : 'sent'
  await db
    .from('broadcasts')
    .update({
      status: finalStatus,
      sent_count: sentCount,
      failed_count: failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', broadcastId)
}
