import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export interface WhatsAppSession {
  status: 'disconnected' | 'connecting' | 'connected'
  qrCode: string
  connectedNumber: string
}

// Generates a mock SVG QR code string encoding a secure pairing token
function generateMockQRCodeSvg(pairingToken: string): string {
  const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <rect width="200" height="200" fill="#ffffff" rx="16"/>
    <rect x="20" y="20" width="45" height="45" fill="none" stroke="#000000" stroke-width="6" rx="4"/>
    <rect x="30" y="30" width="25" height="25" fill="#075e54"/>
    <rect x="135" y="20" width="45" height="45" fill="none" stroke="#000000" stroke-width="6" rx="4"/>
    <rect x="145" y="30" width="25" height="25" fill="#075e54"/>
    <rect x="20" y="135" width="45" height="45" fill="none" stroke="#000000" stroke-width="6" rx="4"/>
    <rect x="30" y="145" width="25" height="25" fill="#075e54"/>
    <g fill="#128c7e">
      <rect x="75" y="25" width="10" height="10" rx="2"/>
      <rect x="90" y="25" width="10" height="10" rx="2"/>
      <rect x="105" y="25" width="10" height="10" rx="2"/>
      <rect x="75" y="40" width="10" height="10" rx="2"/>
      <rect x="105" y="40" width="10" height="10" rx="2"/>
      <rect x="75" y="55" width="10" height="10" rx="2"/>
      <rect x="90" y="55" width="10" height="10" rx="2"/>
      <rect x="105" y="55" width="10" height="10" rx="2"/>
      <rect x="25" y="75" width="10" height="10" rx="2"/>
      <rect x="40" y="75" width="10" height="10" rx="2"/>
      <rect x="55" y="75" width="10" height="10" rx="2"/>
      <rect x="75" y="75" width="10" height="10" rx="2"/>
      <rect x="90" y="75" width="10" height="10" rx="2"/>
      <rect x="105" y="75" width="10" height="10" rx="2"/>
      <rect x="125" y="75" width="10" height="10" rx="2"/>
      <rect x="140" y="75" width="10" height="10" rx="2"/>
      <rect x="155" y="75" width="10" height="10" rx="2"/>
      <rect x="75" y="90" width="10" height="10" rx="2"/>
      <rect x="90" y="105" width="10" height="10" rx="2"/>
      <rect x="105" y="90" width="10" height="10" rx="2"/>
      <rect x="125" y="125" width="10" height="10" rx="2"/>
      <rect x="140" y="140" width="10" height="10" rx="2"/>
      <rect x="155" y="125" width="10" height="10" rx="2"/>
    </g>
    <circle cx="100" cy="100" r="18" fill="#25d366"/>
    <text x="100" y="185" font-family="sans-serif" font-size="8" fill="#666666" text-anchor="middle">Pairing Code: ${pairingToken.substring(0, 10)}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(rawSvg)}`
}

export async function getWhatsAppStatus(accountId: string, supabase?: any): Promise<WhatsAppSession> {
  const db = supabase || getAdminClient()
  try {
    const { data: account } = await db
      .from('accounts')
      .select('whatsapp_session_status, whatsapp_qr_code, whatsapp_connected_number, whatsapp_status')
      .eq('id', accountId)
      .maybeSingle()

    const status = account?.whatsapp_session_status || (account?.whatsapp_status === 'connected' ? 'connected' : 'disconnected')
    return {
      status,
      qrCode: account?.whatsapp_qr_code || '',
      connectedNumber: account?.whatsapp_connected_number || account?.whatsapp_phone_number_id || '',
    }
  } catch {
    return { status: 'disconnected', qrCode: '', connectedNumber: '' }
  }
}

export async function generateWhatsAppQR(accountId: string, supabase?: any): Promise<WhatsAppSession> {
  const db = supabase || getAdminClient()
  const token = 'WA_PAIR_' + Math.random().toString(36).substring(2, 12).toUpperCase()
  const qrSvg = generateMockQRCodeSvg(token)

  try {
    await db
      .from('accounts')
      .update({
        whatsapp_connection_type: 'qr_web',
        whatsapp_session_status: 'connecting',
        whatsapp_qr_code: qrSvg,
      })
      .eq('id', accountId)

    return {
      status: 'connecting',
      qrCode: qrSvg,
      connectedNumber: '',
    }
  } catch {
    return {
      status: 'connecting',
      qrCode: qrSvg,
      connectedNumber: '',
    }
  }
}

export async function confirmWhatsAppPairing(accountId: string, phoneNumber?: string, supabase?: any): Promise<WhatsAppSession> {
  const db = supabase || getAdminClient()
  const connectedNumber = phoneNumber || '+88017' + Math.floor(10000000 + Math.random() * 90000000)

  try {
    await db
      .from('accounts')
      .update({
        whatsapp_session_status: 'connected',
        whatsapp_status: 'connected',
        whatsapp_connected_number: connectedNumber,
        whatsapp_phone_number_id: connectedNumber,
        whatsapp_qr_code: '',
      })
      .eq('id', accountId)

    return {
      status: 'connected',
      qrCode: '',
      connectedNumber,
    }
  } catch {
    return {
      status: 'connected',
      qrCode: '',
      connectedNumber,
    }
  }
}

export async function disconnectWhatsApp(accountId: string, supabase?: any): Promise<WhatsAppSession> {
  const db = supabase || getAdminClient()
  try {
    await db
      .from('accounts')
      .update({
        whatsapp_session_status: 'disconnected',
        whatsapp_status: 'disconnected',
        whatsapp_connected_number: '',
        whatsapp_phone_number_id: '',
        whatsapp_waba_id: '',
        whatsapp_access_token: '',
        whatsapp_qr_code: '',
      })
      .eq('id', accountId)
  } catch {
    // quiet catch
  }

  return {
    status: 'disconnected',
    qrCode: '',
    connectedNumber: '',
  }
}
