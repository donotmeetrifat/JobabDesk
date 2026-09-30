import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { accountId } = await requireRole('agent')
    const { messageText, channel } = await req.json()

    if (!messageText?.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    const result = await handleIncomingCustomerMessage({
      accountId,
      channel: channel || 'sandbox',
      messageText: messageText.trim(),
    })

    if (!result) {
      return NextResponse.json(
        { error: 'AI auto-reply could not be generated. Please ensure GEMINI_API_KEY is configured.' },
        { status: 400 }
      )
    }

    return NextResponse.json({ result })
  } catch (err: any) {
    console.error('[AI Simulate Error]:', err)
    return NextResponse.json(
      { error: err?.message || 'Error simulating AI auto-reply' },
      { status: 500 }
    )
  }
}
