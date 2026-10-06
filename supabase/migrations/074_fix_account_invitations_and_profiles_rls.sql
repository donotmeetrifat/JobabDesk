-- Migration 074: Fix account_invitations permissions and profiles RLS

-- 1. Ensure table grants exist on account_invitations
GRANT ALL ON TABLE public.account_invitations TO authenticated, service_role;

-- 2. Fix profiles RLS policies:
-- Migration 046 incorrectly set `id = auth.uid()` instead of `user_id = auth.uid()`.
-- In the profiles table, `user_id` references auth.users(id), while `id` is a random UUID.
DO $$ BEGIN
  DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
END $$;

CREATE POLICY "users_read_own_profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid() OR id = auth.uid());

CREATE POLICY "users_update_own_profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid() OR id = auth.uid())
WITH CHECK (user_id = auth.uid() OR id = auth.uid());

CREATE POLICY "users_insert_own_profile"
ON public.profiles FOR INSERT
WITH CHECK (user_id = auth.uid() OR id = auth.uid());

-- 3. Ensure is_account_member function checks both user_id and id correctly
CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
          END
  );
$$;

ALTER FUNCTION public.is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- 4. Re-assert account_invitations RLS policies
DROP POLICY IF EXISTS account_invitations_select ON public.account_invitations;
DROP POLICY IF EXISTS account_invitations_modify ON public.account_invitations;

CREATE POLICY account_invitations_select ON public.account_invitations FOR SELECT
  USING (is_account_member(account_id, 'admin'));

CREATE POLICY account_invitations_modify ON public.account_invitations FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));
