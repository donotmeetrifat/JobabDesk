-- 050_accounts_sheets_url.sql
-- Add sheets_sync_url column to accounts table for storing Google Sheets URL for product sync.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sheets_sync_url TEXT;
