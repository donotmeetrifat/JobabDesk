'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, ShoppingBag, Banknote, Clock, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startOfLocalDay } from '@/lib/dashboard/date-utils'

import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'

interface OrderSummary {
  id: string
  order_number: string
  customer_name: string
  total: number
  status: string
  created_at: string
}

interface OrderWidgetData {
  ordersTodayCount: number
  revenueToday: number
  pendingOrdersCount: number
  recentOrders: OrderSummary[]
}

const STATUS_BADGES: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  confirmed: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
  processing: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  shipped: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
  delivered: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
}

export function OrdersWidget({ currency }: { currency?: string } = {}) {
  const { defaultCurrency } = useAuth()
  const activeCurrency = currency || defaultCurrency
  const [data, setData] = useState<OrderWidgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadWidgetData() {
      try {
        const db = createClient()
        const todayStart = startOfLocalDay().toISOString()

        const [todayRes, pendingRes, recentRes] = await Promise.all([
          db.from('orders').select('id, total, status').gte('created_at', todayStart),
          db.from('orders').select('id', { count: 'exact', head: true }).in('status', ['new', 'confirmed', 'processing']),
          db.from('orders').select('id, order_number, customer_name, total, status, created_at').order('created_at', { ascending: false }).limit(5),
        ])

        const todayOrders = todayRes.data ?? []
        const revenueToday = todayOrders
          .filter((o) => o.status !== 'cancelled')
          .reduce((sum, o) => sum + (Number(o.total) || 0), 0)

        setData({
          ordersTodayCount: todayOrders.length,
          revenueToday,
          pendingOrdersCount: pendingRes.count ?? 0,
          recentOrders: (recentRes.data ?? []).map((r) => ({
            id: r.id,
            order_number: r.order_number,
            customer_name: r.customer_name,
            total: Number(r.total) || 0,
            status: r.status,
            created_at: r.created_at,
          })),
        })
      } catch {
        // quiet catch
      } finally {
        setLoading(false)
      }
    }

    loadWidgetData()
  }, [])

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5 animate-pulse space-y-4">
        <div className="h-6 w-36 bg-muted rounded" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded-lg" />
        </div>
        <div className="h-28 bg-muted rounded-lg" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <ShoppingCart className="size-4" />
          </div>
          <h2 className="text-base font-bold text-foreground">Orders Overview</h2>
        </div>
        <Link
          href="/orders"
          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
        >
          View all orders <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* 3 Metric Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-background p-3 flex items-center gap-3">
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/50 p-2 text-blue-600">
            <ShoppingBag className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Orders Today</p>
            <p className="text-lg font-bold text-foreground">{data.ordersTodayCount}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3 flex items-center gap-3">
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/50 p-2 text-emerald-600">
            <Banknote className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Revenue Today</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(data.revenueToday, activeCurrency)}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-3 flex items-center gap-3">
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/50 p-2 text-amber-600">
            <Clock className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Pending Orders</p>
            <p className="text-lg font-bold text-foreground">{data.pendingOrdersCount}</p>
          </div>
        </div>
      </div>

      {/* Recent 5 Orders Table */}
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Orders</p>
        {data.recentOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center border border-dashed rounded-md">
            No orders created yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Order #</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-3 py-2 font-mono font-medium text-foreground">{o.order_number}</td>
                    <td className="px-3 py-2 text-foreground font-medium">{o.customer_name}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(o.total, activeCurrency)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_BADGES[o.status] ?? STATUS_BADGES.new}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
