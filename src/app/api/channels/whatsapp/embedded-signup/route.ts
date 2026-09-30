import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

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
    const { accountId, userId, supabase } = await requireRole('agent')
    const { phoneNumberId, wabaId, code, accessToken } = await req.json()

    let finalToken = accessToken

    const appId = process.env.NEXT_PUBLIC_META_APP_ID || process.env.META_APP_ID || '1789555715522515'
    const appSecret = process.env.META_APP_SECRET || ''

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

    const targetId = accountId || userId

    // Canonical guaranteed columns from migration 053
    const coreUpdates: Record<string, any> = {
      whatsapp_phone_number_id: phoneNumberId || '',
      whatsapp_waba_id: wabaId || '',
      whatsapp_access_token: finalToken || '',
      whatsapp_status: 'connected',
    }

    // 1. Update accounts table via authenticated SSR client
    let updatedAccount = null
    if (supabase && targetId) {
      const { data, error: coreErr } = await supabase
        .from('accounts')
        .update(coreUpdates)
        .eq('id', targetId)
        .select('*')
        .maybeSingle()

      updatedAccount = data

      if (coreErr) {
        console.warn('[embedded-signup core update error, retrying field-by-field]:', coreErr.message)
        for (const [k, v] of Object.entries(coreUpdates)) {
          await supabase.from('accounts').update({ [k]: v }).eq('id', targetId)
        }
      }

      // Try auxiliary columns optionally
      try {
        await supabase.from('accounts').update({
          whatsapp_session_status: 'connected',
          whatsapp_connection_type: 'meta_cloud',
          whatsapp_connected_number: phoneNumberId || '',
        }).eq('id', targetId)
      } catch {}
    }

    // 2. Also update via admin client if service role key is present
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      await db.from('accounts').update(coreUpdates).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      try {
        await db.from('accounts').update({
          whatsapp_session_status: 'connected',
          whatsapp_connection_type: 'meta_cloud',
          whatsapp_connected_number: phoneNumberId || '',
        }).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      } catch {}
    }

    // 3. Multi-table redundancy: Upsert into whatsapp_config table (migration 001/017)
    if (supabase && targetId && (phoneNumberId || finalToken)) {
      try {
        await supabase.from('whatsapp_config').upsert(
          {
            account_id: targetId,
            user_id: userId,
            phone_number_id: phoneNumberId || 'meta_cloud_waba',
            access_token: finalToken || '',
            waba_id: wabaId || '',
            status: 'connected',
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'account_id' }
        )
      } catch (waCfgErr) {
        console.warn('[embedded-signup whatsapp_config upsert warning]:', waCfgErr)
      }
    }

    // 4. Multi-table redundancy: Upsert into channel_connections table (migration 044)
    if (supabase && targetId && (phoneNumberId || finalToken)) {
      try {
        await supabase.from('channel_connections').upsert(
          {
            account_id: targetId,
            channel_type: 'whatsapp',
            external_account_id: phoneNumberId || 'meta_cloud_waba',
            display_name: 'WhatsApp Business',
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,channel_type,external_account_id' }
        )
      } catch {
        // channel_connections upsert is non-fatal
      }
    }

    return NextResponse.json({ success: true, settings: updatedAccount || coreUpdates })
  } catch (err) {
    return toErrorResponse(err)
  }
}
