import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { CourierSettings } from '@/types/orders'
import { maskSecret, isMaskedValue } from '@/lib/security/masking'
import { logSecurityAudit } from '@/lib/security/audit'

export const dynamic = 'force-dynamic'

const DEFAULT_COURIER_SETTINGS: CourierSettings = {
  default_provider: 'manual',
  steadfast: { enabled: false, api_key: '', secret_key: '' },
  pathao: {
    enabled: false,
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    store_id: '',
  },
}

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
      .select('courier_settings')
      .eq('id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[GET /api/courier/settings] Error:', error.message)
      return NextResponse.json({ settings: DEFAULT_COURIER_SETTINGS })
    }

    const raw = (account?.courier_settings as CourierSettings) || {}
    const hasSteadfast = Boolean(raw.steadfast?.api_key && raw.steadfast?.secret_key)
    const hasPathao = Boolean(
      raw.pathao?.client_id &&
        raw.pathao?.client_secret &&
        raw.pathao?.username &&
        raw.pathao?.password &&
        raw.pathao?.store_id
    )

    const isOwner = role === 'owner'

    // Mask sensitive tokens unless accessed by owner
    const settings: CourierSettings = {
      default_provider: raw.default_provider || 'manual',
      steadfast: {
        enabled: Boolean(raw.steadfast?.enabled),
        api_key: isOwner ? (raw.steadfast?.api_key || '') : maskSecret(raw.steadfast?.api_key),
        secret_key: isOwner ? (raw.steadfast?.secret_key || '') : maskSecret(raw.steadfast?.secret_key),
      },
      pathao: {
        enabled: Boolean(raw.pathao?.enabled),
        client_id: raw.pathao?.client_id || '',
        client_secret: isOwner ? (raw.pathao?.client_secret || '') : maskSecret(raw.pathao?.client_secret),
        username: raw.pathao?.username || '',
        password: isOwner ? (raw.pathao?.password || '') : maskSecret(raw.pathao?.password),
        store_id: raw.pathao?.store_id || '',
      },
    }

    return NextResponse.json({
      settings,
      has_steadfast: hasSteadfast,
      has_pathao: hasPathao,
      is_masked: !isOwner,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    // Only admin and owner can modify API credentials and settings
    const { supabase, accountId, userId } = await requireRole('admin')
    const admin = getAdminClient()
    const db = admin || supabase
    const body = await req.json()

    // 1. Fetch current settings to preserve values if partial updates or masked values are sent
    const { data: currentAcc } = await db
      .from('accounts')
      .select('courier_settings')
      .eq('id', accountId)
      .maybeSingle()

    const existing: CourierSettings = {
      ...DEFAULT_COURIER_SETTINGS,
      ...((currentAcc?.courier_settings as CourierSettings) || {}),
    }

    // Preserve existing real secrets if masked values were submitted
    const resolveSecret = (incoming: unknown, previous: string | undefined): string => {
      if (incoming === undefined || incoming === null) return previous || ''
      const str = String(incoming).trim()
      if (isMaskedValue(str)) return previous || ''
      return str
    }

    const nextSettings: CourierSettings = {
      default_provider: body.default_provider || existing.default_provider || 'manual',
      steadfast: {
        enabled:
          body.steadfast?.enabled !== undefined
            ? Boolean(body.steadfast.enabled)
            : existing.steadfast.enabled,
        api_key: resolveSecret(body.steadfast?.api_key, existing.steadfast.api_key),
        secret_key: resolveSecret(body.steadfast?.secret_key, existing.steadfast.secret_key),
      },
      pathao: {
        enabled:
          body.pathao?.enabled !== undefined
            ? Boolean(body.pathao.enabled)
            : existing.pathao.enabled,
        client_id:
          body.pathao?.client_id !== undefined
            ? String(body.pathao.client_id).trim()
            : existing.pathao.client_id,
        client_secret: resolveSecret(body.pathao?.client_secret, existing.pathao.client_secret),
        username:
          body.pathao?.username !== undefined
            ? String(body.pathao.username).trim()
            : existing.pathao.username,
        password: resolveSecret(body.pathao?.password, existing.pathao.password),
        store_id:
          body.pathao?.store_id !== undefined
            ? String(body.pathao.store_id).trim()
            : existing.pathao.store_id,
      },
    }

    const { error: updateError } = await db
      .from('accounts')
      .update({
        courier_settings: nextSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)

    if (updateError) {
      console.error('[PATCH /api/courier/settings] Error:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Log security audit event
    await logSecurityAudit({
      supabase: db,
      accountId,
      actorUserId: userId,
      action: 'courier_settings_updated',
      resourceType: 'settings',
      details: {
        default_provider: nextSettings.default_provider,
        steadfast_enabled: nextSettings.steadfast.enabled,
        pathao_enabled: nextSettings.pathao.enabled,
      },
    })

    return NextResponse.json({
      success: true,
      settings: nextSettings,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
