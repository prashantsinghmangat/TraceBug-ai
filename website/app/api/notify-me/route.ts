import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { confirmEmail, emailConfigured, sendEmail } from "@/lib/mailer.mjs";

const ALLOWED_SOURCES = new Set([
  "pricing-pro", "pricing-team", "viewer-footer", "blog", "milestone-5",
  // Extension popup ask (docs/launch/email-capture-plan.md): which result came just before it.
  "ext-audit-2", "ext-ticket-2", "ext-export-2", "ext-retry-10",
]);
const USAGE_KEYS = ["audit", "ticket", "export"] as const;

/** Opt-in usage snapshot from the extension: three small counts, nothing else. */
function parseUsage(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, number> = {};
  for (const k of USAGE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 99999) return null;
    out[k] = v;
  }
  return out;
}
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
  let body: { email?: string; source?: string; tier?: string; usage?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const source = String(body.source || "").trim();
  const tier = body.tier ? String(body.tier).trim() : null;
  const usage = parseUsage(body.usage);

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

  if (ipLimited(clientIp(req))) {
    return json({ error: "rate_limited" }, 429);
  }

  const admin = createSupabaseAdminClient();

  // Earlier rows for this address (migration 0008 columns). Before 0008 this
  // query errors; treat that as "no history" and just store the signup.
  const { data: history } = await admin
    .from("email_signups")
    .select("created_at, confirm_sent_at, confirmed_at, unsubscribed_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(20);
  const prior = (history ?? []) as Array<Record<string, string | null>>;
  const latest = (k: string) => prior.reduce((m, r) => Math.max(m, r[k] ? Date.parse(r[k]!) : 0), 0);
  const subscribed = latest("confirmed_at") > latest("unsubscribed_at");
  const now = Date.now();
  // Too many signups for this address today: store nothing more, send nothing.
  // "pending" is still honest here: an earlier signup today got the confirm email.
  if (prior.filter((r) => now - Date.parse(r.created_at!) < DAY_MS).length >= MAX_SIGNUPS_PER_EMAIL_PER_DAY) {
    console.info("[notify-me] signup not stored: 5 signups for this address in 24 h");
    return json({ ok: true, status: subscribed ? "subscribed" : "pending" });
  }

  const row: Record<string, unknown> = {
    email,
    source,
    tier_interest: tier,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
  };
  let { data: inserted, error } = await admin.from("email_signups").insert(usage ? { ...row, usage } : row).select().single();
  // Before migration 0007 adds the usage column, keep the signup and drop the counts —
  // the check below would otherwise swallow the error and lose the address.
  if (error && usage && /usage/i.test(error.message)) {
    ({ data: inserted, error } = await admin.from("email_signups").insert(row).select().single());
  }

  // Silently treat "table doesn't exist yet" as success — UI shouldn't break
  // before the 0003 migration is applied. The form still feels successful;
  // worst case we lose a few leads until migration runs.
  if (error && !/email_signups/i.test(error.message)) {
    return json({ error: "db_error", detail: error.message }, 500);
  }

  // Double opt-in: the only email an unconfirmed address ever gets is this one.
  // Skipped when already subscribed, when a confirm email went out in the last
  // few minutes, before migration 0008 (no token), or when the daily cap is
  // reached — those rows stay unsent and `scripts/email.mjs confirm` sends them.
  const token = (inserted as { id?: string; confirm_token?: string } | null)?.confirm_token;
  const recentlySent = now - latest("confirm_sent_at") < RESEND_CONFIRM_AFTER_MS;
  const skip = !token ? "no confirm_token (migration 0008 not applied?)"
    : subscribed ? "already subscribed"
    : recentlySent ? "confirm sent <10 min ago"
    : !emailConfigured() ? "RESEND_API_KEY / EMAIL_FROM / EMAIL_REPLY_TO not set"
    : !(await underDailyCap(admin)) ? "daily cap reached"
    : null;
  if (skip) console.info(`[notify-me] confirm email not sent: ${skip}`);
  if (!skip) {
    try {
      await sendEmail({ to: email, ...confirmEmail(token!) });
      await admin.from("email_signups").update({ confirm_sent_at: new Date().toISOString() }).eq("id", inserted!.id!);
    } catch (e) {
      // The signup is saved; the backlog command retries it.
      console.error("[notify-me] confirm email failed:", e instanceof Error ? e.message : e);
    }
  }

  // "subscribed": no email was sent, so the form must not say "check your inbox".
  // This tells whoever typed the address that it is on the list; accepted for a
  // product-update list (the alternative was copy that didn't match what happened).
  return json({ ok: true, status: subscribed ? "subscribed" : "pending" });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SIGNUPS_PER_EMAIL_PER_DAY = 5;
const RESEND_CONFIRM_AFTER_MS = 10 * 60 * 1000;
// Resend's free plan sends 100 emails a day across everything (confirms, the
// monthly update, Supabase Auth SMTP: Site Audit sign-in and delete codes).
// 30 leaves ~70 for codes and the monthly send. Override with CONFIRM_DAILY_CAP.
const CONFIRM_DAILY_CAP = Number(process.env.CONFIRM_DAILY_CAP) || 30;

async function underDailyCap(admin: ReturnType<typeof createSupabaseAdminClient>): Promise<boolean> {
  const { count, error } = await admin
    .from("email_signups")
    .select("id", { count: "exact", head: true })
    .gte("confirm_sent_at", new Date(Date.now() - DAY_MS).toISOString());
  return !error && (count ?? 0) < CONFIRM_DAILY_CAP;
}

// Per-IP limit, in memory. Best effort: it holds within one warm function
// instance, not across all of them. The per-address and daily caps above live
// in the database and are the real guard on what gets emailed.
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_MAX = 5;
const ipHits = new Map<string, number[]>();

function clientIp(req: Request): string {
  return req.headers.get("x-nf-client-connection-ip")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "unknown";
}

function ipLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  if (ipHits.size > 5000) ipHits.clear();
  return hits.length > IP_MAX;
}
