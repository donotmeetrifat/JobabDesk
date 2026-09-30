-- Migration: 059_bulletproof_channel_connections
-- Bulletproof WhatsApp QR Scanner & Facebook Page Meta OAuth connection fields

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_connection_type TEXT DEFAULT 'qr_web';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_session_status TEXT DEFAULT 'disconnected'; -- 'disconnected' | 'connecting' | 'connected'
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_qr_code TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS whatsapp_connected_number TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS messenger_connection_status TEXT DEFAULT 'disconnected';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_id TEXT DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS facebook_page_name TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
