import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { fetchWhapiSessionStatus, fetchWhapiQRCode } from '@/lib/whatsapp/whapi-gateway'

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
