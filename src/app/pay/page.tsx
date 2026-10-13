'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ShieldCheck,
  Search,
  ArrowRight,
  Loader2,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

export default function PayPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
      <div className="min-h-screen bg-[#faf8ff] text-slate-800 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Opening secure payment portal...</p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen text-slate-800 antialiased font-sans flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8"
      style={{
        backgroundColor: '#faf8ff',
        backgroundImage:
          'radial-gradient(at 100% 0%, rgba(0, 102, 255, 0.05) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.04) 0px, transparent 50%)',
      }}
    >
      <div className="relative z-10 max-w-md mx-auto w-full pt-4 sm:pt-8 my-auto">
        <header className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-3 shadow-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-Bit SSL Encrypted • Direct Merchant Payment</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1.5">
            JobabDesk Pay
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Enter your Order Number or Mobile Number below to proceed with secure bKash, Nagad, or Rocket checkout.
          </p>
        </header>

        <Card className="bg-white border-slate-200/90 shadow-xl shadow-slate-200/60 rounded-2xl overflow-hidden mb-6">
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label
                  htmlFor="orderQuery"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2"
                >
                  Order Number or Phone Number
                </label>
                <div className="relative">
                  <Input
                    id="orderQuery"
                    type="text"
                    required
                    placeholder="e.g. ORD-2026-0002 or 017XXXXXXXX"
                    value={orderQuery}
                    onChange={(e) => setOrderQuery(e.target.value)}
                    className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 font-mono text-sm py-5 pr-10 rounded-xl"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  You can find your Order Number in your Messenger or WhatsApp chat summary.
                </p>
              </div>

              <Button
                type="submit"
                disabled={loading || !orderQuery.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-6 text-sm rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Locating Order...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-emerald-200" />
                    <span>Proceed to Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Accepted Payment Badges */}
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-center shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 block mb-3 uppercase tracking-wider">
            Supported Payment Methods
          </span>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium">
            <div className="p-2 rounded-xl bg-pink-50/50 border border-pink-100 text-slate-700 flex flex-col items-center gap-0.5">
              <span className="text-[#e2136e] font-bold">bKash</span>
              <span className="text-[10px] text-slate-500">Send / Pay</span>
            </div>
            <div className="p-2 rounded-xl bg-orange-50/50 border border-orange-100 text-slate-700 flex flex-col items-center gap-0.5">
              <span className="text-[#f7941d] font-bold">Nagad</span>
              <span className="text-[10px] text-slate-500">Send / Pay</span>
            </div>
            <div className="p-2 rounded-xl bg-purple-50/50 border border-purple-100 text-slate-700 flex flex-col items-center gap-0.5">
              <span className="text-[#8c3494] font-bold">Rocket</span>
              <span className="text-[10px] text-slate-500">Personal</span>
            </div>
            <div className="p-2 rounded-xl bg-blue-50/50 border border-blue-100 text-slate-700 flex flex-col items-center gap-0.5">
              <span className="text-blue-600 font-bold">Bank</span>
              <span className="text-[10px] text-slate-500">NPSB / BEFTN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gateway Footer */}
      <footer className="max-w-md mx-auto w-full mt-6 text-center text-xs text-slate-500 space-y-1">
        <p className="flex items-center justify-center gap-2">
          <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
            0% Commission
          </span>
          <span className="text-[11px]">Direct Settlement</span>
        </p>
        <p className="text-slate-400 text-[11px]">
          Powered by <strong className="text-slate-700 font-semibold">JobabDesk</strong>
        </p>
      </footer>
    </div>
  )
}
