-- Migration: 044_channel_connections
-- Generic channel connection tracker alongside existing whatsapp_config
-- Tracks which channels (WhatsApp, Messenger) are connected per account

CREATE TABLE IF NOT EXISTS channel_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'messenger')),
  external_account_id TEXT NOT NULL,  -- phone_number_id or FB page_id
  display_name TEXT,                  -- "My WhatsApp" or "UK Brand Lover Page"
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, channel_type, external_account_id)
);

-- RLS
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_read_channels" ON channel_connections;
CREATE POLICY "members_read_channels" ON channel_connections
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "admins_manage_channels" ON channel_connections;
CREATE POLICY "admins_manage_channels" ON channel_connections
  FOR ALL USING (is_account_member(account_id, 'admin'));

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_channel_connections_account ON channel_connections(account_id);
CREATE INDEX IF NOT EXISTS idx_channel_connections_external ON channel_connections(channel_type, external_account_id);

COMMENT ON TABLE channel_connections IS 
  'Tracks connected messaging channels (WhatsApp, Messenger) per workspace';
