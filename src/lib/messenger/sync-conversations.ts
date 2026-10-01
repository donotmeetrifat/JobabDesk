import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

async function resolveOwnerUserId(db: any, accountId: string, explicitUserId?: string): Promise<string> {
  if (explicitUserId) return explicitUserId

  // 1. Try owner_user_id from accounts
  const { data: acc } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle()

  if (acc?.owner_user_id) return acc.owner_user_id

  // 2. Try profiles for this account
  const { data: prof } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  if (prof?.user_id) return prof.user_id

  // 3. Fallback to any user
  const { data: anyProf } = await db
    .from('profiles')
    .select('user_id')
    .limit(1)
    .maybeSingle()

  return anyProf?.user_id || ''
}

export interface SyncResult {
  success: boolean
  conversationsCount: number
  messagesCount: number
  pageName?: string
  error?: string
  tokenMissing?: boolean
  debug?: {
    pageId?: string
    pageName?: string
    rawMetaCount?: number
    errors?: string[]
  }
}

export async function syncFacebookMessengerConversations(
  accountId: string,
  explicitPageId?: string,
  explicitPageToken?: string,
  supabase?: any,
  explicitUserId?: string
): Promise<SyncResult> {
  // Always use admin client to bypass RLS and guarantee full write/read access
  const db = getAdminClient()

  try {
    // 1. Resolve guaranteed valid account ID and record from accounts table
    let actualAccountId = accountId
    let pageId = explicitPageId?.trim() || ''
    let pageToken = explicitPageToken?.trim() || ''
    let pageName = ''

    let accountRecord: any = null
    if (accountId) {
      const { data: acc } = await db
        .from('accounts')
        .select('*')
        .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
        .maybeSingle()
      accountRecord = acc
    }

    if (!accountRecord && accountId) {
      const { data: prof } = await db
        .from('profiles')
        .select('account_id')
        .eq('user_id', accountId)
        .maybeSingle()
      if (prof?.account_id) {
        const { data: acc } = await db
          .from('accounts')
          .select('*')
          .eq('id', prof.account_id)
          .maybeSingle()
        accountRecord = acc
      }
    }

    if (!accountRecord) {
      const { data: anyAcc } = await db
        .from('accounts')
        .select('*')
        .not('facebook_page_access_token', 'is', null)
        .limit(1)
        .maybeSingle()
      accountRecord = anyAcc
    }

    if (!accountRecord) {
      const { data: anyFirstAcc } = await db
        .from('accounts')
        .select('*')
        .limit(1)
        .maybeSingle()
      accountRecord = anyFirstAcc
    }

    if (accountRecord) {
      actualAccountId = accountRecord.id
      pageId = pageId || (accountRecord.facebook_page_id || accountRecord.fb_page_id || '').trim()
      pageToken = pageToken || (accountRecord.facebook_page_access_token || '').trim()
      pageName = (accountRecord.facebook_page_name || accountRecord.fb_page_name || '').trim()
    }

    // Try channel_connections table (migration 044) if token is still missing
    if (!pageToken) {
      try {
        const { data: chan } = await db
          .from('channel_connections')
          .select('*')
          .eq('channel_type', 'messenger')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        if (chan) {
          actualAccountId = chan.account_id || actualAccountId
          pageId = pageId || chan.external_account_id
          pageName = pageName || chan.display_name || pageId
          if (chan.metadata?.access_token || chan.metadata?.accessToken) {
            pageToken = pageToken || chan.metadata.access_token || chan.metadata.accessToken
          }
        }
      } catch {}
    }

    // If we have a pageToken, automatically verify and resolve the real Page ID and Page Name
    // directly from Meta via /me and /me/accounts.
    if (pageToken) {
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=id,name,category&access_token=${encodeURIComponent(pageToken)}`
        )
        let isPage = false
        let meData: any = null
        if (meRes.ok) {
          meData = await meRes.json()
          if (meData?.category) {
            // Definitively a Facebook Page token
            isPage = true
            pageId = meData.id
            pageName = meData.name || pageName || 'Digiplus'
          }
        }

        // If not a Page token, it is a User token. Look up the user's managed pages via /me/accounts
        if (!isPage) {
          const accsRes = await fetch(
            `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
          )
          if (accsRes.ok) {
            const accsData = await accsRes.json()
            const pages: any[] = accsData.data || []
            if (pages.length > 0) {
              const matched =
                pages.find(
                  (p) =>
                    p.id === pageId ||
                    (pageName && p.name?.toLowerCase().includes(pageName.toLowerCase())) ||
                    p.name?.toLowerCase().includes('digiplus')
                ) || pages[0]

              if (matched) {
                pageId = matched.id
                pageName = matched.name
                if (matched.access_token) {
                  pageToken = matched.access_token
                  isPage = true
                }
              }
            } else {
              // The user token does not have access to any pages (missing pages_show_list or not an admin)
              const userName = meData?.name || 'User'
              return {
                success: false,
                tokenMissing: true,
                conversationsCount: 0,
                messagesCount: 0,
                error: `The provided token is a User token for "${userName}", not a Page token for Digiplus. In Meta Graph API Explorer, select "@Digiplus" under User or Page and click "Generate Access Token".`,
              }
            }
          }
        }
      } catch (tokenInspectErr) {
        console.warn('[Sync conversations token inspection warning]:', tokenInspectErr)
      }
    }

    // Persist verified credentials to accounts and channel_connections tables
    if (pageToken && actualAccountId) {
      try {
        await db
          .from('accounts')
          .update({
            facebook_page_id: pageId || '',
            facebook_page_name: pageName || 'Digiplus',
            facebook_page_access_token: pageToken,
            messenger_status: 'connected',
          })
          .eq('id', actualAccountId)
      } catch (saveErr) {
        console.warn('[Sync conversations persist token warning]:', saveErr)
      }

      if (pageId) {
        try {
          await db.from('channel_connections').upsert(
            {
              account_id: actualAccountId,
              channel_type: 'messenger',
              external_account_id: pageId,
              display_name: pageName || pageId,
              is_active: true,
              metadata: { access_token: pageToken },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'account_id,channel_type,external_account_id' }
          )
        } catch {}
      }
    }

    if (!pageToken) {
      console.warn('[Sync Facebook Messenger]: No page credentials found for accountId:', accountId)
      return {
        success: false,
        tokenMissing: true,
        conversationsCount: 0,
        messagesCount: 0,
        error: 'Facebook Page Access Token is missing. Please enter your Page Access Token to sync.',
      }
    }

    const ownerUserId =
      explicitUserId ||
      accountRecord?.owner_user_id ||
      (await resolveOwnerUserId(db, actualAccountId, explicitUserId))

    // 2. Verify token permissions directly from Meta
    let grantedPermissions: string[] = []
    try {
      const permRes = await fetch(
        `https://graph.facebook.com/v20.0/me/permissions?access_token=${encodeURIComponent(pageToken)}`
      )
      if (permRes.ok) {
        const permJson = await permRes.json()
        grantedPermissions = (permJson.data || [])
          .filter((p: any) => p.status === 'granted')
          .map((p: any) => p.permission)
      }
    } catch {}

    if (grantedPermissions.length > 0 && !grantedPermissions.includes('pages_messaging')) {
      return {
        success: false,
        tokenMissing: true,
        conversationsCount: 0,
        messagesCount: 0,
        error: `Permission "pages_messaging" is not granted on this token. In Meta Graph API Explorer, add "pages_messaging" under Permissions and click "Generate Access Token".`,
        debug: {
          pageId,
          pageName,
          rawMetaCount: 0,
          errors: [`Missing pages_messaging. Granted permissions: ${grantedPermissions.join(', ')}`],
        },
      }
    }

    // 3. Query Meta Graph API for conversations across all platform permutations
    // Note: Do NOT request 'snippet' on Conversation node — it does not exist on Conversation node (causes error #100).
    const candidates: string[] = []
    if (pageId) {
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,updated_time,participants,unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&fields=id,updated_time,participants,unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?folder=inbox&fields=id,updated_time,participants&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
    }
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?fields=id,updated_time,participants,unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
    )
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?platform=messenger&fields=id,updated_time,participants&limit=50&access_token=${encodeURIComponent(pageToken)}`
    )

    const rawConversations: Array<any> = []
    const seenConvIds = new Set<string>()
    const errorsEncountered: string[] = []

    for (const url of candidates) {
      try {
        const cRes = await fetch(url)
        const cData = await cRes.json()
        if (cRes.ok && Array.isArray(cData?.data)) {
          for (const item of cData.data) {
            if (item.id && !seenConvIds.has(item.id)) {
              seenConvIds.add(item.id)
              rawConversations.push(item)
            }
          }
          if (rawConversations.length > 0) {
            break
          }
        } else if (cData?.error) {
          const errMsg = cData.error.message || `Error ${cData.error.code}`
          errorsEncountered.push(errMsg)
          console.warn('[Sync conversations candidate error]:', errMsg)
        }
      } catch (cErr: any) {
        console.warn('[Sync conversations network error]:', cErr?.message)
      }
    }

    if (rawConversations.length === 0 && errorsEncountered.length > 0) {
      const topError = errorsEncountered[0]
      return {
        success: false,
        tokenMissing: topError.toLowerCase().includes('token'),
        conversationsCount: 0,
        messagesCount: 0,
        error: topError,
        debug: {
          pageId,
          pageName,
          rawMetaCount: 0,
          errors: errorsEncountered,
        },
      }
    }

    // Auto-subscribe page to webhook events so real-time messaging is guaranteed
    if (pageId) {
      try {
        await fetch(
          `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reads,messaging_optins&access_token=${encodeURIComponent(pageToken)}`,
          { method: 'POST' }
        )
      } catch {}
    }

    let totalConversations = 0
    let totalMessages = 0
    const dbErrors: string[] = []

    for (const rawConv of rawConversations) {
      // 1. Fetch messages for this conversation if not populated inline
      let rawMessages: Array<any> = rawConv.messages?.data || []
      if (rawMessages.length === 0 && rawConv.id) {
        try {
          const msgRes = await fetch(
            `https://graph.facebook.com/v20.0/${rawConv.id}/messages?fields=id,message,created_time,from,to&limit=30&access_token=${encodeURIComponent(pageToken)}`
          )
          if (msgRes.ok) {
            const msgData = await msgRes.json()
            rawMessages = msgData.data || []
          }
        } catch {}
      }

      // 2. Discover customer participant (the one whose id is NOT the pageId)
      const participants: Array<{ id: string; name?: string; email?: string }> =
        rawConv.participants?.data || rawConv.senders?.data || []

      let customer = participants.find(
        (p) => p.id !== pageId && (!pageName || p.name?.toLowerCase() !== pageName.toLowerCase())
      ) || participants[0]

      let customerPsid = customer?.id || ''
      let customerName = customer?.name || ''

      // Fallback: If participant ID is pageId or missing, inspect messages to discover customer PSID
      if ((!customerPsid || customerPsid === pageId) && rawMessages.length > 0) {
        for (const m of rawMessages) {
          if (m.from?.id && m.from.id !== pageId) {
            customerPsid = m.from.id
            customerName = m.from.name || customerName
            break
          }
        }
      }

      if (!customerPsid) {
        customerPsid = rawConv.id
      }
      if (!customerName) {
        customerName = `Messenger User (${customerPsid.slice(-4)})`
      }
      const customerEmail = customer?.email || null

      // 3. Find or create Contact in contacts table (NO channel column exists in contacts table!)
      let contactId = ''
      const { data: existingContact } = await db
        .from('contacts')
        .select('id, name')
        .eq('account_id', actualAccountId)
        .eq('phone', customerPsid)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
        // Update name if we now have a real Facebook name
        if (customer.name && existingContact.name !== customer.name) {
          await db
            .from('contacts')
            .update({ name: customer.name, updated_at: new Date().toISOString() })
            .eq('id', existingContact.id)
        }
      } else {
        const { data: newContact, error: createContactErr } = await db
          .from('contacts')
          .insert({
            account_id: actualAccountId,
            user_id: ownerUserId,
            phone: customerPsid,
            name: customerName,
            email: customerEmail,
          })
          .select('id')
          .maybeSingle()

        if (createContactErr || !newContact) {
          console.warn('[Sync contacts insert error]:', createContactErr?.message)
          if (createContactErr?.message) {
            dbErrors.push(`Contact create: ${createContactErr.message}`)
          }
          // Raced or duplicate phone_normalized, re-query
          const { data: retryContact } = await db
            .from('contacts')
            .select('id')
            .eq('account_id', actualAccountId)
            .or(`phone.eq.${customerPsid},phone_normalized.eq.${customerPsid.replace(/\D/g, '')}`)
            .maybeSingle()
          contactId = retryContact?.id || ''
        } else {
          contactId = newContact.id
        }
      }

      if (!contactId) {
        console.error('[Sync]: Failed to resolve contact for customer PSID:', customerPsid)
        continue
      }

      // 4. Find or create Conversation in conversations table
      const latestMsg = rawMessages[0]?.message || 'Messenger conversation'
      const latestTime = rawMessages[0]?.created_time || rawConv.updated_time || new Date().toISOString()

      let conversationId = ''
      const { data: existingConv } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', actualAccountId)
        .eq('contact_id', contactId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
        await db
          .from('conversations')
          .update({
            last_message_text: latestMsg,
            last_message_at: latestTime,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConv.id)
      } else {
        const { data: newConv, error: createConvErr } = await db
          .from('conversations')
          .insert({
            account_id: actualAccountId,
            contact_id: contactId,
            user_id: ownerUserId,
            status: 'open',
            last_message_text: latestMsg,
            last_message_at: latestTime,
            unread_count: 0,
          })
          .select('id')
          .maybeSingle()

        if (createConvErr || !newConv) {
          console.warn('[Sync conversations insert error]:', createConvErr?.message)
          if (createConvErr?.message) {
            dbErrors.push(`Conv create: ${createConvErr.message}`)
          }
          const { data: retryConv } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', actualAccountId)
            .eq('contact_id', contactId)
            .maybeSingle()
          conversationId = retryConv?.id || ''
        } else {
          conversationId = newConv.id
        }
      }

      if (!conversationId) continue
      totalConversations++

      // 5. Ingest messages into messages table
      for (const msg of rawMessages) {
        if (!msg.message && !msg.id) continue

        // Check dedupe by message_id
        if (msg.id) {
          const { data: existingMsg } = await db
            .from('messages')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('message_id', msg.id)
            .maybeSingle()

          if (existingMsg) continue
        }

        const isFromPage = msg.from?.id === pageId
        const senderType = isFromPage ? 'agent' : 'customer'

        const { error: msgInsertErr } = await db.from('messages').insert({
          conversation_id: conversationId,
          sender_type: senderType,
          content_type: 'text',
          content_text: msg.message || '',
          message_id: msg.id || null,
          status: 'delivered',
          created_at: msg.created_time || new Date().toISOString(),
        })

        if (!msgInsertErr) {
          totalMessages++
        }
      }
    }

    return {
      success: true,
      conversationsCount: totalConversations,
      messagesCount: totalMessages,
      pageName,
      debug: {
        pageId,
        pageName,
        rawMetaCount: rawConversations.length,
        errors: dbErrors.length > 0 ? dbErrors : undefined,
      },
    }
  } catch (err: any) {
    console.error('[syncFacebookMessengerConversations Exception]:', err)
    return {
      success: false,
      conversationsCount: 0,
      messagesCount: 0,
      error: err?.message || 'Unexpected error syncing Messenger conversations.',
    }
  }
}
