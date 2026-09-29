-- Grant table permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE products TO authenticated;
GRANT SELECT ON TABLE products TO anon;

-- Auto-grant on future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
  GRANT SELECT ON TABLES TO anon;

-- get_account_context RPC function
CREATE OR REPLACE FUNCTION get_account_context(p_user_id UUID)
RETURNS TABLE(
  account_id UUID,
  account_role TEXT,
  account_name TEXT,
  account_owner_id UUID
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT 
    p.account_id,
    p.account_role::TEXT,
    a.name,
    a.owner_user_id
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = p_user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_account_context(UUID) TO authenticated;
