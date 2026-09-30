import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')

    const { data: account, error } = await supabase
      .from('accounts')
      .select('ai_auto_reply_enabled, ai_auto_reply_tone')
      .eq('id', accountId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ai_auto_reply_enabled: account?.ai_auto_reply_enabled ?? true,
      ai_auto_reply_tone: account?.ai_auto_reply_tone ?? 'friendly_bangla',
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const body = await req.json()

    const updates: Record<string, unknown> = {}
    if (typeof body.ai_auto_reply_enabled === 'boolean') {
      updates.ai_auto_reply_enabled = body.ai_auto_reply_enabled
    }
    if (typeof body.ai_auto_reply_tone === 'string') {
      updates.ai_auto_reply_tone = body.ai_auto_reply_tone
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .select('ai_auto_reply_enabled, ai_auto_reply_tone')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
