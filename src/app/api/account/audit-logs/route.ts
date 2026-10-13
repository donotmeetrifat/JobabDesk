import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(10, Number(searchParams.get('limit')) || 50))

    const { data: logs, error } = await supabase
      .from('security_audit_logs')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[GET /api/account/audit-logs] Error:', error.message)
      return NextResponse.json({ logs: [] })
    }

    return NextResponse.json({
      success: true,
      logs: logs || [],
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
