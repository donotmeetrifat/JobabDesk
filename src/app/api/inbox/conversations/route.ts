import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { CONVERSATION_SELECT, normalizeConversations } from '@/lib/inbox/conversations'
import type { Conversation } from '@/types'

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

    // 1. Try fetching via SSR client using CONVERSATION_SELECT (fastest)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(CONVERSATION_SELECT)
        .order('last_message_at', { ascending: false })

      if (!error && Array.isArray(data) && data.length > 0) {
        return NextResponse.json({
          success: true,
          conversations: normalizeConversations(data as any),
        })
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

    // Query conversations with contacts joined via admin client
    const { data: adminConvs, error: adminErr } = await admin
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .or(`account_id.eq.${accountId},user_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false })

    if (!adminErr && Array.isArray(adminConvs) && adminConvs.length > 0) {
      return NextResponse.json({
        success: true,
        conversations: normalizeConversations(adminConvs as any),
      })
    }

    // Secondary fallback: query by account_id alone or user_id alone
    const { data: fallbackConvs } = await admin
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('account_id', accountId)
      .order('last_message_at', { ascending: false })

    if (Array.isArray(fallbackConvs) && fallbackConvs.length > 0) {
      return NextResponse.json({
        success: true,
        conversations: normalizeConversations(fallbackConvs as any),
      })
    }

    return NextResponse.json({
      success: true,
      conversations: [],
    })
  } catch (err: any) {
    console.error('[api/inbox/conversations] Exception:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error', conversations: [] },
      { status: 500 }
    )
  }
}
