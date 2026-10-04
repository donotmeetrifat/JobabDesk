-- Migration: 069_broadcasts_ai_context
-- Adds ai_context column to broadcasts table for grounding AI auto-replies to broadcast responses

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcasts' 
    AND column_name = 'ai_context'
  ) THEN
    ALTER TABLE public.broadcasts ADD COLUMN ai_context TEXT;
  END IF;
END $$;
