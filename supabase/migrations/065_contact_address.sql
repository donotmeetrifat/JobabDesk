-- Migration 065: Add address and messenger_id to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS messenger_id TEXT;

-- If contact has a Facebook PSID currently stored in phone, copy to messenger_id
UPDATE public.contacts
SET messenger_id = phone
WHERE messenger_id IS NULL
  AND phone IS NOT NULL
  AND NOT phone LIKE '+%'
  AND LENGTH(phone) >= 15
  AND phone ~ '^\d+$';
