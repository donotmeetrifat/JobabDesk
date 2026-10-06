-- Migration: 073_broadcasts_cancelled_status.sql
-- Allow 'cancelled' and 'ended' in broadcasts.status check constraint so promotional campaigns can be turned off cleanly

DO $$
BEGIN
  ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
  ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check 
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled', 'ended'));
EXCEPTION
  WHEN others THEN
    NULL;
END $$;
