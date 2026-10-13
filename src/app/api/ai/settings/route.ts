import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { resolveMerchantPaymentSettings } from '@/lib/payments/instruction-parser'

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

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    const { data: account, error } = await db
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[GET /api/ai/settings] Error:', error.message)
      return NextResponse.json({ settings: {} })
    }

    return NextResponse.json({ settings: account || {}, ...account })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase
    const body = await req.json()

    const allowedFields = [
      'name',
      'business_tagline',
      'product_categories_sold',
      'target_audience',
      'customer_relation_style',
      'ai_auto_reply_enabled',
      'whatsapp_auto_reply_enabled',
      'messenger_auto_reply_enabled',
      'ai_primary_language',
      'ai_business_description',
      'ai_delivery_policy',
      'ai_return_policy',
      'ai_auto_reply_tone',
      'ai_store_instructions',
      'delivery_policy',
      'return_policy',
      'special_instructions',
      'ai_persona',
      'simulated_persona_preview',
      'whatsapp_phone_number_id',
      'whatsapp_waba_id',
      'whatsapp_access_token',
      'whatsapp_status',
      'facebook_page_id',
      'facebook_page_name',
      'facebook_page_access_token',
      'messenger_status',
      'playground_chat_history',
      'payment_settings',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    // If merchant updated special_instructions (Accepted Payment Channels in /agents)
    // without explicitly overriding payment_settings, auto-sync parsed numbers!
    if (
      body.payment_settings === undefined &&
      (body.special_instructions !== undefined ||
        body.ai_store_instructions !== undefined ||
        body.ai_business_description !== undefined)
    ) {
      const { data: currentAcc } = await db
        .from('accounts')
        .select('payment_settings, special_instructions, ai_store_instructions, ai_business_description')
        .eq('id', accountId)
        .maybeSingle()

      const targetSpecial =
        body.special_instructions !== undefined
          ? body.special_instructions
          : currentAcc?.special_instructions || ''
      const targetExtra = `${body.ai_store_instructions !== undefined ? body.ai_store_instructions : currentAcc?.ai_store_instructions || ''} ${body.ai_business_description !== undefined ? body.ai_business_description : currentAcc?.ai_business_description || ''}`

      const resolved = resolveMerchantPaymentSettings(
        currentAcc?.payment_settings,
        targetSpecial,
        targetExtra
      )
      updates['payment_settings'] = resolved
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true })
    }

    // Try full update first with adminClient
    const { data, error } = await db
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .select()
      .maybeSingle()

    if (error) {
      console.warn('[PATCH /api/ai/settings] Full update warning:', error.message)
      // Retry by filtering fields one by one if column missing in Supabase
      const safeUpdates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(updates)) {
        const { error: singleErr } = await db
          .from('accounts')
          .update({ [k]: v })
          .eq('id', accountId)
        if (!singleErr) {
          safeUpdates[k] = v
        }
      }
      return NextResponse.json({ settings: safeUpdates, ...safeUpdates })
    }

    return NextResponse.json({ settings: data || {}, ...data })
  } catch (err) {
    console.error('[PATCH /api/ai/settings] Error:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
