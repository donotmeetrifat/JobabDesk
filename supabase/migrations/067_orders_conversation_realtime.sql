-- Migration: 067_orders_conversation_realtime
-- Adds conversation_id column to orders table and includes orders in supabase_realtime publication

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'orders' 
    AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_conversation ON public.orders(conversation_id);
  END IF;
END $$;

-- Enable Realtime for orders and order_items
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
