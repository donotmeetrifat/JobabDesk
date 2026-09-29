-- Migration: 046_fix_profiles_rls
-- Fix: Add explicit user-scoped RLS policies on profiles table

DO $$ BEGIN
  DROP POLICY IF EXISTS "users_read_own_profile" ON profiles;
  DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
  DROP POLICY IF EXISTS "users_insert_own_profile" ON profiles;
END $$;

CREATE POLICY "users_read_own_profile"
ON profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "users_update_own_profile"
ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "users_insert_own_profile"
ON profiles FOR INSERT
WITH CHECK (id = auth.uid());
