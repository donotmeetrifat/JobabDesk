-- Migration: 045_products
-- Product catalogue per workspace

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  brand TEXT,
  category TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  stock_qty INT NOT NULL DEFAULT 0,
  is_in_stock BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  ai_description TEXT,
  keywords TEXT[] DEFAULT '{}',
  images JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  import_source TEXT CHECK (import_source IN ('manual','excel','csv','google_sheets')),
  sheets_row_index INT,
  sheets_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_products" ON products
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "agents_manage_products" ON products
  FOR ALL USING (is_account_member(account_id, 'agent'));

CREATE INDEX idx_products_account ON products(account_id);
CREATE INDEX idx_products_active ON products(account_id, is_active);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

COMMENT ON TABLE products IS
  'Product catalogue per workspace. Used by AI to answer availability questions.';
