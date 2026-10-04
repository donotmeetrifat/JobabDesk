import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

/**
 * GET /api/contacts/[id]
 * Fetch the latest contact record
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('viewer')
    const { id } = await params

    const { data: contact, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    return NextResponse.json({ contact })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH /api/contacts/[id]
 * Update contact fields (address, phone, name, email)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const allowedFields = ['name', 'phone', 'email', 'address', 'company', 'messenger_id']
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Fetch current contact to preserve PSID in messenger_id if phone is being replaced
    const { data: currentContact } = await supabase
      .from('contacts')
      .select('id, phone, messenger_id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()

    if (currentContact) {
      const isCurrentPsid =
        currentContact.phone &&
        !currentContact.phone.startsWith('+') &&
        currentContact.phone.length >= 14 &&
        /^\d+$/.test(currentContact.phone)

      if (isCurrentPsid && !currentContact.messenger_id && !updates.messenger_id) {
        updates.messenger_id = currentContact.phone
      }
    }

    // Proactively clear conflicting phone on duplicate contacts in this account
    if (updates.phone) {
      const normalizedDigits = updates.phone.replace(/\D/g, '')
      if (normalizedDigits) {
        const { data: duplicateContact } = await supabase
          .from('contacts')
          .select('id, name, phone, messenger_id')
          .eq('account_id', accountId)
          .eq('phone_normalized', normalizedDigits)
          .neq('id', id)
          .limit(1)
          .maybeSingle()

        if (duplicateContact) {
          console.log(`[api/contacts/[id]] Clearing phone on duplicate contact ${duplicateContact.id} so active contact ${id} can claim ${updates.phone}`)
          try {
            await supabase.from('conversations').update({ contact_id: id }).eq('contact_id', duplicateContact.id)
            await supabase.from('orders').update({ contact_id: id }).eq('contact_id', duplicateContact.id)
            await supabase.from('contact_notes').update({ contact_id: id }).eq('contact_id', duplicateContact.id)
            await supabase
              .from('contacts')
              .update({ phone: null, updated_at: new Date().toISOString() })
              .eq('id', duplicateContact.id)
          } catch (e) {
            console.warn('[api/contacts/[id]] Duplicate re-point warning:', e)
          }
        }
      }
    }

    let { data: updatedContact, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .maybeSingle()

    // If updating phone still caused a unique constraint collision (23505),
    // clear the conflicting phone and retry WITH phone first before giving up
    if (error && error.code === '23505' && updates.phone) {
      console.warn('[api/contacts/[id]] Phone collision detected, clearing conflicting number and retrying:', updates.phone)
      const normalizedDigits = updates.phone.replace(/\D/g, '')
      if (normalizedDigits) {
        await supabase
          .from('contacts')
          .update({ phone: null, updated_at: new Date().toISOString() })
          .eq('account_id', accountId)
          .eq('phone_normalized', normalizedDigits)
          .neq('id', id)

        const retryWithPhone = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', id)
          .eq('account_id', accountId)
          .select()
          .maybeSingle()

        if (!retryWithPhone.error && retryWithPhone.data) {
          updatedContact = retryWithPhone.data
          error = null
        }
      }

      // If still error, only then retry without phone
      if (error) {
        delete updates.phone
        const retryResult = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', id)
          .eq('account_id', accountId)
          .select()
          .maybeSingle()
        updatedContact = retryResult.data
        error = retryResult.error
      }
    }

    if (error) {
      console.error('[api/contacts/[id]] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contact: updatedContact })
  } catch (err) {
    return toErrorResponse(err)
  }
}
