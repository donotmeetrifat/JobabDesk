import { NextResponse } from 'next/server'
import { getCurrentAccount } from '@/lib/auth/account'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const url = new URL(req.url)
    const search = url.searchParams.get('search') ?? ''
    const category = url.searchParams.get('category') ?? ''
    const inStockOnly = url.searchParams.get('in_stock') === 'true'
    const page = parseInt(url.searchParams.get('page') ?? '1')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200)
    const offset = (page - 1) * limit

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,brand.ilike.%${search}%,sku.ilike.%${search}%,category.ilike.%${search}%`
      )
    }
    if (category) query = query.eq('category', category)
    if (inStockOnly) query = query.eq('is_in_stock', true)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ products: data ?? [], total: count ?? 0, page, limit })
  } catch (err: any) {
    console.error('[GET /api/products]', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 401 })
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const body = await req.json()

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        account_id: accountId,
        name: body.name.trim(),
        sku: body.sku ?? null,
        brand: body.brand ?? null,
        category: body.category ?? null,
        price: body.price ?? 0,
        compare_at_price: body.compare_at_price ?? null,
        stock_qty: body.stock_qty ?? 0,
        is_in_stock: body.is_in_stock ?? true,
        description: body.description ?? null,
        keywords: body.keywords ?? [],
        images: body.images ?? [],
        is_active: true,
        import_source: body.import_source ?? 'manual',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ product: data }, { status: 201 })
  } catch (err: any) {
    console.error('[POST /api/products]', err)
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 401 })
  }
}
