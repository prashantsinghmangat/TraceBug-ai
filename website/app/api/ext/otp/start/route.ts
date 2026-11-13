import { anonClient, configured, ipLimited, json, normEmail, originAllowed, otpSendBudget, preflight } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Step 1 of Site Audit sign-in (ADR 009): email a 6-digit code. Creates the
// account on first use — signing up and signing in are the same flow.
// Responses the extension relies on:
//   200 { ok }                          code sent
//   400 { error: "invalid_email" }      ask again
//   403 { error: "origin_not_allowed" } a web page (not the extension) called
//   429 { error: "too_soon", retryAfter } this address asked recently; wait
//   429 { error: "rate_limited" }       too many tries from here; ask to wait
//   503 { error: "unavailable" }        not configured / Supabase down / daily cap → the extension FAILS OPEN
export async function POST(req: Request) {
  // Without this, any website could make its visitors' browsers email codes to
  // arbitrary addresses (and create accounts for them).
  if (!originAllowed(req)) return json(req, { error: "origin_not_allowed" }, 403);
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return json(req, { error: "invalid_json" }, 400); }
  const email = normEmail(body.email);
  if (!email) return json(req, { error: "invalid_email" }, 400);
  if (!configured()) return json(req, { error: "unavailable" }, 503);
  if (ipLimited(req, 6, 15 * 60 * 1000, "otp-start")) return json(req, { error: "rate_limited" }, 429);

  const budget = await otpSendBudget(email);
  if (!budget.ok) {
    if (budget.reason === "email") return json(req, { error: "too_soon", retryAfter: budget.retryAfter }, 429);
    console.error("[ext/otp/start] daily cap reached; failing open");
    return json(req, { error: "unavailable" }, 503);
  }

  try {
    const { error } = await anonClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      console.error("[ext/otp/start]", error.status, error.code, error.message);
      // Supabase allows one code per address per ~60 s ("you can only request this after
      // N seconds"). That's the user asking twice, not an outage: tell them to wait.
      const wait = /after (\d+) seconds?/i.exec(error.message ?? "");
      if (wait) return json(req, { error: "too_soon", retryAfter: Number(wait[1]) }, 429);
      // Supabase's project email limit (or Resend's) is ours to absorb: the extension fails open.
      return json(req, { error: "unavailable" }, 503);
    }
  } catch (e) {
    console.error("[ext/otp/start]", e instanceof Error ? e.message : e);
    return json(req, { error: "unavailable" }, 503);
  }
  return json(req, { ok: true });
}
