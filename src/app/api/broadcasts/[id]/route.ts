import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mvkcheckaxfimlzjqvyz.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  return createClient(url, key)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getAdminClient()

    const { data: broadcast, error: bcError } = await db
      .from('broadcasts')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (bcError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    const { data: recipients, error: recError } = await db
      .from('broadcast_recipients')
      .select('*, contact:contacts(*)')
      .eq('broadcast_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      broadcast,
      recipients: recipients ?? [],
    })
  } catch (err: any) {
    console.error('[Broadcast Detail API] GET error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getAdminClient()
    const body = await req.json()

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (body.ai_context !== undefined) updatePayload.ai_context = body.ai_context
    if (body.name !== undefined) updatePayload.name = body.name
    if (body.status !== undefined) updatePayload.status = body.status
    if (body.template_variables !== undefined) updatePayload.template_variables = body.template_variables

    const { data: updated, error } = await db
      .from('broadcasts')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, broadcast: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const db = getAdminClient()

    // Delete recipients first (or cascade)
    await db.from('broadcast_recipients').delete().eq('broadcast_id', id)
    const { error } = await db.from('broadcasts').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
