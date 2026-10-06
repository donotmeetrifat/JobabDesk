const BENGALI_TO_ASCII_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
}

export function normalizeBengaliDigits(str: string): string {
  if (!str) return ''
  return str.replace(/[০-৯]/g, (d) => BENGALI_TO_ASCII_DIGITS[d] || d)
}

export function isFacebookPsid(phone?: string | null): boolean {
  if (!phone) return false
  const trimmed = phone.trim()
  return !trimmed.startsWith('+') && trimmed.length >= 14 && /^\d+$/.test(trimmed)
}

export function cleanEmail(email?: string | null): string | null {
  if (!email) return null
  const trimmed = email.trim()
  if (trimmed.toLowerCase().endsWith('@facebook.com')) return null
  return trimmed
}

export interface ExtractedCustomerInfo {
  phone?: string | null
  address?: string | null
  email?: string | null
  name?: string | null
}

/**
 * Robust extractor for phone, address, and email from customer chat messages.
 * Handles English, Bengali script, Banglish formats, and common misspellings (e.g. "Adreass:").
 */
export function extractCustomerInfoFromMessage(text: string): ExtractedCustomerInfo {
  if (!text || typeof text !== 'string') return {}

  const result: ExtractedCustomerInfo = {}
  const rawClean = text.trim()
  const cleanText = normalizeBengaliDigits(rawClean)

  // 1. PHONE EXTRACTION
  // Match Bangladesh numbers: 013-019 (11 digits), +880 1..., +8801..., 8801...
  // Handles prefixes ("num: ", "phone: ", "phn: ", "ph: "), spaces, hyphens, and delimiters
  const bdPhoneRegex =
    /(?:(?:num(?:ber)?|phone|mobile|cell|contact|call|phn|mob|ph|ফোন|নাম্বার|মোবাইল)\s*[:=-]?\s*)?(?:(?:\+|00)?880[-\s]?|0)?(1[3-9][0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{3})\b/i
  const bdMatch = cleanText.match(bdPhoneRegex)
  if (bdMatch) {
    const rawDigits = bdMatch[0].replace(/\D/g, '')
    if (rawDigits.length === 11 && rawDigits.startsWith('01')) {
      result.phone = `+880${rawDigits.slice(1)}`
    } else if (rawDigits.length === 13 && rawDigits.startsWith('8801')) {
      result.phone = `+${rawDigits}`
    } else if (rawDigits.endsWith(bdMatch[1].replace(/\D/g, ''))) {
      result.phone = `+880${bdMatch[1].replace(/\D/g, '')}`
    } else if (rawDigits.length >= 10 && rawDigits.length <= 15) {
      result.phone = `+${rawDigits}`
    }
  }

  // Fallback: International E.164 phone numbers
  if (!result.phone) {
    const intlPhoneRegex = /\+([1-9]\d{7,14})\b/
    const intlMatch = cleanText.match(intlPhoneRegex)
    if (intlMatch && !isFacebookPsid(intlMatch[1])) {
      result.phone = `+${intlMatch[1]}`
    }
  }

  // 2. EMAIL EXTRACTION
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  const emailMatch = cleanText.match(emailRegex)
  if (emailMatch) {
    const candidate = emailMatch[0].toLowerCase()
    if (!candidate.endsWith('@facebook.com')) {
      result.email = candidate
    }
  }

  // 3. ADDRESS EXTRACTION
  // Look for explicit prefix: Address: ..., Adreass: ..., Adress: ..., Addres: ..., Thikana: ..., ঠিকানায়: ..., Delivery address: ...
  const explicitAddressRegex =
    /(?:(?:delivery\s*ad{1,2}r?e?a?s{1,2}|shipping\s*ad{1,2}r?e?a?s{1,2}|home\s*ad{1,2}r?e?a?s{1,2}|ad{1,2}r?e?a?s{1,2}|thikana|ঠিকানা|বাসা|বাসার\s*ঠিকানা|লোকেশন|location)\s*[:=-]\s*)([^\n\r]+)/i
  const explicitMatch = cleanText.match(explicitAddressRegex)
  if (explicitMatch && explicitMatch[1]) {
    const addr = explicitMatch[1].trim()
    if (addr.length >= 5) {
      result.address = addr
    }
  }

  // If no explicit prefix, check multi-line or address keyword clusters
  if (!result.address) {
    const lines = cleanText.split(/[\r\n]+/)
    const addressKeywords = [
      'road', 'house', 'sector', 'block', 'flat', 'floor', 'apt', 'lane', 'avenue',
      'dhaka', 'chittagong', 'chattogram', 'sylhet', 'rajshahi', 'khulna', 'barisal',
      'rangpur', 'mymensingh', 'comilla', 'cumilla', 'gazipur', 'narayanganj', 'savar',
      'uttara', 'mirpur', 'dhanmondi', 'gulshan', 'banani', 'mohammadpur', 'jatrabari',
      'badda', 'rampura', 'bashundhara', 'malibagh', 'motijheel', 'khilgaon', 'farmgate',
      'রোড', 'বাসা', 'বাড়ি', 'বাড়ি', 'সেক্টর', 'ব্লক', 'ঢাকা', 'চট্টগ্রাম', 'সিলেট',
      'রাজশাহী', 'খুলনা', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ', 'কুমিল্লা', 'মিরপুর', 'উত্তরা',
      'ধানমন্ডি', 'গুলশান', 'বনানী', 'মোহাম্মদপুর'
    ]

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine.length < 8) continue
      if (result.phone && trimmedLine.includes(result.phone)) continue

      const lowerLine = trimmedLine.toLowerCase()
      const matchesKeyword = addressKeywords.some((kw) => lowerLine.includes(kw))
      if (matchesKeyword) {
        result.address = trimmedLine
        break
      }
    }
  }

  // Clean address prefix if still present
  if (result.address) {
    result.address = result.address
      .replace(/^(?:(?:delivery\s*|shipping\s*|home\s*)?ad{1,2}r?e?a?s{1,2}|thikana|ঠিকানা|বাসার\s*ঠিকানা|বাসা|লোকেশন|location)\s*[:=-]\s*/i, '')
      .trim()
  }

  // If address contains the phone number, clean it out so the address is pure
  if (result.address && result.phone) {
    const rawDigits = result.phone.replace(/\D/g, '')
    const localNumber = rawDigits.startsWith('880') ? rawDigits.slice(3) : rawDigits.startsWith('0') ? rawDigits.slice(1) : rawDigits
    const stripRegex = new RegExp(
      `[\\s,।|•-]*((?:phone|mobile|cell|contact|call|phn|mob|ph|num(?:ber)?|ফোন|নাম্বার|মোবাইল)[:\\s-]*)?(?:\\+?880|0)?${localNumber}[^\\n\\r]*$`,
      'i'
    )
    result.address = result.address
      .replace(stripRegex, '')
      .replace(/[\s,।|•-]*((?:phone|mobile|cell|contact|call|phn|mob|ph|num(?:ber)?|ফোন|নাম্বার|মোবাইল)[:\s-]*)$/i, '')
      .replace(/[,\s.]+$/, '')
      .trim()
  }

  // 4. NAME EXTRACTION
  const namePrefixRegex = /(?:(?:my\s*name\s*is|amar\s*na+m\s*(?:hoche|holo|is)?|(?:full\s*name|delivery\s*name|customer\s*name|name|naam|na+m|নাম|কাস্টমার\s*নাম)\s*(?:is|holo|hoche|hobe|:|=|-)?)\s*)([a-zA-Z.\s\u0980-\u09FF]{2,35})/i
  const nameSuffixRegex = /^([a-zA-Z.\s\u0980-\u09FF]{2,35})\s+(?:is\s*(?:the|my)?\s*(?:full\s*)?name|amar\s*na+m|hoche\s*amar\s*na+m|holo\s*amar\s*na+m)/i

  const prefixMatch = cleanText.match(namePrefixRegex)
  const suffixMatch = cleanText.match(nameSuffixRegex)
  const candidate = prefixMatch?.[1] || suffixMatch?.[1]

  const INVALID_NAME_WORDS = /^(address|phone|email|cod|bkash|nagad|rocket|order|product|price|taka|dam|koto|delivery|cash|yes|no|ok|haan|ji)$/i

  if (candidate) {
    const candidateName = candidate.replace(/[\n\r,।|•].*$/, '').trim()
    if (candidateName.length >= 2 && !candidateName.toLowerCase().startsWith('http') && !INVALID_NAME_WORDS.test(candidateName)) {
      result.name = candidateName
    }
  }

  // Also check if line 1 of a multi-line format has a pure name like "Rifat" or "Sara Khan" when other lines are Address/Phone
  if (!result.name) {
    const lines = cleanText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
    if (lines.length >= 2) {
      const firstLine = lines[0]
      if (
        firstLine.length >= 2 &&
        firstLine.length <= 35 &&
        !/\d/.test(firstLine) &&
        !/[@:=-]/.test(firstLine) &&
        !/\b(?:order|cream|product|canva|price|taka|dam|koto|hi|hello|assalamu|delivery|address|phone|email|cod|bkash|nagad|rocket)\b/i.test(firstLine) &&
        /^[a-zA-Z.\s\u0980-\u09FF]+$/.test(firstLine)
      ) {
        result.name = firstLine
      }
    } else if (lines.length === 1) {
      const singleLine = lines[0]
      if (
        singleLine.length >= 2 &&
        singleLine.length <= 35 &&
        !/\d/.test(singleLine) &&
        !/[@:=-]/.test(singleLine) &&
        !/\b(?:order|cream|product|canva|price|taka|dam|koto|hi|hello|assalamu|delivery|address|phone|email|cod|bkash|nagad|rocket|yes|no|ok)\b/i.test(singleLine) &&
        /^[a-zA-Z.\s\u0980-\u09FF]+$/.test(singleLine)
      ) {
        result.name = singleLine
      }
    }
  }

  return result
}
