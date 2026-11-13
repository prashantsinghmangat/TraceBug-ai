-- Double opt-in + one-click unsubscribe for email_signups
-- (docs/launch/email-capture-plan.md). Nobody is emailed unless a row for their
-- address is confirmed AND no later unsubscribe exists — see email_subscribers.
--
-- email_signups keeps one row per signup (several per address is normal: the
-- source tells us which surface converted). Status is per address:
--   subscribed  = max(confirmed_at) is set and later than max(unsubscribed_at)
--   unsubscribe = sets unsubscribed_at on every row for that address
-- so signing up again and confirming after an unsubscribe works, and an old
-- confirm link can't undo an unsubscribe (confirmed_at is set only once per row).
--
-- Tokens: 64 hex chars from two v4 UUIDs (~244 random bits), filled by the
-- database so every insert gets them. The volatile default gives each existing
-- row its own value (Postgres rewrites the table once for this).

ALTER TABLE public.email_signups
  ADD COLUMN IF NOT EXISTS confirm_token     TEXT NOT NULL
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS confirm_sent_at   TIMESTAMPTZ,   -- when the confirm email went out (rate limits, backlog)
  ADD COLUMN IF NOT EXISTS confirmed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT NOT NULL
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ADD COLUMN IF NOT EXISTS unsubscribed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_issue        TEXT;          -- last monthly update sent, e.g. '2026-12' (resumable sends)

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signups_confirm_token     ON public.email_signups (confirm_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signups_unsubscribe_token ON public.email_signups (unsubscribe_token);

-- The only list anything may email. One row per subscribed address; the
-- unsubscribe token is the one from the most recently confirmed row.
-- security_invoker: the view obeys email_signups' RLS (no anon policies), so
-- only the service role (API routes, scripts/email.mjs) can read it.
CREATE OR REPLACE VIEW public.email_subscribers WITH (security_invoker = true) AS
SELECT
  s.email,
  max(s.confirmed_at)    AS confirmed_at,
  max(s.unsubscribed_at) AS unsubscribed_at,
  (array_agg(s.unsubscribe_token ORDER BY s.confirmed_at DESC NULLS LAST))[1] AS unsubscribe_token,
  max(s.last_issue)      AS last_issue
FROM public.email_signups s
GROUP BY s.email
HAVING max(s.confirmed_at) IS NOT NULL
   AND (max(s.unsubscribed_at) IS NULL OR max(s.unsubscribed_at) < max(s.confirmed_at));

REVOKE ALL ON public.email_subscribers FROM anon, authenticated;
