'use client'

import { useState, useEffect } from 'react'
import { X, Search, Plus, Trash2, UserCheck, Package } from 'lucide-react'
import { toast } from 'sonner'
import type { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus } from '@/types/orders'

interface OrderDialogProps {
  open: boolean
  order: Order | null
  onClose: () => void
  onSaved: () => void
}

interface ProductSearchResult {
  id: string
  name: string
  sku: string | null
  price: number
}

interface ContactSearchResult {
  id: string
  name: string
  phone: string | null
  address?: string | null
}

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string }> = [
  { id: 'cod', label: 'COD' },
  { id: 'bkash', label: 'bKash' },
  { id: 'rocket', label: 'Rocket' },
  { id: 'nagad', label: 'Nagad' },
  { id: 'bank_transfer', label: 'Bank Transfer' },
]

export function OrderDialog({ open, order, onClose, onSaved }: OrderDialogProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [contactId, setContactId] = useState<string | null>(null)

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid')
  const [paymentReference, setPaymentReference] = useState('')
  const [status, setStatus] = useState<OrderStatus>('new')
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0)
  const [discount, setDiscount] = useState<number>(0)
  const [notes, setNotes] = useState('')

  const [items, setItems] = useState<OrderItem[]>([])

  // Search states
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([])
  const [searchingContacts, setSearchingContacts] = useState(false)

  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([])
  const [searchingProducts, setSearchingProducts] = useState(false)

  // Manual item add state
  const [manualName, setManualName] = useState('')
  const [manualPrice, setManualPrice] = useState('')

  const [saving, setSaving] = useState(false)

  // Reset or populate fields when modal opens/changes
  useEffect(() => {
    if (!open) return
    if (order) {
      setCustomerName(order.customer_name ?? '')
      setCustomerPhone(order.customer_phone ?? '')
      setCustomerAddress(order.customer_address ?? '')
      setContactId(order.contact_id ?? null)
      setPaymentMethod(order.payment_method ?? 'cod')
      setPaymentStatus(order.payment_status ?? 'unpaid')
      setPaymentReference(order.payment_reference ?? '')
      setStatus(order.status ?? 'new')
      setDeliveryCharge(Number(order.delivery_charge) || 0)
      setDiscount(Number(order.discount) || 0)
      setNotes(order.notes ?? '')
      setItems(
        (order.order_items ?? []).map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          product_sku: i.product_sku,
          unit_price: Number(i.unit_price) || 0,
          quantity: Number(i.quantity) || 1,
          total: Number(i.total) || (Number(i.unit_price) || 0) * (Number(i.quantity) || 1),
        }))
      )
    } else {
      setCustomerName('')
      setCustomerPhone('')
      setCustomerAddress('')
      setContactId(null)
      setPaymentMethod('cod')
      setPaymentStatus('unpaid')
      setPaymentReference('')
      setStatus('new')
      setDeliveryCharge(0)
      setDiscount(0)
      setNotes('')
      setItems([])
    }
    setContactSearch('')
    setContactResults([])
    setProductSearch('')
    setProductResults([])
    setManualName('')
    setManualPrice('')
  }, [open, order])

  // Search contacts
  useEffect(() => {
    if (!contactSearch.trim()) {
      setContactResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingContacts(true)
      try {
        const res = await fetch(`/api/contacts?search=${encodeURIComponent(contactSearch.trim())}&limit=5`)
        const data = await res.json()
        setContactResults(data.contacts ?? [])
      } catch {
        // ignore search error
      } finally {
        setSearchingContacts(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [contactSearch])

  // Search products
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingProducts(true)
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch.trim())}&limit=5`)
        const data = await res.json()
        setProductResults(data.products ?? [])
      } catch {
        // ignore search error
      } finally {
        setSearchingProducts(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  if (!open) return null

  const handleSelectContact = (c: ContactSearchResult) => {
    setContactId(c.id)
    setCustomerName(c.name)
    if (c.phone) setCustomerPhone(c.phone)
    if (c.address) setCustomerAddress(c.address)
    setContactSearch('')
    setContactResults([])
    toast.success(`Linked contact: ${c.name}`)
  }

  const handleAddProduct = (p: ProductSearchResult) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.product_id === p.id)
      if (existingIdx >= 0) {
        const next = [...prev]
        const item = next[existingIdx]
        const newQty = item.quantity + 1
        next[existingIdx] = {
          ...item,
          quantity: newQty,
          total: item.unit_price * newQty,
        }
        return next
      }
      return [
        ...prev,
        {
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          unit_price: Number(p.price) || 0,
          quantity: 1,
          total: Number(p.price) || 0,
        },
      ]
    })
    setProductSearch('')
    setProductResults([])
  }

  const handleAddManualItem = () => {
    if (!manualName.trim()) return
    const price = Math.max(0, Number(manualPrice) || 0)
    setItems((prev) => [
      ...prev,
      {
        product_name: manualName.trim(),
        unit_price: price,
        quantity: 1,
        total: price,
      },
    ])
    setManualName('')
    setManualPrice('')
  }

  const handleUpdateQty = (index: number, delta: number) => {
    setItems((prev) => {
      const next = [...prev]
      const item = next[index]
      const newQty = Math.max(1, item.quantity + delta)
      next[index] = {
        ...item,
        quantity: newQty,
        total: item.unit_price * newQty,
      }
      return next
    })
  }

  const handleUpdatePrice = (index: number, newPrice: number) => {
    setItems((prev) => {
      const next = [...prev]
      const item = next[index]
      const price = Math.max(0, newPrice)
      next[index] = {
        ...item,
        unit_price: price,
        total: price * item.quantity,
      }
      return next
    })
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const total = Math.max(0, subtotal - discount + deliveryCharge)

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast.error('Customer name is required')
      return
    }
    if (items.length === 0) {
      toast.error('Please add at least one product item')
      return
    }

    setSaving(true)
    try {
      const payload = {
        contact_id: contactId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        customer_address: customerAddress.trim() || null,
        status,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_reference: paymentReference.trim() || null,
        delivery_charge: deliveryCharge,
        discount,
        notes: notes.trim() || null,
        items,
      }

      const url = order ? `/api/orders/${order.id}` : '/api/orders'
      const method = order ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save order')
      }

      toast.success(order ? 'Order updated' : 'Order created successfully')
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-xl border bg-background shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold">{order ? `Edit Order (${order.order_number})` : 'New Order'}</h2>
            <p className="text-xs text-muted-foreground">Fill in customer details and select items to build an order.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Content Body - Two Panels */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x border-b">
          {/* LEFT PANEL: Customer & Payment */}
          <div className="md:col-span-6 p-6 space-y-5 overflow-y-auto">
            <h3 className="font-semibold text-sm tracking-wide text-foreground uppercase border-b pb-2">
              Customer & Payment Details
            </h3>

            {/* Contact Link Search */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-primary" /> Link Existing Contact
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search contact by name or phone..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="w-full rounded-md border bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {searchingContacts && <p className="text-xs text-muted-foreground">Searching contacts...</p>}

              {contactResults.length > 0 && (
                <div className="rounded-md border bg-card p-1 shadow-md max-h-36 overflow-y-auto space-y-0.5">
                  {contactResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectContact(c)}
                      className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted flex justify-between items-center"
                    >
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-muted-foreground">{c.phone || 'No phone'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Customer Inputs */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahim Chowdhury"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Phone Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. +8801700000000"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Delivery Address</label>
                <textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  rows={2}
                  placeholder="Full delivery address..."
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>

            {/* Order Status & Payment Method */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-medium text-foreground">Order Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OrderStatus)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="new">New</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {/* Payment Method Radio Pills */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Payment Method</label>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      paymentMethod === pm.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted border-border'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Reference (for non-COD) */}
            {paymentMethod !== 'cod' && (
              <div>
                <label className="text-xs font-medium text-foreground">Transaction ID / Reference</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. bKash TrxID: 9A8B7C6D"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                />
              </div>
            )}

            {/* Extra Adjustments */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Delivery Charge (৳)</label>
                <input
                  type="number"
                  min="0"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Discount (৳)</label>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Order Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes or customer instructions..."
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>

          {/* RIGHT PANEL: Order Items */}
          <div className="md:col-span-6 p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm tracking-wide text-foreground uppercase border-b pb-2">
                Order Items
              </h3>

              {/* Product Search & Add */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Package className="size-3.5 text-primary" /> Search & Add Catalog Products
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Type product name or SKU..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full rounded-md border bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {searchingProducts && <p className="text-xs text-muted-foreground">Searching catalog...</p>}

                {productResults.length > 0 && (
                  <div className="rounded-md border bg-card p-1 shadow-md max-h-36 overflow-y-auto space-y-0.5">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddProduct(p)}
                        className="w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted flex justify-between items-center"
                      >
                        <div>
                          <span className="font-medium text-foreground">{p.name}</span>
                          {p.sku && <span className="ml-2 font-mono text-muted-foreground text-[10px]">{p.sku}</span>}
                        </div>
                        <span className="font-semibold text-primary">৳{Number(p.price).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Product Entry */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Add Custom / Non-Catalog Item</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Product name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="flex-1 rounded border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="number"
                    placeholder="Price (৳)"
                    min="0"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="w-24 rounded border bg-background px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualItem}
                    disabled={!manualName.trim()}
                    className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus className="size-3.5 inline mr-1" /> Add
                  </button>
                </div>
              </div>

              {/* Added Items List */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Items in Order ({items.length})</p>
                {items.length === 0 ? (
                  <div className="p-6 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
                    No items added yet. Search catalog or enter manual items above.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-card text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground truncate">{item.product_name}</p>
                          {item.product_sku && (
                            <p className="text-[10px] font-mono text-muted-foreground">{item.product_sku}</p>
                          )}
                        </div>

                        {/* Price & Quantity Controls */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">৳</span>
                            <input
                              type="number"
                              min="0"
                              value={item.unit_price}
                              onChange={(e) => handleUpdatePrice(idx, Number(e.target.value) || 0)}
                              className="w-16 rounded border bg-background px-1.5 py-0.5 text-center text-xs outline-none"
                            />
                          </div>

                          <div className="flex items-center border rounded overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, -1)}
                              className="px-2 py-0.5 hover:bg-muted text-muted-foreground font-bold"
                            >
                              -
                            </button>
                            <span className="px-2 font-medium">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(idx, 1)}
                              className="px-2 py-0.5 hover:bg-muted text-muted-foreground font-bold"
                            >
                              +
                            </button>
                          </div>

                          <span className="font-semibold text-foreground w-16 text-right">
                            ৳{item.total.toLocaleString()}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary Calculation */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>৳{subtotal.toLocaleString()}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>- ৳{discount.toLocaleString()}</span>
                </div>
              )}
              {deliveryCharge > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Charge</span>
                  <span>+ ৳{deliveryCharge.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-center text-sm font-bold text-foreground">
                <span>Total</span>
                <span className="text-base text-primary">৳{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2 text-sm text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : order ? 'Update Order' : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
