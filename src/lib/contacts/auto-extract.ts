import { createClient } from '@supabase/supabase-js'

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
  // Match Bangladesh numbers: 013-019 (11 digits), +880 1..., +8801..., 8801...
  // Handles prefixes ("num: ", "phone: "), spaces, hyphens, and delimiters: 01712-345678, +880 1613-441083
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

  // Fallback: International E.164 phone numbers (+1..., +44..., etc.)
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
  // Look for explicit prefix: Address: ..., Adreess: ..., Thikana: ..., ঠিকানায়: ..., Delivery address: ...
  const explicitAddressRegex =
    /(?:(?:delivery\s*add?re+ss?|shipping\s*add?re+ss?|home\s*add?re+ss?|add?re+ss?|thikana|ঠিকানা|বাসা|বাসার\s*ঠিকানা|লোকেশন|location)\s*[:=-]\s*)([^\n\r]+)/i
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
      // Skip lines that are just the phone number or greeting
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

  // If address contains the phone number, clean it out so the address is pure
  if (result.address && result.phone) {
    const rawDigits = result.phone.replace(/\D/g, '')
    const localNumber = rawDigits.startsWith('880') ? rawDigits.slice(3) : rawDigits.startsWith('0') ? rawDigits.slice(1) : rawDigits
    const stripRegex = new RegExp(
      `[\\s,।|•-]*((?:phone|mobile|cell|contact|call|ফোন|নাম্বার|মোবাইল)[:\\s-]*)?(?:\\+?880|0)?${localNumber}[^\\n\\r]*$`,
      'i'
    )
    result.address = result.address.replace(stripRegex, '').trim()
  }

  // 4. NAME EXTRACTION (Optional)
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

/**
 * Automatically places extracted contact information (phone, address, email, name)
 * strictly into the customer's own contact record.
 */
export async function autoUpdateContactFromChatMessage(params: {
  contactId: string
  accountId: string
  messageText: string
  supabase: any
}): Promise<{ updated: boolean; updates: Record<string, any> }> {
  const { contactId, accountId, messageText, supabase } = params
  if (!contactId || !accountId || !messageText) {
    return { updated: false, updates: {} }
  }

  const extracted = extractCustomerInfoFromMessage(messageText)
  const hasExtractedInfo = Boolean(
    extracted.phone || extracted.address || extracted.email || extracted.name
  )

  if (!hasExtractedInfo) {
    return { updated: false, updates: {} }
  }

  try {
    // 1. Fetch current contact state
    const { data: contact, error: fetchErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (fetchErr || !contact) {
      console.warn('[AutoExtract] Could not find contact:', contactId)
      return { updated: false, updates: {} }
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    let shouldUpdate = false

    // Handle Phone:
    // If the customer provided a real phone number in chat
    if (extracted.phone) {
      const isCurrentPsid = isFacebookPsid(contact.phone)
      if (isCurrentPsid || !contact.phone || contact.phone !== extracted.phone) {
        // If current phone is a PSID, preserve it in messenger_id / wa_user_id
        if (isCurrentPsid) {
          updates.messenger_id = contact.phone
          updates.wa_user_id = contact.phone
        }
        updates.phone = extracted.phone
        shouldUpdate = true
      }
    }

    // Handle Address:
    if (extracted.address) {
      if (!contact.address || contact.address !== extracted.address) {
        updates.address = extracted.address
        shouldUpdate = true
      }
    }

    // Handle Email:
    if (extracted.email) {
      const cleanCurrent = cleanEmail(contact.email)
      if (!cleanCurrent || cleanCurrent !== extracted.email) {
        updates.email = extracted.email
        shouldUpdate = true
      }
    }

    // Handle Name:
    if (extracted.name) {
      const currentName = contact.name || ''
      const isPlaceholder =
        !currentName ||
        currentName === 'Unknown' ||
        currentName === 'Facebook user' ||
        currentName.startsWith('Messenger User') ||
        currentName.startsWith('WhatsApp ')
      if (isPlaceholder) {
        updates.name = extracted.name
        shouldUpdate = true
      }
    }

    if (!shouldUpdate) {
      return { updated: false, updates: {} }
    }

    // Execute atomic update for THIS EXACT CONTACT ONLY
    const { error: updateErr } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId)
      .eq('account_id', accountId)

    if (updateErr) {
      // If address column does not exist yet in schema cache, retry without address column
      // and save the address in contact_notes so it is never lost!
      if (updateErr.message?.includes('address') || updateErr.code === 'PGRST204') {
        const fallbackUpdates = { ...updates }
        delete fallbackUpdates.address
        if (Object.keys(fallbackUpdates).length > 1) {
          await supabase
            .from('contacts')
            .update(fallbackUpdates)
            .eq('id', contactId)
            .eq('account_id', accountId)
        }
      } else {
        console.error('[AutoExtract] Error updating contact:', updateErr)
      }
    }

    // If an address was extracted, also record a note on the contact so it's always visible in Notes tab
    if (extracted.address) {
      try {
        const notePayload: Record<string, any> = {
          contact_id: contactId,
          note_text: `📍 Delivery Address: ${extracted.address}`,
        }
        if (contact.user_id) notePayload.user_id = contact.user_id
        await supabase.from('contact_notes').insert(notePayload)
      } catch (_noteErr) {
        // Safe ignore
      }
    }

    console.log(`[AutoExtract] Successfully updated contact ${contactId}:`, updates)
    return { updated: true, updates }
  } catch (err) {
    console.error('[AutoExtract] Error in autoUpdateContactFromChatMessage:', err)
    return { updated: false, updates: {} }
  }
}

/**
 * Scans all historical customer chat messages across conversations to populate
 * missing phone numbers and delivery addresses into their contacts.
 */
export async function backfillContactInfoFromChat(supabase: any) {
  try {
    const { data: conversations, error: convErr } = await supabase
      .from('conversations')
      .select('id, contact_id, account_id')
      .not('contact_id', 'is', null)

    if (convErr || !conversations) return { processed: 0, updated: 0 }

    let updatedCount = 0

    for (const conv of conversations) {
      if (!conv.contact_id || !conv.account_id) continue

      const { data: messages } = await supabase
        .from('messages')
        .select('content_text')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: true })

      if (!messages || messages.length === 0) continue

      for (const msg of messages) {
        if (!msg.content_text) continue
        const res = await autoUpdateContactFromChatMessage({
          contactId: conv.contact_id,
          accountId: conv.account_id,
          messageText: msg.content_text,
          supabase,
        })
        if (res.updated) {
          updatedCount++
        }
      }
    }

    return { processed: conversations.length, updated: updatedCount }
  } catch (e) {
    console.error('[AutoExtract] Error in backfillContactInfoFromChat:', e)
    return { error: String(e) }
  }
}
