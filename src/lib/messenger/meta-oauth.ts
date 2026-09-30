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
  const db = getAdminClient()
  if (!accountId) {
    return { status: 'disconnected', pageId: '', pageName: '' }
  }

  try {
    const { data: account, error } = await db
      .from('accounts')
      .select('facebook_page_id, facebook_page_name, facebook_page_access_token, messenger_status')
      .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
      .maybeSingle()

    if (error) {
      console.error('[getMessengerStatus DB Error]:', error)
    }

    const pageId = (account?.facebook_page_id || '').trim()
    const pageToken = (account?.facebook_page_access_token || '').trim()
    const pageName = (account?.facebook_page_name || pageId).trim()

    const isConnected = Boolean(pageId && pageToken)

    return {
      status: isConnected ? 'connected' : 'disconnected',
      pageId: isConnected ? pageId : '',
      pageName: isConnected ? pageName : '',
    }
  } catch (err) {
    console.error('[getMessengerStatus Exception]:', err)
    return { status: 'disconnected', pageId: '', pageName: '' }
  }
}

export async function connectFacebookPage(
  accountId: string,
  pageData?: { pageId?: string; pageName?: string; accessToken?: string },
  supabase?: any
): Promise<MessengerSession> {
  const db = getAdminClient()
  const pageId = pageData?.pageId?.trim() || ''
  const pageName = pageData?.pageName?.trim() || ''
  const token = pageData?.accessToken?.trim() || ''

  if (!accountId || !pageId || !token) {
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
  } catch (subErr) {
    console.error('[FB Subscribed Apps Error]:', subErr)
  }

  try {
    const { error: updateErr } = await db
      .from('accounts')
      .update({
        facebook_page_id: pageId,
        facebook_page_name: pageName || pageId,
        facebook_page_access_token: token,
        messenger_status: 'connected',
        messenger_connection_status: 'connected',
      })
      .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)

    if (updateErr) {
      console.error('[connectFacebookPage DB Update Error]:', updateErr)
      await db
        .from('accounts')
        .update({
          facebook_page_id: pageId,
          facebook_page_name: pageName || pageId,
          facebook_page_access_token: token,
        })
        .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
    }

    return {
      status: 'connected',
      pageId,
      pageName: pageName || pageId,
    }
  } catch (err) {
    console.error('[connectFacebookPage Exception]:', err)
    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  }
}

export async function disconnectFacebookPage(accountId: string, supabase?: any): Promise<MessengerSession> {
  const db = getAdminClient()
  if (!accountId) {
    return { status: 'disconnected', pageId: '', pageName: '' }
  }

  try {
    await db
      .from('accounts')
      .update({
        facebook_page_id: '',
        facebook_page_name: '',
        facebook_page_access_token: '',
        messenger_status: 'disconnected',
        messenger_connection_status: 'disconnected',
      })
      .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
  } catch (err) {
    console.error('[disconnectFacebookPage Exception]:', err)
  }

  return {
    status: 'disconnected',
    pageId: '',
    pageName: '',
  }
}
