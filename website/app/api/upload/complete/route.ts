import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("sessions")
    .update({ uploaded: true })
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select("share_token")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  return NextResponse.json({
    id: body.id,
    shareUrl: `${siteUrl}/share/${row.share_token}`,
  });
}
