import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Supabase magic-link callback. Exchanges the one-time code for a session
// cookie, then redirects to the `next` target (defaults to /dashboard).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/dashboard";

  // Prevent open redirect: only allow same-site relative paths. Reject absolute
  // URLs and protocol-relative ("//evil.com") values, which new URL() would
  // otherwise resolve to an attacker-controlled origin.
  const next =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, req.url));
}
