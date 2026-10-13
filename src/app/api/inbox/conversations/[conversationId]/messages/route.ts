import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params
    if (!conversationId) {
      return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getAdminClient()

    // Enforce tenant isolation (Anti-IDOR)
    const { data: profile } = await admin
      .from('profiles')
      .select('account_id')
      .or(`user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle()

    let accountId = profile?.account_id
    if (!accountId) {
      const { data: ownedAcc } = await admin
        .from('accounts')
        .select('id')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (ownedAcc?.id) accountId = ownedAcc.id
    }

    if (accountId) {
      const { data: conv } = await admin
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .or(`account_id.eq.${accountId},user_id.eq.${user.id}`)
        .maybeSingle()

      if (!conv) {
        return NextResponse.json({ error: 'Conversation not found', messages: [] }, { status: 404 })
      }
    }

    const { data: adminMsgs, error: adminErr } = await admin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (adminErr) {
      console.error('[api/inbox/messages] Admin query error:', adminErr)
    }

    const { data: convReactions } = await admin
      .from('message_reactions')
      .select('*')
      .eq('conversation_id', conversationId)

    return NextResponse.json({
      success: true,
      messages: adminMsgs || [],
      reactions: convReactions || [],
    })
  } catch (err: any) {
    console.error('[api/inbox/messages] Exception:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error', messages: [] },
      { status: 500 }
    )
  }
}
