import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

async function resolveOwnerUserId(db: any, accountId: string): Promise<string> {
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
}

export async function syncFacebookMessengerConversations(
  accountId: string,
  explicitPageId?: string,
  explicitPageToken?: string,
  supabase?: any
): Promise<SyncResult> {
  // Always use admin client to bypass RLS and guarantee full write/read access
  const db = getAdminClient()

  try {
    // 1. Fetch account Facebook credentials
    let pageId = explicitPageId
    let pageToken = explicitPageToken
    let pageName = ''
    let actualAccountId = accountId

    if (!pageId || !pageToken) {
      let account: any = null

      // Try 1: Dual lookup on id or owner_user_id
      if (accountId) {
        const { data } = await db
          .from('accounts')
          .select('*')
          .or(`id.eq.${accountId},owner_user_id.eq.${accountId}`)
          .maybeSingle()
        account = data
      }

      // Try 2: Any account with facebook_page_id
      if (!account || !account.facebook_page_id) {
        const { data: anyAcc } = await db
          .from('accounts')
          .select('*')
          .not('facebook_page_id', 'is', null)
          .limit(1)
          .maybeSingle()
        if (anyAcc?.facebook_page_id) {
          account = anyAcc
        }
      }

      // Try 3: Any account with facebook_page_access_token
      if (!account || !account.facebook_page_access_token) {
        const { data: anyTokenAcc } = await db
          .from('accounts')
          .select('*')
          .not('facebook_page_access_token', 'is', null)
          .limit(1)
          .maybeSingle()
        if (anyTokenAcc?.facebook_page_access_token) {
          account = anyTokenAcc
        }
      }

      if (account) {
        actualAccountId = account.id || actualAccountId
        pageId = pageId || (account.facebook_page_id || account.fb_page_id || '').trim()
        pageToken = pageToken || (account.facebook_page_access_token || '').trim()
        pageName = (account.facebook_page_name || account.fb_page_name || pageId).trim()
      }
    }

    if (!pageId || !pageToken) {
      console.warn('[Sync Facebook Messenger]: No page credentials found for accountId:', accountId)
      return {
        success: false,
        conversationsCount: 0,
        messagesCount: 0,
        error: 'Facebook Page ID or Page Access Token is missing. Please connect Facebook Messenger first.',
      }
    }

    const ownerUserId = await resolveOwnerUserId(db, actualAccountId)

    // 2. Query Meta Graph API for conversations
    // fields: id, updated_time, participants, senders, messages
    const graphUrl = `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=id,updated_time,participants,senders,messages.limit(20){id,message,created_time,from,to}&limit=50&access_token=${encodeURIComponent(pageToken)}`

    const res = await fetch(graphUrl)
    const data = await res.json()

    if (!res.ok || data.error) {
      console.error('[Meta Graph API conversations error]:', data.error)
      return {
        success: false,
        conversationsCount: 0,
        messagesCount: 0,
        error: data.error?.message || 'Failed to fetch conversations from Meta Graph API.',
      }
    }

    const rawConversations: Array<any> = data.data || []
    let totalConversations = 0
    let totalMessages = 0

    for (const rawConv of rawConversations) {
      // Find customer participant (the one whose id is NOT the pageId)
      const participants: Array<{ id: string; name: string; email?: string }> =
        rawConv.participants?.data || rawConv.senders?.data || []

      const customer = participants.find((p) => p.id !== pageId) || participants[0]
      if (!customer || !customer.id) continue

      const customerPsid = customer.id
      const customerName = customer.name || `Messenger User (${customerPsid.slice(-4)})`
      const customerEmail = customer.email || null

      // 3. Find or create Contact in contacts table
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
            .update({ name: customer.name, channel: 'messenger', updated_at: new Date().toISOString() })
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
            channel: 'messenger',
          })
          .select('id')
          .maybeSingle()

        if (createContactErr || !newContact) {
          console.warn('[Sync contacts insert error]:', createContactErr?.message)
          // Raced or failed, try selecting again
          const { data: retryContact } = await db
            .from('contacts')
            .select('id')
            .eq('account_id', actualAccountId)
            .eq('phone', customerPsid)
            .maybeSingle()
          contactId = retryContact?.id || ''
        } else {
          contactId = newContact.id
        }
      }

      if (!contactId) continue

      // 4. Find or create Conversation in conversations table
      const rawMessages: Array<any> = rawConv.messages?.data || []
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
