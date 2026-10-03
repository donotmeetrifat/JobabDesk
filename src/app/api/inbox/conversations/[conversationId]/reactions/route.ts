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

    // 1. Try querying message_reactions via SSR client (respects RLS)
    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .eq('conversation_id', conversationId)

      if (!error && Array.isArray(data) && data.length > 0) {
        return NextResponse.json({ success: true, reactions: data })
      }
    } catch (e) {
      console.warn('[api/inbox/reactions] SSR query failed, falling back to admin:', e)
    }

    // 2. Fallback using Admin client
    const admin = getAdminClient()
    const { data: adminReactions, error: adminErr } = await admin
      .from('message_reactions')
      .select('*')
      .eq('conversation_id', conversationId)

    if (adminErr) {
      console.error('[api/inbox/reactions] Admin query error:', adminErr)
    }

    return NextResponse.json({
      success: true,
      reactions: adminReactions || [],
    })
  } catch (err: any) {
    console.error('[api/inbox/reactions] Exception:', err)
    return NextResponse.json(
      { error: err?.message || 'Internal server error', reactions: [] },
      { status: 500 }
    )
  }
}
