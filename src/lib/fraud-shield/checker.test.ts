import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeBdPhone, isValidBdPhone } from './phone'
import { checkSteadfastFraud, assessCustomerRisk } from './checker'

describe('Anti-RTO Phone Normalization', () => {
  it('normalizes standard 11-digit BD mobile numbers', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678')
    expect(normalizeBdPhone('01812345678')).toBe('01812345678')
    expect(normalizeBdPhone('01912345678')).toBe('01912345678')
  })

  it('strips +880 and 880 country code prefixes', () => {
    expect(normalizeBdPhone('+8801712345678')).toBe('01712345678')
    expect(normalizeBdPhone('8801712345678')).toBe('01712345678')
    expect(normalizeBdPhone('+8801912345678')).toBe('01912345678')
  })

  it('removes spaces, parentheses, and dashes', () => {
    expect(normalizeBdPhone('01712-345 678')).toBe('01712345678')
    expect(normalizeBdPhone('+88 (017) 1234-5678')).toBe('01712345678')
  })

  it('converts Bengali digits to standard Western ASCII digits', () => {
    expect(normalizeBdPhone('০১৭১২৩৪৫৬৭৮')).toBe('01712345678')
    expect(normalizeBdPhone('+৮৮০১৭১২৩৪৫৬৭৮')).toBe('01712345678')
    expect(normalizeBdPhone('৮৮০১৮১২৩৪৫৬৭৮')).toBe('01812345678')
  })

  it('validates BD mobile phone patterns correctly', () => {
    expect(isValidBdPhone('01712345678')).toBe(true)
    expect(isValidBdPhone('01312345678')).toBe(true)
    expect(isValidBdPhone('01412345678')).toBe(true)
    expect(isValidBdPhone('01512345678')).toBe(true)
    expect(isValidBdPhone('01612345678')).toBe(true)
    expect(isValidBdPhone('01812345678')).toBe(true)
    expect(isValidBdPhone('01912345678')).toBe(true)
    // Invalid prefixes
    expect(isValidBdPhone('01212345678')).toBe(false)
    expect(isValidBdPhone('01012345678')).toBe(false)
    expect(isValidBdPhone('12345')).toBe(false)
  })
})

describe('Steadfast Fraud Check API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('successfully fetches and maps Steadfast delivery statistics', async () => {
    const mockResponse = {
      status: 200,
      total_parcel: 10,
      total_delivered: 8,
      total_cancel: 2,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response)

    const result = await checkSteadfastFraud('01712345678', 'test-api-key', 'test-secret-key')

    expect(result.success).toBe(true)
    expect(result.total_parcels).toBe(10)
    expect(result.delivered_parcels).toBe(8)
    expect(result.cancelled_parcels).toBe(2)
    expect(result.delivery_ratio).toBe(80)
  })

  it('handles API errors gracefully and returns fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Steadfast Fraud Check failed: 401' }),
    } as Response)

    const result = await checkSteadfastFraud('01712345678', 'bad-key', 'bad-secret')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Steadfast Fraud Check failed')
  })
})

describe('Customer Risk Assessment Engine', () => {
  const accountId = 'acc-12345'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('identifies blacklisted customer and returns blacklisted risk level immediately', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'customer_blacklists') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'bl-1',
                phone: '01712345678',
                phone_normalized: '01712345678',
                reason: 'Serial COD parcel refuser',
              },
              error: null,
            }),
          }
        }
        return {}
      }),
    }

    const assessment = await assessCustomerRisk({
      phone: '01712345678',
      accountId,
      supabase: mockSupabase,
    })

    expect(assessment.risk_level).toBe('blacklisted')
    expect(assessment.is_blacklisted).toBe(true)
    expect(assessment.blacklist_reason).toBe('Serial COD parcel refuser')
    expect(assessment.recommendation).toContain('Do NOT dispatch parcel via Cash on Delivery')
  })

  it('identifies High Return Risk when Steadfast returns <60% delivery ratio', async () => {
    // Mock Steadfast HTTP response
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        total_parcel: 10,
        total_delivered: 4,
        total_cancel: 6,
      }),
    } as Response)

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'customer_blacklists') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            neq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {}
      }),
    }

    const assessment = await assessCustomerRisk({
      phone: '01712345678',
      accountId,
      supabase: mockSupabase,
      steadfastSettings: {
        enabled: true,
        api_key: 'valid-api-key',
        secret_key: 'valid-secret-key',
      },
    })

    expect(assessment.risk_level).toBe('high')
    expect(assessment.delivery_ratio).toBe(40)
    expect(assessment.total_parcels).toBe(10)
    expect(assessment.cancelled_parcels).toBe(6)
    expect(assessment.recommendation).toContain('150 Advance Delivery Fee')
    expect(assessment.recommendationBn).toContain('১৫০ টাকা অগ্রিম ডেলিভারি চার্জ')
  })

  it('falls back to internal store order history when Steadfast is not configured', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'customer_blacklists') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                { id: 'ord-1', status: 'delivered', customer_phone: '01712345678' },
                { id: 'ord-2', status: 'delivered', customer_phone: '01712345678' },
                { id: 'ord-3', status: 'delivered', customer_phone: '01712345678' },
                { id: 'ord-4', status: 'delivered', customer_phone: '01712345678' },
              ],
              error: null,
            }),
          }
        }
        return {}
      }),
    }

    const assessment = await assessCustomerRisk({
      phone: '01712345678',
      accountId,
      supabase: mockSupabase,
      steadfastSettings: null, // Zero API keys
    })

    expect(assessment.risk_level).toBe('low')
    expect(assessment.source).toBe('internal')
    expect(assessment.delivery_ratio).toBe(100)
    expect(assessment.total_parcels).toBe(4)
    expect(assessment.delivered_parcels).toBe(4)
    expect(assessment.cancelled_parcels).toBe(0)
    expect(assessment.recommendation).toContain('Safe for 100% Cash on Delivery')
  })

  it('flags medium risk for customers with 1 cancellation or 60-79% delivery ratio', async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'customer_blacklists') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                { id: 'ord-1', status: 'delivered', customer_phone: '01712345678' },
                { id: 'ord-2', status: 'delivered', customer_phone: '01712345678' },
                { id: 'ord-3', status: 'cancelled', customer_phone: '01712345678' },
              ],
              error: null,
            }),
          }
        }
        return {}
      }),
    }

    const assessment = await assessCustomerRisk({
      phone: '01712345678',
      accountId,
      supabase: mockSupabase,
      steadfastSettings: null,
    })

    expect(assessment.risk_level).toBe('medium')
    expect(assessment.delivery_ratio).toBe(67)
    expect(assessment.cancelled_parcels).toBe(1)
    expect(assessment.recommendation).toContain('Verify customer phone number & full street address')
  })
})
