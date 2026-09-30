import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId

    let account: any = null

    // 1. Try authenticated SSR client first using select('*')
    // select('*') is immune to missing column errors in Supabase schema cache
    if (supabase && targetId) {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', targetId)
        .maybeSingle()
      account = data
    }

    // 2. Fallback to admin client if service role key exists
    if (!account && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      const { data } = await db
        .from('accounts')
        .select('*')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      account = data
    }

    let phoneNumberId = (account?.whatsapp_phone_number_id || account?.phone_number_id || account?.whatsapp_connected_number || '').trim()
    let accessToken = (account?.whatsapp_access_token || '').trim()
    let wabaId = (account?.whatsapp_waba_id || '').trim()

    let hasCredentials = Boolean(
      (phoneNumberId && accessToken) ||
      account?.whatsapp_status === 'connected' ||
      account?.whatsapp_session_status === 'connected'
    )

    // 3. Multi-table check: whatsapp_config table (migration 001/017)
    if (!hasCredentials && supabase && targetId) {
      try {
        const { data: waCfg } = await supabase
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', targetId)
          .maybeSingle()

        if (waCfg && waCfg.phone_number_id) {
          hasCredentials = true
          phoneNumberId = phoneNumberId || waCfg.phone_number_id
          accessToken = accessToken || waCfg.access_token || ''
          wabaId = wabaId || waCfg.waba_id || ''
        }
      } catch {
        // whatsapp_config check is non-fatal
      }
    }

    // 4. Multi-table check: channel_connections table (migration 044)
    if (!hasCredentials && supabase && targetId) {
      try {
        const { data: chan } = await supabase
          .from('channel_connections')
          .select('*')
          .eq('account_id', targetId)
          .eq('channel_type', 'whatsapp')
          .eq('is_active', true)
          .maybeSingle()

        if (chan && chan.external_account_id) {
          hasCredentials = true
          phoneNumberId = phoneNumberId || chan.external_account_id
        }
      } catch {
        // channel_connections check is non-fatal
      }
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.META_CONFIG_ID || ''

    return NextResponse.json({
      status: hasCredentials ? 'connected' : 'disconnected',
      phoneNumberId,
      accessToken,
      wabaId,
      appId,
      configId,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const body = await req.json().catch(() => ({}))

    const phoneNumberId = body.phoneNumberId?.trim() || ''
    const accessToken = body.accessToken?.trim() || ''
    const wabaId = body.wabaId?.trim() || ''

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Phone Number ID and Permanent Access Token are required.' },
        { status: 400 }
      )
    }

    // Canonical guaranteed columns from migration 053
    const coreUpdates: Record<string, any> = {
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_access_token: accessToken,
      whatsapp_waba_id: wabaId,
      whatsapp_status: 'connected',
    }

    // 1. Update accounts table via authenticated SSR client
    if (supabase && targetId) {
      const { error: coreErr } = await supabase.from('accounts').update(coreUpdates).eq('id', targetId)
      if (coreErr) {
        console.warn('[POST /api/channels/whatsapp/meta core update error, retrying field-by-field]:', coreErr.message)
        for (const [k, v] of Object.entries(coreUpdates)) {
          await supabase.from('accounts').update({ [k]: v }).eq('id', targetId)
        }
      }

      // Try auxiliary columns optionally
      try {
        await supabase.from('accounts').update({
          whatsapp_session_status: 'connected',
          whatsapp_connection_type: 'meta_cloud',
          whatsapp_connected_number: phoneNumberId,
        }).eq('id', targetId)
      } catch {}
    }

    // 2. Also update via admin client if service role key is present
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      await db.from('accounts').update(coreUpdates).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      try {
        await db.from('accounts').update({
          whatsapp_session_status: 'connected',
          whatsapp_connection_type: 'meta_cloud',
          whatsapp_connected_number: phoneNumberId,
        }).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      } catch {}
    }

    // 3. Multi-table redundancy: Upsert into whatsapp_config table (migration 001/017)
    if (supabase && targetId) {
      try {
        await supabase.from('whatsapp_config').upsert(
          {
            account_id: targetId,
            user_id: userId,
            phone_number_id: phoneNumberId,
            access_token: accessToken,
            waba_id: wabaId,
            status: 'connected',
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' }
        )
      } catch (waCfgErr) {
        console.warn('[whatsapp_config upsert warning]:', waCfgErr)
      }
    }

    // 4. Multi-table redundancy: Upsert into channel_connections table (migration 044)
    if (supabase && targetId) {
      try {
        await supabase.from('channel_connections').upsert(
          {
            account_id: targetId,
            channel_type: 'whatsapp',
            external_account_id: phoneNumberId,
            display_name: 'WhatsApp Business',
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,channel_type,external_account_id' }
        )
      } catch {
        // channel_connections upsert is non-fatal
      }
    }

    return NextResponse.json({
      status: 'connected',
      phoneNumberId,
      accessToken,
      wabaId,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId

    const coreUpdates = {
      whatsapp_phone_number_id: '',
      whatsapp_access_token: '',
      whatsapp_waba_id: '',
      whatsapp_status: 'disconnected',
    }

    if (supabase && targetId) {
      await supabase.from('accounts').update(coreUpdates).eq('id', targetId)
      try {
        await supabase.from('accounts').update({
          whatsapp_session_status: 'disconnected',
          whatsapp_qr_code: '',
          whatsapp_connected_number: '',
        }).eq('id', targetId)
      } catch {}

      // Update whatsapp_config
      try {
        await supabase
          .from('whatsapp_config')
          .update({ status: 'disconnected' })
          .eq('account_id', targetId)
      } catch {}

      // Update channel_connections
      try {
        await supabase
          .from('channel_connections')
          .update({ is_active: false, disconnected_at: new Date().toISOString() })
          .eq('account_id', targetId)
          .eq('channel_type', 'whatsapp')
      } catch {}
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      await db.from('accounts').update(coreUpdates).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      try {
        await db.from('accounts').update({
          whatsapp_session_status: 'disconnected',
          whatsapp_qr_code: '',
          whatsapp_connected_number: '',
        }).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      } catch {}
    }

    return NextResponse.json({ status: 'disconnected' })
  } catch (err) {
    return toErrorResponse(err)
  }
}
