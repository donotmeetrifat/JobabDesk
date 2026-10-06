import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
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

// GET: Retrieve account-level playground chat history from database
export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    const { data: account, error } = await db
      .from('accounts')
      .select('playground_chat_history')
      .eq('id', accountId)
      .maybeSingle()

    if (error) {
      console.warn('[Playground GET] accounts table query warning:', error.message)
      return NextResponse.json({ messages: [] })
    }

    return NextResponse.json({
      messages: Array.isArray(account?.playground_chat_history)
        ? account.playground_chat_history
        : [],
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// POST: Execute AI Playground and persist chat messages to the account
export async function POST(req: Request) {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase
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

    const aiReplyText = result?.aiReply || 'Sorry, no response could be generated at this moment.'
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    const userMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: message,
      timestamp: now,
    }

    const aiMessage = {
      id: 'ai-' + (Date.now() + 1),
      sender: 'ai',
      text: aiReplyText,
      timestamp: now,
    }

    // Persist messages in database on the account record
    let updatedHistory: any[] = []
    try {
      const { data: acct } = await db
        .from('accounts')
        .select('playground_chat_history')
        .eq('id', accountId)
        .maybeSingle()

      const current = Array.isArray(acct?.playground_chat_history)
        ? acct.playground_chat_history
        : []

      // Cap at most recent 50 messages to keep record performant
      updatedHistory = [...current, userMessage, aiMessage].slice(-50)

      await db
        .from('accounts')
        .update({ playground_chat_history: updatedHistory })
        .eq('id', accountId)
    } catch (e: any) {
      console.warn('[Playground POST] Could not persist to accounts table:', e?.message || e)
    }

    return NextResponse.json({
      ai_reply: aiReplyText,
      detected_language: result?.language || 'auto',
      intent_detected: result?.intent || 'general_faq',
      provider_used: result?.providerUsed || 'router',
      model_used: result?.modelUsed || 'default',
      id: result?.id,
      messages: updatedHistory,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

// DELETE: Clear playground chat history for this account in the database
export async function DELETE() {
  try {
    const { accountId, supabase } = await requireRole('agent')
    const admin = getAdminClient()
    const db = admin || supabase

    try {
      await db
        .from('accounts')
        .update({ playground_chat_history: [] })
        .eq('id', accountId)
    } catch (e: any) {
      console.warn('[Playground DELETE] Could not clear account chat history:', e?.message || e)
    }

    return NextResponse.json({ success: true, messages: [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}
