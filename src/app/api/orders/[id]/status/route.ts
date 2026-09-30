import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params
    const { status } = await req.json()

    const validStatuses = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', accountId)
      .select('*, order_items(*), contact:contacts(id, name, phone)')
      .single()

    if (error || !updatedOrder) {
      return NextResponse.json({ error: error?.message ?? 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order: updatedOrder })
  } catch (err) {
    return toErrorResponse(err)
  }
}
