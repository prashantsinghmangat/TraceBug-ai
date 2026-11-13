-- Rate limits for the Site Audit sign-in code email (ADR 009,
-- app/api/ext/otp/start). The in-memory per-IP limit only covers one warm
-- serverless instance, so the limits that protect the sender reputation and the
-- shared Resend quota live here instead:
--   per address: at most 3 codes per hour
--   global:      at most OTP_DAILY_CAP codes per 24 h (default 50) — over it the
--                route answers 503 and the extension fails open (audits keep
--                working), so a flood can't lock real users out or burn the quota.
--
-- Only a SHA-256 of the lowercased address is stored, and rows older than two
-- days are deleted by the route itself. Server-only: RLS on, no policies, no grants.

CREATE TABLE IF NOT EXISTS public.otp_send_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_otp_send_log_email_time ON public.otp_send_log (email_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_otp_send_log_time       ON public.otp_send_log (created_at);

ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_send_log FROM anon, authenticated;
