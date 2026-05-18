import { NextRequest, NextResponse } from "next/server";

// Allow the Chrome extension popup to call the cloud API with credentials.
// The extension's origin is chrome-extension://<id>/, which Chrome will send
// as the Origin header for fetch() calls from popup.js. We echo it back so
// the browser passes the response to the popup. credentials: include works
// because the extension has host_permissions for our backend.
//
// For browser app callers (SDK iframe at our own domain, dashboard, etc.)
// no CORS is needed — they're same-origin to the API.

const ALLOWED_API_PREFIXES = ["/api/me", "/api/sessions", "/api/share", "/api/upload", "/api/auth"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isApi = ALLOWED_API_PREFIXES.some((p) => path.startsWith(p));
  if (!isApi) return NextResponse.next();

  const origin = req.headers.get("origin") || "";
  const isExtension = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
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
