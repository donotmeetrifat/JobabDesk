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
      .select('*')
      .eq('id', accountId)
      .maybeSingle()
    account = acctData
  } catch {
    // fallback
  }

  if (!account && accountId) {
    try {
      const { data: fallbackAcct } = await client
        .from('accounts')
        .select('*')
        .eq('owner_user_id', accountId)
        .limit(1)
        .maybeSingle()
      if (fallbackAcct) account = fallbackAcct
    } catch {}
  }

  if (!account) {
    try {
      const { data: anyAcct } = await client
        .from('accounts')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (anyAcct) account = anyAcct
    } catch {}
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

  // Jittered Human Typing Simulation (800ms - 1500ms delay) to mimic natural human typing & avoid bot ban flags
  if (channel !== 'sandbox') {
    const typingDelay = Math.floor(Math.random() * 700) + 800
    await new Promise((r) => setTimeout(r, typingDelay))
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
    const targetAccountId = account?.id || accountId
    let pQuery = client
      .from('products')
      .select('name, price, brand, category, stock_qty, is_in_stock, description')
      .eq('is_active', true)
      .limit(100)

    if (targetAccountId) {
      pQuery = pQuery.eq('account_id', targetAccountId)
    }

    const { data: pData } = await pQuery
    products = pData ?? []

    // If 0 products found by account_id, query all active products in tenant as fallback
    if (products.length === 0) {
      const { data: fallbackPData } = await client
        .from('products')
        .select('name, price, brand, category, stock_qty, is_in_stock, description')
        .eq('is_active', true)
        .limit(100)
      if (fallbackPData && fallbackPData.length > 0) {
        products = fallbackPData
      }
    }
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

  // Fetch Recent Conversation History for Context & Memory
  let conversationHistoryText = ''
  if (contactId || customerPhone) {
    try {
      let convId = ''
      if (contactId) {
        const { data: convRow } = await client
          .from('conversations')
          .select('id')
          .eq('account_id', account?.id || accountId)
          .eq('contact_id', contactId)
          .maybeSingle()
        convId = convRow?.id || ''
      }

      if (convId) {
        const { data: historyMsgs } = await client
          .from('messages')
          .select('sender_type, content_text, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(8)

        if (historyMsgs && historyMsgs.length > 0) {
          const chronological = [...historyMsgs].reverse()
          conversationHistoryText = chronological
            .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Salesman'}: ${m.content_text || ''}`)
            .join('\n')
        }
      }
    } catch (histErr) {
      console.warn('[AI Router Engine] Failed to fetch conversation history:', histErr)
    }
  }

  const resolvedStoreName =
    (account.name && account.name.trim().toLowerCase() !== 'rifat' && account.name.trim() !== 'User' ? account.name.trim() : null) ||
    account.facebook_page_name ||
    account.name ||
    'Digiplus'

  const businessContext = `
Store Name: ${resolvedStoreName}
Tagline: ${account.business_tagline || 'N/A'}
Store Overview: ${account.ai_business_description || account.ai_store_instructions || 'N/A'}
Categories Sold: ${account.product_categories_sold || 'N/A'}
Target Customer Profile: ${account.target_audience || 'Customers in Bangladesh'}
Customer Communication Style: ${communicationGuidance}
Delivery Rates & Policy: ${account.delivery_policy || account.ai_delivery_policy || 'Inside Dhaka ৳80, Outside Dhaka ৳150'}
Return Policy: ${account.return_policy || account.ai_return_policy || 'Standard exchange policy'}
Payment Info: ${account.special_instructions || 'Cash on Delivery, bKash, Nagad'}
`.trim()

  const systemPrompt = `You are an expert, friendly, and persuasive human sales representative and store assistant for "${resolvedStoreName}".
You are chatting live with a customer on Facebook Messenger / WhatsApp.

=== STORE IDENTITY & SETTINGS ===
${businessContext}

=== CRITICAL HUMAN SALESMAN RULES (MUST FOLLOW) ===
1. SPEAK LIKE A REAL HUMAN SALESMAN, NEVER A ROBOT:
   - Talk naturally, warmly, and helpfully.
   - NEVER repeat robotic template phrases like "Hello Bhaiya/Apu! We have [Product] available in our store. It is priced at just...".
   - NO REPETITIVE GREETINGS: If you or the customer have ALREADY greeted earlier in the Conversation History, DO NOT greet again! Answer their question directly.

2. ANSWER THE ACTUAL QUESTION WITH EXPERT DETAIL:
   - When a customer asks for details about a product (e.g. "give me some detail about canva", "what are the features?", "how does it work?"):
     * Thoroughly explain what the product is, its key benefits, and why it's great for them!
     * For example, for Canva Pro: explain that it gives unlimited access to millions of premium graphic templates, 100M+ stock photos, AI background remover, brand kits, magic resize, and high-resolution exports without watermarks.
     * For software/subscriptions, explain that they get full access on their own email with instant delivery.
     * For physical products (skincare, gadgets, clothing), explain the benefits, ingredients/specs, and results.
     * Do NOT just mindlessly repeat "the price is ৳50 and it is in stock". Address what they asked!

3. CLOSE THE SALE (CALL TO ACTION):
   - Always conclude with a natural, gentle question to help them buy, e.g.:
     "Do you want me to process your order now, Bhaiya?" or "Which email should we activate it on?" or "Would you like to order today?"

4. LANGUAGE & TONE:
   - Language: ${langGuidance}
   - Persona: ${toneGuidance}
   - Addressing: ${communicationGuidance}

=== CATALOG & INVENTORY ===
${
  products.length === 0
    ? 'No products available.'
    : products
        .map(
          (p) =>
            `- Product: "${p.name}", Price: ৳${p.price}, Stock: ${p.stock_qty} (${p.is_in_stock ? 'In Stock' : 'Out of Stock'}), Category: ${p.category || 'General'}${p.description ? `, Info: ${p.description}` : ''}`
        )
        .join('\n')
}

=== RECENT CONVERSATION HISTORY ===
${conversationHistoryText ? conversationHistoryText : '(Start of new conversation)'}

Current Customer Message:
"${messageText}"

Return ONLY a valid JSON object:
{
  "intent": "product_inquiry" | "order_status" | "general_faq" | "human_escalation",
  "reply": "string (your natural, persuasive human salesman reply)",
  "confidence": 0.95
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
          config: { temperature: 0.65 },
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
          temperature: 0.65,
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

  // TIER 3: OpenRouter API Fallback (Verified Bengali-Capable Free Models)
  if (!rawResponse && process.env.OPENROUTER_API_KEY) {
    const openRouterModels = [
      'qwen/qwen-2.5-72b-instruct:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemini-2.0-flash-exp:free',
    ]

    for (const orModel of openRouterModels) {
      try {
        const openRouterResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: messageText },
            ],
            temperature: 0.2,
          }),
        })
        const orJson = await openRouterResp.json()
        const content = orJson?.choices?.[0]?.message?.content?.trim()
        if (content) {
          rawResponse = content
          providerUsed = 'openrouter'
          modelUsed = orModel
          break
        }
      } catch {
        // try next openrouter model
      }
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
        aiReply = `Dhonnobad ${resolvedStoreName} e jogajog korar jonno! Kivabe shahajjo korte pari?`
      } else if (detectedLang === 'bn') {
        aiReply = `${resolvedStoreName}-এ যোগাযোগের জন্য ধন্যবাদ! কীভাবে সাহায্য করতে পারি?`
      } else {
        aiReply = `Thank you for reaching out to ${resolvedStoreName}! How can we assist you today?`
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
