-- Migration 063: Grant products access and allow active products read for AI and customer catalog
GRANT ALL ON TABLE public.products TO authenticated, service_role, anon;

-- Ensure anyone can read active products (so AI bot and catalog always have access to store products)
DROP POLICY IF EXISTS "anyone_can_read_active_products" ON public.products;
CREATE POLICY "anyone_can_read_active_products" ON public.products
  FOR SELECT USING (is_active = true);

-- Allow agents/members to insert/update/delete products
DROP POLICY IF EXISTS "agents_manage_products" ON public.products;
CREATE POLICY "agents_manage_products" ON public.products
  FOR ALL USING (true)
  WITH CHECK (true);
