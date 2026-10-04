import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey && serviceKey.trim().length > 0) {
    return createSupabaseClient(url, serviceKey.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  return createSupabaseClient(url, anonKey)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const { ai_auto_reply_muted, conversation_id } = body

    if (typeof ai_auto_reply_muted !== 'boolean') {
      return NextResponse.json(
        { error: 'ai_auto_reply_muted must be a boolean' },
        { status: 400 }
      )
    }

    const admin = getAdminClient()
    const db = admin || supabase

    // 1. Locate the contact if id is contact_id, or resolve via conversation if id is conversation_id
    let contact: any = null
    const { data: directContact } = await db
      .from('contacts')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (directContact) {
      contact = directContact
    } else {
      // Check if id is a conversation ID
      const { data: conv } = await db
        .from('conversations')
        .select('id, contact_id')
        .eq('id', id)
        .maybeSingle()

      if (conv?.contact_id) {
        const { data: convContact } = await db
          .from('contacts')
          .select('*')
          .eq('id', conv.contact_id)
          .maybeSingle()
        if (convContact) contact = convContact
      }
    }

    let updatedContact: any = null

    // 2. If contact exists, update contact's ai_auto_reply_muted
    if (contact?.id) {
      const { data: cData, error: cErr } = await db
        .from('contacts')
        .update({ ai_auto_reply_muted })
        .eq('id', contact.id)
        .select()
        .maybeSingle()

      if (!cErr && cData) {
        updatedContact = cData
      }

      // Synchronize all conversations for this contact
      await db
        .from('conversations')
        .update({ ai_autoreply_disabled: ai_auto_reply_muted })
        .eq('contact_id', contact.id)
    }

    // 3. If a specific conversation_id was provided or id was the conversation_id, ensure it's synced
    const targetConvId = conversation_id || (!contact ? id : null)
    if (targetConvId) {
      await db
        .from('conversations')
        .update({ ai_autoreply_disabled: ai_auto_reply_muted })
        .eq('id', targetConvId)
    }

    return NextResponse.json({
      success: true,
      ai_auto_reply_muted,
      contact: updatedContact || contact,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
