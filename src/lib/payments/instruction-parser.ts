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
 * Extracts phone numbers and account types for bKash, Nagad, and Rocket
 * directly from the merchant's free-text 'special_instructions' entered in
 * https://jobabdesk.vercel.app/agents (Business Setup -> Accepted Payment Channels & Checkout Instructions).
 */
export function parsePaymentInstructions(text?: string | null): Partial<MergedPaymentSettings> {
  if (!text || typeof text !== 'string') return {}

  const normalized = normalizeBengaliDigits(text)
  const result: Partial<MergedPaymentSettings> = {}

  function extractForProvider(providerRegex: string): { number: string; type: 'personal' | 'merchant' | 'agent'; fullMatch: string } | null {
    // 1. Forward match: Provider followed by BD number (013..019)
    const forwardRegex = new RegExp(
      '(?:' + providerRegex + ')[^0-9+]{0,45}((?:\\+?88)?01[3-9][0-9\\-\\s]{7,13}[0-9])',
      'i'
    )
    const fMatch = normalized.match(forwardRegex)
    if (fMatch) {
      const full = fMatch[0]
      const cleanNum = cleanBdPhoneNumber(fMatch[1])
      if (cleanNum.length === 11) {
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
      '((?:\\+?88)?01[3-9][0-9\\-\\s]{7,13}[0-9])[^0-9+]{0,45}(?:' + providerRegex + ')',
      'i'
    )
    const bMatch = normalized.match(backwardRegex)
    if (bMatch) {
      const full = bMatch[0]
      const cleanNum = cleanBdPhoneNumber(bMatch[1])
      if (cleanNum.length === 11) {
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
    // Check if the match also combined nagad or rocket (e.g. "bKash, Nagad: 017...")
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

  // 4. Bank account details
  const bankMatch = normalized.match(/(?:bank|ব্যাংক|account|a\/c|ac\s*no)[^:\n]{0,20}:?\s*([^\n|;]{5,100})/i)
  if (bankMatch && bankMatch[1] && !/^(?:bkash|nagad|rocket|01[3-9])/i.test(bankMatch[1].trim())) {
    result.bank = { details: bankMatch[0].trim() }
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
 * Prioritizes explicit payment_settings, but seamlessly falls back to
 * extracting the merchant's numbers from their /agents special_instructions
 * or extra business guideline fields.
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

  const defaultSettings: MergedPaymentSettings = {
    bkash: { number: '', type: 'personal' },
    nagad: { number: '', type: 'personal' },
    rocket: { number: '', type: 'personal' },
    bank: { details: '' },
    allow_cod_advance: true,
    cod_advance_amount: 150,
  }

  const existing = paymentSettings || {}

  return {
    bkash: {
      number: existing.bkash?.number?.trim() || parsed.bkash?.number || '',
      type: existing.bkash?.number?.trim()
        ? existing.bkash?.type || 'personal'
        : parsed.bkash?.type || existing.bkash?.type || 'personal',
    },
    nagad: {
      number: existing.nagad?.number?.trim() || parsed.nagad?.number || '',
      type: existing.nagad?.number?.trim()
        ? existing.nagad?.type || 'personal'
        : parsed.nagad?.type || existing.nagad?.type || 'personal',
    },
    rocket: {
      number: existing.rocket?.number?.trim() || parsed.rocket?.number || '',
      type: existing.rocket?.number?.trim()
        ? existing.rocket?.type || 'personal'
        : parsed.rocket?.type || existing.rocket?.type || 'personal',
    },
    bank: {
      details: existing.bank?.details?.trim() || parsed.bank?.details || '',
    },
    allow_cod_advance: existing.allow_cod_advance ?? true,
    cod_advance_amount: existing.cod_advance_amount ?? 150,
    special_instructions: specialInstructions?.trim() || '',
  }
}
