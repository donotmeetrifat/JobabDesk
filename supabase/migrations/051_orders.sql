-- Migration: 051_orders
-- Order management tables, triggers, and RLS policies

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL DEFAULT '', -- auto-generated: ORD-2026-0001
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','confirmed','processing','shipped','delivered','cancelled')),

  payment_method TEXT DEFAULT 'cod'
    CHECK (payment_method IN ('cod','bkash','rocket','nagad','bank_transfer')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid')),
  payment_reference TEXT, -- bKash trxID etc.

  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,

  notes TEXT,
  source TEXT DEFAULT 'manual', -- 'manual' | 'whatsapp'

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  unit_price NUMERIC(12,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total NUMERIC(12,2) NOT NULL
);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_orders" ON orders
  FOR ALL USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "account_order_items" ON order_items
  FOR ALL USING (order_id IN (SELECT id FROM orders WHERE is_account_member(account_id, 'viewer')));

-- Auto order number trigger
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  yr TEXT := to_char(now(), 'YYYY');
  seq INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO seq FROM orders
  WHERE account_id = NEW.account_id
  AND to_char(created_at, 'YYYY') = yr;
  NEW.order_number := 'ORD-' || yr || '-' || lpad(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for performance
CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_status ON orders(account_id, status);
CREATE INDEX idx_orders_created ON orders(account_id, created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_items TO authenticated;

NOTIFY pgrst, 'reload schema';
