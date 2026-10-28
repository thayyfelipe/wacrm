-- Read-only audit of authenticated Kiwify purchase events. Sending remains disabled.
CREATE UNIQUE INDEX IF NOT EXISTS kiwify_integrations_id_account_unique
  ON public.kiwify_integrations (id, account_id);

CREATE TABLE IF NOT EXISTS public.kiwify_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  account_id uuid NOT NULL,
  order_id text NOT NULL CHECK (length(order_id) BETWEEN 1 AND 200),
  order_ref text,
  product_id text NOT NULL,
  product_name text,
  event_type text NOT NULL CHECK (event_type IN ('pix_created', 'order_approved')),
  customer_name text,
  customer_phone text,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kiwify_event_integration_account_fk
    FOREIGN KEY (integration_id, account_id)
    REFERENCES public.kiwify_integrations (id, account_id) ON DELETE CASCADE,
  CONSTRAINT kiwify_order_event_unique
    UNIQUE (account_id, order_id, product_id, event_type)
);

CREATE INDEX IF NOT EXISTS kiwify_order_events_account_received_idx
  ON public.kiwify_order_events (account_id, received_at DESC);

ALTER TABLE public.kiwify_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiwify_order_events_select ON public.kiwify_order_events
  FOR SELECT TO authenticated
  USING ((select public.is_account_member(account_id, 'admin')));

REVOKE ALL ON public.kiwify_order_events FROM anon, authenticated;
GRANT SELECT ON public.kiwify_order_events TO authenticated;
GRANT SELECT, INSERT ON public.kiwify_order_events TO service_role;
