-- Migration: 065_anti_rto_fraud_shield
-- Phase 6B: Anti-RTO / Fake Order & Delivery Ratio Checker

-- 1. Add risk and delivery ratio columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low', -- 'low' | 'medium' | 'high' | 'blacklisted'
ADD COLUMN IF NOT EXISTS delivery_ratio NUMERIC DEFAULT NULL, -- percentage 0 to 100
ADD COLUMN IF NOT EXISTS risk_details JSONB DEFAULT '{
  "total_parcels": 0,
  "delivered_parcels": 0,
  "cancelled_parcels": 0,
  "source": "internal",
  "reasons": []
}'::jsonb;

-- 2. Create customer_blacklists table for store-specific blacklists
CREATE TABLE IF NOT EXISTS customer_blacklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  reason TEXT DEFAULT 'Chronic RTO / Fake Order',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for instant lookup by account and phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_account_phone 
ON customer_blacklists(account_id, phone_normalized);

-- Enable Row Level Security (RLS)
ALTER TABLE customer_blacklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account members can manage customer blacklists"
ON customer_blacklists FOR ALL
USING (
  account_id IN (
    SELECT account_id FROM account_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  account_id IN (
    SELECT account_id FROM account_members WHERE user_id = auth.uid()
  )
);
