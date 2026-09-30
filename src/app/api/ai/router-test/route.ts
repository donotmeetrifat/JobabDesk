import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { accountId } = await requireRole('agent')
    const { messageText } = await req.json()

    if (!messageText?.trim()) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    const result = await handleIncomingCustomerMessage({
      accountId,
      messageText: messageText.trim(),
    })

    if (!result) {
      return NextResponse.json(
        { error: 'AI auto-reply is disabled or failed to generate a response' },
        { status: 400 }
      )
    }

    return NextResponse.json({ result })
  } catch (err) {
    return toErrorResponse(err)
  }
}
