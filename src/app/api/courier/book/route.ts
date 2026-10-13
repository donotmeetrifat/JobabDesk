import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { bookCourierParcel } from '@/lib/courier/dispatcher'
import { sendOrderStatusNotification } from '@/lib/orders/order-notifications'
import type { CourierProvider, CourierSettings, Order } from '@/types/orders'

export const dynamic = 'force-dynamic'

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

export async function POST(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    const body = await req.json()
    const {
      orderId,
      provider = 'manual',
      manualCourierName,
      manualTrackingCode,
      manualTrackingUrl,
    } = body

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // 1. Fetch order
    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('*, order_items(*), contact:contacts(*)')
      .eq('id', orderId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found or access denied' }, { status: 404 })
    }

    // 2. Fetch account courier settings
    const { data: account } = await db
      .from('accounts')
      .select('courier_settings')
      .eq('id', accountId)
      .maybeSingle()

    const courierSettings = (account?.courier_settings as CourierSettings) || null

    // 3. Dispatch booking
    const result = await bookCourierParcel({
      order: order as Order,
      provider: provider as CourierProvider,
      courierSettings,
      manualDetails: {
        courierName: manualCourierName || '',
        trackingCode: manualTrackingCode || '',
        trackingUrl: manualTrackingUrl || '',
      },
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to book parcel with courier' },
        { status: 400 }
      )
    }

    // 4. Update order with tracking and mark as shipped
    const { data: updatedOrder, error: updateErr } = await db
      .from('orders')
      .update({
        courier_name: result.courier_name,
        tracking_code: result.tracking_code,
        tracking_url: result.tracking_url,
        courier_consignment_id: result.courier_consignment_id,
        courier_booking_status: result.courier_booking_status,
        status: 'shipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('account_id', accountId)
      .select('*, order_items(*), contact:contacts(*)')
      .single()

    if (updateErr || !updatedOrder) {
      return NextResponse.json(
        { error: updateErr?.message || 'Failed to update order tracking details' },
        { status: 500 }
      )
    }

    // 5. Automatically notify customer via chat
    try {
      await sendOrderStatusNotification({
        order: updatedOrder,
        newStatus: 'shipped',
        supabase,
        accountId,
        courierName: result.courier_name,
        trackingCode: result.tracking_code,
        trackingUrl: result.tracking_url || undefined,
      })
    } catch (notifyErr) {
      console.warn('[POST /api/courier/book] Customer notification warning:', notifyErr)
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      booking: result,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
