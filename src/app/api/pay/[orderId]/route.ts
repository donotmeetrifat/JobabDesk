import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { resolveMerchantPaymentSettings } from '@/lib/payments/instruction-parser'
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import { sanitizeText, sanitizeTrxId } from '@/lib/security/sanitize'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findOrder(admin: ReturnType<typeof getAdminClient>, rawOrderId: string) {
  let cleanId = ''
  try {
    cleanId = decodeURIComponent(rawOrderId || '').trim()
  } catch {
    cleanId = (rawOrderId || '').trim()
  }
  cleanId = cleanId.replace(/^#+/, '').trim()

  const isSpecialPlaceholder =
    !cleanId ||
    cleanId.toLowerCase() === 'undefined' ||
    cleanId.toLowerCase() === 'null' ||
    cleanId.toLowerCase() === 'latest' ||
    cleanId.toLowerCase() === 'recent'

  const selectColumnsWithItems =
    '*, order_items(id, product_name, product_sku, unit_price, quantity, total)'
  const selectColumnsSimple = '*'

  let order: any = null

  if (isSpecialPlaceholder) {
    // Graceful fallback: return the latest order
    const { data } = await admin
      .from('orders')
      .select(selectColumnsWithItems)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    order = data
  } else if (UUID_REGEX.test(cleanId)) {
    const { data } = await admin
      .from('orders')
      .select(selectColumnsWithItems)
      .eq('id', cleanId)
      .maybeSingle()
    order = data
  } else {
    // 1. Exact match on order_number
    let res = await admin
      .from('orders')
      .select(selectColumnsWithItems)
      .eq('order_number', cleanId)
      .maybeSingle()
    order = res.data

    // 1b. Uppercase match (order_number in DB is usually ORD-YYYY-XXXX)
    if (!order && cleanId.toUpperCase() !== cleanId) {
      const resUpper = await admin
        .from('orders')
        .select(selectColumnsWithItems)
        .eq('order_number', cleanId.toUpperCase())
        .maybeSingle()
      order = resUpper.data
    }

    // 2. Try prefixing 'ORD-' if not already matching
    if (!order && !cleanId.toUpperCase().startsWith('ORD-')) {
      const resPrefix = await admin
        .from('orders')
        .select(selectColumnsWithItems)
        .eq('order_number', `ORD-${cleanId.toUpperCase()}`)
        .maybeSingle()
      order = resPrefix.data
    }

    // 3. Try case-insensitive ilike if supported by the client
    if (!order) {
      const builder = admin.from('orders').select(selectColumnsWithItems) as any
      if (typeof builder.ilike === 'function') {
        try {
          const resIlike = await builder.ilike('order_number', cleanId).maybeSingle()
          if (resIlike?.data) order = resIlike.data
        } catch {
          // safe fallback
        }
      }
    }

    // 4. Try phone number lookup if cleanId is a phone number (strictly numeric)
    const isPhoneNumber = /^\+?\d{10,15}$/.test(cleanId)
    if (!order && isPhoneNumber) {
      const resPhone = await admin
        .from('orders')
        .select(selectColumnsWithItems)
        .eq('customer_phone', cleanId)
        .maybeSingle()
      order = resPhone.data
    }

    // 5. Try partial search via ilike if available
    if (!order && cleanId.length >= 3) {
      const builder = admin.from('orders').select(selectColumnsWithItems) as any
      if (typeof builder.ilike === 'function') {
        try {
          const resPartial = await builder
            .ilike('order_number', `%${cleanId}%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (resPartial?.data) order = resPartial.data
        } catch {
          // safe fallback
        }
      }
    }
  }

  // Fallback if join on order_items failed or threw an error: query orders table directly
  if (!order && !isSpecialPlaceholder) {
    let simpleQuery = admin.from('orders').select(selectColumnsSimple)
    if (UUID_REGEX.test(cleanId)) {
      simpleQuery = simpleQuery.eq('id', cleanId)
    } else {
      simpleQuery = simpleQuery.eq('order_number', cleanId.toUpperCase())
    }
    const { data: simpleData } = await simpleQuery.maybeSingle()
    if (simpleData) {
      order = simpleData
    }
  }

  if (!order) return null

  // Ensure items array is always populated even if join failed
  if (!order.order_items || !Array.isArray(order.order_items)) {
    try {
      const { data: items } = await admin
        .from('order_items')
        .select('id, product_name, product_sku, unit_price, quantity, total')
        .eq('order_id', order.id)
      order.order_items = items || []
    } catch {
      order.order_items = []
    }
  }

  return order
}

async function resolveStoreAccount(admin: ReturnType<typeof getAdminClient>, order: any) {
  // Helper: check if account has phone numbers configured or custom special instructions
  const isAccountFullyConfigured = (acc: any) => {
    if (!acc) return false
    const ps = acc.payment_settings
    const hasNumbers = Boolean(
      ps?.bkash?.number?.trim() ||
      ps?.nagad?.number?.trim() ||
      ps?.rocket?.number?.trim() ||
      ps?.bank?.details?.trim()
    )
    const hasInstructions = Boolean(
      acc.special_instructions?.trim() ||
      acc.ai_store_instructions?.trim() ||
      acc.ai_business_description?.trim()
    )
    return hasNumbers || hasInstructions
  }

  let storeAccount: any = null

  // 1. Direct query by order.account_id (primary tenant key)
  if (order.account_id) {
    try {
      const { data } = await admin
        .from('accounts')
        .select('*')
        .eq('id', order.account_id)
        .maybeSingle()
      if (data) {
        storeAccount = data
        if (isAccountFullyConfigured(data)) {
          return data
        }
      }
    } catch {}

    // Check if order.account_id matches owner_user_id
    try {
      const { data: ownerAcc } = await admin
        .from('accounts')
        .select('*')
        .eq('owner_user_id', order.account_id)
        .maybeSingle()
      if (ownerAcc) {
        if (!storeAccount) storeAccount = ownerAcc
        if (isAccountFullyConfigured(ownerAcc)) {
          return ownerAcc
        }
      }
    } catch {}
  }

  // 2. Check conversation_id if present on the order
  if (order.conversation_id) {
    try {
      const { data: conv } = await admin
        .from('conversations')
        .select('account_id')
        .eq('id', order.conversation_id)
        .maybeSingle()
      if (conv?.account_id) {
        const { data: convAcc } = await admin
          .from('accounts')
          .select('*')
          .eq('id', conv.account_id)
          .maybeSingle()
        if (convAcc) {
          if (!storeAccount) storeAccount = convAcc
          if (isAccountFullyConfigured(convAcc)) {
            return convAcc
          }
        }
      }
    } catch {}
  }

  // 3. Check contact_id if present on the order
  if (order.contact_id) {
    try {
      const { data: contact } = await admin
        .from('contacts')
        .select('account_id, user_id')
        .eq('id', order.contact_id)
        .maybeSingle()
      if (contact?.account_id) {
        const { data: contactAcc } = await admin
          .from('accounts')
          .select('*')
          .eq('id', contact.account_id)
          .maybeSingle()
        if (contactAcc) {
          if (!storeAccount) storeAccount = contactAcc
          if (isAccountFullyConfigured(contactAcc)) {
            return contactAcc
          }
        }
      }
    } catch {}
  }

  // 4. If storeAccount has an owner_user_id, check other accounts owned by the same user
  if (storeAccount?.owner_user_id) {
    try {
      const { data: userAccounts } = await admin
        .from('accounts')
        .select('*')
        .eq('owner_user_id', storeAccount.owner_user_id)
        .order('updated_at', { ascending: false })
      if (userAccounts && userAccounts.length > 0) {
        const configured = userAccounts.find(isAccountFullyConfigured)
        if (configured) {
          if (order.id && order.account_id !== configured.id) {
            order.account_id = configured.id
            try {
              await admin.from('orders').update({ account_id: configured.id }).eq('id', order.id)
            } catch {}
          }
          return configured
        }
      }
    } catch {}
  }

  // 5. Query accounts ordered by updated_at desc to find configured account (merchant's active setup in /agents)
  try {
    const { data: accountsList } = await admin
      .from('accounts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(10)

    if (accountsList && accountsList.length > 0) {
      const configured = accountsList.find(isAccountFullyConfigured)
      if (configured) {
        storeAccount = configured
        // Self-heal: link order to this merchant account
        if (order.id && order.account_id !== configured.id) {
          order.account_id = configured.id
          try {
            await admin.from('orders').update({ account_id: configured.id }).eq('id', order.id)
          } catch {}
        }
        return configured
      } else if (!storeAccount) {
        const namedAcc = accountsList.find(
          (a: any) => a.name && a.name !== 'My Store' && a.name !== 'Verified Merchant'
        )
        storeAccount = namedAcc || accountsList[0]
      }
    }
  } catch {}

  // 6. Return storeAccount if found, self-healing the order link
  if (storeAccount) {
    if (order.id && order.account_id !== storeAccount.id) {
      order.account_id = storeAccount.id
      try {
        await admin.from('orders').update({ account_id: storeAccount.id }).eq('id', order.id)
      } catch {}
    }
    return storeAccount
  }

  return null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    const admin = getAdminClient()
    const order = await findOrder(admin, orderId)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Dynamically resolve the store account and merchant settings
    const storeAccount = await resolveStoreAccount(admin, order)

    const resolvedPaymentSettings = resolveMerchantPaymentSettings(
      storeAccount?.payment_settings,
      storeAccount?.special_instructions,
      `${storeAccount?.ai_store_instructions || ''} ${storeAccount?.ai_business_description || ''}`
    )

    // Fetch submitted / verified payment requests for this order
    const { data: paymentRequests } = await admin
      .from('payment_requests')
      .select('id, order_id, amount, payment_method, payment_type, sender_number, trx_id, notes, status, rejection_reason, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.order_number,
        account_id: order.account_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        delivery_charge: order.delivery_charge || 0,
        subtotal: order.subtotal || 0,
        discount: order.discount || 0,
        total: order.total || 0,
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        notes: order.notes,
        created_at: order.created_at,
        items: order.order_items || [],
      },
      store: {
        name: storeAccount?.name || 'Verified Merchant',
        logo_url: storeAccount?.logo_url || null,
        business_tagline: storeAccount?.business_tagline || null,
        payment_settings: resolvedPaymentSettings,
        special_instructions: storeAccount?.special_instructions || '',
      },
      payment_requests: paymentRequests || [],
    })
  } catch (err: any) {
    console.error('[GET /api/pay/[orderId]] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to retrieve payment information' },
      { status: 500 }
    )
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    const admin = getAdminClient()
    const order = await findOrder(admin, orderId)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Rate limiting: Anti-Brute-Force & TrxID guessing protection
    const ip = getClientIp(req)
    const limit = checkRateLimit(`pay:submit:${order.id}:${ip}`, RATE_LIMITS.paymentSubmit)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await req.json()
    const { payment_method, sender_number, trx_id, payment_type = 'full', notes } = body

    // 1. Method validation
    const validMethods = ['bkash', 'nagad', 'rocket', 'bank']
    if (!payment_method || !validMethods.includes(payment_method)) {
      return NextResponse.json(
        { error: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` },
        { status: 400 }
      )
    }

    // 2. Sender number validation and sanitization
    if (!sender_number || typeof sender_number !== 'string' || sender_number.trim().length < 6) {
      return NextResponse.json(
        { error: 'Valid sender phone number or account is required' },
        { status: 400 }
      )
    }
    const cleanSender = sanitizeText(sender_number)

    // 3. TrxID formatting, sanitization, and validation
    if (!trx_id || typeof trx_id !== 'string') {
      return NextResponse.json(
        { error: 'Transaction ID (TrxID) is required' },
        { status: 400 }
      )
    }

    const cleanTrxId = sanitizeTrxId(trx_id)
    if (cleanTrxId.length < 8) {
      return NextResponse.json(
        { error: 'Transaction ID must be at least 8 alphanumeric characters' },
        { status: 400 }
      )
    }

    // Check alphanumeric characters only (protect against injections or invalid symbols)
    if (!/^[A-Z0-9]+$/.test(cleanTrxId)) {
      return NextResponse.json(
        { error: 'Transaction ID must contain only letters and numbers' },
        { status: 400 }
      )
    }

    // Specific bKash pattern check (10 characters alphanumeric)
    if (payment_method === 'bkash' && cleanTrxId.length !== 10) {
      return NextResponse.json(
        { error: 'bKash Transaction ID must be exactly 10 characters long (e.g. BJA830K29X)' },
        { status: 400 }
      )
    }

    // Dynamically resolve store account so account_id is valid and accurate
    const storeAccount = await resolveStoreAccount(admin, order)
    const effectiveAccountId = storeAccount?.id || order.account_id

    // 4. Anti-Fraud & Anti-Duplicate Shield
    const { data: existingTrx } = await admin
      .from('payment_requests')
      .select('id, order_id, status')
      .eq('account_id', effectiveAccountId)
      .eq('trx_id', cleanTrxId)
      .in('status', ['submitted', 'verified'])
      .maybeSingle()

    if (existingTrx) {
      return NextResponse.json(
        {
          error:
            'This Transaction ID (TrxID) has already been submitted or verified. Double-spending is prohibited.',
        },
        { status: 400 }
      )
    }

    // 5. Calculate amount
    const resolvedSettings = resolveMerchantPaymentSettings(
      storeAccount?.payment_settings,
      storeAccount?.special_instructions,
      `${storeAccount?.ai_store_instructions || ''} ${storeAccount?.ai_business_description || ''}`
    )
    let amount = order.total || 0

    if (payment_type === 'delivery_advance') {
      amount = resolvedSettings.cod_advance_amount ?? order.delivery_charge ?? 150
    }

    // 6. Insert payment request
    const { data: newPaymentRequest, error: insertErr } = await admin
      .from('payment_requests')
      .insert({
        order_id: order.id,
        account_id: effectiveAccountId,
        amount,
        payment_method,
        payment_type: payment_type === 'delivery_advance' ? 'delivery_advance' : 'full',
        sender_number: cleanSender,
        trx_id: cleanTrxId,
        notes: notes ? sanitizeText(notes) : null,
        status: 'submitted',
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[POST /api/pay/[orderId]] Insert error:', insertErr)
      return NextResponse.json(
        { error: insertErr.message || 'Failed to submit payment request' },
        { status: 500 }
      )
    }

    // 7. Update order status
    await admin
      .from('orders')
      .update({
        account_id: effectiveAccountId,
        payment_status: 'payment_submitted',
        payment_method: payment_method,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    return NextResponse.json({
      success: true,
      message: 'Payment details submitted successfully! The merchant will verify shortly.',
      payment_request: newPaymentRequest,
    })
  } catch (err: any) {
    console.error('[POST /api/pay/[orderId]] Error:', err)
    return NextResponse.json(
      { error: err?.message || 'Failed to submit payment request' },
      { status: 500 }
    )
  }
}
