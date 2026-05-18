import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { createSignedDownloadUrl } from "@/lib/storage";
import type { SharePublicResponse } from "@/lib/types";

// Public — no auth required. Uses the admin client (service role) to read a
// single row by share_token, then mints a short-lived signed download URL.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("sessions")
    .select("title, storage_key, size_bytes, has_video, video_duration_s, screenshot_count, created_at, expires_at, uploaded, deleted_at")
    .eq("share_token", params.token)
    .single();

  if (error || !row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (row.deleted_at) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!row.uploaded) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 404 });
  }

  let downloadUrl: string;
  try {
    downloadUrl = await createSignedDownloadUrl(admin, row.storage_key, 300);
  } catch (err: any) {
    return NextResponse.json({ error: "signed_url_failed", detail: err?.message }, { status: 500 });
  }

  const response: SharePublicResponse = {
    title: row.title,
    hasVideo: row.has_video,
    videoDurationS: row.video_duration_s,
    screenshotCount: row.screenshot_count,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    downloadUrl,
  };
  return NextResponse.json(response);
}
