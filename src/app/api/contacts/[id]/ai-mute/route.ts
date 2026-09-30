import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params
    const { ai_auto_reply_muted } = await req.json()

    if (typeof ai_auto_reply_muted !== 'boolean') {
      return NextResponse.json(
        { error: 'ai_auto_reply_muted must be a boolean' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('contacts')
      .update({ ai_auto_reply_muted })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, contact: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
