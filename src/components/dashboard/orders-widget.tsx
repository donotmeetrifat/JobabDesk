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
  new: 'bg-primary/10 text-primary border-primary/20',
  confirmed: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  processing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  shipped: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  delivered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
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
      <div className="rounded-2xl border border-border/80 bg-card/80 p-5 animate-pulse space-y-4">
        <div className="h-6 w-36 bg-muted rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-16 bg-muted rounded-xl" />
          <div className="h-16 bg-muted rounded-xl" />
          <div className="h-16 bg-muted rounded-xl" />
        </div>
        <div className="h-36 bg-muted rounded-xl" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs p-5 space-y-4 shadow-xs hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <ShoppingCart className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Orders Overview</h2>
            <p className="text-xs text-muted-foreground">Today&apos;s direct commerce transactions</p>
          </div>
        </div>
        <Link
          href="/orders"
          className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
        >
          <span>View all orders</span>
          <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>

      {/* 3 Metric Pills with subtle ambient badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/70 bg-background/60 p-3.5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <ShoppingBag className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Orders Today</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{data.ordersTodayCount.toLocaleString()}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/60 p-3.5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Banknote className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Revenue Today</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{formatCurrency(data.revenueToday, activeCurrency)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/60 p-3.5 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="size-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Pending Orders</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{data.pendingOrdersCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Recent 5 Orders Table */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Orders</p>
          <span className="text-[11px] text-muted-foreground tabular-nums">Latest {data.recentOrders.length}</span>
        </div>
        {data.recentOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              No orders created yet today.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/70 bg-background/30">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/70 text-muted-foreground">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Order #</th>
                  <th className="px-3.5 py-2.5 font-medium">Customer</th>
                  <th className="px-3.5 py-2.5 font-medium">Total</th>
                  <th className="px-3.5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">
                      <Link href={`/orders`} className="hover:text-primary transition-colors">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-3.5 py-2.5 text-foreground font-medium">{o.customer_name}</td>
                    <td className="px-3.5 py-2.5 font-semibold tabular-nums">{formatCurrency(o.total, activeCurrency)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_BADGES[o.status] ?? STATUS_BADGES.new}`}>
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
