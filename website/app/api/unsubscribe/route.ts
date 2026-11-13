import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Unsubscribes the token's address everywhere: every signup row for it. */
async function unsubscribe(token: string): Promise<"unsubscribed" | "invalid" | "error"> {
  if (!TOKEN_RE.test(token)) return "invalid";
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("email_signups")
    .select("email")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) {
    console.error("[unsubscribe]", error.message);
    return "error";
  }
  if (!data) return "invalid";
  // Always now(), even if set before: it must be later than any confirm for
  // the address to count as unsubscribed (migration 0008).
  const { error: upd } = await admin
    .from("email_signups")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", data.email);
  if (upd) {
    console.error("[unsubscribe]", upd.message);
    return "error";
  }
  return "unsubscribed";
}

// The link in every update email: one click, no login, no "are you sure?".
export async function GET(req: Request) {
  const result = await unsubscribe(new URL(req.url).searchParams.get("token") ?? "");
  return NextResponse.redirect(new URL(`/email?s=${result}`, req.url), 303);
}

// RFC 8058 one-click: mail clients POST here from the List-Unsubscribe header.
export async function POST(req: Request) {
  const result = await unsubscribe(new URL(req.url).searchParams.get("token") ?? "");
  const status = result === "unsubscribed" ? 200 : result === "invalid" ? 400 : 500;
  return new NextResponse(result, { status });
}
