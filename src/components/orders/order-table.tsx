'use client'

import { Eye, Edit, Trash2 } from 'lucide-react'
import type { Order, OrderStatus, PaymentStatus } from '@/types/orders'

interface OrderTableProps {
  orders: Order[]
  loading: boolean
  selectedIds: Set<string>
  onSelect: (id: string, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onView: (order: Order) => void
  onEdit: (order: Order) => void
  onDelete: (id: string) => void
}

const STATUS_BADGES: Record<OrderStatus, { label: string; style: string }> = {
  new: {
    label: 'New',
    style: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
  },
  confirmed: {
    label: 'Confirmed',
    style: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
  },
  processing: {
    label: 'Processing',
    style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  shipped: {
    label: 'Shipped',
    style: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
  },
  delivered: {
    label: 'Delivered',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
  cancelled: {
    label: 'Cancelled',
    style: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  },
}

const PAYMENT_BADGES: Record<PaymentStatus, { label: string; style: string }> = {
  unpaid: {
    label: 'Unpaid',
    style: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
  },
  partial: {
    label: 'Partial',
    style: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  paid: {
    label: 'Paid',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
}

export function OrderTable({
  orders,
  loading,
  selectedIds,
  onSelect,
  onSelectAll,
  onView,
  onEdit,
  onDelete,
}: OrderTableProps) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id))

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border bg-card text-muted-foreground">
        Loading orders...
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 rounded-lg border bg-card text-center p-6">
        <p className="font-semibold text-lg">No orders found</p>
        <p className="text-sm text-muted-foreground mt-1">Create a new order or adjust your search filters.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 border-b text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="rounded border-muted-foreground/40 accent-primary cursor-pointer"
              />
            </th>
            <th className="px-4 py-3 font-semibold">Order #</th>
            <th className="px-4 py-3 font-semibold">Customer</th>
            <th className="px-4 py-3 font-semibold">Phone</th>
            <th className="px-4 py-3 font-semibold">Items</th>
            <th className="px-4 py-3 font-semibold">Total (৳)</th>
            <th className="px-4 py-3 font-semibold">Payment</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Date</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map((order) => {
            const isSelected = selectedIds.has(order.id)
            const statusInfo = STATUS_BADGES[order.status] ?? STATUS_BADGES.new
            const paymentInfo = PAYMENT_BADGES[order.payment_status] ?? PAYMENT_BADGES.unpaid
            const itemCount = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0

            return (
              <tr
                key={order.id}
                className={`transition-colors hover:bg-muted/40 ${isSelected ? 'bg-primary/5' : ''}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(order.id, e.target.checked)}
                    className="rounded border-muted-foreground/40 accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 font-mono font-medium text-foreground">
                  {order.order_number}
                </td>
                <td className="px-4 py-3 font-medium">
                  {order.customer_name}
                  {order.source === 'whatsapp' && (
                    <span className="ml-2 rounded bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300 px-1.5 py-0.5 text-[10px] font-normal">
                      WhatsApp
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {order.customer_phone || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 font-semibold text-foreground">
                  ৳{(Number(order.total) || 0).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${paymentInfo.style}`}>
                      {paymentInfo.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground uppercase font-mono">
                      {order.payment_method}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusInfo.style}`}>
                    {statusInfo.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(order.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onView(order)}
                      title="View Order"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Eye className="size-4" />
                    </button>
                    <button
                      onClick={() => onEdit(order)}
                      title="Edit Order"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Edit className="size-4" />
                    </button>
                    <button
                      onClick={() => onDelete(order.id)}
                      title="Delete Order"
                      className="rounded p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
