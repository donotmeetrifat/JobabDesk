import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { normalizeBdPhone } from '@/lib/fraud-shield/phone'

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
    const phone = searchParams.get('phone')

    if (phone) {
      const cleanPhone = normalizeBdPhone(phone)
      const { data, error } = await db
        .from('customer_blacklists')
        .select('*')
        .eq('account_id', accountId)
        .eq('phone_normalized', cleanPhone)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        is_blacklisted: Boolean(data),
        entry: data || null,
      })
    }

    const { data: entries, error } = await db
      .from('customer_blacklists')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries: entries || [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    const body = await req.json()
    const { phone, reason = 'Chronic RTO / Fake Order' } = body

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const cleanPhone = normalizeBdPhone(phone)
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 })
    }

    // Upsert into customer_blacklists
    const { data: entry, error: insertError } = await db
      .from('customer_blacklists')
      .upsert(
        {
          account_id: accountId,
          phone: phone.trim(),
          phone_normalized: cleanPhone,
          reason: reason.trim(),
          created_by: userId || null,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,phone_normalized' }
      )
      .select('*')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Update orders from this phone to risk_level = 'blacklisted'
    await db
      .from('orders')
      .update({
        risk_level: 'blacklisted',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.eq.${phone}`)

    return NextResponse.json({
      success: true,
      entry,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    let phone = ''
    try {
      const body = await req.json()
      phone = body.phone || ''
    } catch {
      const { searchParams } = new URL(req.url)
      phone = searchParams.get('phone') || ''
    }

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const cleanPhone = normalizeBdPhone(phone)
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 })
    }

    const { error: deleteError } = await db
      .from('customer_blacklists')
      .delete()
      .eq('account_id', accountId)
      .eq('phone_normalized', cleanPhone)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Reset risk_level from 'blacklisted' to 'low' for orders from this phone
    await db
      .from('orders')
      .update({
        risk_level: 'low',
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('risk_level', 'blacklisted')
      .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.eq.${phone}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
