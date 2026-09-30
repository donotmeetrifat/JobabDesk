import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)

    const { data: logs, error } = await supabase
      .from('ai_auto_replies')
      .select('*, contact:contacts(id, name, phone)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ logs: logs ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
