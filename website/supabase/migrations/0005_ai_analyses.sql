-- ─────────────────────────────────────────────────────────────────────────────
-- TraceBug — AI Root-Cause usage metering
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates: ai_analyses table + RLS. One row per successful /api/ai/diagnose
-- call. Used to enforce the per-user monthly free-tier cap and the per-minute
-- burst guard server-side, and to track token spend.
--
-- How to run: Supabase Dashboard → SQL Editor → paste this file → Run.
-- This migration is idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. ai_analyses table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model          TEXT         NOT NULL,
  input_tokens   INTEGER      NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens  INTEGER      NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_analyses IS 'One row per successful AI Root-Cause analysis; drives quota enforcement and token-spend tracking.';


-- ── 2. Index ──────────────────────────────────────────────────────────────────
-- Quota checks count rows by (user_id, created_at >= window start).

CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_created
  ON public.ai_analyses (user_id, created_at);


-- ── 3. Row Level Security ──────────────────────────────────────────────────────
-- A user may read and insert only their own rows. No update/delete: the table
-- is an append-only usage ledger. Server-side quota counts run under the user's
-- session, so they only ever see their own rows — which is exactly the scope we
-- meter against.

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_analyses_select_own" ON public.ai_analyses;
DROP POLICY IF EXISTS "ai_analyses_insert_own" ON public.ai_analyses;

CREATE POLICY "ai_analyses_select_own" ON public.ai_analyses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ai_analyses_insert_own" ON public.ai_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ── 4. Sanity check ────────────────────────────────────────────────────────────

-- Should return 1 (table exists)
SELECT COUNT(*) AS ai_analyses_table_exists FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'ai_analyses';

-- Should return 2 (2 RLS policies)
SELECT COUNT(*) AS ai_analyses_rls_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'ai_analyses';
