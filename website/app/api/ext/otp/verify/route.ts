import { createSupabaseAdminClient } from "@/lib/supabase-server";
import { anonClient, configured, ipLimited, json, normEmail, preflight } from "@/lib/ext-auth";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

// Step 2 of Site Audit sign-in (ADR 009): check the 6-digit code.
//   intent "signin" (default): returns { ok, email, userId }. If the user ticked
//     the separate marketing box, adds a CONFIRMED row to email_signups (the code
//     proves they own the address) with source "ext-signin".
//   intent "delete": deletes the account and every email_signups row for the address.
// No session token is returned or kept: the extension only needs to know the
// address was verified. Responses:
//   200 { ok, ... } · 400 { error: "invalid_code" | "invalid_email" } · 429 rate_limited · 503 unavailable (fail open)
export async function POST(req: Request) {
  let body: { email?: unknown; code?: unknown; marketing?: unknown; intent?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const email = normEmail(body.email);
  const code = String(body.code ?? "").replace(/\s+/g, "");
  const intent = body.intent === "delete" ? "delete" : "signin";
  if (!email) return json({ error: "invalid_email" }, 400);
  if (!/^\d{6,10}$/.test(code)) return json({ error: "invalid_code" }, 400);
  if (!configured()) return json({ error: "unavailable" }, 503);
  if (ipLimited(req, 12, 15 * 60 * 1000, "otp-verify")) return json({ error: "rate_limited" }, 429);

  let userId: string;
  try {
    const { data, error } = await anonClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (error || !data.user) {
      // 4xx from Supabase = wrong or expired code; anything else = the service.
      const st = error?.status ?? 0;
      if (st >= 400 && st < 500 && st !== 429) return json({ error: "invalid_code" }, 400);
      console.error("[ext/otp/verify]", st, error?.code, error?.message);
      return json({ error: "unavailable" }, 503);
    }
    userId = data.user.id;
  } catch (e) {
    console.error("[ext/otp/verify]", e instanceof Error ? e.message : e);
    return json({ error: "unavailable" }, 503);
  }

  const admin = createSupabaseAdminClient();

  if (intent === "delete") {
    const { error: delUser } = await admin.auth.admin.deleteUser(userId);
    const { error: delRows } = await admin.from("email_signups").delete().eq("email", email);
    if (delUser || delRows) {
      console.error("[ext/otp/verify] delete", delUser?.message, delRows?.message);
      return json({ error: "unavailable" }, 503);
    }
    return json({ ok: true, deleted: true });
  }

  if (body.marketing === true) {
    const now = new Date().toISOString();
    const { error } = await admin.from("email_signups").insert({
      email,
      source: "ext-signin",
      confirmed_at: now,
      confirm_sent_at: now,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    // The sign-in itself succeeded; a failed list insert must not block the audit.
    if (error) console.error("[ext/otp/verify] marketing row", error.message);
  }

  return json({ ok: true, email, userId });
}
