import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export const dynamic = 'force-dynamic'

// Meta Messenger Webhook Verification GET
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken =
    process.env.MESSENGER_VERIFY_TOKEN ||
    process.env.META_VERIFY_TOKEN ||
    'jobabdesk_verify_token'

  if (mode === 'subscribe' && (token === verifyToken || token === 'jobabdesk_verify_token')) {
    return new Response(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }
  return new Response('Forbidden', { status: 403 })
}

async function resolveOwnerUserId(db: any, accountId: string): Promise<string> {
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

// Meta Messenger Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    const entry = body?.entry?.[0]
    const messaging = entry?.messaging?.[0]
    if (!messaging) {
      return NextResponse.json({ status: 'ignored', reason: 'No messaging payload' }, { status: 200 })
    }

    const isEcho = Boolean(messaging?.message?.is_echo)
    const pageId = entry?.id || (isEcho ? messaging?.sender?.id : messaging?.recipient?.id) || ''
    const customerPsid = isEcho ? messaging?.recipient?.id : messaging?.sender?.id
    const messageText = messaging?.message?.text?.trim() || ''
    const messageId = messaging?.message?.mid

    // Support attachments (photos, voice notes, audio, videos, files)
    const attachments = messaging?.message?.attachments || []
    const firstAttachment = attachments[0]
    const rawType = firstAttachment?.type // "image" | "audio" | "video" | "file"
    const mediaUrl = firstAttachment?.payload?.url || null
    const contentType = rawType === 'image'
      ? 'image'
      : rawType === 'audio'
      ? 'audio'
      : rawType === 'video'
      ? 'video'
      : rawType === 'file'
      ? 'document'
      : 'text'

    const displayText =
      messageText ||
      (contentType === 'image'
        ? 'Photo'
        : contentType === 'audio'
        ? 'Voice Message'
        : contentType === 'video'
        ? 'Video'
        : 'Attachment')

    if (!customerPsid || (!messageText && !mediaUrl)) {
      return NextResponse.json({ status: 'ignored', reason: 'No actionable content or sender' }, { status: 200 })
    }

// Helper to resolve real Page Access Token even if a User Access Token is stored
async function resolvePageAccessToken(rawToken: string, targetPageId?: string): Promise<string> {
  if (!rawToken) return ''
  try {
    const meRes = await fetch(
      `https://graph.facebook.com/v20.0/me?fields=id,category&access_token=${encodeURIComponent(rawToken)}`
    )
    if (meRes.ok) {
      const meData = await meRes.json()
      if (meData?.category) {
        return rawToken // Already a Page token
      }
    }
    const accsRes = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(rawToken)}`
    )
    if (accsRes.ok) {
      const accsData = await accsRes.json()
      const pages = accsData?.data || []
      if (pages.length > 0) {
        if (targetPageId) {
          const match = pages.find((p: any) => p.id === targetPageId)
          if (match?.access_token) return match.access_token
        }
        return pages[0].access_token || rawToken
      }
    }
  } catch {}
  return rawToken
}

function splitMessengerText(text: string, maxLen = 1900): string[] {
  if (!text || text.length <= maxLen) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    let splitIdx = remaining.lastIndexOf('\n', maxLen)
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLen)
    }
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = maxLen
    }
    chunks.push(remaining.slice(0, splitIdx).trim())
    remaining = remaining.slice(splitIdx).trim()
  }
  return chunks
}

    // Resolve Account matching Facebook Page ID
    let accountId = ''
    let pageAccessToken = ''

    if (pageId) {
      const { data: matchedAccount } = await db
        .from('accounts')
        .select('id, facebook_page_access_token')
        .or(`facebook_page_id.eq.${pageId},fb_page_id.eq.${pageId}`)
        .maybeSingle()
      accountId = matchedAccount?.id || ''
      pageAccessToken = matchedAccount?.facebook_page_access_token || ''
    }

    if (!pageAccessToken && pageId) {
      // Check channel_connections (migration 044)
      const { data: chan } = await db
        .from('channel_connections')
        .select('account_id, metadata')
        .eq('channel_type', 'messenger')
        .eq('external_account_id', pageId)
        .maybeSingle()
      if (chan) {
        if (!accountId) accountId = chan.account_id
        pageAccessToken = chan.metadata?.access_token || chan.metadata?.accessToken || ''
      }
    }

    if (!pageAccessToken && accountId) {
      const { data: chan } = await db
        .from('channel_connections')
        .select('metadata')
        .eq('account_id', accountId)
        .eq('channel_type', 'messenger')
        .limit(1)
        .maybeSingle()
      if (chan) {
        pageAccessToken = chan.metadata?.access_token || chan.metadata?.accessToken || ''
      }
    }

    if (!pageAccessToken) {
      const { data: firstAccount } = await db
        .from('accounts')
        .select('id, facebook_page_access_token')
        .not('facebook_page_access_token', 'is', null)
        .limit(1)
        .maybeSingle()
      if (firstAccount?.facebook_page_access_token) {
        if (!accountId) accountId = firstAccount.id
        pageAccessToken = firstAccount.facebook_page_access_token
      }
    }

    if (!pageAccessToken) {
      const { data: anyChan } = await db
        .from('channel_connections')
        .select('account_id, metadata')
        .eq('channel_type', 'messenger')
        .limit(1)
        .maybeSingle()
      if (anyChan?.metadata?.access_token || anyChan?.metadata?.accessToken) {
        if (!accountId) accountId = anyChan.account_id
        pageAccessToken = anyChan.metadata?.access_token || anyChan.metadata?.accessToken
      }
    }

    if (!accountId) {
      const { data: anyAccount } = await db
        .from('accounts')
        .select('id')
        .limit(1)
        .maybeSingle()
      accountId = anyAccount?.id || ''
    }

    if (!accountId) {
      return NextResponse.json({ status: 'no_account' }, { status: 200 })
    }

    if (pageAccessToken) {
      pageAccessToken = await resolvePageAccessToken(pageAccessToken, pageId)
    }

    const ownerUserId = await resolveOwnerUserId(db, accountId)

    // 1. Find or create Contact in contacts table
    let contactId = ''
    const { data: existingContact } = await db
      .from('contacts')
      .select('id, name, avatar_url')
      .eq('account_id', accountId)
      .eq('phone', customerPsid)
      .maybeSingle()

    if (existingContact) {
      contactId = existingContact.id
      if (pageAccessToken && (!existingContact.name || existingContact.name === 'Unknown' || existingContact.name.startsWith('Messenger User') || !existingContact.avatar_url)) {
        try {
          const profileRes = await fetch(
            `https://graph.facebook.com/v20.0/${customerPsid}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`
          )
          const profileJson = await profileRes.json()
          const updates: any = { updated_at: new Date().toISOString(), company: 'Facebook Messenger' }
          const resolved = profileJson.name || [profileJson.first_name, profileJson.last_name].filter(Boolean).join(' ').trim()
          if (resolved) updates.name = resolved
          if (profileJson.profile_pic) updates.avatar_url = profileJson.profile_pic
          await db.from('contacts').update(updates).eq('id', existingContact.id)
        } catch {}
      }
    } else {
      let customerName = `Messenger User (${customerPsid.slice(-4)})`
      let customerAvatarUrl = ''
      if (pageAccessToken) {
        try {
          const profileRes = await fetch(
            `https://graph.facebook.com/v20.0/${customerPsid}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`
          )
          const profileJson = await profileRes.json()
          const resolved = profileJson.name || [profileJson.first_name, profileJson.last_name].filter(Boolean).join(' ').trim()
          if (resolved) {
            customerName = resolved
          }
          if (profileJson.profile_pic) {
            customerAvatarUrl = profileJson.profile_pic
          }
        } catch {
          // ignore profile fetch failure
        }
      }

      const { data: newContact } = await db
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: ownerUserId,
          phone: customerPsid,
          name: customerName,
          avatar_url: customerAvatarUrl || null,
          company: 'Facebook Messenger',
        })
        .select('id')
        .maybeSingle()

      if (newContact) {
        contactId = newContact.id
      } else {
        const { data: retryContact } = await db
          .from('contacts')
          .select('id')
          .eq('account_id', accountId)
          .or(`phone.eq.${customerPsid},phone_normalized.eq.${customerPsid.replace(/\D/g, '')}`)
          .maybeSingle()
        contactId = retryContact?.id || ''
      }
    }

    if (!contactId) {
      return NextResponse.json({ status: 'error', reason: 'Failed to resolve contact' }, { status: 500 })
    }

    // 2. Find or create Conversation in conversations table
    let conversationId = ''
    const nowIso = new Date().toISOString()
    const { data: existingConv } = await db
      .from('conversations')
      .select('id, unread_count')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
      await db
        .from('conversations')
        .update({
          last_message_text: displayText,
          last_message_at: nowIso,
          unread_count: isEcho ? existingConv.unread_count : (existingConv.unread_count || 0) + 1,
          status: 'open',
          updated_at: nowIso,
        })
        .eq('id', existingConv.id)
    } else {
      const { data: newConv } = await db
        .from('conversations')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          user_id: ownerUserId,
          status: 'open',
          last_message_text: displayText,
          last_message_at: nowIso,
          unread_count: isEcho ? 0 : 1,
        })
        .select('id')
        .maybeSingle()

      if (newConv) {
        conversationId = newConv.id
      } else {
        const { data: retryConv } = await db
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .maybeSingle()
        conversationId = retryConv?.id || ''
      }
    }

    // 3. Save Message into messages table (deduplicated by messageId)
    if (conversationId) {
      if (messageId) {
        const { data: dupMsg } = await db
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .eq('message_id', messageId)
          .maybeSingle()

        if (dupMsg) {
          return NextResponse.json({ status: 'already_processed' }, { status: 200 })
        }
      }

      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_type: isEcho ? 'agent' : 'customer',
        content_type: contentType || 'text',
        content_text: displayText,
        media_url: mediaUrl || null,
        message_id: messageId || null,
        status: 'delivered',
        created_at: nowIso,
      })
    }

    // 4. Process AI auto-reply if not an echo message
    if (!isEcho) {
      const result = await handleIncomingCustomerMessage({
        accountId,
        contactId,
        customerPhone: customerPsid,
        channel: 'messenger',
        messageText,
        supabase: db,
      })

      if (result?.aiReply && pageAccessToken) {
        try {
          const chunks = splitMessengerText(result.aiReply, 1900)
          let sendSuccess = false
          let lastMid: string | null = null
          let errorTitle: string | null = null
          let errorDetails: string | null = null

          for (const chunk of chunks) {
            let sendRes = await fetch(
              `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: customerPsid },
                  messaging_type: 'RESPONSE',
                  message: { text: chunk },
                }),
              }
            )
            let sendData = await sendRes.json()

            // If 24-hr window / policy error, retry with MESSAGE_TAG
            if (!sendRes.ok && (sendData?.error?.code === 10 || sendData?.error?.message?.includes('window') || sendData?.error?.error_subcode === 2018001)) {
              console.warn('[Messenger Webhook] Retrying with MESSAGE_TAG ACCOUNT_UPDATE...')
              sendRes = await fetch(
                `https://graph.facebook.com/v20.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipient: { id: customerPsid },
                    messaging_type: 'MESSAGE_TAG',
                    tag: 'ACCOUNT_UPDATE',
                    message: { text: chunk },
                  }),
                }
              )
              sendData = await sendRes.json()
            }

            if (sendRes.ok && sendData?.message_id) {
              sendSuccess = true
              lastMid = sendData.message_id
            } else {
              console.error('[Messenger Graph API Error]:', sendData)
              errorTitle = sendData?.error?.message || `HTTP ${sendRes.status}`
              errorDetails = sendData?.error?.code ? `Code ${sendData.error.code}` : null
            }
          }

          if (conversationId) {
            await db.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'bot',
              content_type: 'text',
              content_text: result.aiReply,
              message_id: lastMid || null,
              status: sendSuccess ? 'delivered' : 'failed',
              error_title: sendSuccess ? null : (errorTitle || 'Meta send failed'),
              error_details: sendSuccess ? null : errorDetails,
              created_at: new Date().toISOString(),
            })

            await db
              .from('conversations')
              .update({
                last_message_text: result.aiReply,
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', conversationId)
          }
        } catch (sendErr) {
          console.error('[Messenger Graph API Dispatch Error]:', sendErr)
        }
      }
    }

    return NextResponse.json({ status: 'success' }, { status: 200 })
  } catch (err: unknown) {
    console.error('[Messenger Webhook Exception]:', err)
    return NextResponse.json({ error: (err as Error)?.message ?? 'Internal error' }, { status: 500 })
  }
}
