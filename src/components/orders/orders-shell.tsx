'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, RefreshCw, Trash2, X, ShoppingBag, Clock, CheckCircle, Banknote } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { OrderTable } from './order-table'
import { OrderDialog } from './order-dialog'
import { OrderDetailDialog } from './order-detail-dialog'
import type { Order, OrderStats, PaymentStatus } from '@/types/orders'

export function OrdersShell() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')

  const [stats, setStats] = useState<OrderStats>({
    new: 0,
    processing: 0,
    delivered: 0,
    totalRevenue: 0,
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    setIsSyncing(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (paymentFilter && paymentFilter !== 'all') params.set('payment_status', paymentFilter)

      const res = await fetch(`/api/orders?${params.toString()}`)
      const data = await res.json()
      setOrders(data.orders ?? [])
      setTotal(data.total ?? 0)
      if (data.stats) setStats(data.stats)
    } catch {
      if (!silent) {
        toast.error('Failed to load orders')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
      setIsSyncing(false)
    }
  }, [search, statusFilter, paymentFilter])

  // Initial load
  useEffect(() => {
    fetchOrders(false)
  }, [fetchOrders])

  // Realtime listener and silent background sync
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('orders_page_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          fetchOrders(true)
        }
      )
      .subscribe()

    // 5-second automatic silent polling (never wipes or flickers the table!)
    const interval = setInterval(() => {
      fetchOrders(true)
    }, 5000)

    // Window focus refresh (silent)
    const handleFocus = () => {
      fetchOrders(true)
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchOrders])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [orders])

  const handleApprove = async (order: Order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' }),
      })
      if (res.ok) {
        toast.success(`Order ${order.order_number || ''} approved and confirmed!`)
        fetchOrders()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Failed to approve order')
      }
    } catch {
      toast.error('Failed to approve order')
    }
  }

  const handleCancelOrder = async (order: Order) => {
    if (!confirm(`Cancel order ${order.order_number || ''}?`)) return
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        toast.success(`Order ${order.order_number || ''} cancelled`)
        fetchOrders()
      } else {
        const json = await res.json()
        toast.error(json.error || 'Failed to cancel order')
      }
    } catch {
      toast.error('Failed to cancel order')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Order deleted')
        fetchOrders()
      } else {
        toast.error('Failed to delete order')
      }
    } catch {
      toast.error('Failed to delete order')
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(orders.map((o) => o.id)))
    else setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.size
    const confirmMsg =
      count === orders.length && count === total
        ? `Delete ALL ${count} orders? This cannot be undone.`
        : `Delete ${count} selected order${count !== 1 ? 's' : ''}? This cannot be undone.`

    if (!confirm(confirmMsg)) return

    setDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map((id) => fetch(`/api/orders/${id}`, { method: 'DELETE' })))
      toast.success(`Deleted ${count} order${count !== 1 ? 's' : ''}`)
      setSelectedIds(new Set())
      fetchOrders()
    } catch {
      toast.error('Some orders could not be deleted')
    } finally {
      setDeleting(false)
    }
  }

  const handleView = (order: Order) => {
    setSelectedOrder(order)
    setDetailOpen(true)
  }

  const handleEdit = (order: Order) => {
    setSelectedOrder(order)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setSelectedOrder(null)
    setDialogOpen(true)
  }

  const handleSaved = () => {
    setDialogOpen(false)
    fetchOrders()
  }

  const handleStatusUpdated = () => {
    setDetailOpen(false)
    fetchOrders()
  }

  const handleUpdatePaymentStatus = async (order: Order, paymentStatus: PaymentStatus) => {
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: paymentStatus }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update payment status')
      }
      toast.success(`Payment marked as ${paymentStatus}`)
      fetchOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update payment status')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {total} order{total !== 1 ? 's' : ''} total in workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchOrders(false)}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-70"
            title="Refresh orders"
          >
            <RefreshCw className={`size-4 ${isSyncing ? 'animate-spin text-primary' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Refresh'}</span>
          </button>
          <button
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="size-4" /> New Order
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter((prev) => (prev === 'new' ? 'all' : 'new'))}
          className={`rounded-xl border bg-card p-4 flex items-center justify-between shadow-xs cursor-pointer transition-all hover:border-amber-500/50 ${
            statusFilter === 'new' ? 'ring-2 ring-amber-500/40 border-amber-500 bg-amber-500/5' : ''
          }`}
          title="Click to filter by New Orders"
        >
          <div>
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              New Orders (Pending)
            </p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.new}</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
            <ShoppingBag className="size-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Processing</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats.processing}</p>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 p-2.5 text-amber-600">
            <Clock className="size-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Delivered</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.delivered}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 p-2.5 text-emerald-600">
            <CheckCircle className="size-5" />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 flex items-center justify-between shadow-xs">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
            <p className="text-2xl font-bold text-foreground mt-1">৳{stats.totalRevenue.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <Banknote className="size-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer name, phone, or order number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Payment Statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-destructive">
              {selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            {selectedIds.size < orders.length && (
              <button
                onClick={() => handleSelectAll(true)}
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                Select all {total}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
            >
              <X className="size-3" /> Deselect
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs text-white font-medium hover:bg-destructive/90 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              {deleting ? 'Deleting...' : `Delete ${selectedIds.size === total ? 'All' : selectedIds.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <OrderTable
        orders={orders}
        loading={loading}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onApprove={handleApprove}
        onCancel={handleCancelOrder}
        onUpdatePaymentStatus={handleUpdatePaymentStatus}
      />

      {/* Dialogs */}
      <OrderDialog
        open={dialogOpen}
        order={selectedOrder}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      <OrderDetailDialog
        open={detailOpen}
        order={selectedOrder}
        onClose={() => setDetailOpen(false)}
        onStatusUpdated={handleStatusUpdated}
      />
    </div>
  )
}
