import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Supabase magic-link callback. Exchanges the one-time code for a session
// cookie, then redirects to the `next` target (defaults to /dashboard).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/dashboard";

  // Prevent open redirect. A prefix check is not enough: the URL parser turns
  // "/\evil.com" and "/<tab>/evil.com" into https://evil.com/. Resolve first,
  // then accept only our own origin.
  let target = new URL("/dashboard", url);
  try {
    const resolved = new URL(requestedNext, url);
    if (resolved.origin === url.origin) target = resolved;
  } catch {}

  if (code) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(target.pathname + target.search + target.hash, url));
}
