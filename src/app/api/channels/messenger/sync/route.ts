import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { syncFacebookMessengerConversations } from '@/lib/messenger/sync-conversations'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const result = await syncFacebookMessengerConversations(accountId, undefined, undefined, supabase)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const result = await syncFacebookMessengerConversations(accountId, undefined, undefined, supabase)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
