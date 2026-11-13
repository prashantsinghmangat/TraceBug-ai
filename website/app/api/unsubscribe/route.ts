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

// Relative Location: the browser stays on the host it used (tracebug.dev). req.url on
// Netlify is the deploy URL (…--tracebug.netlify.app), so an absolute redirect leaked it.
const go = (_req: Request, qs: string) => new NextResponse(null, { status: 303, headers: { Location: `/email?${qs}` } });

// The link in every update email. GET never changes anything — mail security
// scanners open links on their own — it shows /email with one "Unsubscribe"
// button (no login, no questions). That button POSTs here with from=page.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return go(req, "s=invalid");
  return go(req, `s=unsubscribe&token=${token}`);
}

// Two callers:
//  - the /email page button: form with token + from=page → redirect to the result page;
//  - RFC 8058 one-click from mail clients (List-Unsubscribe-Post header): token in
//    the query, body "List-Unsubscribe=One-Click" → plain status. Scanners don't POST.
export async function POST(req: Request) {
  const url = new URL(req.url);
  let form: FormData | null = null;
  try { form = await req.formData(); } catch { /* RFC 8058 body may not parse as a form everywhere */ }
  if (form?.get("from") === "page") {
    const result = await unsubscribe(String(form.get("token") ?? ""));
    return go(req, `s=${result}`);
  }
  const result = await unsubscribe(url.searchParams.get("token") ?? "");
  const status = result === "unsubscribed" ? 200 : result === "invalid" ? 400 : 500;
  return new NextResponse(result, { status });
}
