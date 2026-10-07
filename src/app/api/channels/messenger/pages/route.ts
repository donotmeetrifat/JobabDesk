import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error_description') || searchParams.get('error')

  if (error) {
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>Facebook Authentication</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #090d16; color: #fff;">
<div style="text-align: center; max-width: 440px; margin: 20px; padding: 32px; background: #111827; border-radius: 20px; border: 1px solid rgba(239, 68, 68, 0.2); box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
  <div style="width: 52px; height: 52px; margin: 0 auto 16px; background: rgba(239, 68, 68, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
  </div>
  <p style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #f87171;">Authentication Cancelled</p>
  <p style="font-size: 13px; color: #9ca3af; margin: 0 0 24px 0; line-height: 1.5;">${error || 'Facebook login was cancelled or encountered an error.'}</p>
  <a href="/agents" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 12px; font-size: 13px; font-weight: 600;">Return to JababDesk</a>
</div>
<script>
  var errorPayload = { type: 'FB_PAGE_CONNECT', event: 'CANCEL', error: ${JSON.stringify(error)} };
  try { if (window.opener) { window.opener.postMessage(errorPayload, '*'); } } catch (e) {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var bc = new BroadcastChannel('jobabdesk_fb_auth');
      bc.postMessage(errorPayload);
      bc.close();
    }
  } catch (e) {}
  try { localStorage.setItem('jobabdesk_fb_auth_event', JSON.stringify({ ...errorPayload, ts: Date.now() })); } catch (e) {}
  setTimeout(function() { try { if (window.opener) window.close(); } catch (e) {} }, 2500);
</script>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <title>Facebook Authentication</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #090d16; color: #fff;">
<div style="text-align: center; max-width: 440px; margin: 20px; padding: 32px; background: #111827; border-radius: 20px; border: 1px solid rgba(59, 130, 246, 0.2); box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
  <div style="width: 52px; height: 52px; margin: 0 auto 16px; background: rgba(34, 197, 94, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <p style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0; color: #f3f4f6;">Connected Successfully!</p>
  <p style="font-size: 13px; color: #9ca3af; margin: 0 0 24px 0; line-height: 1.5;">Your Facebook account has been verified. Returning to JababDesk to select your page...</p>
  <a id="returnBtn" href="/agents?fb_code=${encodeURIComponent(code || '')}" style="display: inline-block; padding: 11px 26px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 12px; font-size: 13px; font-weight: 600; box-shadow: 0 4px 14px rgba(37,99,235,0.4);">Select Facebook Page</a>
</div>
<script>
  var payload = { type: 'FB_PAGE_CONNECT', event: 'FINISH', code: ${JSON.stringify(code || '')} };

  try {
    if (window.opener) {
      window.opener.postMessage(payload, '*');
    }
  } catch (e) {}

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var bc = new BroadcastChannel('jobabdesk_fb_auth');
      bc.postMessage(payload);
      bc.close();
    }
  } catch (e) {}

  try {
    localStorage.setItem('jobabdesk_fb_auth_event', JSON.stringify({ ...payload, ts: Date.now() }));
  } catch (e) {}

  // Auto-close if this is a popup, otherwise redirect back automatically
  setTimeout(function() {
    try {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = '/agents?fb_code=' + encodeURIComponent(${JSON.stringify(code || '')});
      }
    } catch (e) {
      window.location.href = '/agents?fb_code=' + encodeURIComponent(${JSON.stringify(code || '')});
    }
  }, 1200);
</script>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function POST(req: Request) {
  try {
    const { accountId, userId } = await requireRole('agent')
    const { userAccessToken, code, redirectUri } = await req.json().catch(() => ({}))

    let token = userAccessToken

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const appSecret = process.env.META_APP_SECRET || ''

    if (code && !token) {
      if (!appSecret) {
        return NextResponse.json(
          { error: 'META_APP_SECRET is missing in environment variables.' },
          { status: 400 }
        )
      }

      const finalRedirectUri = redirectUri || 'https://jobabdesk.vercel.app/api/channels/messenger/pages'

      try {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent(finalRedirectUri)}`
        )
        const tokenData = await tokenRes.json()
        if (tokenData.access_token) {
          token = tokenData.access_token
        } else if (tokenData.error) {
          return NextResponse.json({ error: tokenData.error.message || 'Failed to exchange Meta OAuth code' }, { status: 400 })
        }
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Network error during Meta OAuth code exchange' }, { status: 500 })
      }
    }

    if (!token) {
      return NextResponse.json({ error: 'User Access Token or Code is required' }, { status: 400 })
    }

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
