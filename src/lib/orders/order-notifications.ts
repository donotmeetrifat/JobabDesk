import { isFacebookPsid } from '@/lib/contacts/extract-info'

interface OrderNotificationParams {
  order: any
  newStatus: 'confirmed' | 'cancelled'
  supabase: any
  accountId: string
}

export async function sendOrderStatusNotification({
  order,
  newStatus,
  supabase,
  accountId,
}: OrderNotificationParams): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!order || !accountId) return { success: false, reason: 'Missing order or account' }

    // 1. Resolve conversation
    let conversationId = order.conversation_id
    let contactId = order.contact_id

    if (!conversationId && contactId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (conv?.id) conversationId = conv.id
    }

    if (!conversationId && order.customer_phone) {
      const { data: ct } = await supabase
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .or(`phone.eq.${order.customer_phone},messenger_id.eq.${order.customer_phone}`)
        .maybeSingle()
      if (ct?.id) {
        contactId = ct.id
        const { data: conv } = await supabase
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
      const { data: ct } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle()
      contact = ct
    }

    const customerName = order.customer_name || contact?.name || 'Customer'
    const orderNum = order.order_number || `ORD-${order.id.slice(0, 8)}`
    const totalAmount = Number(order.total) || 0
    const items = order.order_items || []

    const itemListText =
      items.length > 0
        ? items
            .map(
              (it: any) =>
                `• ${it.product_name} × ${it.quantity} (৳${(Number(it.unit_price) || 0).toLocaleString()})`
            )
            .join('\n')
        : '• অর্ডারকৃত পণ্য (Ordered Items)'

    const paymentMethodMap: Record<string, string> = {
      cod: 'Cash on Delivery (ক্যাশ অন ডেলিভারি)',
      bkash: 'bKash (বিকাশ)',
      nagad: 'Nagad (নগদ)',
      rocket: 'Rocket (রকেট)',
      bank_transfer: 'Bank Transfer (ব্যাংক ট্রান্সফার)',
    }
    const paymentStatusMap: Record<string, string> = {
      unpaid: 'পরিশোধিত নয় / আনপেইড',
      paid: 'পরিশোধিত / পেইড',
      processing: 'যাচাই করা হচ্ছে',
      refunded: 'রিফান্ড করা হয়েছে',
    }

    const paymentMethodLabel = paymentMethodMap[order.payment_method] || order.payment_method || 'Cash on Delivery'
    const paymentStatusLabel = paymentStatusMap[order.payment_status] || order.payment_status || 'আনপেইড'

    let notificationText = ''
    if (newStatus === 'confirmed') {
      notificationText = `🎉 আপনার অর্ডারটি সফলভাবে কনফার্ম করা হয়েছে!

প্রিয় ${customerName},
আপনার অর্ডার #${orderNum} সফলভাবে যাচাই ও নিশ্চিত করা হয়েছে। আমরা এখনই পার্সেলটি ডেলিভারির জন্য প্রস্তুত করছি!

📦 পণ্যের বিবরণ:
${itemListText}

💰 সর্বমোট মূল্য: ৳${totalAmount.toLocaleString()}
📍 ডেলিভারি ঠিকানা: ${order.customer_address || 'উল্লেখ নেই'}
💳 পেমেন্ট মাধ্যম: ${paymentMethodLabel} (${paymentStatusLabel})

ধন্যবাদ আমাদের সাথে থাকার জন্য! পণ্য ডেলিভারি হওয়া পর্যন্ত যেকোনো প্রয়োজনে এখানে মেসেজ করতে পারেন।`
    } else if (newStatus === 'cancelled') {
      notificationText = `⚠️ অর্ডার বাতিল সংক্রান্ত তথ্য

প্রিয় ${customerName},
আপনার অর্ডার #${orderNum} বাতিল করা হয়েছে।
কোনো প্রশ্ন থাকলে বা নতুন কোনো পণ্য অর্ডার করতে চাইলে আমাদের এখানে জানাতে পারেন। ধন্যবাদ!`
    } else {
      return { success: false, reason: 'Unsupported status notification' }
    }

    // 3. Send message to Facebook Messenger or WhatsApp if destination available
    const customerPsid =
      contact?.messenger_id ||
      (contact?.phone && isFacebookPsid(contact.phone) ? contact.phone : null) ||
      (order.customer_phone && isFacebookPsid(order.customer_phone) ? order.customer_phone : null)

    if (customerPsid) {
      // Find Meta Page Access Token
      let pageAccessToken = ''
      try {
        const { data: pageRow } = await supabase
          .from('facebook_pages')
          .select('access_token')
          .eq('account_id', accountId)
          .limit(1)
          .maybeSingle()
        if (pageRow?.access_token) pageAccessToken = pageRow.access_token

        if (!pageAccessToken) {
          const { data: chanRow } = await supabase
            .from('channels')
            .select('metadata')
            .eq('account_id', accountId)
            .eq('channel_type', 'messenger')
            .limit(1)
            .maybeSingle()
          pageAccessToken = chanRow?.metadata?.access_token || chanRow?.metadata?.accessToken || ''
        }
      } catch {}

      if (pageAccessToken) {
        try {
          await fetch(
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
        } catch (fbErr) {
          console.warn('[OrderNotification] Failed to send Messenger message:', fbErr)
        }
      }
    }

    // 4. Save notification message in inbox messages table
    if (conversationId) {
      const nowIso = new Date().toISOString()
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'bot',
        content_type: 'text',
        content_text: notificationText,
        status: 'delivered',
        created_at: nowIso,
      })

      await supabase
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
