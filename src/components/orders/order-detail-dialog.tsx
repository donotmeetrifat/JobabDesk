'use client'

import { useState, useEffect } from 'react'
import {
  X,
  CheckCircle2,
  XCircle,
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
  Link2,
  Loader2,
  Zap,
  Globe,
  Building2,
  Edit3,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import type { Order, OrderStatus, PaymentMethod, PaymentStatus, PaymentRequest, CourierProvider, CourierSettings } from '@/types/orders'
import { PRESET_COURIERS, buildTrackingUrl } from '@/lib/courier/types'

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
  const { defaultCurrency } = useAuth()
  const [updating, setUpdating] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [liveRequests, setLiveRequests] = useState<PaymentRequest[]>(order?.payment_requests || [])
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Courier & Delivery Tracking State (Phase 6A)
  const [courierSettings, setCourierSettings] = useState<{
    settings: CourierSettings
    has_steadfast: boolean
    has_pathao: boolean
  } | null>(null)
  const [loadingCourierSettings, setLoadingCourierSettings] = useState(false)
  const [selectedCourier, setSelectedCourier] = useState('Sundarban Courier')
  const [customCourierName, setCustomCourierName] = useState('')
  const [trackingCodeInput, setTrackingCodeInput] = useState('')
  const [trackingUrlInput, setTrackingUrlInput] = useState('')
  const [bookingCourier, setBookingCourier] = useState(false)
  const [isEditingCourier, setIsEditingCourier] = useState(false)

  useEffect(() => {
    if (!open || !order?.id) return
    setLiveRequests(order.payment_requests || [])
    setIsEditingCourier(false)
    setTrackingCodeInput(order.tracking_code || '')
    setTrackingUrlInput(order.tracking_url || '')
    setSelectedCourier(order.courier_name || 'Sundarban Courier')
    setCustomCourierName('')

    let isMounted = true
    const fetchRequests = async () => {
      try {
        setLoadingRequests(true)
        const res = await fetch(`/api/pay/${order.id}`)
        if (!res.ok) return
        const data = await res.json()
        if (isMounted && data.payment_requests) {
          setLiveRequests(data.payment_requests)
        }
      } catch {
        // silent fallback
      } finally {
        if (isMounted) setLoadingRequests(false)
      }
    }

    const fetchCourierSettings = async () => {
      try {
        setLoadingCourierSettings(true)
        const res = await fetch('/api/courier/settings')
        if (!res.ok) return
        const data = await res.json()
        if (isMounted && data.settings) {
          setCourierSettings(data)
          if (!order.courier_name) {
            if (data.settings.default_provider === 'steadfast') setSelectedCourier('Steadfast Courier')
            else if (data.settings.default_provider === 'pathao') setSelectedCourier('Pathao Courier')
          }
        }
      } catch {
        // silent fallback
      } finally {
        if (isMounted) setLoadingCourierSettings(false)
      }
    }

    fetchRequests()
    fetchCourierSettings()
    return () => {
      isMounted = false
    }
  }, [open, order?.id, order?.payment_requests, order?.courier_name, order?.tracking_code, order?.tracking_url])

  if (!open || !order) return null

  const handleVerifyPayment = async (
    paymentRequestId: string,
    action: 'approve' | 'reject'
  ) => {
    setUpdating(true)
    try {
      const res = await fetch('/api/pay/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_request_id: paymentRequestId,
          action,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verification failed')

      toast.success(
        action === 'approve'
          ? 'Payment verified and order confirmed!'
          : 'Payment request marked as rejected.'
      )

      // Refresh live requests
      const reqRes = await fetch(`/api/pay/${order.id}`)
      if (reqRes.ok) {
        const reqData = await reqRes.json()
        if (reqData.payment_requests) setLiveRequests(reqData.payment_requests)
      }

      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setUpdating(false)
    }
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success(`Copied ${field}`)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const handleTrackingCodeChange = (code: string) => {
    setTrackingCodeInput(code)
    const effectiveCourier = selectedCourier === 'Other' ? customCourierName : selectedCourier
    const autoUrl = buildTrackingUrl(effectiveCourier, code)
    if (autoUrl) {
      setTrackingUrlInput(autoUrl)
    }
  }

  const handleCourierSelectChange = (courierName: string) => {
    setSelectedCourier(courierName)
    const effectiveCourier = courierName === 'Other' ? customCourierName : courierName
    const autoUrl = buildTrackingUrl(effectiveCourier, trackingCodeInput)
    if (autoUrl) {
      setTrackingUrlInput(autoUrl)
    }
  }

  const handleBookCourier = async (provider: CourierProvider) => {
    if (!order) return
    const effectiveCourier = selectedCourier === 'Other' ? customCourierName : selectedCourier
    if (provider === 'manual' && !trackingCodeInput.trim()) {
      toast.error('Please enter a tracking / consignment / memo number.')
      return
    }

    setBookingCourier(true)
    try {
      const res = await fetch('/api/courier/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          provider,
          manualCourierName: effectiveCourier,
          manualTrackingCode: trackingCodeInput.trim(),
          manualTrackingUrl: trackingUrlInput.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to book courier parcel')
      }

      toast.success(
        provider === 'manual'
          ? 'Tracking details saved & marked as Shipped!'
          : `Parcel successfully booked with ${data.booking?.courier_name || provider}!`
      )
      setIsEditingCourier(false)
      onStatusUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Courier booking failed')
    } finally {
      setBookingCourier(false)
    }
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
              type="button"
              onClick={() => {
                const payUrl = `${window.location.origin}/pay/${order.order_number || order.id}`
                handleCopy(payUrl, 'Payment Link')
              }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              title="Copy public customer payment link"
            >
              <Link2 className="size-3.5" />
              <span>Copy Pay Link</span>
            </button>
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
                        : order.payment_status === 'payment_submitted'
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                        : order.payment_status === 'partial'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-muted border-border text-foreground'
                    }`}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="payment_submitted">Submitted (TrxID)</option>
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
                    {formatCurrency(Number(order.subtotal) || 0, defaultCurrency)}
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
                      formatCurrency(Number(order.delivery_charge), defaultCurrency)
                    )}
                  </span>
                </div>

                {Number(order.discount) > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatCurrency(Number(order.discount), defaultCurrency)}</span>
                  </div>
                )}

                {/* Total */}
                <div className="border-t border-border pt-2.5 flex items-center justify-between">
                  <span className="font-bold text-foreground text-sm">Total Amount:</span>
                  <span className="text-primary text-lg font-bold font-mono">
                    {formatCurrency(Number(order.total) || 0, defaultCurrency)}
                  </span>
                </div>

                {/* Customer TrxID Submissions / 1-Click Verification */}
                {liveRequests.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <ShieldCheck className="size-3.5 text-emerald-500" />
                        TrxID Submissions ({liveRequests.length})
                      </span>
                      {loadingRequests && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                    </div>

                    <div className="space-y-2">
                      {liveRequests.map((req) => (
                        <div
                          key={req.id}
                          className={`rounded-lg border p-2.5 text-xs space-y-2 transition-all ${
                            req.status === 'verified'
                              ? 'bg-emerald-500/5 border-emerald-500/30'
                              : req.status === 'rejected'
                              ? 'bg-rose-500/5 border-rose-500/30 opacity-70'
                              : 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">
                                {req.payment_method}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {req.payment_type === 'delivery_advance' ? 'Advance Fee' : 'Full Payment'}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                req.status === 'verified'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  : req.status === 'rejected'
                                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
                              }`}
                            >
                              {req.status === 'submitted' ? 'Needs Verification' : req.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-background/60 p-2 rounded border border-border/50">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Sender Number:</span>
                              <span className="font-mono font-medium text-foreground">{req.sender_number}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">TrxID:</span>
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-foreground tracking-wider">{req.trx_id}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(req.trx_id, 'TrxID')}
                                  className="p-0.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                                  title="Copy TrxID"
                                >
                                  {copiedField === 'TrxID' ? (
                                    <Check className="size-2.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="size-2.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Amount:</span>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(Number(req.amount), defaultCurrency)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Submitted:</span>
                              <span className="text-muted-foreground text-[10px]">
                                {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>

                          {req.notes && (
                            <p className="text-[11px] text-muted-foreground italic">Note: &ldquo;{req.notes}&rdquo;</p>
                          )}

                          {req.status === 'rejected' && req.rejection_reason && (
                            <p className="text-[11px] text-rose-500 font-medium">Reason: {req.rejection_reason}</p>
                          )}

                          {/* Action buttons if status === 'submitted' */}
                          {req.status === 'submitted' && (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => handleVerifyPayment(req.id, 'approve')}
                                className="flex-1 flex items-center justify-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-2 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircle2 className="size-3.5" />
                                <span>Verify &amp; Mark Paid</span>
                              </button>
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => handleVerifyPayment(req.id, 'reject')}
                                className="flex items-center justify-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-1.5 px-3 text-xs font-semibold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                              >
                                <XCircle className="size-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Courier & Delivery Tracking (Phase 6A: Manual First + 1-Click Steadfast & Pathao APIs) */}
          <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <Truck className="size-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                    <span>Courier &amp; Delivery Tracking</span>
                    <span className="text-[10px] text-muted-foreground font-normal lowercase tracking-normal">
                      (Manual First &bull; 0 API Setup)
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Assign any courier memo or 1-click book via automated Steadfast/Pathao APIs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {order.tracking_code ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
                    <Truck className="size-3" />
                    {order.courier_booking_status === 'booked' ? 'Booked' : order.courier_booking_status || 'Shipped'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Unbooked
                  </span>
                )}
              </div>
            </div>

            {/* Display Active Tracking Card when order has tracking code and not editing */}
            {order.tracking_code && !isEditingCourier ? (
              <div className="rounded-lg border bg-gradient-to-r from-purple-500/5 via-primary/5 to-transparent p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Courier Provider
                    </span>
                    <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Building2 className="size-3.5 text-primary" />
                      <span>{order.courier_name || 'Courier Service'}</span>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Tracking / Memo Code
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-bold text-primary tracking-wider">
                        {order.tracking_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(order.tracking_code!, 'Tracking Code')}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        title="Copy tracking code"
                      >
                        {copiedField === 'Tracking Code' ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {order.courier_consignment_id && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Consignment ID
                      </span>
                      <div className="font-mono text-xs font-semibold text-muted-foreground">
                        #{order.courier_consignment_id}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1 sm:pt-0">
                    {order.tracking_url ? (
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 text-xs font-semibold transition-colors shadow-xs"
                      >
                        <Globe className="size-3.5" />
                        <span>Track Parcel</span>
                        <ExternalLink className="size-3" />
                      </a>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setIsEditingCourier(true)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted transition-colors cursor-pointer"
                      title="Update tracking info"
                    >
                      <Edit3 className="size-3.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    Customer was automatically notified with tracking details in chat.
                  </span>
                  <span>
                    COD Amount:{' '}
                    <strong className="font-mono text-foreground">
                      {order.payment_status === 'paid' ? '৳0 (Paid)' : formatCurrency(Number(order.total) || 0, defaultCurrency)}
                    </strong>
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1-Click Automated Courier API Section (Tier 2 Optional Enhancement) */}
                {(courierSettings?.has_steadfast && courierSettings.settings.steadfast.enabled) ||
                (courierSettings?.has_pathao && courierSettings.settings.pathao.enabled) ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Zap className="size-3 text-amber-500" />
                        Automated 1-Click Courier Booking
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                        API Connected
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {courierSettings?.has_steadfast && courierSettings.settings.steadfast.enabled && (
                        <button
                          type="button"
                          disabled={bookingCourier}
                          onClick={() => handleBookCourier('steadfast')}
                          className="flex items-center justify-between gap-3 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent hover:from-orange-500/20 hover:to-orange-500/10 p-3 text-left transition-all group cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-orange-500 text-white shadow-xs">
                              {bookingCourier ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-foreground">Steadfast 1-Click</span>
                                <span className="rounded bg-orange-500/20 text-orange-600 dark:text-orange-400 text-[9px] font-bold px-1.5 py-0.2 uppercase">Instant</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                COD: {order.payment_status === 'paid' ? '৳0 (Paid)' : formatCurrency(Number(order.total) || 0, defaultCurrency)}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-orange-600 dark:text-orange-400 group-hover:translate-x-0.5 transition-transform">
                            Book &rarr;
                          </span>
                        </button>
                      )}

                      {courierSettings?.has_pathao && courierSettings.settings.pathao.enabled && (
                        <button
                          type="button"
                          disabled={bookingCourier}
                          onClick={() => handleBookCourier('pathao')}
                          className="flex items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent hover:from-red-500/20 hover:to-red-500/10 p-3 text-left transition-all group cursor-pointer shadow-xs active:scale-[0.99] disabled:opacity-50"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-red-500 text-white shadow-xs">
                              {bookingCourier ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-foreground">Pathao 1-Click</span>
                                <span className="rounded bg-red-500/20 text-red-600 dark:text-red-400 text-[9px] font-bold px-1.5 py-0.2 uppercase">Instant</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                COD: {order.payment_status === 'paid' ? '৳0 (Paid)' : formatCurrency(Number(order.total) || 0, defaultCurrency)}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-red-600 dark:text-red-400 group-hover:translate-x-0.5 transition-transform">
                            Book &rarr;
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="relative py-1 flex items-center justify-center">
                      <div className="border-t border-border w-full" />
                      <span className="bg-card px-2 text-[10px] uppercase font-bold text-muted-foreground absolute">
                        or manual shipping tracking
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 bg-muted/20 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        Want 1-Click Automated Courier Booking?
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Connect your Steadfast or Pathao merchant credentials in Settings &gt; Courier to book parcels directly without opening their websites.
                      </p>
                    </div>
                    <Link
                      href="/settings?tab=courier"
                      target="_blank"
                      className="shrink-0 text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>Configure</span>
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                )}

                {/* Free Manual Delivery Tracking Form (Tier 1 Default) */}
                <div className="rounded-lg border bg-muted/10 p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Courier Preset Selector */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Courier Name
                      </label>
                      <select
                        value={selectedCourier}
                        onChange={(e) => handleCourierSelectChange(e.target.value)}
                        className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                      >
                        {PRESET_COURIERS.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} ({c.nameBn})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Courier Name Input (if Other selected) */}
                    {selectedCourier.includes('Other') && (
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          Custom Courier Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. In-House Rider or Local Van"
                          value={customCourierName}
                          onChange={(e) => setCustomCourierName(e.target.value)}
                          className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    )}

                    {/* Tracking / Memo Number Input */}
                    <div className={`space-y-1 ${selectedCourier.includes('Other') ? 'sm:col-span-1' : 'sm:col-span-2'}`}>
                      <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                        <span>Tracking / Consignment / Memo #</span>
                        <span className="text-[10px] text-primary font-normal">Required to ship</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 5241098 or CN-994827"
                        value={trackingCodeInput}
                        onChange={(e) => handleTrackingCodeChange(e.target.value)}
                        className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Optional Custom Tracking URL Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Tracking URL (Auto-generated for known couriers)</span>
                      <span className="text-[10px] text-muted-foreground">Optional</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://... (auto-filled if recognized)"
                      value={trackingUrlInput}
                      onChange={(e) => setTrackingUrlInput(e.target.value)}
                      className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs font-mono text-muted-foreground focus:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2">
                    <p className="text-[11px] text-muted-foreground italic">
                      Saving marks order as <strong>Shipped</strong> and sends tracking notice to customer.
                    </p>

                    <div className="flex items-center gap-2">
                      {isEditingCourier && (
                        <button
                          type="button"
                          onClick={() => setIsEditingCourier(false)}
                          className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={bookingCourier || !trackingCodeInput.trim()}
                        onClick={() => handleBookCourier('manual')}
                        className="flex items-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {bookingCourier ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Truck className="size-3.5" />
                        )}
                        <span>Save &amp; Mark as Shipped</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(Number(item.unit_price) || 0, defaultCurrency)}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold">{item.quantity}</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground font-mono">
                        {formatCurrency(Number(item.total) || 0, defaultCurrency)}
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
