'use client'

import React, { useEffect, useState, use } from 'react'
import {
  ShieldCheck,
  Copy,
  Check,
  ShoppingBag,
  MapPin,
  Phone,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Building2,
  Sparkles,
  ArrowRight,
  Loader2,
  HelpCircle,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestData[]>([])

  // UI state
  const [showItems, setShowItems] = useState(false)
  const [activeMethod, setActiveMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank'>('bkash')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'full' | 'delivery_advance'>('full')
  const [senderNumber, setSenderNumber] = useState('')
  const [trxId, setTrxId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)

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

      // Auto-prefill sender number with customer phone if available
      if (data.order?.customer_phone && !senderNumber) {
        setSenderNumber(data.order.customer_phone)
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load payment page')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrderData()
  }, [orderId])

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
      const res = await fetch(`/api/pay/${encodeURIComponent(orderId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: activeMethod,
          sender_number: senderNumber.trim(),
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
      // Refresh order state
      await fetchOrderData()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit payment details.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Loading secure payment portal...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Order Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">
            {error || 'We could not locate this order. Please verify your order link.'}
          </p>
          <Button
            variant="outline"
            className="w-full border-slate-700 text-slate-200"
            onClick={() => window.location.reload()}
          >
            Retry Loading
          </Button>
        </div>
      </div>
    )
  }

  const codAdvanceAmount =
    store?.payment_settings?.cod_advance_amount ?? order.delivery_charge ?? 150
  const allowCodAdvance = store?.payment_settings?.allow_cod_advance ?? true

  const activeNumber =
    activeMethod === 'bkash'
      ? store?.payment_settings?.bkash?.number
      : activeMethod === 'nagad'
        ? store?.payment_settings?.nagad?.number
        : activeMethod === 'rocket'
          ? store?.payment_settings?.rocket?.number
          : null

  const activeType =
    activeMethod === 'bkash'
      ? store?.payment_settings?.bkash?.type || 'personal'
      : activeMethod === 'nagad'
        ? store?.payment_settings?.nagad?.type || 'personal'
        : activeMethod === 'rocket'
          ? store?.payment_settings?.rocket?.type || 'personal'
          : null

  const payableAmount = paymentType === 'delivery_advance' ? codAdvanceAmount : order.total
  const latestRequest = paymentRequests[0]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Background radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/3 -right-20 w-[300px] h-[300px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-6 sm:pt-10">
        {/* Top Branding & Security Badge */}
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Verified Merchant • Direct Payment</span>
          </div>

          <div className="flex items-center justify-center gap-3">
            {store?.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name}
                className="w-10 h-10 rounded-xl object-cover border border-slate-800 shadow-md"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-bold text-lg text-white shadow-md">
                {store?.name?.charAt(0) || 'J'}
              </div>
            )}
            <div className="text-left">
              <h1 className="text-lg font-bold text-white tracking-tight">{store?.name}</h1>
              {store?.business_tagline && (
                <p className="text-xs text-slate-400 line-clamp-1">{store.business_tagline}</p>
              )}
            </div>
          </div>
        </header>

        {/* Status Callout if Paid or Payment Submitted */}
        {order.payment_status === 'paid' ? (
          <Card className="bg-gradient-to-b from-emerald-950/60 to-slate-900 border-emerald-500/30 mb-6 shadow-xl backdrop-blur-sm">
            <CardContent className="pt-6 pb-6 text-center">
              <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-emerald-300 mb-1">🎉 Payment Verified!</h2>
              <p className="text-slate-300 text-xs mb-4">
                Your payment has been approved and your order is confirmed. Our team is now packaging and dispatching your items.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-mono">
                Order #{order.order_number} • Total: ৳{order.total.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ) : order.payment_status === 'payment_submitted' && !showResubmitForm ? (
          <Card className="bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-500/30 mb-6 shadow-xl backdrop-blur-sm">
            <CardContent className="pt-6 pb-6 text-center">
              <div className="w-14 h-14 bg-amber-500/20 border border-amber-500/40 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
              </div>
              <h2 className="text-lg font-bold text-amber-300 mb-1">⏳ Payment Submitted</h2>
              <p className="text-slate-300 text-xs mb-3">
                We received your payment submission. The merchant is reviewing the transaction and will confirm your order shortly via WhatsApp/Messenger.
              </p>
              {latestRequest && (
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-left text-xs mb-4 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">TrxID:</span>
                    <span className="font-mono font-semibold text-white">{latestRequest.trx_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Method:</span>
                    <span className="capitalize text-slate-200">{latestRequest.payment_method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Amount:</span>
                    <span className="text-emerald-400 font-semibold">৳{latestRequest.amount.toLocaleString()}</span>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowResubmitForm(true)}
                className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
              >
                Need to submit a different TrxID?
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* Order Summary Card */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl backdrop-blur-md mb-6 overflow-hidden">
          <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                Order Reference
              </span>
              <h3 className="font-mono text-base font-bold text-white flex items-center gap-2">
                #{order.order_number}
                <Badge
                  variant="outline"
                  className={
                    order.payment_status === 'paid'
                      ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                      : order.payment_status === 'payment_submitted'
                        ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        : 'border-slate-700 text-slate-300 bg-slate-800/50'
                  }
                >
                  {order.payment_status === 'payment_submitted'
                    ? 'Submitted'
                    : order.payment_status}
                </Badge>
              </h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Total Due</span>
              <span className="text-xl font-bold text-emerald-400 tracking-tight">
                ৳{order.total.toLocaleString()}
              </span>
            </div>
          </div>

          <CardContent className="p-4 space-y-3 text-xs">
            {/* Recipient Details */}
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/60 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{order.customer_name}</span>
              </div>
              {order.customer_phone && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>{order.customer_phone}</span>
                </div>
              )}
              {order.customer_address && (
                <div className="flex items-start gap-2 text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{order.customer_address}</span>
                </div>
              )}
            </div>

            {/* Collapsible Items Breakdown */}
            <button
              type="button"
              onClick={() => setShowItems(!showItems)}
              className="w-full flex items-center justify-between py-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <ShoppingBag className="w-3.5 h-3.5" />
                {order.items.length} {order.items.length === 1 ? 'item' : 'items'} in order
              </span>
              {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showItems && (
              <div className="pt-2 border-t border-slate-800/60 space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-slate-300">
                    <div>
                      <p className="font-medium text-white">{item.product_name}</p>
                      <p className="text-[11px] text-slate-500">
                        Qty: {item.quantity} × ৳{item.unit_price.toLocaleString()}
                      </p>
                    </div>
                    <span className="font-mono text-slate-200">৳{item.total.toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-800/60 space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>৳{order.subtotal.toLocaleString()}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Discount</span>
                      <span>-৳{order.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Delivery Charge</span>
                    <span>৳{order.delivery_charge.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods & Submission Form */}
        {(order.payment_status !== 'paid' && order.payment_status !== 'payment_submitted') ||
        showResubmitForm ? (
          <Card className="bg-slate-900 border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                Select Payment Method
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pay directly to merchant account and enter Transaction ID (TrxID)
              </p>
            </div>

            <CardContent className="p-4 space-y-5">
              {/* Payment Type Selection (Full vs Delivery Advance) */}
              {allowCodAdvance && (
                <div>
                  <Label className="text-xs text-slate-300 mb-2 block font-medium">
                    Choose Payment Option:
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPaymentType('full')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        paymentType === 'full'
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-xs text-white">Full Payment</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                        ৳{order.total.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">100% Paid upfront</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentType('delivery_advance')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        paymentType === 'delivery_advance'
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold text-xs text-white">Delivery Advance</div>
                      <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                        ৳{codAdvanceAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Pay ৳{(order.total - codAdvanceAmount).toLocaleString()} on COD
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Payment Method Tabs */}
              <Tabs
                value={activeMethod}
                onValueChange={(val) =>
                  setActiveMethod(val as 'bkash' | 'nagad' | 'rocket' | 'bank')
                }
              >
                <TabsList className="grid grid-cols-4 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <TabsTrigger
                    value="bkash"
                    className="data-[state=active]:bg-[#D12053] data-[state=active]:text-white text-xs font-semibold rounded-lg py-1.5 transition-all"
                  >
                    bKash
                  </TabsTrigger>
                  <TabsTrigger
                    value="nagad"
                    className="data-[state=active]:bg-[#F7941D] data-[state=active]:text-white text-xs font-semibold rounded-lg py-1.5 transition-all"
                  >
                    Nagad
                  </TabsTrigger>
                  <TabsTrigger
                    value="rocket"
                    className="data-[state=active]:bg-[#8C3494] data-[state=active]:text-white text-xs font-semibold rounded-lg py-1.5 transition-all"
                  >
                    Rocket
                  </TabsTrigger>
                  <TabsTrigger
                    value="bank"
                    className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-xs font-semibold rounded-lg py-1.5 transition-all"
                  >
                    Bank
                  </TabsTrigger>
                </TabsList>

                {/* bKash Details */}
                <TabsContent value="bkash" className="pt-3 space-y-3">
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-[#D12053]/30 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">bKash Account Number:</span>
                      <Badge variant="outline" className="border-[#D12053]/40 text-[#D12053] capitalize text-[10px]">
                        {activeType}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 rounded-lg border border-slate-800">
                      <span className="font-mono text-base font-bold text-white tracking-wider">
                        {activeNumber || 'Not configured'}
                      </span>
                      {activeNumber && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(activeNumber, 'bkash')}
                          className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          {copiedKey === 'bkash' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 mr-1" />
                          )}
                          {copiedKey === 'bkash' ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">How to pay:</p>
                      <p>
                        1. Open bKash App &gt; Select{' '}
                        <strong className="text-white">
                          {activeType === 'merchant' ? 'Make Payment' : 'Send Money'}
                        </strong>
                      </p>
                      <p>
                        2. Send exact amount:{' '}
                        <strong className="text-emerald-400 font-mono">
                          ৳{payableAmount.toLocaleString()}
                        </strong>
                      </p>
                      <p>3. Copy the 10-character Transaction ID (TrxID) from SMS and paste below.</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Nagad Details */}
                <TabsContent value="nagad" className="pt-3 space-y-3">
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-[#F7941D]/30 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Nagad Account Number:</span>
                      <Badge variant="outline" className="border-[#F7941D]/40 text-[#F7941D] capitalize text-[10px]">
                        {activeType}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 rounded-lg border border-slate-800">
                      <span className="font-mono text-base font-bold text-white tracking-wider">
                        {activeNumber || 'Not configured'}
                      </span>
                      {activeNumber && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(activeNumber, 'nagad')}
                          className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          {copiedKey === 'nagad' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 mr-1" />
                          )}
                          {copiedKey === 'nagad' ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">How to pay:</p>
                      <p>
                        1. Open Nagad App &gt; Select{' '}
                        <strong className="text-white">
                          {activeType === 'merchant' ? 'Payment' : 'Send Money'}
                        </strong>
                      </p>
                      <p>
                        2. Send exact amount:{' '}
                        <strong className="text-emerald-400 font-mono">
                          ৳{payableAmount.toLocaleString()}
                        </strong>
                      </p>
                      <p>3. Copy the 8+ digit TrxID from SMS and submit below.</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Rocket Details */}
                <TabsContent value="rocket" className="pt-3 space-y-3">
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-[#8C3494]/30 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">Rocket Account Number:</span>
                      <Badge variant="outline" className="border-[#8C3494]/40 text-[#8C3494] capitalize text-[10px]">
                        {activeType}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2.5 rounded-lg border border-slate-800">
                      <span className="font-mono text-base font-bold text-white tracking-wider">
                        {activeNumber || 'Not configured'}
                      </span>
                      {activeNumber && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(activeNumber, 'rocket')}
                          className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          {copiedKey === 'rocket' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 mr-1" />
                          )}
                          {copiedKey === 'rocket' ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400 space-y-1">
                      <p className="font-medium text-slate-300">How to pay:</p>
                      <p>
                        1. Send Money to Rocket number: <strong className="text-white">৳{payableAmount.toLocaleString()}</strong>
                      </p>
                      <p>2. Copy Transaction ID (TrxID) and enter below.</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Bank Details */}
                <TabsContent value="bank" className="pt-3 space-y-3">
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/30 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                        Bank Transfer Details:
                      </span>
                      {store?.payment_settings?.bank?.details && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copyToClipboard(store.payment_settings.bank?.details || '', 'bank')
                          }
                          className="h-7 px-2 text-xs text-indigo-300 hover:text-white"
                        >
                          {copiedKey === 'bank' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 mr-1" />
                          )}
                          Copy Info
                        </Button>
                      )}
                    </div>

                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs text-slate-200 whitespace-pre-line font-mono">
                      {store?.payment_settings?.bank?.details ||
                        'Bank account details not provided. Please contact merchant or choose mobile banking.'}
                    </div>

                    <div className="mt-3 text-[11px] text-slate-400">
                      Transfer <strong className="text-emerald-400 font-mono">৳{payableAmount.toLocaleString()}</strong> via online banking, BEFTN, or NPSB and enter your deposit reference/transaction number below.
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Merchant Custom Instructions (from /agents business setup) */}
              {(store?.special_instructions || store?.payment_settings?.special_instructions) && (
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1 shadow-inner">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Store Checkout & Payment Instructions:</span>
                  </div>
                  <p className="whitespace-pre-line text-slate-400 leading-relaxed font-sans text-[11px]">
                    {store.special_instructions || store.payment_settings?.special_instructions}
                  </p>
                </div>
              )}

              {/* Payment Submission Form */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-800">
                <div>
                  <Label htmlFor="sender" className="text-xs text-slate-300 flex items-center justify-between mb-1.5">
                    <span>Sender Phone Number</span>
                    <span className="text-[11px] text-slate-500 font-normal">Account used to send</span>
                  </Label>
                  <Input
                    id="sender"
                    type="tel"
                    required
                    placeholder="017XXXXXXXX"
                    value={senderNumber}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <Label htmlFor="trxId" className="text-xs text-slate-300 flex items-center justify-between mb-1.5">
                    <span>Transaction ID (TrxID)</span>
                    <span className="text-[11px] text-emerald-400 font-normal">Found in confirmation SMS</span>
                  </Label>
                  <Input
                    id="trxId"
                    required
                    placeholder={activeMethod === 'bkash' ? 'e.g. BJA830K29X' : 'e.g. 9B38K199'}
                    value={trxId}
                    onChange={(e) => setTrxId(e.target.value.toUpperCase())}
                    className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 font-mono tracking-wider uppercase focus:border-emerald-500 text-base py-5"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Anti-Fraud: Each TrxID is cryptographically verified against duplication.
                  </p>
                </div>

                <div>
                  <Label htmlFor="notes" className="text-xs text-slate-300 flex items-center justify-between mb-1.5">
                    <span>Optional Notes</span>
                    <span className="text-[11px] text-slate-500 font-normal">Any extra info</span>
                  </Label>
                  <Input
                    id="notes"
                    placeholder="e.g. Sent from uncle's bKash account"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 text-xs focus:border-emerald-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying &amp; Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm &amp; Submit Payment (৳{payableAmount.toLocaleString()})</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* Support & Security Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500 space-y-2">
          <div className="flex items-center justify-center gap-2 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>0% Commission Direct Merchant Settlement</span>
          </div>
          <p>
            Powered by{' '}
            <span className="text-slate-400 font-semibold">JobabDesk</span> • Smart E-Commerce Operating System
          </p>
        </footer>
      </div>
    </div>
  )
}
