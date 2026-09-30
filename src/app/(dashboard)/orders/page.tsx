import { Suspense } from 'react'
import { OrdersShell } from '@/components/orders/orders-shell'

export const metadata = { title: 'Orders | JobabDesk' }

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading orders...</div>}>
      <OrdersShell />
    </Suspense>
  )
}
