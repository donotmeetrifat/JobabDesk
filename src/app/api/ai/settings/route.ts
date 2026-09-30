import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')

    const { data: account, error } = await supabase
      .from('accounts')
      .select(
        'name, business_tagline, product_categories_sold, target_audience, customer_relation_style, ai_auto_reply_enabled, whatsapp_auto_reply_enabled, messenger_auto_reply_enabled, ai_primary_language, ai_business_description, ai_delivery_policy, ai_return_policy, ai_auto_reply_tone, ai_store_instructions, delivery_policy, return_policy, special_instructions, ai_persona, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_status, facebook_page_id, facebook_page_name, facebook_page_access_token, messenger_status'
      )
      .eq('id', accountId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: account, ...account })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const body = await req.json()

    const allowedFields = [
      'name',
      'business_tagline',
      'product_categories_sold',
      'target_audience',
      'customer_relation_style',
      'ai_auto_reply_enabled',
      'whatsapp_auto_reply_enabled',
      'messenger_auto_reply_enabled',
      'ai_primary_language',
      'ai_business_description',
      'ai_delivery_policy',
      'ai_return_policy',
      'ai_auto_reply_tone',
      'ai_store_instructions',
      'delivery_policy',
      'return_policy',
      'special_instructions',
      'ai_persona',
      'whatsapp_phone_number_id',
      'whatsapp_waba_id',
      'whatsapp_access_token',
      'whatsapp_status',
      'facebook_page_id',
      'facebook_page_name',
      'facebook_page_access_token',
      'messenger_status',
    ]

    const updates: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key]
      }
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data, ...data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
