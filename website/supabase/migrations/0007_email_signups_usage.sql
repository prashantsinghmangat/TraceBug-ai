-- Opt-in usage snapshot sent with an extension email signup
-- (docs/launch/email-capture-plan.md): {"audit": n, "ticket": n, "export": n},
-- only when the user ticks "Also send my usage counts". NULL otherwise.
ALTER TABLE public.email_signups ADD COLUMN IF NOT EXISTS usage JSONB;
