'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Upload, Sparkles, RefreshCw, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { ProductTable } from './product-table'
import { ProductDialog } from './product-dialog'
import { ImportDialog } from './import-dialog'
import { OnlineSyncDialog } from './online-sync-dialog'

interface Product {
  id: string
  name: string
  sku: string | null
  brand: string | null
  category: string | null
  price: number
  compare_at_price: number | null
  stock_qty: number
  is_in_stock: boolean
  description: string | null
  ai_description: string | null
  keywords: string[]
  is_active: boolean
  import_source: string | null
  created_at: string
  updated_at: string
}

export function ProductsShell() {
  const [products, setProducts] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sheetsOpen, setSheetsOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      setProducts(data.products ?? [])
      setTotal(data.total ?? 0)
    } catch {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Product deleted')
      fetchProducts()
    } else {
      toast.error('Failed to delete product')
    }
  }

  const handleEdit = (product: Product) => {
    setEditProduct(product)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setEditProduct(null)
    setDialogOpen(true)
  }

  const handleSaved = () => {
    setDialogOpen(false)
    fetchProducts()
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">
            {total} product{total !== 1 ? 's' : ''} — used by AI to answer customer questions
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSheetsOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-green-600/50 px-3 py-2 text-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors">
            <Link2 className="size-4" /> Online Sync
          </button>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors">
            <Upload className="size-4" /> Import
          </button>
          <button onClick={fetchProducts}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <RefreshCw className="size-4" /> Refresh
          </button>
          <button onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Add Product
          </button>
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search by name, brand, SKU..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-md border bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>
      <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        <Upload className="size-4 shrink-0" />
        <span>Import products from</span>
        <button onClick={() => setImportOpen(true)} className="rounded px-2 py-0.5 text-primary underline-offset-2 hover:underline">Excel / CSV</button>
        <span>or</span>
        <button onClick={() => setSheetsOpen(true)} className="rounded px-2 py-0.5 text-primary underline-offset-2 hover:underline">Google Sheets / OneDrive</button>
        <span className="ml-auto flex items-center gap-1">
          <Sparkles className="size-3.5" /> AI descriptions available
        </span>
      </div>
      <ProductTable products={products} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />
      <ProductDialog open={dialogOpen} product={editProduct} onClose={() => setDialogOpen(false)} onSaved={handleSaved} />
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); fetchProducts() }}
      />
      <OnlineSyncDialog
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        onSynced={() => { setSheetsOpen(false); fetchProducts() }}
      />
    </div>
  )
}
