import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { autoUpdateContactFromChatMessage } from '@/lib/contacts/auto-extract'
import { detectAndCreateOrderFromChat } from '@/lib/orders/auto-create-order'

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
  mediaUrl?: string | null
  pageAccessToken?: string | null
}

export interface RouterOutput {
  id?: string
  intent: DetectedIntent
  language: DetectedLanguage
  aiReply: string
  providerUsed: 'gemini' | 'groq' | 'openrouter' | 'offline_dictionary'
  modelUsed: string
}

export const ARABIC_URDU_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

export const BANGLISH_KEYWORDS = new Set([
  // Pronouns & Address
  'ami', 'tumi', 'apni', 'tui', 'amra', 'apnara', 'tora',
  'amar', 'amader', 'apnar', 'apnader', 'tomar', 'tomader', 'tore',
  'amake', 'apnake', 'tomake', 'amaderke', 'apnaderke',
  'bhai', 'bhaiya', 'bhaia', 'apu', 'vai', 'vaia', 'bro',
  // Question words
  'koto', 'kobe', 'kivabe', 'kibhabe', 'keno', 'karon',
  'kothay', 'kothai', 'kon', 'konta', 'ki', 'koi', 'kemon', 'kemne',
  // Verbs & Copulas
  'ache', 'ase', 'nai', 'nei', 'hobe',
  'hoyeche', 'hoise', 'korbo', 'koren', 'korben', 'dibo', 'debo',
  'diben', 'deben', 'den', 'nibo', 'nebo', 'niben', 'neben',
  'chai', 'pabo', 'lagbe', 'dekhun', 'bolen', 'bolbo', 'janan',
  'parben', 'pathan', 'pathaben', 'naki', 'pari', 'jante', 'bolte',
  // Vocabulary
  'dam', 'daam', 'shob', 'sob', 'khub', 'valo', 'bhalo',
  'taka', 'tk', 'ekhon', 'ajke', 'aj', 'dorkar', 'thik', 'thikana',
  'dhaka', 'shathe', 'sathe', 'eta', 'eita', 'oita', 'ei', 'oi',
  'er', 'te', 're', 'ke', 'theke', 'moto', 'motamoti', 'ekta', 'duto',
  'order', 'korlam', 'dilen', 'dilam', 'pelam', 'paici', 'paichi',
  'ekhane', 'shekhane', 'ojotha', 'dekhi', 'dekhlam', 'ashbe', 'ashbo'
])

export const ENGLISH_KEYWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
  'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
  'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
  'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
  'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
  'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
  'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
  'any', 'these', 'give', 'day', 'most', 'us', 'best', 'skin', 'dry', 'price',
  'product', 'available', 'order', 'please', 'thanks', 'thank', 'help', 'details',
  'deliver', 'delivery', 'address', 'shipping', 'cash', 'payment', 'send'
])

export const BENGALI_LETTER_REGEX = /[\u0985-\u09B9\u09CE\u09DC-\u09DF\u09BE-\u09CC]/

// Robust language detector matching English, Bengali (বাংলা script), and Banglish
export function detectLanguage(
  text: string,
  historyOrSetting?: string,
  settingOrHistory?: string
): DetectedLanguage {
  let recentHistory: string | undefined
  let preferredSetting = 'auto_detect'

  for (const arg of [historyOrSetting, settingOrHistory]) {
    if (!arg) continue
    if (arg === 'auto_detect' || arg === 'bn' || arg === 'banglish' || arg === 'en') {
      preferredSetting = arg
    } else {
      recentHistory = arg
    }
  }
  if (!text || typeof text !== 'string') {
    return preferredSetting === 'bn' || preferredSetting === 'banglish' ? preferredSetting : 'en'
  }

  const clean = text.trim()

  // 1. Check for actual Bengali script letters (excluding currency ৳ \u09F3 and digits \u09E6-\u09EF)
  // Bengali Unicode letters: \u0985-\u09B9, \u09CE, \u09DC-\u09DF and vowel signs \u09BE-\u09CC
  const bengaliLettersMatch = clean.match(/[\u0985-\u09B9\u09CE\u09DC-\u09DF\u09BE-\u09CC]/g)
  const bengaliLetterCount = bengaliLettersMatch ? bengaliLettersMatch.length : 0

  // Latin letters match
  const latinLettersMatch = clean.match(/[a-zA-Z]/g)
  const latinLetterCount = latinLettersMatch ? latinLettersMatch.length : 0

  // If there are actual Bengali letters and they outnumber Latin letters, it's definitely Bengali
  if (bengaliLetterCount >= 2 && bengaliLetterCount >= latinLetterCount) {
    return 'bn'
  }

  // 2. If it's mostly Latin letters, distinguish between Banglish and English
  if (latinLetterCount > 0) {
    const words = clean.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)

    let banglishScore = 0
    let englishScore = 0

    for (const w of words) {
      if (BANGLISH_KEYWORDS.has(w)) banglishScore++
      if (ENGLISH_KEYWORDS.has(w)) englishScore++
    }

    if (banglishScore > englishScore && banglishScore > 0) {
      return 'banglish'
    }

    if (englishScore > 0 && englishScore >= banglishScore) {
      return 'en'
    }

    // If ambiguous (e.g. only product name or numbers), check conversation history
    if (recentHistory) {
      const historyBnMatch = recentHistory.match(/[\u0985-\u09B9\u09CE\u09DC-\u09DF]/g)
      if (historyBnMatch && historyBnMatch.length > 5) return 'bn'

      const histWords = recentHistory.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
      let histBanglish = 0
      let histEnglish = 0
      for (const w of histWords) {
        if (BANGLISH_KEYWORDS.has(w)) histBanglish++
        if (ENGLISH_KEYWORDS.has(w)) histEnglish++
      }
      if (histBanglish > histEnglish && histBanglish > 0) return 'banglish'
      if (histEnglish > histBanglish && histEnglish > 0) return 'en'
    }

    // Default to English if written in Latin alphabet
    return 'en'
  }

  // 3. If no Latin and no Bengali letters (e.g. "+88017...", "৳1,000", "500"), check history
  if (recentHistory) {
    return detectLanguage(recentHistory, preferredSetting)
  }

  if (preferredSetting === 'bn') return 'bn'
  if (preferredSetting === 'banglish') return 'banglish'
  return 'en'
}

async function fetchImageAsBase64(url: string, pageToken?: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    let res = await fetch(url, { headers })
    if (!res.ok && pageToken) {
      headers['Authorization'] = `Bearer ${pageToken}`
      res = await fetch(url, { headers })
    }
    if (!res.ok) {
      console.warn('[AI Router Engine] Failed to download image from URL:', url, res.status)
      return null
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const mimeType = contentType.split(';')[0].trim() || 'image/jpeg'
    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return { data: base64, mimeType }
  } catch (err: any) {
    console.warn('[AI Router Engine] Error fetching image as base64:', err?.message || err)
    return null
  }
}

export function buildOfflineReply({
  detectedLang,
  messageText,
  products = [],
  recentOrders = [],
  account = {},
  conversationHistoryText = '',
  activeMediaUrl = null,
}: {
  detectedLang: DetectedLanguage
  messageText: string
  products?: any[]
  recentOrders?: any[]
  account?: any
  conversationHistoryText?: string
  activeMediaUrl?: string | null
}): { intent: DetectedIntent; reply: string } {
  let intent: DetectedIntent = 'general_faq'
  let reply = ''

  const textLower = messageText.toLowerCase().trim()
  const matchedProduct = products.find((p) => p?.name && textLower.includes(p.name.toLowerCase()))

  // 0. If an image was sent but offline fallback is active
  if (activeMediaUrl) {
    intent = 'product_inquiry'
    if (detectedLang === 'banglish') {
      reply = 'Apnar pathano chobi ti ami peyechi! Amader team ekhoni chobi ti dekhe product er stock o dam janacche, ektu shomoy din.'
    } else if (detectedLang === 'bn') {
      reply = 'আপনার পাঠানো ছবিটি আমি পেয়েছি! আমাদের প্রতিনিধি এখনই ছবিটি দেখে পণ্যের স্টক ও মূল্য জানিয়ে দিচ্ছেন, অনুগ্রহ করে একটু অপেক্ষা করুন।'
    } else {
      reply = 'I have received your product photo! Our team is reviewing the image right now to check availability and price for you.'
    }
  }
  // 1. Matched Product Inquiry
  else if (matchedProduct) {
    intent = 'product_inquiry'
    if (detectedLang === 'banglish') {
      reply = `${matchedProduct.name} er dam ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'Stock e ache!' : 'Ekhon stock e nei.'} Apni ki order korte chan?`
    } else if (detectedLang === 'bn') {
      reply = `${matchedProduct.name}-এর মূল্য ৳${matchedProduct.price}। ${matchedProduct.is_in_stock ? 'স্টকে আছে!' : 'বর্তমানে স্টকে নেই।'} আপনি কি অর্ডার করতে চান?`
    } else {
      reply = `${matchedProduct.name} is priced at ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'In stock!' : 'Out of stock.'} Would you like to place an order?`
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
    const paymentInfo = account?.special_instructions || 'Cash on Delivery (COD), bKash, and Nagad'
    if (detectedLang === 'banglish') {
      reply = `Amader payment options holo: ${paymentInfo}. Apni ki kono product order korte chan, Bhaiya?`
    } else if (detectedLang === 'bn') {
      reply = `আমাদের পেমেন্ট মেথড: ${paymentInfo}। আপনি কি কোনো পণ্য অর্ডার করতে চান?`
    } else {
      reply = `We accept: ${paymentInfo}. Would you like to proceed with placing an order?`
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
    const deliveryInfo = account?.delivery_policy || account?.ai_delivery_policy || 'Inside Dhaka ৳80, Outside Dhaka ৳150 (Free delivery on select orders)'
    if (detectedLang === 'banglish') {
      reply = `Amader delivery charge o policy: ${deliveryInfo}. Sara Bangladesh e amra home delivery dei!`
    } else if (detectedLang === 'bn') {
      reply = `আমাদের ডেলিভারি পলিসি ও চার্জ: ${deliveryInfo}। সারাদেশে হোম ডেলিভারি সুবিধা রয়েছে!`
    } else {
      reply = `Our delivery policy: ${deliveryInfo}. We deliver safely all over Bangladesh!`
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
    const returnInfo = account?.return_policy || account?.ai_return_policy || 'Standard exchange and return policy available'
    if (detectedLang === 'banglish') {
      reply = `Amader return policy: ${returnInfo}. Kono somossa hole amra druto somadhan kori.`
    } else if (detectedLang === 'bn') {
      reply = `আমাদের রিটার্ন পলিসি: ${returnInfo}। যেকোনো সমস্যায় আমরা দ্রুত সহায়তা প্রদান করি।`
    } else {
      reply = `Our return & exchange policy: ${returnInfo}. We ensure authentic products and full customer satisfaction.`
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
    if (recentOrders && recentOrders.length > 0) {
      const lastOrder = recentOrders[0]
      if (detectedLang === 'banglish') {
        reply = `Apnar order (${lastOrder.order_number}) er status: ${lastOrder.status}. Total bill: ৳${lastOrder.total}.`
      } else if (detectedLang === 'bn') {
        reply = `আপনার সর্বশেষ অর্ডারের (${lastOrder.order_number}) স্ট্যাটাস: ${lastOrder.status}। মোট বিল: ৳${lastOrder.total}।`
      } else {
        reply = `Your recent order (${lastOrder.order_number}) status is ${lastOrder.status}. Total: ৳${lastOrder.total}.`
      }
    } else {
      if (detectedLang === 'banglish') {
        reply = 'Apnar phone number ba order number ta dile ami ekhoni status check kore dicchi!'
      } else if (detectedLang === 'bn') {
        reply = 'অনুগ্রহ করে আপনার ফোন নম্বর বা অর্ডার নম্বরটি দিলে আমি এখনই স্ট্যাটাস চেক করে দিচ্ছি!'
      } else {
        reply = 'Please provide your order number or phone number so I can check your order status immediately!'
      }
    }
  }
  // 6. Generic Fallback
  else {
    intent = 'general_faq'
    const isGreeting = /^(hi|hello|hey|salam|slm|assalamu alaikum|hlw|হাই|হ্যালো|সালাম)[\s!.]*$/i.test(textLower)
    if (isGreeting && !conversationHistoryText) {
      if (detectedLang === 'banglish') {
        reply = `Hello! Kivabe shahajjo korte pari? Kono product ba service somporke jante chan?`
      } else if (detectedLang === 'bn') {
        reply = `আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি? কোনো পণ্য বা সার্ভিস সম্পর্কে জানতে চান?`
      } else {
        reply = `Hello! How can we assist you today? Are you looking for any particular product or service?`
      }
    } else {
      if (detectedLang === 'banglish') {
        reply = `Ji Bhaiya, ami apnar message ti bujhte perechi. Apnar pochonder product ba dorkari details bolun, ami ekhoni shob janacche!`
      } else if (detectedLang === 'bn') {
        reply = `জি, আমি আপনার বিষয়টি বুঝতে পেরেছি। আপনি কোন পণ্য বা সেবা সম্পর্কে জানতে চান বলুন, আমি বিস্তারিত জানাচ্ছি!`
      } else {
        reply = `Understood! Please tell me which product or details you would like to know about, and I will assist you right away.`
      }
    }
  }

  return { intent, reply }
}

export async function handleIncomingCustomerMessage({
  accountId,
  supabase,
  conversationId,
  contactId,
  customerPhone,
  channel = 'sandbox',
  messageText,
  mediaUrl,
  pageAccessToken,
}: RouterInput): Promise<RouterOutput | null> {
  if (!messageText?.trim() && !mediaUrl) return null

  if (!messageText?.trim() && mediaUrl) {
    messageText = 'Customer sent a product photo. Please inspect the image, identify the product/brand, and let them know if we have it in stock or recommend the best matching alternative from our store.'
  }

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

  // 1. Check Conversation-Level AI Auto-Reply & Human Assignment Status
  if (conversationId && channel !== 'sandbox') {
    try {
      const { data: convData } = await client
        .from('conversations')
        .select('id, ai_autoreply_disabled, assigned_agent_id, contact_id')
        .eq('id', conversationId)
        .maybeSingle()

      if (convData) {
        if (convData.ai_autoreply_disabled === true) {
          console.log(`[AI Router Engine] AI Auto-Reply disabled for conversation ${conversationId}`)
          return null
        }
        if (convData.assigned_agent_id) {
          console.log(`[AI Router Engine] Conversation ${conversationId} is assigned to human agent (${convData.assigned_agent_id})`)
          return null
        }
        if (!contactId && convData.contact_id) {
          contactId = convData.contact_id
        }
      }
    } catch (_convErr) {
      // safe fallback
    }
  }

  // 2. Check Per-Contact AI Mute Status
  if ((contactId || customerPhone) && channel !== 'sandbox') {
    try {
      let query = client.from('contacts').select('id, ai_auto_reply_muted')
      if (contactId) {
        query = query.eq('id', contactId)
      } else if (customerPhone) {
        query = query.or(`phone.eq.${customerPhone},messenger_id.eq.${customerPhone}`)
      }

      const { data: contactData } = await query.maybeSingle()
      if (contactData?.ai_auto_reply_muted === true) {
        console.log(`[AI Router Engine] Customer AI is muted for contact ${contactData.id} — skipping auto-reply`)
        return null
      }
    } catch (_cErr) {
      // safe fallback
    }
  }

  // Auto extract contact info (phone/address/email) from customer's chat message into their own contact
  if (contactId && messageText) {
    autoUpdateContactFromChatMessage({
      contactId,
      accountId: account?.id || accountId,
      messageText,
      supabase: client,
    }).catch((e) => console.warn('[AI Router Engine] Failed to auto-update contact info:', e))
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

  // 2. Fetch Recent Conversation History for Context & Memory
  let conversationHistoryText = ''
  let historyMsgs: any[] = []
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
      const { data: convMsgs } = await client
        .from('messages')
        .select('sender_type, content_type, content_text, media_url, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(12)

      if (convMsgs && convMsgs.length > 0) {
        historyMsgs = convMsgs
        const chronological = [...convMsgs].reverse()
        conversationHistoryText = chronological
          .map((m) => {
            const role = m.sender_type === 'customer' ? 'Customer' : 'Salesman'
            if (m.media_url && (m.content_type === 'image' || m.content_text === 'Photo')) {
              return `${role}: [Uploaded a product photo: ${m.content_text || 'Photo'}]`
            }
            return `${role}: ${m.content_text || ''}`
          })
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
        .select('sender_type, content_type, content_text, media_url, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(12)

      if (contactMsgs && contactMsgs.length > 0) {
        if (!historyMsgs.length) historyMsgs = contactMsgs
        const chronological = [...contactMsgs].reverse()
        conversationHistoryText = chronological
          .map((m) => {
            const role = m.sender_type === 'customer' ? 'Customer' : 'Salesman'
            if (m.media_url && (m.content_type === 'image' || m.content_text === 'Photo')) {
              return `${role}: [Uploaded a product photo: ${m.content_text || 'Photo'}]`
            }
            return `${role}: ${m.content_text || ''}`
          })
          .join('\n')
      }
    } catch (fallbackHistErr) {
      console.warn('[AI Router Engine] Failed to fetch contact message history:', fallbackHistErr)
    }
  }

  // Resolve active image from current message or recent conversation history
  let activeMediaUrl = mediaUrl || null
  if (!activeMediaUrl && historyMsgs && historyMsgs.length > 0) {
    const recentImageMsg = historyMsgs.find(
      (m: any) =>
        m.sender_type === 'customer' &&
        m.media_url &&
        (m.content_type === 'image' || m.content_text === 'Photo' || m.content_text?.toLowerCase().includes('photo'))
    )
    if (recentImageMsg?.media_url) {
      activeMediaUrl = recentImageMsg.media_url
    }
  }

  // Download active image as base64 for multimodal vision
  let imageBase64: { data: string; mimeType: string } | null = null
  if (activeMediaUrl) {
    imageBase64 = await fetchImageAsBase64(
      activeMediaUrl,
      pageAccessToken || account?.facebook_page_access_token || undefined
    )
  }

  // 3. Detect language with full conversation history context
  const detectedLang = detectLanguage(
    messageText,
    conversationHistoryText,
    account.ai_primary_language || 'auto_detect'
  )

  // 4. Fetch Ground Truth Context (Products & Customer Orders - Safe queries)
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

  // 5. Build Strict Language Instruction & Negative Constraints
  let langGuidance = ''
  if (detectedLang === 'bn') {
    langGuidance = 'STRICT REQUIREMENT: The customer is communicating in Bengali. You MUST reply in natural, polite Bangladeshi Bengali written ONLY in Bengali script (বাংলা বর্ণমালা). NEVER output Arabic, Urdu, or Hindi characters. Every sentence must be in proper Bengali.'
  } else if (detectedLang === 'banglish') {
    langGuidance = 'STRICT REQUIREMENT: The customer is communicating in Banglish. You MUST reply in natural Banglish (spoken Bengali written in Latin/English alphabet). For example: "Bhaiya, Nivea face wash er dam ৳850. Stock e ache!". NEVER output Bengali script, Arabic, Urdu, or Hindi characters.'
  } else {
    langGuidance = 'STRICT REQUIREMENT: The customer is communicating in English. You MUST reply completely and purely in clear, natural, and helpful English using the Latin alphabet. NEVER switch to Bengali script, Banglish, Arabic, Urdu, or any other language.'
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

2. MULTIMODAL & PRODUCT PHOTO RULES:
   - YOU CAN DIRECTLY VIEW AND INSPECT PHOTOS/IMAGES! NEVER say "I am unable to view the photo directly in the chat" or ask the customer to type the product name because you can't see pictures.
   - When a customer sends or asks about a product photo:
     1. Inspect the photo carefully: Identify the exact brand, product name, variant, volume/size, packaging, and purpose.
     2. Cross-reference with our CATALOG & INVENTORY above:
        - If we have this exact item in stock: Enthusiastically confirm! Quote the price (৳), confirm stock, highlight benefits, and ask if they would like to place an order now!
        - If we do NOT carry that exact brand or product: Name what product is in their photo (e.g. "Eita holo No7 Radiant Results Purifying Foaming Cleanser..."), politely let them know we don't have this exact brand right now, but enthusiastically recommend our best matching alternative from our store catalog (e.g. our cleansers or skincare in stock with prices and benefits)!
        - If they just sent a photo with no text, warmly identify what product it is and ask how you can help or if they'd like to order!

3. ANSWER THE ACTUAL QUESTION WITH EXPERT DETAIL:
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

4. CLOSE THE SALE (CALL TO ACTION):
   - Always conclude with a natural, gentle question to help them buy, e.g.:
     "Do you want me to process your order now, Bhaiya?" or "Which email should we activate it on?" or "Would you like to order today?"

5. STRICT LANGUAGE & SCRIPT RULES (ZERO TOLERANCE):
   - ${langGuidance}
   - Persona: ${toneGuidance}
   - Addressing: ${communicationGuidance}
   - ABSOLUTE PROHIBITION: You must NEVER, under any circumstance, generate Arabic script (عربى / اردو), Urdu, or Devanagari script. Our business operates in Bangladesh and communicates strictly in English, Bengali (বাংলা script), or Banglish according to what the customer speaks.
   - Match the customer's language strictly:
     * English customer input -> 100% English reply using Latin alphabet.
     * Bengali customer input (বাংলা) -> Bengali reply using Bengali script (বাংলা বর্ণমালা).
     * Banglish customer input -> Banglish reply using English/Latin alphabet.
   - Currency symbol: Always use the Bangladeshi Taka symbol '৳' or 'Tk' with product prices (e.g. ৳1,000). The symbol '৳' does NOT mean the customer is writing in Bengali.

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

=== ORDER CAPTURE & CHECKOUT INSTRUCTIONS ===
1. PAYMENT METHOD:
   - If the customer wants to order and gives an address/number, check if they specified their payment method (Cash on Delivery / bKash / Nagad / Rocket).
   - If they have NOT specified how they want to pay, politely ask whether they prefer Cash on Delivery or digital payment (bKash/Nagad/Rocket).
   - If they chose bKash/Nagad/Rocket, acknowledge it and state that payment details can be completed, or send our payment number if provided.

2. ORDER STATUS IS "UNDER REVIEW" (PENDING APPROVAL):
   - When taking the order, inform the customer that their order has been placed and is currently UNDER REVIEW / AWAITING VERIFICATION (পর্যালোচনার অধীনে) by our team.
   - Example (Bengali): "ধন্যবাদ! আপনার অর্ডারটি গ্রহণ করা হয়েছে এবং এটি পর্যালোচনার অধীনে রয়েছে। আমাদের টিম তথ্যগুলো যাচাই করে দ্রুত অর্ডারটি কনফার্ম করবে।"
   - Example (English): "Thank you! Your order has been placed and is currently under review by our store team. We will verify and confirm it shortly."
   - Do NOT say "Order has been confirmed and dispatched" — it is pending manual approval by the shop owner in JobabDesk!

3. ACCURATE PRODUCT PRICING (ZERO TOLERANCE FOR PHONE NUMBER PRICES):
   - Only use actual catalog product prices (e.g. ৳1000, ৳50).
   - NEVER, under any circumstance, use a customer's phone number or bKash number (such as 01326596251) as a product price, unit price, or total!

4. STRUCTURED ORDER OUTPUT:
Return ONLY a valid JSON object:
{
  "intent": "product_inquiry" | "order_status" | "general_faq" | "human_escalation",
  "reply": "string (your natural, persuasive human salesman reply)",
  "confidence": 0.95,
  "order": {
    "is_order": true,
    "customer_name": "string or null",
    "customer_phone": "string or null",
    "customer_address": "string or null",
    "payment_method": "cod" | "bkash" | "nagad" | "rocket" | "bank_transfer",
    "items": [
      {
        "product_name": "string",
        "unit_price": 1000,
        "quantity": 1
      }
    ],
    "subtotal": 1000,
    "delivery_charge": 0,
    "total": 1000,
    "notes": "string or null"
  }
}
Note: If no order is being placed or confirmed in this turn, set "order": null.`

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
        const parts: any[] = []
        if (imageBase64) {
          parts.push({
            inlineData: {
              mimeType: imageBase64.mimeType,
              data: imageBase64.data,
            },
          })
        }
        parts.push({ text: systemPrompt })
        parts.push({
          text: imageBase64
            ? `Customer Message:\n"${messageText}"\n\n[NOTE: Customer attached or referenced the product photo above. Inspect it thoroughly. Identify the exact brand, product name, and formula. Cross-reference with our Catalog & Inventory. If available, offer it. If not, recommend our best matching alternative from our store catalog. Never say you cannot view photos!]`
            : `Customer Message:\n"${messageText}"`,
        })

        const resp = await ai.models.generateContent({
          model: gModel,
          contents: [{ role: 'user', parts }],
          config: { temperature: 0.65 },
        })
        const txt = resp.text?.trim()
        if (txt) {
          if (ARABIC_URDU_REGEX.test(txt)) {
            console.warn(`[AI Router Engine] Discarding Gemini model ${gModel} output (forbidden Arabic/Urdu script)`)
            continue
          }
          if (detectedLang === 'en' && BENGALI_LETTER_REGEX.test(txt)) {
            console.warn(`[AI Router Engine] Discarding Gemini model ${gModel} output (customer spoke English but output had Bengali script)`)
            continue
          }
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
          if (ARABIC_URDU_REGEX.test(content)) {
            console.warn(`[AI Router Engine] Discarding Groq model ${groqModel} output (forbidden Arabic/Urdu script)`)
            continue
          }
          if (detectedLang === 'en' && BENGALI_LETTER_REGEX.test(content)) {
            console.warn(`[AI Router Engine] Discarding Groq model ${groqModel} output (customer spoke English but output had Bengali script)`)
            continue
          }
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
        const messages: any[] = [
          { role: 'system', content: systemPrompt },
        ]

        if (imageBase64) {
          messages.push({
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${messageText}\n\n[NOTE: Customer attached a product photo. Inspect it, identify the brand/product, check our catalog, and assist them. Never say you cannot view photos!]`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageBase64.mimeType};base64,${imageBase64.data}`,
                },
              },
            ],
          })
        } else {
          messages.push({ role: 'user', content: messageText })
        }

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
            messages,
            temperature: 0.65,
          }),
        })
        const orJson = await openRouterResp.json()
        const content = orJson?.choices?.[0]?.message?.content?.trim()
        if (content) {
          if (ARABIC_URDU_REGEX.test(content)) {
            console.warn(`[AI Router Engine] Discarding OpenRouter model ${orModel} output (forbidden Arabic/Urdu script)`)
            continue
          }
          if (detectedLang === 'en' && BENGALI_LETTER_REGEX.test(content)) {
            console.warn(`[AI Router Engine] Discarding OpenRouter model ${orModel} output (customer spoke English but output had Bengali script)`)
            continue
          }
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

  // TIER 4: Offline Rule Matcher Engine
  let intent: DetectedIntent = 'general_faq'
  let aiReply = ''

  let llmOrderData: any = null
  if (!rawResponse) {
    providerUsed = 'offline_dictionary'
    modelUsed = 'offline-rule-matcher'
    const offline = buildOfflineReply({
      detectedLang,
      messageText,
      products,
      recentOrders,
      account,
      conversationHistoryText,
      activeMediaUrl,
    })
    intent = offline.intent
    aiReply = offline.reply
  } else {
    // Parse LLM rawResponse JSON
    try {
      const cleaned = rawResponse
        .replace(/^[\s\S]*?\{/, '{')
        .replace(/\}[^}]*$/, '}')
        .trim()
      const parsed = JSON.parse(cleaned) as {
        intent?: DetectedIntent
        reply?: string
        order?: any
      }
      intent = parsed.intent || 'general_faq'
      aiReply = parsed.reply || rawResponse
      llmOrderData = parsed.order || null
    } catch {
      intent = 'general_faq'
      aiReply = rawResponse
    }
  }

  // Safety & Script Guardrail: If parsed aiReply contains Arabic/Urdu or violates English requirement, fall back to buildOfflineReply
  if (
    ARABIC_URDU_REGEX.test(aiReply) ||
    (detectedLang === 'en' && BENGALI_LETTER_REGEX.test(aiReply))
  ) {
    console.warn('[AI Router Engine] AI output violated language/script guardrail. Falling back to offline reply. Raw:', aiReply)
    providerUsed = 'offline_dictionary'
    modelUsed = 'offline-rule-matcher'
    const fallbackOffline = buildOfflineReply({
      detectedLang,
      messageText,
      products,
      recentOrders,
      account,
      conversationHistoryText,
      activeMediaUrl,
    })
    intent = fallbackOffline.intent
    aiReply = fallbackOffline.reply
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

  // 4. Automatic Order Capture to 'orders' table (sets status 'new' for shop owner review)
  try {
    detectAndCreateOrderFromChat({
      accountId: account?.id || accountId,
      contactId: contactId || null,
      conversationId: convId || null,
      channel,
      customerName: null,
      customerPhone: customerPhone || null,
      customerAddress: null,
      messageText,
      conversationHistoryText,
      llmOrderData,
      storeProducts: products,
      supabase: client,
    }).catch((err) => {
      console.warn('[AI Router Engine] Failed to auto-create order from chat:', err)
    })
  } catch (err) {
    console.warn('[AI Router Engine] Order capture error:', err)
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
