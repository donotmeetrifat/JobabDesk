-- Migration: 055_per_contact_ai_mute
-- Add Per-Contact AI Auto-Reply Mute toggle and Account Store Instructions

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_auto_reply_muted BOOLEAN DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_store_instructions TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
