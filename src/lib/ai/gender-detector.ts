// ============================================================
// Bangladeshi & South Asian Name Gender Classifier & Addressing Engine
// Ensures 100% consistent, respectful addressing ("Bhaiya" vs "Apu")
// without ever switching between the two in the same conversation.
// ============================================================

export type CustomerGender = 'male' | 'female' | 'unknown'

// Words to strip before analyzing names (generic placeholders, phone artifacts, etc.)
const NON_NAME_PATTERNS = [
  /^messenger\s+user(?:\s*\(\d+\))?$/i,
  /^whatsapp\s+user$/i,
  /^user\s*\d*$/i,
  /^customer\s*\d*$/i,
  /^unknown$/i,
  /^\+?\d[\d\s-]{6,}$/, // raw phone numbers
  /^guest$/i,
  /^anonymous$/i,
]

// Common Female Name Tokens (Latin / English script)
const FEMALE_TOKENS = new Set([
  // Titles, prefixes & suffixes
  'akter', 'akhter', 'khatun', 'begum', 'sultana', 'parvin', 'pervin',
  'nesa', 'nessa', 'nahar', 'jahan', 'banu', 'bibi', 'miss', 'mrs',
  'mst', 'most', 'mosammat', 'mst.', 'most.', 'syeda',

  // Common Given Names
  'ayesha', 'aisha', 'fatema', 'fatima', 'nusrat', 'sanjida', 'jannat',
  'jannatul', 'mim', 'mimi', 'shampa', 'tanjina', 'tanzina', 'sadia', 'sadiya',
  'farhana', 'nabila', 'samia', 'riya', 'anika', 'maria', 'afsana', 'afia',
  'afroza', 'alifa', 'amina', 'ananya', 'arpita', 'asma', 'asmani', 'barna',
  'bushra', 'chaity', 'champa', 'dipa', 'dristy', 'fariha', 'farzana',
  'ferdousi', 'habiba', 'hafsa', 'hasna', 'humaira', 'iqra', 'ismat',
  'jasmin', 'jesmin', 'jinia', 'jui', 'kaniz', 'khadija', 'koli', 'laboni',
  'lamia', 'lipa', 'lubna', 'mahbuba', 'maliha', 'marina', 'marufa', 'meghla',
  'mithila', 'mou', 'mousumi', 'moumita', 'muntaha', 'nadia', 'naima',
  'nargis', 'nasima', 'nasrin', 'natasha', 'nipa', 'nishat', 'poly',
  'pooja', 'priti', 'priya', 'puja', 'rabeya', 'raisa', 'rajia', 'rakhi',
  'rashida', 'ratna', 'resma', 'reshma', 'rina', 'rokeya', 'rokshana',
  'roma', 'rubina', 'rumana', 'rupa', 'sabina', 'sabrina', 'safia',
  'sahana', 'saila', 'saima', 'salma', 'samina', 'samira', 'santona',
  'sara', 'sarmin', 'sayma', 'sema', 'setu', 'shabnam', 'shahana',
  'shahnaz', 'shahida', 'shaila', 'shakila', 'shanta', 'sharmin', 'shefali',
  'shelina', 'shikha', 'shirin', 'shorna', 'shova', 'shraboni', 'shuly',
  'simi', 'snigdha', 'sonia', 'suborna', 'suchitra', 'sukanya', 'sumaiya',
  'sumi', 'sumona', 'suraiya', 'susmita', 'swapna', 'tamanna', 'tanha',
  'tania', 'tanni', 'tanny', 'taslima', 'tasmia', 'tasnim', 'tasnuva',
  'tinni', 'toma', 'trisha', 'umme', 'urmi', 'zakia', 'zannat', 'zannatul',
  'zeba', 'zohra', 'eva', 'moni', 'shila', 'shimu', 'punom', 'purnima',
  'sriti', 'sonali', 'tuli', 'mithi', 'moon', 'tithi', 'antora', 'upoma',
])

// Common Female Name Tokens (Bengali script)
const FEMALE_TOKENS_BN = new Set([
  'আক্তার', 'আখতার', 'খাতুন', 'বেগম', 'সুলতানা', 'পারভীন', 'পারভিন',
  'নেসা', 'নেচ্ছা', 'নাহার', 'জাহান', 'বানু', 'বিবি', 'মিসেস', 'মিস',
  'মোসাম্মৎ', 'মোছাঃ', 'মোসাঃ', 'মোছাম্মৎ', 'সৈয়দা',
  'ফাতেমা', 'আয়েশা', 'নুসরাত', 'সানজিদা', 'জান্নাত', 'জান্নাতুল', 'মিম',
  'মিমি', 'শ্যাম্পা', 'শম্পা', 'তানজিনা', 'সাদিয়া', 'ফারহানা', 'নাবিলা',
  'সামিয়া', 'রিয়া', 'অনিকা', 'মারিয়া', 'আফসানা', 'সুমাইয়া', 'সুমি',
  'তানিয়া', 'শারমিন', 'সাবরিনা', 'সালমা', 'নাদিয়া', 'লামিয়া', 'তামান্না',
  'বৃষ্টি', 'পূজা', 'প্রিয়া', 'মৌসুমি', 'মৌ', 'রুমানা', 'সোনিয়া',
  'রেশমা', 'রিনা', 'রোকেয়া', 'লুবনা', 'লাবণী', 'মুনতাহা', 'তাসনিম', 'তাসলিমা',
  'হুমায়রা', 'হুমায়রা', 'স্মৃতি', 'তিথি', 'অন্তরা', 'মনি', 'মণি', 'মৌরিন',
])

// Common Male Name Tokens (Latin / English script)
const MALE_TOKENS = new Set([
  // Titles & Prefixes
  'md', 'mohammed', 'muhammad', 'mohammad', 'sheikh', 'kazi', 'syed', 'mir',
  'choudhury', 'chowdhury', 'khan', 'miah', 'sarker', 'talukder', 'sikder',
  'prince', 'babu', 'al-amin',

  // Common Given Names
  'ahmed', 'ahmad', 'hossain', 'hussain', 'hasan', 'hassan', 'ali', 'rahman',
  'islam', 'uddin', 'amin', 'rahim', 'karim', 'shakil', 'tanvir', 'rifat',
  'refat', 'riffat', 'rifath', 'rephat', 'riphat',
  'arif', 'faisal', 'fahim', 'ashik', 'sohel', 'imran', 'rakib', 'rana',
  'shuvo', 'sabbir', 'mehedi', 'mahfuz', 'mahbub', 'masud', 'momin', 'monir',
  'nahid', 'nayeem', 'nazmul', 'parvez', 'polash', 'rashed', 'rayhan',
  'reza', 'ripon', 'rubel', 'sagor', 'saiful', 'sajjad', 'salman', 'samir',
  'sarwar', 'sayed', 'shahid', 'shahin', 'shakib', 'shamim', 'shawon',
  'shimul', 'shanto', 'shohel', 'shourav', 'sohan', 'sourav', 'sujon',
  'sumon', 'tarek', 'tareq', 'tauhid', 'touhid', 'tushar', 'zahid', 'zaman',
  'zia', 'zubair', 'abir', 'adnan', 'afif', 'ahnaf', 'ajoy', 'akash',
  'alif', 'anando', 'ananto', 'anik', 'arnob', 'arman', 'asif', 'atik',
  'ayman', 'bappi', 'biplob', 'bijoy', 'bishal', 'emon', 'farhan', 'habib',
  'haider', 'hamid', 'harun', 'hasibul', 'hridoy', 'ibrahim', 'ifti',
  'ikbal', 'iqbal', 'ismail', 'jahid', 'jalal', 'jamal', 'jashim', 'jewel',
  'jibon', 'joy', 'kabir', 'kamal', 'kamrul', 'kawsar', 'khaled', 'khalil',
  'khokon', 'kiron', 'liton', 'mahmud', 'mamun', 'manik', 'maruf', 'milon',
  'mithun', 'moin', 'mostafa', 'munna', 'murad', 'mustafa', 'nabil', 'nadim',
  'nafis', 'nasim', 'noman', 'nur', 'palash', 'pranto', 'pritam', 'rabbi',
  'rafiq', 'raj', 'raju', 'rakibul', 'rasel', 'ratul', 'rejaul', 'ridoy',
  'riyad', 'robel', 'rofiq', 'roni', 'rony', 'sadik', 'safayet', 'sagir',
  'sahil', 'sajid', 'sakib', 'salim', 'samrat', 'santo', 'saquib', 'sayeed',
  'sayem', 'selim', 'shabbir', 'shafiq', 'shahadat', 'shahan', 'shahariar',
  'shahed', 'shahriar', 'shajahan', 'shamol', 'shams', 'shamsul', 'sharif',
  'shihab', 'shovon', 'siam', 'siraj', 'sohanur', 'subrata', 'sujoy',
  'sultan', 'tamim', 'tanmoy', 'taposh', 'tareque', 'tasnimul', 'tipu',
  'tutul', 'utpal', 'zahir', 'zakir', 'zishan', 'mithu', 'pavel', 'shuvo',
  'badhon', 'tuhin', 'ashraf', 'anwar', 'aslam', 'bipul', 'mizan', 'mukesh',
])

// Common Male Name Tokens (Bengali script)
const MALE_TOKENS_BN = new Set([
  'মোহাম্মদ', 'মুহাম্মদ', 'মোঃ', 'শেখ', 'কাজী', 'সৈয়দ', 'খান', 'চৌধুরী',
  'আহমেদ', 'হোসেন', 'হাসান', 'আলী', 'রহমান', 'ইসলাম', 'উদ্দিন', 'আমিন',
  'রহিম', 'করিম', 'শাকিল', 'তানভীর', 'তানভির', 'রিফাত', 'রেফাত', 'আরিফ', 'ফয়সাল',
  'ফাহিম', 'আশিক', 'সোহেল', 'ইমরান', 'রাকিব', 'মেহেদী', 'মেহেদি', 'মাহফুজ',
  'মাহবুব', 'মাসুদ', 'সাইফুল', 'সুমন', 'রুবেল', 'নাহিদ', 'নাঈম', 'রাসেল',
  'তুহিন', 'সাগর', 'আকাশ', 'হৃদয়', 'হৃদয়', 'জয়', 'জয়', 'শুভ', 'মারুফ',
  'রাব্বি', 'তারেক', 'জাহিদ', 'জামান', 'সাকিব', 'শাকিব', 'শামীম', 'শাওন',
  'সৌরভ', 'সোহান', 'সুজন', 'ফারহান', 'আসিফ', 'আবির', 'আদনান', 'অনিক',
  'ইব্রাহিম', 'হাবিব', 'কামাল', 'মামুন', 'মানিক', 'মিলন', 'মুন্না', 'নাদিম',
  'নাফিস', 'সিয়াম', 'তামিম', 'রাতুল', 'রিয়াদ', 'রনি', 'সাঈদ', 'শান্ত',
])

/**
 * Strips phone numbers, system prefixes, and placeholder noise from a name.
 */
export function cleanCustomerName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== 'string') return ''
  const trimmed = rawName.trim()
  for (const pattern of NON_NAME_PATTERNS) {
    if (pattern.test(trimmed)) return ''
  }
  return trimmed
}

/**
 * Determines whether a customer name is predominantly male, female, or unknown.
 */
export function detectGenderFromName(rawName?: string | null): CustomerGender {
  const name = cleanCustomerName(rawName)
  if (!name) return 'unknown'

  // Tokenize by spaces, dots, dashes, commas
  const tokens = name
    .toLowerCase()
    .replace(/[.,\-_/\\()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  if (tokens.length === 0) return 'unknown'

  let femaleScore = 0
  let maleScore = 0

  for (const token of tokens) {
    if (FEMALE_TOKENS.has(token) || FEMALE_TOKENS_BN.has(token)) {
      femaleScore += 2
    }
    if (MALE_TOKENS.has(token) || MALE_TOKENS_BN.has(token)) {
      maleScore += 2
    }
  }

  // Strong prefix overrides
  const first = tokens[0]
  if (first === 'md' || first === 'mohammed' || first === 'muhammad' || first === 'mohammad' || first === 'মোঃ') {
    maleScore += 3
  }
  if (first === 'mst' || first === 'most' || first === 'mosammat' || first === 'মোসাম্মৎ' || first === 'মোছাঃ' || first === 'মিসেস') {
    femaleScore += 3
  }

  // Common suffix overrides (e.g. "Akter", "Khatun", "Begum" at the end strongly indicates female)
  const last = tokens[tokens.length - 1]
  if (last === 'akter' || last === 'khatun' || last === 'begum' || last === 'sultana' || last === 'আক্তার' || last === 'খাতুন' || last === 'বেগম') {
    femaleScore += 3
  }

  if (femaleScore > maleScore && femaleScore >= 2) return 'female'
  if (maleScore > femaleScore && maleScore >= 2) return 'male'

  return 'unknown'
}

/**
 * Scans previous conversation messages to see if customer identified their gender
 * or if customer provided their name in past conversation history.
 */
export function detectGenderFromHistory(historyText?: string | null): CustomerGender {
  if (!historyText || typeof historyText !== 'string') return 'unknown'

  const lower = historyText.toLowerCase()

  // 1. Direct customer self-identification
  if (/\b(?:ami\s+(?:ekta\s+)?chele|i\s+am\s+(?:a\s+)?(?:boy|man|male)|ami\s+bhaiya)\b/i.test(lower)) {
    return 'male'
  }
  if (/\b(?:ami\s+(?:ekta\s+)?meye|i\s+am\s+(?:a\s+)?(?:girl|woman|female)|ami\s+apu)\b/i.test(lower)) {
    return 'female'
  }

  // 2. Check if a male or female name token is present in the customer's text in history
  // e.g. Customer stated: "Rifat\n017..." or "Name: Rifat" or "amar naam rifat"
  const nameMatch = lower.match(/(?:(?:name|naam|na+m|নাম)\s*[:=-]?\s*|^)([a-zA-Z\u0980-\u09FF]{2,30})/im)
  if (nameMatch && nameMatch[1]) {
    const candidateGender = detectGenderFromName(nameMatch[1])
    if (candidateGender !== 'unknown') {
      return candidateGender
    }
  }

  // 3. Prior addressings (only as secondary hint, NEVER override verified name)
  const bhaiyaMatches = (lower.match(/\b(?:bhaiya|bhaia|vaiya|vaia)\b/g) || []).length +
    (lower.match(/(?:ভাইয়া|ভাইয়া)/g) || []).length
  const apuMatches = (lower.match(/\b(?:apu|apuu|appu)\b/g) || []).length +
    (lower.match(/(?:আপু|আফু)/g) || []).length

  if (bhaiyaMatches > 0 && apuMatches === 0) return 'male'
  if (apuMatches > 0 && bhaiyaMatches === 0) return 'female'

  if (bhaiyaMatches > apuMatches) return 'male'
  if (apuMatches > bhaiyaMatches) return 'female'

  return 'unknown'
}

export interface ResolvedAddressing {
  customerName: string
  gender: CustomerGender
  addressingTitle: 'bhaiya' | 'apu' | 'neutral'
  promptInstruction: string
}

/**
 * Resolves the final authoritative gender and addressing instruction for the AI router.
 */
export function resolveCustomerAddressing({
  rawCustomerName,
  historyText,
  customerRelationStyle = 'bhaiya_apu',
}: {
  rawCustomerName?: string | null
  historyText?: string | null
  customerRelationStyle?: string
}): ResolvedAddressing {
  const cleanName = cleanCustomerName(rawCustomerName)

  // 1. Check customer's verified name (Absolute priority)
  let gender: CustomerGender = detectGenderFromName(cleanName)

  // 2. If name is unknown/unisex/missing, check prior conversation history
  if (gender === 'unknown' && historyText) {
    gender = detectGenderFromHistory(historyText)
  }

  // 3. Fallback: If conversation style is NOT bhaiya_apu, handle appropriately
  if (customerRelationStyle === 'sir_madam') {
    return {
      customerName: cleanName,
      gender,
      addressingTitle: 'neutral',
      promptInstruction: 'Address the customer formally as "Sir" or "Madam" (or polite "আপনি" in Bengali).',
    }
  }

  if (customerRelationStyle === 'casual') {
    return {
      customerName: cleanName,
      gender,
      addressingTitle: 'neutral',
      promptInstruction: cleanName
        ? `Maintain a warm, polite conversation. You may address them by their first name "${cleanName.split(' ')[0]}" or respectful "আপনি".`
        : 'Maintain a warm, polite conversation using respectful "আপনি".',
    }
  }

  // customerRelationStyle is 'bhaiya_apu' (Default for Bangladesh e-commerce)
  if (gender === 'male') {
    return {
      customerName: cleanName,
      gender: 'male',
      addressingTitle: 'bhaiya',
      promptInstruction: `VERIFIED CUSTOMER GENDER: MALE (Bhaiya / ভাইয়া).
Customer Name: ${cleanName ? `"${cleanName}"` : 'Male Customer'}
MANDATORY ADDRESSING RULE:
1. You MUST address this customer strictly as "Bhaiya" (ভাইয়া in Bengali, "Bhaiya" in Banglish/English).
2. ZERO TOLERANCE: NEVER call this customer "Apu" / "Appu" (আপু) under ANY circumstances!
3. Do NOT assume the customer is female just because they inquire about creams, makeup, or skincare products. Men in Bangladesh also buy skincare!`,
    }
  }

  if (gender === 'female') {
    return {
      customerName: cleanName,
      gender: 'female',
      addressingTitle: 'apu',
      promptInstruction: `VERIFIED CUSTOMER GENDER: FEMALE (Apu / আপু).
Customer Name: ${cleanName ? `"${cleanName}"` : 'Female Customer'}
MANDATORY ADDRESSING RULE:
1. You MUST address this customer strictly as "Apu" (আপু in Bengali, "Apu" in Banglish/English).
2. ZERO TOLERANCE: NEVER call this customer "Bhaiya" (ভাইয়া) under ANY circumstances!`,
    }
  }

  // Gender is UNKNOWN: neither name nor history gave a definitive male/female signal
  return {
    customerName: cleanName,
    gender: 'unknown',
    addressingTitle: 'neutral',
    promptInstruction: `CUSTOMER GENDER STATUS: UNCONFIRMED / UNKNOWN.
Customer Name: ${cleanName ? `"${cleanName}"` : 'Customer'}
CRITICAL MANDATORY GENDER NEUTRALITY RULE:
1. Since the customer's gender is NOT verified, you are STRICTLY FORBIDDEN from guessing or addressing them as "Apu", "Appu", "আপু", or "Bhaiya", "ভাইয়া"!
2. You MUST use respectful gender-neutral language:
   - Bengali: Use polite "আপনি", "ধন্যবাদ", or "প্রিয় গ্রাহক" without brother/sister labels.
   - Banglish: Use "Hello!", "Apni", "Dhonnobad".
   - English: Use "Hello!", "Thank you".
3. NEVER assume a customer is female just because the shop sells skincare, cosmetics, or clothing.`,
  }
}

/**
 * Post-processes the generated AI reply text to guarantee gender consistency.
 * Prevents accidental hallucinations where the model says "Apu" to a male customer
 * or "Bhaiya" to a female customer, or uses gendered greetings when gender is unknown.
 */
export function enforceGenderAddressingConsistency(
  replyText: string,
  targetGender: CustomerGender
): string {
  if (!replyText || typeof replyText !== 'string') return replyText

  let result = replyText

  if (targetGender === 'male') {
    // Replace any accidental "আপু" / "আফু" with "ভাইয়া" (Bengali script)
    result = result.replace(/([,\s।\u0964]|^)(?:আপু|আফু)([!?.,।\s\u0964]|$)/g, '$1ভাইয়া$2')
    result = result.replace(/([,\s।\u0964]|^)(?:আপুর|আফুর)([!?.,।\s\u0964]|$)/g, '$1ভাইয়ার$2')
    result = result.replace(/([,\s।\u0964]|^)(?:আপুকে|আফুকে)([!?.,।\s\u0964]|$)/g, '$1ভাইয়াকে$2')
    result = result.replace(/([,\s।\u0964]|^)(?:আপুরা|আফুরা)([!?.,।\s\u0964]|$)/g, '$1ভাইয়ারা$2')

    // Replace any accidental "Apu" / "Appu" with "Bhaiya" (Latin script / Banglish)
    result = result.replace(/\b(?:Apu|Appu|Apuu)\b/g, 'Bhaiya')
    result = result.replace(/\b(?:apu|appu|apuu)\b/g, 'bhaiya')
    result = result.replace(/\b(?:Apura|Appura)\b/g, 'Bhaiyara')
    result = result.replace(/\b(?:apura|appura)\b/g, 'bhaiyara')
    result = result.replace(/\b(?:apuke|appuke)\b/g, 'bhaiyake')
    result = result.replace(/\b(?:Apuke|Appuke)\b/g, 'Bhaiyake')
    result = result.replace(/\b(?:apur|appur)\b/g, 'bhaiyar')
    result = result.replace(/\b(?:Apur|Appur)\b/g, 'Bhaiyar')
  } else if (targetGender === 'female') {
    // Replace any accidental "ভাইয়া" / "ভাইয়া" with "আপু" (Bengali script)
    result = result.replace(/([,\s।\u0964]|^)(?:ভাইয়া|ভাইয়া)([!?.,।\s\u0964]|$)/g, '$1আপু$2')
    result = result.replace(/([,\s।\u0964]|^)(?:ভাইয়ার|ভাইয়ার)([!?.,।\s\u0964]|$)/g, '$1আপুর$2')
    result = result.replace(/([,\s।\u0964]|^)(?:ভাইয়াকে|ভাইয়াকে)([!?.,\s\u0964]|$)/g, '$1আপুকে$2')
    result = result.replace(/([,\s।\u0964]|^)(?:ভাইয়ারা|ভাইয়ারা)([!?.,\s\u0964]|$)/g, '$1আপুরা$2')

    // Replace any accidental "Bhaiya" with "Apu" (Latin script / Banglish)
    result = result.replace(/\b(?:Bhaiya|Bhaia|Vaiya|Vaia)\b/g, 'Apu')
    result = result.replace(/\b(?:bhaiya|bhaia|vaiya|vaia)\b/g, 'apu')
    result = result.replace(/\b(?:bhaiyake|vaiyake)\b/g, 'apuke')
    result = result.replace(/\b(?:Bhaiyake|Vaiyake)\b/g, 'Apuke')
    result = result.replace(/\b(?:bhaiyar|vaiyar)\b/g, 'apur')
    result = result.replace(/\b(?:Bhaiyar|Vaiyar)\b/g, 'Apur')
  } else if (targetGender === 'unknown') {
    // Gender is unconfirmed: Strip out all hallucinated "Apu" / "Bhaiya" greetings
    // Latin / Banglish greetings: "Hello Apu!", "Hello Appu!", "Hello Bhaiya!" -> "Hello!"
    result = result.replace(/\b(?:Hello|Hi|Hey)\s+(?:Apu|Appu|Apuu|Bhaiya|Bhaia|Vaiya|Vaia)[!.,]?/gi, (match) => {
      const firstWord = match.split(/\s+/)[0]
      return `${firstWord}!`
    })
    // "Ji Apu,", "Ji Bhaiya," -> "Ji,"
    result = result.replace(/\b(?:Ji|Ji\s+na)\s+(?:Apu|Appu|Apuu|Bhaiya|Bhaia|Vaiya|Vaia)[,.]?/gi, (match) => {
      const firstWord = match.split(/\s+/)[0]
      return `${firstWord},`
    })
    // Bengali script greetings: "হ্যালো আপু!", "হ্যালো ভাইয়া!" -> "হ্যালো!"
    result = result.replace(/(?:হ্যালো|হাই)\s*(?:আপু|আফু|ভাইয়া|ভাইয়া)[!।]?/g, 'হ্যালো!')
    result = result.replace(/(?:জি)\s*(?:আপু|আফু|ভাইয়া|ভাইয়া)[,।]?/g, 'জি,')
    result = result.replace(/(?:ধন্যবাদ)\s*(?:আপু|আফু|ভাইয়া|ভাইয়া)[!।]?/g, 'ধন্যবাদ!')

    // Strip standalone occurrences: e.g. "kemon achen, apu?" -> "kemon achen?"
    result = result.replace(/([,\s।\u0964]|^)(?:আপু|আফু|ভাইয়া|ভাইয়া)([!?.,।\s\u0964]|$)/g, '$1$2')
    result = result.replace(/\b(?:Apu|Appu|Apuu|Bhaiya|Bhaia|Vaiya|Vaia)\b[,\s]*/gi, '')

    // Clean up residual double spaces and hanging punctuation
    result = result.replace(/\s{2,}/g, ' ').replace(/\s+([!?,.।])/g, '$1').trim()
  }

  return result
}
