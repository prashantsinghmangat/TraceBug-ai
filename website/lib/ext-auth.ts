// Shared bits for the extension's Site Audit sign-in (ADR 009,
// docs/launch/sign-in-gate-plan.md): email → 6-digit code → verified.
// The extension calls these routes from its own pages (popup, signin.html),
// never from the audited site. Nothing about audits is sent — only the email,
// the code, and the marketing-consent box.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

// Only extension pages may call these routes from a browser. Firefox gives each
// install a random moz-extension:// UUID, so the scheme is the check, not an ID.
// A request with no Origin (curl, server) is let through: browsers always send
// one on a cross-origin POST, and the DB limits in otpSendBudget cover scripts.
const EXT_ORIGIN = /^(chrome-extension|moz-extension):\/\/[a-z0-9-]+$/i;

function extOrigin(req: Request): string | null {
  const o = req.headers.get("origin");
  return o && EXT_ORIGIN.test(o) ? o : null;
}

/** False when a browser page that isn't one of ours is calling. */
export function originAllowed(req: Request): boolean {
  return !req.headers.get("origin") || !!extOrigin(req);
}

function corsHeaders(req: Request): Record<string, string> {
  const o = extOrigin(req);
  return o
    ? {
        "Access-Control-Allow-Origin": o,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

export const json = (req: Request, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...corsHeaders(req), "Cache-Control": "no-store" } });

export const preflight = (req: Request) => new NextResponse(null, { status: 204, headers: corsHeaders(req) });

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return e && e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

export function configured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Anon client with no session storage: each request stands alone. */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const PER_EMAIL_PER_HOUR = 3;
const MAX_WRONG_CODES_PER_HOUR = 5;
const HOUR = 60 * 60 * 1000;

const emailHash = (email: string) => createHash("sha256").update(email).digest("hex");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message);

/**
 * Wrong-code lockout (migration 0010). True when this address has had
 * MAX_WRONG_CODES_PER_HOUR wrong codes in the last hour. Fails open (false) if
 * the table is missing or the DB errors.
 */
export async function codeAttemptsBlocked(email: string): Promise<boolean> {
  try {
    const { count, error } = await createSupabaseAdminClient()
      .from("otp_fail_log")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash(email))
      .gte("created_at", new Date(Date.now() - HOUR).toISOString());
    if (error) throw error;
    return (count ?? 0) >= MAX_WRONG_CODES_PER_HOUR;
  } catch (e) {
    console.error("[ext/otp] fail log unavailable, allowing", errMsg(e));
    return false;
  }
}

/** Record a wrong code (and prune rows older than two days). Best effort. */
export async function recordCodeFailure(email: string): Promise<void> {
  try {
    const db = createSupabaseAdminClient();
    const ins = await db.from("otp_fail_log").insert({ email_hash: emailHash(email) });
    if (ins.error) throw ins.error;
    await db.from("otp_fail_log").delete().lt("created_at", new Date(Date.now() - 48 * HOUR).toISOString());
  } catch (e) {
    console.error("[ext/otp] could not record failure", errMsg(e));
  }
}

/** A correct code clears the address's wrong-code count. Best effort. */
export async function clearCodeFailures(email: string): Promise<void> {
  try {
    await createSupabaseAdminClient().from("otp_fail_log").delete().eq("email_hash", emailHash(email));
  } catch {}
}

/**
 * DB-backed limit on sign-in code emails (migration 0009). Records the send
 * when allowed. "email" = this address asked too often (retryAfter seconds);
 * "global" = the daily cap is reached (the route answers 503, the extension
 * fails open). If the table is missing or the DB errors, allow: the in-memory
 * IP limit and Supabase's own caps still apply, and sign-in keeps working.
 */
export async function otpSendBudget(
  email: string,
): Promise<{ ok: true } | { ok: false; reason: "email"; retryAfter: number } | { ok: false; reason: "global" }> {
  const hash = emailHash(email);
  const now = Date.now();
  const cap = Number(process.env.OTP_DAILY_CAP) || 50;
  try {
    const db = createSupabaseAdminClient();
    const recent = await db
      .from("otp_send_log")
      .select("created_at")
      .eq("email_hash", hash)
      .gte("created_at", new Date(now - HOUR).toISOString())
      .order("created_at", { ascending: true })
      .limit(PER_EMAIL_PER_HOUR);
    if (recent.error) throw recent.error;
    if (recent.data.length >= PER_EMAIL_PER_HOUR) {
      const oldest = Date.parse(recent.data[0].created_at);
      return { ok: false, reason: "email", retryAfter: Math.max(1, Math.ceil((oldest + HOUR - now) / 1000)) };
    }
    const day = await db
      .from("otp_send_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(now - 24 * HOUR).toISOString());
    if (day.error) throw day.error;
    if ((day.count ?? 0) >= cap) return { ok: false, reason: "global" };

    const ins = await db.from("otp_send_log").insert({ email_hash: hash });
    if (ins.error) throw ins.error;
    // Keep the table tiny: nothing older than two days is needed.
    await db.from("otp_send_log").delete().lt("created_at", new Date(now - 48 * HOUR).toISOString());
  } catch (e) {
    console.error("[ext/otp] send log unavailable, allowing", errMsg(e));
  }
  return { ok: true };
}

// Per-IP limit, in memory, best effort (one warm instance). Supabase Auth's own
// per-hour email limit is the real cap on codes sent.
const hits = new Map<string, number[]>();
export function ipLimited(req: Request, max: number, windowMs: number, bucket: string): boolean {
  // Netlify sets x-nf-client-connection-ip at its edge. Fallback: the LAST
  // x-forwarded-for entry (appended by the proxy) — the first one is whatever
  // the client sent, so it would let anyone pick a fresh "IP" per request.
  const ip =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ??
    "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
