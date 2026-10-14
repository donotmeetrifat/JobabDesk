'use client'

import React, { useEffect, useState, useMemo, use } from 'react'
import Image from 'next/image'
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
  Sparkles,
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

const PAYMENT_METHODS = [
  {
    id: 'bkash',
    name: 'bKash',
    subtext: 'Send / Pay',
    icon: '/images/payment-methods/bkash.png',
    brandColor: '#e2136e',
    activeBg: 'bg-pink-50/70',
    activeBorder: 'border-[#e2136e]',
    activeRing: 'ring-2 ring-[#e2136e]/20',
  },
  {
    id: 'nagad',
    name: 'Nagad',
    subtext: 'Send / Pay',
    icon: '/images/payment-methods/nagad.png',
    brandColor: '#f7941d',
    activeBg: 'bg-orange-50/70',
    activeBorder: 'border-[#f7941d]',
    activeRing: 'ring-2 ring-[#f7941d]/20',
  },
  {
    id: 'rocket',
    name: 'Rocket',
    subtext: 'Personal / Pay',
    icon: '/images/payment-methods/rocket.png',
    brandColor: '#8c3494',
    activeBg: 'bg-purple-50/70',
    activeBorder: 'border-[#8c3494]',
    activeRing: 'ring-2 ring-[#8c3494]/20',
  },
  {
    id: 'bank',
    name: 'Cards / Bank',
    subtext: 'NPSB / Card',
    icon: '/images/payment-methods/card.png',
    brandColor: '#2563eb',
    activeBg: 'bg-blue-50/70',
    activeBorder: 'border-[#2563eb]',
    activeRing: 'ring-2 ring-[#2563eb]/20',
  },
] as const

type MethodId = (typeof PAYMENT_METHODS)[number]['id']

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
  const [activeMethod, setActiveMethod] = useState<MethodId>('bkash')
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
        const clean = data.order.customer_phone.replace(/^\+88/, '').trim()
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
    if (typeof window !== 'undefined') {
      const type = new URLSearchParams(window.location.search).get('type')
      if (type === 'delivery_advance') {
        setPaymentType('delivery_advance')
      }
    }
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
      <div className="min-h-[100dvh] bg-[#faf8ff] text-slate-800 flex flex-col items-center justify-center p-4 pt-safe pb-safe">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Loading secure payment portal...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-[100dvh] bg-[#faf8ff] text-slate-800 flex items-center justify-center p-4 pt-safe pb-safe">
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
                placeholder="e.g. ORD-2026-0002 or 017XXXXXXXX"
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
  const currentMethodConfig = PAYMENT_METHODS.find((m) => m.id === activeMethod) || PAYMENT_METHODS[0]

  return (
    <div
      className="min-h-[100dvh] text-slate-800 antialiased font-sans flex flex-col justify-between pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] px-4 sm:px-6 lg:px-8 overflow-x-hidden"
      style={{
        backgroundColor: '#faf8ff',
        backgroundImage:
          'radial-gradient(at 100% 0%, rgba(0, 102, 255, 0.04) 0px, transparent 40%), radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.03) 0px, transparent 40%)',
      }}
    >
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* BEGIN: Top Header Bar */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          {/* Merchant Identity & Trust Badge */}
          <div className="flex items-center gap-3">
            {store?.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name}
                className="h-10 w-10 rounded-xl object-cover border border-slate-200 shadow-sm"
              />
            ) : (
              <img
                src="/logo.png"
                alt="JobabDesk"
                className="h-10 w-10 rounded-xl object-contain bg-white p-1 border border-slate-200 shadow-sm"
              />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  {store?.name || 'Digiplus Official Store'}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Verified Merchant
                </span>
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span>Checkout via JobabDesk Pay</span>
                {store?.business_tagline && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {store.business_tagline}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* JobabDesk Original Brand Badge */}
          <div className="flex items-center gap-2.5 bg-white px-3.5 py-1.5 rounded-full border border-slate-200/90 shadow-2xs">
            <img src="/logo.png" alt="JobabDesk" className="w-5 h-5 rounded-md object-contain" />
            <span className="text-xs font-bold text-slate-800 tracking-tight">JobabDesk Pay</span>
          </div>
        </header>
        {/* END: Top Header Bar */}

        {/* BEGIN: Main Container */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/90 overflow-hidden">
          {/* Top Order Reference Strip */}
          <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">
                Order Reference
              </span>
              <span className="font-mono text-sm font-bold text-amber-300 bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700">
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
                ●{' '}
                {order.payment_status === 'paid'
                  ? 'Paid'
                  : order.payment_status === 'payment_submitted'
                    ? 'Submitted'
                    : 'Pending Payment'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Payable Amount:</span>
              <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-1">
                <span className="text-emerald-400 font-mono font-bold">৳</span>
                <span className="text-emerald-400 font-mono font-bold">
                  {payableAmount.toLocaleString()}
                </span>
                <span className="text-xs font-normal text-slate-400 ml-0.5">BDT</span>
              </div>
            </div>
          </div>

          {/* Two-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            {/* LEFT COLUMN: Order Breakdown & Customer */}
            <aside className="lg:col-span-5 bg-slate-50/60 p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                {/* Customer Details */}
                <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Customer Details
                    </span>
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                      Verified Client
                    </span>
                  </div>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-start gap-2.5">
                      <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
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

                {/* Items In Order */}
                <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Items In Order ({order.items.length})
                    </span>
                    <span className="text-xs font-medium text-slate-400">Invoice Breakdown</span>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {order.items.length > 0 ? (
                      order.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-1.5 border-b border-slate-50 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-100 shrink-0">
                              {item.quantity}x
                            </div>
                            <div className="truncate">
                              <p className="font-medium text-slate-800 truncate leading-snug">
                                {item.product_name}
                              </p>
                              {item.product_sku && (
                                <p className="text-[10px] text-slate-400 font-mono">
                                  SKU: {item.product_sku}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-semibold text-slate-800 shrink-0">
                            ৳{item.total.toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-between py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-100">
                            1x
                          </div>
                          <p className="font-medium text-slate-800">Order #{order.order_number}</p>
                        </div>
                        <span className="font-mono font-semibold text-slate-800">
                          ৳{order.total.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Calculations */}
                  <div className="pt-3 space-y-1.5 text-xs text-slate-600 border-t border-slate-100">
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
                    {(order.discount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Direct Payment Discount</span>
                        <span className="font-mono font-medium">
                          -৳{order.discount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                      <span>Total Invoice</span>
                      <span className="font-mono text-base text-blue-600">
                        ৳{order.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* COD Advance notice */}
                {paymentType === 'delivery_advance' && (
                  <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-200 text-amber-900 text-xs">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900">Delivery Advance Selected</p>
                        <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                          You pay <strong>৳{codAdvanceAmount.toLocaleString()}</strong> now. The remaining{' '}
                          <strong>
                            ৳{(order.total - codAdvanceAmount).toLocaleString()}
                          </strong>{' '}
                          will be collected on delivery.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Merchant note if any */}
                {store?.special_instructions && (
                  <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 text-slate-600 text-xs">
                    <span className="font-semibold text-slate-800 block mb-0.5">Merchant Note:</span>
                    <p className="text-[11px] whitespace-pre-line leading-relaxed text-slate-600">
                      {store.special_instructions}
                    </p>
                  </div>
                )}
              </div>
            </aside>

            {/* RIGHT COLUMN: Payment Option, Branded Channel Selector & Submission */}
            <main className="lg:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-6">
              <div>
                {/* Already Paid Banner */}
                {order.payment_status === 'paid' ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-3 animate-pulse-glow">
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
                  /* Payment Submitted Banner */
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                      <Clock className="w-7 h-7 animate-pulse" />
                    </div>
                    <h3 className="text-lg font-bold text-amber-900">Payment Submitted for Review</h3>
                    <p className="text-xs text-amber-700 max-w-md mx-auto leading-relaxed">
                      We received your payment submission. The merchant will verify your TrxID shortly and confirm your dispatch.
                    </p>
                    {latestRequest && (
                      <div className="bg-white rounded-xl p-3.5 border border-amber-200 text-left text-xs max-w-sm mx-auto space-y-1.5 shadow-xs">
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
                ) : (
                  <div className="space-y-6">
                    {/* Step 1: Payment Option */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          1. Choose Payment Option
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Full Payment Card */}
                        <div
                          onClick={() => setPaymentType('full')}
                          className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                            paymentType === 'full'
                              ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600/20 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900">Full Payment</span>
                            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                              Recommended
                            </span>
                          </div>
                          <div className="flex items-baseline gap-1 my-0.5">
                            <span className="text-xs font-bold text-slate-600">৳</span>
                            <span className="text-xl font-mono font-bold text-slate-900">
                              {order.total.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            100% Paid upfront. Fast VIP dispatch.
                          </p>
                        </div>

                        {/* Delivery Advance Card */}
                        {allowCodAdvance && (
                          <div
                            onClick={() => setPaymentType('delivery_advance')}
                            className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                              paymentType === 'delivery_advance'
                                ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600/20 shadow-xs'
                                : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-900">Delivery Advance</span>
                              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                Partial
                              </span>
                            </div>
                            <div className="flex items-baseline gap-1 my-0.5">
                              <span className="text-xs font-bold text-slate-600">৳</span>
                              <span className="text-xl font-mono font-bold text-slate-900">
                                {codAdvanceAmount.toLocaleString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Pay remaining ৳{(order.total - codAdvanceAmount).toLocaleString()} on COD delivery.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: Gateway Channel Selector with Real Icons */}
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          2. Select Payment Method
                        </label>
                        <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Instant Verification
                        </span>
                      </div>

                      {/* 4 Brand Tiles Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {PAYMENT_METHODS.map((method) => {
                          const isSelected = activeMethod === method.id
                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => setActiveMethod(method.id)}
                              className={`relative p-3 rounded-xl border-2 flex flex-col items-center text-center transition-all cursor-pointer ${
                                isSelected
                                  ? `${method.activeBorder} ${method.activeBg} ${method.activeRing} shadow-sm`
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                              }`}
                            >
                              {/* Selected check indicator */}
                              {isSelected && (
                                <div
                                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                                  style={{ backgroundColor: method.brandColor }}
                                >
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              )}

                              {/* Real Brand Icon */}
                              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center mb-1.5 bg-white shadow-2xs">
                                <img
                                  src={method.icon}
                                  alt={method.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>

                              <span className="text-xs font-bold text-slate-900 leading-tight">
                                {method.name}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {method.subtext}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Step 3: Branded Payment Instructions Box */}
                    <div
                      className={`rounded-2xl border p-4 sm:p-5 transition-all ${
                        activeMethod === 'bkash'
                          ? 'border-pink-200 bg-pink-50/30'
                          : activeMethod === 'nagad'
                            ? 'border-orange-200 bg-orange-50/30'
                            : activeMethod === 'rocket'
                              ? 'border-purple-200 bg-purple-50/30'
                              : 'border-blue-200 bg-blue-50/30'
                      }`}
                    >
                      {/* Top Banner with Brand Logo and Badge */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={currentMethodConfig.icon}
                            alt={currentMethodConfig.name}
                            className="w-6 h-6 rounded-md object-contain shadow-2xs"
                          />
                          <span className="text-xs font-bold text-slate-900">
                            {currentMethodConfig.name} Payment Instructions
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                          Auto-Confirmed
                        </span>
                      </div>

                      {/* Number Display Box */}
                      {activeMethod !== 'bank' ? (
                        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                              Merchant {currentMethodConfig.name} Number
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {activeNumber ? (
                                <>
                                  <span className="font-mono text-lg sm:text-xl font-bold tracking-wider text-slate-900">
                                    {activeNumber}
                                  </span>
                                  <span className="text-[10px] uppercase font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                    {activeType === 'merchant'
                                      ? 'Merchant Account'
                                      : activeType === 'agent'
                                        ? 'Agent Account'
                                        : 'Personal / Send Money'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-sm font-semibold text-slate-400 italic">
                                    Not Configured by Merchant
                                  </span>
                                  <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                    Unavailable
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {activeNumber ? (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(activeNumber, activeMethod)}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer shadow-xs active:scale-95"
                              style={{ backgroundColor: currentMethodConfig.brandColor }}
                            >
                              {copiedKey === activeMethod ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy Number</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-center">
                              No Number Provided
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs mb-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                              Merchant Card / Bank Transfer Details
                            </span>
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
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {copiedKey === 'bank' ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-600">Copied Details</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy Details</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                          {store?.payment_settings?.bank?.details || fallbackSettings.bank?.details ? (
                            <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/80">
                              <p className="font-mono text-xs text-slate-800 whitespace-pre-line leading-relaxed">
                                {store?.payment_settings?.bank?.details || fallbackSettings.bank?.details}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 italic py-1">
                              Direct Card or Bank Transfer details have not been configured by the merchant yet. Please select bKash, Nagad, or Rocket.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Clear Step-by-Step Instructions */}
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            1
                          </span>
                          <p>
                            {activeMethod === 'bank' ? (
                              <>
                                Transfer via <strong>Card (Visa / MasterCard / NPSB) or Bank App</strong> to the merchant account above.
                              </>
                            ) : activeNumber ? (
                              <>
                                Open <strong>{currentMethodConfig.name} App</strong>{' '}
                                {activeMethod === 'bkash'
                                  ? '(or dial *247#)'
                                  : activeMethod === 'nagad'
                                    ? '(or dial *167#)'
                                    : activeMethod === 'rocket'
                                      ? '(or dial *322#)'
                                      : ''}{' '}
                                and select{' '}
                                <strong className="text-slate-900">
                                  {activeType === 'merchant' ? 'Payment' : 'Send Money'}
                                </strong>
                                .
                              </>
                            ) : (
                              <>
                                This merchant has not configured a {currentMethodConfig.name} number yet. Please choose an active payment method.
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            2
                          </span>
                          <p>
                            {activeMethod === 'bank' ? (
                              <>
                                Transfer exact payable amount:{' '}
                                <strong className="text-emerald-700 font-mono font-bold text-sm">
                                  ৳{payableAmount.toLocaleString()}
                                </strong>
                              </>
                            ) : (
                              <>
                                Enter merchant number and send exact amount:{' '}
                                <strong className="text-emerald-700 font-mono font-bold text-sm">
                                  ৳{payableAmount.toLocaleString()}
                                </strong>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            3
                          </span>
                          <p>
                            Copy the <strong>Transaction ID (TrxID) / Bank Reference</strong> received in the SMS confirmation and enter below.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Step 4: Submission Form */}
                    <form className="space-y-4 pt-1" onSubmit={handleSubmit}>
                      {/* Sender Phone */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            className="block text-xs font-bold text-slate-700"
                            htmlFor="senderPhone"
                          >
                            Sender {currentMethodConfig.name} Account Number{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[11px] text-slate-400">Account used to send</span>
                        </div>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
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
                            className="w-full pl-11 pr-3 py-2.5 text-sm font-mono rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs outline-none"
                          />
                        </div>
                      </div>

                      {/* Transaction ID */}
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
                          placeholder={
                            activeMethod === 'bkash' ? 'E.G. BJA830K29X (10 digits)' : 'E.G. 9J1820XYZ'
                          }
                          className="w-full px-3.5 py-2.5 text-sm font-mono tracking-wider uppercase rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs placeholder:text-slate-300 outline-none"
                        />
                        <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3 text-blue-500 shrink-0" />
                          <span>
                            <strong>Anti-Fraud:</strong> Each TrxID is cryptographically verified to prevent double spending.
                          </span>
                        </p>
                      </div>

                      {/* Optional Reference */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label
                            className="block text-xs font-bold text-slate-700"
                            htmlFor="orderNotes"
                          >
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
                          placeholder="e.g. Sent from uncle's account"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-2xs placeholder:text-slate-300 outline-none"
                        />
                      </div>

                      {/* Primary CTA Submit Button */}
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
                  </div>
                )}
              </div>

              {/* Bottom Security Seals */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Secure Direct Settlement</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <img src="/logo.png" alt="JobabDesk" className="w-3.5 h-3.5 object-contain" />
                  <span className="font-semibold text-slate-600">JobabDesk Verified</span>
                </div>
              </div>
            </main>
          </div>
        </div>
        {/* END: Main Container */}

        {/* BEGIN: Gateway Footer */}
        <footer className="text-center text-xs text-slate-500 pb-4">
          <a
            href="https://jobabdesk.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 hover:bg-white border border-slate-200/80 hover:border-slate-300 shadow-2xs transition-all group"
          >
            <img src="/logo.png" alt="JobabDesk" className="w-4 h-4 object-contain" />
            <span className="text-[11px] text-slate-500 group-hover:text-slate-700 transition-colors">
              Powered by <strong className="text-slate-800 font-semibold group-hover:text-blue-600 transition-colors">JobabDesk</strong>
            </span>
          </a>
        </footer>
        {/* END: Gateway Footer */}
      </div>
    </div>
  )
}
