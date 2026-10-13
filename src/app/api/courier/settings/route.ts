import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { CourierSettings } from '@/types/orders'

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
    const { supabase, accountId } = await requireRole('agent')
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
    const settings: CourierSettings = {
      default_provider: raw.default_provider || 'manual',
      steadfast: {
        enabled: Boolean(raw.steadfast?.enabled),
        api_key: raw.steadfast?.api_key || '',
        secret_key: raw.steadfast?.secret_key || '',
      },
      pathao: {
        enabled: Boolean(raw.pathao?.enabled),
        client_id: raw.pathao?.client_id || '',
        client_secret: raw.pathao?.client_secret || '',
        username: raw.pathao?.username || '',
        password: raw.pathao?.password || '',
        store_id: raw.pathao?.store_id || '',
      },
    }

    const hasSteadfast = Boolean(settings.steadfast.api_key && settings.steadfast.secret_key)
    const hasPathao = Boolean(
      settings.pathao.client_id &&
        settings.pathao.client_secret &&
        settings.pathao.username &&
        settings.pathao.password &&
        settings.pathao.store_id
    )

    return NextResponse.json({
      settings,
      has_steadfast: hasSteadfast,
      has_pathao: hasPathao,
    })
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

    // 1. Fetch current settings to preserve values if partial updates are sent
    const { data: currentAcc } = await db
      .from('accounts')
      .select('courier_settings')
      .eq('id', accountId)
      .maybeSingle()

    const existing: CourierSettings = {
      ...DEFAULT_COURIER_SETTINGS,
      ...((currentAcc?.courier_settings as CourierSettings) || {}),
    }

    const nextSettings: CourierSettings = {
      default_provider: body.default_provider || existing.default_provider || 'manual',
      steadfast: {
        enabled:
          body.steadfast?.enabled !== undefined
            ? Boolean(body.steadfast.enabled)
            : existing.steadfast.enabled,
        api_key:
          body.steadfast?.api_key !== undefined
            ? String(body.steadfast.api_key).trim()
            : existing.steadfast.api_key,
        secret_key:
          body.steadfast?.secret_key !== undefined
            ? String(body.steadfast.secret_key).trim()
            : existing.steadfast.secret_key,
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
        client_secret:
          body.pathao?.client_secret !== undefined
            ? String(body.pathao.client_secret).trim()
            : existing.pathao.client_secret,
        username:
          body.pathao?.username !== undefined
            ? String(body.pathao.username).trim()
            : existing.pathao.username,
        password:
          body.pathao?.password !== undefined
            ? String(body.pathao.password).trim()
            : existing.pathao.password,
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

    return NextResponse.json({
      success: true,
      settings: nextSettings,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
