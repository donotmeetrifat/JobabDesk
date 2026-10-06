-- Migration: 075_add_simulated_persona_preview
-- Allow stores to save custom simulated persona preview / greeting text

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS simulated_persona_preview TEXT DEFAULT '';

NOTIFY pgrst, 'reload schema';
