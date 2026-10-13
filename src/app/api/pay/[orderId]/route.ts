import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

async function findOrder(admin: ReturnType<typeof getAdminClient>, orderId: string) {
  const isUuid = UUID_REGEX.test(orderId)
  let query = admin
    .from('orders')
    .select(
      'id, order_number, customer_name, customer_phone, customer_address, delivery_charge, subtotal, discount, total, status, payment_status, payment_method, notes, created_at, account_id, order_items(id, product_name, product_sku, unit_price, quantity, total)'
    )

  if (isUuid) {
    query = query.eq('id', orderId)
  } else {
    query = query.eq('order_number', orderId.trim())
  }

  const { data, error } = await query.maybeSingle()
  if (error || !data) return null
  return data
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

    // Fetch store branding and payment settings
    const { data: storeAccount } = await admin
      .from('accounts')
      .select('id, name, logo_url, business_tagline, payment_settings')
      .eq('id', order.account_id)
      .maybeSingle()

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
        payment_settings: storeAccount?.payment_settings || {
          bkash: { number: '', type: 'personal' },
          nagad: { number: '', type: 'personal' },
          rocket: { number: '', type: 'personal' },
          bank: { details: '' },
          allow_cod_advance: true,
          cod_advance_amount: 150,
        },
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

    // 2. Sender number validation
    if (!sender_number || typeof sender_number !== 'string' || sender_number.trim().length < 6) {
      return NextResponse.json(
        { error: 'Valid sender phone number or account is required' },
        { status: 400 }
      )
    }

    // 3. TrxID formatting and validation
    if (!trx_id || typeof trx_id !== 'string') {
      return NextResponse.json(
        { error: 'Transaction ID (TrxID) is required' },
        { status: 400 }
      )
    }

    const cleanTrxId = trx_id.trim().toUpperCase()
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

    // 4. Anti-Fraud & Anti-Duplicate Shield
    const { data: existingTrx } = await admin
      .from('payment_requests')
      .select('id, order_id, status')
      .eq('account_id', order.account_id)
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
    const { data: storeAccount } = await admin
      .from('accounts')
      .select('payment_settings')
      .eq('id', order.account_id)
      .maybeSingle()

    const settings = storeAccount?.payment_settings || {}
    let amount = order.total || 0

    if (payment_type === 'delivery_advance') {
      amount = settings.cod_advance_amount ?? order.delivery_charge ?? 150
    }

    // 6. Insert payment request
    const { data: newPaymentRequest, error: insertErr } = await admin
      .from('payment_requests')
      .insert({
        order_id: order.id,
        account_id: order.account_id,
        amount,
        payment_method,
        payment_type: payment_type === 'delivery_advance' ? 'delivery_advance' : 'full',
        sender_number: sender_number.trim(),
        trx_id: cleanTrxId,
        notes: notes?.trim() || null,
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
