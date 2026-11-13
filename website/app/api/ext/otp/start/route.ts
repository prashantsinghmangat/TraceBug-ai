import { anonClient, configured, ipLimited, json, normEmail, preflight } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Step 1 of Site Audit sign-in (ADR 009): email a 6-digit code. Creates the
// account on first use — signing up and signing in are the same flow.
// Responses the extension relies on:
//   200 { ok }                          code sent
//   400 { error: "invalid_email" }      ask again
//   429 { error: "rate_limited" }       too many tries from here; ask to wait
//   503 { error: "unavailable" }        not configured / Supabase down / daily email limit → the extension FAILS OPEN
export async function POST(req: Request) {
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const email = normEmail(body.email);
  if (!email) return json({ error: "invalid_email" }, 400);
  if (!configured()) return json({ error: "unavailable" }, 503);
  if (ipLimited(req, 6, 15 * 60 * 1000, "otp-start")) return json({ error: "rate_limited" }, 429);

  try {
    const { error } = await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      // Supabase's email limit (or Resend's) is ours to absorb, not the user's problem.
      console.error("[ext/otp/start]", error.status, error.code, error.message);
      return json({ error: "unavailable" }, 503);
    }
  } catch (e) {
    console.error("[ext/otp/start]", e instanceof Error ? e.message : e);
    return json({ error: "unavailable" }, 503);
  }
  return json({ ok: true });
}
