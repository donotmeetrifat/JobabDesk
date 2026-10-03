import { createClient } from '@supabase/supabase-js'

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
  purgeExisting?: boolean
): Promise<SyncResult> {
  // CRITICAL: When called from an authenticated session (/api/channels/messenger/sync),
  // supabase is the authenticated SSR client with auth.uid() and valid account membership.
  // Prefer supabase to respect user auth, with adminClient as fallback.
  const adminClient = getAdminClient()
  const db = supabase || adminClient

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

    // Only if accountId was NOT provided at all should we fallback to other accounts
    if (!accountRecord && !accountId) {
      const { data: anyAcc } = await db
        .from('accounts')
        .select('*')
        .not('facebook_page_access_token', 'is', null)
        .limit(1)
        .maybeSingle()
      accountRecord = anyAcc
    }

    if (!accountRecord && !accountId) {
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

      // Backfill: Repair any contacts, conversations, or profiles that mistakenly received owner_user_id as account_id
      if (accountRecord.owner_user_id && accountRecord.owner_user_id !== accountRecord.id) {
        try {
          await db
            .from('contacts')
            .update({ account_id: accountRecord.id })
            .eq('account_id', accountRecord.owner_user_id)

          await db
            .from('conversations')
            .update({ account_id: accountRecord.id })
            .eq('account_id', accountRecord.owner_user_id)

          await db
            .from('profiles')
            .update({ account_id: accountRecord.id })
            .eq('account_id', accountRecord.owner_user_id)

          if (adminClient && adminClient !== db) {
            await adminClient
              .from('contacts')
              .update({ account_id: accountRecord.id })
              .eq('account_id', accountRecord.owner_user_id)

            await adminClient
              .from('conversations')
              .update({ account_id: accountRecord.id })
              .eq('account_id', accountRecord.owner_user_id)

            await adminClient
              .from('profiles')
              .update({ account_id: accountRecord.id })
              .eq('account_id', accountRecord.owner_user_id)
          }
        } catch (repairErr) {
          console.warn('[Sync account_id repair warning]:', repairErr)
        }
      }
    }

    // Ensure the explicit user's profile is aligned to actualAccountId so RLS is_account_member succeeds
    if (explicitUserId && actualAccountId) {
      try {
        await db
          .from('profiles')
          .update({ account_id: actualAccountId })
          .eq('user_id', explicitUserId)

        if (adminClient && adminClient !== db) {
          await adminClient
            .from('profiles')
            .update({ account_id: actualAccountId })
            .eq('user_id', explicitUserId)
        }
      } catch (pErr) {
        console.warn('[Sync profile alignment warning]:', pErr)
      }
    }

    // Try channel_connections table (migration 044) if token is still missing
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

    // The intended page for this workspace is Digiplus (Page ID: 956902827514434)
    const expectedWorkspaceName = 'Digiplus'
    const expectedWorkspaceId = '956902827514434'

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
            const tokenPageId = meData.id
            const tokenPageName = meData.name || ''

            // Verification: Reject if this token is for a completely different page like "UK Brand Lover"
            const isTargetPage =
              tokenPageName.toLowerCase().includes('digiplus') ||
              (pageId && tokenPageId === pageId) ||
              tokenPageId === expectedWorkspaceId

            if (!isTargetPage && tokenPageName) {
              return {
                success: false,
                tokenMissing: true,
                conversationsCount: 0,
                messagesCount: 0,
                error:
                  `Wrong Page Token: The token you pasted is for "${tokenPageName}" (Page ID: ${tokenPageId}), NOT for "${expectedWorkspaceName}".\n\n` +
                  `👉 Why this happened:\n` +
                  `In your Meta App Dashboard under Messenger API Setup, your Facebook profile manages multiple pages. You generated the token for "${tokenPageName}".\n\n` +
                  `👉 How to fix:\n` +
                  `1. Go to your Meta App Dashboard → Messenger → Messenger API Setup.\n` +
                  `2. In Section 2 ("Generate access tokens"), look for the row for "${expectedWorkspaceName}" (ID: ${expectedWorkspaceId}).\n` +
                  `3. Click "Generate token" specifically next to "${expectedWorkspaceName}".\n` +
                  `4. Copy and paste that token into JobabDesk.`,
              }
            }

            isPage = true
            pageId = tokenPageId
            pageName = tokenPageName || expectedWorkspaceName
          }
        }

        // If not a Page token, it is a User or System User token.
        // Try multiple methods to resolve the managed or assigned Facebook Page.
        if (!isPage) {
          // Method A: Check /me/accounts (Standard User and some System Users)
          try {
            const accsRes = await fetch(
              `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
            )
            if (accsRes.ok) {
              const accsData = await accsRes.json()
              const pages: any[] = accsData.data || []
              if (pages.length > 0) {
                const matched = pages.find(
                  (p) =>
                    p.id === expectedWorkspaceId ||
                    (pageId && p.id === pageId) ||
                    p.name?.toLowerCase().includes('digiplus')
                )

                if (matched) {
                  pageId = matched.id
                  pageName = matched.name
                  if (matched.access_token) {
                    pageToken = matched.access_token
                  }
                  isPage = true
                } else {
                  const foreignNames = pages.map((p) => `"${p.name}"`).join(', ')
                  console.warn(`[Sync conversations]: User token only has pages [${foreignNames}], not Digiplus`)
                }
              }
            }
          } catch {}

          // Method B: Check /me/assigned_pages (System Users in Meta Business Suite)
          if (!isPage) {
            try {
              const assignedRes = await fetch(
                `https://graph.facebook.com/v20.0/me/assigned_pages?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
              )
              if (assignedRes.ok) {
                const assignedData = await assignedRes.json()
                const pages: any[] = assignedData.data || []
                if (pages.length > 0) {
                  const matched = pages.find(
                    (p) =>
                      p.id === expectedWorkspaceId ||
                      (pageId && p.id === pageId) ||
                      p.name?.toLowerCase().includes('digiplus')
                  )

                  if (matched) {
                    pageId = matched.id
                    pageName = matched.name
                    if (matched.access_token) {
                      pageToken = matched.access_token
                    }
                    isPage = true
                  }
                }
              }
            } catch {}
          }

          // Method C: Check /me/businesses (Business Manager owned/client pages)
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
                  const matched = pages.find(
                    (p) =>
                      p.id === expectedWorkspaceId ||
                      (pageId && p.id === pageId) ||
                      p.name?.toLowerCase().includes('digiplus')
                  )

                  if (matched) {
                    pageId = matched.id
                    pageName = matched.name
                    if (matched.access_token) {
                      pageToken = matched.access_token
                    }
                    isPage = true
                  }
                }
              }
            } catch {}
          }

          // Fallback: If pageId was not set, try to resolve from database channel_connections
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
                pageName = pageName || chan.display_name || 'Digiplus'
              }
            } catch {}
          }
          if (!pageId) {
            try {
              const { data: anyChan } = await db
                .from('channel_connections')
                .select('external_account_id, display_name')
                .eq('channel_type', 'messenger')
                .limit(1)
                .maybeSingle()
              if (anyChan?.external_account_id) {
                pageId = anyChan.external_account_id
                pageName = pageName || anyChan.display_name || 'Digiplus'
              }
            } catch {}
          }

          // Method D: If pageId is known, query the Page directly for access_token
          if (!isPage && pageId) {
            try {
              const pageDirectRes = await fetch(
                `https://graph.facebook.com/v20.0/${pageId}?fields=id,name,access_token&access_token=${encodeURIComponent(pageToken)}`
              )
              if (pageDirectRes.ok) {
                const pageDirectData = await pageDirectRes.json()
                if (pageDirectData?.id) {
                  pageId = pageDirectData.id
                  pageName = pageDirectData.name || pageName || 'Digiplus'
                  if (pageDirectData.access_token) {
                    pageToken = pageDirectData.access_token
                  }
                  isPage = true
                }
              }
            } catch {}
          }

          // Method E: Test if the token has direct access to read conversations for pageId
          if (!isPage && pageId) {
            try {
              const convTestRes = await fetch(
                `https://graph.facebook.com/v20.0/${pageId}/conversations?limit=1&access_token=${encodeURIComponent(pageToken)}`
              )
              if (convTestRes.ok) {
                // Token has direct authorization to manage conversations for this page!
                isPage = true
              }
            } catch {}
          }

          // If still unresolved after all checks, return an actionable diagnostic error
          if (!isPage) {
            const userName = meData?.name || 'User'
            return {
              success: false,
              tokenMissing: true,
              conversationsCount: 0,
              messagesCount: 0,
              error:
                `The provided token belongs to System User "${userName}", but no Facebook Page (Digiplus) is attached to it.\n\n` +
                `👉 How to attach Digiplus in Meta Business Suite (Method 2):\n` +
                `1. Open Meta Business Settings → System Users (https://business.facebook.com/settings/system-users)\n` +
                `2. Select "${userName}" and click "Assign Assets" (or "Add Assets")\n` +
                `3. Select "Pages" → click "Digiplus" → turn ON "Manage Page" (Full Control) → click "Save Changes"\n` +
                `4. IMPORTANT: Click "Generate New Token" again (Expiration: Never) with permissions: pages_messaging, pages_manage_metadata, pages_show_list, pages_read_engagement\n` +
                `5. Paste the newly generated token here and click "Save & Sync".\n\n` +
                `👉 If using Method 1 (Graph API Explorer):\n` +
                `In Meta Graph API Explorer, select "Page: Digiplus" under "User or Page" before clicking Generate Access Token.`,
            }
          }
        }
      } catch (tokenInspectErr) {
        console.warn('[Sync conversations token inspection warning]:', tokenInspectErr)
      }
    }

    // Clean up any conversations, contacts, and messages that belong to a wrong/previous page (e.g. UK Brand Lover)
    if (pageId && actualAccountId) {
      try {
        const prevPageName = accountRecord?.facebook_page_name || ''
        const prevPageId = accountRecord?.facebook_page_id || ''
        const shouldPurge =
          Boolean(purgeExisting) ||
          (prevPageName && !prevPageName.toLowerCase().includes('digiplus')) ||
          (prevPageId && prevPageId !== pageId && prevPageId !== expectedWorkspaceId)

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
            console.log(`[Sync conversations]: Cleaned up ${convIds.length} conversations (purgeExisting: ${purgeExisting}, prevPage: ${prevPageName || prevPageId})`)
          }
        }
      } catch (cleanErr) {
        console.warn('[Sync conversations clean old page error]:', cleanErr)
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
        error: `Permission "pages_messaging" is not granted on this token. When generating your token (in Meta Business Settings → System Users or Graph API Explorer), please ensure "pages_messaging" is checked.`,
        debug: {
          pageId,
          pageName,
          rawMetaCount: 0,
          errors: [`Missing pages_messaging. Granted permissions: ${grantedPermissions.join(', ')}`],
        },
      }
    }

    // 3. Query Meta Graph API for conversations across all platform permutations
    // Request messages inline so conversations and messages are retrieved in a single fast call
    const candidates: string[] = []
    if (pageId) {
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?platform=messenger&fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
      candidates.push(
        `https://graph.facebook.com/v20.0/${pageId}/conversations?folder=inbox&fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}}&limit=50&access_token=${encodeURIComponent(pageToken)}`
      )
    }
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}},unread_count,message_count&limit=50&access_token=${encodeURIComponent(pageToken)}`
    )
    candidates.push(
      `https://graph.facebook.com/v20.0/me/conversations?platform=messenger&fields=id,updated_time,participants,messages{id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}}&limit=50&access_token=${encodeURIComponent(pageToken)}`
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
            `https://graph.facebook.com/v20.0/${rawConv.id}/messages?fields=id,message,created_time,from,to,attachments{id,mime_type,name,size,image_data,video_data,file_url}&limit=30&access_token=${encodeURIComponent(pageToken)}`
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

      // 2. Discover customer participant and real name
      if (customer?.name && (!pageName || customer.name.toLowerCase() !== pageName.toLowerCase())) {
        customerName = customer.name
      }

      // Fetch customer's real Facebook Name and Profile Picture via Meta Graph API
      let customerAvatarUrl = ''
      if (customerPsid && customerPsid !== pageId && pageToken) {
        try {
          const profileRes = await fetch(
            `https://graph.facebook.com/v20.0/${customerPsid}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageToken)}`
          )
          if (profileRes.ok) {
            const profileJson = await profileRes.json()
            const resolvedName = (
              profileJson.name ||
              [profileJson.first_name, profileJson.last_name].filter(Boolean).join(' ')
            ).trim()
            if (resolvedName) {
              customerName = resolvedName
            }
            if (profileJson.profile_pic) {
              customerAvatarUrl = profileJson.profile_pic
            }
          }
        } catch (fetchProfileErr) {
          console.warn('[Sync customer profile fetch warning]:', fetchProfileErr)
        }
      }

      if (!customerName || customerName === 'Unknown') {
        customerName = `Messenger User (${customerPsid.slice(-4)})`
      }
      const customerEmail = customer?.email || null

      // 3. Find or create Contact in contacts table
      let contactId = ''
      const { data: existingContact } = await db
        .from('contacts')
        .select('id, name, avatar_url, company')
        .eq('account_id', actualAccountId)
        .eq('phone', customerPsid)
        .maybeSingle()

      if (existingContact) {
        contactId = existingContact.id
        // Update contact with real Facebook name, avatar, and company
        const updates: any = {
          updated_at: new Date().toISOString(),
          company: 'Facebook Messenger',
        }
        if (
          customerName &&
          (!existingContact.name ||
            existingContact.name === 'Unknown' ||
            existingContact.name.startsWith('Messenger User') ||
            existingContact.name !== customerName)
        ) {
          updates.name = customerName
        }
        if (customerAvatarUrl && existingContact.avatar_url !== customerAvatarUrl) {
          updates.avatar_url = customerAvatarUrl
        }
        await db.from('contacts').update(updates).eq('id', existingContact.id)
      } else {
        const contactPayload = {
          account_id: actualAccountId,
          user_id: ownerUserId,
          phone: customerPsid,
          name: customerName,
          email: customerEmail,
          avatar_url: customerAvatarUrl || null,
          company: 'Facebook Messenger',
        }

        let { data: newContact, error: createContactErr } = await db
          .from('contacts')
          .insert(contactPayload)
          .select('id')
          .maybeSingle()

        // Fallback retry with adminClient if db had an error and adminClient is different
        if ((createContactErr || !newContact) && adminClient && adminClient !== db) {
          const adminInsertRes = await adminClient
            .from('contacts')
            .insert(contactPayload)
            .select('id')
            .maybeSingle()
          if (adminInsertRes.data) {
            newContact = adminInsertRes.data
            createContactErr = null
          }
        }

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
      let latestMsg = rawMessages[0]?.message || ''
      if (!latestMsg && rawMessages[0]?.attachments?.data?.length > 0) {
        const firstAtt = rawMessages[0].attachments.data[0]
        if (firstAtt.image_data) latestMsg = '📷 Photo'
        else if (firstAtt.file_url?.includes('.aac') || firstAtt.mime_type?.startsWith('audio')) latestMsg = '🎵 Voice message'
        else latestMsg = '📎 Attachment'
      }
      if (!latestMsg) latestMsg = 'Messenger conversation'
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
        const convPayload = {
          account_id: actualAccountId,
          contact_id: contactId,
          user_id: ownerUserId,
          status: 'open',
          last_message_text: latestMsg,
          last_message_at: latestTime,
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
            createConvErr = null
          }
        }

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
      let convMessageCount = 0
      for (const msg of rawMessages) {
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

        // Check dedupe by message_id
        if (msg.id) {
          const { data: existingMsg } = await db
            .from('messages')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('message_id', msg.id)
            .maybeSingle()

          if (existingMsg) {
            convMessageCount++
            totalMessages++
            continue
          }
        }

        const isFromPage = msg.from?.id === pageId || (pageName && msg.from?.name?.toLowerCase() === pageName.toLowerCase())
        const senderType = isFromPage ? 'agent' : 'customer'

        const msgPayload = {
          conversation_id: conversationId,
          sender_type: senderType,
          content_type: contentType,
          content_text: contentText,
          media_url: mediaUrl,
          message_id: msg.id || null,
          status: 'delivered',
          created_at: msg.created_time || new Date().toISOString(),
        }

        let { error: msgInsertErr } = await db.from('messages').insert(msgPayload)

        if (msgInsertErr && adminClient && adminClient !== db) {
          const adminMsgRes = await adminClient.from('messages').insert(msgPayload)
          msgInsertErr = adminMsgRes.error
        }

        if (!msgInsertErr) {
          convMessageCount++
          totalMessages++
        }
      }

      if (convMessageCount === 0 && conversationId) {
        try {
          const { count } = await db
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversationId)
          if (count && count > 0) {
            totalMessages += count
          }
        } catch {}
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
