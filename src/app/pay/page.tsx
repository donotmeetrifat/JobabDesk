'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ShieldCheck,
  Search,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

export default function PayPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      }
    >
      <PayPortalContent />
    </Suspense>
  )
}

function PayPortalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [orderQuery, setOrderQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoChecking, setAutoChecking] = useState(true)

  useEffect(() => {
    // 1. Check URL parameters for order reference
    const paramRef =
      searchParams.get('order') ||
      searchParams.get('order_number') ||
      searchParams.get('id') ||
      searchParams.get('orderId') ||
      searchParams.get('phone')

    if (paramRef && paramRef.trim()) {
      router.replace(`/pay/${encodeURIComponent(paramRef.trim())}`)
      return
    }

    // 2. Check localStorage for recently accessed order
    if (typeof window !== 'undefined') {
      try {
        const lastOrder = localStorage.getItem('jobabdesk_last_order')
        if (lastOrder && lastOrder.trim()) {
          setOrderQuery(lastOrder.trim())
        }
      } catch {
        // safe fallback
      }
    }

    // 3. Check /api/pay/latest in case there is a pending order
    const checkLatestOrder = async () => {
      try {
        const res = await fetch('/api/pay/latest')
        if (res.ok) {
          const data = await res.json()
          if (data?.order?.order_number) {
            router.replace(`/pay/${encodeURIComponent(data.order.order_number)}`)
            return
          }
        }
      } catch {
        // safe fallback
      } finally {
        setAutoChecking(false)
      }
    }

    checkLatestOrder()
  }, [router, searchParams])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = orderQuery.trim().replace(/^#+/, '').trim()
    if (!clean) {
      toast.error('Please enter your Order Number or Phone Number.')
      return
    }

    setLoading(true)
    try {
      // Validate order exists before navigating
      const res = await fetch(`/api/pay/${encodeURIComponent(clean)}`)
      const data = await res.json()

      if (res.ok && data.order?.order_number) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('jobabdesk_last_order', data.order.order_number)
          } catch {}
        }
        router.push(`/pay/${encodeURIComponent(data.order.order_number)}`)
      } else {
        toast.error(data.error || 'Order not found. Please check your details.')
      }
    } catch {
      toast.error('Could not connect to payment server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (autoChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Opening secure payment portal...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Background radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full" />
        <div className="absolute top-1/3 -right-20 w-[300px] h-[300px] bg-cyan-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pt-8 sm:pt-16">
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Secure • Direct Merchant Payment</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Payment Portal
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Enter your Order Number or Mobile Number below to proceed with bKash, Nagad, or Rocket payment.
          </p>
        </header>

        <Card className="bg-slate-900/90 border-slate-800 shadow-2xl backdrop-blur-md overflow-hidden mb-6">
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label
                  htmlFor="orderQuery"
                  className="block text-xs font-semibold text-slate-300 mb-2"
                >
                  Order Number or Phone Number
                </label>
                <div className="relative">
                  <Input
                    id="orderQuery"
                    type="text"
                    required
                    placeholder="e.g. ORD-2026-0001 or 017XXXXXXXX"
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus:border-emerald-500 font-mono text-sm py-5 pr-10"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  You can find your Order Number in your Messenger/WhatsApp chat summary.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !orderQuery.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 text-sm rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Finding Order...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed to Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Accepted Payment Badges */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 text-center">
          <span className="text-[11px] font-semibold text-slate-400 block mb-3 uppercase tracking-wider">
            Supported Payment Methods
          </span>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium">
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
              <span className="text-[#D12053] font-bold">bKash</span>
              <span className="text-[10px] text-slate-500">Personal / Merch</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
              <span className="text-[#F7941D] font-bold">Nagad</span>
              <span className="text-[10px] text-slate-500">Personal / Merch</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
              <span className="text-[#8C3494] font-bold">Rocket</span>
              <span className="text-[10px] text-slate-500">Personal / Agent</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
              <span className="text-indigo-400 font-bold">Bank</span>
              <span className="text-[10px] text-slate-500">NPSB / BEFTN</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
