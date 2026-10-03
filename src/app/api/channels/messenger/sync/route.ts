import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { syncFacebookMessengerConversations } from '@/lib/messenger/sync-conversations'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const body = await req.json().catch(() => ({}))
    const explicitPageId = body.pageId || body.facebook_page_id
    const explicitPageToken = body.accessToken || body.pageToken || body.facebook_page_access_token
    const purgeExisting = Boolean(body.purgeExisting || body.purgeFirst || body.clean)
    const result = await syncFacebookMessengerConversations(targetId, explicitPageId, explicitPageToken, supabase, userId, purgeExisting)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function GET(req: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const url = new URL(req.url)
    const explicitPageId = url.searchParams.get('pageId') || undefined
    const explicitPageToken = url.searchParams.get('accessToken') || undefined
    const purgeExisting = url.searchParams.get('purge') === 'true' || url.searchParams.get('clean') === 'true'
    const result = await syncFacebookMessengerConversations(targetId, explicitPageId, explicitPageToken, supabase, userId, purgeExisting)
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
