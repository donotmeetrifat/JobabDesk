-- Migration 064: Ensure authenticated and service_role have explicit table permissions
-- for message_reactions, matching migration 061.

GRANT ALL ON TABLE public.message_reactions TO authenticated, service_role;

-- Ensure RLS allows service_role and account members to insert/update/delete
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reactions_service_role" ON public.message_reactions;
CREATE POLICY "message_reactions_service_role" ON public.message_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
