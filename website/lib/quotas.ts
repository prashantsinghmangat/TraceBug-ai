import type { SupabaseClient } from "@supabase/supabase-js";

export const QUOTA_VIDEO_LIMIT = 5;
export const QUOTA_SCREENSHOT_LIMIT = 10;

export const MAX_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_DURATION_S = 120;
export const MAX_SCREENSHOTS_PER_TICKET = 5;

export const RETENTION_DAYS = 14;
export const EXTEND_DAYS = 14;

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
