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

/**
 * Extracts phone numbers and account types for bKash, Nagad, and Rocket
 * directly from the merchant's free-text 'special_instructions' entered in
 * https://jobabdesk.vercel.app/agents (Business Setup -> Accepted Payment Channels & Checkout Instructions).
 */
export function parsePaymentInstructions(text?: string | null): Partial<MergedPaymentSettings> {
  if (!text || typeof text !== 'string') return {}

  const result: Partial<MergedPaymentSettings> = {}

  function extractForProvider(providerRegex: string): PaymentAccountConfig | null {
    // 1. Provider followed by phone number: e.g. "bKash: 01700-000000", "bKash (Merchant) 01712345678"
    const forwardRegex = new RegExp(
      '(?:' + providerRegex + ')[^0-9+,;|\\n]{0,30}([0-9+][0-9\\-\\s]{9,16}[0-9])',
      'i'
    )
    const fMatch = text!.match(forwardRegex)
    if (fMatch) {
      const full = fMatch[0]
      const cleanNum = fMatch[1].replace(/[^0-9+]/g, '')
      if (cleanNum.length >= 11) {
        let type: 'personal' | 'merchant' | 'agent' = 'personal'
        if (/merchant|মার্চেন্ট|payment|পেমেন্ট/i.test(full)) {
          type = 'merchant'
        } else if (/agent|এজেন্ট/i.test(full)) {
          type = 'agent'
        }
        return { number: cleanNum, type }
      }
    }

    // 2. Phone number followed by provider: e.g. "01700-000000 (bKash personal)"
    const backwardRegex = new RegExp(
      '([0-9+][0-9\\-\\s]{9,16}[0-9])[^0-9+,;|\\n]{0,30}(?:' + providerRegex + ')',
      'i'
    )
    const bMatch = text!.match(backwardRegex)
    if (bMatch) {
      const full = bMatch[0]
      const cleanNum = bMatch[1].replace(/[^0-9+]/g, '')
      if (cleanNum.length >= 11) {
        let type: 'personal' | 'merchant' | 'agent' = 'personal'
        if (/merchant|মার্চেন্ট|payment|পেমেন্ট/i.test(full)) {
          type = 'merchant'
        } else if (/agent|এজেন্ট/i.test(full)) {
          type = 'agent'
        }
        return { number: cleanNum, type }
      }
    }

    return null
  }

  const bkash = extractForProvider('bkash|বিকাশ')
  if (bkash) result.bkash = bkash

  const nagad = extractForProvider('nagad|নগদ')
  if (nagad) result.nagad = nagad

  const rocket = extractForProvider('rocket|রকেট')
  if (rocket) result.rocket = rocket

  return result
}

/**
 * Resolves the final payment settings for a specific merchant account.
 * Prioritizes explicit payment_settings, but seamlessly falls back to
 * extracting the merchant's numbers from their /agents special_instructions.
 */
export function resolveMerchantPaymentSettings(
  paymentSettings?: any,
  specialInstructions?: string | null
): MergedPaymentSettings {
  const parsed = parsePaymentInstructions(specialInstructions)

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
      details: existing.bank?.details?.trim() || '',
    },
    allow_cod_advance: existing.allow_cod_advance ?? true,
    cod_advance_amount: existing.cod_advance_amount ?? 150,
    special_instructions: specialInstructions?.trim() || '',
  }
}
