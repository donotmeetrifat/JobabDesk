-- Migration: 064_courier_integrations
-- Phase 6A: Hybrid Courier & Delivery Tracking Engine (Manual First + Optional Steadfast & Pathao APIs)

-- 1. Add courier_settings to accounts table with safe defaults
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS courier_settings JSONB DEFAULT '{
  "default_provider": "manual",
  "steadfast": { "enabled": false, "api_key": "", "secret_key": "" },
  "pathao": { "enabled": false, "client_id": "", "client_secret": "", "username": "", "password": "", "store_id": "" }
}'::jsonb;

-- 2. Add delivery & courier tracking columns to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS courier_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tracking_code TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tracking_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS courier_consignment_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS courier_booking_status TEXT DEFAULT 'unbooked'; -- 'unbooked' | 'booked' | 'in_transit' | 'delivered' | 'returned'

-- 3. Create index for fast tracking lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON orders(account_id, tracking_code);
