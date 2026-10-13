import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  resolveMerchantPaymentSettings,
  parsePaymentInstructions,
} from '@/lib/payments/instruction-parser'
import { maskSecret, isMaskedValue } from '@/lib/security/masking'
import { logSecurityAudit } from '@/lib/security/audit'

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
    const { supabase, accountId, role } = await requireRole('agent')
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

    const isOwner = role === 'owner'
    const sanitizedAccount = { ...(account || {}) }

    // Mask sensitive Meta tokens unless accessed by owner
    if (!isOwner) {
      if (sanitizedAccount.whatsapp_access_token) {
        sanitizedAccount.whatsapp_access_token = maskSecret(sanitizedAccount.whatsapp_access_token)
      }
      if (sanitizedAccount.facebook_page_access_token) {
        sanitizedAccount.facebook_page_access_token = maskSecret(sanitizedAccount.facebook_page_access_token)
      }
    }

    return NextResponse.json({
      settings: sanitizedAccount,
      ...sanitizedAccount,
      is_masked: !isOwner,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    // Modifying operational and channel configuration requires admin or owner
    const { supabase, accountId, userId } = await requireRole('admin')
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
      'courier_settings',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        // Do not overwrite real tokens with masked strings
        if (
          (key === 'whatsapp_access_token' || key === 'facebook_page_access_token') &&
          isMaskedValue(body[key])
        ) {
          continue
        }
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
      const textToParse = [
        body.special_instructions,
        body.ai_store_instructions,
        body.ai_business_description,
      ]
        .filter(Boolean)
        .join('\n')

      const parsed = parsePaymentInstructions(textToParse)

      const { data: currentAcc } = await db
        .from('accounts')
        .select('payment_settings')
        .eq('id', accountId)
        .maybeSingle()

      const currentPs = currentAcc?.payment_settings || {}

      const updatedPs = {
        ...currentPs,
        bkash: {
          number: parsed.bkash?.number || currentPs.bkash?.number || '',
          type: parsed.bkash?.type || currentPs.bkash?.type || 'personal',
        },
        nagad: {
          number: parsed.nagad?.number || currentPs.nagad?.number || '',
          type: parsed.nagad?.type || currentPs.nagad?.type || 'personal',
        },
        rocket: {
          number: parsed.rocket?.number || currentPs.rocket?.number || '',
          type: parsed.rocket?.type || currentPs.rocket?.type || 'personal',
        },
        bank: {
          details: parsed.bank?.details || currentPs.bank?.details || '',
        },
        allow_cod_advance: currentPs.allow_cod_advance ?? true,
        cod_advance_amount: currentPs.cod_advance_amount ?? 150,
      }
      updates['payment_settings'] = updatedPs
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true })
    }

    // Try update with adminClient
    const { data, error } = await db
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .select()
      .maybeSingle()

    if (error) {
      console.warn('[PATCH /api/ai/settings] Full update warning:', error.message)
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
      await logSecurityAudit({
        supabase: db,
        accountId,
        actorUserId: userId,
        action: 'settings_updated',
        resourceType: 'settings',
        details: { updated_fields: Object.keys(safeUpdates) },
      })
      return NextResponse.json({ settings: safeUpdates, ...safeUpdates })
    }

    // Log security audit event
    await logSecurityAudit({
      supabase: db,
      accountId,
      actorUserId: userId,
      action: 'settings_updated',
      resourceType: 'settings',
      details: { updated_fields: Object.keys(updates) },
    })

    return NextResponse.json({ settings: data || {}, ...data })
  } catch (err) {
    console.error('[PATCH /api/ai/settings] Error:', err)
    return toErrorResponse(err)
  }
}
