import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-f0-9]{64}$/;

// Relative Location: the browser stays on the host it used (tracebug.dev). req.url on
// Netlify is the deploy URL (…--tracebug.netlify.app), so an absolute redirect leaked it.
const go = (_req: Request, qs: string) => new NextResponse(null, { status: 303, headers: { Location: `/email?${qs}` } });

// Double opt-in link from the confirm email (lib/mailer.mjs).
// GET never changes anything: mail security scanners open links on their own,
// and would otherwise confirm addresses nobody confirmed. It shows /email with a
// "Confirm" button; that button POSTs here. Sets confirmed_at once per row, so an
// old confirm link can't undo a later unsubscribe (migration 0008).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return go(req, "s=invalid");
  return go(req, `s=confirm&token=${token}`);
}

export async function POST(req: Request) {
  let token = "";
  try { token = String((await req.formData()).get("token") ?? ""); } catch { /* not a form */ }
  if (!TOKEN_RE.test(token)) return go(req, "s=invalid");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("email_signups")
    .select("id, confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();
  if (error) {
    console.error("[confirm]", error.message);
    return go(req, "s=error");
  }
  if (!data) return go(req, "s=invalid");
  if (!data.confirmed_at) {
    const { error: upd } = await admin
      .from("email_signups")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upd) {
      console.error("[confirm]", upd.message);
      return go(req, "s=error");
    }
  }
  return go(req, "s=confirmed");
}
