import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  sanitizeCustomerInput,
  sanitizeHtml,
  sanitizePhone,
  sanitizeText,
  sanitizeTrxId,
} from './sanitize';

describe('Sanitization Shield (Anti-XSS)', () => {
  describe('sanitizeText', () => {
    it('strips script tags and executable contents', () => {
      const malicious = '<script>alert("XSS")</script>Hello World';
      expect(sanitizeText(malicious)).toBe('Hello World');
    });

    it('strips nested and malformed HTML tags', () => {
      const attack = '<img src=x onerror=alert(1)><b>Bold Name</b>';
      expect(sanitizeText(attack)).toBe('Bold Name');
    });

    it('removes javascript: pseudo-protocols', () => {
      const attack = '<a href="javascript:alert(1)">Click Me</a>';
      expect(sanitizeText(attack)).toBe('Click Me');
    });

    it('strips null bytes and control characters', () => {
      const input = 'Hello\x00\x01\x08World';
      expect(sanitizeText(input)).toBe('HelloWorld');
    });

    it('returns empty string for non-string values', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(12345)).toBe('');
    });
  });

  describe('sanitizeHtml', () => {
    it('removes script, iframe, and dangerous event handlers', () => {
      const input = '<div onclick="stealCookies()">Test<iframe src="evil.com"></iframe></div>';
      const clean = sanitizeHtml(input);
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('iframe');
      expect(clean).toContain('<div>Test</div>');
    });
  });

  describe('sanitizeTrxId', () => {
    it('cleans and normalizes alphanumeric transaction IDs', () => {
      expect(sanitizeTrxId(' bja830k29x ')).toBe('BJA830K29X');
      expect(sanitizeTrxId('TRX-1234#5678!')).toBe('TRX12345678');
    });

    it('caps maximum length at 32 characters', () => {
      const long = 'A'.repeat(50);
      expect(sanitizeTrxId(long).length).toBe(32);
    });

    it('returns empty string for empty or non-string inputs', () => {
      expect(sanitizeTrxId('')).toBe('');
      expect(sanitizeTrxId(null)).toBe('');
    });
  });

  describe('sanitizePhone', () => {
    it('removes letters and unwanted characters from phone numbers', () => {
      expect(sanitizePhone('+880 1711-223344')).toBe('+8801711223344');
      expect(sanitizePhone('01711223344 ext 12')).toBe('0171122334412');
    });
  });

  describe('sanitizeCustomerInput', () => {
    it('sanitizes common order and customer fields in an object', () => {
      const input = {
        customer_name: '<script>alert(1)</script>John Doe',
        customer_address: 'House 4, <b>Road 2</b><iframe src="x"></iframe>',
        notes: 'Please call <img src=x onerror=alert(2)> before delivery',
        trx_id: ' bja-830-k29x ',
        customer_phone: '+880 1711-223344',
        nested: {
          note: '<script>evil()</script>Safe text',
        },
      };

      const result = sanitizeCustomerInput(input);
      expect(result.customer_name).toBe('John Doe');
      expect(result.customer_address).toBe('House 4, Road 2');
      expect(result.notes).toBe('Please call  before delivery');
      expect(result.trx_id).toBe('BJA830K29X');
      expect(result.customer_phone).toBe('+8801711223344');
      expect(result.nested.note).toBe('Safe text');
    });
  });

  describe('escapeHtml', () => {
    it('escapes &, <, >, ", \', / characters', () => {
      expect(escapeHtml('<script>alert("hello & bye")</script>')).toBe(
        '&lt;script&gt;alert(&quot;hello &amp; bye&quot;)&lt;&#x2F;script&gt;'
      );
    });
  });
});
