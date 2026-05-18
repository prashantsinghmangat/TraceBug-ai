import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSignedUploadUrl, storageKeyFor } from "@/lib/storage";
import {
  getQuotaSnapshot,
  MAX_SIZE_BYTES,
  MAX_VIDEO_DURATION_S,
  MAX_SCREENSHOTS_PER_TICKET,
} from "@/lib/quotas";
import { generateShareToken } from "@/lib/share-token";
import type { UploadInitRequest, UploadInitResponse } from "@/lib/types";

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: UploadInitRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { title, sizeBytes, hasVideo, videoDurationS, screenshotCount, thumbnail } = body;

  // Compressed JPEG (~5-30 KB at 320x180). Hard-cap at 100 KB so a
  // misbehaving client can't stuff a full screenshot in here and blow up
  // Postgres.
  let safeThumbnail: string | null = null;
  if (typeof thumbnail === "string" && thumbnail.startsWith("data:image/") && thumbnail.length < 100_000) {
    safeThumbnail = thumbnail;
  }

  if (typeof sizeBytes !== "number" || sizeBytes <= 0) {
    return NextResponse.json({ error: "size_bytes_invalid" }, { status: 400 });
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "size_too_large", limit: MAX_SIZE_BYTES }, { status: 413 });
  }
  if (typeof hasVideo !== "boolean") {
    return NextResponse.json({ error: "has_video_invalid" }, { status: 400 });
  }
  if (hasVideo) {
    if (typeof videoDurationS !== "number" || videoDurationS <= 0) {
      return NextResponse.json({ error: "video_duration_invalid" }, { status: 400 });
    }
    if (videoDurationS > MAX_VIDEO_DURATION_S) {
      return NextResponse.json({ error: "video_too_long", limit: MAX_VIDEO_DURATION_S }, { status: 400 });
    }
  }
  if (typeof screenshotCount !== "number" || screenshotCount < 0) {
    return NextResponse.json({ error: "screenshot_count_invalid" }, { status: 400 });
  }
  if (screenshotCount > MAX_SCREENSHOTS_PER_TICKET) {
    return NextResponse.json(
      { error: "too_many_screenshots", limit: MAX_SCREENSHOTS_PER_TICKET },
      { status: 400 },
    );
  }

  const quotas = await getQuotaSnapshot(supabase, user.id);
  if (hasVideo && quotas.video.used >= quotas.video.limit) {
    return NextResponse.json(
      { error: "video_quota_reached", ...quotas.video },
      { status: 403 },
    );
  }
  if (!hasVideo && quotas.screenshot.used >= quotas.screenshot.limit) {
    return NextResponse.json(
      { error: "screenshot_quota_reached", ...quotas.screenshot },
      { status: 403 },
    );
  }

  // Insert pending session row. uploaded=false until /api/upload/complete fires.
  const shareToken = generateShareToken();
  // Insert the row WITHOUT thumbnail first — keeps the core share flow
  // working even if the 0002_thumbnails migration hasn't been applied yet.
  // Thumbnail is best-effort and goes in via a follow-up update.
  const { data: inserted, error: insertErr } = await supabase
    .from("sessions")
    .insert({
      user_id: user.id,
      share_token: shareToken,
      title: title?.slice(0, 200) ?? null,
      storage_key: "",
      size_bytes: sizeBytes,
      has_video: hasVideo,
      video_duration_s: hasVideo ? videoDurationS ?? null : null,
      screenshot_count: screenshotCount,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: "db_insert_failed", detail: insertErr?.message }, { status: 500 });
  }

  // Best-effort thumbnail update — silently skip if the column doesn't exist
  // (e.g., migration pending) or the value is null.
  if (safeThumbnail) {
    try {
      await supabase.from("sessions").update({ thumbnail: safeThumbnail }).eq("id", inserted.id);
    } catch {
      // Ignore — dashboard falls back to gradient placeholder.
    }
  }

  const storageKey = storageKeyFor(user.id, inserted.id);

  // Backfill the storage_key now that we know the session id.
  await supabase.from("sessions").update({ storage_key: storageKey }).eq("id", inserted.id);

  let signed;
  try {
    signed = await createSignedUploadUrl(supabase, storageKey);
  } catch (err: any) {
    // Roll back the session row so quota stays accurate.
    await supabase.from("sessions").delete().eq("id", inserted.id);
    return NextResponse.json({ error: "signed_url_failed", detail: err?.message }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const response: UploadInitResponse = {
    id: inserted.id,
    shareToken,
    storageKey,
    uploadUrl: signed.signedUrl,
    uploadToken: signed.token,
    viewUrl: `${siteUrl}/share/${shareToken}`,
  };
  return NextResponse.json(response);
}
