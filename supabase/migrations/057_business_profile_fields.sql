-- Migration: 057_business_profile_fields
-- Add structured Business Profile & AI Grounding fields to accounts

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS delivery_policy TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS return_policy TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS special_instructions TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_persona TEXT DEFAULT 'friendly_bangla';

NOTIFY pgrst, 'reload schema';
