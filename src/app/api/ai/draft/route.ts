import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { handleIncomingCustomerMessage } from '@/lib/ai/router-engine'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { generateReply } from '@/lib/ai/generate'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage } from '@/lib/ai/query'
import { logAiUsage } from '@/lib/ai/usage'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { AiError } from '@/lib/ai/types'

/**
 * POST /api/ai/draft  (agent+)
 *
 * Body: { conversation_id }
 * Returns: { draft } — a suggested reply for the agent to edit + send.
 *
 * Powered by JobabDesk Sales AI Engine (Gemini -> Groq -> OpenRouter)
 * grounded in the store catalog, customer history, and delivery policy.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft)
    if (!userLimit.success) return rateLimitResponse(userLimit)
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount,
    )
    if (!accountLimit.success) return rateLimitResponse(accountLimit)

    const body = await request.json().catch(() => null)
    const conversationId =
      body && typeof body.conversation_id === 'string' ? body.conversation_id : ''
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      )
    }

    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id, contact_id, account_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr) {
      console.error('[ai/draft] conversation lookup error:', convErr)
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
    }
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Load recent messages for context
    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('id, sender_type, content_text, media_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!recentMsgs || recentMsgs.length === 0) {
      return NextResponse.json(
        {
          error: 'No messages in this conversation to draft from yet.',
          code: 'no_messages',
        },
        { status: 400 },
      )
    }

    const lastCustomerMsg = recentMsgs.find((m) => m.sender_type === 'customer') || recentMsgs[0]
    const messageText = lastCustomerMsg?.content_text?.trim() || 'Customer sent an inquiry.'

    // Primary: Run JobabDesk intelligent sales router engine (Gemini -> Groq -> OpenRouter)
    // with store catalog, delivery policies, and conversation context.
    try {
      const routerResult = await handleIncomingCustomerMessage({
        accountId,
        supabase,
        conversationId,
        contactId: conversation.contact_id,
        channel: 'messenger',
        messageText,
        mediaUrl: lastCustomerMsg?.media_url,
      })

      if (routerResult?.aiReply) {
        return NextResponse.json({ draft: routerResult.aiReply })
      }
    } catch (engineErr) {
      console.warn('[ai/draft] Router engine fallback attempt:', engineErr)
    }

    // Secondary fallback: Try custom BYO config if available
    let config = null
    try {
      config = await loadAiConfig(supabase, accountId)
    } catch {
      // Swallowed: if legacy stored key cannot be decrypted, do not block the user!
    }

    if (config) {
      const messages = await buildConversationContext(supabase, conversationId)
      const knowledge = await retrieveKnowledge(
        supabase,
        accountId,
        config,
        latestUserMessage(messages),
      )
      const systemPrompt = buildSystemPrompt({
        userPrompt: config.systemPrompt,
        mode: 'draft',
        knowledge,
      })
      const { text, usage } = await generateReply({ config, systemPrompt, messages })
      try {
        void logAiUsage(supabaseAdmin(), {
          accountId,
          conversationId,
          mode: 'draft',
          provider: config.provider,
          model: config.model,
          usage,
        })
      } catch {}
      if (text) {
        return NextResponse.json({ draft: text })
      }
    }

    return NextResponse.json(
      {
        error: 'Unable to generate AI draft. Please ensure your AI API keys are configured.',
        code: 'ai_draft_failed',
      },
      { status: 500 },
    )
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
