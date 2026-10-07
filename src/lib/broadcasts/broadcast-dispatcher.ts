import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp/meta-cloud'
import { sendWhapiMessage } from '@/lib/whatsapp/whapi-gateway'

function getAdminClient() {
  try {
    return supabaseAdmin()
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    return createClient(url, key)
  }
}

export function isFacebookPsid(val: string | null | undefined): boolean {
  if (!val) return false
  const clean = val.trim()
  return !clean.startsWith('+') && clean.length >= 14 && /^\d+$/.test(clean)
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

    // If User Access Token, resolve to Page Access Token via /me/accounts or /me/assigned_pages
    if (pageAccessToken) {
      try {
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

            if (pageAccessToken) {
              const assignedRes = await fetch(
                `https://graph.facebook.com/v20.0/me/assigned_pages?fields=id,access_token&access_token=${encodeURIComponent(pageAccessToken)}`
              ).catch(() => null)
              if (assignedRes && assignedRes.ok) {
                const assignedData = await assignedRes.json().catch(() => null)
                const pages = assignedData?.data || []
                if (pages.length > 0 && pages[0].access_token) {
                  pageAccessToken = pages[0].access_token
                }
              }
            }
          }
        }
      } catch (tokenErr) {
        console.warn('[BroadcastDispatcher] Warning resolving page token:', tokenErr)
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

    const cleanPsid = customerPsid.trim()

    // Attempt 1: Standard RESPONSE (within 24h window)
    let fbRes = await fetch(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: cleanPsid },
          messaging_type: 'RESPONSE',
          message: payloadMessage,
        }),
      }
    )
    let fbJson = await fbRes.json().catch(() => ({}))

    // Attempt 2: Retry with CONFIRMED_EVENT_UPDATE tag
    if (!fbRes.ok || fbJson.error) {
      fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: cleanPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'CONFIRMED_EVENT_UPDATE',
            message: payloadMessage,
          }),
        }
      )
      fbJson = await fbRes.json().catch(() => ({}))
    }

    // Attempt 3: Retry with ACCOUNT_UPDATE tag
    if (!fbRes.ok || fbJson.error) {
      fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: cleanPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'ACCOUNT_UPDATE',
            message: payloadMessage,
          }),
        }
      )
      fbJson = await fbRes.json().catch(() => ({}))
    }

    // Attempt 4: Retry with POST_PURCHASE_UPDATE tag
    if (!fbRes.ok || fbJson.error) {
      fbRes = await fetch(
        `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: cleanPsid },
            messaging_type: 'MESSAGE_TAG',
            tag: 'POST_PURCHASE_UPDATE',
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
    const isCustomTemplate =
      !templateName ||
      templateName === 'Custom Message' ||
      templateName.toLowerCase() === 'custom message'

    // 1. Template send via Meta WhatsApp (only if real template name specified)
    if (!isCustomTemplate && templateName && templateName.trim() !== '') {
      let account = null
      if (accountId) {
        const { data } = await db
          .from('accounts')
          .select('whatsapp_phone_number_id, whatsapp_access_token')
          .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
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
export async function executeBroadcastDelivery(
  broadcastId: string,
  options?: { scope?: 'pending' | 'failed' | 'all' }
): Promise<{ success: boolean; sent: number; failed: number; total: number }> {
  const db = getAdminClient()
  const scope = options?.scope || 'pending'

  // 1. Fetch broadcast record
  const { data: broadcast, error: bcError } = await db
    .from('broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .single()

  if (bcError || !broadcast) {
    console.error('[BroadcastDispatcher] Broadcast not found:', broadcastId, bcError)
    return { success: false, sent: 0, failed: 0, total: 0 }
  }

  // If retrying failed or all, reset target rows to pending first
  if (scope === 'failed' || scope === 'all') {
    const resetQuery = db
      .from('broadcast_recipients')
      .update({ status: 'pending', error_message: null })
      .eq('broadcast_id', broadcastId)
    if (scope === 'failed') {
      await resetQuery.eq('status', 'failed')
    }
  }

  // 2. Fetch pending recipients
  const { data: recipients, error: recError } = await db
    .from('broadcast_recipients')
    .select('*, contact:contacts(*)')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending')

  if (recError) {
    console.error('[BroadcastDispatcher] Error fetching recipients:', recError)
    return { success: false, sent: 0, failed: 0, total: 0 }
  }

  if (!recipients || recipients.length === 0) {
    // Check if any recipients are left pending
    const { count: pendingRemaining } = await db
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcastId)
      .eq('status', 'pending')

    if ((pendingRemaining || 0) === 0) {
      const finalStatus =
        (broadcast.failed_count || 0) > 0 && (broadcast.sent_count || 0) === 0 ? 'failed' : 'sent'
      await db
        .from('broadcasts')
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq('id', broadcastId)
    }
    return {
      success: true,
      sent: Number(broadcast.sent_count) || 0,
      failed: Number(broadcast.failed_count) || 0,
      total: Number(broadcast.total_recipients) || 0,
    }
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
        let contact = recipient.contact
        if (Array.isArray(contact)) {
          contact = contact[0]
        }
        if (!contact && recipient.contact_id) {
          const { data: c } = await db
            .from('contacts')
            .select('*')
            .eq('id', recipient.contact_id)
            .maybeSingle()
          contact = c
        }

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
        const isMessengerContact =
          contact.channel === 'messenger' ||
          contact.company === 'Facebook Messenger' ||
          Boolean(contact.messenger_id) ||
          isFacebookPsid(contact.phone)

        const psid =
          contact.messenger_id ||
          (isMessengerContact && contact.phone ? contact.phone : null) ||
          (isFacebookPsid(contact.phone) ? contact.phone : null)

        const phone =
          contact.phone && !isFacebookPsid(contact.phone) && !isMessengerContact
            ? contact.phone
            : null

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
    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
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

  return {
    success: true,
    sent: sentCount,
    failed: failedCount,
    total: Number(broadcast.total_recipients) || recipients.length,
  }
}

