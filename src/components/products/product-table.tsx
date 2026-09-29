'use client'

import { Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react'

interface Product {
  id: string
  name: string
  sku: string | null
  brand: string | null
  category: string | null
  price: number
  stock_qty: number
  is_in_stock: boolean
  description: string | null
}

interface Props {
  products: Product[]
  loading: boolean
  onEdit: (product: any) => void
  onDelete: (id: string) => void
}

export function ProductTable({ products, loading, onEdit, onDelete }: Props) {
  if (loading) return (
    <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
      Loading products...
    </div>
  )

  if (products.length === 0) return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-muted-foreground">
      <p className="text-sm font-medium">No products yet</p>
      <p className="text-xs">Add your first product or import from Excel/CSV</p>
    </div>
  )

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Brand</th>
            <th className="px-4 py-3 text-left font-medium">Category</th>
            <th className="px-4 py-3 text-left font-medium">Price (৳)</th>
            <th className="px-4 py-3 text-left font-medium">Stock</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">SKU</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {products.map(product => (
            <tr key={product.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-medium">{product.name}</td>
              <td className="px-4 py-3 text-muted-foreground">{product.brand ?? '—'}</td>
              <td className="px-4 py-3 text-muted-foreground">{product.category ?? '—'}</td>
              <td className="px-4 py-3">৳{Number(product.price).toLocaleString()}</td>
              <td className="px-4 py-3">{product.stock_qty}</td>
              <td className="px-4 py-3">
                {product.is_in_stock
                  ? <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="size-3.5" /> In Stock</span>
                  : <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="size-3.5" /> Out of Stock</span>}
              </td>
              <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{product.sku ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <button onClick={() => onEdit(product)} className="rounded p-1.5 hover:bg-accent" title="Edit">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${product.name}"?`)) onDelete(product.id) }}
                    className="rounded p-1.5 hover:bg-destructive/10 text-destructive" title="Delete">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
