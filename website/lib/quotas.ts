import type { SupabaseClient } from "@supabase/supabase-js";

export const QUOTA_VIDEO_LIMIT = 5;
export const QUOTA_SCREENSHOT_LIMIT = 10;

export const MAX_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_DURATION_S = 120;
export const MAX_SCREENSHOTS_PER_TICKET = 5;

export const RETENTION_DAYS = 14;
export const EXTEND_DAYS = 14;
// Hard cap on how many times a single share can be extended, so a free user
// can't keep a report alive forever (14 + 14×MAX_EXTENSIONS days max).
export const MAX_EXTENSIONS = 4;

// ── AI Root-Cause limits ─────────────────────────────────────────────────────
// Free-tier monthly cap on AI diagnoses, enforced server-side in
// /api/ai/diagnose. This is the real cost ceiling per user (each analysis is a
// metered Claude call). AI_RATE_LIMIT_PER_MINUTE is a coarse burst guard until
// a proper rate limiter (e.g. Upstash) is wired in.
export const AI_ANALYSES_FREE_PER_MONTH = 10;
export const AI_RATE_LIMIT_PER_MINUTE = 5;

export interface QuotaSnapshot {
  video: { used: number; limit: number };
  screenshot: { used: number; limit: number };
}

// Counts only uploaded=true rows so abandoned /api/upload/init calls don't
// consume the user's quota.
export async function getQuotaSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<QuotaSnapshot> {
  const { data, error } = await supabase
    .from("sessions")
    .select("has_video")
    .eq("user_id", userId)
    .eq("uploaded", true)
    .is("deleted_at", null);

  if (error) throw error;

  const rows = data ?? [];
  const videoUsed = rows.filter((r) => r.has_video).length;
  const screenshotUsed = rows.length - videoUsed;

  return {
    video: { used: videoUsed, limit: QUOTA_VIDEO_LIMIT },
    screenshot: { used: screenshotUsed, limit: QUOTA_SCREENSHOT_LIMIT },
  };
}
