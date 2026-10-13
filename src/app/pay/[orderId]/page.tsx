'use client'

import React, { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { parsePaymentInstructions } from '@/lib/payments/instruction-parser'
import {
  ShieldCheck,
  Copy,
  Check,
  MapPin,
  Phone,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  Lock,
  Building2,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface OrderItem {
  id: string
  product_name: string
  product_sku: string | null
  unit_price: number
  quantity: number
  total: number
}

interface OrderData {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string | null
  customer_address: string | null
  delivery_charge: number
  subtotal: number
  discount: number
  total: number
  status: string
  payment_status: string
  payment_method: string | null
  notes: string | null
  created_at: string
  items: OrderItem[]
}

interface StoreData {
  name: string
  logo_url: string | null
  business_tagline: string | null
  special_instructions?: string | null
  payment_settings: {
    bkash?: { number: string; type: 'personal' | 'merchant' | 'agent' }
    nagad?: { number: string; type: 'personal' | 'merchant' }
    rocket?: { number: string; type: 'personal' | 'merchant' }
    bank?: { details: string }
    allow_cod_advance?: boolean
    cod_advance_amount?: number
    special_instructions?: string
  }
}

interface PaymentRequestData {
  id: string
  order_id: string
  amount: number
  payment_method: string
  payment_type: string
  sender_number: string
  trx_id: string
  notes: string | null
  status: 'submitted' | 'verified' | 'rejected'
  rejection_reason?: string | null
  created_at: string
}

export default function PublicPaymentPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestData[]>([])

  // UI state
  const [activeMethod, setActiveMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank'>('bkash')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'full' | 'delivery_advance'>('full')
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [lookupQuery, setLookupQuery] = useState('')

  const fetchOrderData = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/pay/${encodeURIComponent(orderId)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load order payment details.')
      }

      setOrder(data.order)
      setStore(data.store)
      setPaymentRequests(data.payment_requests || [])

      if (typeof window !== 'undefined' && data.order?.order_number) {
        try {
          localStorage.setItem('jobabdesk_last_order', data.order.order_number)
        } catch {}
      }

      // Auto-prefill sender number with customer phone if available
      if (data.order?.customer_phone && !senderNumber) {
        // Strip country code if prefixed for cleaner input
        let clean = data.order.customer_phone.replace(/^\+88/, '').trim()
        setSenderNumber(clean)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load payment page'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrderData()
  }, [orderId])

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = lookupQuery.trim().replace(/^#+/, '').trim()
    if (!clean) return
    router.push(`/pay/${encodeURIComponent(clean)}`)
  }

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    toast.success('Copied to clipboard!')
    setTimeout(() => {
      setCopiedKey(null)
    }, 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!senderNumber.trim()) {
      toast.error('Please enter the mobile number used to send the payment.')
      return
    }

    const cleanTrx = trxId.trim().toUpperCase()
    if (!cleanTrx || cleanTrx.length < 8) {
      toast.error('Transaction ID must be at least 8 alphanumeric characters.')
      return
    }

    if (activeMethod === 'bkash' && cleanTrx.length !== 10) {
      toast.error('bKash Transaction ID must be exactly 10 characters (e.g. BJA830K29X).')
      return
    }

    try {
      setSubmitting(true)
      // Format sender phone with standard prefix if user entered local digits
      const formattedSender = senderNumber.trim().startsWith('+88')
        ? senderNumber.trim()
        : senderNumber.trim().startsWith('88')
          ? `+${senderNumber.trim()}`
          : senderNumber.trim()

      const res = await fetch(`/api/pay/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: activeMethod,
          sender_number: formattedSender,
          trx_id: cleanTrx,
          payment_type: paymentType,
          notes: notes.trim() || undefined,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Submission failed. Please check your TrxID.')
      }

      toast.success('Payment submitted! Merchant verification is in progress.')
      setShowResubmitForm(false)
      setTrxId('')
      setNotes('')
      await fetchOrderData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit payment details.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Fallback parsed settings in case direct settings were not passed
  const fallbackSettings = useMemo(() => {
    return parsePaymentInstructions(store?.special_instructions)
  }, [store?.special_instructions])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Loading secure payment portal...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200/90 rounded-2xl p-6 text-center shadow-xl space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Order Not Found</h2>
            <p className="text-slate-500 text-xs">
              {error || 'We could not locate this order with the provided link.'}
            </p>
          </div>

          <form onSubmit={handleLookupSubmit} className="space-y-2.5 pt-2 text-left">
            <label className="text-[11px] font-semibold text-slate-700 block">
              Search by Order Number or Phone Number:
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. ORD-2026-0001 or 017XXXXXXXX"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 font-mono text-xs focus:border-blue-600"
              />
              <Button
                type="submit"
                disabled={!lookupQuery.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 font-semibold"
              >
                Find
              </Button>
            </div>
          </form>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
              onClick={() => window.location.reload()}
            >
              Retry Loading
            </Button>
            <Button
              variant="ghost"
              className="flex-1 text-slate-500 hover:text-slate-900 text-xs"
              onClick={() => router.push('/pay')}
            >
              Payment Portal
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const codAdvanceAmount =
    store?.payment_settings?.cod_advance_amount ?? order.delivery_charge ?? 150
  const allowCodAdvance = store?.payment_settings?.allow_cod_advance ?? true

  const activeNumber =
    activeMethod === 'bkash'
      ? store?.payment_settings?.bkash?.number || fallbackSettings.bkash?.number || ''
      : activeMethod === 'nagad'
        ? store?.payment_settings?.nagad?.number || fallbackSettings.nagad?.number || ''
        : activeMethod === 'rocket'
          ? store?.payment_settings?.rocket?.number || fallbackSettings.rocket?.number || ''
          : null

  const activeType =
    activeMethod === 'bkash'
      ? store?.payment_settings?.bkash?.type || fallbackSettings.bkash?.type || 'personal'
      : activeMethod === 'nagad'
        ? store?.payment_settings?.nagad?.type || fallbackSettings.nagad?.type || 'personal'
        : activeMethod === 'rocket'
          ? store?.payment_settings?.rocket?.type || fallbackSettings.rocket?.type || 'personal'
          : null

  const payableAmount = paymentType === 'delivery_advance' ? codAdvanceAmount : order.total
  const latestRequest = paymentRequests[0]

  return (
    <div
      className="min-h-screen text-slate-800 antialiased font-sans flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: '#faf8ff',
        backgroundImage:
          'radial-gradient(at 100% 0%, rgba(0, 102, 255, 0.05) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.04) 0px, transparent 50%)',
      }}
    >
      {/* BEGIN: Top Trust Bar */}
      <header className="max-w-5xl mx-auto w-full mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Merchant Identity & Trust Badge */}
        <div className="flex items-center gap-3">
          {store?.logo_url ? (
            <img
              src={store.logo_url}
              alt={store.name}
              className="h-10 w-10 rounded-xl object-cover border border-slate-200 shadow-md shadow-blue-500/10"
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-md shadow-blue-500/20">
              {store?.name?.charAt(0) || 'J'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                {store?.name || 'Digiplus Official Store'}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified Merchant
              </span>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span>Checkout via JobabDesk Pay</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500 font-mono text-[11px]">
                {store?.business_tagline || 'Direct Settlement Enabled'}
              </span>
            </p>
          </div>
        </div>

        {/* Security Badges */}
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>256-Bit SSL Encrypted</span>
          </div>
          <div className="h-3 w-px bg-slate-200"></div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Lock className="w-4 h-4 text-blue-600" />
            <span>PCI-DSS Validated</span>
          </div>
        </div>
      </header>
      {/* END: Top Trust Bar */}

      {/* BEGIN: Main Gateway Card */}
      <main className="max-w-5xl mx-auto w-full bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/90 overflow-hidden my-auto">
        {/* Top Reference Strip */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">
              Order Reference
            </span>
            <span className="font-mono text-sm font-bold text-amber-300 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700">
              #{order.order_number}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                order.payment_status === 'paid'
                  ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30'
                  : order.payment_status === 'payment_submitted'
                    ? 'bg-amber-400/10 text-amber-300 border-amber-400/30'
                    : 'bg-slate-700/50 text-slate-300 border-slate-600'
              }`}
            >
              ● {order.payment_status === 'paid'
                ? 'Paid'
                : order.payment_status === 'payment_submitted'
                  ? 'Submitted'
                  : 'Submitted'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-right">
            <span className="text-xs text-slate-400 font-medium">Payable Amount:</span>
            <div className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-baseline gap-0.5">
              <span className="text-emerald-400 font-mono text-lg font-bold">৳</span>
              <span className="text-emerald-400 font-mono font-bold">
                {payableAmount.toLocaleString()}
              </span>
              <span className="text-xs font-normal text-slate-400 ml-1">BDT</span>
            </div>
          </div>
        </div>

        {/* Gateway Body: Two Columns Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* BEGIN: Left Order Summary Panel */}
          <section className="lg:col-span-5 bg-slate-50/70 p-6 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Customer Details Card */}
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Customer Details
                  </span>
                  <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    Verified Client
                  </span>
                </div>
                {/* Customer Meta */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{order.customer_name}</p>
                    </div>
                  </div>
                  {order.customer_phone && (
                    <div className="flex items-start gap-2.5">
                      <Phone className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-mono text-slate-700 font-medium">
                          {order.customer_phone}
                        </span>
                        <button
                          className="text-blue-600 hover:text-blue-700 text-[11px] font-semibold cursor-pointer"
                          onClick={() => copyToClipboard(order.customer_phone || '', 'phone')}
                          title="Copy Phone"
                          type="button"
                        >
                          {copiedKey === 'phone' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                  {order.customer_address && (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <p className="text-slate-600 leading-relaxed">{order.customer_address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Line Items */}
              <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Items In Order ({order.items.length})
                  </span>
                  <span className="text-xs font-medium text-slate-500">Invoice Breakdown</span>
                </div>

                {/* Items List */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {order.items.length > 0 ? (
                    order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-2 border-b border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100 shrink-0">
                            {item.quantity}x
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 leading-tight">
                              {item.product_name}
                            </p>
                            {item.product_sku && (
                              <p className="text-[11px] text-slate-400">SKU: {item.product_sku}</p>
                            )}
                          </div>
                        </div>
                        <span className="font-mono font-semibold text-slate-700">
                          ৳{item.total.toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                          1x
                        </div>
                        <p className="font-medium text-slate-800">Order #{order.order_number}</p>
                      </div>
                      <span className="font-mono font-semibold text-slate-700">
                        ৳{order.total.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Price Breakdown Calculation */}
                <div className="pt-3 space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-mono text-slate-800">
                      ৳{order.subtotal.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Standard Shipping</span>
                    <span className="font-mono text-slate-800">
                      ৳{(order.delivery_charge || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>Direct Payment Discount</span>
                    <span className="font-mono font-medium">
                      ৳{(order.discount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                    <span>Total Invoice</span>
                    <span className="font-mono text-base text-blue-600">
                      ৳{order.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* COD Notice Box */}
              {paymentType === 'delivery_advance' && (
                <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 text-amber-900 text-xs transition-all">
                  <div className="flex gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-800">Delivery Advance Mode Active</p>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        You are paying only <strong>৳{codAdvanceAmount.toLocaleString()}</strong>{' '}
                        now. The remaining{' '}
                        <strong>
                          ৳{(order.total - codAdvanceAmount).toLocaleString()}
                        </strong>{' '}
                        will be collected by courier at delivery.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Special Instructions Box if Present */}
              {store?.special_instructions && (
                <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 text-slate-600 text-xs">
                  <span className="font-semibold text-slate-800 block mb-1">Merchant Notice:</span>
                  <p className="text-[11px] whitespace-pre-line leading-relaxed">
                    {store.special_instructions}
                  </p>
                </div>
              )}
            </div>

            {/* Left Footer Security Note */}
            <div className="pt-6 mt-6 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Buyer Protection Guarantee
              </span>
              <span>SSLCOMMERZ Standard</span>
            </div>
          </section>
          {/* END: Left Order Summary Panel */}

          {/* BEGIN: Right Primary Payment Area */}
          <section className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              {/* Order is Already Paid */}
              {order.payment_status === 'paid' ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-emerald-900">Payment Verified & Approved</h3>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
                    Your payment of ৳{order.total.toLocaleString()} has been officially verified by the merchant. Your package is currently being processed for dispatch.
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-emerald-200 rounded-full font-mono text-xs text-emerald-800 font-semibold">
                    Order #{order.order_number}
                  </div>
                </div>
              ) : order.payment_status === 'payment_submitted' && !showResubmitForm ? (
                /* Payment is Submitted and Pending Review */
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <Clock className="w-7 h-7 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-amber-900">Payment Submitted for Review</h3>
                  <p className="text-xs text-amber-700 max-w-md mx-auto leading-relaxed">
                    We received your transaction submission. The merchant will verify your TrxID shortly and update your order status.
                  </p>
                  {latestRequest && (
                    <div className="bg-white rounded-xl p-3 border border-amber-200/80 text-left text-xs max-w-sm mx-auto space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Method:</span>
                        <span className="font-semibold text-slate-800 capitalize">
                          {latestRequest.payment_method}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">TrxID:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {latestRequest.trx_id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Amount:</span>
                        <span className="font-mono font-semibold text-emerald-600">
                          ৳{latestRequest.amount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowResubmitForm(true)}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline cursor-pointer"
                    >
                      Need to submit a different TrxID or phone number?
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Step 1: Payment Option Selection (Full vs Delivery Advance) */}
              {(order.payment_status !== 'paid' && (order.payment_status !== 'payment_submitted' || showResubmitForm)) && (
                <>
                  <div className="mb-6">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                      1. Choose Payment Option
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Option A: Full Payment */}
                      <div
                        onClick={() => setPaymentType('full')}
                        className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer shadow-xs transition-all ${
                          paymentType === 'full'
                            ? 'border-blue-600 bg-blue-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-blue-900">Full Payment</span>
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                            Recommended
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 my-0.5">
                          <span className="text-xs font-bold text-slate-700">৳</span>
                          <span className="text-xl font-mono font-bold text-slate-900">
                            {order.total.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          100% Paid upfront. Fast VIP dispatch.
                        </p>
                      </div>

                      {/* Option B: Delivery Advance */}
                      {allowCodAdvance && (
                        <div
                          onClick={() => setPaymentType('delivery_advance')}
                          className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer shadow-xs transition-all ${
                            paymentType === 'delivery_advance'
                              ? 'border-blue-600 bg-blue-50/40'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-800">Delivery Advance</span>
                            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              Partial
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 my-0.5">
                            <span className="text-xs font-bold text-slate-700">৳</span>
                            <span className="text-xl font-mono font-bold text-slate-900">
                              {codAdvanceAmount.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Pay remaining ৳{(order.total - codAdvanceAmount).toLocaleString()} on COD delivery.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step 2: Payment Gateway Channels */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        2. Select Gateway Channel
                      </label>
                      <span className="text-[11px] text-blue-600 font-medium">Instant Verification</span>
                    </div>

                    {/* Gateway Tabs */}
                    <div className="flex border-b border-slate-200 space-x-6 text-xs font-semibold overflow-x-auto">
                      <button
                        type="button"
                        onClick={() => setActiveMethod('bkash')}
                        className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeMethod === 'bkash'
                            ? 'border-b-2 border-[#e2136e] text-[#e2136e]'
                            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {activeMethod === 'bkash' && (
                          <span className="w-2 h-2 rounded-full bg-[#e2136e] animate-ping inline-block" />
                        )}
                        Mobile Banking (bKash)
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMethod('nagad')}
                        className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeMethod === 'nagad'
                            ? 'border-b-2 border-[#f7941d] text-[#f7941d]'
                            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {activeMethod === 'nagad' && (
                          <span className="w-2 h-2 rounded-full bg-[#f7941d] animate-ping inline-block" />
                        )}
                        Nagad
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMethod('rocket')}
                        className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeMethod === 'rocket'
                            ? 'border-b-2 border-[#8c3494] text-[#8c3494]'
                            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {activeMethod === 'rocket' && (
                          <span className="w-2 h-2 rounded-full bg-[#8c3494] animate-ping inline-block" />
                        )}
                        Rocket
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveMethod('bank')}
                        className={`pb-2.5 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                          activeMethod === 'bank'
                            ? 'border-b-2 border-[#0066ff] text-[#0066ff]'
                            : 'border-b-2 border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {activeMethod === 'bank' && (
                          <span className="w-2 h-2 rounded-full bg-[#0066ff] animate-ping inline-block" />
                        )}
                        Cards / Bank
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Payment Instructions Card */}
                  {activeMethod === 'bkash' && (
                    <div className="bg-gradient-to-br from-pink-50/50 via-white to-pink-50/30 rounded-2xl border border-pink-100 p-5 mb-6 relative overflow-hidden shadow-xs">
                      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-pink-100">
                        <div className="flex items-center gap-2">
                          <span className="h-6 px-2.5 rounded-full bg-[#e2136e] text-white text-[11px] font-bold flex items-center tracking-wide">
                            bKash
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Direct Merchant / Personal Pay
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Auto-Confirmed
                        </span>
                      </div>

                      {/* Receiver Wallet Number Banner */}
                      <div className="bg-white rounded-xl p-3.5 border border-pink-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block uppercase tracking-wider">
                            Merchant bKash Number
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-lg sm:text-xl font-bold tracking-wider text-slate-900">
                              {activeNumber || '01326596251'}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {activeType === 'merchant'
                                ? 'Merchant Account'
                                : activeType === 'agent'
                                  ? 'Agent Account'
                                  : 'Personal / Send Money'}
                            </span>
                          </div>
                        </div>
                        <button
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-pink-50 text-pink-700 hover:bg-pink-100 rounded-lg text-xs font-semibold border border-pink-200 transition-colors cursor-pointer"
                          onClick={() => copyToClipboard(activeNumber || '01326596251', 'bkash')}
                          type="button"
                        >
                          {copiedKey === 'bkash' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === 'bkash' ? 'Copied!' : 'Copy Number'}</span>
                        </button>
                      </div>

                      {/* Steps Helper */}
                      <div className="space-y-2 text-xs text-slate-700">
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p>
                            Open <strong>bKash App</strong> or dial <strong>*247#</strong> and tap{' '}
                            <span className="text-[#e2136e] font-semibold">
                              {activeType === 'merchant' ? 'Payment' : 'Send Money'}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p>
                            Send exact amount:{' '}
                            <strong className="text-emerald-700 font-mono font-bold text-sm">
                              ৳{payableAmount.toLocaleString()}
                            </strong>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p>
                            Copy the <strong>10-digit Transaction ID (TrxID)</strong> received in SMS and enter below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeMethod === 'nagad' && (
                    <div className="bg-gradient-to-br from-orange-50/50 via-white to-orange-50/30 rounded-2xl border border-orange-100 p-5 mb-6 relative overflow-hidden shadow-xs">
                      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-orange-100">
                        <div className="flex items-center gap-2">
                          <span className="h-6 px-2.5 rounded-full bg-[#f7941d] text-white text-[11px] font-bold flex items-center tracking-wide">
                            Nagad
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Direct Merchant / Personal Pay
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Auto-Confirmed
                        </span>
                      </div>

                      {/* Receiver Wallet Number Banner */}
                      <div className="bg-white rounded-xl p-3.5 border border-orange-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block uppercase tracking-wider">
                            Merchant Nagad Number
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-lg sm:text-xl font-bold tracking-wider text-slate-900">
                              {activeNumber || '01326596251'}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {activeType === 'merchant' ? 'Merchant Account' : 'Personal / Send Money'}
                            </span>
                          </div>
                        </div>
                        <button
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-lg text-xs font-semibold border border-orange-200 transition-colors cursor-pointer"
                          onClick={() => copyToClipboard(activeNumber || '01326596251', 'nagad')}
                          type="button"
                        >
                          {copiedKey === 'nagad' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === 'nagad' ? 'Copied!' : 'Copy Number'}</span>
                        </button>
                      </div>

                      {/* Steps Helper */}
                      <div className="space-y-2 text-xs text-slate-700">
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p>
                            Open <strong>Nagad App</strong> or dial <strong>*167#</strong> and tap{' '}
                            <span className="text-[#f7941d] font-semibold">
                              {activeType === 'merchant' ? 'Merchant Pay' : 'Send Money'}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p>
                            Send exact amount:{' '}
                            <strong className="text-emerald-700 font-mono font-bold text-sm">
                              ৳{payableAmount.toLocaleString()}
                            </strong>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p>
                            Copy the <strong>8-10 digit Transaction ID (TrxID)</strong> received in SMS and enter below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeMethod === 'rocket' && (
                    <div className="bg-gradient-to-br from-purple-50/50 via-white to-purple-50/30 rounded-2xl border border-purple-100 p-5 mb-6 relative overflow-hidden shadow-xs">
                      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-purple-100">
                        <div className="flex items-center gap-2">
                          <span className="h-6 px-2.5 rounded-full bg-[#8c3494] text-white text-[11px] font-bold flex items-center tracking-wide">
                            Rocket
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Direct Merchant / Personal Pay
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Auto-Confirmed
                        </span>
                      </div>

                      {/* Receiver Wallet Number Banner */}
                      <div className="bg-white rounded-xl p-3.5 border border-purple-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block uppercase tracking-wider">
                            Merchant Rocket Number
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-lg sm:text-xl font-bold tracking-wider text-slate-900">
                              {activeNumber || '01326596251'}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {activeType === 'merchant' ? 'Merchant Payment' : 'Personal / Send Money'}
                            </span>
                          </div>
                        </div>
                        <button
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg text-xs font-semibold border border-purple-200 transition-colors cursor-pointer"
                          onClick={() => copyToClipboard(activeNumber || '01326596251', 'rocket')}
                          type="button"
                        >
                          {copiedKey === 'rocket' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedKey === 'rocket' ? 'Copied!' : 'Copy Number'}</span>
                        </button>
                      </div>

                      {/* Steps Helper */}
                      <div className="space-y-2 text-xs text-slate-700">
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p>
                            Open <strong>Rocket App</strong> or dial <strong>*322#</strong> and select{' '}
                            <span className="text-[#8c3494] font-semibold">
                              {activeType === 'merchant' ? 'Merchant Pay' : 'Send Money'}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p>
                            Send exact amount:{' '}
                            <strong className="text-emerald-700 font-mono font-bold text-sm">
                              ৳{payableAmount.toLocaleString()}
                            </strong>
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p>
                            Copy the <strong>Transaction ID (TrxID)</strong> received in SMS and enter below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeMethod === 'bank' && (
                    <div className="bg-gradient-to-br from-blue-50/50 via-white to-blue-50/30 rounded-2xl border border-blue-100 p-5 mb-6 relative overflow-hidden shadow-xs">
                      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-blue-100">
                        <div className="flex items-center gap-2">
                          <span className="h-6 px-2.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center tracking-wide">
                            Bank Transfer
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            Direct Bank Settlement
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          BEFTN / NPSB
                        </span>
                      </div>

                      <div className="bg-white rounded-xl p-3.5 border border-blue-200/80 shadow-xs mb-4">
                        <span className="text-[11px] font-medium text-slate-500 block uppercase tracking-wider mb-1">
                          Merchant Bank Account Details
                        </span>
                        <p className="font-mono text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                          {store?.payment_settings?.bank?.details ||
                            fallbackSettings.bank?.details ||
                            'Please contact merchant for bank account details.'}
                        </p>
                        {(store?.payment_settings?.bank?.details || fallbackSettings.bank?.details) && (
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                store?.payment_settings?.bank?.details ||
                                  fallbackSettings.bank?.details ||
                                  '',
                                'bank'
                              )
                            }
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedKey === 'bank' ? 'Copied Details' : 'Copy Details'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Submission Form */}
                  <form className="space-y-4" onSubmit={handleSubmit}>
                    {/* Sender Phone Number Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700" htmlFor="senderPhone">
                          Sender {activeMethod === 'bkash' ? 'bKash' : activeMethod === 'nagad' ? 'Nagad' : activeMethod === 'rocket' ? 'Rocket' : 'Bank'} Account Number <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] text-slate-400">Account used to send</span>
                      </div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">
                          +88
                        </div>
                        <input
                          id="senderPhone"
                          name="senderPhone"
                          type="tel"
                          required
                          value={senderNumber}
                          onChange={(e) => setSenderNumber(e.target.value)}
                          placeholder="01XXXXXXXXX"
                          className="w-full pl-11 pr-3 py-2.5 text-sm font-mono rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Transaction ID (TrxID) Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700" htmlFor="trxId">
                          Transaction ID (TrxID) <span className="text-red-500">*</span>
                        </label>
                        <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Found in SMS Confirmation
                        </span>
                      </div>
                      <input
                        id="trxId"
                        name="trxId"
                        type="text"
                        required
                        maxLength={16}
                        value={trxId}
                        onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                        placeholder="E.G. BJA830K29X"
                        className="w-full px-3 py-2.5 text-sm font-mono tracking-wider uppercase rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs placeholder:text-slate-300 outline-none"
                      />
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3 text-blue-500 shrink-0" />
                        <span>
                          <strong>Anti-Fraud:</strong> Each TrxID is cryptographically verified to prevent double spending.
                        </span>
                      </p>
                    </div>

                    {/* Optional Customer Notes */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700" htmlFor="orderNotes">
                          Optional Notes / Reference
                        </label>
                        <span className="text-[11px] text-slate-400">Optional</span>
                      </div>
                      <input
                        id="orderNotes"
                        name="orderNotes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Sent from uncle's bKash account"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs placeholder:text-slate-300 outline-none"
                      />
                    </div>

                    {/* Primary Action Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-60 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Verifying Cryptographic TrxID...</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-4 h-4 text-emerald-200" />
                            <span>Confirm & Submit Payment (৳{payableAmount.toLocaleString()})</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>

            {/* Security Bottom Seals */}
            <div className="pt-6 mt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  Bank-Grade Security
                </span>
                <span className="text-slate-300">•</span>
                <span>Real-time Settlement</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Standard SSLCOMMERZ Layout Spec</span>
              </div>
            </div>
          </section>
          {/* END: Right Primary Payment Area */}
        </div>
      </main>
      {/* END: Main Gateway Card */}

      {/* BEGIN: Gateway Footer */}
      <footer className="max-w-5xl mx-auto w-full mt-6 text-center text-xs text-slate-500 space-y-1.5">
        <p className="flex items-center justify-center gap-2">
          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            0% Commission
          </span>
          <span>Direct Merchant Account Settlement</span>
        </p>
        <p className="text-slate-400 text-[11px]">
          Powered by <strong className="text-slate-700 font-semibold">JobabDesk</strong> • Next-Gen Smart E-Commerce Operating System
        </p>
      </footer>
      {/* END: Gateway Footer */}
    </div>
  )
}
