import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { CONVERSATION_SELECT, normalizeConversations } from '@/lib/inbox/conversations'
import type { Conversation, Contact } from '@/types'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createSupabaseClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createSupabaseClient(url, anonKey)
}

export async function GET() {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve caller's profile and account_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let accountId = profile?.account_id

    // Fallback: check accounts owned by user
    if (!accountId) {
      const { data: ownedAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (ownedAcc?.id) accountId = ownedAcc.id
    }

    if (!accountId) accountId = user.id

    // 1. Try fetching via SSR client using CONVERSATION_SELECT
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false })

      if (!error && Array.isArray(data) && data.length > 0) {
        const hasMissingContacts = data.some(
          (c: any) => !c.contact || !c.contact.name || c.contact.name === 'Unknown'
        )
        if (!hasMissingContacts) {
          return NextResponse.json({
            success: true,
            conversations: normalizeConversations(data as any),
          })
        }
      }
    } catch (e) {
      console.warn('[api/inbox/conversations] SSR client query failed, falling back:', e)
    }

    // 2. Fallback using Admin client (bypasses RLS mismatches)
    const admin = getAdminClient()

    // Align user's profile account_id if needed
    if (accountId && accountId !== user.id) {
      try {
        await admin
          .from('profiles')
          .update({ account_id: accountId })
          .eq('user_id', user.id)
      } catch {}
    }

    // Query conversations by account_id OR user_id
    const { data: adminConvs, error: adminErr } = await admin
      .from('conversations')
      .select('*')
      .or(`account_id.eq.${accountId},user_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false })

    if (adminErr || !adminConvs || adminConvs.length === 0) {
      return NextResponse.json({
        success: true,
        conversations: [],
      })
    }

    // Fetch page access token to resolve real Facebook customer profiles
    let fbPageToken = ''
    try {
      const { data: accData } = await admin
        .from('accounts')
        .select('facebook_page_access_token')
        .eq('id', accountId)
        .maybeSingle()
      fbPageToken = accData?.facebook_page_access_token || ''
    } catch {}

    if (!fbPageToken) {
      try {
        const { data: chanData } = await admin
          .from('channel_connections')
          .select('metadata')
          .eq('account_id', accountId)
          .eq('channel_type', 'messenger')
          .limit(1)
          .maybeSingle()
        fbPageToken = chanData?.metadata?.access_token || chanData?.metadata?.accessToken || ''
      } catch {}
    }

    // Collect all contact IDs
    const contactIds = Array.from(
      new Set(adminConvs.map((c) => c.contact_id).filter(Boolean))
    )

    let contactsMap = new Map<string, Contact>()
    if (contactIds.length > 0) {
      const { data: contactsData } = await admin
        .from('contacts')
        .select('*, contact_tags(tags(*))')
        .in('id', contactIds)

      if (contactsData) {
        for (const ct of contactsData) {
          let updatedName = ct.name
          let updatedAvatar = ct.avatar_url

          // If contact is Messenger and name is unknown or missing, fetch real name via Meta Graph API
          const isMessengerContact =
            ct.company === 'Facebook Messenger' ||
            (ct.phone && !ct.phone.startsWith('+') && !isNaN(Number(ct.phone)))

          if (
            isMessengerContact &&
            fbPageToken &&
            (!ct.name || ct.name === 'Unknown' || ct.name.startsWith('Messenger User') || !ct.avatar_url)
          ) {
            try {
              const metaRes = await fetch(
                `https://graph.facebook.com/v20.0/${ct.phone}?fields=name,first_name,last_name,profile_pic&access_token=${encodeURIComponent(fbPageToken)}`
              )
              if (metaRes.ok) {
                const metaJson = await metaRes.json()
                const realName =
                  metaJson.name ||
                  [metaJson.first_name, metaJson.last_name].filter(Boolean).join(' ').trim()
                if (realName) updatedName = realName
                if (metaJson.profile_pic) updatedAvatar = metaJson.profile_pic

                // Update contact asynchronously in DB
                Promise.resolve(
                  admin
                    .from('contacts')
                    .update({
                      name: updatedName,
                      avatar_url: updatedAvatar,
                      company: 'Facebook Messenger',
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', ct.id)
                ).catch(() => {})
              }
            } catch {}
          }

          contactsMap.set(ct.id, {
            ...ct,
            name: updatedName,
            avatar_url: updatedAvatar,
            company: ct.company || (isMessengerContact ? 'Facebook Messenger' : undefined),
          } as Contact)
        }
      }
    }

    // Attach hydrated contact to each conversation
    const hydratedConvs: Conversation[] = adminConvs.map((c) => {
      let rawContact = contactsMap.get(c.contact_id)
      if (!rawContact) {
        const fallbackId = c.contact_id || c.id
        rawContact = {
          id: fallbackId,
          user_id: c.user_id,
          account_id: c.account_id || accountId,
          phone: c.contact_id || '',
          name: `Messenger User (${fallbackId.slice(-4)})`,
          company: 'Facebook Messenger',
          created_at: c.created_at,
          updated_at: c.updated_at,
        } as Contact
      }
      return {
        ...c,
        contact: rawContact,
      } as Conversation
    })

    return NextResponse.json({
      success: true,
      conversations: normalizeConversations(hydratedConvs as any),
    })
  } catch (err: any) {
    console.error('[api/inbox/conversations] Exception:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error', conversations: [] },
      { status: 500 }
    )
  }
}
