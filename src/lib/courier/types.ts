import type { CourierBookingStatus, CourierProvider, CourierSettings, Order } from '@/types/orders'

export interface CourierPreset {
  id: string
  name: string
  nameBn: string
  hasAutomatedApi: boolean
  trackingUrlTemplate?: (code: string) => string
}

export const PRESET_COURIERS: CourierPreset[] = [
  {
    id: 'steadfast',
    name: 'Steadfast Courier',
    nameBn: 'স্টেডফাস্ট কুরিয়ার',
    hasAutomatedApi: true,
    trackingUrlTemplate: (code: string) => `https://steadfast.com.bd/t/${encodeURIComponent(code)}`,
  },
  {
    id: 'pathao',
    name: 'Pathao Courier',
    nameBn: 'পাঠাও কুরিয়ার',
    hasAutomatedApi: true,
    trackingUrlTemplate: (code: string) =>
      `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(code)}`,
  },
  {
    id: 'redx',
    name: 'RedX',
    nameBn: 'রেডএক্স',
    hasAutomatedApi: false,
    trackingUrlTemplate: (code: string) =>
      `https://redx.com.bd/track/?trackingId=${encodeURIComponent(code)}`,
  },
  {
    id: 'paperfly',
    name: 'Paperfly',
    nameBn: 'পেপারফ্লাই',
    hasAutomatedApi: false,
    trackingUrlTemplate: (code: string) =>
      `https://paperfly.com.bd/tracking.php?order_id=${encodeURIComponent(code)}`,
  },
  {
    id: 'sundarban',
    name: 'Sundarban Courier',
    nameBn: 'সুন্দরবন কুরিয়ার',
    hasAutomatedApi: false,
  },
  {
    id: 'sa_paribahan',
    name: 'SA Paribahan',
    nameBn: 'এস এ পরিবহন',
    hasAutomatedApi: false,
  },
  {
    id: 'karatoa',
    name: 'Karatoa Courier',
    nameBn: 'করতোয়া কুরিয়ার',
    hasAutomatedApi: false,
  },
  {
    id: 'in_house',
    name: 'In-House Delivery',
    nameBn: 'নিজস্ব ডেলিভারি বয়',
    hasAutomatedApi: false,
  },
  {
    id: 'other',
    name: 'Other Courier',
    nameBn: 'অন্যান্য কুরিয়ার',
    hasAutomatedApi: false,
  },
]

export function buildTrackingUrl(courierName?: string | null, trackingCode?: string | null): string | null {
  if (!trackingCode || !trackingCode.trim()) return null
  const cleanCode = trackingCode.trim()

  if (!courierName) return null
  const lowerName = courierName.toLowerCase()

  if (lowerName.includes('steadfast')) {
    return `https://steadfast.com.bd/t/${encodeURIComponent(cleanCode)}`
  }
  if (lowerName.includes('pathao')) {
    return `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(cleanCode)}`
  }
  if (lowerName.includes('redx')) {
    return `https://redx.com.bd/track/?trackingId=${encodeURIComponent(cleanCode)}`
  }
  if (lowerName.includes('paperfly')) {
    return `https://paperfly.com.bd/tracking.php?order_id=${encodeURIComponent(cleanCode)}`
  }

  return null
}

export interface BookParcelInput {
  order: Order
  provider: CourierProvider
  courierSettings?: CourierSettings | null
  manualDetails?: {
    courierName: string
    trackingCode: string
    trackingUrl?: string | null
  }
}

export interface BookParcelResult {
  success: boolean
  courier_name: string
  tracking_code: string
  tracking_url?: string | null
  courier_consignment_id?: string | null
  courier_booking_status: CourierBookingStatus
  error?: string
  rawResponse?: unknown
}
