import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
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

export async function POST() {
  try {
    const { accountId, userId, supabase } = await requireRole('agent')
    const targetId = accountId || userId
    const admin = getAdminClient()
    const db = supabase || admin

    let resolvedAccountId = targetId
    try {
      const { data: acc } = await db
        .from('accounts')
        .select('id')
        .or(`id.eq.${targetId},owner_user_id.eq.${targetId}`)
        .maybeSingle()
      if (acc?.id) resolvedAccountId = acc.id
    } catch {}

    const { data: convs } = await db
      .from('conversations')
      .select('id')
      .or(`account_id.eq.${resolvedAccountId},account_id.eq.${targetId},user_id.eq.${targetId}`)

    let deletedCount = 0
    if (convs && convs.length > 0) {
      const cIds = convs.map((c: any) => c.id)
      await db.from('messages').delete().in('conversation_id', cIds)
      await db.from('conversations').delete().in('id', cIds)
      deletedCount = cIds.length
    }

    await db.from('contacts').delete().or(`account_id.eq.${resolvedAccountId},account_id.eq.${targetId},user_id.eq.${targetId}`)

    return NextResponse.json({
      success: true,
      message: `Successfully cleared ${deletedCount} conversation(s) and associated messages.`,
      deletedCount,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
