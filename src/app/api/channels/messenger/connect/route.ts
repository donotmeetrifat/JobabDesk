import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getMessengerStatus, connectFacebookPage, disconnectFacebookPage } from '@/lib/messenger/meta-oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const session = await getMessengerStatus(accountId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const body = await req.json().catch(() => ({}))

    if (body.action === 'disconnect') {
      const session = await disconnectFacebookPage(accountId, supabase)
      return NextResponse.json(session)
    }

    const pageData = body.pageData || {
      pageId: body.pageId,
      pageName: body.pageName,
      accessToken: body.accessToken || body.pageAccessToken,
    }

    const session = await connectFacebookPage(accountId, pageData, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}
