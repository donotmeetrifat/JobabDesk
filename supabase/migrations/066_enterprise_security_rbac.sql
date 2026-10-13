-- Migration: 066_enterprise_security_rbac
-- Enterprise Multi-User Security, RBAC & Tenant Isolation Hardening

-- 1. Ensure security audit log table exists
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL, -- e.g. 'member_invited', 'role_changed', 'api_key_rotated', 'payment_verified', 'courier_booked', 'settings_updated'
  resource_type TEXT NOT NULL, -- 'order', 'member', 'settings', 'payment', 'api_key'
  resource_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_account_created 
ON security_audit_logs(account_id, created_at DESC);

-- Enable RLS on audit logs
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can view account audit logs" ON security_audit_logs;
DROP POLICY IF EXISTS "account_audit_logs_select" ON security_audit_logs;

CREATE POLICY "account_audit_logs_select" ON security_audit_logs
  FOR SELECT USING (is_account_member(account_id, 'admin'));

-- Allow authenticated users to insert audit entries for their active account
DROP POLICY IF EXISTS "account_audit_logs_insert" ON security_audit_logs;
CREATE POLICY "account_audit_logs_insert" ON security_audit_logs
  FOR INSERT WITH CHECK (is_account_member(account_id, 'viewer'));

GRANT ALL ON TABLE security_audit_logs TO authenticated, service_role;

-- 2. Audit existing tables to ensure account_id is indexed for ultra-fast RLS verification
CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_account_id ON payment_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_customer_blacklists_account_id ON customer_blacklists(account_id);

NOTIFY pgrst, 'reload schema';
