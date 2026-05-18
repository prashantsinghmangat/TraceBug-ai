-- Adds an inline thumbnail (JPEG data URL, ~5-10KB) to each session so the
-- dashboard can render real previews instead of gradient placeholders.
-- Stored inline because the volume is small and a separate Storage bucket
-- would mean another presigned-URL round-trip per dashboard load.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS thumbnail TEXT;

COMMENT ON COLUMN public.sessions.thumbnail IS 'data:image/jpeg;base64,... · ~320x180 · generated client-side at share time.';
