import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-f0-9]{64}$/;

// Double opt-in link from the confirm email (lib/mailer.mjs). One click, no
// login. Sets confirmed_at once per row, so an old confirm link can't undo a
// later unsubscribe (migration 0008 explains the status rules).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const done = (s: string) => NextResponse.redirect(new URL(`/email?s=${s}`, req.url), 303);
  if (!TOKEN_RE.test(token)) return done("invalid");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("email_signups")
    .select("id, confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();
  if (error) {
    console.error("[confirm]", error.message);
    return done("error");
  }
  if (!data) return done("invalid");
  if (!data.confirmed_at) {
    const { error: upd } = await admin
      .from("email_signups")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upd) {
      console.error("[confirm]", upd.message);
      return done("error");
    }
  }
  return done("confirmed");
}
