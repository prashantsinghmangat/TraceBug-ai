import { NextRequest, NextResponse } from "next/server";

// Two responsibilities, both API-scoped:
//   1. CORS — allow chrome-extension://<id>/ + moz-extension://<id>/ origins
//      to call /api/* with credentials. Same-origin browser callers (dashboard,
//      sdk-bridge iframe) don't need CORS — they share the cookie domain.
//   2. CSRF — reject mutating requests whose Origin header doesn't match an
//      allowlist. Supabase cookies are SameSite=Lax which already blocks most
//      cross-site POSTs, but Origin enforcement is the belt-and-suspenders.
//      GETs (including /api/share/[token] for public viewers) are NOT
//      Origin-checked because they're idempotent and the public viewer route
//      is by design open.

const ALLOWED_API_PREFIXES = ["/api/me", "/api/sessions", "/api/share", "/api/upload", "/api/auth", "/api/notify-me"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedSameSiteOrigins(): string[] {
  // We accept the custom domain, the netlify default (kept — it 301s to the
  // custom domain, but old clients may still send it as Origin), the
  // NEXT_PUBLIC_SITE_URL env, and localhost for dev.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const out = new Set<string>([
    "https://tracebug.dev",
    "https://www.tracebug.dev",
    "https://tracebug.netlify.app",
    "http://localhost:3001",
  ]);
  if (siteUrl) {
    try { out.add(new URL(siteUrl).origin); } catch {}
  }
  return Array.from(out);
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = ALLOWED_API_PREFIXES.some((p) => path.startsWith(p));
  if (!isApi) return NextResponse.next();

  const origin = req.headers.get("origin") || "";
  const isExtension = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
  const isSameSite = !!origin && allowedSameSiteOrigins().includes(origin);

  // ── CSRF guard on mutating methods ─────────────────────────────────────
  // Browser-issued cross-site form posts always send an Origin header in
  // modern browsers. If we see one and it's not in the allowlist, reject.
  // Same-site requests from our own pages either send our own origin or no
  // Origin header (legacy same-origin XHR). Both pass.
  if (MUTATING_METHODS.has(req.method)) {
    if (origin && !isSameSite && !isExtension) {
      return new NextResponse(
        JSON.stringify({ error: "origin_not_allowed" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
  }

  // ── CORS for extension callers ─────────────────────────────────────────
  if (!isExtension) return NextResponse.next();

  // Preflight
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

export const config = {
  matcher: "/api/:path*",
};
