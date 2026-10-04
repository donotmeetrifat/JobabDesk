import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractCustomerInfoFromMessage, isFacebookPsid } from '@/lib/contacts/extract-info'
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
  messageText: string
  conversationHistoryText?: string
  llmOrderData?: {
    is_order?: boolean
    customer_name?: string | null
    customer_phone?: string | null
    customer_address?: string | null
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
const ORDER_INTENT_REGEX = /(?:order|confirm|nite\s*chai|nite\s*chi|nebo|nibo|pathan|pathiye\s*din|bheje\s*din|dispatch|delivery|thikana|address|adreass|adress|parcel|checkout|কুরিয়ার|অর্ডার|পাঠান|পৌঁছে\s*দিন|পাঠিয়ে\s*দিন)/i

export async function detectAndCreateOrderFromChat({
  accountId,
  contactId,
  conversationId,
  channel = 'messenger',
  customerName,
  customerPhone,
  customerAddress,
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

  // If still missing, check contact record in DB
  let resolvedName = customerName || null
  if (contactId) {
    try {
      const { data: contactRow } = await db
        .from('contacts')
        .select('name, phone, address')
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
      }
    } catch (_cErr) {
      // safe fallback
    }
  }

  if (llmOrderData?.customer_phone && !phone && !isFacebookPsid(llmOrderData.customer_phone)) {
    phone = llmOrderData.customer_phone
  }
  if (llmOrderData?.customer_address && !address) address = llmOrderData.customer_address
  if (llmOrderData?.customer_name && (!resolvedName || resolvedName === 'Messenger User')) {
    resolvedName = llmOrderData.customer_name
  }

  // 2. Check if this is an order confirmation or order intent
  const isLlmConfirmed = Boolean(llmOrderData?.is_order && llmOrderData?.items && llmOrderData.items.length > 0)
  const hasDeliveryDetails = Boolean(phone || address)
  const matchesOrderKeywords = ORDER_INTENT_REGEX.test(messageText) || ORDER_INTENT_REGEX.test(conversationHistoryText)

  // Must have at least delivery details or LLM order confirmation
  if (!isLlmConfirmed && (!hasDeliveryDetails || !matchesOrderKeywords)) {
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

      if (matched?.price && (unitPrice === 0 || !isPlausiblePrice(unitPrice))) {
        unitPrice = Number(matched.price)
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

  // 4. Calculate Financials
  let subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const discount = Math.max(0, Number(llmOrderData?.discount) || 0)
  const deliveryCharge = Math.max(0, Number(llmOrderData?.delivery_charge) || 0)
  let total = Math.max(0, subtotal - discount + deliveryCharge)

  if (total === 0 && isPlausiblePrice(llmOrderData?.total)) {
    total = Number(llmOrderData!.total)
    subtotal = total
    if (items[0]) {
      items[0].unit_price = total
      items[0].total = total
    }
  }

  // 5. Payment method resolution
  let paymentMethod: PaymentMethod = 'cod'

  // Priority 1: LLM structured order output
  if (llmOrderData?.payment_method) {
    const pm = llmOrderData.payment_method.toLowerCase().trim()
    if (['bkash', 'nagad', 'rocket', 'bank_transfer', 'cod', 'card'].includes(pm)) {
      paymentMethod = pm as PaymentMethod
    }
  }

  // Priority 2: Check ONLY the customer's current message for explicit choice
  if (paymentMethod === 'cod') {
    const custMsg = messageText.toLowerCase()
    if (/\b(?:bkash|b-kash|বিকাশ)\b/.test(custMsg)) {
      paymentMethod = 'bkash'
    } else if (/\b(?:nagad|নগদ)\b/.test(custMsg)) {
      paymentMethod = 'nagad'
    } else if (/\b(?:rocket|রকেট)\b/.test(custMsg)) {
      paymentMethod = 'rocket'
    } else if (/\b(?:bank transfer)\b/.test(custMsg)) {
      paymentMethod = 'bank_transfer'
    }
  }

  // 6. Deduplication Check: Look for an existing 'new' order created in the last 1 hour
  try {
    let existingQuery = db
      .from('orders')
      .select('id, customer_phone, customer_address, notes')
      .eq('account_id', accountId)
      .eq('status', 'new')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (conversationId) {
      existingQuery = existingQuery.eq('conversation_id', conversationId)
    } else if (contactId) {
      existingQuery = existingQuery.eq('contact_id', contactId)
    }

    const { data: existingOrders } = await existingQuery
    const existingOrder = existingOrders?.[0]

    if (existingOrder) {
      // Update existing order with newly supplied address / phone / notes
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (address && !existingOrder.customer_address) updates.customer_address = address
      if (phone && !existingOrder.customer_phone) updates.customer_phone = phone
      if (resolvedName) updates.customer_name = resolvedName

      if (Object.keys(updates).length > 1) {
        await db.from('orders').update(updates).eq('id', existingOrder.id)
      }
      console.log(`[auto-create-order] Updated existing new order ${existingOrder.id}`)
      return existingOrder
    }
  } catch (dedupeErr) {
    console.warn('[auto-create-order] Deduplication check failed:', dedupeErr)
  }

  // 7. Insert New Order with status 'new' (Pending Shop Owner Approval)
  const finalCustomerName = resolvedName || (phone ? `Customer (${phone.slice(-4)})` : 'Messenger Customer')
  const orderNotes = llmOrderData?.notes || `Automatically captured by AI Assistant via ${channel}`

  const orderPayload: Record<string, any> = {
    account_id: accountId,
    contact_id: contactId || null,
    customer_name: finalCustomerName,
    customer_phone: phone || null,
    customer_address: address || null,
    status: 'new' as OrderStatus,
    payment_method: paymentMethod,
    payment_status: 'unpaid' as PaymentStatus,
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

  const { data: order, error: orderErr } = await db
    .from('orders')
    .insert(orderPayload)
    .select('*, contact:contacts(id, name, phone)')
    .single()

  if (orderErr || !order) {
    console.error('[auto-create-order] Failed to insert order:', orderErr)
    return null
  }

  // 8. Insert Order Items
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
