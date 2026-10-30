-- PostgreSQL rejects regex repetition bounds over 255; keep the length
-- limit separate from the allowed-character pattern.
ALTER TABLE public.zouti_integrations
  DROP CONSTRAINT zouti_integrations_pix_template_name_check;

ALTER TABLE public.zouti_integrations
  ADD CONSTRAINT zouti_integrations_pix_template_name_check
  CHECK (pix_template_name IS NULL OR
    (length(pix_template_name) BETWEEN 1 AND 512 AND pix_template_name ~ '^[a-z0-9_]+$'));
