import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

const MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface RouterEngineInput {
  accountId: string
  contactId?: string | null
  customerPhone?: string | null
  messageText: string
}

export interface RouterEngineOutput {
  id?: string
  intent: 'product_inquiry' | 'order_status' | 'general_faq' | 'human_escalation'
  aiReply: string
  modelUsed: string
  confidence: number
}

export async function handleIncomingCustomerMessage({
  accountId,
  contactId,
  customerPhone,
  messageText,
}: RouterEngineInput): Promise<RouterEngineOutput | null> {
  if (!messageText?.trim()) return null

  const db = getAdminClient()

  // 1. Fetch Account settings
  const { data: account, error: acctErr } = await db
    .from('accounts')
    .select('id, name, ai_auto_reply_enabled, ai_auto_reply_tone')
    .eq('id', accountId)
    .single()

  if (acctErr || !account) {
    console.error('[AI Router] Account lookup failed:', acctErr?.message)
    return null
  }

  // If auto-reply is disabled for this account, stand down
  if (account.ai_auto_reply_enabled === false) {
    return null
  }

  // 2. Fetch Ground Truth Context (Products & Customer Orders)
  const [productsRes, ordersRes] = await Promise.all([
    db
      .from('products')
      .select('name, price, brand, category, stock_qty, is_in_stock, description')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .limit(100),
    contactId || customerPhone
      ? db
          .from('orders')
          .select('order_number, status, payment_status, total, created_at, order_items(product_name, quantity, total)')
          .eq('account_id', accountId)
          .or(
            [
              contactId ? `contact_id.eq.${contactId}` : '',
              customerPhone ? `customer_phone.ilike.%${customerPhone.replace(/\D/g, '')}%` : '',
            ]
              .filter(Boolean)
              .join(',')
          )
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
  ])

  const products = productsRes.data ?? []
  const recentOrders = ordersRes.data ?? []

  // Tone guidance
  const toneSetting = account.ai_auto_reply_tone || 'friendly_bangla'
  let toneGuidance = 'Speak in natural, warm, polite Bangladeshi Bengali.'
  if (toneSetting === 'professional_english') {
    toneGuidance = 'Speak in clear, professional English.'
  } else if (toneSetting === 'short_direct') {
    toneGuidance = 'Keep your answers concise, short, and directly to the point.'
  }

  // Build System Prompt
  const systemPrompt = `You are an AI customer support router and assistant for "${account.name}".
${toneGuidance}

Instructions & Rules:
1. Intent Classification:
   Classify the customer's request into EXACTLY ONE of these categories:
   - "product_inquiry": Questions about available items, prices, brands, stock, or product recommendations.
   - "order_status": Questions about existing orders, delivery status, order numbers, or payment status.
   - "general_faq": Greetings, store location, payment options, delivery policies, general chat.
   - "human_escalation": Complaints, complex custom requests, urgent issues needing a human agent.

2. Ground Truth Constraints:
   - ONLY use the provided Product List and Customer Recent Orders.
   - Never invent prices, product features, stock numbers, or fake order numbers.
   - If a product is out of stock or not in the list, state politely that it's currently unavailable.
   - Format prices in BDT (৳).

Available Product Catalogue:
${
  products.length === 0
    ? 'No products cataloged yet.'
    : products
        .map(
          (p) =>
            `- Name: "${p.name}", Price: ৳${p.price}, Stock: ${p.stock_qty} (${p.is_in_stock ? 'In Stock' : 'Out of Stock'}), Category: ${p.category || 'N/A'}, Brand: ${p.brand || 'N/A'}${p.description ? `, Desc: ${p.description}` : ''}`
        )
        .join('\n')
}

Customer's Recent Orders:
${
  recentOrders.length === 0
    ? 'No previous orders on record.'
    : recentOrders
        .map(
          (o) =>
            `- Order #: ${o.order_number}, Status: ${o.status}, Payment: ${o.payment_status}, Total: ৳${o.total}, Date: ${new Date(o.created_at).toLocaleDateString()} (Items: ${(o.order_items || []).map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`).join(', ')})`
        )
        .join('\n')
}

CRITICAL: Return ONLY valid JSON in this exact structure:
{
  "intent": "product_inquiry" | "order_status" | "general_faq" | "human_escalation",
  "reply": "string (the natural response to send to customer)",
  "confidence": number (between 0.0 and 1.0)
}`

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[AI Router] GEMINI_API_KEY not configured')
    return null
  }

  const ai = new GoogleGenAI({ apiKey })

  let selectedModel = 'gemini-3.8-flash'
  let responseText: string | null = null

  // Fallback model loop
  for (const modelName of MODEL_CHAIN) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { text: `Customer Incoming Message:\n"${messageText.trim()}"` },
            ],
          },
        ],
        config: {
          temperature: 0.2,
        },
      })

      const raw = response.text?.trim()
      if (raw) {
        responseText = raw
        selectedModel = modelName
        break
      }
    } catch (err: unknown) {
      console.warn(`[AI Router] Model ${modelName} failed, trying fallback...`, (err as Error)?.message)
    }
  }

  if (!responseText) {
    console.error('[AI Router] All fallback models failed to generate response.')
    return null
  }

  // Parse JSON response
  try {
    const cleaned = responseText
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    const parsed = JSON.parse(cleaned) as {
      intent: 'product_inquiry' | 'order_status' | 'general_faq' | 'human_escalation'
      reply: string
      confidence?: number
    }

    const intent = parsed.intent || 'general_faq'
    const aiReply = parsed.reply || 'ধন্যবাদ! আমরা শিগগিরই আপনার সাথে যোগাযোগ করব।'
    const confidence = parsed.confidence ?? 1.0

    // Log reply to ai_auto_replies table
    const { data: logEntry, error: logErr } = await db
      .from('ai_auto_replies')
      .insert({
        account_id: accountId,
        contact_id: contactId || null,
        incoming_message: messageText.trim(),
        intent_detected: intent,
        ai_reply: aiReply,
        model_used: selectedModel,
        confidence_score: confidence,
        is_sent: true,
      })
      .select('id')
      .single()

    if (logErr) {
      console.error('[AI Router] Failed to insert log entry:', logErr.message)
    }

    return {
      id: logEntry?.id,
      intent,
      aiReply,
      modelUsed: selectedModel,
      confidence,
    }
  } catch (parseErr) {
    console.error('[AI Router] JSON parse error:', parseErr, 'Raw response:', responseText)
    // Fallback if model outputted plain text instead of JSON
    const fallbackReply = responseText.replace(/^[\s\S]*"reply":\s*"/, '').replace(/[\s\S]*\}$/, '')
    const { data: logEntry } = await db
      .from('ai_auto_replies')
      .insert({
        account_id: accountId,
        contact_id: contactId || null,
        incoming_message: messageText.trim(),
        intent_detected: 'general_faq',
        ai_reply: fallbackReply,
        model_used: selectedModel,
        confidence_score: 0.9,
        is_sent: true,
      })
      .select('id')
      .single()

    return {
      id: logEntry?.id,
      intent: 'general_faq',
      aiReply: fallbackReply,
      modelUsed: selectedModel,
      confidence: 0.9,
    }
  }
}
