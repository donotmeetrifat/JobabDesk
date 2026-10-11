import { createClient } from '@supabase/supabase-js'
import { autoUpdateContactFromChatMessage } from '@/lib/contacts/auto-extract'
import { fetchMetaUserProfile } from '@/lib/messenger/profile'
import { isFacebookPsid } from '@/lib/contacts/extract-info'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (anonKey && anonKey.trim().length > 0) {
    return createClient(url, anonKey.trim())
  }
  return null
}

async function resolveOwnerUserId(db: any, accountId: string, explicitUserId?: string): Promise<string> {
  if (explicitUserId) return explicitUserId

  const { data: acc } = await db
    .from('accounts')
    .select('owner_user_id')
    .eq('id', accountId)
    .maybeSingle()

  if (acc?.owner_user_id) return acc.owner_user_id

  const { data: prof } = await db
    .from('profiles')
    .select('user_id')
    .eq('account_id', accountId)
    .limit(1)
    .maybeSingle()

  if (prof?.user_id) return prof.user_id

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
  const dbErrors: string[] = []

  try {
    // 1. Resolve guaranteed account and credentials
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

    if (!accountRecord && explicitUserId) {
      const { data: prof } = await db
        .from('profiles')
        .select('account_id')
        .eq('user_id', explicitUserId)
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

    if (accountRecord?.id) {
      actualAccountId = accountRecord.id
      pageId = pageId || (accountRecord.facebook_page_id || accountRecord.fb_page_id || '').trim()
      pageToken = pageToken || (accountRecord.facebook_page_access_token || '').trim()
      pageName = (accountRecord.facebook_page_name || accountRecord.fb_page_name || accountRecord.name || '').trim()
    }

    // Try channel_connections table if credentials still missing
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

    // Resolve Page ID, Page Name, and Page Access Token from token if present
    if (pageToken) {
      try {
        // Step 1: Check token directly via /me with universal fields (supported by both User and Page nodes)
        const meRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${encodeURIComponent(pageToken)}`
        )
        let isPage = false
        let meData: any = null
        if (meRes.ok) {
          meData = await meRes.json()
        }

        // Test if /me/accounts exists (User token) or fails with #100 (Page token)
        try {
          const accsRes = await fetch(
            `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
          )
          const accsData = await accsRes.json().catch(() => ({}))
          const pages: any[] = accsData?.data || []
          if (pages.length > 0) {
            // User Access Token that has managed Pages
            const matched = pageId
              ? (pages.find(
                  (p: any) =>
                    p.id === pageId ||
                    (p.name && pageId && p.name.trim().toLowerCase() === pageId.trim().toLowerCase())
                ) || pages[0])
              : pages[0]
            if (matched) {
              pageId = matched.id
              pageName = matched.name || pageName || 'Facebook Page'
              if (matched.access_token) pageToken = matched.access_token
              isPage = true
            }
          } else if (accsData?.error?.code === 100) {
            // Error 100 on /me/accounts proves this is a Page node
            if (meData?.id) {
              pageId = meData.id
              pageName = meData.name || pageName || 'Facebook Page'
              isPage = true
            }
          }
        } catch {}

        // Fallback: If /me returned an id and no user accounts found, /me is the Page itself
        if (!isPage && meData?.id) {
          pageId = pageId || meData.id
          pageName = pageName || meData.name || 'Facebook Page'
          isPage = true
        }

        // Step 2: If numeric pageId is known, verify Page Name and ensure we hold the real Page token
        if (pageId && /^\d+$/.test(pageId)) {
          try {
            const pageInfoRes = await fetch(
              `https://graph.facebook.com/v20.0/${pageId}?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
            )
            if (pageInfoRes.ok) {
              const pData = await pageInfoRes.json()
              if (pData?.name) pageName = pData.name
              if (pData?.access_token) pageToken = pData.access_token
            }
          } catch {}
        }
      } catch (tokenInspectErr) {
        console.warn('[Sync conversations token inspection warning]:', tokenInspectErr)
      }
    }

    // Clean up if specifically requested
    if (pageId && actualAccountId && purgeExisting) {
      try {
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

    // Resolve ownerUserId
    let ownerUserId = explicitUserId || accountRecord?.owner_user_id || ''
    if (!ownerUserId && actualAccountId) {
      ownerUserId = await resolveOwnerUserId(db, actualAccountId, explicitUserId)
    }
    if (!ownerUserId) {
      const { data: p } = await db.from('profiles').select('user_id').limit(1).maybeSingle()
      ownerUserId = p?.user_id || ''
    }

    // 2. Fetch conversations from Meta Graph API
    const syncLimit = Math.min(Math.max(limit || 50, 10), 100)

    // Clean, robust fields supported across all Meta Graph API versions for UnifiedThread
    const convFields = 'id,updated_time,participants,senders,unread_count,message_count'

    const candidates: string[] = []
    if (pageId && /^\d+$/.test(pageId)) {
      // 1. Messenger platform (Inbox) - REQUIRED platform=messenger in Meta v17+
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
      // 2. Messenger platform (Archived / Done folder in Meta Business Suite)
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&folder=page_done&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
      // 3. Messenger platform (Other / Filtered folder)
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&folder=other&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
      // 4. Instagram Direct platform (if linked to page)
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=instagram&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
      // 5. Unrestricted platform fallback
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
      )
    }

    // Fallbacks using /me (which evaluates to the Page when using a Page Access Token)
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?platform=messenger&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
    )
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?platform=messenger&folder=page_done&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
    )
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?platform=instagram&fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
    )
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?fields=${convFields}&limit=${syncLimit}&access_token=${encodeURIComponent(pageToken)}`
    )

    let rawConversations: Array<any> = []
    const seenConvIds = new Set<string>()
    const errorsEncountered: string[] = []
    let anyEndpointSucceeded = false

    for (const url of candidates) {
      try {
        const cRes = await fetch(url)
        const cData = await cRes.json()
        if (cRes.ok && Array.isArray(cData?.data)) {
          anyEndpointSucceeded = true
          for (const item of cData.data) {
            if (item?.id && !seenConvIds.has(item.id)) {
              seenConvIds.add(item.id)
              rawConversations.push(item)
            }
          }
        } else if (cData?.error) {
          const errMsg = cData.error.message || `Error ${cData.error.code}`
          errorsEncountered.push(errMsg)
        }
      } catch (cErr: any) {
        console.warn('[Sync conversations network error]:', cErr?.message)
      }
    }

    if (rawConversations.length === 0 && !anyEndpointSucceeded && errorsEncountered.length > 0) {
      const topError = errorsEncountered[0]
      return {
        success: false,
        tokenMissing: topError.toLowerCase().includes('token'),
        conversationsCount: 0,
        messagesCount: 0,
        error: topError,
        debug: {
          pageId,
          pageName: pageName || accountRecord?.facebook_page_name || accountRecord?.name || 'Facebook Page',
          rawMetaCount: 0,
          errors: errorsEncountered,
        },
      }
    }

    // Auto-subscribe page to webhooks in background
    if (pageId && /^\d+$/.test(pageId)) {
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
        pageName: pageName || accountRecord?.facebook_page_name || accountRecord?.name || 'Facebook Page',
        debug: { pageId, pageName, rawMetaCount: 0 },
      }
    }

    // Shared in-memory contact cache for this sync pass to prevent redundant DB calls
    const contactCache = new Map<string, any>()
    let totalConversations = 0
    let totalMessages = 0

    // Process each conversation
    const processConversation = async (rawConv: any) => {
      try {
        let rawMessages: any[] = rawConv.messages?.data || []

        // Combine BOTH senders and participants so neither is ignored
        const allPeople: Array<{ id: string; name?: string; email?: string }> = [
          ...(rawConv.senders?.data || []),
          ...(rawConv.participants?.data || []),
        ]

        let customerPsid = ''
        let customerName = ''
        let customerEmail: string | null = null

        // 1. Resolve customer from senders / participants (excluding the Page itself)
        for (const p of allPeople) {
          if (p?.id && p.id !== pageId && (!pageName || p.name?.toLowerCase() !== pageName.toLowerCase())) {
            customerPsid = p.id
            customerName = p.name || ''
            customerEmail = p.email || null
            break
          }
        }

        // 2. If not found, inspect inline messages
        if (!customerPsid && rawMessages.length > 0) {
          for (const m of rawMessages) {
            if (m.from?.id && m.from.id !== pageId && (!pageName || m.from?.name?.toLowerCase() !== pageName.toLowerCase())) {
              customerPsid = m.from.id
              if (!customerName) customerName = m.from.name || ''
              break
            }
          }
        }

        // 3. Extract PSID from thread ID (e.g. t_1000847291823 or t_pageId_psid)
        if (!customerPsid && rawConv.id) {
          const parts = rawConv.id.replace(/^t_/, '').split('_')
          for (const part of parts) {
            if (part && part !== pageId && /^\d+$/.test(part)) {
              customerPsid = part
              break
            }
          }
        }

        // 4. If messages are empty, fetch thread messages from Meta Graph API
        if (rawMessages.length === 0 && rawConv.id) {
          try {
            const threadRes = await fetch(
              `https://graph.facebook.com/v20.0/${rawConv.id}/messages?fields=id,message,created_time,from,to,attachments&limit=15&access_token=${encodeURIComponent(pageToken)}`
            )
            if (threadRes.ok) {
              const threadData = await threadRes.json()
              const fetched = threadData.data || []
              if (fetched.length > 0) {
                rawMessages = fetched
                if (!customerPsid) {
                  for (const m of fetched) {
                    if (m.from?.id && m.from.id !== pageId && (!pageName || m.from?.name?.toLowerCase() !== pageName.toLowerCase())) {
                      customerPsid = m.from.id
                      if (!customerName) customerName = m.from.name || ''
                      break
                    }
                  }
                }
              }
            }
          } catch (tErr: any) {
            console.warn('[Sync thread messages fetch warning]:', tErr?.message)
          }
        }

        // 5. Ultimate fallback for customerPsid
        if (!customerPsid) {
          if (rawConv.id) {
            customerPsid = rawConv.id.replace(/^t_/, '')
          }
        }

        if (!customerPsid) {
          dbErrors.push(`Could not determine customer ID for thread ${rawConv.id}`)
          return
        }

        // 6. Resolve or Create Contact
        let contact = contactCache.get(customerPsid)

        if (!contact) {
          // A. Guaranteed query: find by phone = customerPsid (always indexed, guaranteed column)
          const { data: existingByPhone } = await db
            .from('contacts')
            .select('id, name, avatar_url, phone')
            .eq('account_id', actualAccountId)
            .eq('phone', customerPsid)
            .maybeSingle()

          if (existingByPhone) {
            contact = existingByPhone
          }
        }

        if (!contact) {
          // B. Optional query: find by messenger_id column if present in table
          try {
            const { data: existingByMessenger } = await db
              .from('contacts')
              .select('id, name, avatar_url, phone')
              .eq('account_id', actualAccountId)
              .eq('messenger_id', customerPsid)
              .maybeSingle()

            if (existingByMessenger) {
              contact = existingByMessenger
            }
          } catch {}
        }

        if (contact) {
          // If contact lacks avatar_url or has placeholder name, resolve from Meta profile
          const needsProfile =
            !contact.avatar_url ||
            !contact.name ||
            contact.name === 'Unknown' ||
            contact.name.startsWith('Messenger User')
          if (needsProfile && pageToken && customerPsid) {
            try {
              const metaProfile = await fetchMetaUserProfile(customerPsid, pageToken)
              if (metaProfile?.name || metaProfile?.avatarUrl) {
                const updates: Record<string, any> = {
                  updated_at: new Date().toISOString(),
                  company: 'Facebook Messenger',
                  messenger_id: customerPsid,
                }
                if (metaProfile.name) {
                  updates.name = metaProfile.name
                  contact.name = metaProfile.name
                }
                if (metaProfile.avatarUrl) {
                  updates.avatar_url = metaProfile.avatarUrl
                  contact.avatar_url = metaProfile.avatarUrl
                }
                await db.from('contacts').update(updates).eq('id', contact.id)
              }
            } catch {}
          }
        }

        if (!contact) {
          let resolvedAvatarUrl: string | null = null
          if (pageToken && customerPsid) {
            try {
              const metaProfile = await fetchMetaUserProfile(customerPsid, pageToken)
              if (metaProfile?.name) customerName = metaProfile.name
              if (metaProfile?.avatarUrl) resolvedAvatarUrl = metaProfile.avatarUrl
            } catch {}
          }

          if (!customerName || customerName.trim() === '' || customerName === 'Unknown') {
            customerName = `Messenger User (${customerPsid.slice(-4)})`
          }

          const basePayload = {
            account_id: actualAccountId,
            user_id: ownerUserId,
            phone: customerPsid,
            name: customerName,
            email: customerEmail && !customerEmail.endsWith('@facebook.com') ? customerEmail : null,
            avatar_url: resolvedAvatarUrl,
            company: 'Facebook Messenger',
          }

          let newContact: any = null
          let insertErr: any = null

          // Try insert with messenger_id first
          const ins1 = await db
            .from('contacts')
            .insert({ ...basePayload, messenger_id: customerPsid })
            .select('id, name, avatar_url, phone')
            .maybeSingle()

          if (ins1.data) {
            newContact = ins1.data
          } else {
            insertErr = ins1.error
            // If messenger_id column does not exist, retry without it
            if (ins1.error?.message?.toLowerCase().includes('messenger_id')) {
              const ins2 = await db
                .from('contacts')
                .insert(basePayload)
                .select('id, name, avatar_url, phone')
                .maybeSingle()
              if (ins2.data) {
                newContact = ins2.data
                insertErr = null
              } else {
                insertErr = ins2.error
              }
            }
          }

          // If insert failed due to duplicate key or unique index constraint on phone
          if (!newContact) {
            const { data: retryContact } = await db
              .from('contacts')
              .select('id, name, avatar_url, phone')
              .eq('account_id', actualAccountId)
              .eq('phone', customerPsid)
              .maybeSingle()

            if (retryContact) {
              newContact = retryContact
              insertErr = null
            } else {
              const digitsOnly = customerPsid.replace(/\D/g, '')
              if (digitsOnly) {
                const { data: digitContact } = await db
                  .from('contacts')
                  .select('id, name, avatar_url, phone')
                  .eq('account_id', actualAccountId)
                  .eq('phone', digitsOnly)
                  .maybeSingle()
                if (digitContact) {
                  newContact = digitContact
                  insertErr = null
                }
              }
            }
          }

          if (newContact) {
            contact = newContact
          } else if (insertErr) {
            dbErrors.push(`Contact create (${customerPsid}): ${insertErr.message}`)
          }
        }

        if (!contact?.id) {
          dbErrors.push(`Failed to resolve contact for customer ${customerPsid}`)
          return
        }

        contactCache.set(customerPsid, contact)
        const contactId = contact.id

        // 7. Resolve latest message & timestamp
        let latestMsg = rawMessages[0]?.message || ''
        if (!latestMsg && rawMessages[0]?.attachments?.data?.length > 0) {
          const firstAtt = rawMessages[0].attachments.data[0]
          if (firstAtt.image_data) latestMsg = '📷 Photo'
          else if (firstAtt.file_url?.includes('.aac') || firstAtt.mime_type?.startsWith('audio')) latestMsg = '🎵 Voice message'
          else latestMsg = '📎 Attachment'
        }
        if (!latestMsg) latestMsg = 'Messenger conversation'
        const latestTime = rawMessages[0]?.created_time || rawConv.updated_time || new Date().toISOString()

        // 8. Resolve or Create Conversation
        let conversationId = ''
        const { data: existingConv } = await db
          .from('conversations')
          .select('id')
          .eq('account_id', actualAccountId)
          .eq('contact_id', contactId)
          .maybeSingle()

        if (existingConv) {
          conversationId = existingConv.id
          try {
            await db
              .from('conversations')
              .update({
                last_message_text: latestMsg,
                last_message_at: latestTime,
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversationId)
          } catch {}
        } else {
          const convPayload = {
            account_id: actualAccountId,
            contact_id: contactId,
            user_id: ownerUserId,
            status: 'open',
            last_message_text: latestMsg,
            last_message_at: latestTime,
            unread_count: 0,
          }

          const { data: newConv, error: convErr } = await db
            .from('conversations')
            .insert(convPayload)
            .select('id')
            .maybeSingle()

          if (newConv?.id) {
            conversationId = newConv.id
          } else {
            const { data: retryConv } = await db
              .from('conversations')
              .select('id')
              .eq('account_id', actualAccountId)
              .eq('contact_id', contactId)
              .maybeSingle()

            if (retryConv?.id) {
              conversationId = retryConv.id
            } else if (convErr) {
              dbErrors.push(`Conv create (${contactId}): ${convErr.message}`)
            }
          }
        }

        if (!conversationId) {
          dbErrors.push(`Failed to resolve conversation for contact ${contactId}`)
          return
        }

        totalConversations++

        // 9. Ingest Messages in Bulk
        if (rawMessages.length > 0) {
          const msgIds = rawMessages.map((m: any) => m.id).filter(Boolean)
          const existingMsgSet = new Set<string>()

          if (msgIds.length > 0) {
            const { data: existingMsgs } = await db
              .from('messages')
              .select('message_id')
              .eq('conversation_id', conversationId)
              .in('message_id', msgIds)

            if (existingMsgs) {
              for (const em of existingMsgs) {
                if (em.message_id) existingMsgSet.add(em.message_id)
              }
            }
          }

          const toInsert: any[] = []

          for (const msg of rawMessages) {
            if (msg.id && existingMsgSet.has(msg.id)) {
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

            toInsert.push({
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

          if (toInsert.length > 0) {
            const { error: msgInsertErr } = await db.from('messages').insert(toInsert)
            if (!msgInsertErr) {
              totalMessages += toInsert.length

              // Auto-extract customer phone, address asynchronously
              const latestCustomerMsg = toInsert
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
              dbErrors.push(`Message insert error: ${msgInsertErr.message}`)
            }
          }
        }
      } catch (convErr: any) {
        console.error('[Sync conversation error]:', convErr)
        dbErrors.push(`Conversation error: ${convErr?.message || 'Unknown'}`)
      }
    }

    // Process all conversations concurrently in chunks of 8
    const CHUNK_SIZE = 8
    for (let i = 0; i < rawConversations.length; i += CHUNK_SIZE) {
      const chunk = rawConversations.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map((c) => processConversation(c)))
    }

    // Background batch-heal for existing Messenger contacts in this account with missing avatars or placeholder names
    if (pageToken) {
      try {
        const { data: missingAvatars } = await db
          .from('contacts')
          .select('id, name, phone, messenger_id, avatar_url')
          .eq('account_id', actualAccountId)
          .is('avatar_url', null)
          .limit(25)

        if (missingAvatars && missingAvatars.length > 0) {
          for (const mc of missingAvatars) {
            const psid = mc.messenger_id || (isFacebookPsid(mc.phone) ? mc.phone : null)
            if (psid) {
              const prof = await fetchMetaUserProfile(psid, pageToken)
              if (prof?.avatarUrl || prof?.name) {
                const up: Record<string, any> = { updated_at: new Date().toISOString() }
                if (prof.avatarUrl) up.avatar_url = prof.avatarUrl
                if (prof.name) up.name = prof.name
                await db.from('contacts').update(up).eq('id', mc.id)
              }
            }
          }
        }
      } catch {}
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
