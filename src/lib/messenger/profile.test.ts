import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchMetaUserProfile } from './profile'

describe('fetchMetaUserProfile', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('rejects invalid or non-numeric PSIDs', async () => {
    expect(await fetchMetaUserProfile('', 'token')).toBeNull()
    expect(await fetchMetaUserProfile('abc_xyz', 'token')).toBeNull()
    expect(await fetchMetaUserProfile('12345', '')).toBeNull()
  })

  it('resolves name and avatarUrl from primary fields endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Rifat Hasan',
        first_name: 'Rifat',
        last_name: 'Hasan',
        profile_pic: 'https://platform-lookaside.fbsbx.com/platform/profilepic/123.jpg',
      }),
    } as any)

    const profile = await fetchMetaUserProfile('123456789012345', 'mock-token')
    expect(profile).not.toBeNull()
    expect(profile?.name).toBe('Rifat Hasan')
    expect(profile?.avatarUrl).toBe('https://platform-lookaside.fbsbx.com/platform/profilepic/123.jpg')
  })

  it('falls back to /{psid}/picture endpoint if profile_pic is missing from primary endpoint', async () => {
    global.fetch = vi
      .fn()
      // First call (fields endpoint) returns name without profile_pic
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: 'Sadiya Akter',
          first_name: 'Sadiya',
          last_name: 'Akter',
        }),
      } as any)
      // Second call (picture endpoint fallback) returns avatar
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            url: 'https://scontent.xx.fbcdn.net/v/avatar-sadiya.jpg',
            is_silhouette: false,
          },
        }),
      } as any)

    const profile = await fetchMetaUserProfile('987654321098765', 'mock-token')
    expect(profile).not.toBeNull()
    expect(profile?.name).toBe('Sadiya Akter')
    expect(profile?.avatarUrl).toBe('https://scontent.xx.fbcdn.net/v/avatar-sadiya.jpg')
  })

  it('extracts avatar from json.picture.data.url if returned in fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'Tanvir Ahmed',
        picture: {
          data: {
            url: 'https://scontent.xx.fbcdn.net/v/avatar-tanvir.jpg',
          },
        },
      }),
    } as any)

    const profile = await fetchMetaUserProfile('112233445566778', 'mock-token')
    expect(profile).not.toBeNull()
    expect(profile?.name).toBe('Tanvir Ahmed')
    expect(profile?.avatarUrl).toBe('https://scontent.xx.fbcdn.net/v/avatar-tanvir.jpg')
  })
})
