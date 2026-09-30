import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const { message, channel = 'sandbox' } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    const result = await handleIncomingCustomerMessage({
      accountId,
      supabase,
      channel: channel as any,
      messageText: message,
    })

    if (!result) {
      return NextResponse.json({
        ai_reply: 'AI Auto-Reply is currently disabled for this channel or customer.',
        detected_language: 'none',
        intent_detected: 'none',
        provider_used: 'none',
        model_used: 'none',
        bypassed: true,
      })
    }

    return NextResponse.json({
      ai_reply: result.aiReply,
      detected_language: result.language,
      intent_detected: result.intent,
      provider_used: result.providerUsed,
      model_used: result.modelUsed,
      id: result.id,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
