-- Migration 072: Add profile_url and channel to contacts table for Messenger marketing & export
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS profile_url TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'all';

-- Allow phone to be nullable or empty string for Messenger-only contacts
ALTER TABLE public.contacts
  ALTER COLUMN phone DROP NOT NULL;

ALTER TABLE public.contacts
  ALTER COLUMN phone SET DEFAULT '';

-- Index for searching and deduplication by profile_url and messenger_id
CREATE INDEX IF NOT EXISTS idx_contacts_account_profile_url
  ON public.contacts (account_id, profile_url)
  WHERE profile_url IS NOT NULL AND profile_url <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_account_messenger_id
  ON public.contacts (account_id, messenger_id)
  WHERE messenger_id IS NOT NULL AND messenger_id <> '';
