-- Pix messages are opt-in per connection. Existing events never become eligible.
ALTER TABLE zouti_integrations ADD COLUMN pix_automation_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE zouti_integrations ADD COLUMN pix_template_name TEXT
  CHECK (pix_template_name IS NULL OR pix_template_name ~ '^[a-z0-9_]{1,512}$');

ALTER TABLE zouti_events ADD COLUMN pix_send_status TEXT
  CHECK (pix_send_status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));
ALTER TABLE zouti_events ADD COLUMN pix_send_at TIMESTAMPTZ;
ALTER TABLE zouti_events ADD COLUMN pix_message_id TEXT;
ALTER TABLE zouti_events ADD COLUMN pix_send_error TEXT;

-- An authenticated admin can read outcomes, but cannot claim or alter them.
REVOKE UPDATE ON zouti_events FROM authenticated;
CREATE INDEX zouti_events_pix_pending_idx ON zouti_events(id) WHERE pix_send_status = 'pending';
