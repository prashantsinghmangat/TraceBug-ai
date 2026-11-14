-- Two hardening steps from docs/audit/website-complete-security-ux-audit.md.
--
-- 1. Wrong-code lockout for the Site Audit sign-in (app/api/ext/otp/verify).
--    Every Supabase Auth call comes from Netlify's IPs, so Supabase's own per-IP
--    verify limit is shared by all users. This per-address log lets the route
--    refuse after 5 wrong codes in an hour. SHA-256 of the lowercased address only;
--    rows are cleared on success and pruned after two days by the route.
--    Until this runs, the route allows every attempt (fails open) and logs it.
--
-- 2. Park the cloud-sharing tables (feature parked, routes 404 — lib/flags.ts).
--    Any Supabase user can talk to PostgREST/Storage directly with the public anon
--    key, so the old "own rows" insert/update policies still let them write rows
--    and upload objects. Drop the write policies; read/delete-own stay so nothing
--    a user already has becomes inaccessible. To un-park: re-run the policy
--    sections of 0001 and 0005 (and move writes server-side, audit SEC-04).

CREATE TABLE IF NOT EXISTS public.otp_fail_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_fail_log_email_time ON public.otp_fail_log (email_hash, created_at);
ALTER TABLE public.otp_fail_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_fail_log FROM anon, authenticated;

-- DROP POLICY IF EXISTS still fails when the table is missing (production never ran
-- 0005, so there is no ai_analyses there): skip tables that don't exist.
DO $$
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "sessions_insert_own" ON public.sessions;
    DROP POLICY IF EXISTS "sessions_update_own" ON public.sessions;
  END IF;
  IF to_regclass('public.ai_analyses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ai_analyses_insert_own" ON public.ai_analyses;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "reports_insert_own" ON storage.objects;
  END IF;
END $$;
