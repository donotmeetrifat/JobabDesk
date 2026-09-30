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
    const { accountId, userId } = await requireRole('agent')
    const targetId = accountId || userId
    const db = getAdminClient()

    let account = null

    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('whatsapp_phone_number_id, whatsapp_access_token, whatsapp_waba_id, whatsapp_status, whatsapp_session_status')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      account = data
    }

    if (!account) {
      const { data } = await db
        .from('accounts')
        .select('whatsapp_phone_number_id, whatsapp_access_token, whatsapp_waba_id, whatsapp_status, whatsapp_session_status')
        .limit(1)
        .maybeSingle()
      account = data
    }

    const hasCredentials = Boolean(
      (account?.whatsapp_phone_number_id?.trim() && account?.whatsapp_access_token?.trim()) ||
      account?.whatsapp_status === 'connected' ||
      account?.whatsapp_session_status === 'connected'
    )

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID || process.env.META_CONFIG_ID || ''

    return NextResponse.json({
      status: hasCredentials ? 'connected' : 'disconnected',
      phoneNumberId: account?.whatsapp_phone_number_id || '',
      accessToken: account?.whatsapp_access_token || '',
      wabaId: account?.whatsapp_waba_id || '',
      appId,
      configId,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireRole('agent')
    const targetId = accountId || userId
    const body = await req.json().catch(() => ({}))
    const db = getAdminClient()

    const phoneNumberId = body.phoneNumberId?.trim() || ''
    const accessToken = body.accessToken?.trim() || ''
    const wabaId = body.wabaId?.trim() || ''

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Phone Number ID and Permanent Access Token are required.' },
        { status: 400 }
      )
    }

    const updates = {
      whatsapp_phone_number_id: phoneNumberId,
      whatsapp_access_token: accessToken,
      whatsapp_waba_id: wabaId,
      whatsapp_session_status: 'connected',
      whatsapp_status: 'connected',
      whatsapp_connection_type: 'meta_cloud',
    }

    let targetAccountId = ''
    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('id')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      targetAccountId = data?.id || ''
    }

    if (!targetAccountId) {
      const { data: first } = await db.from('accounts').select('id').limit(1).maybeSingle()
      targetAccountId = first?.id || ''
    }

    if (targetAccountId) {
      await db.from('accounts').update(updates).eq('id', targetAccountId)
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
    const { accountId, userId } = await requireRole('agent')
    const targetId = accountId || userId
    const db = getAdminClient()

    const updates = {
      whatsapp_phone_number_id: '',
      whatsapp_access_token: '',
      whatsapp_waba_id: '',
      whatsapp_session_status: 'disconnected',
      whatsapp_status: 'disconnected',
    }

    let targetAccountId = ''
    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('id')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      targetAccountId = data?.id || ''
    }

    if (!targetAccountId) {
      const { data: first } = await db.from('accounts').select('id').limit(1).maybeSingle()
      targetAccountId = first?.id || ''
    }

    if (targetAccountId) {
      await db.from('accounts').update(updates).eq('id', targetAccountId)
    }

    return NextResponse.json({ status: 'disconnected' })
  } catch (err) {
    return toErrorResponse(err)
  }
}
