import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

const ALLOWED_SOURCES = new Set(["pricing-pro", "pricing-team", "viewer-footer", "blog", "milestone-5"]);
const ALLOWED_TIERS = new Set(["pro", "team", "enterprise"]);

// The SDK's milestone card posts from arbitrary page origins (wherever the
// user is debugging) — CORS must allow it. Safe for this endpoint: it's a
// public, validated, insert-only email signup.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: CORS_HEADERS });

export async function POST(req: Request) {
  let body: { email?: string; source?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const source = String(body.source || "").trim();
  const tier = body.tier ? String(body.tier).trim() : null;

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return json({ error: "invalid_source" }, 400);
  }
  if (tier && !ALLOWED_TIERS.has(tier)) {
    return json({ error: "invalid_tier" }, 400);
  }

  // Guard against missing runtime config: without SUPABASE_SERVICE_ROLE_KEY,
  // createClient throws synchronously and the function 500s with an empty
  // body — undebuggable from the outside. Fail loudly and specifically.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[notify-me] Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    return json({ error: "server_not_configured" }, 503);
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
    return json({ error: "db_error", detail: error.message }, 500);
  }

  return json({ ok: true });
}
