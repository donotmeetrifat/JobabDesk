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
    action?: 'create' | 'update_items' | 'update' | 'cancel'
    is_cancelled?: boolean
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

  // 1. Extract contact details from current message & order conversation session (customer lines only)
  const extracted = extractCustomerInfoFromMessage(messageText)
  const customerOnlyHistoryText = (conversationHistoryText || '')
    .split('\n')
    .filter((l) => !/^\s*(?:\[[^\]]+\]\s*)?(?:Salesman|Bot|Assistant|Agent|Shop|AI)\s*:/i.test(l))
    .map((l) => l.replace(/^\s*(?:\[[^\]]+\]\s*)?(?:Customer|User)\s*:\s*/i, '').trim())
    .filter(Boolean)
    .join('\n')
  const historyExtracted = extractCustomerInfoFromMessage(customerOnlyHistoryText)

  let phone = (customerPhone && !isFacebookPsid(customerPhone) ? customerPhone : null) || extracted.phone || historyExtracted.phone || (llmOrderData?.customer_phone && !isFacebookPsid(llmOrderData.customer_phone) ? llmOrderData.customer_phone : null) || null
  let address = customerAddress || extracted.address || historyExtracted.address || llmOrderData?.customer_address || null
  let email = customerEmail || extracted.email || historyExtracted.email || llmOrderData?.customer_email || null

  let resolvedName = (customerName && customerName !== 'Messenger User' && customerName !== 'Unknown' ? customerName : null) ||
    extracted.name ||
    historyExtracted.name ||
    llmOrderData?.customer_name ||
    null

  // 1b. Detect Order Cancellation Intent
  const isLlmCancel = Boolean(llmOrderData?.action === 'cancel' || llmOrderData?.is_cancelled)
  const cancelKeywords = /\b(?:cancel|cancle|cancelled|cancelling|বাতিল|ক্যানসেল|ক্যান্সেল|বাদ|বাতিল\s*করুন|বাতিল\s*করে\s*দিন|বাতিল\s*কর্ডেন|cancel\s*order|order\s*cancel|cancel\s*my\s*order|order\s*cancel\s*kore\s*din|eita\s*nibo\s*na|nibo\s*na|nebo\s*na|lagbe\s*na|dorkar\s*nai|নিব\s*না|নেব\s*না|লাগবে\s*না|দরকার\s*নাই|চাই\s*না|chai\s*na|order\s*lagbe\s*na|order\s*dorkar\s*nai|order\s*nibo\s*na)\b/i
  const isCancelRequest = isLlmCancel || cancelKeywords.test(messageText)

  const changeKeywords = /\b(?:change|palte|bodle|poriborton|bodol|poriborte|instead|onno\s*ta|onno\s*product|অন্য\s*পণ্য|পরিবর্তন|পাল্টে|বদলে|বদল|পরিবর্তে)\b/i
  const isProductChange =
    Boolean(llmOrderData?.action === 'update_items' || llmOrderData?.action === 'update') ||
    changeKeywords.test(messageText)

  // Pure Cancellation: Customer explicitly wants to cancel and is not switching to another product
  if (isCancelRequest && !isProductChange) {
    let cancelQuery = db
      .from('orders')
      .select('id, order_number, status, notes, total, customer_name, customer_phone')
      .eq('account_id', accountId)
      .in('status', ['new', 'confirmed', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (conversationId) {
      cancelQuery = cancelQuery.eq('conversation_id', conversationId)
    } else if (contactId) {
      cancelQuery = cancelQuery.eq('contact_id', contactId)
    } else if (phone) {
      cancelQuery = cancelQuery.eq('customer_phone', phone)
    }

    let { data: ordersToCancel } = await cancelQuery
    if ((!ordersToCancel || ordersToCancel.length === 0) && (contactId || phone)) {
      let fbQuery = db
        .from('orders')
        .select('id, order_number, status, notes, total, customer_name, customer_phone')
        .eq('account_id', accountId)
        .in('status', ['new', 'confirmed', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (contactId && phone) {
        fbQuery = fbQuery.or(`contact_id.eq.${contactId},customer_phone.eq.${phone}`)
      } else if (contactId) {
        fbQuery = fbQuery.eq('contact_id', contactId)
      } else if (phone) {
        fbQuery = fbQuery.eq('customer_phone', phone)
      }
      const res = await fbQuery
      ordersToCancel = res.data
    }

    const orderToCancel = ordersToCancel?.[0]
    if (orderToCancel) {
      const cancelNote = `[Cancelled by customer in chat on ${new Date().toLocaleDateString('en-GB')}]`
      const updatedNotes = orderToCancel.notes
        ? `${orderToCancel.notes}\n${cancelNote}`
        : cancelNote

      const { data: updatedOrder, error: cancelErr } = await db
        .from('orders')
        .update({
          status: 'cancelled',
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderToCancel.id)
        .select('id, account_id, order_number, total, status, customer_name, customer_phone, customer_address, notes, created_at')
        .single()

      if (!cancelErr && updatedOrder) {
        console.log(`[auto-create-order] Order #${updatedOrder.order_number || updatedOrder.id} successfully marked as Cancelled by customer`)
        return updatedOrder
      }
    }

    // Crucial: Under NO circumstances create a new order when customer intended to cancel!
    return null
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

  const fullText = `${conversationHistoryText || ''}\n${messageText || ''}`.trim()

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
    const sortedProds = [...catalogProducts].sort((a, b) => b.name.length - a.name.length)

    // 1) First, scan catalog products mentioned in current messageText
    for (const prod of sortedProds) {
      const prodNameEscaped = prod.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(?:\\b|\\s|^)${prodNameEscaped}(?:\\b|\\s|$)`, 'i')
      if (regex.test(messageText)) {
        // Extract quantity from messageText (e.g. "2 simple cream" or "simple cream 2 ta")
        const qtyMatch = messageText.match(new RegExp(`(?:order\\s+)?(\\d+)\\s*(?:pcs|ta|piece|ti|টা|টি)?\\s*${prodNameEscaped}|${prodNameEscaped}\\s*(\\d+)\\s*(?:pcs|ta|piece|ti|টা|টি)?`, 'i'))
        const parsedQty = qtyMatch ? (parseInt(qtyMatch[1] || qtyMatch[2], 10) || 1) : 1
        const price = Math.max(0, Number(prod.price) || 0)
        items.push({
          product_id: prod.id || null,
          product_name: prod.name,
          product_sku: prod.sku || null,
          unit_price: price,
          quantity: parsedQty,
          total: price * parsedQty,
        })
        break // Stop at the product explicitly mentioned in the current message
      }
    }

    // 2) If not in current message, look back at recent conversation history backwards
    if (items.length === 0 && conversationHistoryText) {
      const lines = conversationHistoryText.split('\n').filter(Boolean)
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]
        for (const prod of sortedProds) {
          const prodNameEscaped = prod.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const regex = new RegExp(`(?:\\b|\\s|^)${prodNameEscaped}(?:\\b|\\s|$)`, 'i')
          if (regex.test(line)) {
            const qtyMatch = line.match(new RegExp(`(?:order\\s+)?(\\d+)\\s*(?:pcs|ta|piece|ti|টা|টি)?\\s*${prodNameEscaped}|${prodNameEscaped}\\s*(\\d+)\\s*(?:pcs|ta|piece|ti|টা|টি)?`, 'i'))
            const parsedQty = qtyMatch ? (parseInt(qtyMatch[1] || qtyMatch[2], 10) || 1) : 1
            const price = Math.max(0, Number(prod.price) || 0)
            items.push({
              product_id: prod.id || null,
              product_name: prod.name,
              product_sku: prod.sku || null,
              unit_price: price,
              quantity: parsedQty,
              total: price * parsedQty,
            })
            break
          }
        }
        if (items.length > 0) break // Stop at the most recent product intent
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
  const isDigital = items.length > 0 ? checkIsDigitalOrder(items) : Boolean(llmOrderData?.is_digital)

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

  // 6. Strict Order Completeness Validation:
  // - Physical Products: MUST know ALL 4 items: Customer Name, Delivery Address, Delivery Number (Phone), Payment Method.
  //   * If COD: Confirmed immediately upon choosing COD.
  //   * If Online Payment: Must have payment confirmed / TrxID before adding to orders page.
  // - Digital Products: MUST know ALL 3 items: Phone Number, Email Address, Payment Method (online payment confirmed or free promo).
  const isValidHumanName = (n?: string | null): boolean => {
    if (!n) return false
    const trimmed = n.trim()
    if (trimmed.length < 2 || trimmed.length > 50) return false
    if (/^(messenger user|unknown|user|guest|customer|test|admin|owner|null|undefined|none|n\/a)$/i.test(trimmed)) return false
    if (/^\+?\d+$/.test(trimmed)) return false
    if (/^(?:for|to|in|at|of|the|a|an|with|by|from|about)\s+/i.test(trimmed)) return false
    if (/\b(?:delivery\s*package|package|parcel|share|please|address|phone|email|method|product|item|full\s*name)\b/i.test(trimmed)) return false
    if (/\b(?:পূর্ণাঙ্গ|ডেলিভারি|ঠিকানা|বাসা\/রোড|থানা|জেলা|বুকিং)\b/i.test(trimmed)) return false
    return true
  }

  const hasName = isValidHumanName(resolvedName)
  const hasPhone = Boolean(phone && !isFacebookPsid(phone) && phone.length >= 10)
  const hasAddress = Boolean(
    address &&
    address.trim().length >= 5 &&
    !address.endsWith('?') &&
    !/\b(?:পূর্ণাঙ্গ\s*ডেলিভারি\s*ঠিকানা|বাসা\/রোড|থানা,\s*জেলা|basha\/road|thana,\s*district|share\s*your|could\s*you\s*please|to\s*complete\s*your|অনুগ্রহ\s*করে|জানিয়ে\s*দিন|বুকিংয়ের\s*জন্য|পাঠিয়ে\s*দিচ্ছি|প্রস্তুত\s*করছি|যেকোনো\s*প্রয়োজনে|কুরিয়ার\s*সার্ভিস)\b/i.test(address)
  )
  const hasEmail = Boolean(email && /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim()))

  let isOrderComplete = false
  const missingRequirements: string[] = []

  if (isDigital) {
    // DIGITAL PRODUCT: 3 items (Phone, Email, Payment Method)
    if (!hasPhone) missingRequirements.push('phone')
    if (!hasEmail) missingRequirements.push('email')
    if (!isFreeOrder && (!explicitPaymentMethod || explicitPaymentMethod === 'cod' || !isPaymentConfirmed)) {
      missingRequirements.push('payment_confirmation')
    }
    isOrderComplete = hasPhone && hasEmail && (isFreeOrder || (isPaymentConfirmed && Boolean(explicitPaymentMethod) && explicitPaymentMethod !== 'cod'))
  } else {
    // PHYSICAL PRODUCT: 4 items (Name, Delivery Address, Delivery Phone, Payment Method)
    if (!hasName) missingRequirements.push('name')
    if (!hasAddress) missingRequirements.push('delivery_address')
    if (!hasPhone) missingRequirements.push('delivery_number')
    if (!isFreeOrder && !explicitPaymentMethod) {
      missingRequirements.push('payment_method')
    } else if (!isFreeOrder && explicitPaymentMethod !== 'cod' && !isPaymentConfirmed) {
      missingRequirements.push('payment_confirmation')
    }

    isOrderComplete =
      hasName &&
      hasAddress &&
      hasPhone &&
      (isFreeOrder || (explicitPaymentMethod === 'cod') || (Boolean(explicitPaymentMethod) && isPaymentConfirmed))
  }

  // Update contact information in CRM even if order is not fully complete yet
  if (contactId && (phone || address || email || (hasName && resolvedName))) {
    try {
      const contactUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (phone && !isFacebookPsid(phone)) contactUpdates.phone = phone
      if (address) contactUpdates.address = address
      if (email) contactUpdates.email = email
      if (hasName && resolvedName) contactUpdates.name = resolvedName
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

  // 7. Deduplication & Existing Order Update Check:
  // If an active/pending order exists for this customer, update it (especially when changing products or completing details)
  try {
    let existingQuery = db
      .from('orders')
      .select('id, order_number, customer_phone, customer_address, customer_email, notes, subtotal, total, status, is_digital, created_at, order_items(id, product_name, quantity, unit_price)')
      .eq('account_id', accountId)
      .in('status', ['new', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (conversationId) {
      existingQuery = existingQuery.eq('conversation_id', conversationId)
    } else if (contactId) {
      existingQuery = existingQuery.eq('contact_id', contactId)
    } else if (phone) {
      existingQuery = existingQuery.eq('customer_phone', phone)
    }

    let { data: existingOrders } = await existingQuery

    if ((!existingOrders || existingOrders.length === 0) && (contactId || phone)) {
      let fbQuery = db
        .from('orders')
        .select('id, order_number, customer_phone, customer_address, customer_email, notes, subtotal, total, status, is_digital, created_at, order_items(id, product_name, quantity, unit_price)')
        .eq('account_id', accountId)
        .in('status', ['new', 'confirmed'])
        .order('created_at', { ascending: false })
        .limit(1)

      if (contactId && phone) {
        fbQuery = fbQuery.or(`contact_id.eq.${contactId},customer_phone.eq.${phone}`)
      } else if (contactId) {
        fbQuery = fbQuery.eq('contact_id', contactId)
      } else if (phone) {
        fbQuery = fbQuery.eq('customer_phone', phone)
      }
      const res = await fbQuery
      existingOrders = res.data
    }

    const existingOrder = existingOrders?.[0]

    if (existingOrder) {
      const existingItems = existingOrder.order_items || []
      const hasPlaceholder = existingItems.length === 0 || existingItems.some((i: any) => i.product_name === 'Customer Order')
      const isSameItems = existingItems.length > 0 && items.length > 0 &&
        existingItems.every((ei: any) => items.some(ni => ni.product_name.toLowerCase() === ei.product_name.toLowerCase()))

      const shouldUpdateExisting = Boolean(isProductChange || hasPlaceholder || isSameItems)

      if (shouldUpdateExisting) {
        const changeNote = isProductChange
          ? `[Product changed by customer to ${items.map(i => i.product_name).join(', ')} on ${new Date().toLocaleDateString('en-GB')}]`
          : null

        let updatedNotes = existingOrder.notes || ''
        if (changeNote) {
          updatedNotes = updatedNotes ? `${updatedNotes}\n${changeNote}` : changeNote
        }

        const updates: Record<string, any> = {
          updated_at: new Date().toISOString(),
          payment_method: finalPaymentMethod,
          payment_status: finalPaymentStatus,
          notes: updatedNotes || existingOrder.notes,
        }
        if (address) updates.customer_address = address
        if (phone && !isFacebookPsid(phone)) updates.customer_phone = phone
        if (email) updates.customer_email = email
        if (resolvedName && resolvedName !== 'Messenger Customer') updates.customer_name = resolvedName
        if (paymentReference) updates.payment_reference = paymentReference
        updates.is_digital = isDigital

        // Update items and recalculate financials if items changed or was placeholder
        if (items.length > 0 && (hasPlaceholder || isProductChange || !isSameItems)) {
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

        console.log(`[auto-create-order] Updated existing order #${existingOrder.order_number || existingOrder.id}: product(s)=${items.map(i => i.product_name).join(', ')}, total=৳${total}`)
        return existingOrder
      }
    }
  } catch (dedupeErr) {
    console.warn('[auto-create-order] Deduplication/update check failed:', dedupeErr)
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
