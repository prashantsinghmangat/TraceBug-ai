import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { EXTEND_DAYS } from "@/lib/quotas";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Fetch current expires_at + extended_count, then bump both in one update.
  const { data: row, error: fetchErr } = await supabase
    .from("sessions")
    .select("expires_at, extended_count")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const newExpires = new Date(Date.now() + EXTEND_DAYS * 86400_000).toISOString();
  const { error: updateErr } = await supabase
    .from("sessions")
    .update({
      expires_at: newExpires,
      extended_count: row.extended_count + 1,
    })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "db_error", detail: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ expiresAt: newExpires, extendedCount: row.extended_count + 1 });
}
