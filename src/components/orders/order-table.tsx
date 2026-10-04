'use client'

import { Eye, Edit, Trash2, CheckCircle2, Ban, MapPin, Package, User, ExternalLink, MessageSquare } from 'lucide-react'
import Link from 'next/link'
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
  onApprove?: (order: Order) => void
  onCancel?: (order: Order) => void
  onUpdatePaymentStatus?: (order: Order, paymentStatus: PaymentStatus) => void
}

const STATUS_BADGES: Record<OrderStatus, { label: string; style: string }> = {
  new: {
    label: 'New (Pending)',
    style: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 font-bold',
  },
  confirmed: {
    label: 'Confirmed',
    style: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-400 font-semibold',
  },
  processing: {
    label: 'Processing',
    style: 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 font-medium',
  },
  shipped: {
    label: 'Shipped',
    style: 'bg-purple-500/15 text-purple-600 border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-400 font-medium',
  },
  delivered: {
    label: 'Delivered',
    style: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400 font-semibold',
  },
  cancelled: {
    label: 'Cancelled',
    style: 'bg-red-500/15 text-red-600 border-red-500/30 dark:bg-red-500/10 dark:text-red-400 font-medium',
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
  onApprove,
  onCancel,
  onUpdatePaymentStatus,
}: OrderTableProps) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id))

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border bg-card text-muted-foreground text-sm animate-pulse">
        Loading orders...
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-56 rounded-xl border bg-card text-center p-6 space-y-2">
        <Package className="size-10 text-muted-foreground/50" />
        <p className="font-semibold text-base text-foreground">No orders found</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Orders confirmed by customers in chat will automatically appear here for your review and approval.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50 border-b text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          <tr>
            <th className="px-3.5 py-3 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="rounded border-muted-foreground/40 accent-primary cursor-pointer"
              />
            </th>
            <th className="px-3 py-3 font-semibold">Order #</th>
            <th className="px-3 py-3 font-semibold">Customer</th>
            <th className="px-3 py-3 font-semibold">Contact / Phone</th>
            <th className="px-3 py-3 font-semibold">Address</th>
            <th className="px-3 py-3 font-semibold">Ordered Products</th>
            <th className="px-3 py-3 font-semibold">Total (৳)</th>
            <th className="px-3 py-3 font-semibold">Payment</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Date</th>
            <th className="px-3.5 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {orders.map((order) => {
            const isSelected = selectedIds.has(order.id)
            const statusInfo = STATUS_BADGES[order.status] ?? STATUS_BADGES.new
            const paymentInfo = PAYMENT_BADGES[order.payment_status] ?? PAYMENT_BADGES.unpaid
            const items = order.order_items ?? []
            const customerId = order.contact_id || order.contact?.id

            return (
              <tr
                key={order.id}
                className={`transition-colors hover:bg-muted/40 ${isSelected ? 'bg-primary/5' : ''}`}
              >
                {/* Select Checkbox */}
                <td className="px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(order.id, e.target.checked)}
                    className="rounded border-muted-foreground/40 accent-primary cursor-pointer"
                  />
                </td>

                {/* Order Number & Source */}
                <td className="px-3 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                  <div>{order.order_number || 'ORD-NEW'}</div>
                  {order.source && (
                    <span className="inline-block mt-0.5 rounded px-1.5 py-0.2 text-[9px] font-medium bg-muted text-muted-foreground uppercase">
                      {order.source}
                    </span>
                  )}
                </td>

                {/* Customer Name & ID */}
                <td className="px-3 py-3">
                  <div className="font-semibold text-foreground flex items-center gap-1">
                    <User className="size-3 text-muted-foreground shrink-0" />
                    <span>{order.customer_name}</span>
                  </div>
                  {customerId && (
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5" title={`Customer ID: ${customerId}`}>
                      ID: {customerId.slice(0, 8)}...
                    </div>
                  )}
                </td>

                {/* Phone */}
                <td className="px-3 py-3 text-foreground whitespace-nowrap">
                  {order.customer_phone ? (
                    <span className="font-mono">{order.customer_phone}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Not provided</span>
                  )}
                </td>

                {/* Address */}
                <td className="px-3 py-3 max-w-[200px]">
                  {order.customer_address ? (
                    <div className="flex items-start gap-1 text-muted-foreground truncate" title={order.customer_address}>
                      <MapPin className="size-3 text-primary mt-0.5 shrink-0" />
                      <span className="truncate">{order.customer_address}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">No address</span>
                  )}
                </td>

                {/* Ordered Products */}
                <td className="px-3 py-3 min-w-[200px] max-w-[280px]">
                  {items.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-1.5 px-2 py-0.5 rounded bg-muted/60 dark:bg-muted/40 border border-border/40 text-[11px]"
                        >
                          <span className="font-medium text-foreground truncate max-w-[160px]" title={item.product_name}>
                            {item.product_name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-muted-foreground">
                            <span className="text-foreground font-semibold">×{item.quantity}</span>
                            {item.unit_price > 0 && (
                              <span>৳{item.unit_price.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic text-[11px]">No items</span>
                  )}
                </td>

                {/* Total */}
                <td className="px-3 py-3 font-bold text-foreground whitespace-nowrap">
                  ৳{(Number(order.total) || 0).toLocaleString()}
                </td>

                {/* Payment */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <div className="flex flex-col gap-1 items-start">
                    <select
                      value={order.payment_status}
                      onChange={(e) => onUpdatePaymentStatus?.(order, e.target.value as PaymentStatus)}
                      title="Click to change payment status"
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold cursor-pointer outline-none transition-colors ${paymentInfo.style}`}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                    <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase px-1">
                      {order.payment_method}
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] ${statusInfo.style}`}>
                    {statusInfo.label}
                  </span>
                </td>

                {/* Date */}
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap text-[11px]">
                  {new Date(order.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>

                {/* Quick Actions */}
                <td className="px-3.5 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Direct Quick Approve for New Orders */}
                    {order.status === 'new' && onApprove && (
                      <button
                        type="button"
                        onClick={() => onApprove(order)}
                        title="Approve / Confirm Order"
                        className="flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-semibold shadow-2xs transition-colors"
                      >
                        <CheckCircle2 className="size-3.5" />
                        <span>Approve</span>
                      </button>
                    )}

                    {/* Direct Quick Cancel for New Orders */}
                    {order.status === 'new' && onCancel && (
                      <button
                        type="button"
                        onClick={() => onCancel(order)}
                        title="Cancel Order"
                        className="rounded-md border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 p-1 transition-colors"
                      >
                        <Ban className="size-3.5" />
                      </button>
                    )}

                    {/* View Chat in Inbox */}
                    {order.conversation_id ? (
                      <a
                        href={`/inbox?c=${order.conversation_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Conversation in Inbox"
                        className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors"
                      >
                        <MessageSquare className="size-3.5" />
                      </a>
                    ) : customerId ? (
                      <a
                        href={`/inbox?contact=${customerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open Customer Conversation in Inbox"
                        className="rounded-md p-1.5 text-primary hover:bg-primary/10 transition-colors"
                      >
                        <MessageSquare className="size-3.5" />
                      </a>
                    ) : null}

                    {/* View Details */}
                    <button
                      type="button"
                      onClick={() => onView(order)}
                      title="View Full Details"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Eye className="size-3.5" />
                    </button>

                    {/* Edit Order */}
                    <button
                      type="button"
                      onClick={() => onEdit(order)}
                      title="Edit Order"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Edit className="size-3.5" />
                    </button>

                    {/* Delete Order */}
                    <button
                      type="button"
                      onClick={() => onDelete(order.id)}
                      title="Delete Order"
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
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
