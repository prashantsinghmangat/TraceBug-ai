-- Hourly cleanup of orphaned upload-init rows.
-- /api/upload/init creates a sessions row with uploaded=false and returns a
-- presigned PUT URL. If the client never completes the upload (tab close,
-- network drop, abort), the row sits forever in the table. The quota check
-- already ignores uploaded=false rows so the user isn't blocked, but DB bloat
-- grows unbounded and the presigned URL's storage_key is reserved.
--
-- Presigned upload URLs typically expire in 5–30 minutes, so anything older
-- than 1 hour with uploaded=false is definitely stale and safe to delete.
--
-- Runs every hour at :15 to stagger from the nightly expiry-sweep at 03:00.
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'tracebug-purge-orphan-uploads';

    PERFORM cron.schedule(
      'tracebug-purge-orphan-uploads',
      '15 * * * *',                      -- every hour at :15
      $job$
        DELETE FROM public.sessions
          WHERE uploaded = false
            AND created_at < NOW() - INTERVAL '1 hour';
      $job$
    );

    RAISE NOTICE 'pg_cron job tracebug-purge-orphan-uploads scheduled (hourly at :15).';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — orphan cleanup job NOT scheduled.';
  END IF;
END $$;

-- Sanity check
SELECT COUNT(*) AS orphan_cleanup_job_count
  FROM cron.job
  WHERE jobname = 'tracebug-purge-orphan-uploads';
