import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export type SupportedChannel = 'whatsapp' | 'messenger' | 'sandbox'
export type DetectedLanguage = 'bn' | 'en' | 'banglish'
export type DetectedIntent = 'product_inquiry' | 'order_status' | 'general_faq' | 'human_escalation'

export interface RouterInput {
  accountId: string
  supabase?: any
  contactId?: string | null
  customerPhone?: string | null
  channel?: SupportedChannel
  messageText: string
}

export interface RouterOutput {
  id?: string
  intent: DetectedIntent
  language: DetectedLanguage
  aiReply: string
  providerUsed: 'gemini' | 'groq' | 'openrouter' | 'offline_dictionary'
  modelUsed: string
}

// Simple heuristic language detector
export function detectLanguage(text: string, preferredSetting = 'auto_detect'): DetectedLanguage {
  if (preferredSetting === 'bn') return 'bn'
  if (preferredSetting === 'en') return 'en'
  if (preferredSetting === 'banglish') return 'banglish'

  // Check for Bengali script characters
  const hasBengaliScript = /[\u0980-\u09FF]/.test(text)
  if (hasBengaliScript) return 'bn'

  // Check for Banglish common words
  const banglishKeywords = [
    'bhai', 'apna', 'dam', 'dam?', 'koto', 'koto?', 'ache', 'ache?', 'naki', 'kobe', 'pabo', 'dorkar',
    'shob', 'khub', 'valo', 'bhalo', 'akush', 'taka', 'tk', 'delivery', 'charge', 'koto', 'address', 'bhaiya', 'apni'
  ]
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)
  const isBanglish = words.some((w) => banglishKeywords.includes(w.replace(/[^a-z]/g, '')))

  if (isBanglish) return 'banglish'
  return 'en'
}

export async function handleIncomingCustomerMessage({
  accountId,
  supabase,
  contactId,
  customerPhone,
  channel = 'sandbox',
  messageText,
}: RouterInput): Promise<RouterOutput | null> {
  if (!messageText?.trim()) return null

  const db = getAdminClient()
  const client = supabase || db

  // 1. Fetch Account Channel & AI Settings
  let account: any = null
  try {
    const { data: acctData } = await client
      .from('accounts')
      .select('id, name, business_tagline, product_categories_sold, target_audience, customer_relation_style, ai_auto_reply_enabled, whatsapp_auto_reply_enabled, messenger_auto_reply_enabled, ai_primary_language, ai_business_description, ai_delivery_policy, ai_return_policy, ai_auto_reply_tone, ai_store_instructions, delivery_policy, return_policy, special_instructions, ai_persona')
      .eq('id', accountId)
      .maybeSingle()
    account = acctData
  } catch {
    // fallback
  }

  if (!account) {
    account = {
      id: accountId,
      name: 'JobabDesk Store',
      business_tagline: '',
      product_categories_sold: '',
      target_audience: '',
      customer_relation_style: 'bhaiya_apu',
      ai_auto_reply_enabled: true,
      whatsapp_auto_reply_enabled: true,
      messenger_auto_reply_enabled: true,
      ai_primary_language: 'auto_detect',
      ai_business_description: '',
      ai_delivery_policy: '',
      ai_return_policy: '',
      ai_auto_reply_tone: 'friendly_bangla',
      ai_store_instructions: '',
      delivery_policy: '',
      return_policy: '',
      special_instructions: '',
      ai_persona: 'friendly_bangla',
    }
  }

  // Check Per-Contact AI Mute Status
  if (contactId || customerPhone) {
    try {
      let query = client.from('contacts').select('id, ai_auto_reply_muted')
      if (contactId) query = query.eq('id', contactId)
      else if (customerPhone) query = query.eq('phone', customerPhone)

      const { data: contactData } = await query.maybeSingle()
      if (contactData?.ai_auto_reply_muted === true && channel !== 'sandbox') {
        // Customer has AI Auto-Reply Muted - leave for human agent
        return null
      }
    } catch (_cErr) {
      // safe fallback
    }
  }

  // Verification 1: Master AI switch (allow sandbox testing regardless)
  if (channel !== 'sandbox') {
    if (account.ai_auto_reply_enabled === false) {
      return null
    }

    // Verification 2: Channel-specific switches
    if (channel === 'whatsapp' && account.whatsapp_auto_reply_enabled === false) {
      return null
    }
    if (channel === 'messenger' && account.messenger_auto_reply_enabled === false) {
      return null
    }
  }

  // Detect language
  const detectedLang = detectLanguage(messageText, account.ai_primary_language || 'auto_detect')

  // 2. Fetch Ground Truth Context (Products & Customer Orders - Safe queries)
  let products: any[] = []
  let recentOrders: any[] = []

  try {
    const { data: pData } = await client
      .from('products')
      .select('name, price, brand, category, stock_qty, is_in_stock, description')
      .eq('account_id', accountId)
      .limit(100)
    products = pData ?? []
  } catch (_pErr) {
    // products query fallback
  }

  if (contactId || customerPhone) {
    try {
      const { data: oData } = await client
        .from('orders')
        .select('order_number, status, payment_status, total, created_at')
        .eq('account_id', accountId)
        .limit(5)
      recentOrders = oData ?? []
    } catch (_oErr) {
      // orders query fallback
    }
  }

  // Build Language Instruction
  let langGuidance = ''
  if (detectedLang === 'bn') {
    langGuidance = 'Respond in natural, polite Bangladeshi Bengali (বাংলা Script).'
  } else if (detectedLang === 'banglish') {
    langGuidance = 'Respond in natural Banglish (Bengali spoken language written in Latin/English alphabet). For example: "Bhai, Nivea face wash er dam ৳850. Stock e ache!".'
  } else {
    langGuidance = 'Respond in clear, professional English.'
  }

  // Build Tone Guidance
  const effectivePersona = account.ai_persona || account.ai_auto_reply_tone || 'friendly_bangla'
  let toneGuidance = 'Friendly and helpful.'
  if (effectivePersona === 'professional_en') toneGuidance = 'Professional, formal, and precise.'
  else if (effectivePersona === 'conversational_banglish') toneGuidance = 'Conversational, warm, and concise.'

  // Build Communication & Greeting Guidance
  const communicationGuidance = account.customer_relation_style === 'bhaiya_apu'
    ? 'Address the customer respectfully as "Bhaiya" or "Apu" (ভাইয়া/আপু) when appropriate in Bengali/Banglish.'
    : account.customer_relation_style === 'sir_madam'
    ? 'Address the customer formally as "Sir" or "Madam".'
    : 'Maintain a warm, casual, and polite conversation.'

  const businessContext = `
Store Name: ${account.name}
Tagline: ${account.business_tagline || 'N/A'}
Overview: ${account.ai_business_description || account.ai_store_instructions || 'N/A'}
Categories Sold: ${account.product_categories_sold || 'N/A'}
Target Customer Profile: ${account.target_audience || 'Customers in Bangladesh'}
Customer Communication Style: ${communicationGuidance}
Delivery Rates & Policy: ${account.delivery_policy || account.ai_delivery_policy || 'Inside Dhaka ৳80, Outside Dhaka ৳150'}
Return Policy: ${account.return_policy || account.ai_return_policy || 'Standard exchange policy'}
Payment Info: ${account.special_instructions || 'Cash on Delivery, bKash, Nagad'}
`.trim()

  const systemPrompt = `You are an AI customer support agent for "${account.name}".
Language Requirement: ${langGuidance}
Response Tone: ${toneGuidance}

=== BUSINESS CONTEXT & SETUP RULES ===
${businessContext}

Instructions:
1. Intent Classification:
   Classify customer message into EXACTLY ONE:
   - "product_inquiry": Questions about available items, prices, brands, stock, or recommendations.
   - "order_status": Questions about existing orders, delivery status, or order numbers.
   - "general_faq": Greetings, location, payment methods, delivery charge, general chat.
   - "human_escalation": Complaints, urgent issues needing a human agent.

2. Ground Truth Rules:
   - ONLY use the provided Product List and Customer Recent Orders.
   - NEVER invent non-existent products, prices, or orders.
   - Format prices with BDT (৳).

Product List:
${
  products.length === 0
    ? 'No products available.'
    : products
        .map(
          (p) =>
            `- Name: "${p.name}", Price: ৳${p.price}, Stock: ${p.stock_qty} (${p.is_in_stock ? 'In Stock' : 'Out of Stock'}), Category: ${p.category || 'N/A'}${p.description ? `, Desc: ${p.description}` : ''}`
        )
        .join('\n')
}

Customer Orders:
${
  recentOrders.length === 0
    ? 'No previous orders.'
    : recentOrders
        .map(
          (o) =>
            `- Order #: ${o.order_number}, Status: ${o.status}, Payment: ${o.payment_status}, Total: ৳${o.total}, Date: ${new Date(o.created_at).toLocaleDateString()}`
        )
        .join('\n')
}

Return ONLY valid JSON:
{
  "intent": "product_inquiry" | "order_status" | "general_faq" | "human_escalation",
  "reply": "string",
  "confidence": number
}`

  // 3-TIER UNSTOPPABLE FALLBACK CHAIN

  let providerUsed: 'gemini' | 'groq' | 'openrouter' | 'offline_dictionary' = 'gemini'
  let modelUsed = 'gemini-3.8-flash'
  let rawResponse: string | null = null

  // TIER 1: Gemini API Fallback Chain
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (geminiApiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const geminiModels = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']

    for (const gModel of geminiModels) {
      try {
        const resp = await ai.models.generateContent({
          model: gModel,
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }, { text: `Customer Message:\n"${messageText}"` }] },
          ],
          config: { temperature: 0.2 },
        })
        const txt = resp.text?.trim()
        if (txt) {
          rawResponse = txt
          providerUsed = 'gemini'
          modelUsed = gModel
          break
        }
      } catch {
        // try next model
      }
    }
  }

  // TIER 2: Groq Free API Fallback
  if (!rawResponse && process.env.GROQ_API_KEY) {
    try {
      const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: messageText },
          ],
          temperature: 0.2,
        }),
      })
      const groqJson = await groqResp.json()
      const content = groqJson?.choices?.[0]?.message?.content?.trim()
      if (content) {
        rawResponse = content
        providerUsed = 'groq'
        modelUsed = 'llama-3.3-70b-versatile'
      }
    } catch {
      // try tier 3
    }
  }

  // TIER 3: OpenRouter API Fallback
  if (!rawResponse && process.env.OPENROUTER_API_KEY) {
    try {
      const openRouterResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: messageText },
          ],
        }),
      })
      const orJson = await openRouterResp.json()
      const content = orJson?.choices?.[0]?.message?.content?.trim()
      if (content) {
        rawResponse = content
        providerUsed = 'openrouter'
        modelUsed = 'llama-3.2-11b-vision-free'
      }
    } catch {
      // fallback to tier 4
    }
  }

  // TIER 4: Offline Dictionary & Product Matcher Engine
  let intent: DetectedIntent = 'general_faq'
  let aiReply = ''

  if (!rawResponse) {
    providerUsed = 'offline_dictionary'
    modelUsed = 'offline-rule-matcher'

    // Simple offline keyword matcher
    const textLower = messageText.toLowerCase()
    const matchedProduct = products.find((p) => textLower.includes(p.name.toLowerCase()))

    if (matchedProduct) {
      intent = 'product_inquiry'
      if (detectedLang === 'banglish') {
        aiReply = `${matchedProduct.name} er dam ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'Stock e ache!' : 'Ekhon stock e nei.'}`
      } else if (detectedLang === 'bn') {
        aiReply = `${matchedProduct.name}-এর মূল্য ৳${matchedProduct.price}। ${matchedProduct.is_in_stock ? 'স্টকে আছে!' : 'বর্তমানে স্টকে নেই।'}`
      } else {
        aiReply = `${matchedProduct.name} is priced at ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'In stock!' : 'Out of stock.'}`
      }
    } else if (textLower.includes('order') || textLower.includes('delivery') || textLower.includes('status')) {
      intent = 'order_status'
      if (recentOrders.length > 0) {
        const lastOrder = recentOrders[0]
        if (detectedLang === 'banglish') {
          aiReply = `Apnar porer order (${lastOrder.order_number}) er status: ${lastOrder.status}. Total bill: ৳${lastOrder.total}.`
        } else if (detectedLang === 'bn') {
          aiReply = `আপনার সর্বশেষ অর্ডারের (${lastOrder.order_number}) স্ট্যাটাস: ${lastOrder.status}। মোট বিল: ৳${lastOrder.total}।`
        } else {
          aiReply = `Your recent order (${lastOrder.order_number}) status is ${lastOrder.status}. Total: ৳${lastOrder.total}.`
        }
      } else {
        aiReply = detectedLang === 'banglish' ? 'Apnar kono rasta order khuje pawa jayni.' : 'আপনার কোনো অর্ডার খুঁজে পাওয়া যায়নি।'
      }
    } else {
      intent = 'general_faq'
      if (detectedLang === 'banglish') {
        aiReply = `Dhonnobad ${account.name} e jogajog korar jonno! Kivabe shahajjo korte pari?`
      } else if (detectedLang === 'bn') {
        aiReply = `${account.name}-এ যোগাযোগের জন্য ধন্যবাদ! কীভাবে সাহায্য করতে পারি?`
      } else {
        aiReply = `Thank you for reaching out to ${account.name}! How can we assist you today?`
      }
    }
  } else {
    // Parse LLM rawResponse JSON
    try {
      const cleaned = rawResponse
        .replace(/^[\s\S]*?\{/, '{')
        .replace(/\}[^}]*$/, '}')
        .trim()
      const parsed = JSON.parse(cleaned) as { intent?: DetectedIntent; reply?: string }
      intent = parsed.intent || 'general_faq'
      aiReply = parsed.reply || rawResponse
    } catch {
      intent = 'general_faq'
      aiReply = rawResponse
    }
  }

  // 5. Log to ai_auto_replies database table (safe try/catch if table not created yet)
  let logId: string | undefined
  try {
    const { data: logEntry } = await db
      .from('ai_auto_replies')
      .insert({
        account_id: accountId,
        contact_id: contactId || null,
        channel,
        incoming_message: messageText.trim(),
        detected_language: detectedLang,
        intent_detected: intent,
        ai_reply: aiReply,
        provider_used: providerUsed,
        model_used: modelUsed,
      })
      .select('id')
      .maybeSingle()
    logId = logEntry?.id
  } catch (_logErr) {
    // Log insert failed (e.g. table not created yet), continue gracefully
  }

  return {
    id: logId,
    intent,
    language: detectedLang,
    aiReply,
    providerUsed,
    modelUsed,
  }
}
