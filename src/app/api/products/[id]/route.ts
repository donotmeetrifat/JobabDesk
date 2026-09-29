import { NextResponse } from 'next/server'
import { getCurrentAccount } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, accountId } = await getCurrentAccount()
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('account_id', accountId)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ product: data })
  } catch (err: any) {
    console.error('[GET /api/products/[id]]', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 401 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, accountId } = await getCurrentAccount()
    const body = await req.json()

    const { data, error } = await supabase
      .from('products')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ product: data })
  } catch (err: any) {
    console.error('[PATCH /api/products/[id]]', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 401 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { supabase, accountId } = await getCurrentAccount()

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[DELETE /api/products/[id]]', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 401 })
  }
}
