import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bookCourierParcel } from './dispatcher'
import { buildTrackingUrl } from './types'
import type { Order, CourierSettings } from '@/types/orders'

describe('Courier Module (Phase 6A: Hybrid Courier Engine)', () => {
  const baseOrder: Order = {
    id: 'ord-12345678-abcd',
    account_id: 'acc-1',
    order_number: 'ORD-2026-0001',
    customer_name: 'Tanvir Ahmed',
    customer_phone: '01712345678',
    customer_address: 'House 12, Road 4, Dhanmondi, Dhaka',
    status: 'processing',
    payment_method: 'cod',
    payment_status: 'unpaid',
    subtotal: 1000,
    discount: 0,
    delivery_charge: 100,
    total: 1100,
    source: 'whatsapp',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    order_items: [
      {
        product_name: 'Premium T-Shirt',
        quantity: 2,
        unit_price: 500,
        total: 1000,
      },
    ],
  }

  const baseSettings: CourierSettings = {
    default_provider: 'manual',
    steadfast: {
      enabled: true,
      api_key: 'test_api_key',
      secret_key: 'test_secret_key',
    },
    pathao: {
      enabled: true,
      client_id: 'test_client_id',
      client_secret: 'test_client_secret',
      username: 'test_user',
      password: 'test_password',
      store_id: '12345',
    },
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildTrackingUrl', () => {
    it('builds Steadfast tracking URL', () => {
      expect(buildTrackingUrl('Steadfast Courier', 'STDF-9988')).toBe(
        'https://steadfast.com.bd/t/STDF-9988'
      )
    })

    it('builds Pathao tracking URL', () => {
      expect(buildTrackingUrl('Pathao Courier', 'PT-12345')).toBe(
        'https://pathao.com/courier/tracking/?consignment_id=PT-12345'
      )
    })

    it('builds RedX tracking URL', () => {
      expect(buildTrackingUrl('RedX', 'REDX-5544')).toBe(
        'https://redx.com.bd/track/?trackingId=REDX-5544'
      )
    })

    it('builds Paperfly tracking URL', () => {
      expect(buildTrackingUrl('Paperfly', 'PF-7766')).toBe(
        'https://paperfly.com.bd/tracking.php?order_id=PF-7766'
      )
    })

    it('returns null for manual couriers without public url template (e.g. Sundarban, SA Paribahan)', () => {
      expect(buildTrackingUrl('Sundarban Courier', 'SUN-1122')).toBeNull()
      expect(buildTrackingUrl('SA Paribahan', 'SA-3344')).toBeNull()
      expect(buildTrackingUrl('In-House Delivery', 'IN-01')).toBeNull()
    })

    it('returns null for empty tracking code', () => {
      expect(buildTrackingUrl('Steadfast Courier', '')).toBeNull()
      expect(buildTrackingUrl('Steadfast Courier', '   ')).toBeNull()
    })
  })

  describe('Tier 1: Free Manual Delivery Tracking (0 API Keys)', () => {
    it('fails when tracking code is missing', async () => {
      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'manual',
        manualDetails: {
          courierName: 'Sundarban Courier',
          trackingCode: '',
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/tracking.*is required/i)
      expect(result.courier_booking_status).toBe('unbooked')
    })

    it('successfully books manual consignment with auto-generated tracking URL', async () => {
      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'manual',
        manualDetails: {
          courierName: 'RedX',
          trackingCode: 'REDX-998811',
        },
      })

      expect(result.success).toBe(true)
      expect(result.courier_name).toBe('RedX')
      expect(result.tracking_code).toBe('REDX-998811')
      expect(result.tracking_url).toBe('https://redx.com.bd/track/?trackingId=REDX-998811')
      expect(result.courier_booking_status).toBe('booked')
      expect(result.courier_consignment_id).toBeNull()
    })

    it('supports custom tracking URL entered by merchant', async () => {
      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'manual',
        manualDetails: {
          courierName: 'Local Courier',
          trackingCode: 'LC-123',
          trackingUrl: 'https://localcourier.example/track/LC-123',
        },
      })

      expect(result.success).toBe(true)
      expect(result.courier_name).toBe('Local Courier')
      expect(result.tracking_url).toBe('https://localcourier.example/track/LC-123')
    })
  })

  describe('Tier 2: Steadfast Courier API Integration', () => {
    it('fails when Steadfast is disabled in settings', async () => {
      const disabledSettings: CourierSettings = {
        ...baseSettings,
        steadfast: { ...baseSettings.steadfast, enabled: false },
      }

      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'steadfast',
        courierSettings: disabledSettings,
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not enabled/i)
    })

    it('fails when customer phone is missing', async () => {
      const orderWithoutPhone: Order = { ...baseOrder, customer_phone: '' }
      const result = await bookCourierParcel({
        order: orderWithoutPhone,
        provider: 'steadfast',
        courierSettings: baseSettings,
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/phone number is required/i)
    })

    it('successfully books parcel with Steadfast and calculates COD', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          message: 'Order created successfully',
          consignment: {
            consignment_id: 887766,
            invoice: 'ORD-2026-0001',
            tracking_code: 'STDF887766',
          },
        }),
      } as any)

      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'steadfast',
        courierSettings: baseSettings,
      })

      expect(result.success).toBe(true)
      expect(result.courier_name).toBe('Steadfast Courier')
      expect(result.tracking_code).toBe('STDF887766')
      expect(result.courier_consignment_id).toBe('887766')
      expect(result.tracking_url).toBe('https://steadfast.com.bd/t/STDF887766')
      expect(result.courier_booking_status).toBe('booked')

      // Check request body sent to Steadfast
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs[0]).toBe('https://portal.steadfast.com.bd/api/v1/create_order')
      const sentPayload = JSON.parse(callArgs[1]?.body as string)
      expect(sentPayload.cod_amount).toBe(1100) // Unpaid order collects total
      expect(sentPayload.recipient_phone).toBe('01712345678')
    })

    it('sets cod_amount to 0 when order is already paid', async () => {
      const paidOrder: Order = { ...baseOrder, payment_status: 'paid' }
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 200,
          consignment: {
            consignment_id: 112233,
            tracking_code: 'STDF112233',
          },
        }),
      } as any)

      await bookCourierParcel({
        order: paidOrder,
        provider: 'steadfast',
        courierSettings: baseSettings,
      })

      const sentPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(sentPayload.cod_amount).toBe(0)
    })
  })

  describe('Tier 2: Pathao Courier API Integration', () => {
    it('fails when Pathao is disabled in settings', async () => {
      const disabledSettings: CourierSettings = {
        ...baseSettings,
        pathao: { ...baseSettings.pathao, enabled: false },
      }

      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'pathao',
        courierSettings: disabledSettings,
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/not enabled/i)
    })

    it('successfully authenticates and creates order with Pathao', async () => {
      const mockFetch = vi
        .spyOn(global, 'fetch')
        // Call 1: issue token
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'mock_bearer_token',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        } as any)
        // Call 2: create order
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            type: 'success',
            message: 'Order Created Successfully',
            data: {
              consignment_id: 'PT-998877',
              order_status: 'Pending',
            },
          }),
        } as any)

      const result = await bookCourierParcel({
        order: baseOrder,
        provider: 'pathao',
        courierSettings: baseSettings,
      })

      expect(result.success).toBe(true)
      expect(result.courier_name).toBe('Pathao Courier')
      expect(result.tracking_code).toBe('PT-998877')
      expect(result.courier_consignment_id).toBe('PT-998877')
      expect(result.tracking_url).toBe(
        'https://pathao.com/courier/tracking/?consignment_id=PT-998877'
      )
      expect(result.courier_booking_status).toBe('booked')

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const tokenCall = mockFetch.mock.calls[0]
      expect(tokenCall[0]).toContain('/aladdin/api/v1/issue-token')

      const orderCall = mockFetch.mock.calls[1]
      expect(orderCall[0]).toContain('/aladdin/api/v1/orders')
      const orderPayload = JSON.parse(orderCall[1]?.body as string)
      expect(orderPayload.amount_to_collect).toBe(1100)
      expect(orderPayload.store_id).toBe(12345)
    })
  })
})
