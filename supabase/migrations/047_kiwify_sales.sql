-- Kiwify sales belong to the ElooFlow account that owns the webhook URL.
-- Secrets are in a separate, service-role-only table; never expose them via RLS.
CREATE TABLE IF NOT EXISTS kiwify_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  product_id TEXT NOT NULL CHECK (length(product_id) BETWEEN 1 AND 100),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kiwify_integrations_account_idx ON kiwify_integrations(account_id);
ALTER TABLE kiwify_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiwify_integrations_select ON kiwify_integrations FOR SELECT
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY kiwify_integrations_insert ON kiwify_integrations FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin') AND created_by = auth.uid());
CREATE POLICY kiwify_integrations_update ON kiwify_integrations FOR UPDATE
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS kiwify_integration_secrets (
  integration_id UUID PRIMARY KEY REFERENCES kiwify_integrations(id) ON DELETE CASCADE,
  token_encrypted TEXT NOT NULL
);
ALTER TABLE kiwify_integration_secrets ENABLE ROW LEVEL SECURITY;
-- No authenticated-user policy: only the service role may read or write secrets.

CREATE TABLE IF NOT EXISTS kiwify_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES kiwify_integrations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  order_ref TEXT,
  product_id TEXT NOT NULL,
  product_name TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  amount_cents BIGINT,
  currency TEXT,
  subscription_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, order_id)
);
CREATE INDEX IF NOT EXISTS kiwify_sales_account_received_idx
  ON kiwify_sales(account_id, received_at DESC);
ALTER TABLE kiwify_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY kiwify_sales_select ON kiwify_sales FOR SELECT
  USING (is_account_member(account_id));
-- Writes are only performed by the authenticated server-side webhook.

-- A fixed integration/account pair prevents a service-role insert from
-- accidentally stamping a sale into a different tenant.
CREATE OR REPLACE FUNCTION kiwify_sale_account_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM kiwify_integrations i
    WHERE i.id = NEW.integration_id AND i.account_id = NEW.account_id
  ) THEN
    RAISE EXCEPTION 'Kiwify integration/account mismatch';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER kiwify_sale_account_guard_trigger
  BEFORE INSERT OR UPDATE ON kiwify_sales
  FOR EACH ROW EXECUTE FUNCTION kiwify_sale_account_guard();
