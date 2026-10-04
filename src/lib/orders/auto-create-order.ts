import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractCustomerInfoFromMessage, isFacebookPsid } from '@/lib/contacts/extract-info'
import { checkIsDigitalOrder, isDigitalProduct } from '@/lib/products/product-type'
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/types/orders'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createSupabaseClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createSupabaseClient(url, anonKey)
}

export interface ExtractedOrderItem {
  product_id?: string | null
  product_name: string
  product_sku?: string | null
  unit_price: number
  quantity: number
  total: number
}

export interface AutoOrderPayload {
  accountId: string
  contactId?: string | null
  conversationId?: string | null
  channel?: string
  customerName?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  customerEmail?: string | null
  messageText: string
  conversationHistoryText?: string
  llmOrderData?: {
    is_order?: boolean
    is_digital?: boolean
    customer_name?: string | null
    customer_phone?: string | null
    customer_address?: string | null
    customer_email?: string | null
    payment_confirmed?: boolean
    items?: Array<{
      product_name: string
      unit_price: number
      quantity: number
      product_sku?: string
    }>
    subtotal?: number
    delivery_charge?: number
    discount?: number
    total?: number
    payment_method?: string
    notes?: string
  } | null
  storeProducts?: Array<{
    id?: string
    name: string
    price: number
    sku?: string | null
    category?: string | null
  }>
  supabase?: any
}

// Regex to detect order intent in Bengali, Banglish, and English
const ORDER_INTENT_REGEX = /(?:order|confirm|want|need|buy|purchase|book|booking|get|send|dispatch|delivery|parcel|checkout|address|adreass|adress|thikana|nite\s*chai|nite\s*chi|nebo|nibo|kinte\s*chai|kinbo|lagbe|dorkar|pathan|pathiye\s*din|bheje\s*din|দিতে\s*পারবেন|কুরিয়ার|অর্ডার|পাঠান|পৌঁছে\s*দিন|পাঠিয়ে\s*দিন|নিব|নেব|চাই|লাগবে|কিনতে|কিনবো)/i

export async function detectAndCreateOrderFromChat({
  accountId,
  contactId,
  conversationId,
  channel = 'messenger',
  customerName,
  customerPhone,
  customerAddress,
  customerEmail,
  messageText,
  conversationHistoryText = '',
  llmOrderData,
  storeProducts = [],
  supabase,
}: AutoOrderPayload) {
  if (!accountId) return null

  const db = supabase || getAdminClient()

  // 1. Extract contact details from current message if not passed
  const extracted = extractCustomerInfoFromMessage(messageText)
  let phone = (customerPhone && !isFacebookPsid(customerPhone) ? customerPhone : null) || extracted.phone || null
  let address = customerAddress || extracted.address || null
  let email = customerEmail || extracted.email || null

  // If still missing, check contact record in DB
  let resolvedName = customerName || null
  if (contactId) {
    try {
      const { data: contactRow } = await db
        .from('contacts')
        .select('name, phone, address, email')
        .eq('id', contactId)
        .maybeSingle()

      if (contactRow) {
        if (!resolvedName || resolvedName === 'Messenger User' || resolvedName === 'Unknown') {
          if (contactRow.name && contactRow.name !== 'Messenger User' && contactRow.name !== 'Unknown') {
            resolvedName = contactRow.name
          }
        }
        if (!phone && contactRow.phone && !isFacebookPsid(contactRow.phone)) phone = contactRow.phone
        if (!address && contactRow.address) address = contactRow.address
        if (!email && contactRow.email) email = contactRow.email
      }
    } catch (_cErr) {
      // safe fallback
    }
  }

  if (llmOrderData?.customer_phone && !phone && !isFacebookPsid(llmOrderData.customer_phone)) {
    phone = llmOrderData.customer_phone
  }
  if (llmOrderData?.customer_address && !address) address = llmOrderData.customer_address
  if (llmOrderData?.customer_email && !email) email = llmOrderData.customer_email
  if (llmOrderData?.customer_name && (!resolvedName || resolvedName === 'Messenger User')) {
    resolvedName = llmOrderData.customer_name
  }

  // 2. Check if this turn represents an order intent
  const isLlmConfirmed = Boolean(llmOrderData?.is_order && llmOrderData?.items && llmOrderData.items.length > 0)
  const matchesOrderKeywords = ORDER_INTENT_REGEX.test(messageText) || ORDER_INTENT_REGEX.test(conversationHistoryText)
  const hasDeliveryDetails = Boolean(phone || address || email)

  // Trigger order creation if:
  // - LLM confirmed an order, OR
  // - Message/history contains order keywords (e.g. "i want to order Simple Skincare"), OR
  // - Customer provided delivery contact details in conversation
  if (!isLlmConfirmed && !matchesOrderKeywords && !hasDeliveryDetails) {
    return null
  }

  // Ensure store products are loaded from DB if not passed
  let catalogProducts = storeProducts || []
  if (catalogProducts.length === 0) {
    try {
      const { data: dbProducts } = await db
        .from('products')
        .select('id, name, price, sku, category')
        .eq('account_id', accountId)
      if (dbProducts && dbProducts.length > 0) {
        catalogProducts = dbProducts
      }
    } catch (_pErr) {
      // safe fallback
    }
  }

  // Helper to validate realistic product prices (reject phone numbers, bKash numbers, etc.)
  const isPlausiblePrice = (val: any): boolean => {
    if (val === null || val === undefined) return false
    const num = Number(val)
    if (isNaN(num) || num <= 0) return false
    const str = String(val).replace(/,/g, '').trim()
    if (str.startsWith('01') || str.startsWith('880') || str.startsWith('+880')) return false
    if (str.length >= 9) return false
    if (num > 200000) return false
    return true
  }

  const NON_PRODUCT_WORDS = /^(bkash|b-kash|b_kash|বিকাশ|nagad|নগদ|rocket|রকেট|upay|উপায়|cod|cash on delivery|ক্যাশ|ক্যাশ অন ডেলিভারি|delivery|charge|fee|subtotal|total|discount|phone|mobile|number|address|contact|order|taka|tk|bdt|bangladesh|customer order)$/i

  // 3. Resolve Items
  let items: ExtractedOrderItem[] = []

  if (llmOrderData?.items && llmOrderData.items.length > 0) {
    for (const item of llmOrderData.items) {
      const pName = item.product_name?.trim() || ''
      if (!pName || NON_PRODUCT_WORDS.test(pName)) continue

      const rawPrice = Number(item.unit_price) || 0
      let unitPrice = isPlausiblePrice(rawPrice) ? rawPrice : 0
      const qty = Math.max(1, Number(item.quantity) || 1)

      // Try matching with catalog products
      const matched = catalogProducts.find(
        (sp) => sp.name.toLowerCase() === pName.toLowerCase() ||
                pName.toLowerCase().includes(sp.name.toLowerCase()) ||
                sp.name.toLowerCase().includes(pName.toLowerCase())
      )

      const isFreeItem =
        llmOrderData?.payment_method === 'free' ||
        Number(llmOrderData?.total) === 0 ||
        (rawPrice === 0 && Boolean(llmOrderData?.notes && /\b(?:free|বিনামূল্যে|giveaway|ফ্রি)\b/i.test(llmOrderData.notes))) ||
        (matched && Number(matched.price) === 0)

      if (matched?.price && (unitPrice === 0 || !isPlausiblePrice(unitPrice))) {
        if (isFreeItem) {
          unitPrice = 0
        } else {
          unitPrice = Number(matched.price)
        }
      }

      items.push({
        product_id: matched?.id || null,
        product_name: matched?.name || pName,
        product_sku: matched?.sku || item.product_sku || null,
        unit_price: unitPrice,
        quantity: qty,
        total: unitPrice * qty,
      })
    }
  }

  // If no items extracted by LLM, extract from conversation text & catalog products
  if (items.length === 0) {
    const fullText = `${conversationHistoryText}\n${messageText}`

    // 1) Scan catalog products mentioned in conversation
    for (const prod of catalogProducts) {
      const prodNameEscaped = prod.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?:\\b|\\s|^)${prodNameEscaped}(?:\\b|\\s|$)`, 'i')
      if (regex.test(fullText)) {
        const price = Math.max(0, Number(prod.price) || 0)
        items.push({
          product_id: prod.id || null,
          product_name: prod.name,
          product_sku: prod.sku || null,
          unit_price: price,
          quantity: 1,
          total: price,
        })
      }
    }

    // 2) Parse bullet points or quotes like: "- Simple Skincare: ৳1,000" or "**Canva Pro**: ৳50"
    if (items.length === 0) {
      const bulletRegex = /(?:^|\n)\s*[-*•]?\s*(?:\*{1,2})?([A-Za-z0-9\s]{2,40}?)(?:\*{1,2})?\s*[:–—\-]\s*[৳Tk\s]*([0-9,]+)/gi
      let bMatch: RegExpExecArray | null
      while ((bMatch = bulletRegex.exec(fullText)) !== null) {
        const pName = bMatch[1].trim()
        const pPrice = parseInt(bMatch[2].replace(/,/g, ''), 10)
        if (pName && !NON_PRODUCT_WORDS.test(pName) && isPlausiblePrice(pPrice)) {
          if (!items.some(i => i.product_name.toLowerCase() === pName.toLowerCase())) {
            items.push({
              product_id: null,
              product_name: pName,
              product_sku: null,
              unit_price: pPrice,
              quantity: 1,
              total: pPrice,
            })
          }
        }
      }
    }

    // 3) Pattern matching for quoted prices: "Product Name (৳1,000)"
    if (items.length === 0) {
      const priceQuoteRegex = /([A-Za-z0-9\s]{2,35})\s*\([৳Tk\s]*([0-9,]+)\)/gi
      let match: RegExpExecArray | null
      while ((match = priceQuoteRegex.exec(fullText)) !== null) {
        const pName = match[1].trim()
        const pPrice = parseInt(match[2].replace(/,/g, ''), 10)
        if (pName && !NON_PRODUCT_WORDS.test(pName) && isPlausiblePrice(pPrice)) {
          if (!items.some(i => i.product_name.toLowerCase() === pName.toLowerCase())) {
            items.push({
              product_id: null,
              product_name: pName,
              product_sku: null,
              unit_price: pPrice,
              quantity: 1,
              total: pPrice,
            })
          }
        }
      }
    }
  }

  // Filter out any invalid items
  items = items.filter(i => !NON_PRODUCT_WORDS.test(i.product_name))

  // Fallback if still no items could be identified
  if (items.length === 0) {
    const fallbackPrice = isPlausiblePrice(llmOrderData?.total) ? Number(llmOrderData!.total) : 0
    items.push({
      product_id: null,
      product_name: 'Customer Order',
      product_sku: null,
      unit_price: fallbackPrice,
      quantity: 1,
      total: fallbackPrice,
    })
  }

  // 4. Check if order is Digital vs Physical
  const isDigital = Boolean(llmOrderData?.is_digital) || checkIsDigitalOrder(items)

  // Calculate Financials
  let subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const discount = Math.max(0, Number(llmOrderData?.discount) || 0)
  const deliveryCharge = isDigital ? 0 : Math.max(0, Number(llmOrderData?.delivery_charge) || 0)
  let total = Math.max(0, subtotal - discount + deliveryCharge)

  if (total === 0 && isPlausiblePrice(llmOrderData?.total)) {
    total = Number(llmOrderData!.total)
    subtotal = total
    if (items[0]) {
      items[0].unit_price = total
      items[0].total = total
    }
  }

  // 5. Payment method resolution & confirmation check
  const custMsg = messageText.toLowerCase()
  const combinedText = `${conversationHistoryText}\n${messageText}`.toLowerCase()

  // Detect if this is a Free Promotional Offer / Giveaway / ৳0 Order
  const isFreeOrder =
    llmOrderData?.payment_method === 'free' ||
    (llmOrderData?.total !== undefined && Number(llmOrderData?.total) === 0 && Boolean(llmOrderData?.notes && /\b(?:free|বিনামূল্যে|giveaway|ফ্রি)\b/i.test(llmOrderData.notes))) ||
    (items.length > 0 && items.every((i) => i.unit_price === 0))

  if (isFreeOrder) {
    total = 0
    subtotal = 0
    items.forEach((i) => {
      i.unit_price = 0
      i.total = 0
    })
  }

  let explicitPaymentMethod: PaymentMethod | null = null
  let paymentReference: string | null = null
  let isPaymentConfirmed = false

  if (isFreeOrder) {
    explicitPaymentMethod = 'free'
    isPaymentConfirmed = true
    paymentReference = 'FREE_PROMO'
  } else {
    // Check for explicit Transaction ID or payment reference
    const trxMatch = messageText.match(/\b(?:trx(?:id)?|txid|transaction(?:\s*id)?|ref(?:\s*no)?)\s*[:=-]?\s*([a-zA-Z0-9]{6,25})\b/i)
    if (trxMatch && trxMatch[1]) {
      paymentReference = trxMatch[1].trim()
      isPaymentConfirmed = true
    }

    // Check for payment sent phrases
    const paymentSentRegex = /\b(?:paid|done|sent|taka\s*pathiyechi|taka\s*dilam|pathalam|pathaisi|pathano\s*hoyeche|টাকা\s*পাঠিয়েছি|পাঠালাম|দিলাম|পেড|পেইড|পেমেন্ট\s*করেছি|পেমেন্ট\s*ডান|টাকা\s*দিছি)\b/i
    if (paymentSentRegex.test(custMsg) || paymentReference) {
      isPaymentConfirmed = true
    }

    if (/\b(?:bkash|b-kash|বিকাশ)\b/i.test(custMsg)) {
      explicitPaymentMethod = 'bkash'
    } else if (/\b(?:nagad|নগদ)\b/i.test(custMsg)) {
      explicitPaymentMethod = 'nagad'
    } else if (/\b(?:rocket|রকেট)\b/i.test(custMsg)) {
      explicitPaymentMethod = 'rocket'
    } else if (/\b(?:bank transfer|bank|ব্যাংক)\b/i.test(custMsg)) {
      explicitPaymentMethod = 'bank_transfer'
    } else if (/\b(?:cod|cash on delivery|ক্যাশ অন ডেলিভারি|ক্যাশ|ক্যাশে|delivery te taka|হাতে পেয়ে)\b/i.test(custMsg)) {
      if (!isDigital) {
        explicitPaymentMethod = 'cod'
        isPaymentConfirmed = true
      }
    }

    // If physical and not in current message, check if customer already confirmed COD in recent conversation
    if (!explicitPaymentMethod && !isDigital) {
      if (/\b(?:cod|cash on delivery|ক্যাশ অন ডেলিভারি)\b/i.test(combinedText)) {
        explicitPaymentMethod = 'cod'
        isPaymentConfirmed = true
      }
    }

    // Check LLM order data payment method
    if (!explicitPaymentMethod && llmOrderData?.payment_method) {
      const pm = llmOrderData.payment_method.toLowerCase().trim()
      if (['bkash', 'nagad', 'rocket', 'bank_transfer'].includes(pm)) {
        explicitPaymentMethod = pm as PaymentMethod
      } else if (pm === 'cod' && !isDigital) {
        if (/\b(?:cod|cash on delivery|ক্যাশ)\b/i.test(combinedText)) {
          explicitPaymentMethod = 'cod'
          isPaymentConfirmed = true
        }
      }
    }
  }

  // 6. Completeness Validation:
  // - Free Products: Only Require Phone + Email (digital) or Phone + Delivery Address (physical). ZERO payment/TrxID needed.
  // - Digital Paid Products: Require Phone, Email, and Confirmed Payment (prepaid). COD is forbidden.
  // - Physical Paid Products: Require Phone, Physical Address, and Confirmed Payment Method (COD or bKash/Nagad).
  const hasPhone = Boolean(phone)
  const hasAddress = Boolean(address && address.length >= 6)
  const hasEmail = Boolean(email && email.includes('@'))

  let isOrderComplete = false
  const missingRequirements: string[] = []

  if (isDigital) {
    if (!hasPhone) missingRequirements.push('phone')
    if (!hasEmail) missingRequirements.push('email')
    if (!isFreeOrder && (!explicitPaymentMethod || explicitPaymentMethod === 'cod' || !isPaymentConfirmed)) {
      missingRequirements.push('payment_confirmation')
    }
    isOrderComplete = hasPhone && hasEmail && (isFreeOrder || (isPaymentConfirmed && Boolean(explicitPaymentMethod) && explicitPaymentMethod !== 'cod'))
  } else {
    if (!hasPhone) missingRequirements.push('phone')
    if (!hasAddress) missingRequirements.push('delivery_address')
    if (!isFreeOrder && !explicitPaymentMethod) {
      missingRequirements.push('payment_method')
    }
    isOrderComplete = hasPhone && hasAddress && (isFreeOrder || Boolean(explicitPaymentMethod))
  }

  // Update contact information in CRM even if order is not fully complete yet
  if (contactId && (phone || address || email)) {
    try {
      const contactUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (phone && !isFacebookPsid(phone)) contactUpdates.phone = phone
      if (address) contactUpdates.address = address
      if (email) contactUpdates.email = email
      await db.from('contacts').update(contactUpdates).eq('id', contactId)
    } catch {
      // safe fallback
    }
  }

  // If required information is not complete, DO NOT create an order!
  if (!isOrderComplete) {
    console.log(`[auto-create-order] Order not completed yet. Digital: ${isDigital}. Free: ${isFreeOrder}. Missing: ${missingRequirements.join(', ')}`)
    return null
  }

  const finalPaymentMethod: PaymentMethod = isFreeOrder ? 'free' : (explicitPaymentMethod || (isDigital ? 'bkash' : 'cod'))
  const finalPaymentStatus: PaymentStatus = isFreeOrder ? 'paid' : (isPaymentConfirmed && finalPaymentMethod !== 'cod' ? 'paid' : 'unpaid')

  // 7. Deduplication Check: Look for an existing 'new' order created in the last 15 minutes
  try {
    let existingQuery = db
      .from('orders')
      .select('id, customer_phone, customer_address, notes, subtotal, total, created_at, order_items(id, product_name, quantity, unit_price)')
      .eq('account_id', accountId)
      .eq('status', 'new')
      .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (contactId) {
      existingQuery = existingQuery.eq('contact_id', contactId)
    }

    const { data: existingOrders } = await existingQuery
    const existingOrder = existingOrders?.[0]

    if (existingOrder) {
      const existingItems = existingOrder.order_items || []
      const hasPlaceholder = existingItems.length === 0 || existingItems.some((i: any) => i.product_name === 'Customer Order')
      
      const isSameItems = existingItems.length > 0 && items.length > 0 &&
        existingItems.every((ei: any) => items.some(ni => ni.product_name.toLowerCase() === ei.product_name.toLowerCase()))

        if (hasPlaceholder || isSameItems) {
        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
          payment_method: finalPaymentMethod,
          payment_status: finalPaymentStatus,
        }
        if (address) updates.customer_address = address
        if (phone && !isFacebookPsid(phone)) updates.customer_phone = phone
        if (email) updates.customer_email = email
        if (resolvedName && resolvedName !== 'Messenger Customer') updates.customer_name = resolvedName
        if (paymentReference) updates.payment_reference = paymentReference
        updates.is_digital = isDigital

        if (items.length > 0 && hasPlaceholder) {
          updates.subtotal = subtotal
          updates.total = total
          updates.delivery_charge = deliveryCharge

          await db.from('order_items').delete().eq('order_id', existingOrder.id)
          const itemsToInsert = items.map((item) => ({
            order_id: existingOrder.id,
            product_id: item.product_id || null,
            product_name: item.product_name,
            product_sku: item.product_sku || null,
            unit_price: item.unit_price,
            quantity: item.quantity,
            total: item.total,
          }))
          await db.from('order_items').insert(itemsToInsert)
        }

        try {
          await db.from('orders').update(updates).eq('id', existingOrder.id)
        } catch {
          if (updates.payment_method === 'free') {
            updates.payment_method = 'bkash'
            updates.notes = `[Free Promo - ৳0] ${existingOrder.notes || ''}`
          }
          delete updates.customer_email
          delete updates.is_digital
          await db.from('orders').update(updates).eq('id', existingOrder.id)
        }

        console.log(`[auto-create-order] Updated existing order ${existingOrder.id}`)
        return existingOrder
      }
    }
  } catch (dedupeErr) {
    console.warn('[auto-create-order] Deduplication check failed:', dedupeErr)
  }

  // 8. Verify Contact ID exists in contacts table to prevent Foreign Key constraint violation
  let validContactId: string | null = null
  if (contactId) {
    try {
      const { data: cRow } = await db.from('contacts').select('id').eq('id', contactId).maybeSingle()
      if (cRow?.id) {
        validContactId = cRow.id
      }
    } catch {
      // safe fallback
    }
  }

  // 9. Insert New Order with status 'new' (Pending Shop Owner Approval)
  const finalCustomerName = resolvedName || (phone ? `Customer (${phone.slice(-4)})` : 'Messenger Customer')
  const orderNotes = llmOrderData?.notes || (
    isFreeOrder
      ? `Promotional free order (৳0) captured by AI Assistant via ${channel} (${isDigital ? 'Digital Product' : 'Physical Product'})`
      : `Automatically captured by AI Assistant via ${channel} (${isDigital ? 'Digital Product' : 'Physical Product'})`
  )

  const orderPayload: Record<string, any> = {
    account_id: accountId,
    contact_id: validContactId,
    customer_name: finalCustomerName,
    customer_phone: phone || null,
    customer_address: address || null,
    customer_email: email || null,
    is_digital: isDigital,
    status: 'new' as OrderStatus,
    payment_method: finalPaymentMethod,
    payment_status: finalPaymentStatus,
    payment_reference: paymentReference || null,
    subtotal,
    discount,
    delivery_charge: deliveryCharge,
    total,
    notes: orderNotes,
    source: channel || 'messenger',
  }

  if (conversationId) {
    orderPayload.conversation_id = conversationId
  }

  let { data: order, error: orderErr } = await db
    .from('orders')
    .insert(orderPayload)
    .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, created_at')
    .single()

  // Fallback 1: If insert failed due to customer_email or is_digital columns
  if (orderErr && (orderErr.message?.includes('customer_email') || orderErr.message?.includes('is_digital'))) {
    delete orderPayload.customer_email
    delete orderPayload.is_digital
    const retry = await db
      .from('orders')
      .insert(orderPayload)
      .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, created_at')
      .single()
    order = retry.data
    orderErr = retry.error
  }

  // Fallback 2: If insert failed due to payment_method check constraint (if DB migration 071 is pending)
  if (orderErr && (orderErr.message?.includes('payment_method') || orderErr.message?.includes('orders_payment_method_check'))) {
    console.warn('[auto-create-order] Retrying insert with fallback payment_method=bkash:', orderErr.message)
    orderPayload.payment_method = 'bkash'
    orderPayload.notes = `[Free Promo - ৳0] ${orderPayload.notes || ''}`
    const retry = await db
      .from('orders')
      .insert(orderPayload)
      .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, created_at')
      .single()
    order = retry.data
    orderErr = retry.error
  }

  // Fallback 3: If insert failed because conversation_id column doesn't exist in Supabase schema:
  if (orderErr && orderPayload.conversation_id) {
    console.warn('[auto-create-order] Retrying insert without conversation_id:', orderErr.message)
    delete orderPayload.conversation_id
    const retry = await db
      .from('orders')
      .insert(orderPayload)
      .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, created_at')
      .single()
    order = retry.data
    orderErr = retry.error
  }

  // Fallback 4: If insert failed because contact_id foreign key constraint failed:
  if (orderErr && orderPayload.contact_id) {
    console.warn('[auto-create-order] Retrying insert without contact_id:', orderErr.message)
    delete orderPayload.contact_id
    const retry = await db
      .from('orders')
      .insert(orderPayload)
      .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, created_at')
      .single()
    order = retry.data
    orderErr = retry.error
  }

  if (orderErr || !order) {
    console.error('[auto-create-order] Failed to insert order after all retries:', orderErr)
    return null
  }

  // 9. Insert Order Items
  const itemsToInsert = items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id || null,
    product_name: item.product_name,
    product_sku: item.product_sku || null,
    unit_price: item.unit_price,
    quantity: item.quantity,
    total: item.total,
  }))

  const { data: insertedItems, error: itemsErr } = await db
    .from('order_items')
    .insert(itemsToInsert)
    .select()

  if (itemsErr) {
    console.warn('[auto-create-order] Failed to insert order items:', itemsErr)
  }

  console.log(`[auto-create-order] Successfully created order ${order.order_number || order.id} for ${finalCustomerName} with ${items.length} items`)

  return {
    ...order,
    order_items: insertedItems ?? items,
  }
}
