-- Migration 078: Multi-Workspace & Store Switcher
-- Allows a single business owner to manage multiple store workspaces under one login.

-- 1. Relax the 1-account-per-owner constraint so an owner can create multiple stores
DROP INDEX IF EXISTS idx_accounts_one_per_owner;

-- 2. Create index on accounts(owner_user_id) for fast multi-workspace lookups
CREATE INDEX IF NOT EXISTS idx_accounts_owner_user_id ON public.accounts(owner_user_id);

-- 3. Create account_members table for many-to-many store memberships (if not already existing)
CREATE TABLE IF NOT EXISTS public.account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role account_role_enum NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_members_user_id ON public.account_members(user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_account_id ON public.account_members(account_id);

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.account_members TO authenticated, service_role;

DROP POLICY IF EXISTS "members_read_own" ON public.account_members;
CREATE POLICY "members_read_own"
ON public.account_members FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Ensure account_members has owner records for all existing accounts
INSERT INTO public.account_members (account_id, user_id, role)
SELECT id, owner_user_id, 'owner'::account_role_enum
FROM public.accounts
WHERE owner_user_id IS NOT NULL
ON CONFLICT (account_id, user_id) DO UPDATE SET role = 'owner';

-- 5. RPC: switch_active_workspace(p_target_account_id)
-- Validates membership and atomically updates caller's profile context
CREATE OR REPLACE FUNCTION public.switch_active_workspace(
  p_target_account_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role account_role_enum;
  v_account_name TEXT;
  v_logo_url TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Verify caller is an active member or owner of the target workspace
  SELECT role INTO v_role
  FROM public.account_members
  WHERE account_id = p_target_account_id AND user_id = v_user_id;

  -- Fallback check: is caller the direct owner in accounts table?
  IF v_role IS NULL THEN
    SELECT 'owner'::account_role_enum INTO v_role
    FROM public.accounts
    WHERE id = p_target_account_id AND owner_user_id = v_user_id;
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Forbidden: You are not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  -- Fetch store name & logo
  SELECT name, logo_url INTO v_account_name, v_logo_url
  FROM public.accounts
  WHERE id = p_target_account_id;

  -- Atomically update active workspace in caller's profile
  UPDATE public.profiles
  SET account_id = p_target_account_id,
      account_role = v_role
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'account_id', p_target_account_id,
    'account_name', v_account_name,
    'account_role', v_role,
    'logo_url', v_logo_url
  );
END;
$$;

-- 6. RPC: create_new_workspace(p_store_name, p_business_tagline)
-- Creates new store workspace, adds caller as owner, and switches to it
CREATE OR REPLACE FUNCTION public.create_new_workspace(
  p_store_name TEXT,
  p_business_tagline TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_new_account_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF TRIM(p_store_name) IS NULL OR LENGTH(TRIM(p_store_name)) < 2 THEN
    RAISE EXCEPTION 'Store name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;

  -- Insert new account
  INSERT INTO public.accounts (name, business_tagline, owner_user_id)
  VALUES (TRIM(p_store_name), p_business_tagline, v_user_id)
  RETURNING id INTO v_new_account_id;

  -- Insert membership as owner
  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (v_new_account_id, v_user_id, 'owner');

  -- Update active profile
  UPDATE public.profiles
  SET account_id = v_new_account_id,
      account_role = 'owner'
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'account_id', v_new_account_id,
    'account_name', TRIM(p_store_name),
    'account_role', 'owner'
  );
END;
$$;

-- 7. RPC: get_user_workspaces()
-- Returns all workspaces the caller owns or belongs to
CREATE OR REPLACE FUNCTION public.get_user_workspaces()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  business_tagline TEXT,
  logo_url TEXT,
  role account_role_enum,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_account_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.account_id INTO v_active_account_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id;

  RETURN QUERY
  WITH user_accounts AS (
    SELECT
      a.id AS a_id,
      a.name AS a_name,
      a.business_tagline AS a_tagline,
      a.logo_url AS a_logo,
      'owner'::account_role_enum AS a_role,
      a.created_at AS a_created_at
    FROM public.accounts a
    WHERE a.owner_user_id = v_user_id

    UNION

    SELECT
      a.id AS a_id,
      a.name AS a_name,
      a.business_tagline AS a_tagline,
      a.logo_url AS a_logo,
      m.role AS a_role,
      a.created_at AS a_created_at
    FROM public.account_members m
    JOIN public.accounts a ON a.id = m.account_id
    WHERE m.user_id = v_user_id
  )
  SELECT DISTINCT ON (ua.a_id)
    ua.a_id AS account_id,
    ua.a_name AS account_name,
    ua.a_tagline AS business_tagline,
    ua.a_logo AS logo_url,
    ua.a_role AS role,
    (ua.a_id = v_active_account_id) AS is_active,
    ua.a_created_at AS created_at
  FROM user_accounts ua
  ORDER BY ua.a_id, (ua.a_id = v_active_account_id) DESC, ua.a_created_at ASC;
END;
$$;

NOTIFY pgrst, 'reload schema';
