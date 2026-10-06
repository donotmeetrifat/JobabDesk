-- Migration: 076_add_playground_chat_history
-- Store playground test chat messages per account in database

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS playground_chat_history JSONB DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
