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

const META_REACTION_EMOJIS: Record<string, string> = {
  love: '❤️',
  heart: '❤️',
  like: '👍',
  thumbsup: '👍',
  thumbs_up: '👍',
  yes: '👍',
  dislike: '👎',
  thumbsdown: '👎',
  thumbs_down: '👎',
  no: '👎',
  wow: '😮',
  surprised: '😮',
  sad: '😢',
  cry: '😢',
  crying: '😢',
  angry: '😡',
  anger: '😡',
  smile: '😄',
  happy: '😄',
  laugh: '😂',
  laughing: '😂',
  haha: '😂',
  pray: '🙏',
  prayer: '🙏',
  fire: '🔥',
  clap: '👏',
  celebrate: '🎉',
  tada: '🎉',
}

function resolveMetaEmoji(reactionObj: any): string {
  if (!reactionObj) return ''
  // 1. Direct emoji field if provided
  if (reactionObj.emoji && typeof reactionObj.emoji === 'string' && reactionObj.emoji.trim()) {
    return reactionObj.emoji.trim()
  }
  // 2. reaction string (named keyword like 'love' or literal emoji '❤️')
  const raw = (reactionObj.reaction || '').toString().trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (META_REACTION_EMOJIS[lower]) {
    return META_REACTION_EMOJIS[lower]
  }
  return raw
}

// Meta Messenger Webhook Inbound POST
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const db = getAdminClient()

    const entries = Array.isArray(body?.entry) ? body.entry : body?.entry ? [body.entry] : []
    const entry = entries[0]
    let messaging = entry?.messaging?.[0] || entry?.standby?.[0]

    // If payload contains multiple items, look for reaction event first
    for (const e of entries) {
      const items = [...(e.messaging || []), ...(e.standby || [])]
      const foundReaction = items.find((item: any) => item.reaction || item.message_reaction || item.message_reactions)
      if (foundReaction) {
        messaging = foundReaction
        break
      }
    }

    if (!messaging) {
      return NextResponse.json({ status: 'ignored', reason: 'No messaging payload' }, { status: 200 })
    }

    // Handle inbound Facebook Messenger reaction (emoji reaction or unreact)
    const reaction = messaging?.reaction || messaging?.message_reaction || messaging?.message_reactions
    if (reaction && (reaction.mid || reaction.message_id)) {
      const reactionMid = reaction.mid || reaction.message_id || ''
      const rawAction = (reaction.action || '').toLowerCase()
      const resolvedEmoji = resolveMetaEmoji(reaction)
      const action = rawAction || (resolvedEmoji ? 'react' : 'unreact')
      const senderPsid = messaging?.sender?.id
      const pageId = entry?.id || messaging?.recipient?.id || ''

      // 1. Locate target message by Meta message_id (safe against prefix differences)
      let targetMessage: { id: string; conversation_id: string } | null = null

      if (reactionMid) {
        const candidates = new Set<string>()
        candidates.add(reactionMid)
        if (reactionMid.startsWith('mid.')) candidates.add(reactionMid.slice(4))
        else candidates.add(`mid.${reactionMid}`)
        if (reactionMid.startsWith('m_')) candidates.add(reactionMid.slice(2))
        else candidates.add(`m_${reactionMid}`)
        const stripped = reactionMid.replace(/^(m_|mid\.)+/g, '')
        if (stripped) {
          candidates.add(stripped)
          candidates.add(`mid.${stripped}`)
          candidates.add(`m_${stripped}`)
          candidates.add(`m_mid.${stripped}`)
        }

        const { data: directMsg } = await db
          .from('messages')
          .select('id, conversation_id')
          .in('message_id', Array.from(candidates))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (directMsg) {
          targetMessage = directMsg
        }
      }

      // 2. Resolve conversation & contact
      let contactId: string | null = null
      let convId = targetMessage?.conversation_id || null

      if (senderPsid) {
        const { data: ct } = await db
          .from('contacts')
          .select('id')
          .eq('phone', senderPsid)
          .maybeSingle()
        if (ct?.id) contactId = ct.id
      }

      if (targetMessage && !contactId) {
        const { data: conv } = await db
          .from('conversations')
          .select('id, contact_id')
          .eq('id', targetMessage.conversation_id)
          .maybeSingle()
        if (conv?.contact_id) contactId = conv.contact_id
      }

      // If target message wasn't found by mid, find active conversation by customer PSID
      if (!targetMessage && contactId) {
        const { data: convByContact } = await db
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (convByContact?.id) {
          convId = convByContact.id
          const { data: latestMsg } = await db
            .from('messages')
            .select('id, conversation_id')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (latestMsg) {
            targetMessage = latestMsg
          }
        }
      }

      if (!targetMessage) {
        console.warn('[messenger/webhook] Reaction target message not found for mid:', reactionMid)
        return NextResponse.json({ status: 'ignored', reason: 'Target message not found' }, { status: 200 })
      }

      const isPageSender = senderPsid === pageId
      const actorType = isPageSender ? 'agent' : 'customer'
      const actorId = isPageSender ? null : contactId

      if (action === 'unreact') {
        let query = db
          .from('message_reactions')
          .delete()
          .eq('message_id', targetMessage.id)
          .eq('actor_type', actorType)

        if (actorId) {
          query = query.eq('actor_id', actorId)
        }

        await query
        return NextResponse.json({ status: 'reaction_deleted' }, { status: 200 })
      }

      if (!resolvedEmoji) {
        return NextResponse.json({ status: 'ignored_empty_emoji' }, { status: 200 })
      }

      // Upsert reaction into message_reactions
      const reactionPayload = {
        message_id: targetMessage.id,
        conversation_id: targetMessage.conversation_id,
        actor_type: actorType,
        actor_id: actorId || null,
        emoji: resolvedEmoji,
      }

      let existingQuery = db
        .from('message_reactions')
        .select('id')
        .eq('message_id', targetMessage.id)
        .eq('actor_type', actorType)

      if (actorId) {
        existingQuery = existingQuery.eq('actor_id', actorId)
      }

      const { data: existingReaction } = await existingQuery.maybeSingle()

      if (existingReaction?.id) {
        await db
          .from('message_reactions')
          .update({ emoji: resolvedEmoji })
          .eq('id', existingReaction.id)
      } else {
        const { error: insErr } = await db
          .from('message_reactions')
          .insert(reactionPayload)

        if (insErr) {
          console.warn('[messenger/webhook] Reaction insert failed, updating existing:', insErr.message)
          let fallbackUpdate = db
            .from('message_reactions')
            .update({ emoji: resolvedEmoji })
            .eq('message_id', targetMessage.id)
            .eq('actor_type', actorType)
          if (actorId) {
            fallbackUpdate = fallbackUpdate.eq('actor_id', actorId)
          }
          await fallbackUpdate
        }
      }

      // Touch the conversation so Realtime / resync triggers in UI
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', targetMessage.conversation_id)

      return NextResponse.json({ status: 'reaction_handled', emoji: resolvedEmoji }, { status: 200 })
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

    // Strict Page Isolation: The incoming Facebook Page ID must explicitly match
    // an account or channel connection in JobabDesk.
    // NEVER fall back to another account/workspace if the page ID does not match!
    if (!accountId) {
      console.warn(`[Messenger Webhook]: Dropping event for unconnected Facebook Page ID: ${pageId}. No matching workspace found.`)
      return NextResponse.json({ status: 'ignored_unconnected_page', pageId }, { status: 200 })
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
      const effectiveMessageText =
        messageText ||
        (contentType === 'image'
          ? 'Customer sent a product photo. Please inspect the image, identify the product/brand, and let them know if we have it in stock or recommend the best matching alternative from our store.'
          : displayText)

      const result = await handleIncomingCustomerMessage({
        accountId,
        contactId,
        conversationId,
        customerPhone: customerPsid,
        channel: 'messenger',
        messageText: effectiveMessageText,
        mediaUrl: contentType === 'image' ? mediaUrl : null,
        pageAccessToken,
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
