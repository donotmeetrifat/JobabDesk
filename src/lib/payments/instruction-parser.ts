export interface PaymentAccountConfig {
  number: string
  type: 'personal' | 'merchant' | 'agent'
}

export interface MergedPaymentSettings {
  bkash: PaymentAccountConfig
  nagad: PaymentAccountConfig
  rocket: PaymentAccountConfig
  bank: { details: string }
  allow_cod_advance: boolean
  cod_advance_amount: number
  special_instructions?: string
}

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/**
 * Normalizes Bengali digits (০-৯) to standard ASCII digits (0-9).
 */
export function normalizeBengaliDigits(str: string): string {
  if (!str) return ''
  let result = str
  for (let i = 0; i < 10; i++) {
    result = result.split(BENGALI_DIGITS[i]).join(String(i))
  }
  return result
}

/**
 * Normalizes Bangladeshi phone numbers:
 * Converts +8801XXXXXXXXX or 8801XXXXXXXXX to 01XXXXXXXXX
 */
export function cleanBdPhoneNumber(raw: string): string {
  if (!raw) return ''
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+8801')) {
    digits = digits.slice(3)
  } else if (digits.startsWith('8801')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('+88')) {
    digits = digits.slice(3)
  }
  return digits
}

/**
 * Extracts bank account, card information, or payment deposit details
 * from free-text instructions entered by the merchant.
 */
export function extractBankAndCardDetails(text?: string | null): string {
  if (!text || typeof text !== 'string') return ''
  const normalized = normalizeBengaliDigits(text)
  const lines = normalized.split(/\r?\n/)

  const cardBankKeywords =
    /\b(?:card|cards|visa|mastercard|amex|nexus|npsb|beftn|bank|banking|branch|routing|swift|a\/c|account)\b|কার্ড|ব্যাংক|শাখা|রাউটিং|একাউন্ট|হিসাব/i

  const mobileOnlyRegex =
    /^(?:b?kash|bikash|nagad|nogod|rocket|roket|dbbl|বিকাশ|নগদ|রকেট)\s*[:\-\/]/i

  const matchedLines: string[] = []
  let capturingBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (capturingBlock && matchedLines.length > 0) {
        capturingBlock = false
      }
      continue
    }

    // Skip lines that are strictly mobile banking numbers without bank/card info
    if (mobileOnlyRegex.test(line) && !cardBankKeywords.test(line)) {
      capturingBlock = false
      continue
    }

    if (cardBankKeywords.test(line)) {
      let cleanLine = line
      if (cleanLine.includes('|')) {
        const segments = cleanLine.split('|').map((s) => s.trim())
        const relevant = segments.filter(
          (s) => cardBankKeywords.test(s) && !mobileOnlyRegex.test(s)
        )
        if (relevant.length > 0) {
          cleanLine = relevant.join(' | ')
        }
      }
      matchedLines.push(cleanLine)
      capturingBlock = true
    } else if (capturingBlock) {
      if (!/^(?:delivery|refund|return|terms|note|faq|শর্ত|ডেলিভারি)/i.test(line)) {
        matchedLines.push(line)
      } else {
        capturingBlock = false
      }
    }
  }

  if (matchedLines.length > 0) {
    return matchedLines.join('\n').trim()
  }

  // Fallback for single-line inline descriptions
  const inlineMatch = normalized.match(
    /(?:card|cards|কার্ড|bank|ব্যাংক|visa|mastercard|npsb|a\/c|account\s*no)[^:\n]{0,30}:?\s*([^\n|;]{5,250})/i
  )
  if (inlineMatch && inlineMatch[0]) {
    const candidate = inlineMatch[0].trim()
    if (!/^(?:bkash|nagad|rocket|01[3-9])/i.test(candidate)) {
      return candidate
    }
  }

  return ''
}

/**
 * Extracts phone numbers and account types for bKash, Nagad, and Rocket,
 * as well as card and bank details directly from the merchant's free-text
 * 'special_instructions' or guideline fields entered in /agents.
 */
export function parsePaymentInstructions(text?: string | null): Partial<MergedPaymentSettings> {
  if (!text || typeof text !== 'string') return {}

  const normalized = normalizeBengaliDigits(text)
  const result: Partial<MergedPaymentSettings> = {}

  function extractForProvider(providerRegex: string): { number: string; type: 'personal' | 'merchant' | 'agent'; fullMatch: string } | null {
    const isRocket = /rocket|রকেট|roket|dbbl/i.test(providerRegex)

    // 1. Forward match: Provider followed by BD number (013..019)
    const forwardRegex = new RegExp(
      '(?:' + providerRegex + ')[^0-9+]{0,60}((?:\\+?88)?01[3-9][0-9\\-\\s]{7,14}[0-9])',
      'i'
    )
    const fMatch = normalized.match(forwardRegex)
    if (fMatch) {
      const full = fMatch[0]
      const cleanNum = cleanBdPhoneNumber(fMatch[1])
      if (cleanNum.length === 11 || (isRocket && cleanNum.length === 12)) {
        let type: 'personal' | 'merchant' | 'agent' = 'personal'
        if (/merchant|মার্চেন্ট|payment|পেমেন্ট/i.test(full)) {
          type = 'merchant'
        } else if (/agent|এজেন্ট/i.test(full)) {
          type = 'agent'
        }
        return { number: cleanNum, type, fullMatch: full }
      }
    }

    // 2. Backward match: BD number followed by provider
    const backwardRegex = new RegExp(
      '((?:\\+?88)?01[3-9][0-9\\-\\s]{7,14}[0-9])[^0-9+]{0,60}(?:' + providerRegex + ')',
      'i'
    )
    const bMatch = normalized.match(backwardRegex)
    if (bMatch) {
      const full = bMatch[0]
      const cleanNum = cleanBdPhoneNumber(bMatch[1])
      if (cleanNum.length === 11 || (isRocket && cleanNum.length === 12)) {
        let type: 'personal' | 'merchant' | 'agent' = 'personal'
        if (/merchant|মার্চেন্ট|payment|পেমেন্ট/i.test(full)) {
          type = 'merchant'
        } else if (/agent|এজেন্ট/i.test(full)) {
          type = 'agent'
        }
        return { number: cleanNum, type, fullMatch: full }
      }
    }

    return null
  }

  // 1. bKash extraction
  const bkash = extractForProvider('bkash|বিকাশ|bikash')
  if (bkash) {
    result.bkash = { number: bkash.number, type: bkash.type }
    if (/nagad|নগদ|nogod/i.test(bkash.fullMatch)) {
      result.nagad = { number: bkash.number, type: bkash.type }
    }
    if (/rocket|রকেট|roket/i.test(bkash.fullMatch)) {
      result.rocket = { number: bkash.number, type: bkash.type }
    }
  }

  // 2. Nagad extraction
  const nagad = extractForProvider('nagad|নগদ|nogod')
  if (nagad) {
    result.nagad = { number: nagad.number, type: nagad.type }
    if (/rocket|রকেট|roket/i.test(nagad.fullMatch)) {
      result.rocket = { number: nagad.number, type: nagad.type }
    }
  }

  // 3. Rocket extraction
  const rocket = extractForProvider('rocket|রকেট|roket|dbbl')
  if (rocket) {
    result.rocket = { number: rocket.number, type: rocket.type }
  }

  // 4. Card & Bank details extraction
  const bankAndCardDetails = extractBankAndCardDetails(text)
  if (bankAndCardDetails) {
    result.bank = { details: bankAndCardDetails }
  }

  // 5. Smart Fallback: If bkash is still missing, look for ANY 11-digit BD mobile number in the text
  if (!result.bkash || !result.bkash.number) {
    const generalMatch = normalized.match(/(?:\+?88)?01[3-9][0-9\-\s]{7,13}[0-9]/)
    if (generalMatch) {
      const clean = cleanBdPhoneNumber(generalMatch[0])
      if (clean.length === 11) {
        result.bkash = { number: clean, type: 'personal' }
        if (!result.nagad || !result.nagad.number) {
          result.nagad = { number: clean, type: 'personal' }
        }
      }
    }
  }

  return result
}

/**
 * Resolves the final payment settings for a specific merchant account.
 * Seamlessly resolves merchant numbers and card details from their /agents
 * special_instructions, business guidelines, or payment_settings table.
 */
export function resolveMerchantPaymentSettings(
  paymentSettings?: any,
  specialInstructions?: string | null,
  extraInstructions?: string | null
): MergedPaymentSettings {
  const combinedInstructions = [specialInstructions, extraInstructions]
    .filter(Boolean)
    .join('\n')

  const parsed = parsePaymentInstructions(combinedInstructions)
  const existing = paymentSettings || {}

  // Prioritize explicit settings if present, otherwise fallback to parsed /agents instructions
  const resolveMethod = (
    methodKey: 'bkash' | 'nagad' | 'rocket'
  ): PaymentAccountConfig => {
    const parsedMethod = parsed[methodKey]
    const existingMethod = existing[methodKey]

    const number =
      existingMethod?.number?.trim() || parsedMethod?.number?.trim() || ''

    const type = existingMethod?.number?.trim()
      ? existingMethod.type || 'personal'
      : parsedMethod?.type || existingMethod?.type || 'personal'

    return { number, type }
  }

  const bankDetails =
    existing.bank?.details?.trim() || parsed.bank?.details?.trim() || ''

  return {
    bkash: resolveMethod('bkash'),
    nagad: resolveMethod('nagad'),
    rocket: resolveMethod('rocket'),
    bank: { details: bankDetails },
    allow_cod_advance: existing.allow_cod_advance ?? true,
    cod_advance_amount: existing.cod_advance_amount ?? 150,
    special_instructions: specialInstructions?.trim() || '',
  }
}
