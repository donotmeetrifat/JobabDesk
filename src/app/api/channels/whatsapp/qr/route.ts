import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getWhatsAppStatus, generateWhatsAppQR, confirmWhatsAppPairing } from '@/lib/whatsapp/qr-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const session = await getWhatsAppStatus(accountId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const body = await req.json().catch(() => ({}))

    if (body.action === 'confirm') {
      const session = await confirmWhatsAppPairing(accountId, body.phoneNumber, supabase)
      return NextResponse.json(session)
    }

    const session = await generateWhatsAppQR(accountId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}
