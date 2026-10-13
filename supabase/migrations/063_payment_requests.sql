-- Migration: 063_payment_requests.sql
-- Free payment link, TrxID verification, and merchant payment settings

-- 1. Add payment_settings JSONB column to accounts table
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS payment_settings JSONB DEFAULT '{"bkash": {"number": "", "type": "personal"}, "nagad": {"number": "", "type": "personal"}, "rocket": {"number": "", "type": "personal"}, "bank": {"details": ""}, "allow_cod_advance": true, "cod_advance_amount": 150}'::jsonb;

-- 2. Update orders payment_status check constraint to support 'payment_submitted'
DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check 
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'payment_submitted'));
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- 3. Create payment_requests table
CREATE TABLE IF NOT EXISTS payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bkash', 'nagad', 'rocket', 'bank')),
  payment_type TEXT DEFAULT 'full' CHECK (payment_type IN ('full', 'delivery_advance')),
  sender_number TEXT NOT NULL,
  trx_id TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'rejected')),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Anti-Fraud & Anti-Duplicate Index (case-insensitive & whitespace trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_trx_id 
  ON payment_requests(account_id, UPPER(TRIM(trx_id))) 
  WHERE status IN ('submitted', 'verified');

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_payment_requests_order ON payment_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_account_status ON payment_requests(account_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_created ON payment_requests(account_id, created_at DESC);

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS trg_payment_requests_updated_at ON payment_requests;
CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON payment_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Row-Level Security
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_payment_requests" ON payment_requests;
CREATE POLICY "public_read_payment_requests" ON payment_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_insert_payment_requests" ON payment_requests;
CREATE POLICY "public_insert_payment_requests" ON payment_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "account_payment_requests" ON payment_requests;
CREATE POLICY "account_payment_requests" ON payment_requests
  FOR ALL USING (is_account_member(account_id, 'viewer'));

-- 8. Grants
GRANT SELECT, INSERT ON TABLE payment_requests TO anon;
GRANT ALL ON TABLE payment_requests TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
