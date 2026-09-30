import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { disconnectWhatsApp } from '@/lib/whatsapp/qr-engine'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const session = await disconnectWhatsApp(accountId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}
