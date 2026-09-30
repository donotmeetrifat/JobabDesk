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
  try {
    let account: any = null

    // 1. Try authenticated SSR client first using select('*')
    // select('*') is immune to missing column errors in Supabase schema cache
    if (supabase && targetId) {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', targetId)
        .maybeSingle()
      account = data
    }

    // 2. Fallback to admin client if service role key is present
    if (!account && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      const { data } = await db
        .from('accounts')
        .select('*')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      account = data
    }

    // 3. Fallback: try querying first account with supabase client
    if (!account && supabase) {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .limit(1)
        .maybeSingle()
      account = data
    }

    let pageId = (account?.facebook_page_id || account?.fb_page_id || '').trim()
    let pageToken = (account?.facebook_page_access_token || '').trim()
    let pageName = (account?.facebook_page_name || account?.fb_page_name || pageId).trim()

    let isConnected = Boolean(
      (pageId && pageToken) ||
      (pageId && (account?.messenger_status === 'connected' || account?.messenger_connection_status === 'connected')) ||
      account?.messenger_status === 'connected' ||
      account?.messenger_connection_status === 'connected'
    )

    // 4. Redundant check: channel_connections table (migration 044)
    if (!isConnected && supabase && targetId) {
      try {
        const { data: chan } = await supabase
          .from('channel_connections')
          .select('*')
          .eq('account_id', targetId)
          .eq('channel_type', 'messenger')
          .eq('is_active', true)
          .maybeSingle()

        if (chan && chan.external_account_id) {
          isConnected = true
          pageId = pageId || chan.external_account_id
          pageName = pageName || chan.display_name || chan.external_account_id
        }
      } catch {
        // channel_connections table check is non-fatal
      }
    }

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

  // Guaranteed canonical columns from migration 053
  const coreUpdates: Record<string, any> = {
    facebook_page_id: pageId,
    facebook_page_name: pageName || pageId,
    messenger_status: 'connected',
  }
  if (token) {
    coreUpdates.facebook_page_access_token = token
  }

  try {
    // 1. Update accounts table via authenticated user supabase client
    if (supabase && targetId) {
      const { error: coreErr } = await supabase.from('accounts').update(coreUpdates).eq('id', targetId)
      if (coreErr) {
        console.warn('[connectFacebookPage core update error, retrying field-by-field]:', coreErr.message)
        for (const [k, v] of Object.entries(coreUpdates)) {
          await supabase.from('accounts').update({ [k]: v }).eq('id', targetId)
        }
      }

      // Try auxiliary columns optionally (won't fail if column is not yet migrated)
      try {
        await supabase.from('accounts').update({ messenger_connection_status: 'connected' }).eq('id', targetId)
      } catch {}
    }

    // 2. Also update via admin client if service role key is present
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      await db.from('accounts').update(coreUpdates).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      try {
        await db.from('accounts').update({ messenger_connection_status: 'connected' }).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      } catch {}
    }

    // 3. Multi-table redundancy: Upsert into channel_connections table (migration 044)
    if (supabase && targetId) {
      try {
        await supabase.from('channel_connections').upsert(
          {
            account_id: targetId,
            channel_type: 'messenger',
            external_account_id: pageId,
            display_name: pageName || pageId,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,channel_type,external_account_id' }
        )
      } catch {
        // channel_connections upsert is non-fatal
      }
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
  const coreUpdates = {
    facebook_page_id: '',
    facebook_page_name: '',
    facebook_page_access_token: '',
    messenger_status: 'disconnected',
  }

  try {
    if (supabase && targetId) {
      await supabase.from('accounts').update(coreUpdates).eq('id', targetId)
      try {
        await supabase.from('accounts').update({ messenger_connection_status: 'disconnected' }).eq('id', targetId)
      } catch {}

      // Update channel_connections
      try {
        await supabase
          .from('channel_connections')
          .update({ is_active: false, disconnected_at: new Date().toISOString() })
          .eq('account_id', targetId)
          .eq('channel_type', 'messenger')
      } catch {}
    }

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = getAdminClient()
      await db.from('accounts').update(coreUpdates).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      try {
        await db.from('accounts').update({ messenger_connection_status: 'disconnected' }).or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
      } catch {}
    }

    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  } catch (err) {
    console.error('[disconnectFacebookPage Exception]:', err)
    return {
      status: 'disconnected',
      pageId: '',
      pageName: '',
    }
  }
}
