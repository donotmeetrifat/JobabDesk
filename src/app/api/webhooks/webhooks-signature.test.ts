import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

import { POST as messengerPost } from './messenger/route';
import { POST as whatsappPost } from './whatsapp/route';

const SECRET = 'test_meta_app_secret_abc123';

function signBody(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('Meta Webhook HMAC-SHA256 Signature Verification', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  });

  describe('Messenger Webhook (POST /api/webhooks/messenger)', () => {
    it('rejects requests with invalid or missing HMAC signature when META_APP_SECRET is set', async () => {
      const payload = JSON.stringify({ object: 'page', entry: [] });
      const req = new Request('http://localhost:3000/api/webhooks/messenger', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': 'sha256=invalid_hex_digest_00000000000000000000000000000000',
        },
        body: payload,
      });

      const res = await messengerPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid signature');
    });

    it('accepts requests with valid HMAC-SHA256 signature matching META_APP_SECRET', async () => {
      const payload = JSON.stringify({ object: 'page', entry: [] });
      const signature = signBody(payload, SECRET);

      const req = new Request('http://localhost:3000/api/webhooks/messenger', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await messengerPost(req);
      expect(res.status).toBe(200);
    });
  });

  describe('WhatsApp Webhook (POST /api/webhooks/whatsapp)', () => {
    it('rejects requests with invalid HMAC signature when META_APP_SECRET is set', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const req = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': 'sha256=invalid_hex_digest_11111111111111111111111111111111',
        },
        body: payload,
      });

      const res = await whatsappPost(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid signature');
    });

    it('accepts requests with valid HMAC-SHA256 signature matching META_APP_SECRET', async () => {
      const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
      const signature = signBody(payload, SECRET);

      const req = new Request('http://localhost:3000/api/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': signature,
        },
        body: payload,
      });

      const res = await whatsappPost(req);
      expect(res.status).toBe(200);
    });
  });
});
