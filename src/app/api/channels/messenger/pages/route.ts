import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { accountId } = await requireRole('agent')
    const { userAccessToken, code } = await req.json().catch(() => ({}))

    let token = userAccessToken

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const appSecret = process.env.META_APP_SECRET || ''

    // If OAuth authorization code provided, exchange for user access token
    if (code && appId && appSecret) {
      try {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent('https://jobabdesk.vercel.app/api/channels/messenger/pages')}`
        )
        const tokenData = await tokenRes.json()
        if (tokenData.access_token) {
          token = tokenData.access_token
        }
      } catch {
        // fallback
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'User Access Token or Code is required' }, { status: 400 })
    }

    // Fetch user's managed Facebook Pages from Meta Graph API
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,category,picture&access_token=${encodeURIComponent(token)}`
    )
    const pagesData = await pagesRes.json()

    if (!pagesRes.ok) {
      return NextResponse.json({ error: pagesData?.error?.message || 'Failed to fetch Facebook Pages' }, { status: 400 })
    }

    const pages = (pagesData.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      category: p.category || 'Business Page',
      picture: p.picture?.data?.url || '',
    }))

    return NextResponse.json({ success: true, pages })
  } catch (err) {
    return toErrorResponse(err)
  }
}
