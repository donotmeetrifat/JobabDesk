export function isFacebookPsid(phone?: string | null): boolean {
  if (!phone) return false
  const trimmed = phone.trim()
  return !trimmed.startsWith('+') && trimmed.length >= 15 && /^\d+$/.test(trimmed)
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
 * Handles English, Bengali script, and Banglish formats.
 */
export function extractCustomerInfoFromMessage(text: string): ExtractedCustomerInfo {
  if (!text || typeof text !== 'string') return {}

  const result: ExtractedCustomerInfo = {}
  const cleanText = text.trim()

  // 1. PHONE EXTRACTION
  const bdPhoneRegex =
    /(?:(?:num(?:ber)?|phone|mobile|cell|contact|call|ফোন|নাম্বার|মোবাইল)\s*[:=-]?\s*)?(?:(?:\+|00)?880[-\s]?|0)?(1[3-9][0-9]{2}[-\s]?[0-9]{3}[-\s]?[0-9]{3})\b/i
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
  const explicitAddressRegex =
    /(?:(?:delivery\s*add?re+ss?|shipping\s*add?re+ss?|home\s*add?re+ss?|add?re+ss?|thikana|ঠিকানা|বাসা|বাসার\s*ঠিকানা|লোকেশন|location)\s*[:=-]\s*)([^\n\r]+)/i
  const explicitMatch = cleanText.match(explicitAddressRegex)
  if (explicitMatch && explicitMatch[1]) {
    const addr = explicitMatch[1].trim()
    if (addr.length >= 5) {
      result.address = addr
    }
  }

  // Fallback keyword scanning
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

  if (result.address && result.phone) {
    const rawDigits = result.phone.replace(/\D/g, '')
    const localNumber = rawDigits.startsWith('880') ? rawDigits.slice(3) : rawDigits.startsWith('0') ? rawDigits.slice(1) : rawDigits
    const stripRegex = new RegExp(
      `[\\s,।|•-]*((?:phone|mobile|cell|contact|call|ফোন|নাম্বার|মোবাইল)[:\\s-]*)?(?:\\+?880|0)?${localNumber}[^\\n\\r]*$`,
      'i'
    )
    result.address = result.address.replace(stripRegex, '').trim()
  }

  // 4. NAME EXTRACTION
  const nameRegex = /(?:my\s*name\s*is|name\s*[:=-]|naam\s*[:=-]|নাম\s*[:=-])\s*([a-zA-Z\s\u0980-\u09FF]{2,30})/i
  const nameMatch = cleanText.match(nameRegex)
  if (nameMatch && nameMatch[1]) {
    const candidateName = nameMatch[1].trim()
    if (candidateName.length >= 2 && !candidateName.toLowerCase().startsWith('http')) {
      result.name = candidateName
    }
  }

  return result
}
