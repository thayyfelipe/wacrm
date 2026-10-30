-- One signed Zouti webhook per ElooFlow account/integration. The webhook
-- secret lives in a separate table with no authenticated-user policies.
CREATE TABLE zouti_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  product_id TEXT CHECK (product_id IS NULL OR length(product_id) BETWEEN 1 AND 100),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zouti_integrations_account_idx ON zouti_integrations(account_id);
ALTER TABLE zouti_integrations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON zouti_integrations TO authenticated;
GRANT SELECT ON zouti_integrations TO service_role;
CREATE POLICY zouti_integrations_select ON zouti_integrations FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY zouti_integrations_insert ON zouti_integrations FOR INSERT TO authenticated
  WITH CHECK (is_account_member(account_id, 'admin') AND created_by = (select auth.uid()));
CREATE POLICY zouti_integrations_update ON zouti_integrations FOR UPDATE TO authenticated
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE TABLE zouti_integration_secrets (
  integration_id UUID PRIMARY KEY REFERENCES zouti_integrations(id) ON DELETE CASCADE,
  secret_encrypted TEXT NOT NULL,
  previous_secret_encrypted TEXT,
  previous_secret_valid_until TIMESTAMPTZ
);
ALTER TABLE zouti_integration_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zouti_integration_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON zouti_integration_secrets TO service_role;
-- Only the service role may read/write the encrypted secret.

CREATE TABLE zouti_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES zouti_integrations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  object_name TEXT NOT NULL,
  delivery_id TEXT,
  product_id TEXT,
  product_name TEXT,
  product_matched BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, event_id)
);
CREATE INDEX zouti_events_account_received_idx ON zouti_events(account_id, received_at DESC);
ALTER TABLE zouti_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON zouti_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON zouti_events TO service_role;
CREATE POLICY zouti_events_select ON zouti_events FOR SELECT TO authenticated
  USING (is_account_member(account_id, 'admin'));
-- Webhook writes use the service role. Prevent tenant mismatch even there.
CREATE FUNCTION zouti_event_account_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM zouti_integrations i
                 WHERE i.id = NEW.integration_id AND i.account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'Zouti integration/account mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zouti_event_account_guard_trigger BEFORE INSERT OR UPDATE ON zouti_events
  FOR EACH ROW EXECUTE FUNCTION zouti_event_account_guard();
