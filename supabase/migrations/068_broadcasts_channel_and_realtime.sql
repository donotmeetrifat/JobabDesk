-- Migration: 068_broadcasts_channel_and_realtime
-- Ensures broadcasts and broadcast_recipients have full access, channel support, and realtime publications

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcasts' 
    AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.broadcasts ADD COLUMN channel TEXT DEFAULT 'all';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcasts' 
    AND column_name = 'message_text'
  ) THEN
    ALTER TABLE public.broadcasts ADD COLUMN message_text TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'broadcast_recipients' 
    AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.broadcast_recipients ADD COLUMN channel TEXT DEFAULT 'whatsapp';
  END IF;
END $$;

-- Enable Realtime for broadcasts and broadcast_recipients
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;

GRANT ALL ON TABLE public.broadcasts TO authenticated, service_role, anon;
GRANT ALL ON TABLE public.broadcast_recipients TO authenticated, service_role, anon;

-- Permissive RLS policies to prevent "Failed to load broadcasts" for logged in users
DO $$
BEGIN
  DROP POLICY IF EXISTS "broadcasts_select_all" ON public.broadcasts;
  DROP POLICY IF EXISTS "broadcasts_all_auth" ON public.broadcasts;
  DROP POLICY IF EXISTS "broadcast_recipients_all_auth" ON public.broadcast_recipients;
  
  CREATE POLICY "broadcasts_all_auth" ON public.broadcasts 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

  CREATE POLICY "broadcast_recipients_all_auth" ON public.broadcast_recipients 
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION
  WHEN others THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
