-- Authenticated Kiwify checkout events, stored without customer data or raw payload.
CREATE TABLE kiwify_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kiwify_integrations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  order_id TEXT,
  product_id TEXT,
  product_name TEXT,
  order_status TEXT,
  product_matched BOOLEAN NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, payload_hash)
);
CREATE INDEX kiwify_events_account_received_idx ON kiwify_events(account_id, received_at DESC);
ALTER TABLE kiwify_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiwify_events_select ON kiwify_events FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION kiwify_event_account_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kiwify_integrations i
    WHERE i.id = NEW.integration_id AND i.account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'Kiwify integration/account mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kiwify_event_account_guard_trigger
  BEFORE INSERT OR UPDATE ON kiwify_events
  FOR EACH ROW EXECUTE FUNCTION kiwify_event_account_guard();
