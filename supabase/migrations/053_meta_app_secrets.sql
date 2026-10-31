-- Credentials are only read/written by authenticated server routes using service role.
-- Do not grant table access to browser roles, even for account admins.
CREATE TABLE IF NOT EXISTS meta_app_secrets (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE meta_app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON meta_app_secrets FROM anon, authenticated;
