import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { fetchWhapiSessionStatus, fetchWhapiQRCode } from '@/lib/whatsapp/whapi-gateway'
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
    const { accountId, supabase } = await requireRole('agent')
    const status = await fetchWhapiSessionStatus(accountId, undefined, supabase)
    return NextResponse.json(status)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const body = await req.json().catch(() => ({}))

    const session = await fetchWhapiQRCode(
      accountId,
      {
        apiKey: body.apiKey,
        instanceId: body.instanceId,
        provider: body.provider || 'whapi',
      },
      supabase
    )
    return NextResponse.json(session)
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
      whatsapp_session_status: 'disconnected',
      whatsapp_qr_code: '',
      whatsapp_connected_number: '',
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

    return NextResponse.json({ status: 'disconnected', qrCode: '', connectedNumber: '' })
  } catch (err) {
    return toErrorResponse(err)
  }
}
