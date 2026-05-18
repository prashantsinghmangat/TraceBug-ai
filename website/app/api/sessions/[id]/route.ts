import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { deleteObject } from "@/lib/storage";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row, error: fetchErr } = await supabase
    .from("sessions")
    .select("storage_key")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Soft-delete the row first — quota frees up immediately even if Storage
  // delete is briefly delayed.
  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: "db_error", detail: updateErr.message }, { status: 500 });
  }

  if (row.storage_key) {
    try {
      await deleteObject(supabase, row.storage_key);
    } catch {
      // Best-effort. The hourly purge cron will sweep it up.
    }
  }

  return new NextResponse(null, { status: 204 });
}
