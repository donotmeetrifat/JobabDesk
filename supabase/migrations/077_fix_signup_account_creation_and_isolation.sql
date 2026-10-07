-- Migration 077: Fix user signup trigger, profiles RLS, and backfill isolated accounts
-- Ensures every user gets their OWN account, their own profile, and has full RLS access to their profile.

-- 1. Ensure table grants
GRANT ALL ON TABLE public.profiles TO authenticated, service_role;
GRANT ALL ON TABLE public.accounts TO authenticated, service_role;

-- 2. Fix profiles RLS policies:
-- Migration 046 incorrectly set `id = auth.uid()`, blocking reads because `user_id` is the auth UID.
-- We ensure users can select, update, and insert where `user_id = auth.uid() OR id = auth.uid()`.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "users_insert_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
END $$;

CREATE POLICY "users_read_own_profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR id = auth.uid());

CREATE POLICY "users_update_own_profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR id = auth.uid())
WITH CHECK (user_id = auth.uid() OR id = auth.uid());

CREATE POLICY "users_insert_own_profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR id = auth.uid());

-- 3. Signup Trigger: create account + profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'My Store');

  -- Create fresh isolated account owned strictly by this user
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (v_full_name, NEW.id)
  RETURNING id INTO v_account_id;

  -- Create profile linked to their own account with role 'owner'
  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, beta_features)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner', '{}')
  ON CONFLICT (user_id) DO UPDATE SET
    account_id = v_account_id,
    account_role = 'owner';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Backfill any auth.users that have NO row in public.profiles at all
DO $$
DECLARE
  u RECORD;
  new_acct_id UUID;
BEGIN
  FOR u IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    WHERE id NOT IN (SELECT user_id FROM public.profiles WHERE user_id IS NOT NULL)
  LOOP
    SELECT id INTO new_acct_id FROM public.accounts WHERE owner_user_id = u.id LIMIT 1;
    IF new_acct_id IS NULL THEN
      INSERT INTO public.accounts (name, owner_user_id)
      VALUES (COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'My Store'), u.id)
      RETURNING id INTO new_acct_id;
    END IF;

    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role, beta_features)
    VALUES (
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'My Store'),
      u.email,
      new_acct_id,
      'owner',
      '{}'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      account_id = new_acct_id,
      account_role = 'owner';
  END LOOP;
END $$;

-- 5. Backfill any existing profiles that have no account_id
DO $$
DECLARE
  r RECORD;
  new_acc_id UUID;
BEGIN
  FOR r IN
    SELECT p.user_id, p.full_name, p.email
    FROM public.profiles p
    WHERE p.account_id IS NULL
  LOOP
    SELECT id INTO new_acc_id FROM public.accounts WHERE owner_user_id = r.user_id LIMIT 1;
    IF new_acc_id IS NULL THEN
      INSERT INTO public.accounts (name, owner_user_id)
      VALUES (COALESCE(r.full_name, split_part(r.email, '@', 1), 'My Store'), r.user_id)
      RETURNING id INTO new_acc_id;
    END IF;

    UPDATE public.profiles
    SET account_id = new_acc_id,
        account_role = 'owner'
    WHERE user_id = r.user_id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
