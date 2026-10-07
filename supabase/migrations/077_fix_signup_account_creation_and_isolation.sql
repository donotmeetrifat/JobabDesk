-- Migration 077: Fix user signup trigger and backfill isolated accounts
-- Ensures every new user gets their OWN account and never inherits another user's account

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

-- Backfill any existing profiles that have no account_id
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
    -- Check if account already exists for this owner
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
