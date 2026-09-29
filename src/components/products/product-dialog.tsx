'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'

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
}

interface Props {
  open: boolean
  product: Product | null
  onClose: () => void
  onSaved: () => void
}

const empty = {
  name: '', sku: '', brand: '', category: '',
  price: 0, compare_at_price: '', stock_qty: 0,
  is_in_stock: true, description: '',
}

export function ProductDialog({ open, product, onClose, onSaved }: Props) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku ?? '',
        brand: product.brand ?? '',
        category: product.category ?? '',
        price: product.price,
        compare_at_price: product.compare_at_price?.toString() ?? '',
        stock_qty: product.stock_qty,
        is_in_stock: product.is_in_stock,
        description: product.description ?? '',
      })
    } else {
      setForm(empty)
    }
  }, [product, open])

  if (!open) return null

  const set = (field: string, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Product name required'); return }
    setSaving(true)
    try {
      const body = {
        ...form,
        price: Number(form.price),
        compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        stock_qty: Number(form.stock_qty),
      }
      const url = product ? `/api/products/${product.id}` : '/api/products'
      const method = product ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'Failed to save') }
      toast.success(product ? 'Product updated!' : 'Product added!')
      onSaved()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">{product ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 p-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Product Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. Boots Vitamin C 500mg" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Brand</label>
              <input value={form.brand} onChange={e => set('brand', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Boots" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Category</label>
              <input value={form.category} onChange={e => set('category', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. Vitamins" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Price (৳) *</label>
              <input type="number" min="0" step="0.01" value={form.price}
                onChange={e => set('price', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0" required />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Original Price (৳)</label>
              <input type="number" min="0" step="0.01" value={form.compare_at_price}
                onChange={e => set('compare_at_price', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">Stock Quantity</label>
              <input type="number" min="0" value={form.stock_qty}
                onChange={e => set('stock_qty', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)}
                className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="e.g. BTS-VC-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="in_stock" checked={form.is_in_stock}
              onChange={e => set('is_in_stock', e.target.checked)} className="size-4 rounded" />
            <label htmlFor="in_stock" className="text-sm">In Stock</label>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3}
              className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Product description (leave blank to generate with AI later)" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving...' : product ? 'Save Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
