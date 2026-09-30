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

export async function getMessengerStatus(targetId: string, supabase?: any): Promise<MessengerSession> {
  const db = getAdminClient()

  try {
    let account = null

    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('facebook_page_id, facebook_page_name, facebook_page_access_token, messenger_status, messenger_connection_status')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      account = data
    }

    if (!account) {
      const { data } = await db
        .from('accounts')
        .select('facebook_page_id, facebook_page_name, facebook_page_access_token, messenger_status, messenger_connection_status')
        .limit(1)
        .maybeSingle()
      account = data
    }

    const pageId = (account?.facebook_page_id || '').trim()
    const pageToken = (account?.facebook_page_access_token || '').trim()
    const pageName = (account?.facebook_page_name || pageId).trim()

    const isConnected = Boolean(
      (pageId && pageToken) ||
      account?.messenger_status === 'connected' ||
      account?.messenger_connection_status === 'connected'
    )

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
  targetId: string,
  pageData?: { pageId?: string; pageName?: string; accessToken?: string },
  supabase?: any
): Promise<MessengerSession> {
  const db = getAdminClient()
  const pageId = pageData?.pageId?.trim() || ''
  const pageName = pageData?.pageName?.trim() || ''
  const token = pageData?.accessToken?.trim() || ''

  if (!pageId) {
    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  }

  // Auto-subscribe page to Webhooks via Meta Graph API if token available
  if (token) {
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
  }

  const updates: Record<string, any> = {
    facebook_page_id: pageId,
    facebook_page_name: pageName || pageId,
    messenger_status: 'connected',
    messenger_connection_status: 'connected',
  }
  if (token) {
    updates.facebook_page_access_token = token
  }

  try {
    let targetAccountId = ''
    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('id')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      targetAccountId = data?.id || ''
    }

    if (!targetAccountId) {
      const { data: first } = await db.from('accounts').select('id').limit(1).maybeSingle()
      targetAccountId = first?.id || ''
    }

    if (targetAccountId) {
      await db.from('accounts').update(updates).eq('id', targetAccountId)
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

export async function disconnectFacebookPage(targetId: string, supabase?: any): Promise<MessengerSession> {
  const db = getAdminClient()
  const updates = {
    facebook_page_id: '',
    facebook_page_name: '',
    facebook_page_access_token: '',
    messenger_status: 'disconnected',
    messenger_connection_status: 'disconnected',
  }

  try {
    let targetAccountId = ''
    if (targetId) {
      const { data } = await db
        .from('accounts')
        .select('id')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      targetAccountId = data?.id || ''
    }

    if (!targetAccountId) {
      const { data: first } = await db.from('accounts').select('id').limit(1).maybeSingle()
      targetAccountId = first?.id || ''
    }

    if (targetAccountId) {
      await db.from('accounts').update(updates).eq('id', targetAccountId)
    }
  } catch (err) {
    console.error('[disconnectFacebookPage Exception]:', err)
  }

  return {
    status: 'disconnected',
    pageId: '',
    pageName: '',
  }
}
