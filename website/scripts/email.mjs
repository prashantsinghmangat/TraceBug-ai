// Hand-run email jobs for tracebug.dev (docs/launch/email-capture-plan.md).
// Dry run unless --send is given. Run from website/ with the production env:
//
//   node --env-file=.env.local scripts/email.mjs confirm [--limit 60] [--send]
//       Confirm emails for signups that never got one: rows saved before migration
//       0008 (the old milestone-5 list), or past the API's daily cap.
//
//   node --env-file=.env.local scripts/email.mjs send <file.txt> [--limit 80] [--send]
//       The monthly update, to confirmed, not-unsubscribed addresses only
//       (the email_subscribers view). <file.txt>: first line "Subject: ...", a blank
//       line, then the plain-text body. The file name is the issue id
//       (2026-12.txt → "2026-12"); each address gets an issue once, so a send cut
//       short by --limit or the provider's daily cap resumes when run again.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO.
// Resend's free plan: 100 emails/day, 3,000/month, shared with the API's confirm
// emails and Supabase Auth — keep --limit under what's left today.

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { confirmEmail, emailConfigured, sendEmail, updateEmail } from "../lib/mailer.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const [cmd, file] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--limit"));
const SEND = flag("--send");
const pause = () => new Promise((r) => setTimeout(r, 600)); // stay under Resend's API rate limit

function die(msg) {
  console.error(msg);
  process.exit(1);
}

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[k]) die(`Missing env ${k}`);
if (SEND && !emailConfigured()) die("Missing env RESEND_API_KEY / EMAIL_FROM / EMAIL_REPLY_TO");

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function confirmBacklog() {
  const limit = Number(opt("--limit", 60));
  const { data: subs, error: e1 } = await db.from("email_subscribers").select("email");
  if (e1) die(`email_subscribers: ${e1.message} (is migration 0008 applied?)`);
  const subscribed = new Set(subs.map((s) => s.email));

  // Every row of every address that has never been sent a confirm email.
  const { data: rows, error: e2 } = await db
    .from("email_signups")
    .select("id, email, confirm_token, confirm_sent_at, unsubscribed_at, created_at")
    .order("created_at", { ascending: false });
  if (e2) die(`email_signups: ${e2.message}`);
  const byEmail = new Map();
  for (const r of rows) (byEmail.get(r.email) ?? byEmail.set(r.email, []).get(r.email)).push(r);
  const todo = [];
  for (const [email, rs] of byEmail) {
    if (subscribed.has(email)) continue;
    if (rs.some((r) => r.confirm_sent_at || r.unsubscribed_at)) continue;
    todo.push(rs[0]); // newest row: its token confirms the address
  }

  console.log(`${todo.length} address(es) never sent a confirm email; this run: ${Math.min(limit, todo.length)}${SEND ? "" : " (dry run)"}`);
  let sent = 0;
  for (const r of todo.slice(0, limit)) {
    if (!SEND) { console.log(`  would send to ${r.email}`); continue; }
    try {
      await sendEmail({ to: r.email, ...confirmEmail(r.confirm_token) });
      await db.from("email_signups").update({ confirm_sent_at: new Date().toISOString() }).eq("id", r.id);
      sent++;
    } catch (e) {
      console.error(`  ${r.email}: ${e.message}`);
      if (/\b429\b/.test(e.message)) break; // daily quota: stop, rerun tomorrow
    }
    await pause();
  }
  if (SEND) console.log(`sent ${sent}`);
}

async function sendUpdate() {
  if (!file) die("Usage: email.mjs send <file.txt> [--limit 80] [--send]");
  const limit = Number(opt("--limit", 80));
  const issue = basename(file, extname(file));
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = raw.match(/^Subject:\s*(.+)\n\n([\s\S]+)$/);
  if (!m) die(`${file}: first line must be "Subject: ...", then a blank line, then the body`);
  const [, subject, body] = m;

  const { data: subs, error } = await db
    .from("email_subscribers")
    .select("email, unsubscribe_token, last_issue")
    .order("email");
  if (error) die(`email_subscribers: ${error.message} (is migration 0008 applied?)`);
  const todo = subs.filter((s) => s.last_issue !== issue);

  console.log(`Issue "${issue}": "${subject}"`);
  console.log(`${subs.length} subscriber(s), ${todo.length} not sent yet; this run: ${Math.min(limit, todo.length)}${SEND ? "" : " (dry run)"}`);
  if (!SEND) {
    console.log("\n--- preview ---\n" + updateEmail({ subject, body, unsubscribeToken: "0".repeat(64) }).text);
    return;
  }
  let sent = 0;
  for (const s of todo.slice(0, limit)) {
    try {
      await sendEmail({ to: s.email, ...updateEmail({ subject, body, unsubscribeToken: s.unsubscribe_token }) });
      await db.from("email_signups").update({ last_issue: issue }).eq("email", s.email);
      sent++;
    } catch (e) {
      console.error(`  ${s.email}: ${e.message}`);
      if (/\b429\b/.test(e.message)) break;
    }
    await pause();
  }
  console.log(`sent ${sent}; ${todo.length - sent} left for the next run`);
}

if (cmd === "confirm") await confirmBacklog();
else if (cmd === "send") await sendUpdate();
else die("Usage: email.mjs confirm|send ... (see the top of this file)");
