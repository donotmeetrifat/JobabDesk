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
  Sparkles,
  Package,
  ArrowRight,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { Order, OrderStatus, PaymentMethod, PaymentStatus } from '@/types/orders'

interface OrderDetailDialogProps {
  open: boolean
  order: Order | null
  onClose: () => void
  onStatusUpdated: () => void
}

interface StepStage {
  id: OrderStatus
  label: string
  sublabel: string
  icon: typeof Sparkles
  color: string
}

const STEPPER_STAGES: StepStage[] = [
  {
    id: 'new',
    label: 'New Order',
    sublabel: 'Awaiting Review',
    icon: Sparkles,
    color: 'amber',
  },
  {
    id: 'confirmed',
    label: 'Confirmed',
    sublabel: 'Order Approved',
    icon: CheckCircle2,
    color: 'sky',
  },
  {
    id: 'processing',
    label: 'Processing',
    sublabel: 'Packaging Items',
    icon: Package,
    color: 'indigo',
  },
  {
    id: 'shipped',
    label: 'Shipped',
    sublabel: 'In Transit',
    icon: Truck,
    color: 'purple',
  },
  {
    id: 'delivered',
    label: 'Delivered',
    sublabel: 'Fulfilled',
    icon: PackageCheck,
    color: 'emerald',
  },
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
          : `Order status updated to ${newStatus}`
      )
      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed')
    } finally {
      setUpdating(false)
    }
  }

  const handleUpdatePayment = async (updates: { payment_status?: PaymentStatus; payment_method?: PaymentMethod }) => {
    setUpdating(true)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update payment information')
      toast.success('Payment updated successfully')
      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment update failed')
    } finally {
      setUpdating(false)
    }
  }

  const currentStepIndex = STEPPER_STAGES.findIndex((s) => s.id === order.status)
  const isCancelled = order.status === 'cancelled'
  const isNew = order.status === 'new'
  const customerId = order.contact_id || order.contact?.id

  // Clean formatted address (strip duplicate 'Address:' or 'Adreess:' headers)
  const cleanAddress = order.customer_address
    ? order.customer_address.replace(/^(?:adreess|address|adress|ঠিকানা)\s*[:：\-]\s*/i, '').trim()
    : ''

  // Determine next logical status in sequence
  const nextStage =
    currentStepIndex >= 0 && currentStepIndex < STEPPER_STAGES.length - 1
      ? STEPPER_STAGES[currentStepIndex + 1]
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 overflow-y-auto backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl border border-border/80 bg-background shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 sm:px-6 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-1.5 text-primary">
              <PackageCheck className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-mono text-foreground tracking-tight">
                  {order.order_number || 'ORD-NEW'}
                </h2>
                <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] text-primary font-bold uppercase tracking-wider">
                  {order.source || 'chat'}
                </span>
                {isNew && (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400 font-bold animate-pulse">
                    Pending Approval
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Placed on {new Date(order.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {order.conversation_id ? (
              <a
                href={`/inbox?c=${order.conversation_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold transition-colors"
                title="Open customer conversation in Inbox"
              >
                <MessageSquare className="size-3.5" />
                <span>View Chat</span>
                <ExternalLink className="size-3" />
              </a>
            ) : customerId ? (
              <a
                href={`/inbox?contact=${customerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold transition-colors"
                title="Open customer conversation in Inbox"
              >
                <MessageSquare className="size-3.5" />
                <span>View Chat</span>
                <ExternalLink className="size-3" />
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Close Dialog"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Order Progress Stepper Section */}
          <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-2 rounded-full bg-primary animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Order Lifecycle & Progress
                </h3>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Click any stage to update status
              </span>
            </div>

            {!isCancelled ? (
              <div className="space-y-4">
                {/* Stepper Bar */}
                <div className="relative pt-1 pb-2">
                  {/* Background Track */}
                  <div className="absolute top-5 left-6 right-6 h-1 bg-muted rounded-full z-0" />

                  {/* Filled Track with Gradient */}
                  <div
                    className="absolute top-5 left-6 h-1 bg-gradient-to-r from-emerald-500 via-primary to-sky-500 rounded-full z-0 transition-all duration-300"
                    style={{
                      width: `${Math.max(0, Math.min(100, (currentStepIndex / (STEPPER_STAGES.length - 1)) * 100))}%`,
                    }}
                  />

                  {/* Step Nodes */}
                  <div className="relative z-10 flex items-center justify-between">
                    {STEPPER_STAGES.map((step, idx) => {
                      const isDone = currentStepIndex > idx
                      const isCurrent = currentStepIndex === idx
                      const isUpcoming = currentStepIndex < idx
                      const StepIcon = step.icon

                      return (
                        <button
                          key={step.id}
                          type="button"
                          disabled={updating}
                          onClick={() => handleUpdateStatus(step.id)}
                          title={`Click to set order status to "${step.label}"`}
                          className="flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none transition-all px-1"
                        >
                          <div
                            className={`size-8 sm:size-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                              isCurrent
                                ? 'bg-primary text-primary-foreground ring-4 ring-primary/25 scale-110 shadow-md'
                                : isDone
                                ? 'bg-emerald-600 text-white shadow-xs group-hover:scale-105'
                                : 'bg-muted text-muted-foreground border border-border group-hover:border-primary/50 group-hover:text-foreground group-hover:scale-105'
                            }`}
                          >
                            {isDone ? (
                              <Check className="size-4 stroke-[3]" />
                            ) : (
                              <StepIcon className="size-4" />
                            )}
                          </div>
                          <div className="text-center">
                            <span
                              className={`text-[11px] block transition-colors ${
                                isCurrent
                                  ? 'font-bold text-primary underline underline-offset-4'
                                  : isDone
                                  ? 'font-semibold text-foreground'
                                  : 'font-medium text-muted-foreground group-hover:text-foreground'
                              }`}
                            >
                              {step.label}
                            </span>
                            <span className="text-[9px] text-muted-foreground hidden sm:block">
                              {isCurrent ? 'Current' : isDone ? 'Done' : step.sublabel}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Progress Quick Banner & Next Step Controller */}
                <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-full bg-primary/10 p-1.5 text-primary">
                      <Clock className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        Current Status:
                        <span className="text-primary font-bold">
                          {STEPPER_STAGES[currentStepIndex]?.label || order.status}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {currentStepIndex === 0 && 'Order has been placed by the customer and is awaiting store confirmation.'}
                        {currentStepIndex === 1 && 'Order is confirmed and verified. Ready to prepare packaging.'}
                        {currentStepIndex === 2 && 'Packaging is in progress. Ready to assign courier and dispatch.'}
                        {currentStepIndex === 3 && 'Order is in transit with the courier service.'}
                        {currentStepIndex === 4 && 'Order has been delivered and fulfilled.'}
                      </p>
                    </div>
                  </div>

                  {/* Contextual Action Button */}
                  {nextStage && (
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => handleUpdateStatus(nextStage.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-1.5 text-xs font-bold shadow-xs transition-all hover:scale-[1.02] active:scale-95 ml-auto"
                    >
                      <span>Advance to {nextStage.label}</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-red-700 dark:text-red-300">
                  <AlertOctagon className="size-5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">
                      {order.notes?.toLowerCase().includes('cancelled by customer') ? 'Cancel by customer' : 'Order Cancelled'}
                    </p>
                    <p className="text-xs opacity-90">
                      {order.notes?.toLowerCase().includes('cancelled by customer')
                        ? 'This order was cancelled by the customer in chat.'
                        : 'This order is marked as cancelled.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleUpdateStatus('new')}
                  className="flex items-center gap-1.5 rounded-lg bg-background hover:bg-muted border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors"
                >
                  <RotateCcw className="size-3.5" /> Reopen Order
                </button>
              </div>
            )}
          </div>

          {/* Customer & Payment Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Details Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="size-4 text-primary" /> Customer Details
                </h3>
                {customerId && (
                  <span
                    className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleCopy(customerId, 'Customer ID')}
                    title="Click to copy full ID"
                  >
                    ID: #{customerId.slice(0, 8)}
                  </span>
                )}
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Name */}
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground font-medium">Name:</span>
                  <span className="font-bold text-foreground text-sm">{order.customer_name}</span>
                </div>

                {/* Phone */}
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground font-medium flex items-center gap-1">
                    <Phone className="size-3" /> Phone:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {order.customer_phone ? (
                      <>
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="font-mono font-semibold text-foreground hover:text-primary transition-colors"
                        >
                          {order.customer_phone}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(order.customer_phone!, 'Phone Number')}
                          title="Copy Phone"
                          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedField === 'Phone Number' ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">Not provided</span>
                    )}
                  </div>
                </div>

                {/* Delivery Address */}
                <div className="pt-0.5 space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-medium flex items-center gap-1">
                      <MapPin className="size-3 text-primary" /> Delivery Address:
                    </span>
                    {cleanAddress && (
                      <button
                        type="button"
                        onClick={() => handleCopy(cleanAddress, 'Address')}
                        title="Copy Clean Address"
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {copiedField === 'Address' ? (
                          <span className="text-emerald-500 flex items-center gap-0.5 font-semibold">
                            <Check className="size-3" /> Copied
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <Copy className="size-3" /> Copy
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2.5 font-medium text-foreground text-xs leading-relaxed border border-border/60">
                    {cleanAddress ? (
                      <p>{cleanAddress}</p>
                    ) : (
                      <p className="text-muted-foreground italic">No delivery address provided yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Summary Card */}
            <div className="rounded-xl border bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between border-b pb-2.5">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="size-4 text-primary" /> Payment Summary
                </h3>
                <span className="text-[10px] text-muted-foreground font-medium bg-muted px-1.5 py-0.5 rounded">
                  Live Controls
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* Method Selector */}
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground font-medium">Payment Method:</span>
                  <select
                    value={order.payment_method}
                    disabled={updating}
                    onChange={(e) => handleUpdatePayment({ payment_method: e.target.value as PaymentMethod })}
                    className="rounded-lg border bg-background px-2.5 py-1 text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <option value="cod">Cash on Delivery (COD)</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="rocket">Rocket</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                {/* Status Selector */}
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-muted-foreground font-medium">Payment Status:</span>
                  <select
                    value={order.payment_status}
                    disabled={updating}
                    onChange={(e) => handleUpdatePayment({ payment_status: e.target.value as PaymentStatus })}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors ${
                      order.payment_status === 'paid'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : order.payment_status === 'partial'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-muted border-border text-foreground'
                    }`}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                {order.payment_reference && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Trx Reference:</span>
                    <span className="font-mono font-semibold text-foreground">{order.payment_reference}</span>
                  </div>
                )}

                {/* Subtotal & Delivery */}
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold text-foreground">
                    ৳{(Number(order.subtotal) || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">
                    {Number(order.delivery_charge) === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">
                        FREE
                      </span>
                    ) : (
                      `৳${Number(order.delivery_charge).toLocaleString()}`
                    )}
                  </span>
                </div>

                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Discount:</span>
                    <span className="font-mono">-৳{Number(order.discount).toLocaleString()}</span>
                  </div>
                )}

                {/* Total */}
                <div className="border-t border-border pt-2.5 flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm">Total Amount:</span>
                  <span className="text-primary text-lg font-bold font-mono">
                    ৳{(Number(order.total) || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Ordered Products Table */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <PackageCheck className="size-4 text-primary" /> Ordered Products
              </h3>
              <span className="text-xs text-muted-foreground font-medium">
                {(order.order_items ?? []).length} item{(order.order_items ?? []).length !== 1 ? 's' : ''} total
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
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
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-2">
                        <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {i + 1}
                        </div>
                        <span className="capitalize">{item.product_name}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{item.product_sku || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono">৳{(Number(item.unit_price) || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground font-mono">
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
            <div className="rounded-xl border bg-card p-3.5 space-y-1 shadow-2xs">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" /> Order Notes
              </h3>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between border-t px-5 sm:px-6 py-3.5 gap-2.5 bg-muted/20">
          <div className="flex flex-wrap items-center gap-2">
            {order.status === 'new' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('confirmed')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="size-4" /> Approve Order
              </button>
            )}

            {order.status === 'confirmed' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('processing')}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Package className="size-4" /> Move to Processing
              </button>
            )}

            {order.status === 'processing' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('shipped')}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Truck className="size-4" /> Mark Shipped (In Transit)
              </button>
            )}

            {order.status === 'shipped' && (
              <button
                disabled={updating}
                onClick={() => handleUpdateStatus('delivered')}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-bold shadow-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <PackageCheck className="size-4" /> Mark Delivered
              </button>
            )}

            {order.status === 'delivered' && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 text-xs font-bold">
                <CheckCircle2 className="size-4" /> Order Completed & Delivered
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {order.status !== 'cancelled' && (
              <button
                disabled={updating}
                onClick={() => {
                  if (confirm('Are you sure you want to cancel this order?')) {
                    handleUpdateStatus('cancelled')
                  }
                }}
                className="rounded-lg border border-red-500/30 text-red-600 dark:text-red-400 px-3.5 py-1.5 text-xs font-semibold hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Cancel Order
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs text-primary-foreground font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
