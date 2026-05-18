import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const baseCols = "id, share_token, title, size_bytes, has_video, video_duration_s, screenshot_count, created_at, expires_at, extended_count";

  // Try to include `thumbnail` (added by 0002_thumbnails.sql). If the column
  // doesn't exist yet (migration not run), retry without it so the dashboard
  // still loads — cards just fall back to the gradient placeholder.
  let data: any[] | null;
  let error: { message: string } | null;
  {
    const r = await supabase
      .from("sessions")
      .select(`${baseCols}, thumbnail`)
      .eq("user_id", user.id)
      .eq("uploaded", true)
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    data = r.data;
    error = r.error;
  }

  if (error && /thumbnail/i.test(error.message)) {
    const r = await supabase
      .from("sessions")
      .select(baseCols)
      .eq("user_id", user.id)
      .eq("uploaded", true)
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    data = r.data;
    error = r.error;
  }

  if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}
