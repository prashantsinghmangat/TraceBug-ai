import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { REPORTS_BUCKET } from "@/lib/storage";

// Hourly cleanup: removes Storage objects + DB rows for sessions that were
// soft-deleted (either manually or by the nightly pg_cron expiry job).
//
// Protected by CRON_SECRET — set this in Netlify env vars and configure your
// scheduled function (or external cron) to send it via X-Cron-Secret.
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "cron_disabled" }, { status: 503 });
  if (req.headers.get("x-cron-secret") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: rows, error: fetchErr } = await admin
    .from("sessions")
    .select("id, storage_key")
    .not("deleted_at", "is", null)
    .limit(500);

  if (fetchErr) {
    return NextResponse.json({ error: "db_error", detail: fetchErr.message }, { status: 500 });
  }

  const keys = (rows ?? []).map((r) => r.storage_key).filter(Boolean);
  if (keys.length > 0) {
    const { error: removeErr } = await admin.storage.from(REPORTS_BUCKET).remove(keys);
    if (removeErr) {
      // Don't delete DB rows if Storage cleanup failed — try again next run.
      return NextResponse.json({ error: "storage_remove_failed", detail: removeErr.message }, { status: 500 });
    }
  }

  const ids = (rows ?? []).map((r) => r.id);
  if (ids.length > 0) {
    await admin.from("sessions").delete().in("id", ids);
  }

  return NextResponse.json({ purged: ids.length });
}
