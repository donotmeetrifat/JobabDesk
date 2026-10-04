-- Migration: 071_orders_payment_method_free.sql
-- Allow 'free' in orders.payment_method check constraint for promotional giveaways and ৳0 orders

DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
    CHECK (payment_method IN ('cod', 'bkash', 'rocket', 'nagad', 'bank_transfer', 'free'));
EXCEPTION
  WHEN others THEN
    NULL;
END $$;
