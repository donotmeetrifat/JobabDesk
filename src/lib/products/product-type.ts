/**
 * Utility to identify whether a product or order is Digital vs Physical.
 * Digital products (subscriptions, licenses, software, accounts, top-ups, courses, ebooks)
 * require Email address + Payment Confirmation (no COD), and do NOT require physical courier parcels or delivery addresses.
 */

const DIGITAL_KEYWORDS = /\b(?:digital|subscription|software|license|licence|account|accounts|access|canva|pro|netflix|spotify|youtube\s*premium|telegram\s*premium|prime\s*video|chatgpt|openai|gemini|vpn|key|keys|activation|topup|top-up|game|course|courses|ebook|ebooks|e-book|pdf|template|templates|domain|hosting|service|services|plugin|preset|voucher|token|gift\s*card|giftcard|adobe|cloud)\b/i

const DIGITAL_CATEGORIES = new Set([
  'digital',
  'subscription',
  'subscriptions',
  'software',
  'services',
  'service',
  'accounts',
  'account',
  'license',
  'licenses',
  'topup',
  'top-up',
  'course',
  'courses',
  'ebook',
  'ebooks',
])

export function isDigitalProduct(product?: {
  name?: string | null
  category?: string | null
  description?: string | null
  product_name?: string | null
} | null): boolean {
  if (!product) return false

  const category = (product.category || '').toLowerCase().trim()
  if (DIGITAL_CATEGORIES.has(category)) return true

  const text = `${product.product_name || ''} ${product.name || ''} ${category} ${product.description || ''}`
  return DIGITAL_KEYWORDS.test(text)
}

export function checkIsDigitalOrder(items?: Array<any> | null): boolean {
  if (!items || items.length === 0) return false
  return items.some((it) => isDigitalProduct(it))
}

export function isDigitalText(text?: string | null): boolean {
  if (!text) return false
  return DIGITAL_KEYWORDS.test(text)
}
