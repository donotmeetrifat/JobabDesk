import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendOrderStatusNotification } from './order-notifications'

describe('Order Notifications (Phase 6A: Shipping Notification)', () => {
  const baseOrder = {
    id: '12345678-1234-1234-1234-1234567890ab',
    conversation_id: 'conv-123',
    order_number: 'ORD-2026-0001',
    customer_name: 'Habibur Rahman',
    customer_phone: '01812345678',
    customer_address: 'Mirpur 10, Dhaka',
    total: 1500,
    payment_status: 'unpaid',
    payment_method: 'cod',
    courier_name: 'Steadfast Courier',
    tracking_code: 'STDF9988',
    tracking_url: 'https://steadfast.com.bd/t/STDF9988',
    order_items: [
      {
        product_name: 'Smart Watch',
        quantity: 1,
        unit_price: 1500,
      },
    ],
  }

  it('rejects unsupported status', async () => {
    const mockDb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      })),
    }

    const result = await sendOrderStatusNotification({
      order: baseOrder,
      newStatus: 'delivered' as any,
      supabase: mockDb as any,
      accountId: 'acc-1',
    })

    expect(result.success).toBe(false)
    expect(result.reason).toMatch(/unsupported status/i)
  })

  it('generates notification with courier details and returns result', async () => {
    // Mock Supabase admin client
    let insertedMessageContent = ''
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'conv-123' } }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'contact-1',
                name: 'Habibur Rahman',
                phone: '01812345678',
              },
            }),
          }
        }
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                default_currency: 'BDT',
                facebook_page_access_token: null,
              },
            }),
          }
        }
        if (table === 'messages') {
          return {
            insert: vi.fn((payload: any) => {
              insertedMessageContent = payload.content_text
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: { id: 'msg-1', ...payload } }),
              }
            }),
          }
        }
        if (table === 'channel_connections') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }
      }),
    }

    const result = await sendOrderStatusNotification({
      order: baseOrder,
      newStatus: 'shipped',
      supabase: mockDb as any,
      accountId: 'acc-1',
      courierName: 'Steadfast Courier',
      trackingCode: 'STDF9988',
      trackingUrl: 'https://steadfast.com.bd/t/STDF9988',
    })

    expect(result.success).toBe(true)
    expect(insertedMessageContent).toContain('Steadfast Courier')
    expect(insertedMessageContent).toContain('STDF9988')
    expect(insertedMessageContent).toContain('https://steadfast.com.bd/t/STDF9988')
    expect(insertedMessageContent).toContain('অর্ডারটি কুরিয়ারে বুকিং ও পাঠানো হয়েছে')
  })
})
