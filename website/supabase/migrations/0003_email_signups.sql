-- Captures emails from the "Notify me when Pro launches" form on /pricing
-- and the "Get your own TraceBug" capture on /share/[token] viewer pages.
-- Reviewed manually in Supabase Table Editor; no app UI consumes this table.

CREATE TABLE IF NOT EXISTS public.email_signups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  source        TEXT NOT NULL,                -- e.g. 'pricing-pro', 'viewer-footer'
  tier_interest TEXT,                          -- e.g. 'pro', 'team', 'enterprise'
  user_agent    TEXT,
  referrer      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_signups_created ON public.email_signups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_signups_email   ON public.email_signups (email);

-- RLS is enabled but no policies exist for the anon role — inserts go through
-- the /api/notify-me endpoint which uses the service-role client server-side.
ALTER TABLE public.email_signups ENABLE ROW LEVEL SECURITY;
