import type { PathaoSettings, Order } from '@/types/orders'
import type { BookParcelResult } from './types'

async function getPathaoAccessToken(settings: PathaoSettings): Promise<{ token?: string; error?: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)

    const res = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: settings.client_id.trim(),
        client_secret: settings.client_secret.trim(),
        username: settings.username.trim(),
        password: settings.password.trim(),
        grant_type: 'password',
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.access_token) {
      return {
        error:
          data.message ||
          data.error_description ||
          `Pathao authentication failed (Status ${res.status}). Please verify your Pathao credentials.`,
      }
    }

    return { token: data.access_token }
  } catch (err: any) {
    return {
      error:
        err?.name === 'AbortError'
          ? 'Pathao authentication timed out.'
          : (err?.message || 'Failed to authenticate with Pathao API'),
    }
  }
}

export async function bookPathaoParcel(
  order: Order,
  settings: PathaoSettings
): Promise<BookParcelResult> {
  if (
    !settings.client_id ||
    !settings.client_secret ||
    !settings.username ||
    !settings.password ||
    !settings.store_id
  ) {
    return {
      success: false,
      courier_name: 'Pathao Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Pathao API credentials are incomplete. Please configure Client ID, Client Secret, Username, Password, and Store ID in Settings > Courier.',
    }
  }

  const recipientPhone = (order.customer_phone || '').trim()
  if (!recipientPhone) {
    return {
      success: false,
      courier_name: 'Pathao Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Customer phone number is required to book a parcel with Pathao.',
    }
  }

  const recipientAddress = (order.customer_address || '').trim()
  if (!recipientAddress) {
    return {
      success: false,
      courier_name: 'Pathao Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: 'Customer delivery address is required to book a parcel with Pathao.',
    }
  }

  // Auth token
  const auth = await getPathaoAccessToken(settings)
  if (!auth.token) {
    return {
      success: false,
      courier_name: 'Pathao Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: auth.error || 'Failed to obtain Pathao access token.',
    }
  }

  // Calculate COD amount: if already paid, collection is 0. Otherwise order total.
  const codAmount = order.payment_status === 'paid' ? 0 : Math.max(0, Math.round(Number(order.total) || 0))

  const totalQuantity = (order.order_items || []).reduce(
    (acc, it) => acc + (Number(it.quantity) || 1),
    0
  ) || 1

  const itemDescription = (order.order_items || [])
    .map((it) => `${it.product_name} x${it.quantity}`)
    .join(', ')
    .slice(0, 100) || 'E-commerce goods'

  const storeIdNum = parseInt(settings.store_id.trim(), 10) || 1

  const payload = {
    store_id: storeIdNum,
    merchant_order_id: order.order_number || `ORD-${order.id.slice(0, 8)}`,
    recipient_name: order.customer_name || 'Customer',
    recipient_phone: recipientPhone,
    recipient_address: recipientAddress,
    recipient_city: 1, // Default Dhaka City
    recipient_zone: 1, // Default Zone
    delivery_type: 48, // Standard 48 Hours
    item_type: 2, // Parcel
    special_instruction: order.notes || 'Handle with care',
    item_quantity: totalQuantity,
    item_weight: 0.5,
    amount_to_collect: codAmount,
    item_description: itemDescription,
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const res = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))

    if (!res.ok || (data.type && data.type !== 'success')) {
      const errMsg =
        data.message ||
        (data.errors ? JSON.stringify(data.errors) : `Pathao API returned error ${res.status}`)
      return {
        success: false,
        courier_name: 'Pathao Courier',
        tracking_code: '',
        courier_booking_status: 'unbooked',
        error: errMsg,
        rawResponse: data,
      }
    }

    const consignmentId = String(data.data?.consignment_id || data.consignment_id || '')
    const trackingUrl = `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(consignmentId)}`

    return {
      success: true,
      courier_name: 'Pathao Courier',
      tracking_code: consignmentId,
      tracking_url: trackingUrl,
      courier_consignment_id: consignmentId,
      courier_booking_status: 'booked',
      rawResponse: data,
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError'
    return {
      success: false,
      courier_name: 'Pathao Courier',
      tracking_code: '',
      courier_booking_status: 'unbooked',
      error: isTimeout
        ? 'Pathao parcel creation request timed out.'
        : (err?.message || 'Failed to connect to Pathao API'),
    }
  }
}
