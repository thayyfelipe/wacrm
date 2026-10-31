-- Carrinho abandonado é configurado separadamente do Pix, por conta/conexão.
ALTER TABLE public.zouti_integrations
  ADD COLUMN abandoned_automation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN abandoned_template_name TEXT
    CHECK (abandoned_template_name IS NULL OR
      (length(abandoned_template_name) BETWEEN 1 AND 512 AND abandoned_template_name ~ '^[a-z0-9_]+$'));

ALTER TABLE public.zouti_events
  ADD COLUMN abandoned_cart_url TEXT,
  ADD COLUMN abandoned_send_status TEXT
    CHECK (abandoned_send_status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  ADD COLUMN abandoned_send_at TIMESTAMPTZ,
  ADD COLUMN abandoned_message_id TEXT,
  ADD COLUMN abandoned_send_error TEXT;

CREATE INDEX zouti_events_abandoned_pending_idx ON public.zouti_events(id)
  WHERE abandoned_send_status = 'pending';
