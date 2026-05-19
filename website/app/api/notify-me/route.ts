import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

const ALLOWED_SOURCES = new Set(["pricing-pro", "pricing-team", "viewer-footer"]);
const ALLOWED_TIERS = new Set(["pro", "team", "enterprise"]);

export async function POST(req: Request) {
  let body: { email?: string; source?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const source = String(body.source || "").trim();
  const tier = body.tier ? String(body.tier).trim() : null;

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  }
  if (tier && !ALLOWED_TIERS.has(tier)) {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("email_signups").insert({
    email,
    source,
    tier_interest: tier,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
  });

  // Silently treat "table doesn't exist yet" as success — UI shouldn't break
  // before the 0003 migration is applied. The form still feels successful;
  // worst case we lose a few leads until migration runs.
  if (error && !/email_signups/i.test(error.message)) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
