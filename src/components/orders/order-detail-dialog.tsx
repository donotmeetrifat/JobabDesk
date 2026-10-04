'use client'

import { useState } from 'react'
import {
  X,
  CheckCircle2,
  Clock,
  Truck,
  PackageCheck,
  AlertOctagon,
  User,
  Phone,
  MapPin,
  CreditCard,
  FileText,
  Copy,
  Check,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Order, OrderStatus } from '@/types/orders'

interface OrderDetailDialogProps {
  open: boolean
  order: Order | null
  onClose: () => void
  onStatusUpdated: () => void
}

const STEPPER_STAGES: Array<{ id: OrderStatus; label: string }> = [
  { id: 'new', label: 'New (Pending)' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
]

export function OrderDetailDialog({ open, order, onClose, onStatusUpdated }: OrderDetailDialogProps) {
  const [updating, setUpdating] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!open || !order) return null

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success(`Copied ${field}`)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const handleUpdateStatus = async (newStatus: OrderStatus) => {
    setUpdating(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update status')
      toast.success(
        newStatus === 'confirmed'
          ? 'Order successfully approved and confirmed!'
          : `Order marked as ${newStatus}`
      )
      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed')
    } finally {
      setUpdating(false)
    }
  }

  const currentStepIndex = STEPPER_STAGES.findIndex((s) => s.id === order.status)
  const isCancelled = order.status === 'cancelled'
  const isNew = order.status === 'new'
  const customerId = order.contact_id || order.contact?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-xs">
      <div className="relative w-full max-w-3xl rounded-2xl border bg-background shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono text-foreground">{order.order_number || 'ORD-NEW'}</h2>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-semibold uppercase">
              {order.source || 'chat'}
            </span>
            {isNew && (
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-xs text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                Pending Approval
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Action Callout for New Orders */}
          {isNew && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-semibold text-xs text-amber-800 dark:text-amber-300">
                  New Order Awaiting Store Approval
                </p>
                <p className="text-xs text-amber-700/90 dark:text-amber-400/90">
                  Customer has submitted their delivery address and confirmed their order. Verify details below to approve or cancel.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('confirmed')}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold shadow-xs transition-colors"
                >
                  <CheckCircle2 className="size-4" />
                  <span>Approve Order</span>
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('cancelled')}
                  className="rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 px-3 py-2 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Status Timeline Stepper */}
          {!isCancelled ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Order Progress</p>
              <div className="flex items-center justify-between relative">
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-muted -translate-y-1/2 z-0" />
                {STEPPER_STAGES.map((step, idx) => {
                  const isDone = currentStepIndex >= idx
                  const isCurrent = currentStepIndex === idx

                  return (
                    <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5 bg-card px-2">
                      <div
                        className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          isDone
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'bg-muted text-muted-foreground'
                        } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                      >
                        {isDone ? <CheckCircle2 className="size-3.5" /> : idx + 1}
                      </div>
                      <span className={`text-[11px] font-medium ${isDone ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3 text-red-700 dark:text-red-300">
              <AlertOctagon className="size-5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Order Cancelled</p>
                <p className="text-xs opacity-90">This order has been cancelled and is no longer active.</p>
              </div>
            </div>
          )}

          {/* Customer & Payment Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Info Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="size-4 text-primary" /> Customer Details
                </h3>
                {order.conversation_id ? (
                  <Link
                    href={`/inbox?c=${order.conversation_id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    <MessageSquare className="size-3" />
                    Open Chat
                  </Link>
                ) : null}
              </div>

              <div className="space-y-2 text-xs">
                {/* Name */}
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-semibold text-foreground text-sm">{order.customer_name}</span>
                </div>

                {/* Customer ID */}
                {customerId && (
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Customer ID:</span>
                    <div className="flex items-center gap-1.5 font-mono text-foreground">
                      <span>{customerId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(customerId, 'Customer ID')}
                        title="Copy Customer ID"
                        className="hover:text-primary transition-colors"
                      >
                        {copiedField === 'Customer ID' ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Phone */}
                <div className="flex items-center justify-between border-b pb-1.5">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Phone className="size-3" /> Phone:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {order.customer_phone ? (
                      <>
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="font-mono font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {order.customer_phone}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(order.customer_phone!, 'Phone Number')}
                          title="Copy Phone"
                          className="hover:text-primary transition-colors"
                        >
                          {copiedField === 'Phone Number' ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3 text-muted-foreground" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">Not provided</span>
                    )}
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="pt-0.5 space-y-1">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3 text-primary" /> Delivery Address:
                    </span>
                    {order.customer_address && (
                      <button
                        type="button"
                        onClick={() => handleCopy(order.customer_address!, 'Address')}
                        title="Copy Address"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedField === 'Address' ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="rounded-lg bg-muted/50 p-2.5 font-medium text-foreground text-xs leading-relaxed whitespace-pre-wrap border border-border/50">
                    {order.customer_address || 'No address provided yet.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Summary Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="size-4 text-primary" /> Payment Summary
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-mono uppercase font-semibold text-foreground">{order.payment_method}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">Payment Status:</span>
                  <span className="capitalize font-semibold text-foreground">{order.payment_status}</span>
                </div>
                {order.payment_reference && (
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Trx Reference:</span>
                    <span className="font-mono text-foreground">{order.payment_reference}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono">৳{(Number(order.subtotal) || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">
                    {Number(order.delivery_charge) === 0 ? 'Free' : `৳${Number(order.delivery_charge).toLocaleString()}`}
                  </span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount:</span>
                    <span className="font-mono">-৳{Number(order.discount).toLocaleString()}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>Total Amount:</span>
                  <span className="text-primary text-base font-mono">
                    ৳{(Number(order.total) || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Ordered Products Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <PackageCheck className="size-4 text-primary" /> Ordered Products
            </h3>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground font-semibold uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Product Name</th>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5 text-right">Unit Price</th>
                    <th className="px-4 py-2.5 text-center">Qty</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {(order.order_items ?? []).map((item, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium text-foreground">{item.product_name}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{item.product_sku || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono">৳{(Number(item.unit_price) || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center font-mono font-semibold">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground font-mono">
                        ৳{(Number(item.total) || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes Card */}
          {order.notes && (
            <div className="rounded-xl border bg-card p-4 space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="size-4 text-primary" /> Notes
              </h3>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Quick Action Footer */}
        <div className="flex flex-wrap items-center justify-between border-t px-6 py-4 gap-2 bg-muted/20 rounded-b-2xl">
          <div className="flex items-center gap-2">
            {order.status === 'new' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('confirmed')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-colors"
              >
                <CheckCircle2 className="size-4" /> Approve Order
              </button>
            )}

            {order.status !== 'confirmed' && order.status !== 'new' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('confirmed')}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-600/30 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3.5 py-1.5 text-xs font-semibold hover:bg-indigo-100 transition-colors"
              >
                <Clock className="size-3.5" /> Mark Confirmed
              </button>
            )}

            {order.status !== 'shipped' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('shipped')}
                className="flex items-center gap-1.5 rounded-lg border border-purple-600/30 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 px-3.5 py-1.5 text-xs font-semibold hover:bg-purple-100 transition-colors"
              >
                <Truck className="size-3.5" /> Mark Shipped
              </button>
            )}

            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('delivered')}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3.5 py-1.5 text-xs font-semibold hover:bg-emerald-100 transition-colors"
              >
                <PackageCheck className="size-3.5" /> Mark Delivered
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => {
                  if (confirm('Are you sure you want to cancel this order?')) {
                    handleUpdateStatus('cancelled')
                  }
                }}
                className="rounded-lg border border-red-600/30 text-red-600 dark:text-red-400 px-3.5 py-1.5 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                Cancel Order
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
