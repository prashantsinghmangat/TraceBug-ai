-- ─────────────────────────────────────────────────────────────────────────────
-- TraceBug — session priority
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a tester-assigned priority to shared sessions so the share-portal header
-- can display it. Written by /api/upload/init (best-effort), read by
-- /share/[token]. Nullable — old rows and clients that don't send it are fine.
--
-- How to run: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS priority TEXT
  CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low'));

COMMENT ON COLUMN public.sessions.priority IS 'Tester-assigned triage priority (high/medium/low); shown in the share viewer header.';

-- Sanity check: should return 1 (column exists)
SELECT COUNT(*) AS priority_column_exists FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'priority';
