export type OrderStatus = 'new' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cod' | 'bkash' | 'rocket' | 'nagad' | 'bank_transfer'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'

export interface OrderItem {
  id?: string
  order_id?: string
  product_id?: string | null
  product_name: string
  product_sku?: string | null
  unit_price: number
  quantity: number
  total: number
}

export interface Order {
  id: string
  account_id: string
  order_number: string
  contact_id?: string | null
  conversation_id?: string | null
  customer_name: string
  customer_phone?: string | null
  customer_address?: string | null
  customer_email?: string | null
  is_digital?: boolean
  status: OrderStatus
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  payment_reference?: string | null
  subtotal: number
  discount: number
  delivery_charge: number
  total: number
  notes?: string | null
  source: string
  created_at: string
  updated_at: string
  order_items?: OrderItem[]
  contact?: {
    id: string
    name: string
    phone?: string | null
  } | null
}

export interface OrderStats {
  new: number
  processing: number
  delivered: number
  totalRevenue: number
}
