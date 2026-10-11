// ============================================================
// Bangladeshi Banglish Spelling Normalizer & Guidelines Engine
// Standardizes phonetic Banglish spelling across LLM outputs,
// offline replies, and auto-responders to ensure clean, natural,
// and typo-free Bangladeshi e-commerce communication.
// ============================================================

/**
 * Strict system prompt guidance injected into LLM system prompts
 * whenever detected language is 'banglish'.
 */
export const BANGLISH_SYSTEM_PROMPT_GUIDELINES = `STRICT REQUIREMENT: The customer is communicating in Banglish. You MUST reply in natural, authentic Bangladeshi Banglish (spoken Bengali written in the Latin/English alphabet).

BANGLISH SPELLING & GRAMMAR DICTIONARY (FOLLOW STRICTLY):
1. Pronouns & Addressing:
   - ALWAYS use: "Apni", "apnar", "apnake", "amader", "ami".
   - NEVER use distorted spellings like "aponar", "aponake", "apnr", "amk".
   - NEVER use Hindi words like "aap", "apka", "apki", "hum".
   - Address verified male customers as "Bhaiya", female customers as "Apu" (never "Bhaia" or "Vaiya").
2. Question Words:
   - ALWAYS use: "Koto", "kivabe", "kothay", "keno", "kobe", "konta".
   - NEVER use "kitna", "kaise", "kibhabe", "ki vabe", "kibahe".
3. Vocabulary & Common Words:
   - Price: "dam" (e.g. "product er dam ৳850")
   - Address: "thikana" or "delivery address" (NEVER "thikna", "tikana", or Hindi "pata")
   - Thanks: "Dhonnobad" (NEVER "Dhanyawad", "Dhanyabad", or "Shukriya")
   - Stock: "Stock e ache" / "Stock e nei"
   - All / Everything: "shob" / "shobgulo" (NEVER "sob")
   - Time: "shomoy" (e.g. "ektu shomoy din")
   - Help: "shahajjo" (e.g. "shahajjo korte pari")
   - Good / Best: "bhalo" (e.g. "darun ba bhalo kaaj korbe")
   - Definitely: "Oboshshoi" (e.g. "Ji oboshshoi!")
   - Problem: "somossya"
   - Complete / Full: "shompurno" (e.g. "shompurno free")
   - Expired / Already: "meyad iti moddhe sesh hoye geche" (NEVER "meyadh itomoddhe")
   - Future: "bhobisshote" (NEVER "bhabisshote")
   - Contact: "jogajog"
4. Verbs & Conjugations:
   - When speaking as assistant (ami/amra): "janacchi" (e.g. "ami ekhoni janacchi!"), "bolchi", "korchi", "dite parbo", "pathiye dibo".
   - When asking customer (apni): "janaben" (e.g. "kindly janaben please"), "nite paren", "bolben", "korben".
   - NEVER confuse 1st person with 3rd person: Say "Ami janacchi", NEVER "Ami janacche"!
5. ZERO TOLERANCE ON HINDI / URDU WORDS:
   - Prohibited words: "aap", "apka", "hai", "hain", "kripya", "nahi", "nahin", "kijiye", "chahiye", "kitna", "shukriya", "madad", "aur".
   - Replace completely with standard Bengali Banglish.
6. FORMAT:
   - Keep replies short, warm, and natural: strictly 2-3 sentences max.
   - Use '৳' or 'Tk' for currency (e.g. "৳850").
   - NEVER output Arabic script, Urdu, or Hindi characters.
   - EXCEPTION FOR ORDER INVOICE: When all order details are collected and you provide the final complete order confirmation summary, format that official summary section in clean Bangla script (বাংলা লিপি), as Bangladeshi customers expect their official invoice in Bangla.`

/**
 * Case-preserving replacement helper.
 * If target in source text was Uppercase, return replacement in Uppercase.
 * If Titlecase, return replacement in Titlecase.
 * Otherwise lowercase.
 */
function preserveCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase()
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase()
  }
  return replacement.toLowerCase()
}

/**
 * High-precision dictionary of Banglish spelling corrections.
 * Maps misspelled or unidiomatic tokens to their standard Banglish equivalent.
 */
const BANGLISH_WORD_REPLACEMENTS: Array<{ regex: RegExp; replaceWith: string }> = [
  // --- Pronouns & Address ---
  { regex: /\baponar\b/gi, replaceWith: 'apnar' },
  { regex: /\baponake\b/gi, replaceWith: 'apnake' },
  { regex: /\baponader\b/gi, replaceWith: 'apnader' },
  { regex: /\bapnr\b/gi, replaceWith: 'apnar' },
  { regex: /\bapnk\b/gi, replaceWith: 'apnake' },
  { regex: /\bamk\b/gi, replaceWith: 'amake' },
  { regex: /\bamke\b/gi, replaceWith: 'amake' },
  { regex: /\bamaake\b/gi, replaceWith: 'amake' },
  { regex: /\bamaderke\b/gi, replaceWith: 'amader' },
  { regex: /\bvaiya\b/gi, replaceWith: 'bhaiya' },
  { regex: /\bvaia\b/gi, replaceWith: 'bhaiya' },
  { regex: /\bbhaia\b/gi, replaceWith: 'bhaiya' },
  { regex: /\bbhaiyya\b/gi, replaceWith: 'bhaiya' },
  { regex: /\bappu\b/gi, replaceWith: 'apu' },
  { regex: /\bapuu\b/gi, replaceWith: 'apu' },

  // --- Question words & connectives ---
  { regex: /\bkibhabe\b/gi, replaceWith: 'kivabe' },
  { regex: /\bki\s+vabe\b/gi, replaceWith: 'kivabe' },
  { regex: /\bkibahe\b/gi, replaceWith: 'kivabe' },
  { regex: /\bkebhabe\b/gi, replaceWith: 'kivabe' },
  { regex: /\bkothai\b/gi, replaceWith: 'kothay' },
  { regex: /\bkonta\b/gi, replaceWith: 'konta' },

  // --- Common Vocabulary & Spellings ---
  { regex: /\bmeyadh\b/gi, replaceWith: 'meyad' },
  { regex: /\bmiyad\b/gi, replaceWith: 'meyad' },
  { regex: /\bmeyadhe\b/gi, replaceWith: 'meyade' },
  { regex: /\bitomoddhe\b/gi, replaceWith: 'iti moddhe' },
  { regex: /\bitimodhye\b/gi, replaceWith: 'iti moddhe' },
  { regex: /\bitomodhye\b/gi, replaceWith: 'iti moddhe' },
  { regex: /\biti\s+modhye\b/gi, replaceWith: 'iti moddhe' },
  { regex: /\bbhabisshote\b/gi, replaceWith: 'bhobisshote' },
  { regex: /\bvobisshote\b/gi, replaceWith: 'bhobisshote' },
  { regex: /\bbhabisshot\b/gi, replaceWith: 'bhobisshote' },
  { regex: /\bshompurno\b/gi, replaceWith: 'shompurno' },
  { regex: /\bsompurno\b/gi, replaceWith: 'shompurno' },
  { regex: /\bshompurna\b/gi, replaceWith: 'shompurno' },
  { regex: /\bsomossa\b/gi, replaceWith: 'somossya' },
  { regex: /\bsomossha\b/gi, replaceWith: 'somossya' },
  { regex: /\bshomoshsha\b/gi, replaceWith: 'somossya' },
  { regex: /\bshomossa\b/gi, replaceWith: 'somossya' },
  { regex: /\bthikna\b/gi, replaceWith: 'thikana' },
  { regex: /\bthikanna\b/gi, replaceWith: 'thikana' },
  { regex: /\btikana\b/gi, replaceWith: 'thikana' },
  { regex: /\bthikona\b/gi, replaceWith: 'thikana' },
  { regex: /\bdhanyawad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhanyabad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhanyavad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdonnobad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhanobad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhonnobaad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhonnobaadh\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bdhonobad\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\boboshoy\b/gi, replaceWith: 'oboshshoi' },
  { regex: /\bobosshoy\b/gi, replaceWith: 'oboshshoi' },
  { regex: /\boboshyo\b/gi, replaceWith: 'oboshshoi' },
  { regex: /\bsobgulo\b/gi, replaceWith: 'shobgulo' },
  { regex: /\bsob\b/gi, replaceWith: 'shob' },
  { regex: /\bshomoi\b/gi, replaceWith: 'shomoy' },
  { regex: /\bsomoy\b/gi, replaceWith: 'shomoy' },
  { regex: /\bbujte\b/gi, replaceWith: 'bujhte' },
  { regex: /\bsahajjo\b/gi, replaceWith: 'shahajjo' },
  { regex: /\bjogajuk\b/gi, replaceWith: 'jogajog' },
  { regex: /\bjogajok\b/gi, replaceWith: 'jogajog' },
  { regex: /\bpochontho\b/gi, replaceWith: 'pochondo' },
  { regex: /\bproyojoniy\b/gi, replaceWith: 'proyojonio' },

  // --- Verbs & Participles ---
  { regex: /\bjanaban\b/gi, replaceWith: 'janaben' },
  { regex: /\bpathaisi\b/gi, replaceWith: 'pathiyechi' },
  { regex: /\bpathaychi\b/gi, replaceWith: 'pathiyechi' },
  { regex: /\bpathay\s+dibo\b/gi, replaceWith: 'pathiye dibo' },
  { regex: /\bpathaye\s+debo\b/gi, replaceWith: 'pathiye dibo' },
  { regex: /\bdite\s+paarbo\b/gi, replaceWith: 'dite parbo' },
  { regex: /\bdite\s+paari\b/gi, replaceWith: 'dite parbo' },
  { regex: /\bdite\s+paarben\b/gi, replaceWith: 'dite parben' },
  { regex: /\bkorta\s+parbo\b/gi, replaceWith: 'korte parbo' },
  { regex: /\bkorta\s+parben\b/gi, replaceWith: 'korte parben' },
  { regex: /\bnite\s+chaan\b/gi, replaceWith: 'nite chan' },
  { regex: /\bnite\s+chaen\b/gi, replaceWith: 'nite chan' },
  { regex: /\bnite\s+paaren\b/gi, replaceWith: 'nite paren' },

  // --- Common Hindi/Urdu bleed that LLMs slip into romanized replies ---
  { regex: /\baapka\b/gi, replaceWith: 'apnar' },
  { regex: /\baapki\b/gi, replaceWith: 'apnar' },
  { regex: /\bapka\b/gi, replaceWith: 'apnar' },
  { regex: /\bapki\b/gi, replaceWith: 'apnar' },
  { regex: /\baapko\b/gi, replaceWith: 'apnake' },
  { regex: /\bapko\b/gi, replaceWith: 'apnake' },
  { regex: /\baap\b/gi, replaceWith: 'apni' },
  { regex: /\bkripya\b/gi, replaceWith: 'kindly' },
  { regex: /\bkripaya\b/gi, replaceWith: 'kindly' },
  { regex: /\bshukriya\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bshukria\b/gi, replaceWith: 'dhonnobad' },
  { regex: /\bnahin\b/gi, replaceWith: 'na' },
  { regex: /\bnahi\b/gi, replaceWith: 'na' },
  { regex: /\bkijiye\b/gi, replaceWith: 'korun' },
  { regex: /\bkariye\b/gi, replaceWith: 'korun' },
  { regex: /\bchahiye\b/gi, replaceWith: 'lagbe' },
  { regex: /\bkitna\b/gi, replaceWith: 'koto' },
  { regex: /\bkitne\b/gi, replaceWith: 'koto' },
  { regex: /\bkaise\b/gi, replaceWith: 'kivabe' },
  { regex: /\bkyun\b/gi, replaceWith: 'keno' },
  { regex: /\bpata\b/gi, replaceWith: 'thikana' },
  { regex: /\btheek\b/gi, replaceWith: 'thik' },
  { regex: /\bmadad\b/gi, replaceWith: 'shahajjo' },
  { regex: /\bdekhhiye\b/gi, replaceWith: 'dekhun' },
  { regex: /\bdekhiye\b/gi, replaceWith: 'dekhun' },
  { regex: /\bbataiye\b/gi, replaceWith: 'janaben' },
  { regex: /\bbataye\b/gi, replaceWith: 'janaben' },
  { regex: /\bbatao\b/gi, replaceWith: 'janaben' },
  { regex: /\byahan\b/gi, replaceWith: 'ekhane' },
  { regex: /\bwahan\b/gi, replaceWith: 'shekhane' },
]

/**
 * Normalizes and corrects Banglish spelling, grammatical forms,
 * and unnatural phonetic romanizations in a message.
 */
export function normalizeBanglishSpelling(text: string): string {
  if (!text || typeof text !== 'string') return text

  // If the reply contains a formal Bengali order invoice summary block
  // (e.g. '📋 সাবস্ক্রিপশন বিবরণী:' or '📦 অর্ডার বিবরণী:'), we preserve that block
  // and only normalize the Banglish text surrounding it.
  const invoiceSplit = text.split(/(?=(?:📦\s*অর্ডার বিবরণী:|📋\s*সাবস্ক্রিপশন বিবরণী:|•\s*পণ্যসমূহ:|•\s*পণ্য:))/i)
  if (invoiceSplit.length > 1) {
    const preText = invoiceSplit[0]
    const invoiceBlock = invoiceSplit.slice(1).join('')
    return `${normalizeBanglishTextSegment(preText)}${invoiceBlock}`
  }

  return normalizeBanglishTextSegment(text)
}

function normalizeBanglishTextSegment(text: string): string {
  let result = text

  // 1. Contextual Grammar & Conjugation fixes
  // A. "ami ... janacche" -> "ami ... janacchi" (1st person speaking)
  result = result.replace(
    /\b(ami\s+(?:[^.!?\n]{0,35}\s+)?)(?:janacche|janache)\b/gi,
    (match, prefix) => {
      return `${prefix}${preserveCase(match.split(/\s+/).pop() || '', 'janacchi')}`
    }
  )

  // B. "amra ... janacche" -> "amra ... janacchi"
  result = result.replace(
    /\b(amra\s+(?:[^.!?\n]{0,35}\s+)?)(?:janacche|janache)\b/gi,
    (match, prefix) => {
      return `${prefix}${preserveCase(match.split(/\s+/).pop() || '', 'janacchi')}`
    }
  )

  // C. "apni ... janacche" -> "apni ... janaben" (Asking the customer)
  result = result.replace(
    /\b(apni\s+(?:[^.!?\n]{0,35}\s+)?)(?:janacche|janache)\b/gi,
    (match, prefix) => {
      return `${prefix}${preserveCase(match.split(/\s+/).pop() || '', 'janaben')}`
    }
  )

  // D. Dialectal / broken participles: "ami ... boltesi" -> "ami ... bolchi", "kortesi" -> "korchi"
  result = result.replace(
    /\b(ami\s+(?:[^.!?\n]{0,35}\s+)?)boltesi\b/gi,
    (match, prefix) => `${prefix}bolchi`
  )
  result = result.replace(
    /\b(ami\s+(?:[^.!?\n]{0,35}\s+)?)kortesi\b/gi,
    (match, prefix) => `${prefix}korchi`
  )

  // 2. High-precision dictionary token replacements
  for (const { regex, replaceWith } of BANGLISH_WORD_REPLACEMENTS) {
    result = result.replace(regex, (match) => preserveCase(match, replaceWith))
  }

  // 3. Repeated elongated characters cleanup (e.g. "apniii" -> "apni", "dammm" -> "dam")
  result = result.replace(/\b([a-z]+)i{3,}\b/gi, '$1i')
  result = result.replace(/\b([a-z]+)m{3,}\b/gi, '$1m')
  result = result.replace(/\b([a-z]+)a{3,}\b/gi, '$1a')

  // 4. Clean up awkward punctuation spacing (e.g. "dam koto ?" -> "dam koto?")
  result = result.replace(/\s+([!?,.])/g, '$1')
  // Ensure space after punctuation if missing (e.g. "Dhonnobad!Apnar" -> "Dhonnobad! Apnar")
  result = result.replace(/([!?,.])([A-Za-z])/g, '$1 $2')

  // 5. Clean up multiple whitespaces
  result = result.replace(/[ \t]{2,}/g, ' ').trim()

  return result
}
