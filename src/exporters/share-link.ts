// ── Cloud Share Exporter ──────────────────────────────────────────────────
// One-call API: build the same HTML blob that exportSessionAsHtml() produces
// (via the shared buildReplayBlob helper), sanitize the report first, upload
// through the iframe bridge, return a shareable URL.

import { BugReport, StoredSession } from "../types";
import { buildReplayBlob } from "./html-replay";
import { sanitizeReportForUpload } from "../sanitize/cloud-upload";
import { getBridge } from "../auth/iframe-bridge";
import { generateThumbnail } from "./thumbnail";
import { resolveCloudEndpoint } from "../cloud-endpoint";

export { DEFAULT_CLOUD_ENDPOINT } from "../cloud-endpoint";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_DURATION_S = 120;
export const MAX_SCREENSHOTS_PER_SHARE = 5;

export interface ShareReportOptions {
  /** Defaults to true if a video is present. Set false to upload without video. */
  includeVideo?: boolean;
  /** Override the cloud endpoint (advanced). */
  cloudEndpoint?: string;
}

export interface ShareLinkResult {
  id: string;
  shareUrl: string;
  shareToken: string;
  sizeBytes: number;
}

/** Error thrown when a share exceeds one of the upload caps. The extra fields
 *  let the UI compose a specific message ("too many screenshots (max 5)"). */
interface ShareLimitError extends Error {
  code?: string;
  count?: number;
  limit?: number;
  durationMs?: number;
  limitS?: number;
  sizeBytes?: number;
}

export async function shareSessionAsLink(
  session: StoredSession,
  report: BugReport,
  options?: ShareReportOptions,
): Promise<ShareLinkResult> {
  const cloudEndpoint = resolveCloudEndpoint(options?.cloudEndpoint);
  const includeVideo = options?.includeVideo ?? !!report.video;

  // Sanitize first so the cap calculations and the uploaded HTML both see the
  // same scrubbed content. The local download path keeps the original report.
  const safe = sanitizeReportForUpload(report);

  if (safe.screenshots && safe.screenshots.length > MAX_SCREENSHOTS_PER_SHARE) {
    const err: ShareLimitError = new Error("too_many_screenshots");
    err.code = "too_many_screenshots";
    err.count = safe.screenshots.length;
    err.limit = MAX_SCREENSHOTS_PER_SHARE;
    throw err;
  }

  if (includeVideo && safe.video?.durationMs && safe.video.durationMs > MAX_VIDEO_DURATION_S * 1000) {
    const err: ShareLimitError = new Error("video_too_long");
    err.code = "video_too_long";
    err.durationMs = safe.video.durationMs;
    err.limitS = MAX_VIDEO_DURATION_S;
    throw err;
  }

  const blob = await buildReplayBlob(session, safe, { includeVideo });

  if (blob.size > MAX_UPLOAD_BYTES) {
    const err: ShareLimitError = new Error("size_too_large");
    err.code = "size_too_large";
    err.sizeBytes = blob.size;
    err.limit = MAX_UPLOAD_BYTES;
    throw err;
  }

  // Generate a small JPEG preview for the dashboard card. Best-effort —
  // if it fails the dashboard falls back to a gradient placeholder.
  let thumbnail: string | null = null;
  try { thumbnail = await generateThumbnail(safe); } catch { thumbnail = null; }

  const bridge = getBridge(cloudEndpoint);

  const init = await bridge.uploadInit({
    title: safe.title?.slice(0, 200),
    sizeBytes: blob.size,
    hasVideo: !!(includeVideo && safe.video),
    videoDurationS: includeVideo && safe.video ? Math.round(safe.video.durationMs / 1000) : undefined,
    screenshotCount: safe.screenshots?.length ?? 0,
    thumbnail: thumbnail ?? undefined,
    // Tester-set only — don't upload the severity-derived fallback.
    priority: session.priority,
  });

  await bridge.uploadBlob(init.storageKey, init.uploadToken, blob, "text/html");

  const complete = await bridge.uploadComplete(init.id);

  return {
    id: init.id,
    shareUrl: complete.shareUrl,
    shareToken: init.shareToken,
    sizeBytes: blob.size,
  };
}
