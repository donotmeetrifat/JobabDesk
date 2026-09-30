import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getMessengerStatus, connectFacebookPage, disconnectFacebookPage } from '@/lib/messenger/meta-oauth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const session = await getMessengerStatus(targetId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const body = await req.json().catch(() => ({}))

    if (body.action === 'disconnect') {
      const session = await disconnectFacebookPage(targetId, supabase)
      return NextResponse.json(session)
    }

    const pageData = body.pageData || {
      pageId: body.pageId || body.facebook_page_id,
      pageName: body.pageName || body.facebook_page_name,
      accessToken: body.accessToken || body.pageAccessToken || body.facebook_page_access_token,
    }

    const session = await connectFacebookPage(targetId, pageData, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function DELETE() {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const session = await disconnectFacebookPage(targetId, supabase)
    return NextResponse.json(session)
  } catch (err) {
    return toErrorResponse(err)
  }
}
