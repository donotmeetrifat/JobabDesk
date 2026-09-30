import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export interface MessengerSession {
  status: 'disconnected' | 'connected'
  pageId: string
  pageName: string
}

export async function getMessengerStatus(accountId: string, supabase?: any): Promise<MessengerSession> {
  const db = supabase || getAdminClient()
  try {
    const { data: account } = await db
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .maybeSingle()

    const pageId = (account?.facebook_page_id || account?.messenger_page_id || account?.page_id || '').trim()
    const pageToken = (account?.facebook_page_access_token || account?.messenger_access_token || account?.page_access_token || '').trim()
    const pageName = (account?.facebook_page_name || account?.messenger_page_name || account?.page_name || pageId).trim()

    const isConnected = Boolean(pageId && pageToken)

    return {
      status: isConnected ? 'connected' : 'disconnected',
      pageId: isConnected ? pageId : '',
      pageName: isConnected ? pageName : '',
    }
  } catch {
    return { status: 'disconnected', pageId: '', pageName: '' }
  }
}

export async function connectFacebookPage(
  accountId: string,
  pageData?: { pageId?: string; pageName?: string; accessToken?: string },
  supabase?: any
): Promise<MessengerSession> {
  const db = supabase || getAdminClient()
  const pageId = pageData?.pageId?.trim() || ''
  const pageName = pageData?.pageName?.trim() || ''
  const token = pageData?.accessToken?.trim() || ''

  if (!pageId || !token) {
    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  }

  // Auto-subscribe page to Webhooks via Meta Graph API
  try {
    await fetch(`https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscribed_fields: ['messages', 'messaging_postbacks'],
        access_token: token,
      }),
    })
  } catch {
    // quiet catch
  }

  try {
    await db
      .from('accounts')
      .update({
        messenger_connection_status: 'connected',
        messenger_status: 'connected',
        facebook_page_id: pageId,
        facebook_page_name: pageName || pageId,
        facebook_page_access_token: token,
        messenger_page_id: pageId,
        messenger_page_name: pageName || pageId,
        messenger_access_token: token,
      })
      .eq('id', accountId)

    return {
      status: 'connected',
      pageId,
      pageName: pageName || pageId,
    }
  } catch {
    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  }
}

export async function disconnectFacebookPage(accountId: string, supabase?: any): Promise<MessengerSession> {
  const db = supabase || getAdminClient()
  try {
    await db
      .from('accounts')
      .update({
        messenger_connection_status: 'disconnected',
        messenger_status: 'disconnected',
        facebook_page_id: '',
        facebook_page_name: '',
        facebook_page_access_token: '',
        messenger_page_id: '',
        messenger_page_name: '',
        messenger_access_token: '',
      })
      .eq('id', accountId)
  } catch {
    // quiet catch
  }

  return {
    status: 'disconnected',
    pageId: '',
    pageName: '',
  }
}
