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
  conversationId?: string | null
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
  conversationId,
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
  let convId = conversationId || ''
  if (!convId && (contactId || customerPhone)) {
    try {
      if (contactId) {
        const { data: convRows } = await client
          .from('conversations')
          .select('id')
          .eq('account_id', account?.id || accountId)
          .eq('contact_id', contactId)
          .order('last_message_at', { ascending: false })
          .limit(1)
        convId = convRows?.[0]?.id || ''
      }
    } catch (histErr) {
      console.warn('[AI Router Engine] Failed to fetch conversation row:', histErr)
    }
  }

  if (convId) {
    try {
      const { data: historyMsgs } = await client
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(12)

      if (historyMsgs && historyMsgs.length > 0) {
        const chronological = [...historyMsgs].reverse()
        conversationHistoryText = chronological
          .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Salesman'}: ${m.content_text || ''}`)
          .join('\n')
      }
    } catch (histErr) {
      console.warn('[AI Router Engine] Failed to fetch conversation history:', histErr)
    }
  }

  // Fallback: If no convId found, query by contact_id directly
  if (!conversationHistoryText && contactId) {
    try {
      const { data: contactMsgs } = await client
        .from('messages')
        .select('sender_type, content_text, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(12)

      if (contactMsgs && contactMsgs.length > 0) {
        const chronological = [...contactMsgs].reverse()
        conversationHistoryText = chronological
          .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Salesman'}: ${m.content_text || ''}`)
          .join('\n')
      }
    } catch (fallbackHistErr) {
      console.warn('[AI Router Engine] Failed to fetch contact message history:', fallbackHistErr)
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
   - ABSOLUTELY NO REPETITIVE GREETINGS OR WELCOME PHRASES:
     * NEVER say "Thank you for reaching out to [Store]! How can we assist you today?".
     * NEVER greet the customer again if there is prior conversation history or if they asked a specific question.
     * When a customer asks about payment methods, delivery rates, return policy, or products, ANSWER THEIR QUESTION IMMEDIATELY AND DIRECTLY!
   - NO ROBOTIC TEMPLATES: Never repeat phrases like "Hello Bhaiya/Apu! We have [Product] available in our store...".

2. ANSWER THE ACTUAL QUESTION WITH EXPERT DETAIL:
   - If they ask about Payment Methods (e.g. "Payment Methods?", "kivabe pay korbo?", "bKash ache?"):
     * Directly list the accepted payment options: Cash on Delivery (COD) all over Bangladesh, bKash, and Nagad.
     * Conclude with a helpful question to assist with their order!
   - If they ask about Delivery Rates / Return Policy:
     * Clearly state the rates and policies from Store Settings.
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

  // TIER 1: Gemini API Fallback Chain (Prioritize fast active models with separate free quotas)
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (geminiApiKey) {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    const geminiModels = [
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ]

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
      } catch (err: any) {
        console.warn(`[AI Router Engine] Gemini model ${gModel} failed:`, err?.message || err)
        // try next model
      }
    }
  }

  // TIER 2: Groq Free API Fallback (Multiple models for guaranteed backup if Gemini fails)
  const groqApiKey = (
    process.env.GROQ_API_KEY ||
    (process.env.OPENROUTER_API_KEY?.startsWith('gsk_') ? process.env.OPENROUTER_API_KEY : '') ||
    ''
  ).trim()

  if (!rawResponse && groqApiKey) {
    const groqModels = [
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
      'openai/gpt-oss-20b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ]

    for (const groqModel of groqModels) {
      try {
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: groqModel,
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
          modelUsed = groqModel
          break
        } else {
          console.warn(`[AI Router Engine] Groq model ${groqModel} returned empty:`, groqJson?.error?.message || groqJson)
        }
      } catch (groqErr: any) {
        console.warn(`[AI Router Engine] Groq model ${groqModel} failed:`, groqErr?.message || groqErr)
      }
    }
  }

  // TIER 3: OpenRouter API Fallback (Verified Bengali-Capable & Free Models)
  const openRouterApiKey = (
    process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.startsWith('gsk_')
      ? process.env.OPENROUTER_API_KEY
      : ''
  ).trim()

  if (!rawResponse && openRouterApiKey) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jobabdesk.vercel.app'
    const openRouterModels = [
      'openrouter/free',
      'qwen/qwen3.8-27b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct',
    ]

    for (const orModel of openRouterModels) {
      try {
        const openRouterResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': siteUrl,
            'X-Title': 'JobabDesk',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: messageText },
            ],
            temperature: 0.65,
          }),
        })
        const orJson = await openRouterResp.json()
        const content = orJson?.choices?.[0]?.message?.content?.trim()
        if (content) {
          rawResponse = content
          providerUsed = 'openrouter'
          modelUsed = orModel
          break
        } else {
          console.warn(`[AI Router Engine] OpenRouter model ${orModel} returned empty:`, orJson?.error?.message || orJson)
        }
      } catch (orErr: any) {
        console.warn(`[AI Router Engine] OpenRouter model ${orModel} failed:`, orErr?.message || orErr)
      }
    }
  }

  // TIER 4: Offline Rule Matcher Engine (Directly answers inquiries without repetitive welcome greetings)
  let intent: DetectedIntent = 'general_faq'
  let aiReply = ''

  if (!rawResponse) {
    providerUsed = 'offline_dictionary'
    modelUsed = 'offline-rule-matcher'

    const textLower = messageText.toLowerCase().trim()
    const matchedProduct = products.find((p) => textLower.includes(p.name.toLowerCase()))

    // 1. Matched Product Inquiry
    if (matchedProduct) {
      intent = 'product_inquiry'
      if (detectedLang === 'banglish') {
        aiReply = `${matchedProduct.name} er dam ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'Stock e ache!' : 'Ekhon stock e nei.'} Apni ki order korte chan?`
      } else if (detectedLang === 'bn') {
        aiReply = `${matchedProduct.name}-এর মূল্য ৳${matchedProduct.price}। ${matchedProduct.is_in_stock ? 'স্টকে আছে!' : 'বর্তমানে স্টকে নেই।'} আপনি কি অর্ডার করতে চান?`
      } else {
        aiReply = `${matchedProduct.name} is priced at ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'In stock!' : 'Out of stock.'} Would you like to place an order?`
      }
    }
    // 2. Payment Methods Inquiry
    else if (
      textLower.includes('payment') ||
      textLower.includes('pay') ||
      textLower.includes('bkash') ||
      textLower.includes('nagad') ||
      textLower.includes('rocket') ||
      textLower.includes('cash') ||
      textLower.includes('cod') ||
      textLower.includes('bikas') ||
      textLower.includes('taka pathabo') ||
      textLower.includes('টাকা') ||
      textLower.includes('পেমেন্ট')
    ) {
      intent = 'general_faq'
      const paymentInfo = account.special_instructions || 'Cash on Delivery (COD), bKash, and Nagad'
      if (detectedLang === 'banglish') {
        aiReply = `Amader payment options holo: ${paymentInfo}. Apni ki kono product order korte chan, Bhaiya?`
      } else if (detectedLang === 'bn') {
        aiReply = `আমাদের পেমেন্ট মেথড: ${paymentInfo}। আপনি কি কোনো পণ্য অর্ডার করতে চান?`
      } else {
        aiReply = `We accept: ${paymentInfo}. Would you like to proceed with placing an order?`
      }
    }
    // 3. Delivery Rates & Shipping Policy
    else if (
      textLower.includes('delivery') ||
      textLower.includes('shipping') ||
      textLower.includes('charge') ||
      textLower.includes('rate') ||
      textLower.includes('courier') ||
      textLower.includes('pathao') ||
      textLower.includes('ডেলিভারি')
    ) {
      intent = 'general_faq'
      const deliveryInfo = account.delivery_policy || account.ai_delivery_policy || 'Inside Dhaka ৳80, Outside Dhaka ৳150 (Free delivery on select orders)'
      if (detectedLang === 'banglish') {
        aiReply = `Amader delivery charge o policy: ${deliveryInfo}. Sara Bangladesh e amra home delivery dei!`
      } else if (detectedLang === 'bn') {
        aiReply = `আমাদের ডেলিভারি পলিসি ও চার্জ: ${deliveryInfo}। সারাদেশে হোম ডেলিভারি সুবিধা রয়েছে!`
      } else {
        aiReply = `Our delivery policy: ${deliveryInfo}. We deliver safely all over Bangladesh!`
      }
    }
    // 4. Return & Exchange Policy
    else if (
      textLower.includes('return') ||
      textLower.includes('refund') ||
      textLower.includes('exchange') ||
      textLower.includes('warranty') ||
      textLower.includes('guarantee') ||
      textLower.includes('policy') ||
      textLower.includes('রিটার্ন')
    ) {
      intent = 'general_faq'
      const returnInfo = account.return_policy || account.ai_return_policy || 'Standard exchange and return policy available'
      if (detectedLang === 'banglish') {
        aiReply = `Amader return policy: ${returnInfo}. Kono somossa hole amra druto somadhan kori.`
      } else if (detectedLang === 'bn') {
        aiReply = `আমাদের রিটার্ন পলিসি: ${returnInfo}। যেকোনো সমস্যায় আমরা দ্রুত সহায়তা প্রদান করি।`
      } else {
        aiReply = `Our return & exchange policy: ${returnInfo}. We ensure authentic products and full customer satisfaction.`
      }
    }
    // 5. Order Status & Tracking
    else if (
      textLower.includes('order status') ||
      textLower.includes('track') ||
      textLower.includes('kobe pabo') ||
      textLower.includes('amar order') ||
      textLower.includes('order number')
    ) {
      intent = 'order_status'
      if (recentOrders.length > 0) {
        const lastOrder = recentOrders[0]
        if (detectedLang === 'banglish') {
          aiReply = `Apnar order (${lastOrder.order_number}) er status: ${lastOrder.status}. Total bill: ৳${lastOrder.total}.`
        } else if (detectedLang === 'bn') {
          aiReply = `আপনার সর্বশেষ অর্ডারের (${lastOrder.order_number}) স্ট্যাটাস: ${lastOrder.status}। মোট বিল: ৳${lastOrder.total}।`
        } else {
          aiReply = `Your recent order (${lastOrder.order_number}) status is ${lastOrder.status}. Total: ৳${lastOrder.total}.`
        }
      } else {
        if (detectedLang === 'banglish') {
          aiReply = 'Apnar phone number ba order number ta dile ami ekhoni status check kore dicchi!'
        } else if (detectedLang === 'bn') {
          aiReply = 'অনুগ্রহ করে আপনার ফোন নম্বর বা অর্ডার নম্বরটি দিলে আমি এখনই স্ট্যাটাস চেক করে দিচ্ছি!'
        } else {
          aiReply = 'Please provide your order number or phone number so I can check your order status immediately!'
        }
      }
    }
    // 6. Generic Fallback — NEVER output canned "Thank you for reaching out..."
    else {
      intent = 'general_faq'
      const isGreeting = /^(hi|hello|hey|salam|slm|assalamu alaikum|hlw|হাই|হ্যালো|সালাম)[\s!.]*$/i.test(textLower)
      if (isGreeting && !conversationHistoryText) {
        // Fresh start with a pure greeting
        if (detectedLang === 'banglish') {
          aiReply = `Hello! Kivabe shahajjo korte pari? Kono product ba service somporke jante chan?`
        } else if (detectedLang === 'bn') {
          aiReply = `আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি? কোনো পণ্য বা সার্ভিস সম্পর্কে জানতে চান?`
        } else {
          aiReply = `Hello! How can we assist you today? Are you looking for any particular product or service?`
        }
      } else {
        // Ongoing conversation or direct question fallback
        if (detectedLang === 'banglish') {
          aiReply = `Ji Bhaiya, ami apnar message ti bujhte perechi. Apnar pochonder product ba dorkari details bolun, ami ekhoni shob janacche!`
        } else if (detectedLang === 'bn') {
          aiReply = `জি, আমি আপনার বিষয়টি বুঝতে পেরেছি। আপনি কোন পণ্য বা সেবা সম্পর্কে জানতে চান বলুন, আমি বিস্তারিত জানাচ্ছি!`
        } else {
          aiReply = `Understood! Please tell me which product or details you would like to know about, and I will assist you right away.`
        }
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

  // Sanitization: Strip repetitive canned welcome prefixes if generated in ongoing chats
  if (aiReply) {
    const cleanedReply = aiReply
      .replace(/^Thank you for reaching out to [^.!?\n]+[.!?]\s*(How can we assist you today\??\s*)?/i, '')
      .replace(/^Dhonnobad [^.!?\n]+ e jogajog korar jonno[!.]?\s*(Kivabe shahajjo korte pari\??\s*)?/i, '')
      .replace(/^[^\s]+-এ যোগাযোগের জন্য ধন্যবাদ[!.]?\s*(কীভাবে সাহায্য করতে পারি\??\s*)?/i, '')
      .trim()
    if (cleanedReply.length > 0) {
      aiReply = cleanedReply
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
