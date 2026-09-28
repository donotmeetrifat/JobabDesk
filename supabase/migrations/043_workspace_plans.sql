-- Migration: 043_workspace_plans
-- Adds subscription plans, trial tracking, and workspace limits to accounts

-- 1. Add plan enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_enum') THEN
    CREATE TYPE plan_enum AS ENUM ('free', 'starter', 'pro', 'agency');
  END IF;
END $$;

-- 2. Add billing status enum  
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_status_enum') THEN
    CREATE TYPE billing_status_enum AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'paused');
  END IF;
END $$;

-- 3. Extend accounts table with plan and billing columns
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan plan_enum NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_status billing_status_enum NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email TEXT,
  ADD COLUMN IF NOT EXISTS billing_phone TEXT,
  -- Workspace limits (enforced in app layer)
  ADD COLUMN IF NOT EXISTS max_team_members INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_contacts INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_channels INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_replies_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_replies_limit INT NOT NULL DEFAULT 100;

-- 4. Set limits per plan via a function
CREATE OR REPLACE FUNCTION apply_plan_limits()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.plan
    WHEN 'free' THEN
      NEW.max_team_members := 1;
      NEW.max_contacts := 500;
      NEW.max_channels := 1;
      NEW.ai_replies_limit := 100;
    WHEN 'starter' THEN
      NEW.max_team_members := 3;
      NEW.max_contacts := 5000;
      NEW.max_channels := 2;
      NEW.ai_replies_limit := 1000;
    WHEN 'pro' THEN
      NEW.max_team_members := 10;
      NEW.max_contacts := 25000;
      NEW.max_channels := 5;
      NEW.ai_replies_limit := 5000;
    WHEN 'agency' THEN
      NEW.max_team_members := 999;
      NEW.max_contacts := 999999;
      NEW.max_channels := 999;
      NEW.ai_replies_limit := 999999;
  END CASE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger: auto-apply limits when plan changes
DROP TRIGGER IF EXISTS trg_apply_plan_limits ON accounts;
CREATE TRIGGER trg_apply_plan_limits
  BEFORE INSERT OR UPDATE OF plan ON accounts
  FOR EACH ROW EXECUTE FUNCTION apply_plan_limits();

-- 6. Helper: is workspace on trial?
CREATE OR REPLACE FUNCTION is_on_trial(account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT billing_status = 'trialing' AND trial_ends_at > NOW()
  FROM accounts WHERE id = account_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 7. Helper: is trial expired?
CREATE OR REPLACE FUNCTION is_trial_expired(account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT billing_status = 'trialing' AND trial_ends_at <= NOW()
  FROM accounts WHERE id = account_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 8. Helper: get workspace plan
CREATE OR REPLACE FUNCTION get_account_plan(account_id UUID)
RETURNS TEXT AS $$
  SELECT plan::TEXT FROM accounts WHERE id = account_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 9. Grant RLS: members can read their own account plan
-- (RLS already enabled on accounts from migration 017)
-- Members can read but only owner can update billing
DROP POLICY IF EXISTS "members_read_plan" ON accounts;
CREATE POLICY "members_read_plan" ON accounts
  FOR SELECT USING (is_account_member(id, 'viewer'));

-- 10. Start 7-day trial for all new accounts automatically
CREATE OR REPLACE FUNCTION start_trial_on_account_create()
RETURNS TRIGGER AS $$
BEGIN
  NEW.billing_status := 'trialing';
  NEW.trial_started_at := NOW();
  NEW.trial_ends_at := NOW() + INTERVAL '7 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_start_trial ON accounts;
CREATE TRIGGER trg_start_trial
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION start_trial_on_account_create();

COMMENT ON COLUMN accounts.plan IS 'Subscription plan: free, starter, pro, agency';
COMMENT ON COLUMN accounts.billing_status IS 'Current billing state';
COMMENT ON COLUMN accounts.trial_ends_at IS '7-day trial expiry timestamp';
