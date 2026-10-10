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

  // Helper to reject bot prompt instructions or questions
  const isTemplateInstruction = (str: string) => {
    if (!str) return false
    const s = str.toLowerCase().trim()
    if (s.endsWith('?')) return true
    if (/\b(?:পূর্ণাঙ্গ\s*ডেলিভারি\s*ঠিকানা|বাসা\/রোড|থানা,\s*জেলা|basha\/road|thana,\s*district|share\s*your|could\s*you\s*please|to\s*complete\s*your|অনুগ্রহ\s*করে|জানিয়ে\s*দিন|বুকিংয়ের\s*জন্য|পাঠিয়ে\s*দিচ্ছি|প্রস্তুত\s*করছি|যেকোনো\s*প্রয়োজনে|কুরিয়ার\s*সার্ভিস|delivery\s*package)\b/i.test(s)) return true
    return false
  }

  // 3. ADDRESS EXTRACTION
  // Look for explicit prefix: Address: ..., Adreess: ..., Adress: ..., Addres: ..., Thikana: ..., ঠিকানায়: ..., Delivery address: ...
  const explicitAddressRegex =
    /(?:(?:delivery\s*add?r?e{1,3}a?s{1,3}|shipping\s*add?r?e{1,3}a?s{1,3}|home\s*add?r?e{1,3}a?s{1,3}|add?r?e{1,3}a?s{1,3}|thikana|ঠিকানা|বাসা|বাসার\s*ঠিকানা|লোকেশন|location)\s*[:=-]\s*)([^\n\r]+)/i
  const explicitMatch = cleanText.match(explicitAddressRegex)
  if (explicitMatch && explicitMatch[1]) {
    const addr = explicitMatch[1].trim()
    if (addr.length >= 5 && !isTemplateInstruction(addr)) {
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
      if (isTemplateInstruction(trimmedLine)) continue
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
      .replace(/^(?:(?:delivery\s*|shipping\s*|home\s*)?add?r?e{1,3}a?s{1,3}|thikana|ঠিকানা|বাসার\s*ঠিকানা|বাসা|লোকেশন|location)\s*[:=-]\s*/i, '')
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
      .replace(/[\s,।|•-]*((?:phone|mobile|cell|contact|call|phn|mob|ph|num(?:ber)?|ফোন|নাম্বার|মোবাইল)[:\\s-]*)$/i, '')
      .replace(/[,\s.]+$/, '')
      .trim()
  }

  // 4. NAME EXTRACTION
  const namePrefixRegex =
    /(?:(?:my\s*name\s*is|amar\s*na+m\s*(?:hoche|holo|is)?|(?:ami|আমি)\s+|(?:full\s*name|delivery\s*name|customer\s*name|recipient(?:\s*name)?|receiver(?:\s*name)?|name|naam|na+m|নাম|কাস্টমার\s*নাম|প্রাপক(?:\s*নাম)?)\s*(?:is|holo|hoche|hobe|:|=|-)?)\s*)([a-zA-Z.\s\u0980-\u09FF]{2,35})/i
  const nameSuffixRegex = /^([a-zA-Z.\s\u0980-\u09FF]{2,35})\s+(?:is\s*(?:the|my)?\s*(?:full\s*)?name|amar\s*na+m|hoche\s*amar\s*na+m|holo\s*amar\s*na+m)/i

  const prefixMatch = cleanText.match(namePrefixRegex)
  const suffixMatch = cleanText.match(nameSuffixRegex)
  const candidate = prefixMatch?.[1] || suffixMatch?.[1]

  const INVALID_NAME_WORDS = /^(?:address|phone|email|cod|bkash|nagad|rocket|order|product|price|taka|dam|koto|delivery|cash|yes|no|ok|haan|ji|for|the|to|in|at|of|package|parcel|delivery\s*package|sir|madam|bhaiya|apu)$/i

  if (candidate) {
    const candidateName = candidate.replace(/[\n\r,।|•].*$/, '').trim()
    if (
      candidateName.length >= 2 &&
      !candidateName.toLowerCase().startsWith('http') &&
      !INVALID_NAME_WORDS.test(candidateName) &&
      !isTemplateInstruction(candidateName) &&
      !/^(?:for|to|in|at|of|the|a|an|with|by|from|about)\s+/i.test(candidateName) &&
      !/\b(?:delivery\s*package|package|parcel|share|please|address|phone|email|method|product|item|korte|chai|lagbe|kinbo)\b/i.test(candidateName)
    ) {
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
        !isTemplateInstruction(firstLine) &&
        !/^(?:for|to|in|at|of|the|a|an|with|by|from|about)\s+/i.test(firstLine) &&
        !/\b(?:order|cream|product|canva|price|taka|dam|koto|hi|hello|assalamu|delivery|address|phone|email|cod|bkash|nagad|rocket|package|parcel|share|please)\b/i.test(firstLine) &&
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
        !isTemplateInstruction(singleLine) &&
        !/^(?:for|to|in|at|of|the|a|an|with|by|from|about)\s+/i.test(singleLine) &&
        !/\b(?:order|cream|product|canva|price|taka|dam|koto|hi|hello|assalamu|delivery|address|phone|email|cod|bkash|nagad|rocket|yes|no|ok|package|parcel|share|please)\b/i.test(singleLine) &&
        /^[a-zA-Z.\s\u0980-\u09FF]+$/.test(singleLine)
      ) {
        result.name = singleLine
      }
    }
  }

  return result
}

/**
 * Strict validator for delivery addresses in Bangladesh.
 * Courier companies (Steadfast, Pathao, RedX, eCourier) strictly require detailed delivery addresses
 * including house/road/holding/block/sector/flat/village details, not just bare area/city names like "Mirpur 14".
 */
export function isDetailedDeliveryAddress(address?: string | null): boolean {
  if (!address || typeof address !== 'string') return false
  const trimmed = address.trim()
  if (trimmed.length < 14) return false

  // Reject bot instructions / questions
  if (trimmed.endsWith('?')) return false
  if (/\b(?:পূর্ণাঙ্গ\s*ডেলিভারি\s*ঠিকানা|বাসা\/রোড|থানা,\s*জেলা|basha\/road|thana,\s*district|share\s*your|could\s*you\s*please)\b/i.test(trimmed)) return false

  // Check for structural location markers (House, Road, Holding, Flat, Block, Sector, Lane, Village, etc.)
  const hasStructuralKeyword =
    /\b(?:house|home|basha|bari|holding|road|rd|flat|floor|block|sector|sec|lane|goli|para|colony|moholla|bazar|market|gram|village|mor|more|mosque|masjid|school|college|plaza|tower|building)\b/i.test(trimmed) ||
    /(?:বাসা|বাড়ি|বাড়ি|রোড|রাস্তা|হোল্ডিং|ফ্ল্যাট|ব্লক|সেক্টর|লেন|গলি|পাড়া|পাড়া|গ্রাম|মহল্লা|বাজার|মোড়|মোড়|মসজিদ|স্কুল|কলেজ|প্লাজা|টাওয়ার|টাওয়ার|ভবন)/.test(trimmed) ||
    /\b(?:h|rd|sec|house|road|flat|holding|basha|bari|block|sector|lane)\s*#?\s*\d+/i.test(trimmed) ||
    /\d+\s*[\/,-]\s*\d+/.test(trimmed) // e.g. 12/A, 4-B, 15/2

  // Standalone area or city names without house/road (e.g. "Mirpur 14", "Dhanmondi, Dhaka")
  const isBareAreaOrCity =
    /^(?:(?:mirpur|dhanmondi|uttara|gulshan|banani|mohammadpur|badda|rampura|malibagh|motijheel|farmgate|jatrabari|bashundhara|khilgaon|chittagong|chattogram|sylhet|rajshahi|khulna|barisal|rangpur|comilla|cumilla|gazipur|narayanganj|savar)(?:\s*(?:-\s*)?\d{1,2})?(?:[,\s]+(?:dhaka|bd|bangladesh|city|জেলা|ঢাকা))?)$/i.test(trimmed) ||
    /^(?:(?:মিরপুর|ধানমন্ডি|উত্তরা|গুলশান|বনানী|মোহাম্মদপুর|বাড্ডা|রামপুরা|মালিবাগ|মতিঝিল|ফার্মগেট|যাত্রাবাড়ী|যাত্রাবাড়ী|বসুন্ধরা|খিলগাঁও|চট্টগ্রাম|সিলেট|রাজশাহী|খুলনা|বরিশাল|রংপুর|কুমিল্লা|গাজীপুর|নারায়ণগঞ্জ|সাভার)(?:\s*(?:-\s*)?[০-৯\d]{1,2})?(?:[,\s]+(?:ঢাকা|বাংলাদেশ))?)$/i.test(trimmed)

  if (isBareAreaOrCity && !hasStructuralKeyword) {
    return false
  }

  // Must have at least 3 words unless structural indicators are present
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount < 3 && !hasStructuralKeyword) {
    return false
  }

  return hasStructuralKeyword || (wordCount >= 4 && trimmed.length >= 22)
}

/**
 * Checks whether an address is inside Dhaka metropolitan / city area.
 */
export function isInsideDhakaAddress(address?: string | null): boolean {
  if (!address || typeof address !== 'string') return true // Default inside Dhaka if not specified
  const lower = address.toLowerCase()

  // Strong outside Dhaka districts
  const outsideDistricts = [
    'chittagong', 'chattogram', 'sylhet', 'rajshahi', 'khulna', 'barisal', 'barishal',
    'rangpur', 'mymensingh', 'cumilla', 'comilla', 'bogra', 'bogura', "cox's bazar",
    'coxs bazar', 'jessore', 'jashore', 'kushtia', 'dinajpur', 'tangail', 'pabna',
    'jamalpur', 'feni', 'noakhali', 'brahmanbaria', 'faridpur', 'gazipur', 'narayanganj',
    'narsingdi', 'manikganj', 'munshiganj', 'sirajganj', 'natore', 'naogaon', 'chapainawabganj',
    'satkhira', 'bagerhat', 'chuadanga', 'meherpur', 'jhenaidah', 'magura', 'narail',
    'patuakhali', 'bhola', 'pirojpur', 'barguna', 'jhalokati', 'sunamganj', 'habiganj',
    'moulvibazar', 'netrokona', 'sherpur', 'kishoreganj', 'kurigram', 'lalmonirhat',
    'gaibandha', 'nilphamari', 'panchagarh', 'thakurgaon', 'lakshmipur', 'chandpur',
    'rangamati', 'bandarban', 'khagrachhari',
    'চট্টগ্রাম', 'সিলেট', 'রাজশাহী', 'খুলনা', 'বরিশাল', 'রংপুর', 'ময়মনসিংহ', 'কুমিল্লা',
    'বগুড়া', 'কক্সবাজার', 'যশোর', 'কুষ্টিয়া', 'দিনাজপুর', 'টাঙ্গাইল', 'পাবনা', 'জামালপুর',
    'ফেনী', 'নোয়াখালী', 'ব্রাহ্মণবাড়িয়া', 'ফরিদপুর', 'গাজীপুর', 'নারায়ণগঞ্জ', 'নরসিংদী',
    'মানিকগঞ্জ', 'মুন্সীগঞ্জ', 'সিরাজগঞ্জ', 'নাটোর', 'নওগাঁ', 'চাঁপাইনবাবগঞ্জ', 'সাতক্ষীরা',
    'বাগেরহাট', 'চুয়াডাঙ্গা', 'মেহেরপুর', 'ঝিনাইদহ', 'মাগুরা', 'নড়াইল', 'পটুয়াখালী',
    'ভোলা', 'পিরোজপুর', 'বরগুনা', 'ঝালকাঠি', 'সুনামগঞ্জ', 'হবিগঞ্জ', 'মৌলভীবাজার',
    'নেত্রকোণা', 'শেরপুর', 'কিশোরগঞ্জ', 'কুড়িগ্রাম', 'লালমনিরহাট', 'গাইবান্ধা', 'নীলফামারী',
    'পঞ্চগড়', 'ঠাকুরগাঁও', 'লক্ষ্মীপুর', 'চাঁদপুর', 'রাঙ্গামাটি', 'বান্দরবান', 'খাগড়াছড়ি'
  ]

  const hasOutsideDistrict = outsideDistricts.some((d) => lower.includes(d))
  const mentionsDhakaExplicitly = /\b(?:dhaka|ঢাকা)\b/i.test(lower)

  if (hasOutsideDistrict && !mentionsDhakaExplicitly) {
    return false
  }

  const dhakaCityKeywords = [
    'dhaka', 'mirpur', 'uttara', 'dhanmondi', 'gulshan', 'banani', 'mohammadpur',
    'badda', 'rampura', 'malibagh', 'motijheel', 'jatrabari', 'khilgaon', 'farmgate',
    'bashundhara', 'cantonment', 'wari', 'lalbagh', 'tejgaon', 'shahbagh',
    'mohakhali', 'nikunja', 'baridhara', 'keraniganj', 'savar', 'dhamrai', 'pallabi',
    'kafrul', 'bimanbandar', 'khilkhet', 'adabor', 'shyamoli', 'kolabagan', 'new market',
    'hazaribagh', 'kamrangirchar', 'chawkbazar', 'sutrapur', 'kotwali', 'gandaria',
    'demra', 'kadamtali', 'mugda', 'sabujbagh', 'ramna', 'paltan', 'hatirjheel',
    'ঢাকা', 'মিরপুর', 'উত্তরা', 'ধানমন্ডি', 'গুলশান', 'বনানী', 'মোহাম্মদপুর',
    'বাড্ডা', 'রামপুরা', 'মালিবাগ', 'মতিঝিল', 'যাত্রাবাড়ী', 'যাত্রাবাড়ী', 'খিলগাঁও',
    'ফার্মগেট', 'বসুন্ধরা', 'ওয়ারী', 'ওয়ারী', 'লালবাগ', 'তেজগাঁও', 'শাহবাগ', 'মহাখালী',
    'নিকুঞ্জ', 'বারিধারা', 'কেরানীগঞ্জ', 'পল্লবী', 'কাফরুল', 'খিলক্ষেত', 'আদাবর',
    'শ্যামলী', 'কলাবাগান', 'নিউ মার্কেট', 'হাজারীবাগ', 'কামরাঙ্গীরচর', 'চকবাজার',
    'সূত্রাপুর', 'কোতোয়ালি', 'গেন্ডারিয়া', 'ডেমরা', 'কদমতলী', 'মুগদা', 'সবুজবাগ',
    'রমনা', 'পল্টন', 'হাতিরঝিল'
  ]

  if (dhakaCityKeywords.some((kw) => lower.includes(kw))) {
    return true
  }

  // If outside district was mentioned, return false
  if (hasOutsideDistrict) {
    return false
  }

  // Default fallback for ambiguous local addresses
  return true
}

/**
 * Calculates delivery fee based on customer address and account delivery policy.
 */
export function resolveDeliveryCharge({
  address,
  policyString,
  isDigital = false,
  isFree = false,
  explicitDeliveryCharge,
}: {
  address?: string | null
  policyString?: string | null
  isDigital?: boolean
  isFree?: boolean
  explicitDeliveryCharge?: number | null
}): {
  deliveryCharge: number
  isInsideDhaka: boolean
} {
  if (isDigital || isFree) {
    return { deliveryCharge: 0, isInsideDhaka: true }
  }

  const isInside = isInsideDhakaAddress(address)

  if (explicitDeliveryCharge != null && explicitDeliveryCharge > 0) {
    return { deliveryCharge: explicitDeliveryCharge, isInsideDhaka: isInside }
  }

  const policy = (policyString || '').toLowerCase()

  if (isInside) {
    const match = policy.match(/(?:inside\s*dhaka|ঢাকার\s*ভিতরে)[\s\w:৳tk]*?([0-9]{2,3})/i)
    const charge = match ? parseInt(match[1], 10) : 70
    return { deliveryCharge: charge, isInsideDhaka: true }
  } else {
    const match = policy.match(/(?:outside\s*dhaka|ঢাকার\s*বাইরে)[\s\w:৳tk]*?([0-9]{2,3})/i)
    const charge = match ? parseInt(match[1], 10) : 130
    return { deliveryCharge: charge, isInsideDhaka: false }
  }
}

