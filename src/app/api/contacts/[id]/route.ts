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

    let { data: updatedContact, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .maybeSingle()

    // If updating phone caused a unique constraint collision (23505),
    // retry updating the remaining fields (address, name, etc.) without phone
    if (error && error.code === '23505' && updates.phone) {
      console.warn('[api/contacts/[id]] Phone collision detected, retrying without phone:', updates.phone)
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

    if (error) {
      console.error('[api/contacts/[id]] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ contact: updatedContact })
  } catch (err) {
    return toErrorResponse(err)
  }
}
