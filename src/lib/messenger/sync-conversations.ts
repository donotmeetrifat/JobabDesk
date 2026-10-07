import { createClient } from '@supabase/supabase-js'
import { autoUpdateContactFromChatMessage } from '@/lib/contacts/auto-extract'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createClient(url, anonKey)
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
  explicitUserId?: string,
  purgeExisting?: boolean,
  limit: number = 25
): Promise<SyncResult> {
  const adminClient = getAdminClient()
  const db = supabase || adminClient

  try {
    // 1. Resolve account record
    let actualAccountId = accountId
    let pageId = explicitPageId?.trim() || ''
    let pageToken = explicitPageToken?.trim() || ''
    let pageName = ''

    let accountRecord: any = null
    if (accountId) {
      const { data: acc } = await db
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .maybeSingle()
      accountRecord = acc
    }

    if (!accountRecord && accountId) {
      const { data: acc } = await db
        .from('accounts')
        .select('*')
        .eq('owner_user_id', accountId)
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

    if (accountRecord) {
      actualAccountId = accountRecord.id
      pageId = pageId || (accountRecord.facebook_page_id || accountRecord.fb_page_id || '').trim()
      pageToken = pageToken || (accountRecord.facebook_page_access_token || '').trim()
      pageName = (accountRecord.facebook_page_name || accountRecord.fb_page_name || '').trim()

      // Backfill: Repair any contacts, conversations, or profiles that mistakenly received owner_user_id as account_id
      if (accountRecord.owner_user_id && accountRecord.owner_user_id !== accountRecord.id) {
        try {
          await db.from('contacts').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
          await db.from('conversations').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
          await db.from('profiles').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
          if (adminClient && adminClient !== db) {
            await adminClient.from('contacts').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
            await adminClient.from('conversations').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
            await adminClient.from('profiles').update({ account_id: accountRecord.id }).eq('account_id', accountRecord.owner_user_id)
          }
        } catch (repairErr) {
          console.warn('[Sync account_id repair warning]:', repairErr)
        }
      }
    }

    // Ensure the explicit user's profile is aligned to actualAccountId
    if (explicitUserId && actualAccountId) {
      try {
        await db.from('profiles').update({ account_id: actualAccountId }).eq('user_id', explicitUserId)
        if (adminClient && adminClient !== db) {
          await adminClient.from('profiles').update({ account_id: actualAccountId }).eq('user_id', explicitUserId)
        }
      } catch (pErr) {
        console.warn('[Sync profile alignment warning]:', pErr)
      }
    }

    // Try channel_connections table if token is still missing
    if (!pageToken) {
      try {
        let chanQuery = db
          .from('channel_connections')
          .select('*')
          .eq('channel_type', 'messenger')
          .eq('is_active', true)
        if (actualAccountId) {
          chanQuery = chanQuery.eq('account_id', actualAccountId)
        }
        const { data: chan } = await chanQuery.limit(1).maybeSingle()
        if (chan) {
          if (!actualAccountId) actualAccountId = chan.account_id
          pageId = pageId || chan.external_account_id
          pageName = pageName || chan.display_name || pageId
          if (chan.metadata?.access_token || chan.metadata?.accessToken) {
            pageToken = pageToken || chan.metadata.access_token || chan.metadata.accessToken
          }
        }
      } catch {}
    }

    // Resolve Page ID and Page Name from token if present
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
            pageName = meData.name || pageName || 'Facebook Page'
          }
        }

        // If not a Page token, it is a User or System User token
        if (!isPage) {
          // Method A: Check /me/accounts
          try {
            const accsRes = await fetch(
              `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
            )
            if (accsRes.ok) {
              const accsData = await accsRes.json()
              const pages: any[] = accsData.data || []
              if (pages.length > 0) {
                const matched = pageId
                  ? pages.find((p) => p.id === pageId)
                  : pages[0]

                if (matched) {
                  pageId = matched.id
                  pageName = matched.name || pageName
                  if (matched.access_token) pageToken = matched.access_token
                  isPage = true
                }
              }
            }
          } catch {}

          // Method B: Check /me/assigned_pages
          if (!isPage) {
            try {
              const assignedRes = await fetch(
                `https://graph.facebook.com/v20.0/me/assigned_pages?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
              )
              if (assignedRes.ok) {
                const assignedData = await assignedRes.json()
                const pages: any[] = assignedData.data || []
                if (pages.length > 0) {
                  const matched = pageId
                    ? pages.find((p) => p.id === pageId)
                    : pages[0]
                  if (matched) {
                    pageId = matched.id
                    pageName = matched.name || pageName
                    if (matched.access_token) pageToken = matched.access_token
                    isPage = true
                  }
                }
              }
            } catch {}
          }

          // Method C: Check /me/businesses
          if (!isPage) {
            try {
              const bizRes = await fetch(
                `https://graph.facebook.com/v20.0/me/businesses?fields=id,name,owned_pages{id,name,access_token},client_pages{id,name,access_token}&access_token=${encodeURIComponent(pageToken)}`
              )
              if (bizRes.ok) {
                const bizData = await bizRes.json()
                const bizList: any[] = bizData.data || []
                const pages: any[] = []
                for (const b of bizList) {
                  if (b.owned_pages?.data) pages.push(...b.owned_pages.data)
                  if (b.client_pages?.data) pages.push(...b.client_pages.data)
                }
                if (pages.length > 0) {
                  const matched = pageId
                    ? pages.find((p) => p.id === pageId)
                    : pages[0]
                  if (matched) {
                    pageId = matched.id
                    pageName = matched.name || pageName
                    if (matched.access_token) pageToken = matched.access_token
                    isPage = true
                  }
                }
              }
            } catch {}
          }

          // Fallback check from channel_connections
          if (!pageId && actualAccountId) {
            try {
              const { data: chan } = await db
                .from('channel_connections')
                .select('external_account_id, display_name')
                .eq('account_id', actualAccountId)
                .eq('channel_type', 'messenger')
                .limit(1)
                .maybeSingle()
              if (chan?.external_account_id) {
                pageId = chan.external_account_id
                pageName = pageName || chan.display_name || 'Facebook Page'
              }
            } catch {}
          }

          // Test if pageId is accessible directly
          if (!isPage && pageId) {
            try {
              const pageDirectRes = await fetch(
                `https://graph.facebook.com/v20.0/${pageId}?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
              )
              if (pageDirectRes.ok) {
                const pageDirectData = await pageDirectRes.json()
                if (pageDirectData?.id) {
                  pageId = pageDirectData.id
                  pageName = pageDirectData.name || pageName
                  if (pageDirectData.access_token) pageToken = pageDirectData.access_token
                  isPage = true
                }
              }
            } catch {}
          }
        }
      } catch (tokenInspectErr) {
        console.warn('[Sync conversations token inspection warning]:', tokenInspectErr)
      }
    }

    // Clean up if specifically requested or if connected page changed
    if (pageId && actualAccountId) {
      try {
        const prevPageId = accountRecord?.facebook_page_id || ''
        const shouldPurge = Boolean(purgeExisting) || (prevPageId && pageId && prevPageId !== pageId)

        if (shouldPurge) {
          const { data: convsToClean } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', actualAccountId)

          if (convsToClean && convsToClean.length > 0) {
            const convIds = convsToClean.map((c: any) => c.id)
            await db.from('messages').delete().in('conversation_id', convIds)
            await db.from('conversations').delete().eq('account_id', actualAccountId)
            await db.from('contacts').delete().eq('account_id', actualAccountId)
          }
        }
      } catch (cleanErr) {
        console.warn('[Sync conversations clean error]:', cleanErr)
      }
    }

    // Persist verified credentials to accounts & channel_connections
    if (pageToken && actualAccountId) {
      try {
        await db
          .from('accounts')
          .update({
            facebook_page_id: pageId || '',
            facebook_page_name: pageName || 'Facebook Page',
            facebook_page_access_token: pageToken,
            messenger_status: 'connected',
            messenger_auto_reply_enabled: true,
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

    // 2. Fetch conversations from Meta Graph API
    // Clamped limit: between 5 and 100, default 25
    const syncLimit = Math.min(Math.max(limit || 25, 5), 100)

    const candidates: string[] = []
    if (pageId) {
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
    }
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
    )

    let rawConversations: Array<any> = []
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
            break // Found conversations, stop query chain immediately!
          }
        } else if (cData?.error) {
          const errMsg = cData.error.message || `Error ${cData.error.code}`
          errorsEncountered.push(errMsg)
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

    // Auto-subscribe page to webhooks in the background (fire-and-forget)
    if (pageId) {
      fetch(
        `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_reactions,message_reads,messaging_optins&access_token=${encodeURIComponent(pageToken)}`,
        { method: 'POST' }
      ).catch(() => {})
    }

    if (rawConversations.length === 0) {
      return {
        success: true,
        conversationsCount: 0,
        messagesCount: 0,
        pageName,
        debug: { pageId, pageName, rawMetaCount: 0 },
      }
    }

    // 3. Pre-process metadata for all conversations
    interface ProcessedConv {
      rawConv: any
      customerPsid: string
      customerName: string
      customerEmail: string | null
      rawMessages: any[]
      latestMsg: string
      latestTime: string
    }

    const processedList: ProcessedConv[] = []
    const allCustomerPsids = new Set<string>()

    for (const rawConv of rawConversations) {
      const rawMessages: any[] = rawConv.messages?.data || []
      const participants: Array<{ id: string; name?: string; email?: string }> =
        rawConv.participants?.data || rawConv.senders?.data || []

      let customer = participants.find(
        (p) => p.id !== pageId && (!pageName || p.name?.toLowerCase() !== pageName.toLowerCase())
      ) || participants[0]

      let customerPsid = customer?.id || ''
      let customerName = customer?.name || ''

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

      if (customerPsid && customerPsid !== pageId) {
        allCustomerPsids.add(customerPsid)
      }

      const customerEmail =
        customer?.email && !customer.email.toLowerCase().endsWith('@facebook.com')
          ? customer.email
          : null

      let latestMsg = rawMessages[0]?.message || ''
      if (!latestMsg && rawMessages[0]?.attachments?.data?.length > 0) {
        const firstAtt = rawMessages[0].attachments.data[0]
        if (firstAtt.image_data) latestMsg = '📷 Photo'
        else if (firstAtt.file_url?.includes('.aac') || firstAtt.mime_type?.startsWith('audio')) latestMsg = '🎵 Voice message'
        else latestMsg = '📎 Attachment'
      }
      if (!latestMsg) latestMsg = 'Messenger conversation'
      const latestTime = rawMessages[0]?.created_time || rawConv.updated_time || new Date().toISOString()

      processedList.push({
        rawConv,
        customerPsid,
        customerName,
        customerEmail,
        rawMessages,
        latestMsg,
        latestTime,
      })
    }

    // 4. Batch query existing contacts from Supabase
    const contactsByPsid = new Map<string, any>()
    const psidList = Array.from(allCustomerPsids)

    if (psidList.length > 0) {
      try {
        // Query in chunks of 40 to avoid huge query strings
        for (let i = 0; i < psidList.length; i += 40) {
          const slice = psidList.slice(i, i + 40)
          const { data: contactsData } = await db
            .from('contacts')
            .select('id, name, avatar_url, company, phone, messenger_id')
            .eq('account_id', actualAccountId)
            .in('messenger_id', slice)

          if (contactsData) {
            for (const c of contactsData) {
              if (c.messenger_id) contactsByPsid.set(c.messenger_id, c)
              if (c.phone) contactsByPsid.set(c.phone, c)
            }
          }
        }
      } catch (cFetchErr) {
        console.warn('[Sync batch contacts fetch warning]:', cFetchErr)
      }
    }

    // 5. Smart Profile Resolution: ONLY fetch Meta Graph API for contacts that lack name/avatar
    const profileCache = new Map<string, { name?: string; avatar_url?: string }>()
    const psidsNeedingMetaFetch = psidList.filter((psid) => {
      const existing = contactsByPsid.get(psid)
      if (!existing) return true
      const hasGoodName = existing.name && existing.name !== 'Unknown' && !existing.name.startsWith('Messenger User')
      return !hasGoodName || !existing.avatar_url
    })

    // Fetch Meta profiles in parallel chunks of 5
    if (psidsNeedingMetaFetch.length > 0) {
      for (let i = 0; i < psidsNeedingMetaFetch.length; i += 5) {
        const batch = psidsNeedingMetaFetch.slice(i, i + 5)
        await Promise.allSettled(
          batch.map(async (psid) => {
            try {
              const profileRes = await fetch(
                `https://graph.facebook.com/v20.0/${psid}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageToken)}`
              )
              if (profileRes.ok) {
                const profileJson = await profileRes.json()
                const resolvedName = (
                  profileJson.name ||
                  [profileJson.first_name, profileJson.last_name].filter(Boolean).join(' ')
                ).trim()
                profileCache.set(psid, {
                  name: resolvedName || undefined,
                  avatar_url: profileJson.profile_pic || undefined,
                })
              }
            } catch {}
          })
        )
      }
    }

    // 6. Resolve / Upsert Contacts
    for (const item of processedList) {
      const psid = item.customerPsid
      const cachedProfile = profileCache.get(psid)
      let resolvedName = cachedProfile?.name || item.customerName
      const resolvedAvatar = cachedProfile?.avatar_url || ''

      const existingContact = contactsByPsid.get(psid)

      if (existingContact) {
        if (!resolvedName || resolvedName === 'Unknown') {
          resolvedName = existingContact.name
        }
        if (!resolvedName || resolvedName === 'Unknown') {
          resolvedName = `Messenger User (${psid.slice(-4)})`
        }

        const updates: any = {}
        if (resolvedName && (!existingContact.name || existingContact.name === 'Unknown' || existingContact.name.startsWith('Messenger User')) && resolvedName !== existingContact.name) {
          updates.name = resolvedName
        }
        if (resolvedAvatar && existingContact.avatar_url !== resolvedAvatar) {
          updates.avatar_url = resolvedAvatar
        }
        if (!existingContact.messenger_id) {
          updates.messenger_id = psid
        }

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString()
          await db.from('contacts').update(updates).eq('id', existingContact.id).catch(() => {})
          Object.assign(existingContact, updates)
        }
      } else {
        if (!resolvedName || resolvedName === 'Unknown') {
          resolvedName = `Messenger User (${psid.slice(-4)})`
        }

        const contactPayload = {
          account_id: actualAccountId,
          user_id: ownerUserId,
          phone: psid,
          messenger_id: psid,
          name: resolvedName,
          email: item.customerEmail,
          avatar_url: resolvedAvatar || null,
          company: 'Facebook Messenger',
        }

        let { data: newContact, error: createContactErr } = await db
          .from('contacts')
          .insert(contactPayload)
          .select('id, name, avatar_url, phone, messenger_id')
          .maybeSingle()

        if ((createContactErr || !newContact) && adminClient && adminClient !== db) {
          const adminInsertRes = await adminClient
            .from('contacts')
            .insert(contactPayload)
            .select('id, name, avatar_url, phone, messenger_id')
            .maybeSingle()
          if (adminInsertRes.data) {
            newContact = adminInsertRes.data
            createContactErr = null
          }
        }

        if (newContact) {
          contactsByPsid.set(psid, newContact)
        }
      }
    }

    // 7. Batch Query Existing Conversations
    const allContactIds = Array.from(contactsByPsid.values())
      .map((c) => c.id)
      .filter(Boolean)
    const convsByContactId = new Map<string, any>()

    if (allContactIds.length > 0) {
      for (let i = 0; i < allContactIds.length; i += 40) {
        const slice = allContactIds.slice(i, i + 40)
        const { data: convData } = await db
          .from('conversations')
          .select('id, contact_id, last_message_text, last_message_at')
          .eq('account_id', actualAccountId)
          .in('contact_id', slice)

        if (convData) {
          for (const cv of convData) {
            convsByContactId.set(cv.contact_id, cv)
          }
        }
      }
    }

    // 8. Process conversations and messages in concurrent chunks (Chunk Size = 5)
    let totalConversations = 0
    let totalMessages = 0
    const dbErrors: string[] = []

    const CONV_CHUNK_SIZE = 5
    for (let i = 0; i < processedList.length; i += CONV_CHUNK_SIZE) {
      const chunk = processedList.slice(i, i + CONV_CHUNK_SIZE)

      await Promise.all(
        chunk.map(async (item) => {
          try {
            const contact = contactsByPsid.get(item.customerPsid)
            if (!contact?.id) return

            const contactId = contact.id
            let conversationId = ''
            const existingConv = convsByContactId.get(contactId)

            if (existingConv) {
              conversationId = existingConv.id
              await db
                .from('conversations')
                .update({
                  last_message_text: item.latestMsg,
                  last_message_at: item.latestTime,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', conversationId)
                .catch(() => {})
            } else {
              const convPayload = {
                account_id: actualAccountId,
                contact_id: contactId,
                user_id: ownerUserId,
                status: 'open',
                last_message_text: item.latestMsg,
                last_message_at: item.latestTime,
                unread_count: 0,
              }

              let { data: newConv, error: createConvErr } = await db
                .from('conversations')
                .insert(convPayload)
                .select('id')
                .maybeSingle()

              if ((createConvErr || !newConv) && adminClient && adminClient !== db) {
                const adminConvRes = await adminClient
                  .from('conversations')
                  .insert(convPayload)
                  .select('id')
                  .maybeSingle()
                if (adminConvRes.data) {
                  newConv = adminConvRes.data
                }
              }

              if (newConv?.id) {
                conversationId = newConv.id
                convsByContactId.set(contactId, newConv)
              }
            }

            if (!conversationId) return
            totalConversations++

            // Fetch messages for this thread if not provided inline
            let rawMessages = item.rawMessages
            if (rawMessages.length === 0 && item.rawConv.id) {
              try {
                const msgRes = await fetch(
                  `https://graph.facebook.com/v20.0/${item.rawConv.id}/messages?fields=id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}&limit=30&access_token=${encodeURIComponent(pageToken)}`
                )
                if (msgRes.ok) {
                  const msgData = await msgRes.json()
                  rawMessages = msgData.data || []
                }
              } catch {}
            }

            if (rawMessages.length === 0) return

            // Batch deduplication: query all existing message IDs in one fast DB call
            const msgIds = rawMessages.map((m: any) => m.id).filter(Boolean)
            const existingMsgIdSet = new Set<string>()

            if (msgIds.length > 0) {
              const { data: existingMsgs } = await db
                .from('messages')
                .select('message_id')
                .eq('conversation_id', conversationId)
                .in('message_id', msgIds)

              if (existingMsgs) {
                for (const em of existingMsgs) {
                  if (em.message_id) existingMsgIdSet.add(em.message_id)
                }
              }
            }

            // Build bulk insert payload
            const newMessagesToInsert: any[] = []

            for (const msg of rawMessages) {
              if (msg.id && existingMsgIdSet.has(msg.id)) {
                totalMessages++
                continue
              }

              let mediaUrl: string | null = null
              let contentType: 'text' | 'image' | 'audio' | 'video' | 'document' = 'text'
              let contentText = msg.message || ''

              const attachments = msg.attachments?.data || []
              if (attachments.length > 0) {
                const att = attachments[0]
                if (att.image_data?.url) {
                  mediaUrl = att.image_data.url
                  contentType = 'image'
                } else if (att.video_data?.url) {
                  mediaUrl = att.video_data.url
                  contentType = 'video'
                } else if (att.file_url) {
                  mediaUrl = att.file_url
                  const mime = (att.mime_type || '').toLowerCase()
                  if (
                    mime.startsWith('audio') ||
                    att.file_url.includes('.aac') ||
                    att.file_url.includes('.mp3') ||
                    att.file_url.includes('.m4a') ||
                    att.file_url.includes('.ogg')
                  ) {
                    contentType = 'audio'
                  } else if (mime.startsWith('image')) {
                    contentType = 'image'
                  } else if (mime.startsWith('video')) {
                    contentType = 'video'
                  } else {
                    contentType = 'document'
                  }
                }

                if (!contentText) {
                  if (contentType === 'image') contentText = 'Photo'
                  else if (contentType === 'audio') contentText = 'Voice Message'
                  else if (contentType === 'video') contentText = 'Video'
                  else if (contentType === 'document') contentText = 'Attachment'
                }
              }

              if (!contentText && !mediaUrl && !msg.id) continue

              const isFromPage =
                msg.from?.id === pageId ||
                (pageName && msg.from?.name?.toLowerCase() === pageName.toLowerCase())
              const senderType = isFromPage ? 'agent' : 'customer'

              newMessagesToInsert.push({
                conversation_id: conversationId,
                sender_type: senderType,
                content_type: contentType,
                content_text: contentText,
                media_url: mediaUrl,
                message_id: msg.id || null,
                status: 'delivered',
                created_at: msg.created_time || new Date().toISOString(),
              })
            }

            // Bulk insert new messages in ONE single roundtrip!
            if (newMessagesToInsert.length > 0) {
              let { error: insertErr } = await db.from('messages').insert(newMessagesToInsert)
              if (insertErr && adminClient && adminClient !== db) {
                const adminInsert = await adminClient.from('messages').insert(newMessagesToInsert)
                insertErr = adminInsert.error
              }

              if (!insertErr) {
                totalMessages += newMessagesToInsert.length

                // Auto-extract customer phone, address, and name from latest customer message asynchronously
                const latestCustomerMsg = newMessagesToInsert
                  .filter((m) => m.sender_type === 'customer' && m.content_text)
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                  )[0]

                if (latestCustomerMsg) {
                  autoUpdateContactFromChatMessage({
                    contactId,
                    accountId: actualAccountId,
                    messageText: latestCustomerMsg.content_text,
                    supabase: db,
                  }).catch(() => {})
                }
              } else {
                dbErrors.push(`Message insert error: ${insertErr.message}`)
              }
            }
          } catch (itemErr: any) {
            console.warn('[Sync conversation item error]:', itemErr)
          }
        })
      )
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
