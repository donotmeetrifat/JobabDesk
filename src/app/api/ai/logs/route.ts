import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
    const channel = url.searchParams.get('channel')?.trim()

    let query = supabase
      .from('ai_auto_replies')
      .select('*, contact:contacts(id, name, phone)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (channel && channel !== 'all') {
      query = query.eq('channel', channel)
    }

    const { data: logs, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: logs ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
