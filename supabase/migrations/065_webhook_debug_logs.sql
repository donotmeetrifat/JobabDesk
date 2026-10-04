-- Migration 065: Webhook Debug Logs
-- Stores inbound webhook telemetry to diagnose delivery and reaction parsing

CREATE TABLE IF NOT EXISTS public.webhook_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  event_type TEXT,
  payload JSONB,
  target_mid TEXT,
  target_msg_id UUID,
  status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON TABLE public.webhook_debug_logs TO authenticated, service_role, anon;

ALTER TABLE public.webhook_debug_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_debug_logs_allow_all" ON public.webhook_debug_logs;
CREATE POLICY "webhook_debug_logs_allow_all" ON public.webhook_debug_logs
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_webhook_debug_logs_created
  ON public.webhook_debug_logs(created_at DESC);
