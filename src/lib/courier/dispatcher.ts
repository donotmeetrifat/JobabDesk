import type { BookParcelInput, BookParcelResult } from './types'
import { buildTrackingUrl } from './types'
import { bookSteadfastParcel } from './steadfast'
import { bookPathaoParcel } from './pathao'

export async function bookCourierParcel(input: BookParcelInput): Promise<BookParcelResult> {
  const { order, provider, courierSettings, manualDetails } = input

  if (provider === 'manual') {
    const courierName = (manualDetails?.courierName || 'In-House Delivery').trim()
    const trackingCode = (manualDetails?.trackingCode || '').trim()

    if (!trackingCode) {
      return {
        success: false,
        courier_name: courierName,
        tracking_code: '',
        courier_booking_status: 'unbooked',
        error: 'Tracking / Consignment / Memo number is required.',
      }
    }

    const trackingUrl =
      (manualDetails?.trackingUrl || '').trim() ||
      buildTrackingUrl(courierName, trackingCode) ||
      null

    return {
      success: true,
      courier_name: courierName,
      tracking_code: trackingCode,
      tracking_url: trackingUrl,
      courier_consignment_id: null,
      courier_booking_status: 'booked',
    }
  }

  if (provider === 'steadfast') {
    const settings = courierSettings?.steadfast
    if (!settings || !settings.enabled) {
      return {
        success: false,
        courier_name: 'Steadfast Courier',
        tracking_code: '',
        courier_booking_status: 'unbooked',
        error: 'Steadfast Courier is not enabled in Store Settings. Please enable it in Settings > Courier.',
      }
    }

    return await bookSteadfastParcel(order, settings)
  }

  if (provider === 'pathao') {
    const settings = courierSettings?.pathao
    if (!settings || !settings.enabled) {
      return {
        success: false,
        courier_name: 'Pathao Courier',
        tracking_code: '',
        courier_booking_status: 'unbooked',
        error: 'Pathao Courier is not enabled in Store Settings. Please enable it in Settings > Courier.',
      }
    }

    return await bookPathaoParcel(order, settings)
  }

  return {
    success: false,
    courier_name: 'Unknown Provider',
    tracking_code: '',
    courier_booking_status: 'unbooked',
    error: `Unsupported courier provider: ${provider}`,
  }
}
