// Shared bits for the extension's Site Audit sign-in (ADR 009,
// docs/launch/sign-in-gate-plan.md): email → 6-digit code → verified.
// The extension calls these routes from its own pages (popup, signin.html),
// never from the audited site. Nothing about audits is sent — only the email,
// the code, and the marketing-consent box.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS_HEADERS });

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

// Per-IP limit, in memory, best effort (one warm instance). Supabase Auth's own
// per-hour email limit is the real cap on codes sent.
const hits = new Map<string, number[]>();
export function ipLimited(req: Request, max: number, windowMs: number, bucket: string): boolean {
  const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
