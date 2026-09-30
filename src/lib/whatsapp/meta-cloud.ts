import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export async function sendMetaWhatsAppMessage({
  accountId,
  to,
  text,
  supabase,
}: {
  accountId: string
  to: string
  text: string
  supabase?: any
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const db = supabase || getAdminClient()

  let account = null

  if (accountId) {
    const { data } = await db
      .from('accounts')
      .select('whatsapp_phone_number_id, whatsapp_access_token')
      .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
      .maybeSingle()
    account = data
  }

  if (!account) {
    const { data } = await db
      .from('accounts')
      .select('whatsapp_phone_number_id, whatsapp_access_token')
      .limit(1)
      .maybeSingle()
    account = data
  }

  const phoneNumberId = account?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = account?.whatsapp_access_token || process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'Meta WhatsApp credentials not configured' }
  }

  // Clean recipient phone number (remove +, spaces, dashes)
  const cleanPhone = to.replace(/[^\d]/g, '')
  if (!cleanPhone) {
    return { success: false, error: 'Invalid recipient phone number' }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { body: text },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('[Meta Cloud API Error]:', data)
      return { success: false, error: data?.error?.message || 'Meta API request failed' }
    }

    return { success: true, messageId: data?.messages?.[0]?.id }
  } catch (err: any) {
    console.error('[Meta Cloud API Exception]:', err)
    return { success: false, error: err?.message || 'Network error sending WhatsApp message' }
  }
}
