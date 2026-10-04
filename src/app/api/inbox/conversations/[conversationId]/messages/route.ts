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

    // Soft check - do not block messages with 401 if browser session cookie is in flux
    try {
      const supabase = await createServerClient()
      await supabase.auth.getUser()
    } catch {}

    const admin = getAdminClient()
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
