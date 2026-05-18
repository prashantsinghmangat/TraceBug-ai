-- ─────────────────────────────────────────────────────────────────────────────
-- TraceBug Cloud Sharing — Initial migration
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates: sessions table, RLS policies, Storage RLS policies, pg_cron expiry job.
--
-- How to run:
--   Option 1 (recommended): Supabase Dashboard → SQL Editor → New Query →
--   paste this entire file → Run.
--
--   Option 2: via psql with the connection string from
--   Settings → Database → Connection string (URI):
--     psql "postgresql://postgres.<ref>:<password>@..." -f 0001_initial.sql
--
-- Before running:
--   1. Confirm Storage bucket `reports` exists (Storage → Buckets):
--        Public: OFF, File size limit: 50 MB, MIME types: text/html
--   2. Enable pg_cron in Database → Extensions (search "pg_cron", toggle on).
--      If you skip this, the expiry job will be silently skipped; everything
--      else works fine. You can enable it later and re-run this file.
--
-- This migration is idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Sessions table ────────────────────────────────────────────────────────
-- One row per shared report. Hard caps are encoded as CHECK constraints so the
-- DB rejects bad data even if the API layer has a bug.

CREATE TABLE IF NOT EXISTS public.sessions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token       TEXT         NOT NULL UNIQUE,
  title             TEXT,
  storage_key       TEXT         NOT NULL,
  size_bytes        BIGINT       NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),  -- 50 MB
  has_video         BOOLEAN      NOT NULL DEFAULT FALSE,
  video_duration_s  INTEGER      CHECK (video_duration_s IS NULL OR (video_duration_s > 0 AND video_duration_s <= 120)),
  screenshot_count  INTEGER      NOT NULL DEFAULT 0 CHECK (screenshot_count >= 0 AND screenshot_count <= 5),
  visibility        TEXT         NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  uploaded          BOOLEAN      NOT NULL DEFAULT FALSE,  -- flipped true by /api/upload/complete
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  extended_count    INTEGER      NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE  public.sessions IS 'Cloud-shared bug reports (HTML blob in Supabase Storage, metadata here).';
COMMENT ON COLUMN public.sessions.storage_key IS 'Path inside `reports` bucket: <user_id>/<session_id>.html';
COMMENT ON COLUMN public.sessions.share_token IS 'Random unguessable slug for the public viewer URL.';
COMMENT ON COLUMN public.sessions.uploaded IS 'False until /api/upload/complete is called; lets us GC orphaned init rows.';


-- ── 2. Indexes ───────────────────────────────────────────────────────────────
-- Each index is filtered to (deleted_at IS NULL) because we soft-delete and
-- 100% of reads only care about live rows.

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON public.sessions (user_id, has_video)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_share_token
  ON public.sessions (share_token)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON public.sessions (expires_at)
  WHERE deleted_at IS NULL;


-- ── 3. Row Level Security on sessions ────────────────────────────────────────
-- Authenticated users see only their own rows. Anonymous viewers never touch
-- this table directly — they go through /api/share/[token] which uses the
-- service role to fetch a single row by share_token.

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own"   ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert_own"   ON public.sessions;
DROP POLICY IF EXISTS "sessions_update_own"   ON public.sessions;
DROP POLICY IF EXISTS "sessions_delete_own"   ON public.sessions;

CREATE POLICY "sessions_select_own" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "sessions_insert_own" ON public.sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_update_own" ON public.sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_delete_own" ON public.sessions
  FOR DELETE USING (auth.uid() = user_id);


-- ── 4. Storage RLS on the `reports` bucket ───────────────────────────────────
-- Object naming convention: <user_id>/<session_id>.html
-- (storage.foldername(name))[1] returns the first path segment, which must
-- equal the authenticated user's UUID. This means user A cannot PUT, GET, or
-- DELETE files under user B's folder, even if they somehow guess the path.

DROP POLICY IF EXISTS "reports_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "reports_select_own" ON storage.objects;
DROP POLICY IF EXISTS "reports_delete_own" ON storage.objects;

CREATE POLICY "reports_insert_own" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "reports_select_own" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "reports_delete_own" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public viewer downloads happen via signed URLs (5-min TTL) minted server-side
-- using the service role, which bypasses these policies.


-- ── 5. Nightly expiry job (pg_cron) ──────────────────────────────────────────
-- Soft-deletes any session whose expires_at has passed. A separate hourly
-- Netlify scheduled function (added in a later milestone) is responsible for
-- actually removing the Storage objects.
--
-- pg_cron must be enabled in Database → Extensions before this works. If it
-- isn't enabled, this block prints a NOTICE and skips — the migration still
-- succeeds, you can enable pg_cron later and re-run this file.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior version of this job (idempotent)
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'tracebug-expire-shares';

    PERFORM cron.schedule(
      'tracebug-expire-shares',
      '0 3 * * *',                       -- every day at 03:00 UTC
      $job$
        UPDATE public.sessions
          SET deleted_at = NOW()
          WHERE expires_at < NOW()
            AND deleted_at IS NULL;
      $job$
    );

    RAISE NOTICE 'pg_cron job tracebug-expire-shares scheduled (nightly 03:00 UTC).';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — expiry job NOT scheduled. Enable it in Database → Extensions and re-run.';
  END IF;
END $$;


-- ── 6. Sanity check ──────────────────────────────────────────────────────────
-- Quick verification queries. Should each return what's noted in the comment.

-- Should return 1 (sessions table exists)
SELECT COUNT(*) AS sessions_table_exists FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'sessions';

-- Should return 4 (4 RLS policies on sessions)
SELECT COUNT(*) AS sessions_rls_policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'sessions';

-- Should return 3 (3 Storage RLS policies on reports bucket)
SELECT COUNT(*) AS storage_rls_policy_count FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'reports_%';

-- Should return 1 if pg_cron is enabled and the job was scheduled, 0 otherwise
SELECT COUNT(*) AS expiry_job_count FROM cron.job WHERE jobname = 'tracebug-expire-shares';
