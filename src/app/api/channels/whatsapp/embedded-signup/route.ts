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
<head><title>Meta Authentication</title></head>
<body>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', error: ${JSON.stringify(error)} }, '*');
    }
  } catch (e) {}
  window.close();
</script>
<p style="font-family: sans-serif; text-align: center; margin-top: 40px;">Authentication cancelled or closed. You may close this window.</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  return new Response(
    `<!DOCTYPE html>
<html>
<head><title>Meta Authentication</title></head>
<body>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { code: ${JSON.stringify(code || '')} } }, '*');
    }
  } catch (e) {}
  window.close();
</script>
<p style="font-family: sans-serif; text-align: center; margin-top: 40px;">Authentication successful! Closing window...</p>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function POST(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { phoneNumberId, wabaId, code, accessToken } = await req.json()

    let finalToken = accessToken

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const appSecret = process.env.META_APP_SECRET || ''

    // Exchange short-lived code for permanent token if code provided
    if (code && appId && appSecret) {
      try {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}&redirect_uri=${encodeURIComponent('https://jobabdesk.vercel.app/api/channels/whatsapp/embedded-signup')}`
        )
        const tokenData = await tokenRes.json()
        if (tokenData.access_token) {
          finalToken = tokenData.access_token
        }
      } catch {
        // fallback to provided token
      }
    }

    if (!phoneNumberId && !wabaId && !finalToken) {
      return NextResponse.json({ error: 'Invalid Meta signup payload' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('accounts')
      .update({
        whatsapp_phone_number_id: phoneNumberId || '',
        whatsapp_waba_id: wabaId || '',
        whatsapp_access_token: finalToken || '',
        whatsapp_status: 'connected',
        whatsapp_connection_type: 'meta_cloud',
      })
      .eq('id', accountId)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, settings: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
