import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { sheetsToCsvUrl } from '@/lib/products/sheets-sync'

export async function POST(req: Request) {
  try {
    const ctx = await requireRole('agent')
    const { sheetsUrl, rows } = await req.json() as {
      sheetsUrl: string
      rows: Array<{
        name: string; sku: string; description: string
        price: number | null; cost: number | null; category: string
        brand: string; stock_quantity: number | null; unit: string
        barcode: string; status: string
      }>
    }

    if (!sheetsUrl) return NextResponse.json({ error: 'sheetsUrl required' }, { status: 400 })
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 })
    }

    const payload = rows.map((r) => ({
      account_id: ctx.accountId,
      name: r.name.trim(),
      sku: r.sku?.trim() || null,
      description: r.description?.trim() || null,
      price: r.price ?? 0,
      cost: r.cost ?? null,
      category: r.category?.trim() || null,
      brand: r.brand?.trim() || null,
      stock_quantity: r.stock_quantity ?? 0,
      unit: r.unit?.trim() || 'pcs',
      status: r.status || 'active',
      ...(r.barcode?.trim() ? { barcode: r.barcode.trim() } : {}),
    }))

    const { data, error } = await ctx.supabase
      .from('products')
      .insert(payload)
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Save sheets URL to account for future re-sync
    await ctx.supabase
      .from('accounts')
      .update({ sheets_sync_url: sheetsUrl })
      .eq('id', ctx.accountId)

    return NextResponse.json({
      success: true,
      imported: data?.length ?? payload.length,
      total: rows.length,
      csvUrl: sheetsToCsvUrl(sheetsUrl),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function GET() {
  try {
    const ctx = await requireRole('agent')

    // Get saved sheets URL for this account
    const { data } = await ctx.supabase
      .from('accounts')
      .select('sheets_sync_url')
      .eq('id', ctx.accountId)
      .single()

    return NextResponse.json({ sheetsUrl: data?.sheets_sync_url ?? null })
  } catch (err) {
    return toErrorResponse(err)
  }
}
