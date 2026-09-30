'use client'

import { useState } from 'react'
import { X, CheckCircle2, Clock, Truck, PackageCheck, AlertOctagon, User, Phone, MapPin, CreditCard, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Order, OrderStatus } from '@/types/orders'

interface OrderDetailDialogProps {
  open: boolean
  order: Order | null
  onClose: () => void
  onStatusUpdated: () => void
}

const STEPPER_STAGES: Array<{ id: OrderStatus; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'processing', label: 'Processing' },
  { id: 'shipped', label: 'Shipped' },
  { id: 'delivered', label: 'Delivered' },
]

export function OrderDetailDialog({ open, order, onClose, onStatusUpdated }: OrderDetailDialogProps) {
  const [updating, setUpdating] = useState(false)

  if (!open || !order) return null

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
      toast.success(`Order marked as ${newStatus}`)
      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed')
    } finally {
      setUpdating(false)
    }
  }

  const currentStepIndex = STEPPER_STAGES.findIndex((s) => s.id === order.status)
  const isCancelled = order.status === 'cancelled'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl border bg-background shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono text-foreground">{order.order_number}</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground uppercase font-medium">
              Source: {order.source}
            </span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Timeline Stepper */}
          {!isCancelled ? (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Progress</p>
              <div className="flex items-center justify-between relative">
                <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-muted -translate-y-1/2 z-0" />
                {STEPPER_STAGES.map((step, idx) => {
                  const isDone = currentStepIndex >= idx
                  const isCurrent = currentStepIndex === idx

                  return (
                    <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5 bg-card px-2">
                      <div
                        className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          isDone
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground'
                        } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                      >
                        {isDone ? <CheckCircle2 className="size-4" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-medium ${isDone ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/40 p-4 flex items-center gap-3 text-red-700 dark:text-red-300">
              <AlertOctagon className="size-6 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Order Cancelled</p>
                <p className="text-xs opacity-90">This order has been cancelled and is no longer active.</p>
              </div>
            </div>
          )}

          {/* Info Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Info Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <User className="size-4 text-primary" /> Customer Info
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{order.customer_name}</span>
                </div>
                {order.customer_phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="size-3.5" />
                    <span>{order.customer_phone}</span>
                  </div>
                )}
                {order.customer_address && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 mt-0.5 shrink-0" />
                    <span>{order.customer_address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Summary Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="size-4 text-primary" /> Payment Summary
              </h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-mono uppercase font-semibold text-foreground">{order.payment_method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Status:</span>
                  <span className="capitalize font-semibold text-foreground">{order.payment_status}</span>
                </div>
                {order.payment_reference && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="font-mono text-foreground">{order.payment_reference}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>Total Amount:</span>
                  <span className="text-primary">৳{(Number(order.total) || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Items</h3>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(order.order_items ?? []).map((item, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-foreground">{item.product_name}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{item.product_sku || '—'}</td>
                      <td className="px-3 py-2 text-right">৳{(Number(item.unit_price) || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right font-semibold">৳{(Number(item.total) || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes Section */}
          {order.notes && (
            <div className="rounded-xl border bg-card p-4 space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="size-4 text-primary" /> Notes
              </h3>
              <p className="text-xs text-foreground whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center justify-between border-t px-6 py-4 gap-2">
          <div className="flex items-center gap-2">
            {order.status !== 'confirmed' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('confirmed')}
                className="flex items-center gap-1.5 rounded-lg border border-indigo-600/30 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-100 transition-colors"
              >
                <Clock className="size-3.5" /> Mark Confirmed
              </button>
            )}

            {order.status !== 'shipped' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('shipped')}
                className="flex items-center gap-1.5 rounded-lg border border-orange-600/30 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 px-3 py-1.5 text-xs font-semibold hover:bg-orange-100 transition-colors"
              >
                <Truck className="size-3.5" /> Mark Shipped
              </button>
            )}

            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('delivered')}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-100 transition-colors"
              >
                <PackageCheck className="size-3.5" /> Mark Delivered
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('cancelled')}
                className="rounded-lg border border-red-600/30 text-red-600 dark:text-red-400 px-3 py-1.5 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                Cancel Order
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
