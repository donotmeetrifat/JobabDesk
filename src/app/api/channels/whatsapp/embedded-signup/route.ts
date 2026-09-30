import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { phoneNumberId, wabaId, code, accessToken } = await req.json()

    let finalToken = accessToken

    // Exchange short-lived code for permanent token if code provided
    if (code && process.env.NEXT_PUBLIC_META_APP_ID && process.env.META_APP_SECRET) {
      try {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${process.env.NEXT_PUBLIC_META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&code=${code}`
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
