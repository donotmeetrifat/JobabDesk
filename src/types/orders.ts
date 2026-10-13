export type OrderStatus = 'new' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cod' | 'bkash' | 'rocket' | 'nagad' | 'bank_transfer' | 'free'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'payment_submitted'

export interface BkashSettings {
  number: string
  type: 'personal' | 'merchant' | 'agent'
}

export interface NagadSettings {
  number: string
  type: 'personal' | 'merchant'
}

export interface RocketSettings {
  number: string
  type: 'personal' | 'merchant'
}

export interface BankSettings {
  details: string
}

export interface PaymentSettings {
  bkash?: BkashSettings
  nagad?: NagadSettings
  rocket?: RocketSettings
  bank?: BankSettings
  allow_cod_advance?: boolean
  cod_advance_amount?: number
}

export interface PaymentRequest {
  id: string
  order_id: string
  account_id: string
  amount: number
  payment_method: 'bkash' | 'nagad' | 'rocket' | 'bank'
  payment_type: 'full' | 'delivery_advance'
  sender_number: string
  trx_id: string
  notes?: string | null
  status: 'submitted' | 'verified' | 'rejected'
  verified_at?: string | null
  verified_by?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
}

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
  payment_requests?: PaymentRequest[]
  contact?: {
    id: string
    name: string
    phone?: string | null
  } | null
  // Courier & Delivery Tracking (Phase 6A)
  courier_name?: string | null
  tracking_code?: string | null
  tracking_url?: string | null
  courier_consignment_id?: string | null
  courier_booking_status?: CourierBookingStatus | null
}

export type CourierBookingStatus =
  | 'unbooked'
  | 'booked'
  | 'in_transit'
  | 'delivered'
  | 'returned'

export type CourierProvider = 'manual' | 'steadfast' | 'pathao'

export interface SteadfastSettings {
  enabled: boolean
  api_key: string
  secret_key: string
}

export interface PathaoSettings {
  enabled: boolean
  client_id: string
  client_secret: string
  username: string
  password: string
  store_id: string
}

export interface CourierSettings {
  default_provider: CourierProvider
  steadfast: SteadfastSettings
  pathao: PathaoSettings
}

export interface OrderStats {
  new: number
  processing: number
  delivered: number
  cancelled: number
  totalRevenue: number
}

