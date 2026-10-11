import { describe, it, expect, vi } from 'vitest'
import { autoUpdateContactFromChatMessage } from './auto-extract'

describe('autoUpdateContactFromChatMessage', () => {
  it('updates phone and address from delivery info message', async () => {
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockQueryBuilder: any = {}
    mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.neq = vi.fn().mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.limit = vi.fn().mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.update = mockUpdate
    mockQueryBuilder.maybeSingle = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        data: {
          id: 'c-1',
          account_id: 'acc-1',
          name: 'Facebook User',
          phone: '123456789012345',
          company: 'Facebook Messenger',
        },
        error: null,
      })
    })

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'contacts') return mockQueryBuilder
        if (table === 'contact_notes') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return mockQueryBuilder
      }),
    }

    const message = `Sadiya
Address: Dhanmondi 27, House 10
01712345678`

    const res = await autoUpdateContactFromChatMessage({
      contactId: 'c-1',
      accountId: 'acc-1',
      messageText: message,
      supabase: mockSupabase as any,
    })

    expect(res.updated).toBe(true)
    expect(res.updates.phone).toBe('+8801712345678')
    expect(res.updates.address).toContain('Dhanmondi 27')
    // Crucial requirement: for Facebook Messenger contacts, delivery recipient name must NOT overwrite contact name!
    expect(res.updates.name).toBeUndefined()
  })

  it('never treats courtesy tokens like "thanks" or "dhonnobad" as names', async () => {
    const mockUpdate = vi.fn()
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'c-2',
                account_id: 'acc-1',
                name: 'Rifat',
                phone: '+8801700000000',
              },
            }),
          }),
        }),
        update: mockUpdate,
      })),
    }

    const res = await autoUpdateContactFromChatMessage({
      contactId: 'c-2',
      accountId: 'acc-1',
      messageText: 'thanks a lot',
      supabase: mockSupabase as any,
    })

    expect(res.updated).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
