-- Migration: 056_ai_business_setup
-- Add Business Setup & AI Knowledge Base fields to accounts

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_business_description TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_delivery_policy TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_return_policy TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_auto_reply_tone TEXT DEFAULT 'friendly_bangla';

NOTIFY pgrst, 'reload schema';
