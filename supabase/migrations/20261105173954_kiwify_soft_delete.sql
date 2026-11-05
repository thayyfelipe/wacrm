-- Preserve sales and event history while hiding removed connections.
ALTER TABLE public.kiwify_integrations ADD COLUMN deleted_at timestamptz;
CREATE INDEX kiwify_integrations_visible_idx
  ON public.kiwify_integrations(account_id, created_at DESC)
  WHERE deleted_at IS NULL;
