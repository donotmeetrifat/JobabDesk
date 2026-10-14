/**
 * Bank-Grade Anti-XSS & Input Sanitization Shield.
 *
 * Runs across Edge runtime, Node server, and browser clients without
 * DOM or external library dependencies.
 *
 * Strips script tags, HTML tags, event handler attributes, javascript: pseudo-protocols,
 * and dangerous control characters before writing to the database or rendering in views.
 */

const DANGEROUS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
  /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
  /<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi,
  /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
  /\s*on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi,
  /javascript:\s*/gi,
  /data:\s*text\/html/gi,
  /vbscript:\s*/gi,
];

/**
 * Escapes characters with HTML entities.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Strips all HTML tags and control characters, returning clean plain text.
 * Ideal for names, addresses, notes, customer remarks, and chat input.
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // 1. Remove NULL bytes and non-printable control characters (except newline, carriage return, tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 2. Strip dangerous blocks first
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // 3. Strip all remaining HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  return sanitized.trim();
}

/**
 * Strips dangerous executable script elements and handlers while preserving basic formatting.
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== 'string') return '';

  let sanitized = input;

  // 1. Strip NULL bytes
  sanitized = sanitized.replace(/\0/g, '');

  // 2. Strip dangerous script tags and event handlers
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}

/**
 * Strictly sanitizes transaction IDs (TrxID) for mobile banking / bank payments.
 * Only allows uppercase alphanumeric characters [A-Z0-9].
 */
export function sanitizeTrxId(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 32);
}

/**
 * Cleans phone numbers, removing all characters except +, digits, and hyphens/spaces.
 */
export function sanitizePhone(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[^\d+]/g, '');
}

/**
 * Batch-sanitizes common order, customer, and payment fields.
 */
export function sanitizeCustomerInput<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;

  const result: Record<string, any> = { ...data };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('trx') || lowerKey === 'transaction_id') {
        result[key] = sanitizeTrxId(value);
      } else if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
        result[key] = sanitizePhone(value);
      } else {
        result[key] = sanitizeText(value);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeCustomerInput(value);
    }
  }

  return result as T;
}
