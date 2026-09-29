import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { toErrorResponse } from '@/lib/auth/account'

export async function POST(req: Request) {
  try {
    const ctx = await requireRole('agent')

    const { rows } = await req.json() as {
      rows: Array<{
        name: string; sku: string; description: string
        price: number | null; cost: number | null; category: string
        brand: string; stock_quantity: number | null; unit: string
        barcode: string; status: string
      }>
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
    }

    const validRows = rows.filter((r) => r.name?.trim())
    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })
    }

    const payload = validRows.map((r) => ({
      account_id: ctx.accountId,
      name: r.name.trim(),
      sku: r.sku?.trim() || null,
      description: r.description?.trim() || null,
      price: r.price,
      cost: r.cost,
      category: r.category?.trim() || null,
      brand: r.brand?.trim() || null,
      stock_quantity: r.stock_quantity ?? 0,
      unit: r.unit?.trim() || 'pcs',
      barcode: r.barcode?.trim() || null,
      status: r.status || 'active',
    }))

    const { data, error } = await ctx.supabase
      .from('products')
      .insert(payload)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      imported: data?.length ?? validRows.length,
      total: rows.length,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
