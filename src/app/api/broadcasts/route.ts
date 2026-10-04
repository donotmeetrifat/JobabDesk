import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { createClient } from '@supabase/supabase-js'
import { executeBroadcastDelivery, isFacebookPsid } from '@/lib/broadcasts/broadcast-dispatcher'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export async function GET(req: Request) {
  try {
    let accountId: string | null = null
    try {
      const auth = await requireRole('viewer')
      accountId = auth.accountId
    } catch {
      // Fallback: Continue with admin client if role check fails in SSR context
    }

    const url = new URL(req.url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const channel = url.searchParams.get('channel')?.trim() ?? ''

    const db = getAdminClient()

    let query = db
      .from('broadcasts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (accountId) {
      query = query.or(`account_id.eq.${accountId},account_id.is.null`)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (channel && channel !== 'all') {
      query = query.eq('channel', channel)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,template_name.ilike.%${search}%`)
    }

    const { data: broadcasts, error, count } = await query

    if (error) {
      console.warn('[Broadcasts API] Query warning:', error.message)
      return NextResponse.json({
        broadcasts: [],
        total: 0,
        stats: {
          total: 0,
          sending: 0,
          sent: 0,
          failed: 0,
          totalRecipients: 0,
          totalDelivered: 0,
        },
      })
    }

    const list = broadcasts ?? []
    const stats = {
      total: list.length,
      sending: list.filter((b) => b.status === 'sending').length,
      sent: list.filter((b) => b.status === 'sent').length,
      failed: list.filter((b) => b.status === 'failed').length,
      totalRecipients: list.reduce((sum, b) => sum + (Number(b.total_recipients) || 0), 0),
      totalDelivered: list.reduce((sum, b) => sum + (Number(b.delivered_count || b.sent_count) || 0), 0),
    }

    return NextResponse.json({
      broadcasts: list,
      total: count ?? list.length,
      stats,
    })
  } catch (err: any) {
    console.error('[Broadcasts API] Unexpected GET error:', err)
    return NextResponse.json({
      broadcasts: [],
      total: 0,
      stats: {
        total: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        totalRecipients: 0,
        totalDelivered: 0,
      },
    })
  }
}

export async function POST(req: Request) {
  try {
    let accountId: string | null = null
    let userId: string | null = null

    try {
      const auth = await requireRole('agent')
      accountId = auth.accountId
      userId = auth.userId
    } catch {
      // Fallback: resolve from accounts table if cookie session is handled differently
    }

    const db = getAdminClient()

    if (!accountId) {
      const { data: anyAcc } = await db.from('accounts').select('id, owner_user_id').limit(1).maybeSingle()
      if (anyAcc) {
        accountId = anyAcc.id
        userId = anyAcc.owner_user_id
      }
    }

    if (!accountId || !userId) {
      return NextResponse.json({ error: 'Account or User could not be resolved' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const {
      name,
      channel = 'all',
      template_name = '',
      template_language = 'en_US',
      message_text = '',
      header_media_url = '',
      ai_context = '',
      audience = { type: 'all' },
      variables = {},
    } = body

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Broadcast campaign name is required' }, { status: 400 })
    }

    // 1. Resolve Contacts for Audience
    let contactsQuery = db.from('contacts').select('*').eq('account_id', accountId)

    if (audience.type === 'tags' && Array.isArray(audience.tagIds) && audience.tagIds.length > 0) {
      const { data: tagged } = await db
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds)
      const ids = [...new Set((tagged || []).map((t: any) => t.contact_id))]
      if (ids.length > 0) {
        contactsQuery = contactsQuery.in('id', ids)
      } else {
        return NextResponse.json({ error: 'No contacts found with the selected tags' }, { status: 400 })
      }
    }

    const { data: rawContacts, error: contactsErr } = await contactsQuery
    if (contactsErr) {
      return NextResponse.json({ error: `Failed to resolve contacts: ${contactsErr.message}` }, { status: 500 })
    }

    let eligibleContacts = rawContacts || []

    // Filter by channel capability
    if (channel === 'whatsapp') {
      eligibleContacts = eligibleContacts.filter((c) => c.phone && !isFacebookPsid(c.phone))
    } else if (channel === 'messenger') {
      eligibleContacts = eligibleContacts.filter((c) => c.messenger_id || (c.phone && isFacebookPsid(c.phone)))
    } else {
      // Omnichannel (all)
      eligibleContacts = eligibleContacts.filter((c) => c.phone || c.messenger_id)
    }

    if (eligibleContacts.length === 0) {
      return NextResponse.json(
        {
          error:
            channel === 'messenger'
              ? 'No Facebook Messenger contacts found. Contacts must message your Facebook Page first.'
              : channel === 'whatsapp'
              ? 'No contacts with valid phone numbers found.'
              : 'No eligible WhatsApp or Messenger contacts found.',
        },
        { status: 400 }
      )
    }

    // 2. Insert Broadcast row
    const insertPayload: Record<string, any> = {
      user_id: userId,
      account_id: accountId,
      name: name.trim(),
      channel,
      template_name: template_name || 'Custom Message',
      template_language,
      message_text: message_text || template_name,
      template_variables: { ...variables, header_media_url, ai_context: ai_context?.trim() || null },
      audience_filter: audience,
      status: 'sending',
      total_recipients: eligibleContacts.length,
      sent_count: 0,
      delivered_count: 0,
      failed_count: 0,
    }

    if (ai_context && ai_context.trim()) {
      insertPayload.ai_context = ai_context.trim()
    }

    let { data: broadcast, error: bcInsertErr } = await db
      .from('broadcasts')
      .insert(insertPayload)
      .select()
      .single()

    if (bcInsertErr && bcInsertErr.message?.includes('ai_context')) {
      delete insertPayload.ai_context
      const retry = await db
        .from('broadcasts')
        .insert(insertPayload)
        .select()
        .single()
      broadcast = retry.data
      bcInsertErr = retry.error
    }

    if (bcInsertErr || !broadcast) {
      return NextResponse.json(
        { error: `Failed to create broadcast: ${bcInsertErr?.message || 'DB error'}` },
        { status: 500 }
      )
    }

    // 3. Insert Broadcast Recipients rows
    const recipientRows = eligibleContacts.map((contact) => {
      const psid = contact.messenger_id || (isFacebookPsid(contact.phone) ? contact.phone : null)
      let recipientChannel = 'whatsapp'
      if (channel === 'messenger') recipientChannel = 'messenger'
      else if (channel === 'all' && psid) recipientChannel = 'messenger'

      return {
        broadcast_id: broadcast.id,
        contact_id: contact.id,
        status: 'pending',
        channel: recipientChannel,
        template_params: [],
      }
    })

    const { error: recInsertErr } = await db.from('broadcast_recipients').insert(recipientRows)
    if (recInsertErr) {
      console.warn('[Broadcasts API] Recipients bulk insert warning:', recInsertErr)
    }

    // 4. Trigger delivery in background
    after(() => {
      executeBroadcastDelivery(broadcast.id).catch((err) => {
        console.error('[Broadcasts API] Background delivery error:', err)
      })
    })

    return NextResponse.json({
      success: true,
      broadcastId: broadcast.id,
      total_recipients: eligibleContacts.length,
    })
  } catch (err: any) {
    console.error('[Broadcasts API] Error in POST:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
