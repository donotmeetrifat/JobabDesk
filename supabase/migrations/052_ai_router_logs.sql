-- Migration: 052_ai_router_logs
-- AI WhatsApp & Messenger Intent Router logs & account settings

CREATE TABLE IF NOT EXISTS ai_auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  incoming_message TEXT NOT NULL,
  intent_detected TEXT CHECK (intent_detected IN ('product_inquiry', 'order_status', 'general_faq', 'human_escalation')),
  ai_reply TEXT NOT NULL,
  model_used TEXT DEFAULT 'gemini-3.8-flash',
  confidence_score NUMERIC(4,2) DEFAULT 1.0,
  is_sent BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Settings toggle for auto-reply
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_auto_reply_tone TEXT DEFAULT 'friendly_bangla';

ALTER TABLE ai_auto_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_ai_replies" ON ai_auto_replies
  FOR ALL USING (is_account_member(account_id, 'viewer'));

CREATE INDEX IF NOT EXISTS idx_ai_auto_replies_account ON ai_auto_replies(account_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_auto_replies TO authenticated;
NOTIFY pgrst, 'reload schema';
