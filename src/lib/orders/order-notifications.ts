import { isFacebookPsid } from '@/lib/contacts/extract-info'
import { checkIsDigitalOrder } from '@/lib/products/product-type'
import { formatCurrency } from '@/lib/currency'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

interface OrderNotificationParams {
  order: any
  newStatus: 'confirmed' | 'cancelled'
  supabase: any
  accountId: string
}

function getAdminClient(fallbackClient?: any) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  if (url && serviceKey) {
    return createSupabaseClient(url, serviceKey)
  }
  return fallbackClient
}

export async function sendOrderStatusNotification({
  order,
  newStatus,
  supabase,
  accountId,
}: OrderNotificationParams): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!order || !accountId) return { success: false, reason: 'Missing order or account' }

    const db = getAdminClient(supabase)

    // 1. Resolve conversation
    let conversationId = order.conversation_id
    let contactId = order.contact_id

    if (!conversationId && contactId) {
      const { data: conv } = await db
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (conv?.id) conversationId = conv.id
    }

    if (!conversationId && order.customer_phone) {
      const { data: ct } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .or(`phone.eq.${order.customer_phone},messenger_id.eq.${order.customer_phone}`)
        .maybeSingle()
      if (ct?.id) {
        contactId = ct.id
        const { data: conv } = await db
          .from('conversations')
          .select('id')
          .eq('contact_id', ct.id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (conv?.id) conversationId = conv.id
      }
    }

    // 2. Fetch contact info
    let contact: any = null
    if (contactId) {
      const { data: ct } = await db
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle()
      contact = ct
    }

    // 3. Fetch account default currency
    const { data: acc } = await db
      .from('accounts')
      .select('default_currency')
      .eq('id', accountId)
      .maybeSingle()
    const currency = acc?.default_currency || 'BDT'

    const customerName = order.customer_name || contact?.name || 'Customer'
    const orderNum = order.order_number || `ORD-${order.id.slice(0, 8)}`
    const totalAmount = Number(order.total) || 0
    const items = order.order_items || []

    const itemListText =
      items.length > 0
        ? items
            .map(
              (it: any) =>
                `• ${it.product_name} × ${it.quantity} (${formatCurrency(Number(it.unit_price) || 0, currency)})`
            )
            .join('\n')
        : '• অর্ডারকৃত পণ্য (Ordered Items)'

    const paymentMethodMap: Record<string, string> = {
      cod: 'Cash on Delivery (ক্যাশ অন ডেলিভারি)',
      bkash: 'bKash (বিকাশ)',
      nagad: 'Nagad (নগদ)',
      rocket: 'Rocket (রকেট)',
      bank_transfer: 'Bank Transfer (ব্যাংক ট্রান্সফার)',
      free: 'Free Promotional Campaign (সম্পূর্ণ ফ্রি)',
    }
    const paymentStatusMap: Record<string, string> = {
      unpaid: 'পরিশোধিত নয় / আনপেইড',
      paid: 'পরিশোধিত / পেইড',
      processing: 'যাচাই করা হচ্ছে',
      refunded: 'রিফান্ড করা হয়েছে',
    }

    const isFree = order.payment_method === 'free' || totalAmount === 0
    const paymentMethodLabel = isFree
      ? 'Free Promotional Campaign (সম্পূর্ণ ফ্রি)'
      : (paymentMethodMap[order.payment_method] || order.payment_method || 'Cash on Delivery')
    const paymentStatusLabel = isFree ? 'ফ্রি অর্ডার' : (paymentStatusMap[order.payment_status] || order.payment_status || 'আনপেইড')
    const totalAmountDisplay = isFree ? `${formatCurrency(0, currency)} (বিনামূল্যে / Free Offer)` : formatCurrency(totalAmount, currency)

    const isDigital = Boolean(order.is_digital) || checkIsDigitalOrder(items)
    const emailDestination = order.customer_email || contact?.email || 'চ্যাটে ডেলিভারি'

    let notificationText = ''
    if (newStatus === 'confirmed') {
      if (isDigital) {
        notificationText = `🎉 আপনার ${isFree ? 'ফ্রি ' : ''}ডিজিটাল অর্ডারটি সফলভাবে কনফার্ম করা হয়েছে!

প্রিয় ${customerName},
আপনার অর্ডার #${orderNum} সফলভাবে যাচাই ও নিশ্চিত করা হয়েছে। আমরা দ্রুত আপনার ডিজিটাল অ্যাক্সেস / সাবস্ক্রিপশন প্রস্তুত করে আপনার ইমেইল ও চ্যাটে পাঠিয়ে দিচ্ছি!

📦 পণ্যের বিবরণ:
${itemListText}

💰 সর্বমোট মূল্য: ${totalAmountDisplay}
📧 ডেলিভারি মাধ্যম: ডিজিটাল ডেলিভারি (${emailDestination})
💳 পেমেন্ট মাধ্যম: ${paymentMethodLabel}

ধন্যবাদ আমাদের সাথে থাকার জন্য! যেকোনো প্রয়োজনে এখানে মেসেজ করতে পারেন।`
      } else {
        notificationText = `🎉 আপনার ${isFree ? 'ফ্রি ' : ''}অর্ডারটি সফলভাবে কনফার্ম করা হয়েছে!

প্রিয় ${customerName},
আপনার অর্ডার #${orderNum} সফলভাবে যাচাই ও নিশ্চিত করা হয়েছে। আমরা এখনই পার্সেলটি ডেলিভারির জন্য প্রস্তুত করছি!

📦 পণ্যের বিবরণ:
${itemListText}

💰 সর্বমোট মূল্য: ${totalAmountDisplay}
📍 ডেলিভারি ঠিকানা: ${order.customer_address || 'উল্লেখ নেই'}
💳 পেমেন্ট মাধ্যম: ${paymentMethodLabel}

ধন্যবাদ আমাদের সাথে থাকার জন্য! পণ্য ডেলিভারি হওয়া পর্যন্ত যেকোনো প্রয়োজনে এখানে মেসেজ করতে পারেন।`
      }
    } else if (newStatus === 'cancelled') {
      notificationText = `⚠️ অর্ডার বাতিল সংক্রান্ত তথ্য

প্রিয় ${customerName},
আপনার অর্ডার #${orderNum} বাতিল করা হয়েছে।
কোনো প্রশ্ন থাকলে বা নতুন কোনো পণ্য অর্ডার করতে চাইলে আমাদের এখানে জানাতে পারেন। ধন্যবাদ!`
    } else {
      return { success: false, reason: 'Unsupported status notification' }
    }

    // 3. Resolve Customer PSID for Meta Messenger
    let customerPsid =
      contact?.messenger_id ||
      (contact?.phone && isFacebookPsid(contact.phone) ? contact.phone : null) ||
      (order.customer_phone && isFacebookPsid(order.customer_phone) ? order.customer_phone : null)

    if (!customerPsid && conversationId) {
      const { data: convData } = await db
        .from('conversations')
        .select('contact_id, contact:contacts(phone, messenger_id)')
        .eq('id', conversationId)
        .maybeSingle()
      const convContact: any = Array.isArray(convData?.contact) ? convData.contact[0] : convData?.contact
      if (convContact?.messenger_id) {
        customerPsid = convContact.messenger_id
      } else if (convContact?.phone && isFacebookPsid(convContact.phone)) {
        customerPsid = convContact.phone
      }
    }

    // 4. Resolve Meta Page Access Token from accounts and channel_connections
    let pageAccessToken = ''
    try {
      const { data: acc } = await db
        .from('accounts')
        .select('facebook_page_access_token, facebook_page_id')
        .eq('id', accountId)
        .maybeSingle()

      if (acc?.facebook_page_access_token) {
        pageAccessToken = acc.facebook_page_access_token
      }

      if (!pageAccessToken) {
        const { data: chan } = await db
          .from('channel_connections')
          .select('metadata')
          .eq('account_id', accountId)
          .eq('channel_type', 'messenger')
          .maybeSingle()
        pageAccessToken = chan?.metadata?.access_token || chan?.metadata?.accessToken || ''
      }
    } catch (tokenErr) {
      console.warn('[OrderNotification] Error fetching page token:', tokenErr)
    }

    if (pageAccessToken) {
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=id,category&access_token=${encodeURIComponent(pageAccessToken)}`
        )
        if (meRes.ok) {
          const meData = await meRes.json()
          if (!meData?.category) {
            const accsRes = await fetch(
              `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(pageAccessToken)}`
            )
            if (accsRes.ok) {
              const accsData = await accsRes.json()
              const pages = accsData?.data || []
              if (pages.length > 0 && pages[0].access_token) {
                pageAccessToken = pages[0].access_token
              }
            }
          }
        }
      } catch (meErr) {
        console.warn('[OrderNotification] Error resolving Page token from User token:', meErr)
      }
    }

    // 5. Send message to Meta Messenger Graph API
    let metaSent = false
    let metaMessageId: string | null = null

    if (customerPsid && pageAccessToken) {
      try {
        // Attempt 1: Standard RESPONSE (within 24h messaging window)
        let fbRes = await fetch(
          `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: customerPsid },
              messaging_type: 'RESPONSE',
              message: { text: notificationText },
            }),
          }
        )
        let fbJson = await fbRes.json()

        // Attempt 2: If standard response failed (e.g. window error), use MESSAGE_TAG CONFIRMED_EVENT_UPDATE
        if (!fbRes.ok || fbJson.error) {
          console.warn('[OrderNotification] RESPONSE send failed, retrying with CONFIRMED_EVENT_UPDATE tag:', fbJson?.error?.message)
          fbRes = await fetch(
            `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: customerPsid },
                messaging_type: 'MESSAGE_TAG',
                tag: 'CONFIRMED_EVENT_UPDATE',
                message: { text: notificationText },
              }),
            }
          )
          fbJson = await fbRes.json()
        }

        // Attempt 3: Fallback with ACCOUNT_UPDATE tag
        if (!fbRes.ok || fbJson.error) {
          console.warn('[OrderNotification] CONFIRMED_EVENT_UPDATE failed, retrying with ACCOUNT_UPDATE tag:', fbJson?.error?.message)
          fbRes = await fetch(
            `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipient: { id: customerPsid },
                messaging_type: 'MESSAGE_TAG',
                tag: 'ACCOUNT_UPDATE',
                message: { text: notificationText },
              }),
            }
          )
          fbJson = await fbRes.json()
        }

        if (fbRes.ok && fbJson.message_id) {
          metaSent = true
          metaMessageId = fbJson.message_id
          console.log('[OrderNotification] Successfully dispatched confirmation via Meta Messenger:', fbJson.message_id)
        } else {
          console.error('[OrderNotification] Meta Messenger API error response:', fbJson?.error || fbJson)
        }
      } catch (fbErr) {
        console.error('[OrderNotification] Network exception sending to Meta Messenger:', fbErr)
      }
    } else {
      console.warn('[OrderNotification] Skipping Meta send: customerPsid or pageAccessToken missing', {
        hasPsid: Boolean(customerPsid),
        hasToken: Boolean(pageAccessToken),
      })
    }

    // 6. Save notification message in inbox messages table
    if (conversationId) {
      const nowIso = new Date().toISOString()
      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: notificationText,
        message_id: metaMessageId || null,
        status: metaSent ? 'delivered' : 'sent',
        created_at: nowIso,
      })

      await db
        .from('conversations')
        .update({
          last_message_text: notificationText,
          last_message_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', conversationId)
    }

    return { success: true }
  } catch (err) {
    console.error('[OrderNotification] Error sending status notification:', err)
    return { success: false, reason: String(err) }
  }
}
