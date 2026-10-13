import { describe, it, expect } from 'vitest'
import { isMaskedValue, maskSecret, sanitizeCredentials } from './masking'

describe('Security Secret Masking Utilities', () => {
  describe('isMaskedValue', () => {
    it('detects masked bullet values', () => {
      expect(isMaskedValue('EAAB••••••••38f')).toBe(true)
      expect(isMaskedValue('••••••••')).toBe(true)
      expect(isMaskedValue('sec_****_999')).toBe(true)
    })

    it('returns false for unmasked values and non-strings', () => {
      expect(isMaskedValue('EAABw819238912389123')).toBe(false)
      expect(isMaskedValue('')).toBe(false)
      expect(isMaskedValue(null)).toBe(false)
      expect(isMaskedValue(undefined)).toBe(false)
    })
  })

  describe('maskSecret', () => {
    it('returns empty string for null, undefined, or empty string', () => {
      expect(maskSecret(null)).toBe('')
      expect(maskSecret(undefined)).toBe('')
      expect(maskSecret('')).toBe('')
      expect(maskSecret('   ')).toBe('')
    })

    it('does not double mask an already masked string', () => {
      expect(maskSecret('EAAB••••••••38f')).toBe('EAAB••••••••38f')
      expect(maskSecret('••••••••')).toBe('••••••••')
    })

    it('fully obscures short secrets (length <= 8)', () => {
      expect(maskSecret('12345')).toBe('••••••••')
      expect(maskSecret('12345678')).toBe('••••••••')
    })

    it('shields long secrets preserving first 4 and last 3 chars', () => {
      const secret = 'EAABw819238912389123XYZ'
      const masked = maskSecret(secret)
      expect(masked).toBe('EAAB••••••••XYZ')
      expect(masked.startsWith('EAAB')).toBe(true)
      expect(masked.endsWith('XYZ')).toBe(true)
      expect(masked.includes('••••••••')).toBe(true)
    })
  })

  describe('sanitizeCredentials', () => {
    it('preserves all secrets completely unchanged if caller is owner', () => {
      const payload = {
        id: 'acc-1',
        name: 'Store',
        api_key: 'stf_live_secret_key_123',
        courier: {
          password: 'super_secret_password',
        },
      }

      const result = sanitizeCredentials(payload, true)
      expect(result.api_key).toBe('stf_live_secret_key_123')
      expect(result.courier.password).toBe('super_secret_password')
    })

    it('masks sensitive credentials when caller is not owner', () => {
      const payload = {
        id: 'acc-1',
        name: 'Store',
        api_key: 'stf_live_secret_key_123',
        public_id: 'pub_9999',
        courier: {
          client_secret: 'steadfast_secret_key_xyz',
          endpoint: 'https://portal.steadfast.com.bd',
        },
      }

      const sanitized = sanitizeCredentials(payload, false)
      expect(sanitized.id).toBe('acc-1')
      expect(sanitized.name).toBe('Store')
      expect(sanitized.public_id).toBe('pub_9999')
      expect(sanitized.courier.endpoint).toBe('https://portal.steadfast.com.bd')

      // Sensitive fields masked
      expect(sanitized.api_key).toBe('stf_••••••••123')
      expect(sanitized.courier.client_secret).toBe('stea••••••••xyz')
    })

    it('works on array structures of settings or records', () => {
      const list = [
        { name: 'Gateway 1', secret_key: 'sk_live_123456789' },
        { name: 'Gateway 2', secret_key: 'sk_live_987654321' },
      ]

      const sanitized = sanitizeCredentials(list as any, false)
      expect(sanitized[0].secret_key).toBe('sk_l••••••••789')
      expect(sanitized[1].secret_key).toBe('sk_l••••••••321')
    })
  })
})
