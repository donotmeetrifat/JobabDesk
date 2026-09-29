import { Suspense } from 'react'
import { ProductsShell } from '@/components/products/products-shell'

export const metadata = { title: 'Products' }

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading products...</div>}>
      <ProductsShell />
    </Suspense>
  )
}
