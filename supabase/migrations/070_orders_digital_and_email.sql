-- Migration: 070_orders_digital_and_email.sql
-- Add customer_email and is_digital columns to orders table

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_digital BOOLEAN DEFAULT false;

COMMENT ON COLUMN orders.customer_email IS 'Customer email address, essential for digital products and accounts.';
COMMENT ON COLUMN orders.is_digital IS 'Whether the order is for a digital product / subscription or physical courier delivery.';
