import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { sendOrderStatusNotification } from '@/lib/orders/order-notifications'
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

export async function POST(req: Request) {
  try {
    const { userId, supabase, accountId } = await requireRole('agent')
    const body = await req.json()
    const { payment_request_id, action, rejection_reason } = body

    if (!payment_request_id) {
      return NextResponse.json({ error: 'payment_request_id is required' }, { status: 400 })
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: "action must be either 'approve' or 'reject'" },
        { status: 400 }
      )
    }

    const admin = getAdminClient()
    const db = admin || supabase

    // 1. Fetch payment request
    const { data: paymentRequest, error: prErr } = await db
      .from('payment_requests')
      .select('*')
      .eq('id', payment_request_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (prErr || !paymentRequest) {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 })
    }

    // 2. Fetch order
    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('*, order_items(*), contact:contacts(id, name, phone)')
      .eq('id', paymentRequest.order_id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Associated order not found' }, { status: 404 })
    }

    if (action === 'approve') {
      // Update payment_request to verified
      const { data: updatedPr, error: updatePrErr } = await db
        .from('payment_requests')
        .update({
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: userId,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment_request_id)
        .select()
        .single()

      if (updatePrErr) {
        return NextResponse.json({ error: updatePrErr.message }, { status: 500 })
      }

      // Update order to paid & confirmed
      const { data: updatedOrder, error: updateOrderErr } = await db
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .select('*, order_items(*), contact:contacts(id, name, phone)')
        .single()

      if (updateOrderErr) {
        return NextResponse.json({ error: updateOrderErr.message }, { status: 500 })
      }

      // Trigger automatic customer notification via WhatsApp / Messenger
      try {
        await sendOrderStatusNotification({
          order: updatedOrder,
          newStatus: 'confirmed',
          supabase,
          accountId,
        })
      } catch (notifyErr) {
        console.warn('[POST /api/pay/verify] Order confirmation notification warning:', notifyErr)
      }

      return NextResponse.json({
        success: true,
        message: 'Payment verified and order confirmed successfully!',
        order: updatedOrder,
        payment_request: updatedPr,
      })
    } else {
      // Reject action
      const { data: updatedPr, error: updatePrErr } = await db
        .from('payment_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejection_reason?.trim() || 'Payment details could not be verified.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment_request_id)
        .select()
        .single()

      if (updatePrErr) {
        return NextResponse.json({ error: updatePrErr.message }, { status: 500 })
      }

      // Revert order payment_status to unpaid
      const { data: updatedOrder, error: updateOrderErr } = await db
        .from('orders')
        .update({
          payment_status: 'unpaid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .select('*, order_items(*), contact:contacts(id, name, phone)')
        .single()

      if (updateOrderErr) {
        return NextResponse.json({ error: updateOrderErr.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Payment request marked as rejected.',
        order: updatedOrder,
        payment_request: updatedPr,
      })
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
