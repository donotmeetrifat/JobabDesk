import type { SteadfastSettings, Order } from '@/types/orders'
import type { BookParcelResult } from './types'

export async function bookSteadfastParcel(
  order: Order,
  settings: SteadfastSettings
): Promise<BookParcelResult> {
  if (!settings.api_key || !settings.secret_key) {
    return {
      success: false,
      courier_name: 'Steadfast Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Steadfast API credentials are missing. Please configure your Api-Key and Secret-Key in Settings > Courier.',
    }
  }

  const recipientPhone = (order.customer_phone || '').trim()
  if (!recipientPhone) {
    return {
      success: false,
      courier_name: 'Steadfast Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Customer phone number is required to book a parcel with Steadfast.',
    }
  }

  const recipientAddress = (order.customer_address || '').trim()
  if (!recipientAddress) {
    return {
      success: false,
      courier_name: 'Steadfast Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Customer delivery address is required to book a parcel with Steadfast.',
    }
  }

  // Calculate COD amount: if already paid, collection is 0. Otherwise order total.
  const codAmount = order.payment_status === 'paid' ? 0 : Math.max(0, Math.round(Number(order.total) || 0))

  const payload = {
    invoice: order.order_number || `ORD-${order.id.slice(0, 8)}`,
    recipient_name: order.customer_name || 'Customer',
    recipient_phone: recipientPhone,
    recipient_address: recipientAddress,
    cod_amount: codAmount,
    note: order.notes || 'Order from JobabDesk',
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch('https://portal.steadfast.com.bd/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': settings.api_key.trim(),
        'Secret-Key': settings.secret_key.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))

    if (!res.ok || (data.status && data.status !== 200)) {
      const errMsg =
        data.message ||
        (data.errors ? JSON.stringify(data.errors) : `Steadfast API returned error ${res.status}`)
      return {
        success: false,
        courier_name: 'Steadfast Courier',
        tracking_code: '',
        courier_booking_status: 'unbooked',
        error: errMsg,
        rawResponse: data,
      }
    }

    const consignment = data.consignment || data
    const trackingCode = String(consignment.tracking_code || consignment.consignment_id || '')
    const consignmentId = String(consignment.consignment_id || '')
    const trackingUrl = `https://steadfast.com.bd/t/${encodeURIComponent(trackingCode)}`

    return {
      success: true,
      courier_name: 'Steadfast Courier',
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      courier_consignment_id: consignmentId,
      courier_booking_status: 'booked',
      rawResponse: data,
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError'
    return {
      success: false,
      courier_name: 'Steadfast Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: isTimeout
        ? 'Steadfast API request timed out. Please verify your internet connection or credentials.'
        : (err?.message || 'Failed to connect to Steadfast API'),
    }
  }
}
