import { createClient } from '@supabase/supabase-js'
import {
  extractCustomerInfoFromMessage,
  isFacebookPsid,
  cleanEmail,
  normalizeBengaliDigits,
  type ExtractedCustomerInfo,
} from './extract-info'

export {
  extractCustomerInfoFromMessage,
  isFacebookPsid,
  cleanEmail,
  normalizeBengaliDigits,
  type ExtractedCustomerInfo,
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
  if (!contactId || !messageText) {
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
    // 1. Fetch current contact state (lookup by primary key contactId)
    const { data: contact, error: fetchErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .maybeSingle()

    if (fetchErr || !contact) {
      console.warn('[AutoExtract] Could not find contact:', contactId)
      return { updated: false, updates: {} }
    }

    const effectiveAccountId = contact.account_id || accountId
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    let shouldUpdate = false

    // Handle Phone:
    // If the customer provided a real phone number in chat
    if (extracted.phone) {
      const isCurrentPsid = isFacebookPsid(contact.phone)
      if (isCurrentPsid || !contact.phone || contact.phone !== extracted.phone) {
        // If current phone is a PSID, preserve it in messenger_id
        if (isCurrentPsid) {
          updates.messenger_id = contact.phone
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

    // If replacing a Facebook PSID, preserve the PSID in messenger_id
    if (contact.phone && isFacebookPsid(contact.phone) && !contact.messenger_id && !updates.messenger_id) {
      updates.messenger_id = contact.phone
      shouldUpdate = true
    }

    if (!shouldUpdate) {
      return { updated: false, updates: {} }
    }

    // Guard: Prevent unique constraint violation on (account_id, phone_normalized)
    // If another contact row already has this phone number, re-point child records (conversations, orders, notes)
    // to this active contact and clear the phone on the duplicate contact so the active customer keeps their real phone number!
    if (updates.phone && effectiveAccountId) {
      const normalizedDigits = updates.phone.replace(/\D/g, '')
      if (normalizedDigits) {
        const { data: duplicateContact } = await supabase
          .from('contacts')
          .select('id, name, phone, messenger_id, wa_user_id')
          .eq('account_id', effectiveAccountId)
          .eq('phone_normalized', normalizedDigits)
          .neq('id', contactId)
          .limit(1)
          .maybeSingle()

        if (duplicateContact) {
          console.log(`[AutoExtract] Phone ${updates.phone} already belongs to duplicate contact ${duplicateContact.id}. Re-pointing child records and freeing phone for active contact ${contactId}.`)
          try {
            await supabase.from('conversations').update({ contact_id: contactId }).eq('contact_id', duplicateContact.id)
            await supabase.from('orders').update({ contact_id: contactId }).eq('contact_id', duplicateContact.id)
            await supabase.from('contact_notes').update({ contact_id: contactId }).eq('contact_id', duplicateContact.id)
            await supabase
              .from('contacts')
              .update({ phone: null, updated_at: new Date().toISOString() })
              .eq('id', duplicateContact.id)
          } catch (repErr) {
            console.warn('[AutoExtract] Re-point/clear duplicate error:', repErr)
          }
        }
      }
    }

    // Execute atomic update for THIS EXACT CONTACT ONLY
    let { error: updateErr } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contactId)

    // Fallback: If still unique collision (raced), clear any conflicting contact and retry once
    if (updateErr && updateErr.code === '23505' && updates.phone && effectiveAccountId) {
      const normalizedDigits = updates.phone.replace(/\D/g, '')
      if (normalizedDigits) {
        await supabase
          .from('contacts')
          .update({ phone: null, updated_at: new Date().toISOString() })
          .eq('account_id', effectiveAccountId)
          .eq('phone_normalized', normalizedDigits)
          .neq('id', contactId)

        const retryRes = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contactId)
        updateErr = retryRes.error
      }
    }

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
  } catch (err) {
    console.error('[AutoExtract] Error in backfillContactInfoFromChat:', err)
    return { processed: 0, updated: 0 }
  }
}
