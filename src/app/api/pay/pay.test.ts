import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __resetRateLimitForTests } from '@/lib/rate-limit'
import { GET, POST } from './[orderId]/route'
import { POST as verifyPost } from './verify/route'

// Mock dependencies
vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err) =>
    new Response(JSON.stringify({ error: err.message || 'Error' }), {
      status: err.status || 500,
    })
  ),
}))

vi.mock('@/lib/orders/order-notifications', () => ({
  sendOrderStatusNotification: vi.fn().mockResolvedValue({ success: true }),
}))

const mockOrder = {
  id: '00000000-0000-0000-0000-000000000001',
  order_number: 'ORD-2026-0001',
  account_id: '11111111-1111-1111-1111-111111111111',
  customer_name: 'Tanvir Ahmed',
  customer_phone: '01711223344',
  customer_address: 'House 12, Road 4, Dhanmondi, Dhaka',
  delivery_charge: 100,
  subtotal: 1500,
  discount: 0,
  total: 1600,
  status: 'new',
  payment_status: 'unpaid',
  payment_method: 'cod',
  notes: null,
  created_at: '2026-10-13T10:00:00Z',
  order_items: [
    {
      id: 'item-1',
      product_name: 'Premium Cotton Shirt',
      product_sku: 'SHIRT-BLK-L',
      unit_price: 1500,
      quantity: 1,
      total: 1500,
    },
  ],
}

const mockStoreAccount = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Jobab Merchant Store',
  logo_url: 'https://example.com/logo.png',
  business_tagline: 'Best Fashion in Dhaka',
  payment_settings: {
    bkash: { number: '01799887766', type: 'personal' },
    nagad: { number: '01899887766', type: 'merchant' },
    rocket: { number: '01999887766', type: 'personal' },
    bank: { details: 'City Bank AC 1234' },
    allow_cod_advance: true,
    cod_advance_amount: 150,
  },
}

let existingPaymentRequests: any[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const filters: Record<string, any> = {}

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, val: any) => {
          filters[field] = val
          return builder
        }),
        in: vi.fn((field: string, vals: any[]) => {
          filters[field + '_in'] = vals
          return builder
        }),
        ilike: vi.fn((field: string, val: any) => {
          filters[field] = val
          return builder
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        insert: vi.fn((row: any) => {
          const inserted = { id: 'pr-new-' + Math.random(), ...row, created_at: new Date().toISOString() }
          existingPaymentRequests.push(inserted)
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: inserted, error: null })),
            })),
          }
        }),
        update: vi.fn((updates: any) => {
          if (table === 'orders') {
            Object.assign(mockOrder, updates)
          }
          return {
            eq: vi.fn((field: string, val: string) => {
              if (table === 'payment_requests') {
                const pr = existingPaymentRequests.find((p) => p.id === val)
                if (pr) Object.assign(pr, updates)
              }
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => {
                    if (table === 'orders') return { data: { ...mockOrder }, error: null }
                    const pr = existingPaymentRequests.find((p) => p.id === val)
                    return { data: pr, error: null }
                  }),
                })),
              }
            }),
          }
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'orders') {
            if (filters.id && filters.id !== mockOrder.id) return { data: null, error: null }
            if (filters.order_number && filters.order_number !== mockOrder.order_number) return { data: null, error: null }
            if (filters.customer_phone && filters.customer_phone !== mockOrder.customer_phone) return { data: null, error: null }
            return { data: { ...mockOrder }, error: null }
          }
          if (table === 'accounts') {
            return { data: { ...mockStoreAccount }, error: null }
          }
          if (table === 'payment_requests') {
            const match = existingPaymentRequests.find((pr) => {
              if (filters.id && pr.id !== filters.id) return false
              if (filters.trx_id && pr.trx_id !== filters.trx_id) return false
              if (filters.status_in && !filters.status_in.includes(pr.status)) return false
              return true
            })
            return { data: match || null, error: null }
          }
          return { data: null, error: null }
        }),
        single: vi.fn(async () => {
          const res = await builder.maybeSingle()
          if (!res.data) return { data: null, error: new Error('Not found') }
          return res
        }),
      }

      // If queried as a promise (e.g. order item list, accounts list)
      builder.then = (resolve: any) => {
        if (table === 'payment_requests') {
          resolve({ data: existingPaymentRequests, error: null })
        } else if (table === 'accounts') {
          resolve({ data: [{ ...mockStoreAccount }], error: null })
        } else {
          resolve({ data: [], error: null })
        }
      }

      return builder
    }),
  })),
}))

describe('Phase 5D: Free Payment Link & TrxID Verification', () => {
  beforeEach(() => {
    __resetRateLimitForTests()
    existingPaymentRequests = []
    mockOrder.payment_status = 'unpaid'
    mockOrder.status = 'new'
  })

  describe('GET /api/pay/[orderId]', () => {
    it('returns sanitized order details and store payment settings by UUID', async () => {
      const res = await GET(new Request('http://localhost/api/pay/' + mockOrder.id), {
        params: Promise.resolve({ orderId: mockOrder.id }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.order.order_number).toBe('ORD-2026-0001')
      expect(data.order.total).toBe(1600)
      expect(data.store.name).toBe('Jobab Merchant Store')
      expect(data.store.payment_settings.bkash.number).toBe('01799887766')
    })

    it('returns sanitized order details by human order_number', async () => {
      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.order.id).toBe(mockOrder.id)
    })

    it('returns 404 for unknown order ID', async () => {
      const res = await GET(new Request('http://localhost/api/pay/nonexistent'), {
        params: Promise.resolve({ orderId: 'nonexistent' }),
      })

      expect(res.status).toBe(404)
    })

    it('resolves merchant numbers directly from /agents special_instructions when payment_settings is empty', async () => {
      // Mock store account where payment_settings numbers are empty but special_instructions has them
      const originalSettings = { ...mockStoreAccount.payment_settings }
      mockStoreAccount.payment_settings = {
        bkash: { number: '', type: 'personal' },
        nagad: { number: '', type: 'personal' },
        rocket: { number: '', type: 'personal' },
        bank: { details: '' },
        allow_cod_advance: true,
        cod_advance_amount: 150,
      } as any
      ;(mockStoreAccount as any).special_instructions =
        'bKash (Merchant): 01700-112233 | Nagad: 01800-445566 | Rocket: 01900-778899. Cash on Delivery (COD) accepted nationwide.'

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.payment_settings.bkash.number).toBe('01700112233')
      expect(data.store.payment_settings.bkash.type).toBe('merchant')
      expect(data.store.payment_settings.nagad.number).toBe('01800445566')
      expect(data.store.payment_settings.rocket.number).toBe('01900778899')
      expect(data.store.special_instructions).toContain('Cash on Delivery (COD)')

      // Restore mockStoreAccount
      mockStoreAccount.payment_settings = originalSettings
      delete (mockStoreAccount as any).special_instructions
    })

    it('parses Bengali numerals and shared payment providers from special_instructions', async () => {
      const originalSettings = { ...mockStoreAccount.payment_settings }
      mockStoreAccount.payment_settings = {
        bkash: { number: '', type: 'personal' },
        nagad: { number: '', type: 'personal' },
        rocket: { number: '', type: 'personal' },
        bank: { details: '' },
        allow_cod_advance: true,
        cod_advance_amount: 150,
      } as any
      ;(mockStoreAccount as any).special_instructions =
        'বিকাশ (মার্চেন্ট): ০১৭০০-১১২২৩৩ | নগদ: ০১৮০০-৪৪৫৫৬৬ | রকেট: ০১৯০০-৭৭৮৮৯৯'

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.payment_settings.bkash.number).toBe('01700112233')
      expect(data.store.payment_settings.bkash.type).toBe('merchant')
      expect(data.store.payment_settings.nagad.number).toBe('01800445566')
      expect(data.store.payment_settings.rocket.number).toBe('01900778899')

      // Restore mockStoreAccount
      mockStoreAccount.payment_settings = originalSettings
      delete (mockStoreAccount as any).special_instructions
    })

    it('correctly maps shared multi-provider instructions like bKash, Nagad: 01712345678', async () => {
      const originalSettings = { ...mockStoreAccount.payment_settings }
      mockStoreAccount.payment_settings = {
        bkash: { number: '', type: 'personal' },
        nagad: { number: '', type: 'personal' },
        rocket: { number: '', type: 'personal' },
        bank: { details: '' },
        allow_cod_advance: true,
        cod_advance_amount: 150,
      } as any
      ;(mockStoreAccount as any).special_instructions =
        'bKash, Nagad: 01712345678 (Personal Send Money)'

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.payment_settings.bkash.number).toBe('01712345678')
      expect(data.store.payment_settings.nagad.number).toBe('01712345678')

      // Restore mockStoreAccount
      mockStoreAccount.payment_settings = originalSettings
      delete (mockStoreAccount as any).special_instructions
    })

    it('parses Card and Bank instructions entered in /agents special_instructions', async () => {
      const originalSettings = { ...mockStoreAccount.payment_settings }
      mockStoreAccount.payment_settings = {
        bkash: { number: '', type: 'personal' },
        nagad: { number: '', type: 'personal' },
        rocket: { number: '', type: 'personal' },
        bank: { details: '' },
        allow_cod_advance: true,
        cod_advance_amount: 150,
      } as any
      ;(mockStoreAccount as any).special_instructions =
        'bKash: 01711223344\nCard / Bank Details:\nBank: City Bank Ltd\nA/C Name: Jobab Merchant Shop\nA/C: 1234567890\nBranch: Gulshan 2\nRouting: 225272635'

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.payment_settings.bkash.number).toBe('01711223344')
      expect(data.store.payment_settings.bank.details).toContain('City Bank Ltd')
      expect(data.store.payment_settings.bank.details).toContain('1234567890')
      expect(data.store.payment_settings.bank.details).toContain('Gulshan 2')

      mockStoreAccount.payment_settings = originalSettings
      delete (mockStoreAccount as any).special_instructions
    })

    it('enforces multi-user tenant isolation without leaking other accounts', async () => {
      // An order belonging to a specific account only receives that account's information
      const originalSettings = { ...mockStoreAccount.payment_settings }
      mockStoreAccount.payment_settings = {
        bkash: { number: '01311223344', type: 'merchant' },
        nagad: { number: '01411223344', type: 'personal' },
        rocket: { number: '01511223344', type: 'personal' },
        bank: { details: 'Custom Bank Info' },
        allow_cod_advance: true,
        cod_advance_amount: 150,
      } as any

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.payment_settings.bkash.number).toBe('01311223344')
      expect(data.store.payment_settings.bkash.type).toBe('merchant')
      expect(data.store.payment_settings.nagad.number).toBe('01411223344')

      mockStoreAccount.payment_settings = originalSettings
    })

    it('resolves and self-heals unlinked orders by finding the merchant configured account', async () => {
      const originalAccountId = mockOrder.account_id
      ;(mockOrder as any).account_id = null // Order without linked account_id

      const res = await GET(new Request('http://localhost/api/pay/ORD-2026-0001'), {
        params: Promise.resolve({ orderId: 'ORD-2026-0001' }),
      })

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.store.name).toBe('Jobab Merchant Store')
      expect(data.store.payment_settings.bkash.number).toBe('01799887766')
      // Self-healed
      expect(mockOrder.account_id).toBe(mockStoreAccount.id)

      mockOrder.account_id = originalAccountId
    })
  })

  describe('POST /api/pay/[orderId] (Anti-Fraud & Submission)', () => {
    it('rejects invalid payment method', async () => {
      const res = await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'crypto',
            sender_number: '01711223344',
            trx_id: 'BJA830K29X',
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toMatch(/Invalid payment method/i)
    })

    it('rejects invalid bKash TrxID length (must be 10 characters)', async () => {
      const res = await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '01711223344',
            trx_id: 'BJA830K29', // 9 characters
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toMatch(/bKash Transaction ID must be exactly 10 characters/i)
    })

    it('accepts valid bKash TrxID and marks order payment_status = payment_submitted', async () => {
      const res = await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '01711223344',
            trx_id: 'BJA830K29X',
            payment_type: 'full',
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.payment_request.trx_id).toBe('BJA830K29X')
      expect(mockOrder.payment_status).toBe('payment_submitted')
    })

    it('prevents double-spending: rejects duplicate TrxID on the same account', async () => {
      // First submission
      await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '01711223344',
            trx_id: 'DUPLICATE1',
            payment_type: 'full',
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      // Duplicate submission attempt
      const res2 = await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '01711223344',
            trx_id: 'DUPLICATE1',
            payment_type: 'full',
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      expect(res2.status).toBe(400)
      const data = await res2.json()
      expect(data.error).toMatch(/already been submitted or verified/i)
    })

    it('sanitizes malicious XSS script tags and characters in customer notes and sender number', async () => {
      const res = await POST(
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '<script>alert(1)</script>01711223344',
            trx_id: ' BJA830K29Y ',
            payment_type: 'full',
            notes: 'Paid via bKash App <img src=x onerror=steal()><b>urgent delivery</b>',
          }),
        }),
        { params: Promise.resolve({ orderId: mockOrder.id }) }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.payment_request.sender_number).toBe('01711223344')
      expect(data.payment_request.trx_id).toBe('BJA830K29Y')
      expect(data.payment_request.notes).toBe('Paid via bKash App urgent delivery')
    })

    it('enforces sliding-window rate limit (10 requests per minute) on payment submissions', async () => {
      const makeReq = (trxId: string) =>
        new Request('http://localhost/api/pay/' + mockOrder.id, {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.88' },
          body: JSON.stringify({
            payment_method: 'bkash',
            sender_number: '01711223344',
            trx_id: trxId,
          }),
        })

      // 10 submissions allowed
      for (let i = 0; i < 10; i++) {
        const res = await POST(makeReq(`BJA000000${i}`), {
          params: Promise.resolve({ orderId: mockOrder.id }),
        })
        expect(res.status).toBe(200)
      }

      // 11th submission from same IP and order must be 429
      const blockedRes = await POST(makeReq('BJA0000099'), {
        params: Promise.resolve({ orderId: mockOrder.id }),
      })
      expect(blockedRes.status).toBe(429)
      const data = await blockedRes.json()
      expect(data.error).toMatch(/rate limit/i)
    })
  })

  describe('POST /api/pay/verify (Admin 1-Click Verification)', () => {
    it('approves payment request, marks order paid & confirmed, and notifies customer', async () => {
      const { requireRole } = await import('@/lib/auth/account')
      vi.mocked(requireRole).mockResolvedValueOnce({
        userId: 'admin-user-1',
        accountId: mockStoreAccount.id,
        supabase: null as any,
        role: 'owner',
      } as any)

      // Add a submitted payment request
      const prId = 'pr-test-123'
      existingPaymentRequests.push({
        id: prId,
        order_id: mockOrder.id,
        account_id: mockStoreAccount.id,
        amount: 1600,
        payment_method: 'bkash',
        payment_type: 'full',
        sender_number: '01711223344',
        trx_id: 'BJA830K29X',
        status: 'submitted',
        created_at: new Date().toISOString(),
      })

      const res = await verifyPost(
        new Request('http://localhost/api/pay/verify', {
          method: 'POST',
          body: JSON.stringify({
            payment_request_id: prId,
            action: 'approve',
          }),
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.payment_request.status).toBe('verified')
      expect(mockOrder.payment_status).toBe('paid')
      expect(mockOrder.status).toBe('confirmed')
    })

    it('rejects payment request and reverts order payment_status to unpaid', async () => {
      const { requireRole } = await import('@/lib/auth/account')
      vi.mocked(requireRole).mockResolvedValueOnce({
        userId: 'admin-user-1',
        accountId: mockStoreAccount.id,
        supabase: null as any,
        role: 'owner',
      } as any)

      const prId = 'pr-test-reject'
      existingPaymentRequests.push({
        id: prId,
        order_id: mockOrder.id,
        account_id: mockStoreAccount.id,
        amount: 1600,
        payment_method: 'bkash',
        payment_type: 'full',
        sender_number: '01711223344',
        trx_id: 'FAKETRX123',
        status: 'submitted',
        created_at: new Date().toISOString(),
      })

      const res = await verifyPost(
        new Request('http://localhost/api/pay/verify', {
          method: 'POST',
          body: JSON.stringify({
            payment_request_id: prId,
            action: 'reject',
            rejection_reason: 'Amount not received in bKash statement',
          }),
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.payment_request.status).toBe('rejected')
      expect(data.payment_request.rejection_reason).toBe('Amount not received in bKash statement')
      expect(mockOrder.payment_status).toBe('unpaid')
    })
  })
})
