-- Migration: Add Whapi & Evolution Gateway Credentials to Accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whapi_api_key TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whapi_instance_id TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_gateway_provider TEXT DEFAULT 'whapi';

NOTIFY pgrst, 'reload schema';
