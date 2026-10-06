import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import { autoUpdateContactFromChatMessage } from '@/lib/contacts/auto-extract'
import { detectAndCreateOrderFromChat } from '@/lib/orders/auto-create-order'
import { isDigitalProduct, checkIsDigitalOrder, isDigitalText } from '@/lib/products/product-type'
import { extractCustomerInfoFromMessage, isFacebookPsid } from '@/lib/contacts/extract-info'

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

  // 0. Check for explicit customer instructions requesting Bengali or English
  const banglaRequestRegex = /\b(?:banglay\s*kotha\s*bolen|bangla\s*te\s*bolen|banglay\s*bolen|বাংলায়\s*বলুন|বাংলায়\s*কথা\s*বলুন|pure\s*bangla|speak\s*in\s*bangla|speak\s*bangla|bangla\s*bolen|banglay\s*likhun|bangla\s*likhun|bangla\s*language|shudhu\s*bangla|বাংলা\s*বলুন)\b/i
  if (banglaRequestRegex.test(clean)) {
    return 'bn'
  }
  const englishRequestRegex = /\b(?:speak\s*in\s*english|english\s*please|in\s*english|reply\s*in\s*english|shudhu\s*english)\b/i
  if (englishRequestRegex.test(clean)) {
    return 'en'
  }

  // If previous customer messages explicitly requested Bengali, honor that on short responses (e.g. "Payment done", "Bkash", "ok")
  if (recentHistory && banglaRequestRegex.test(recentHistory) && !englishRequestRegex.test(clean)) {
    if (clean.length < 40) {
      return 'bn'
    }
  }

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

export function formatRelativeMessageTime(createdAt?: string | null): string {
  if (!createdAt) return ''
  try {
    const diffMs = Date.now() - new Date(createdAt).getTime()
    if (isNaN(diffMs) || diffMs < 0) return ''
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 5) return '[Just now]'
    if (diffMins < 60) return `[${diffMins}m ago]`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `[${diffHours}h ago]`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return '[Yesterday]'
    return `[${diffDays}d ago]`
  } catch {
    return ''
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
  const matchedProducts = products.filter((p) => {
    if (!p?.name) return false
    const pName = p.name.toLowerCase().trim()
    if (textLower.includes(pName) || pName.includes(textLower)) return true
    // Also match individual significant words (e.g. "canva" in message matches "Canva Pro")
    const pWords = pName.split(/\s+/).filter((w: string) => w.length > 3)
    return pWords.some((w: string) => textLower.includes(w))
  })
  const matchedProduct = matchedProducts[0] || null

  // 0. If an image was sent but offline fallback is active
  if (activeMediaUrl) {
    intent = 'product_inquiry'
    if (detectedLang === 'banglish') {
      reply = 'Apnar pathano chobi ti ami peyechi! Amader team chobi ti dekhe product er stock o dam janacche, ektu shomoy din.'
    } else if (detectedLang === 'bn') {
      reply = 'আপনার পাঠানো ছবিটি আমি পেয়েছি! আমাদের টিম ছবিটি দেখে পণ্যের স্টক ও মূল্য জানিয়ে দিচ্ছেন, একটু অপেক্ষা করুন।'
    } else {
      reply = 'I have received your product photo! Our team is reviewing the image right now to check availability and price for you.'
    }
  }
  // 1. Matched Product(s) Inquiry or Order Request
  else if (matchedProducts.length > 0) {
    intent = 'product_inquiry'
    const isDigital = matchedProducts.some((p) => isDigitalProduct(p)) || isDigitalText(textLower)
    if (matchedProducts.length > 1) {
      const namesAndPrices = matchedProducts.map((p) => `${p.name} (৳${p.price})`).join(' & ')
      const namesAndPricesBn = matchedProducts.map((p) => `${p.name} (৳${p.price})`).join(' এবং ')
      const totalPrice = matchedProducts.reduce((sum, p) => sum + (Number(p.price) || 0), 0)
      if (isDigital) {
        if (detectedLang === 'banglish') {
          reply = `Ji oboshoy! ${namesAndPrices} - shobgulo available. Total ৳${totalPrice.toLocaleString()}. Digital product er delivery email e pathano hoy. Order korte apnar Email address, phone number o bKash/Nagad payment method confirm korben please?`
        } else if (detectedLang === 'bn') {
          reply = `জি অবশ্যই! ${namesAndPricesBn} - সবগুলোই স্টকে আছে। সর্বমোট ৳${totalPrice.toLocaleString()}। ডিজিটাল পণ্যের অ্যাক্সেস ইমেইলে পাঠিয়ে দেওয়া হবে। অর্ডার করতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেস, ফোন নম্বর এবং বিকাশ/নগদ পেমেন্ট মাধ্যমটি জানান।`
        } else {
          reply = `Sure! ${namesAndPrices} are available. Total comes to ৳${totalPrice.toLocaleString()}. Access to digital items is delivered via email. Please share your Email address, phone number, and bKash/Nagad payment confirmation to place your order!`
        }
      } else {
        if (detectedLang === 'banglish') {
          reply = `Ji oboshoy! ${namesAndPrices} - shobgulo-i stock e ache. Total ৳${totalPrice.toLocaleString()}. Order confirm korte apnar delivery address, phone number o preferred payment method (Cash on Delivery naki bKash/Nagad) janaben please?`
        } else if (detectedLang === 'bn') {
          reply = `জি অবশ্যই! ${namesAndPricesBn} - সবগুলো পণ্যই স্টকে আছে। সর্বমোট ৳${totalPrice.toLocaleString()}। অর্ডার কনফার্ম করতে অনুগ্রহ করে আপনার পূর্ণাঙ্গ ডেলিভারি ঠিকানা, ফোন নম্বর এবং পেমেন্ট মাধ্যম (ক্যাশ অন ডেলিভারি নাকি বিকাশ/নগদ) জানিয়ে দিন।`
        } else {
          reply = `Sure! ${namesAndPrices} are both available. Total comes to ৳${totalPrice.toLocaleString()}. Please share your delivery address, phone number, and preferred payment method (Cash on Delivery or bKash/Nagad) to confirm your order!`
        }
      }
    } else {
      const isSingleDigital = isDigitalProduct(matchedProduct) || isDigitalText(textLower)
      const isFreeProduct =
        Number(matchedProduct.price) === 0 ||
        (/\bcanva\b/i.test(matchedProduct.name || textLower) &&
          (/\b(?:free|giveaway|ফ্রি|বিনামূল্যে|gift)\b/i.test(account?.ai_store_instructions || '') ||
            Number(matchedProduct.price) === 0))

      if (isSingleDigital) {
        if (isFreeProduct) {
          if (detectedLang === 'banglish') {
            reply = `${matchedProduct.name} amader special offer e shompurno Free (৳0)! Digital access pete kindly apnar Email address ti share korun.`
          } else if (detectedLang === 'bn') {
            reply = `${matchedProduct.name} আমাদের বিশেষ অফারে সম্পূর্ণ ফ্রি (৳০)! আপনার ডিজিটাল অ্যাক্সেস পেতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেসটি শেয়ার করুন।`
          } else {
            reply = `${matchedProduct.name} is completely free (৳0) under our special offer! Please share your Email address so we can grant your digital access.`
          }
        } else {
          if (detectedLang === 'banglish') {
            reply = `${matchedProduct.name} er dam ৳${matchedProduct.price}. Digital access apnar email e pathano hoy. Order confirm korte apnar Email address, phone number ebong bKash/Nagad payment confirm korben please?`
          } else if (detectedLang === 'bn') {
            reply = `${matchedProduct.name}-এর মূল্য ৳${matchedProduct.price}। এটি একটি ডিজিটাল পণ্য, এর অ্যাক্সেস সরাসরি আপনার ইমেইলে দেওয়া হবে। অর্ডার করতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেস, ফোন নম্বর এবং বিকাশ/নগদে পেমেন্ট মাধ্যমটি নিশ্চিত করুন।`
          } else {
            reply = `${matchedProduct.name} is priced at ৳${matchedProduct.price}. As a digital product, access will be delivered to your email. To place your order, please provide your Email address, phone number, and bKash/Nagad payment confirmation!`
          }
        }
      } else {
        if (detectedLang === 'banglish') {
          reply = `${matchedProduct.name} er dam ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'Stock e ache!' : 'Ekhon stock e nei.'} Order confirm korte apnar delivery address, phone number o payment method (COD naki bKash) janaben please?`
        } else if (detectedLang === 'bn') {
          reply = `${matchedProduct.name}-এর মূল্য ৳${matchedProduct.price}। ${matchedProduct.is_in_stock ? 'স্টকে আছে!' : 'বর্তমানে স্টকে নেই।'} অর্ডার করতে অনুগ্রহ করে আপনার ডেলিভারি ঠিকানা, ফোন নম্বর এবং পেমেন্ট মাধ্যম (ক্যাশ অন ডেলিভারি নাকি বিকাশ/নগদ) জানিয়ে দিন।`
        } else {
          reply = `${matchedProduct.name} is priced at ৳${matchedProduct.price}. ${matchedProduct.is_in_stock ? 'In stock!' : 'Out of stock.'} Would you like to order? Please share your delivery address, phone number, and preferred payment method (COD or bKash)!`
        }
      }
    }
  }
  // 1b. Canva Pro Inquiry (even if not listed in product catalog table)
  else if (/\bcanva(?:\s*pro)?\b/i.test(textLower)) {
    intent = 'product_inquiry'
    const isFree =
      /\b(?:free|giveaway|ফ্রি|বিনামূল্যে|gift)\b/i.test(account?.ai_store_instructions || '') ||
      /\b(?:free|giveaway|ফ্রি|বিনামূল্যে|gift)\b/i.test(account?.ai_business_description || '')

    if (isFree) {
      if (detectedLang === 'banglish') {
        reply = `Canva Pro amader special offer e shompurno Free (৳0) deya hocche! Apnar digital access pete kindly apnar Email address ti share korun.`
      } else if (detectedLang === 'bn') {
        reply = `আমাদের বিশেষ অফারে Canva Pro সম্পূর্ণ ফ্রি (৳০) দেওয়া হচ্ছে! আপনার ফ্রি ডিজিটাল অ্যাক্সেস পেতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেসটি শেয়ার করুন।`
      } else {
        reply = `Under our special offer, Canva Pro is completely free (৳0)! Please share your Email address so we can grant your digital access.`
      }
    } else {
      const isAskingFree = /\b(?:free|giveaway|ফ্রি|বিনামূল্যে|gift|zero|0)\b/i.test(textLower)
      if (isAskingFree) {
        if (detectedLang === 'banglish') {
          reply = `Amader Canva Pro er free offer tir meyadh itomoddhe sesh hoye geche. Apni chaile amader regular subscription ti nite paren. Details jante chan ki?`
        } else if (detectedLang === 'bn') {
          reply = `আমাদের Canva Pro-এর ফ্রি অফারটির মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে। আপনি চাইলে আমাদের রেগুলার সাবস্ক্রিপশনটি নিতে পারেন। আপনি কি বিস্তারিত জানতে চান?`
        } else {
          reply = `Our free Canva Pro promotional offer has now ended. You can purchase our regular subscription if you are interested. Would you like more details?`
        }
      } else {
        if (detectedLang === 'banglish') {
          reply = `Canva Pro সম্পর্কিত যেকোনো প্রশ্ন বা অর্ডারের জন্য অনুগ্রহ করে আপনার রিকোয়ারমেন্ট জানান, আমাদের টিম আপনাকে বিস্তারিত জানিয়ে সাহায্য করবে।`
        } else if (detectedLang === 'bn') {
          reply = `Canva Pro সম্পর্কিত যেকোনো প্রশ্ন বা অর্ডারের জন্য অনুগ্রহ করে আপনার রিকোয়ারমেন্ট জানান, আমাদের টিম আপনাকে বিস্তারিত জানিয়ে সাহায্য করবে।`
        } else {
          reply = `Canva Pro is available. Please let us know what specific details or access duration you need so our team can assist you!`
        }
      }
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

export interface ParsedAIResult {
  intent: DetectedIntent
  reply: string
  order: any | null
}

export function parseAndSanitizeAiResponse(raw: string): ParsedAIResult | null {
  if (!raw || typeof raw !== 'string') return null

  // 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
  let clean = raw.trim()
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  }

  // 2. Extract outermost JSON object if surrounded by extra commentary
  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1).trim()
  }

  let parsed: any = null

  // 3. Try standard JSON.parse
  try {
    parsed = JSON.parse(clean)
  } catch {
    // 4. Try repairing common LLM escape errors (e.g. \Y, \C, invalid backslashes like \n\Your)
    try {
      const repairedEscapes = clean.replace(/\\([^"\\/bfnrtu])/g, '$1')
      parsed = JSON.parse(repairedEscapes)
    } catch {
      // 5. Try fixing literal unescaped newlines inside JSON strings
      try {
        const repairedNewlines = clean
          .replace(/\\([^"\\/bfnrtu])/g, '$1')
          .replace(/\r?\n/g, '\\n')
        parsed = JSON.parse(repairedNewlines)
      } catch {
        // Fall through to regex extraction
      }
    }
  }

  let intent: DetectedIntent = 'general_faq'
  let replyText = ''
  let orderData: any = null

  if (parsed && typeof parsed === 'object') {
    if (parsed.intent && typeof parsed.intent === 'string') {
      intent = parsed.intent as DetectedIntent
    }
    if (parsed.reply && typeof parsed.reply === 'string') {
      replyText = parsed.reply.trim()
    }
    if (parsed.order && typeof parsed.order === 'object') {
      orderData = parsed.order
    }
  }

  // 6. Regex fallback extraction if replyText was not parsed properly
  if (!replyText) {
    const replyMatch = clean.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (replyMatch && replyMatch[1]) {
      replyText = replyMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
        .replace(/\\t/g, ' ')
        .trim()
    } else {
      const multilineMatch = clean.match(/"reply"\s*:\s*"([\s\S]*?)(?="\s*,\s*"(?:confidence|order|intent|items)|"\s*\})/)
      if (multilineMatch && multilineMatch[1]) {
        replyText = multilineMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim()
      }
    }

    const intentMatch = clean.match(/"intent"\s*:\s*"([^"]+)"/)
    if (intentMatch && intentMatch[1]) {
      intent = intentMatch[1] as DetectedIntent
    }

    const orderMatch = clean.match(/"order"\s*:\s*(\{[\s\S]*?\})\s*(?:,\s*"|\})/)
    if (orderMatch && orderMatch[1]) {
      try {
        orderData = JSON.parse(orderMatch[1])
      } catch {}
    }
  }

  // 7. STRICT ZERO-JSON FAILSAFE:
  // If replyText starts with '{' or has JSON keys like '"intent":', it is corrupted raw JSON!
  if (
    !replyText ||
    replyText.trim().startsWith('{') ||
    replyText.includes('"intent":') ||
    replyText.includes('"reply":') ||
    replyText.includes('"confidence":') ||
    replyText.includes('"order":')
  ) {
    console.warn('[AI Router Engine] replyText contained raw JSON artifacts. Rejecting to prevent customer leak.', replyText)
    return null
  }

  return {
    intent,
    reply: replyText,
    order: orderData,
  }
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
            const timeTag = formatRelativeMessageTime(m.created_at)
            const prefix = timeTag ? `${timeTag} ${role}` : role
            if (m.media_url && (m.content_type === 'image' || m.content_text === 'Photo')) {
              return `${prefix}: [Uploaded a product photo: ${m.content_text || 'Photo'}]`
            }
            return `${prefix}: ${m.content_text || ''}`
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
            const timeTag = formatRelativeMessageTime(m.created_at)
            const prefix = timeTag ? `${timeTag} ${role}` : role
            if (m.media_url && (m.content_type === 'image' || m.content_text === 'Photo')) {
              return `${prefix}: [Uploaded a product photo: ${m.content_text || 'Photo'}]`
            }
            return `${prefix}: ${m.content_text || ''}`
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

  // 4b. Fetch Active & Ended Broadcast Campaigns & AI Context for this account
  let activeBroadcastContext = ''
  let endedBroadcastContext = ''
  try {
    const targetAccountId = account?.id || accountId
    if (targetAccountId) {
      // 1. Active campaigns
      const { data: bData } = await client
        .from('broadcasts')
        .select('name, message_text, ai_context, template_variables, status, created_at, updated_at')
        .eq('account_id', targetAccountId)
        .neq('status', 'cancelled')
        .neq('status', 'ended')
        .neq('status', 'draft')
        .neq('status', 'failed')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5)

      if (bData && bData.length > 0) {
        const campaignLines: string[] = []
        for (const b of bData) {
          const detail = b.ai_context || (b.template_variables as any)?.ai_context || ''
          const sentMsg = b.message_text || ''
          if (detail || sentMsg) {
            campaignLines.push(
              `- Campaign: "${b.name}"\n  Broadcast Message Sent: "${sentMsg}"\n  Official Active Offer/Details for AI: "${detail || 'No specific discount or offer details configured. Do NOT invent discounts.'}"`
            )
          }
        }
        if (campaignLines.length > 0) {
          activeBroadcastContext = campaignLines.join('\n\n')
        }
      }

      // 2. Recently Ended / Cancelled / Turned Off campaigns
      const { data: endedBData } = await client
        .from('broadcasts')
        .select('name, message_text, ai_context, template_variables, status, created_at, updated_at')
        .eq('account_id', targetAccountId)
        .in('status', ['cancelled', 'ended'])
        .order('updated_at', { ascending: false })
        .limit(3)

      if (endedBData && endedBData.length > 0) {
        const endedLines: string[] = []
        for (const eb of endedBData) {
          const detail = eb.ai_context || (eb.template_variables as any)?.ai_context || ''
          endedLines.push(
            `- Campaign: "${eb.name}" [STATUS: ENDED / TURNED OFF]\n  Previous Offer Details: "${detail || eb.message_text || 'Special promotional campaign'}"\n  CRITICAL MANDATE: This offer is OFFICIALLY CLOSED. If customer asks about it or follows up on past chat history, politely inform them: "আমাদের এই অফারটির মেয়াদ শেষ হয়ে গেছে" (This offer has expired / ended).`
          )
        }
        if (endedLines.length > 0) {
          endedBroadcastContext = endedLines.join('\n\n')
        }
      }
    }
  } catch (_bErr) {
    // broadcast query fallback
  }

  // 4c. Fetch Knowledge Base & Website Data (ai_knowledge_documents & ai_knowledge_chunks)
  let knowledgeBaseContext = ''
  try {
    const targetAccountId = account?.id || accountId
    if (targetAccountId) {
      const { data: kDocs } = await client
        .from('ai_knowledge_documents')
        .select('title, content')
        .eq('account_id', targetAccountId)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (kDocs && kDocs.length > 0) {
        const docEntries = kDocs
          .map((doc: { title?: string; content?: string }) => {
            const title = doc.title?.trim() || 'Knowledge Document'
            const content = doc.content?.trim() || ''
            return `--- Document: "${title}" ---\n${content}`
          })
          .filter(Boolean)
        if (docEntries.length > 0) {
          knowledgeBaseContext = docEntries.join('\n\n')
        }
      }

      if (!knowledgeBaseContext) {
        const { data: chunks } = await client
          .from('ai_knowledge_chunks')
          .select('content')
          .eq('account_id', targetAccountId)
          .limit(10)
        if (chunks && chunks.length > 0) {
          knowledgeBaseContext = chunks.map((c: { content?: string }) => c.content?.trim()).filter(Boolean).join('\n\n')
        }
      }
    }
  } catch (_kErr) {
    // knowledge query fallback
  }

  // 5. Build Strict Language Instruction & Negative Constraints
  let langGuidance = ''
  if (detectedLang === 'bn') {
    langGuidance = 'STRICT REQUIREMENT: The customer is communicating in Bengali. You MUST reply in natural, polite Bangladeshi Bengali written ONLY in Bengali script (বাংলা বর্ণমালা). NEVER output Arabic, Urdu, or Hindi characters. Every sentence must be in proper Bengali.'
  } else if (detectedLang === 'banglish') {
    langGuidance = 'STRICT REQUIREMENT: The customer is communicating in Banglish. You MUST reply in natural Banglish (spoken Bengali written in Latin/English alphabet). For example: "Bhaiya, product er dam ৳850. Stock e ache!". NEVER output Bengali script, Arabic, Urdu, or Hindi characters.'
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
Store Overview: ${account.ai_business_description || 'N/A'}
Store Guidelines, Special Offers & FAQs: ${account.ai_store_instructions || 'N/A'}
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

=== OFFICIAL BUSINESS KNOWLEDGE BASE & WEBSITE DATA (PRIMARY GROUND TRUTH) ===
${knowledgeBaseContext || 'No additional knowledge base documents uploaded.'}

=== STRICT REAL-MARKET CHAT RULES (MANDATORY) ===
1. SHORT, CRISP, HUMAN SALESMAN (STRICTLY 2 TO 3 SHORT SENTENCES / 35-50 WORDS MAX):
   - In real-world Facebook Messenger & WhatsApp e-commerce in Bangladesh, customers read on mobile and hate long walls of text. Long paragraphs kill sales.
   - Your reply MUST be short, warm, natural, and direct: STRICTLY 2 to 3 sentences maximum!
   - NEVER write long marketing paragraphs or flowery speeches.

2. ZERO DISCOUNT HALLUCINATION RULE & GROUND TRUTH (CRITICAL MANDATE):
   - ABSOLUTE PROHIBITION ON INVENTING OR CLAIMING DISCOUNTS:
     * You are STRICTLY FORBIDDEN from inventing, guessing, or mentioning ANY discount or percentage (NEVER say "10% discount", "20% discount", etc.), promotional coupon, or calculating any price reductions unless an exact discount is explicitly documented in the OFFICIAL BUSINESS KNOWLEDGE BASE, STORE GUIDELINES, SPECIAL OFFERS & FAQS, or RECENT BROADCAST CAMPAIGNS.
     * If NO active discount is documented: You MUST NEVER utter the word "discount"! Quote the exact product price listed in CATALOG & INVENTORY.
     * When a customer asks: "What discount?", "Koto % discount?", "Offer-ta ki?", "Ki offer?":
       - If official campaign/knowledge details are provided: Answer accurately using strictly those provided details!
       - If NO specific discount detail is provided: You MUST NOT invent a discount! Reply politely: "Thank you for asking! We are currently featuring our newest collections and popular items. Please let us know which product you are looking for so our team can provide the specific details and best available price for you!" (translated naturally into the customer's language).
   - SPECIAL FREE OFFERS & PROMOTIONS:
     * A product or service is ONLY free if an active broadcast campaign, knowledge document, or store instruction explicitly grants it for free (e.g. price ৳0, promotional giveaway, or free trial).
     * If an offer has ended, expired, or been removed from broadcast campaigns or store guidelines, IT IS NOT FREE! Quote regular catalog prices or state clearly that no active free offer exists.
     * When a product is explicitly documented as FREE:
       - State clearly that the product is 100% FREE (৳0) with ZERO payment required!
       - NEVER invent a price or discount (e.g. NEVER say "10% discount er por ৳45" and NEVER ask for ৳45 or any payment for a free item)!
       - For Free Digital Products: NEVER ask for physical delivery address or Cash on Delivery (COD). Only ask for the customer's Email address to deliver their free access!
     * If a product is listed in the catalog with a regular price and no active free offer exists, quote the exact catalog price and require standard payment.
   - CRITICAL TEMPORAL & EXPIRED OFFER POLICY (OFFERS FROM PAST CHAT HISTORY):
     * Check the relative timestamps on previous messages in RECENT CONVERSATION HISTORY (e.g. [2d ago], [Yesterday], [Hours ago]).
     * The conversation history may show that days or hours ago, the customer or salesman discussed an offer, discount, or free giveaway (e.g., Canva Pro free, promotional coupon, or special discount).
     * ABSOLUTE GROUND TRUTH RULE: Only offers currently listed in '=== RECENT BROADCAST CAMPAIGNS & PROMOTIONAL OFFERS ===' or in current store guidelines are active!
     * If an offer discussed in previous messages (e.g. [2d ago] Salesman promised Canva Pro free) is NO LONGER listed under active broadcast campaigns, or is listed under ENDED / EXPIRED CAMPAIGNS, THAT OFFER HAS OFFICIALLY ENDED / EXPIRED!
     * If the customer comes back and follows up on an expired offer (e.g. asks "is it still free?", "offer ta ache?", "canva pro pabo?", or shares their email/phone to claim the past offer):
       - DO NOT confirm or grant the expired offer!
       - Politely inform the customer that the previous promotional offer has ended / expired:
         * Bengali: "আমাদের ওই অফারটির/ফ্রি অফারটির মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে। আপনি চাইলে আমাদের রেগুলার প্যাকেজটি নিতে পারেন।"
         * Banglish: "Amader oi offer tir/free offer tir meyadh itomoddhe sesh hoye geche. Apni chaile amader regular package ti nite paren."
         * English: "That promotional offer has now ended. You can check our regular packages if you are interested."
       - Provide the current catalog price or ask what other service they are looking for.
       - ABSOLUTELY NEVER continue granting, confirming, or claiming an expired offer just because the chat history from days ago mentioned it!
   - Product Prices: Always quote the exact product price listed in CATALOG & INVENTORY unless an active broadcast campaign explicitly modifies it.

3. NO UNSOLICITED PRODUCT LECTURES / ESSAYS:
   - When a customer says they want to order or asks about products (e.g. "i want to order [product]", "order korte chai", "দাম কত?"):
     * Confirm availability & price in ONE concise sentence: "Great choice! [Product Name] (৳[price]) is available."
     * If DIGITAL (e.g. Canva Pro, subscriptions, software, digital accounts, licenses):
       - If FREE (free offer / price ৳0): State it is free (৳0), ask ONLY for Email address (and optional contact phone number). NEVER ask for payment, bKash, Nagad, or TrxID! NEVER ask for courier delivery address or COD!
       - If PAID: Ask for Email address, phone number, and bKash/Nagad prepaid payment.
     * If PHYSICAL (tangible goods, skincare, cosmetics, clothes):
       - If FREE (sample / gift): Ask for delivery address & contact phone number.
       - If PAID: Ask for full delivery address, phone number, and preferred payment method (Cash on Delivery or bKash/Nagad).
     * ZERO UNSOLICITED ESSAYS: NEVER lecture about ingredients or feature lists unless the customer explicitly asked. Keep your reply strictly 2 to 3 short sentences!
   - ONLY explain product features if the customer EXPLICITLY asks. Even then, keep it to 1-2 punchy sentences!

4. NATURAL HUMAN SALESPERSON STYLE (NO ROBOTIC FLATTERY):
   - Talk like an authentic, polite, and helpful human store manager in Bangladesh.
   - NO over-the-top robotic flattery ("That is an excellent choice, Sir!", "We are thrilled and delighted beyond measure!").
   - NO canned repetitive welcomes ("Thank you for reaching out to [Store]! How can we assist you today?").
   - Greet briefly and naturally if starting a conversation, or jump straight into the answer if conversation is already underway.

5. REAL MARKET ORDER CAPTURE & VERIFICATION (FREE PROMOTIONS VS PAID PRODUCTS - MANDATORY):
   - You MUST determine whether the order or item is FREE or PAID:
     * A. FREE PROMOTIONS / GIVEAWAYS / ৳0 ORDERS:
       (When an active offer, knowledge doc, or campaign grants a product for free, e.g. Canva Pro free offer, giveaway, promotional gift, or price ৳0):
       - TOTAL PRICE IS ৳0! ZERO PAYMENT REQUIRED!
       - NEVER ask the customer for payment method, bKash, Nagad, bank transfer, cash, or Transaction ID (TrxID)!
       - Asking for payment or TrxID on a free order is completely wrong and strictly forbidden!
       - ALL REQUIRED INFO FOR FREE ORDERS:
         (1) For Free Digital Products (Canva Pro, subscriptions, software, digital accounts, licenses):
             - Customer Email Address (where digital access / credentials will be sent)
             - Contact Phone Number (optional or confirmation)
             - ZERO PAYMENT, ZERO TRXID, ZERO PHYSICAL ADDRESS REQUIRED!
         (2) For Free Physical Gifts / Samples:
             - Customer Delivery Address
             - Contact Phone Number
             - ZERO PAYMENT REQUIRED!
       - AS SOON AS the customer provides their Email (for digital) or Address (for physical):
         * The free order is COMPLETE!
         * Set "order.total": 0, "order.subtotal": 0, "order.delivery_charge": 0, "order.payment_method": "free", "order.payment_confirmed": true, "order.is_order": true.
         * Warmly confirm: "Thank you! Your free [Product Name] order has been successfully registered with your email. Our team is activating your access right away!"

     * B. PAID PRODUCTS (Regular catalog prices > ৳0):
       - When no free offer applies, the item must be sold at its catalog price.
       - For Paid Digital:
         Requires Email address, Phone number, and bKash/Nagad prepaid payment confirmation (or TrxID).
       - For Paid Physical:
         Requires Delivery address, Phone number, and Payment method choice (Cash on Delivery or bKash/Nagad).
       - If payment method / confirmation is not yet confirmed, ask for it politely before confirming the order.

   - ORDER STATUS COMMUNICATION:
     * Once all required details are provided, inform the customer that their order has been placed and is currently under review by our store team.

6. ORDER CANCELLATION & PRODUCT SWITCH/CHANGE RULES (CRITICAL MANDATE):
   - A. CANCELLATION REQUESTS:
     * When a customer says they want to cancel an order, cancel a product, or don't want it anymore (e.g. "order cancel korun", "ami order nite chai na", "cancel my order", "Canva Pro cancel", "eita lagbe na", "nibo na"):
     * YOU MUST NOT CREATE A NEW ORDER! Set "order": { "action": "cancel", "is_order": false, "is_cancelled": true }.
     * Reply politely confirming that their order has been cancelled:
       - Bengali: "আপনার অনুরোধ অনুযায়ী অর্ডারটি সফলভাবে বাতিল করা হয়েছে। ভবিষ্যতে যেকোনো প্রয়োজনে আমরা আপনার পাশে আছি। ধন্যবাদ!"
       - Banglish: "Apnar onurodh onujayi order ti successfully cancel kora hoyeche. Bhabisshote jekono proyojone amader janaben. Dhonnobad!"
       - English: "Your order has been successfully cancelled as requested. Please let us know whenever you need anything in the future. Thank you!"
   - B. PRODUCT CHANGE / REPLACEMENT REQUESTS:
     * When a customer previously placed an order but now wants to order a DIFFERENT product or swap products (e.g. "Canva Pro nibo na, ami Netflix nibo", "Canva change kore Netflix din", "ami onno product ta nite chai", "change my order to [Product]"):
     * Set "order": { "action": "update_items", "is_order": true, "items": [{ "product_name": "[New Product Name]", "unit_price": [price], "quantity": 1 }], ... }
     * Confirm the switch politely:
       - Bengali: "অবশ্যই! আপনার অর্ডারটি পরিবর্তন করে [নতুন পণ্য] (৳[মূল্য]) দিয়ে আপডেট করা হয়েছে।"
       - Banglish: "Obosshoy! Apnar order ti change kore [New Product] (৳[price]) diye update kora hoyeche."
       - English: "Certainly! Your order has been updated to [New Product] (৳[price])."

7. MULTIMODAL & PRODUCT PHOTO RULES:
   - You CAN directly view images/photos! Never say you cannot view photos.
   - Inspect the photo, identify the brand & product, check if it's in our Catalog & Inventory.
   - If in stock: State price and ask if they'd like to order (in 1-2 sentences).
   - If not in stock: State what it is, mention we don't have that exact brand right now, and suggest our closest alternative from the catalog (in 1-2 sentences).

8. STRICT LANGUAGE & SCRIPT RULES (ZERO TOLERANCE):
   - ${langGuidance}
   - Persona: ${toneGuidance}
   - Addressing: ${communicationGuidance}
   - ABSOLUTE PROHIBITION: NEVER generate Arabic script (عربى / اردو), Urdu, or Devanagari script.
   - Strictly match customer language:
     * English customer -> 100% English reply in Latin alphabet.
     * Bengali customer (বাংলা) -> Bengali reply using Bengali script (বাংলা বর্ণমালা).
     * Banglish customer -> Banglish reply using Latin alphabet.
   - Currency symbol: Always use the Bangladeshi Taka symbol '৳' or 'Tk' with product prices (e.g. ৳1,000). The symbol '৳' does NOT mean the customer is writing in Bengali.

=== RECENT BROADCAST CAMPAIGNS & PROMOTIONAL OFFERS (OFFICIAL GROUND TRUTH) ===
${activeBroadcastContext ? activeBroadcastContext : 'No active broadcast campaigns or special promotional offers currently. Only standard catalog pricing and policies apply.'}

${endedBroadcastContext ? `=== OFFICIALLY ENDED / EXPIRED CAMPAIGNS (OFFICIALLY CLOSED - DO NOT OFFER) ===\n${endedBroadcastContext}\n` : ''}=== CATALOG & INVENTORY ===
${
  products.length === 0
    ? 'No products available.'
    : products
        .map(
          (p) => {
            const isDig = isDigitalProduct(p)
            return `- Product: "${p.name}", Price: ৳${p.price}, Stock: ${p.stock_qty} (${p.is_in_stock ? 'In Stock' : 'Out of Stock'}), Type: ${isDig ? 'DIGITAL (Requires Email + Prepaid bKash/Nagad, NO physical courier/COD)' : 'PHYSICAL (Requires Full Delivery Address + COD or bKash)'}, Category: ${p.category || 'General'}${p.description ? `, Info: ${p.description}` : ''}`
          }
        )
        .join('\n')
}

=== RECENT CONVERSATION HISTORY ===
${conversationHistoryText ? conversationHistoryText : '(Start of new conversation)'}

Current Customer Message:
"${messageText}"

=== STRUCTURED OUTPUT REQUIREMENT ===
Return ONLY a valid JSON object. No explanation, no markdown text outside the JSON.
{
  "intent": "product_inquiry" | "order_status" | "general_faq" | "human_escalation",
  "reply": "string (strictly 2-3 short, human salesman sentences in the customer's language)",
  "confidence": 0.95,
  "order": {
    "action": "create" | "update_items" | "cancel",
    "is_cancelled": boolean,
    "is_order": true,
    "is_digital": boolean,
    "customer_name": "string or null",
    "customer_phone": "string or null",
    "customer_address": "string or null",
    "customer_email": "string or null",
    "payment_method": "cod" | "bkash" | "nagad" | "rocket" | "bank_transfer" | "free",
    "payment_confirmed": boolean,
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
Note on "order":
- For Cancellation: Set "action": "cancel", "is_cancelled": true, "is_order": false. DO NOT CREATE AN ORDER!
- For Product Switch/Change: Set "action": "update_items", "is_order": true, with the new product in "items".
- For New Order: Set "is_order": true ONLY when ALL required information has been provided:
  * Free products (৳0 / promo): requires only Email & Phone (digital) or Address & Phone (physical). No payment or TrxID! Set total: 0, payment_method: "free".
  * Paid products: requires Email, Phone, & prepaid payment (digital) or Delivery address, Phone, & payment method (physical).
If required information is missing, set "is_order": false so the order is NOT prematurely placed!
Set "order": null if the customer is merely asking a question without ordering or cancelling.`

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
          config: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
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
            response_format: { type: 'json_object' },
            temperature: 0.4,
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
            response_format: { type: 'json_object' },
            temperature: 0.4,
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
    // Parse LLM rawResponse JSON safely using parseAndSanitizeAiResponse
    const parsed = parseAndSanitizeAiResponse(rawResponse)
    if (parsed) {
      intent = parsed.intent
      aiReply = parsed.reply
      llmOrderData = parsed.order
    } else {
      console.warn('[AI Router Engine] Failed to parse or sanitize rawResponse into valid reply. Falling back to offline matcher. Raw:', rawResponse)
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

  // CRITICAL FAILSAFE: Under NO circumstances can raw JSON ever leak to a customer!
  if (
    aiReply.trim().startsWith('{') ||
    aiReply.includes('"intent"') ||
    aiReply.includes('"reply"') ||
    aiReply.includes('"confidence"')
  ) {
    console.error('[AI Router Engine] CRITICAL: JSON detected in aiReply before sending to customer! Discarding and using offline reply.', aiReply)
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

  // 3b. Deterministic Guardrail for Order Completeness & Payment Method
  const combinedHistory = `${conversationHistoryText}\n${messageText}`
  const knowledgeSourcesText = `${knowledgeBaseContext}\n${account?.ai_store_instructions || ''}\n${account?.ai_business_description || ''}\n${activeBroadcastContext}`

  const isCanvaDiscussed = /\bcanva(?:\s*pro)?\b/i.test(combinedHistory)
  const hasCanvaFreeInCatalog = products.some((p) => /\bcanva\b/i.test(p.name) && Number(p.price) === 0)
  const isCanvaFreeInStore =
    isCanvaDiscussed &&
    (/\b(?:canva\b[^.]*\b(?:free|giveaway|ফ্রি|বিনামূল্যে|gift)|(?:free|ফ্রি|বিনামূল্যে|gift|giveaway)[^.]*\bcanva)\b/i.test(knowledgeSourcesText) ||
      hasCanvaFreeInCatalog)

  const isOrderDigital =
    Boolean(llmOrderData?.is_digital) ||
    checkIsDigitalOrder(llmOrderData?.items) ||
    isDigitalText(messageText) ||
    isDigitalText(conversationHistoryText) ||
    isCanvaDiscussed ||
    products.some((p) => isDigitalProduct(p) && (messageText.toLowerCase().includes(p.name.toLowerCase()) || conversationHistoryText.toLowerCase().includes(p.name.toLowerCase())))

  const extractedInfo = extractCustomerInfoFromMessage(messageText)
  const histExtractedInfo = extractCustomerInfoFromMessage(conversationHistoryText)

  const effectivePhone = (customerPhone && !isFacebookPsid(customerPhone) ? customerPhone : null) || extractedInfo.phone || histExtractedInfo.phone || llmOrderData?.customer_phone || null
  const effectiveAddress = extractedInfo.address || histExtractedInfo.address || llmOrderData?.customer_address || null
  const effectiveEmail = extractedInfo.email || histExtractedInfo.email || llmOrderData?.customer_email || (combinedHistory.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] || null)

  const msgLower = messageText.toLowerCase()
  const histLower = combinedHistory.toLowerCase()
  const hasTrx = /\b(?:trx(?:id)?|txid|transaction(?:\s*id)?|ref(?:\s*no)?)\s*[:=-]?\s*([a-zA-Z0-9]{6,25})\b/i.test(combinedHistory)
  const hasPaymentSent = /\b(?:paid|done|sent|taka\s*pathiyechi|taka\s*dilam|pathalam|pathaisi|pathano\s*hoyeche|টাকা\s*পাঠিয়েছি|পাঠালাম|দিলাম|পেড|পেইড|পেমেন্ট\s*করেছি|পেমেন্ট\s*ডান)\b/i.test(combinedHistory)

  // Detect if current item / offer is FREE (৳0, promotional giveaway, free trial, 100% discount):
  const isFreeFromBroadcast = Boolean(
    activeBroadcastContext &&
    /\b(?:free|giveaway|100%\s*discount|ফ্রি|বিনামূল্যে|free\s*te)\b/i.test(activeBroadcastContext)
  )
  const isFreeFromKnowledge = Boolean(
    knowledgeSourcesText &&
    /\b(?:free|giveaway|100%\s*discount|ফ্রি|বিনামূল্যে|free\s*te|for\s*free)\b/i.test(knowledgeSourcesText)
  )
  const isFreeFromChat = /\b(?:free|giveaway|100%\s*discount|ফ্রি|বিনামূল্যে|free\s*te|for\s*free|free\s*deya\s*hocche|free\s*pabo|free\s*nite)\b/i.test(messageText)
  const isFreeFromOrderData = Number(llmOrderData?.total) === 0 && Boolean(llmOrderData?.items?.length)
  const isCatalogFree = products.some(
    (p) => Number(p.price) === 0 && (messageText.toLowerCase().includes(p.name.toLowerCase()) || conversationHistoryText.toLowerCase().includes(p.name.toLowerCase()))
  )

  const isFreeOrder =
    (llmOrderData?.payment_method === 'free') ||
    isFreeFromOrderData ||
    isCatalogFree ||
    isCanvaFreeInStore ||
    (isFreeFromBroadcast && isFreeFromChat) ||
    (isFreeFromKnowledge && isFreeFromChat)

  // Deterministic Sanitizer for Hallucinated Discounts & Free Canva Pro / Free Digital Offers
  if (isCanvaFreeInStore || (isFreeOrder && isOrderDigital)) {
    const hasDiscountOrPriceOrCOD = /\b(?:10%|20%|45|৳45|dam\s*porbe|payment\s*method|bkash\/nagad\/cod|bKash\s*merchant|01326596251|send\s*৳?45|delivery\s*details|ক্যাশ\s*অন\s*ডেলিভারি|পেমেন্ট\s*মেথড)\b/i.test(aiReply)
    const asksForPayment = /\b(?:payment|bKash|Nagad|COD|TrxID|টাকা\s*পাঠান|পেমেন্ট)\b/i.test(aiReply) && !/\b(?:free|৳0|ফ্রি|বিনামূল্যে)\b/i.test(aiReply)

    if (hasDiscountOrPriceOrCOD || asksForPayment) {
      if (detectedLang === 'bn') {
        aiReply = `আমাদের বিশেষ অফারে Canva Pro সম্পূর্ণ ফ্রি (৳০) দেওয়া হচ্ছে! আপনার ফ্রি অ্যাক্সেসটি পেতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেসটি শেয়ার করুন।`
      } else if (detectedLang === 'banglish') {
        aiReply = `Amader special offer e Canva Pro shompurno Free (৳0) deya hocche! Apnar free access pete kindly apnar Email address ti share korun.`
      } else {
        aiReply = `Under our special offer, Canva Pro is completely free (৳0)! Please share your Email address so we can grant your free access.`
      }
    }
  } else {
    // Expired offer check: If Canva was discussed in chat or inquiry, but Canva is NOT free in the store currently:
    if (isCanvaDiscussed && !isCanvaFreeInStore) {
      const claimsCanvaFreeNow =
        /\b(?:canva\b[^.]*\b(?:free|ফ্রি|বিনামূল্যে|৳০|৳0|zero\s*taka)|(?:free|ফ্রি|বিনামূল্যে|৳০|৳0)[^.]*\bcanva)\b/i.test(aiReply) ||
        (/\b(?:সম্পূর্ণ\s*ফ্রি|shompurno\s*free|completely\s*free|ফ্রি\s*অ্যাক্সেস|free\s*access)\b/i.test(aiReply) && !/\b(?:শেষ|ended|over|sesh|expired)\b/i.test(aiReply))

      if (claimsCanvaFreeNow) {
        if (detectedLang === 'bn') {
          aiReply = `আমাদের Canva Pro-এর ফ্রি অফারটির মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে। আপনি চাইলে আমাদের রেগুলার সাবস্ক্রিপশনটি নিতে পারেন। আপনি কি বিস্তারিত জানতে চান?`
        } else if (detectedLang === 'banglish') {
          aiReply = `Amader Canva Pro er free offer tir meyadh itomoddhe sesh hoye geche. Apni chaile amader regular subscription ti nite paren. Details jante chan ki?`
        } else {
          aiReply = `Our free Canva Pro promotional offer has now ended. You can purchase our regular subscription if you are interested. Would you like more details?`
        }
      }
    }

    // If the business has NO active discount documented, strip any hallucinated "10% discount" or generic unverified percentage discounts
    const hasActiveDiscountInDocs = /\b(?:\d+%\s*discount|\d+%\s*off|ডিসকাউন্ট)\b/i.test(knowledgeSourcesText)
    if (!hasActiveDiscountInDocs && /\b(?:\b10%\s*discount\b|\b20%\s*discount\b|10%\s*discount\s*er\s*por)\b/i.test(aiReply)) {
      aiReply = aiReply
        .replace(/\b10%\s*discount\s*er\s*por\s*/gi, '')
        .replace(/\b(?:10%|20%)\s*discount\b/gi, 'special offer')
        .trim()
    }
  }

  const orderConfirmationPhrases = /(?:order\s*(?:has\s*been|is)?\s*(?:successfully)?\s*(?:placed|confirmed|booked)|অর্ডার(?:টি)?\s*(?:সফলভাবে)?\s*(?:কনফার্ম|গৃহীত|নিশ্চিত|প্লেস|হয়েছে)|order\s*(?:confirm|place)\s*(?:kora\s*hoyeche|hoyeche))/i
  const aiClaimsOrderPlaced = orderConfirmationPhrases.test(aiReply)

  let explicitPaymentMethod: string | null = null
  if (isFreeOrder || isCanvaFreeInStore) {
    explicitPaymentMethod = 'free'
    if (llmOrderData) {
      llmOrderData.payment_method = 'free'
      llmOrderData.total = 0
      llmOrderData.subtotal = 0
      llmOrderData.delivery_charge = 0
    }
  } else if (/\b(?:cod|cash on delivery|ক্যাশ অন ডেলিভারি|ক্যাশ|ক্যাশে)\b/i.test(msgLower)) {
    if (!isOrderDigital) explicitPaymentMethod = 'cod'
  } else if (/\b(?:bkash|b-kash|বিকাশ)\b/i.test(msgLower)) {
    explicitPaymentMethod = 'bkash'
  } else if (/\b(?:nagad|নগদ)\b/i.test(msgLower)) {
    explicitPaymentMethod = 'nagad'
  } else if (/\b(?:rocket|রকেট)\b/i.test(msgLower)) {
    explicitPaymentMethod = 'rocket'
  } else if (/\b(?:bank transfer|bank|ব্যাংক)\b/i.test(msgLower)) {
    explicitPaymentMethod = 'bank_transfer'
  } else if (!isOrderDigital && /\b(?:cod|cash on delivery|ক্যাশ অন ডেলিভারি)\b/i.test(histLower)) {
    explicitPaymentMethod = 'cod'
  } else if (llmOrderData?.payment_method && ['bkash', 'nagad', 'rocket', 'bank_transfer', 'free'].includes(llmOrderData.payment_method.toLowerCase())) {
    if (llmOrderData.payment_method.toLowerCase() === 'free' || /\b(?:bkash|nagad|rocket|bank|paid|pay|পেমেন্ট|বিকাশ|নগদ|টাকা)\b/i.test(combinedHistory)) {
      explicitPaymentMethod = llmOrderData.payment_method.toLowerCase()
    }
  } else if (!isOrderDigital && llmOrderData?.payment_method?.toLowerCase() === 'cod') {
    if (/\b(?:cod|cash on delivery|cash|ক্যাশ)\b/i.test(combinedHistory)) {
      explicitPaymentMethod = 'cod'
    }
  }

  // Check if customer wants to Cancel an order or Change product
  const cancelKeywords = /\b(?:cancel|cancle|cancelled|cancelling|বাতিল|ক্যানসেল|ক্যান্সেল|বাদ|বাতিল\s*করুন|বাতিল\s*করে\s*দিন|বাতিল\s*কর্ডেন|cancel\s*order|order\s*cancel|cancel\s*my\s*order|order\s*cancel\s*kore\s*din|eita\s*nibo\s*na|nibo\s*na|nebo\s*na|lagbe\s*na|dorkar\s*nai|নিব\s*না|নেব\s*না|লাগবে\s*না|দরকার\s*নাই|চাই\s*না|chai\s*na|order\s*lagbe\s*na|order\s*dorkar\s*nai|order\s*nibo\s*na)\b/i
  const changeKeywords = /\b(?:change|palte|bodle|poriborton|bodol|poriborte|instead|onno\s*ta|onno\s*product|অন্য\s*পণ্য|পরিবর্তন|পাল্টে|বদলে|বদল|পরিবর্তে)\b/i
  const isLlmCancel = Boolean(llmOrderData?.action === 'cancel' || llmOrderData?.is_cancelled)
  const isCancelRequest = isLlmCancel || cancelKeywords.test(messageText)
  const isProductChange =
    Boolean(llmOrderData?.action === 'update_items' || llmOrderData?.action === 'update') ||
    changeKeywords.test(messageText)

  // Completeness check:
  // For Cancel orders: NO info required (do not ask for address/phone/payment!)
  // For Free orders: NO payment or TrxID required! Only Email+Phone (digital) or Address+Phone (physical)
  // For Paid orders: Payment method / confirmation is strictly required
  let missingInfo: 'payment_method' | 'email' | 'address' | 'phone' | null = null

  if (isCancelRequest && !isProductChange) {
    if (llmOrderData) {
      llmOrderData.is_order = false
      llmOrderData.action = 'cancel'
      llmOrderData.is_cancelled = true
    }
    missingInfo = null

    // Ensure AI response confirms cancellation politely and never asks for order details or says order placed
    if (aiClaimsOrderPlaced || /\b(?:trx(?:id)?|payment|bkash|nagad|send\s*(?:the)?\s*payment|টাকা|পেমেন্ট|address|ঠিকানা|ইমেইল|email|01326596251)\b/i.test(aiReply) || !/\b(?:cancel|বাতিল|ক্যানসেল)\b/i.test(aiReply)) {
      if (detectedLang === 'bn') {
        aiReply = `আপনার অনুরোধ অনুযায়ী অর্ডারটি সফলভাবে বাতিল করা হয়েছে। ভবিষ্যতে যেকোনো প্রয়োজনে আমরা আপনার পাশে আছি। ধন্যবাদ!`
      } else if (detectedLang === 'banglish') {
        aiReply = `Apnar onurodh onujayi order ti successfully cancel kora hoyeche. Bhabisshote jekono proyojone amader janaben. Dhonnobad!`
      } else {
        aiReply = `Your order has been successfully cancelled as requested. Please let us know whenever you need anything in the future. Thank you!`
      }
    }
  } else if (isFreeOrder || isCanvaFreeInStore) {
    if (isOrderDigital) {
      if (!effectiveEmail) missingInfo = 'email'
      else if (!effectivePhone) missingInfo = 'phone'
    } else {
      if (!effectiveAddress || effectiveAddress.length < 6) missingInfo = 'address'
      else if (!effectivePhone) missingInfo = 'phone'
    }
  } else {
    if (isOrderDigital) {
      if (!effectiveEmail) missingInfo = 'email'
      else if (!explicitPaymentMethod || (!hasTrx && !hasPaymentSent && explicitPaymentMethod === 'cod')) missingInfo = 'payment_method'
      else if (!effectivePhone) missingInfo = 'phone'
    } else {
      if (!effectiveAddress || effectiveAddress.length < 6) missingInfo = 'address'
      else if (!effectivePhone) missingInfo = 'phone'
      else if (!explicitPaymentMethod) missingInfo = 'payment_method'
    }
  }

  if (isProductChange && llmOrderData) {
    llmOrderData.action = 'update_items'
    llmOrderData.is_order = true
  }

  // Handle Free Order Completion:
  if ((isFreeOrder || isCanvaFreeInStore) && effectivePhone && (isOrderDigital ? effectiveEmail : effectiveAddress)) {
    if (llmOrderData) {
      llmOrderData.is_order = true
      llmOrderData.total = 0
      llmOrderData.subtotal = 0
      llmOrderData.delivery_charge = 0
      llmOrderData.payment_method = 'free'
      llmOrderData.payment_confirmed = true
    }

    // Intercept if AI mistakenly asked for payment/TrxID on a free order
    if (/\b(?:trx(?:id)?|payment|send\s*(?:the)?\s*payment|টাকা\s*পাঠান|পেমেন্ট\s*করে|01326596251)\b/i.test(aiReply)) {
      if (detectedLang === 'bn') {
        aiReply = `ধন্যবাদ! আপনার ফ্রি অর্ডারের জন্য প্রয়োজনীয় সকল তথ্য (ইমেইল ও ফোন নম্বর) পাওয়া গেছে। আপনার ফ্রি অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে এবং আমাদের টিম দ্রুত অ্যাক্সেস প্রস্তুত করে আপনার ইমেইলে পাঠিয়ে দিচ্ছে!`
      } else if (detectedLang === 'banglish') {
        aiReply = `Dhonnobad! Apnar free order er jonno proyojoniyo sob details (email o phone number) peyechi. Order ti successfully confirm kora hoyeche ebong amader team apnar access email e pathiye dicche!`
      } else {
        aiReply = `Thank you, Sir! We have received your email and phone number. Your free order has been successfully placed and our team is preparing your digital access!`
      }
    }
  }

  // Detect if customer is actively attempting to place an order or provided checkout data
  const orderIntentKeywords = /\b(?:order\s*(?:korte|korbo|kori|confirm|place|din|den|korun|dite|kora|chai|lagbe)|অর্ডার\s*(?:করতে|করব|করবো|দিন|কনফার্ম|করুন|চাই|নিব|নেব)|nite\s*chai|kinbo|kinte\s*chai|buy|purchase|place\s*order|want\s*to\s*buy|i\s*want\s*to\s*order|send\s*me|need\s*this|confirm\s*order)\b/i
  const isQuestionOrInquiry = /\b(?:\?|ki|koto|dam\s*koto|kivabe|details|sure|is\s*it|are\s*you\s*sure|free\s*naki\s*paid|paid\s*naki\s*free|free\s*or\s*paid|paid\s*or\s*free|কত|কী|কি|নাকি|পেইড|ফ্রি\s*নাকি)\b/i.test(messageText)

  const customerProvidedCheckoutDetails = Boolean(
    (effectiveEmail && effectivePhone) ||
    (effectiveAddress && effectivePhone) ||
    hasTrx ||
    hasPaymentSent
  )

  const isCustomerAttemptingOrder =
    (orderIntentKeywords.test(messageText) && !isQuestionOrInquiry) ||
    customerProvidedCheckoutDetails ||
    Boolean(llmOrderData?.is_order && orderIntentKeywords.test(combinedHistory) && !isQuestionOrInquiry)

  // Invalidate order if incomplete or if customer is only asking an informational question
  if (missingInfo || !isCustomerAttemptingOrder) {
    if (llmOrderData && !customerProvidedCheckoutDetails) {
      llmOrderData.is_order = false
    }
  }

  // Only hijack/sanitize aiReply if:
  // 1. The AI falsely claimed an order was placed/confirmed without having full details, OR
  // 2. The customer is actively attempting to place an order and missing required checkout fields
  const shouldSanitizeMissingOrderInfo =
    missingInfo && (aiClaimsOrderPlaced || (isCustomerAttemptingOrder && (effectiveEmail || effectiveAddress || explicitPaymentMethod || isFreeOrder || isCanvaFreeInStore)))

  if (shouldSanitizeMissingOrderInfo) {
      const bKashNumber = account?.special_instructions || account?.ai_store_instructions?.match(/01[3-9]\d{8}/)?.[0] || '01326596251'

      if (isOrderDigital) {
        if (missingInfo === 'email') {
          if (detectedLang === 'bn') {
            aiReply = (isFreeOrder || isCanvaFreeInStore)
              ? `আমাদের বিশেষ অফারে Canva Pro সম্পূর্ণ ফ্রি (৳০), কোনো পেমেন্ট বা টাকা পাঠাতে হবে না! আপনার ফ্রি ডিজিটাল অ্যাক্সেস পেতে অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেসটি শেয়ার করুন।`
              : `ধন্যবাদ! ডিজিটাল পণ্যের অ্যাক্সেস সরাসরি আপনার ইমেইলে দেওয়া হবে। অনুগ্রহ করে আপনার ইমেইল অ্যাড্রেসটি দিন এবং বিকাশ/নগদে (${bKashNumber}) পেমেন্ট কনফার্ম করুন।`
          } else if (detectedLang === 'banglish') {
            aiReply = (isFreeOrder || isCanvaFreeInStore)
              ? `Amader special offer e Canva Pro shompurno Free (৳0), kono payment ba taka pathate hobe na! Apnar free digital access pete kindly apnar Email address ti share korun.`
              : `Dhonnobad! Digital product er access shorashori apnar email e deya hobe. Doya kore apnar Email address ti din ebong bKash/Nagad e (${bKashNumber}) payment confirm korun.`
          } else {
            aiReply = (isFreeOrder || isCanvaFreeInStore)
              ? `Canva Pro is completely free (৳0) under our special offer, no payment is required! Please share your Email address so we can grant your digital access.`
              : `Thank you! Since this is a digital product, access is delivered directly to your email. Please share your Email address and confirm your payment to ${bKashNumber} to finalize your order!`
          }
        } else if (missingInfo === 'phone') {
          if (detectedLang === 'bn') {
            aiReply = `ধন্যবাদ! আপনার ইমেইল পেয়েছি। অর্ডারটি সম্পন্ন করতে অনুগ্রহ করে আপনার একটি কন্টাক্ট ফোন নম্বর দিন।`
          } else if (detectedLang === 'banglish') {
            aiReply = `Dhonnobad! Apnar email peyechi. Order ti complete korte apnar phone number ti din please.`
          } else {
            aiReply = `Thank you! We have received your email. Could you please share a contact phone number so we can complete your order?`
          }
        } else if (missingInfo === 'payment_method') {
          if (detectedLang === 'bn') {
            aiReply = `ধন্যবাদ! ডিজিটাল পণ্যটির অর্ডার সম্পন্ন করতে অনুগ্রহ করে বিকাশ/নগদে (${bKashNumber}) পেমেন্ট সম্পন্ন করে TrxID বা পেমেন্ট কনফার্ম করুন।`
          } else if (detectedLang === 'banglish') {
            aiReply = `Dhonnobad! Digital product er order complete korte bKash/Nagad e (${bKashNumber}) payment kore TrxID ba payment confirm korun please.`
          } else {
            aiReply = `Thank you! To complete your digital order, please send payment via bKash/Nagad to ${bKashNumber} and share the TrxID or confirmation.`
          }
        }
      } else {
        if (missingInfo === 'payment_method') {
          if (detectedLang === 'bn') {
            aiReply = `ধন্যবাদ! আমরা আপনার ডেলিভারি তথ্য পেয়েছি। অর্ডারটি কনফার্ম করতে অনুগ্রহ করে আপনার পছন্দের পেমেন্ট মাধ্যমটি (ক্যাশ অন ডেলিভারি নাকি বিকাশ/নগদ) জানিয়ে দিন।`
          } else if (detectedLang === 'banglish') {
            aiReply = `Dhonnobad! Amra apnar delivery details peyechi. Order confirm korte apnar pochonder payment method (Cash on Delivery naki bKash/Nagad) janaben please?`
          } else {
            aiReply = `Thank you! We have received your delivery details. To complete your order, could you please specify your preferred payment method: Cash on Delivery (COD) or bKash/Nagad?`
          }
        } else if (missingInfo === 'address') {
          if (detectedLang === 'bn') {
            aiReply = `ধন্যবাদ! অর্ডারটি কনফার্ম করতে অনুগ্রহ করে আপনার পূর্ণাঙ্গ ডেলিভারি ঠিকানা (বাসা/রোড, থানা, জেলা) জানিয়ে দিন।`
          } else if (detectedLang === 'banglish') {
            aiReply = `Dhonnobad! Order confirm korte apnar full delivery address (basha/road, thana, district) janaben please.`
          } else {
            aiReply = `Thank you! Please share your full delivery address (house/road, area, city) to complete your order!`
          }
        } else if (missingInfo === 'phone') {
          if (detectedLang === 'bn') {
            aiReply = `ধন্যবাদ! অর্ডারটি সম্পন্ন করতে অনুগ্রহ করে একটি যোগাযোগ ফোন নম্বর দিন।`
          } else if (detectedLang === 'banglish') {
            aiReply = `Dhonnobad! Order confirm korte apnar contact phone number ti din please.`
          } else {
            aiReply = `Thank you! Please share a contact phone number to complete your order!`
          }
        }
      }
    }

  // 4. Automatic Order Capture to 'orders' table (sets status 'new' for shop owner review)
  try {
    await detectAndCreateOrderFromChat({
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
