-- Attribution belongs to the inbound message that carried the Meta referral.
-- Existing account-scoped conversation/message policies continue to protect it.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS referral_source_id text,
  ADD COLUMN IF NOT EXISTS referral_source_type text,
  ADD COLUMN IF NOT EXISTS referral_source_url text,
  ADD COLUMN IF NOT EXISTS referral_ctwa_clid text;

CREATE INDEX IF NOT EXISTS idx_messages_referral_source_id
  ON public.messages (referral_source_id)
  WHERE referral_source_id IS NOT NULL;
