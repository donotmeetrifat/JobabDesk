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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #090d16; color: #fff;">
<div style="text-align: center; max-width: 440px; margin: 20px; padding: 32px; background: #111827; border-radius: 20px; border: 1px solid rgba(239, 68, 68, 0.2);">
  <p style="font-size: 18px; font-weight: 700; color: #f87171; margin-bottom: 8px;">Authentication Cancelled</p>
  <p style="font-size: 13px; color: #9ca3af; margin-bottom: 24px;">${error || 'Authentication cancelled. You may close this window.'}</p>
  <a href="/agents" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 12px; font-size: 13px; font-weight: 600;">Return to JababDesk</a>
</div>
<script>
  var errorPayload = { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', error: ${JSON.stringify(error)} };
  try { if (window.opener) window.opener.postMessage(errorPayload, '*'); } catch (e) {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var bc = new BroadcastChannel('jobabdesk_wa_auth');
      bc.postMessage(errorPayload);
      bc.close();
    }
  } catch (e) {}
  try { localStorage.setItem('jobabdesk_wa_auth_event', JSON.stringify({ ...errorPayload, ts: Date.now() })); } catch (e) {}
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
<head><title>Meta Authentication</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #090d16; color: #fff;">
<div style="text-align: center; max-width: 440px; margin: 20px; padding: 32px; background: #111827; border-radius: 20px; border: 1px solid rgba(34, 197, 94, 0.2);">
  <p style="font-size: 18px; font-weight: 700; color: #22c55e; margin-bottom: 8px;">WhatsApp Connected!</p>
  <p style="font-size: 13px; color: #9ca3af; margin-bottom: 24px;">Configuring your WhatsApp Business connection in JababDesk...</p>
  <a href="/agents" style="display: inline-block; padding: 10px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 12px; font-size: 13px; font-weight: 600;">Return to JababDesk</a>
</div>
<script>
  var payload = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { code: ${JSON.stringify(code || '')} } };
  try { if (window.opener) window.opener.postMessage(payload, '*'); } catch (e) {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var bc = new BroadcastChannel('jobabdesk_wa_auth');
      bc.postMessage(payload);
      bc.close();
    }
  } catch (e) {}
  try { localStorage.setItem('jobabdesk_wa_auth_event', JSON.stringify({ ...payload, ts: Date.now() })); } catch (e) {}
  setTimeout(function() {
    try {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = '/agents?wa_code=' + encodeURIComponent(${JSON.stringify(code || '')});
      }
    } catch (e) {
      window.location.href = '/agents?wa_code=' + encodeURIComponent(${JSON.stringify(code || '')});
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
