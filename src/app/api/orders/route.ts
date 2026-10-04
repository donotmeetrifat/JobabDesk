import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const url = new URL(req.url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const paymentStatus = url.searchParams.get('payment_status')?.trim() ?? ''
    const page = parseInt(url.searchParams.get('page') ?? '1', 10)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
    const offset = (page - 1) * limit

    let query = supabase
      .from('orders')
      .select('*, order_items(*), contact:contacts(id, name, phone)', { count: 'exact' })
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (paymentStatus && paymentStatus !== 'all') {
      query = query.eq('payment_status', paymentStatus)
    }
    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,order_number.ilike.%${search}%`
      )
    }

    query = query.range(offset, offset + limit - 1)

    const { data: orders, error, count } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch stats for all orders in account
    const { data: statsData } = await supabase
      .from('orders')
      .select('status, total, payment_status')
      .eq('account_id', accountId)

    const allOrders = statsData ?? []
    const stats = {
      new: allOrders.filter(o => o.status === 'new').length,
      processing: allOrders.filter(o => o.status === 'processing').length,
      delivered: allOrders.filter(o => o.status === 'delivered').length,
      cancelled: allOrders.filter(o => o.status === 'cancelled').length,
      totalRevenue: allOrders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    }

    return NextResponse.json({
      orders: orders ?? [],
      total: count ?? 0,
      page,
      limit,
      stats,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const body = await req.json()

    const customerName = body.customer_name?.trim()
    if (!customerName) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    const items = body.items ?? []
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one order item is required' }, { status: 400 })
    }

    // Compute subtotal and total
    let subtotal = 0
    const processedItems = items.map((item: {
      product_id?: string
      product_name: string
      product_sku?: string
      unit_price: number
      quantity: number
    }) => {
      const price = Math.max(0, Number(item.unit_price) || 0)
      const qty = Math.max(1, Number(item.quantity) || 1)
      const itemTotal = price * qty
      subtotal += itemTotal
      return {
        product_id: item.product_id || null,
        product_name: item.product_name?.trim() || 'Product',
        product_sku: item.product_sku?.trim() || null,
        unit_price: price,
        quantity: qty,
        total: itemTotal,
      }
    })

    const discount = Math.max(0, Number(body.discount) || 0)
    const deliveryCharge = Math.max(0, Number(body.delivery_charge) || 0)
    const total = Math.max(0, subtotal - discount + deliveryCharge)

    // Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        account_id: accountId,
        contact_id: body.contact_id || null,
        customer_name: customerName,
        customer_phone: body.customer_phone?.trim() || null,
        customer_address: body.customer_address?.trim() || null,
        status: body.status || 'new',
        payment_method: body.payment_method || 'cod',
        payment_status: body.payment_status || 'unpaid',
        payment_reference: body.payment_reference?.trim() || null,
        subtotal,
        discount,
        delivery_charge: deliveryCharge,
        total,
        notes: body.notes?.trim() || null,
        source: body.source || 'manual',
      })
      .select('*, contact:contacts(id, name, phone)')
      .single()

    if (orderErr || !order) {
      return NextResponse.json({ error: orderErr?.message ?? 'Failed to create order' }, { status: 500 })
    }

    // Insert order items
    const itemsToInsert = processedItems.map(i => ({
      order_id: order.id,
      ...i,
    }))

    const { data: insertedItems, error: itemsErr } = await supabase
      .from('order_items')
      .insert(itemsToInsert)
      .select()

    if (itemsErr) {
      // Rollback order
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: itemsErr.message }, { status: 500 })
    }

    return NextResponse.json(
      {
        order: {
          ...order,
          order_items: insertedItems ?? [],
        },
      },
      { status: 201 }
    )
  } catch (err) {
    return toErrorResponse(err)
  }
}
