-- Migration 064: Ensure authenticated and service_role have explicit table permissions
-- and RLS policies for message_reactions, matching migration 061.

GRANT ALL ON TABLE public.message_reactions TO authenticated, service_role;

-- Ensure RLS allows service_role and authenticated users to select/insert/update/delete
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reactions_service_role" ON public.message_reactions;
CREATE POLICY "message_reactions_service_role" ON public.message_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "message_reactions_authenticated_select" ON public.message_reactions;
CREATE POLICY "message_reactions_authenticated_select" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "message_reactions_authenticated_all" ON public.message_reactions;
CREATE POLICY "message_reactions_authenticated_all" ON public.message_reactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Ensure Realtime publication includes message_reactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
