import { normalizeBengaliDigits } from '@/lib/contacts/extract-info'

/**
 * Normalizes any Bangladeshi phone format into standard 11 digits: 01XXXXXXXXX.
 * Handles:
 *  - "+8801712345678" -> "01712345678"
 *  - "8801712345678"  -> "01712345678"
 *  - "01712345678"    -> "01712345678"
 *  - "1712345678"     -> "01712345678"
 *  - Bengali digits "০১৭১২৩৪৫৬৭৮" -> "01712345678"
 *  - Strips spaces, dashes, parentheses.
 */
export function normalizeBdPhone(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return ''

  const ascii = normalizeBengaliDigits(phone.trim())
  const digits = ascii.replace(/\D/g, '')

  if (!digits) return ''

  // 11 digits starting with 01
  if (digits.length === 11 && digits.startsWith('01')) {
    return digits
  }

  // 13 digits starting with 8801
  if (digits.length === 13 && digits.startsWith('8801')) {
    return digits.slice(2)
  }

  // 10 digits starting with 1 (missing leading 0)
  if (digits.length === 10 && digits.startsWith('1')) {
    return '0' + digits
  }

  // 12 digits starting with 801
  if (digits.length === 12 && digits.startsWith('801')) {
    return digits.slice(1)
  }

  // Fallback: if ends with 11 digits starting with 01
  if (digits.length > 11) {
    const tail11 = digits.slice(-11)
    if (tail11.startsWith('01')) return tail11
  }

  return digits
}

/**
 * Checks if a string is a valid 11-digit Bangladeshi mobile number (013..019)
 */
export function isValidBdPhone(phone?: string | null): boolean {
  const normalized = normalizeBdPhone(phone)
  return /^01[3-9]\d{8}$/.test(normalized)
}
