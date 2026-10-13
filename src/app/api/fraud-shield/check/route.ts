import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { assessCustomerRisk } from '@/lib/fraud-shield/checker'
import type { CourierSettings } from '@/types/orders'

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

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    const { searchParams } = new URL(req.url)
    const phone = searchParams.get('phone') || ''
    const orderId = searchParams.get('orderId')

    if (!phone.trim()) {
      return NextResponse.json({ error: 'Phone number parameter is required' }, { status: 400 })
    }

    // 1. Fetch store courier settings to check if Steadfast credentials exist
    const { data: account } = await db
      .from('accounts')
      .select('courier_settings')
      .eq('id', accountId)
      .maybeSingle()

    const courierSettings = (account?.courier_settings as CourierSettings) || null
    const steadfastSettings = courierSettings?.steadfast || null

    // 2. Assess customer risk
    const assessment = await assessCustomerRisk({
      phone,
      accountId,
      supabase: db,
      steadfastSettings,
      currentOrderId: orderId,
    })

    // 3. If an orderId was supplied, persist the risk findings on the order
    if (orderId) {
      await db
        .from('orders')
        .update({
          risk_level: assessment.risk_level,
          delivery_ratio: assessment.delivery_ratio,
          risk_details: {
            total_parcels: assessment.total_parcels,
            delivered_parcels: assessment.delivered_parcels,
            cancelled_parcels: assessment.cancelled_parcels,
            delivery_ratio: assessment.delivery_ratio,
            source: assessment.source,
            is_blacklisted: assessment.is_blacklisted,
            blacklist_reason: assessment.blacklist_reason || null,
            reasons: assessment.reasons,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .eq('account_id', accountId)
    }

    return NextResponse.json({
      success: true,
      assessment,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
