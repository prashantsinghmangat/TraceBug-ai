import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Free Supabase projects pause after 7 days without activity; while paused,
// signups, unsubscribe links and Site Audit sign-in fail (ADR 009). The weekly
// GitHub Action (.github/workflows/keepalive.yml) calls this: one cheap,
// head-only count query. Returns nothing but ok/error.
export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "server_not_configured" }, { status: 503 });
  }
  const { error } = await createSupabaseAdminClient()
    .from("email_signups")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (error) {
    console.error("[keepalive]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
