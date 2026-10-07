import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { syncFacebookMessengerConversations } from '@/lib/messenger/sync-conversations'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


// In-flight mutex to prevent duplicate stacked sync runs for the same account
const inFlightSyncs = new Map<string, Promise<any>>()

export async function POST(req: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const body = await req.json().catch(() => ({}))
    const explicitPageId = body.pageId || body.facebook_page_id
    const explicitPageToken = body.accessToken || body.pageToken || body.facebook_page_access_token
    const purgeExisting = Boolean(body.purgeExisting || body.purgeFirst || body.clean)
    const limit = typeof body.limit === 'number' ? body.limit : 25

    // If a sync is already running for this targetId, return early or wait
    if (inFlightSyncs.has(targetId)) {
      if (body.waitForCurrent) {
        const result = await inFlightSyncs.get(targetId)
        return NextResponse.json(result)
      }
      return NextResponse.json({
        success: true,
        inProgress: true,
        message: 'A chat sync is already in progress for this account.',
        conversationsCount: 0,
        messagesCount: 0,
      })
    }

    const syncPromise = syncFacebookMessengerConversations(
      targetId,
      explicitPageId,
      explicitPageToken,
      supabase,
      userId,
      purgeExisting,
      limit
    ).finally(() => {
      inFlightSyncs.delete(targetId)
    })

    inFlightSyncs.set(targetId, syncPromise)
    const result = await syncPromise
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
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 25

    if (inFlightSyncs.has(targetId)) {
      return NextResponse.json({
        success: true,
        inProgress: true,
        message: 'A chat sync is already in progress for this account.',
        conversationsCount: 0,
        messagesCount: 0,
      })
    }

    const syncPromise = syncFacebookMessengerConversations(
      targetId,
      explicitPageId,
      explicitPageToken,
      supabase,
      userId,
      purgeExisting,
      limit
    ).finally(() => {
      inFlightSyncs.delete(targetId)
    })

    inFlightSyncs.set(targetId, syncPromise)
    const result = await syncPromise
    return NextResponse.json(result)
  } catch (err) {
    return toErrorResponse(err)
  }
}
