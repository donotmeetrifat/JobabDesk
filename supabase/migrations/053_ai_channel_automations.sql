-- Migration: 053_ai_channel_automations
-- Channel Settings, Meta OAuth Credentials, and AI Auto-Reply Logs

-- Channel Settings & Granular Controls
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS messenger_auto_reply_enabled BOOLEAN DEFAULT true;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_primary_language TEXT DEFAULT 'auto_detect'; -- 'auto_detect' | 'bn' | 'en' | 'banglish'

-- Channel Credentials (1-Click Meta OAuth & Tokens)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_waba_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'disconnected'; -- 'connected' | 'disconnected'

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_name TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_access_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS messenger_status TEXT DEFAULT 'disconnected'; -- 'connected' | 'disconnected'

-- AI Auto-Reply Log & Analytics
CREATE TABLE IF NOT EXISTS ai_auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'sandbox',
  incoming_message TEXT NOT NULL,
  detected_language TEXT DEFAULT 'auto', -- 'bn' | 'en' | 'banglish'
  intent_detected TEXT CHECK (intent_detected IN ('product_inquiry', 'order_status', 'general_faq', 'human_escalation')),
  ai_reply TEXT NOT NULL,
  provider_used TEXT DEFAULT 'gemini', -- 'gemini' | 'groq' | 'openrouter' | 'offline_dictionary'
  model_used TEXT DEFAULT 'gemini-3.8-flash',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns exist if table was created in earlier migration
ALTER TABLE ai_auto_replies ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'sandbox';
ALTER TABLE ai_auto_replies ADD COLUMN IF NOT EXISTS detected_language TEXT DEFAULT 'auto';
ALTER TABLE ai_auto_replies ADD COLUMN IF NOT EXISTS provider_used TEXT DEFAULT 'gemini';

-- RLS
ALTER TABLE ai_auto_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_ai_replies" ON ai_auto_replies;
CREATE POLICY "account_ai_replies" ON ai_auto_replies
  FOR ALL USING (is_account_member(account_id, 'viewer'));

CREATE INDEX IF NOT EXISTS idx_ai_auto_replies_account_channel ON ai_auto_replies(account_id, channel, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ai_auto_replies TO authenticated;
NOTIFY pgrst, 'reload schema';

