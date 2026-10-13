/**
 * Secret Masking Utilities
 * Protects API tokens, Meta credentials, and courier passwords from unauthorized exposure.
 */

export function isMaskedValue(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false
  return val.includes('••••') || val.includes('****')
}

export function maskSecret(secret?: string | null): string {
  if (!secret || typeof secret !== 'string') return ''
  const trimmed = secret.trim()
  if (!trimmed) return ''

  // If already masked, don't re-mask
  if (isMaskedValue(trimmed)) return trimmed

  if (trimmed.length <= 8) {
    return '••••••••'
  }

  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-3)
  return `${prefix}••••••••${suffix}`
}

/**
 * Recursively masks sensitive fields in an object unless caller is owner
 */
export function sanitizeCredentials<T extends Record<string, any>>(
  obj: T,
  isOwner: boolean,
  sensitiveKeys: string[] = [
    'api_key',
    'secret_key',
    'client_secret',
    'password',
    'whatsapp_access_token',
    'facebook_page_access_token',
  ]
): T {
  if (isOwner || !obj || typeof obj !== 'object') return obj

  const clone: Record<string, any> = Array.isArray(obj) ? [...obj] : { ...obj }

  for (const [key, value] of Object.entries(clone)) {
    if (sensitiveKeys.includes(key) && typeof value === 'string' && value.length > 0) {
      clone[key] = maskSecret(value)
    } else if (value && typeof value === 'object') {
      clone[key] = sanitizeCredentials(value, isOwner, sensitiveKeys)
    }
  }

  return clone as T
}
