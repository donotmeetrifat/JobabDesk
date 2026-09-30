import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*), contact:contacts(id, name, phone)')
      .eq('id', id)
      .eq('account_id', accountId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params
    const body = await req.json()

    // Verify order exists
    const { data: existing, error: findErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .eq('account_id', accountId)
      .single()

    if (findErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}

    if (body.customer_name !== undefined) updates.customer_name = body.customer_name.trim()
    if (body.customer_phone !== undefined) updates.customer_phone = body.customer_phone?.trim() || null
    if (body.customer_address !== undefined) updates.customer_address = body.customer_address?.trim() || null
    if (body.contact_id !== undefined) updates.contact_id = body.contact_id || null
    if (body.status !== undefined) updates.status = body.status
    if (body.payment_method !== undefined) updates.payment_method = body.payment_method
    if (body.payment_status !== undefined) updates.payment_status = body.payment_status
    if (body.payment_reference !== undefined) updates.payment_reference = body.payment_reference?.trim() || null
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null
    if (body.source !== undefined) updates.source = body.source

    let subtotal = Number(existing.subtotal) || 0
    let discount = body.discount !== undefined ? Math.max(0, Number(body.discount) || 0) : (Number(existing.discount) || 0)
    let deliveryCharge = body.delivery_charge !== undefined ? Math.max(0, Number(body.delivery_charge) || 0) : (Number(existing.delivery_charge) || 0)

    if (body.discount !== undefined) updates.discount = discount
    if (body.delivery_charge !== undefined) updates.delivery_charge = deliveryCharge

    // If items were updated
    if (Array.isArray(body.items)) {
      subtotal = 0
      const processedItems = body.items.map((item: {
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
          order_id: id,
          product_id: item.product_id || null,
          product_name: item.product_name?.trim() || 'Product',
          product_sku: item.product_sku?.trim() || null,
          unit_price: price,
          quantity: qty,
          total: itemTotal,
        }
      })

      // Replace items
      await supabase.from('order_items').delete().eq('order_id', id)
      if (processedItems.length > 0) {
        await supabase.from('order_items').insert(processedItems)
      }

      updates.subtotal = subtotal
    }

    updates.total = Math.max(0, subtotal - discount + deliveryCharge)

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, order_items(*), contact:contacts(id, name, phone)')
      .single()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ order: updatedOrder })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
