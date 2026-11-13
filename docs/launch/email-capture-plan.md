# Email capture plan — earned ask, not a wall

Status: **built on `develop` 2026-11-13 (uncommitted, unreleased).** Sending (double opt-in, unsubscribe, monthly
script) built the same day; needs the owner's Resend account, DNS, env vars and migrations 0007 + 0008 (see *Sending*). Soft ask chosen (no gate). Paid plans: `monetization-plan.md`.

## Goal

Get real email addresses from people who have *used* TraceBug, so we can tell them about releases
(Design Tokens, Visual Comparison) and invite them to interviews/pilots. Quality over count: an
address from someone who ran two audits is worth more than ten from installs.

## Why not "2 free uses, then email to continue"

| Problem | Detail |
|---|---|
| Breaks ADR 001 | "No accounts, no quotas" is the founding decision and the main thing cloud tools can't copy. A gate needs a backend for accounts + usage counters. |
| Breaks a public promise | `/pricing` and the 2026-07-29 ruling: local capture/export free forever; paid = cloud collaboration only. |
| Can't be enforced | Counters live on the user's machine; the SDK and CLI are MIT on npm. Anyone can fork past a gate, and the ones who hit it write 1-star reviews. |
| Stage 1 of that plan is telemetry | Tracking "first audit, first capture" per user is banned (ADR 001/002, store data-use answers). |
| Store review | Gating a feature that was free changes our CWS/AMO data-use answers and listing text — new review, new risk. |

Accounts arrive naturally later, with the paid **cloud** tier (share links, team). Not by gating local features.

## What exists today

- `src/ui/milestone-ask.ts`: shown **once ever** at the 5th saved ticket, never blocks, posts to
  `tracebug.dev/api/notify-me` (Supabase `email_signups`, source `milestone-5`).
- Gaps: (1) audit users — now our lead feature — never see it; (2) 5 saves is late, most users never get
  there; (3) it's injected into the host page, so the page's CSP often blocks the request (falls back to a link);
  (4) nothing ever emails the people who signed up (store-only, no sender, no unsubscribe).

## Proposal — "earned ask" v2

1. **When:** after the **2nd successful outcome** of any kind — audit finished with a score, ticket saved,
   or recording saved/exported. Cancelled/empty runs don't count. Counted locally in `chrome.storage.local`
   (not page `localStorage`); nothing is sent.
2. **Where:** in extension UI only — the audit side panel or the popup, right after the success state.
   Not injected into the host page: no CSP failures, nothing visible to the site owner.
   `fetch` from an extension page to tracebug.dev needs CORS only (already `*`), **no new manifest permission.**
3. **What it says:** value for value, never "to continue".
   > **Want the next features first?** Design Tokens and Visual Comparison are coming. One email a month,
   > early access, unsubscribe anytime. TraceBug keeps working fully either way.
   > `[you@company.com] [Get early access]`  ·  No thanks
4. **How often:** shown at success #2. "No thanks" = never again. Closing with ✕ = one more try at success #10.
   Never more than twice. Keep the 5th-ticket card for SDK/script-tag users who don't have the extension popup.
5. **Usage snapshot (opt-in):** under the field, the local counts ("12 audits, 3 recordings, 5 tickets") and an
   unticked box "Send these counts with my email". Sent once, only if ticked. This is how we learn which features
   matter without telemetry — see `monetization-plan.md`.
6. **Consent:** one field, one purpose (updates + early access), stated in the copy. Double opt-in: a confirm
   email before the first newsletter. Every email has an unsubscribe link.
7. **Sending:** Resend via plain `fetch` on the website side (no new dependency; ADR 005 untouched). See *Sending*.
8. **Measure without telemetry:** each surface posts its own `source` (`ext-audit-2`, `ext-ticket-2`,
   `ext-record-2`, `ext-retry-10`, `milestone-5`). Funnel = signups by source ÷ CWS/AMO weekly users and
   npm downloads (dashboards we already have). Track confirm rate and unsubscribe rate. Monthly review in
   `METRICS.md`; if a source converts < 2% of weekly users after 4 weeks, move or reword it.

## Required alongside the code

- `docs/STORE-LISTINGS.md` + CWS/AMO data-use answers: the extension now sends an email address the user
  types. **Check today's answers too** — "leave PII unticked" may already be wrong because of the milestone card.
- `website` `/privacy`: what we store (email, source, timestamp, confirm status), why, how to delete.
- `ALLOWED_SOURCES` in `website/app/api/notify-me/route.ts`: add the new sources; add rate limiting.
- ADR: short note that an opt-in email ask is compatible with ADR 001 (no account, no quota, nothing gated).

## Sending (built 2026-11-13)

**Provider: Resend free plan** (checked live 2026-11-13: 3,000/month, **100/day**, SMTP relay, 3 domains,
Marketing Free with 1,000 contacts). Brevo (300/day per its own feature page, but its branding on free emails and
an account approval step) is the fallback. The 100/day is shared by confirms, the monthly send and Supabase Auth.

- `website/lib/mailer.mjs`: send (Resend REST), confirm email, update email with footer + RFC 8058
  `List-Unsubscribe` headers. Shared by the routes and the script.
- `POST /api/notify-me`: saves the row, then sends the confirm email unless the address is already subscribed,
  one went out <10 min ago, or 60 were sent in 24 h (`CONFIRM_DAILY_CAP`). Limits: 5 signups/address/day (DB),
  5 requests/IP/10 min (in memory, best effort). Pre-0007/0008 fallbacks kept.
- `GET /api/confirm?token=`, `GET|POST /api/unsubscribe?token=` → `/email?s=...` status page. Unsubscribe
  stamps every row of the address.
- Migration 0008: tokens + `confirm_sent_at`, `confirmed_at`, `unsubscribed_at`, `last_issue`; view
  `email_subscribers` = the only list anything emails (latest confirm later than latest unsubscribe).
- `website/scripts/email.mjs` (dry run unless `--send`): `confirm` sends the backlog (old `milestone-5`
  rows, rows over the cap); `send <issue>.txt` sends the monthly update, resumable per address via `last_issue`.
  Write issues in `docs-internal/marketing/emails/` (gitignored).
- Env (Netlify + `website/.env.local`): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (required: the
  privacy page says "reply to be deleted"), optional `EMAIL_POSTAL_ADDRESS`, `CONFIRM_DAILY_CAP`.
- Supabase Auth (parked `/auth`): custom SMTP `smtp.resend.com:465`, user `resend`, password = API key.
- Done 2026-11-13: Resend domain verified (region ap-northeast-1; DKIM `resend._domainkey`, CNAMEs `send`/`rsend`,
  DMARC `p=none`, receiving off), keys `tracebug-website` + `supabase-auth`. The Resend account is on a separate
  address; Supabase and Netlify stay as they are (existing project: apply 0007 + 0008 there).

## Rollout

| Step | What | Done when |
|---|---|---|
| 1 | Resend + DNS + env, migrations 0007/0008, test signup end to end, then `email.mjs confirm --send` for the old list | Existing signups got a confirm email; unsubscribe tested |
| 2 | Privacy policy + store data-use answers updated | Live before the extension release |
| 3 | Extension ask at success #2 (audit panel + popup), sources tagged | Ships in the next minor release |
| 4 | 4 weeks of data → keep, move or reword | Entry in `METRICS.md` |

## If we ever want a hard gate

Only together with the paid cloud tier, and only for cloud features (hosted links, team inbox). That needs
an ADR superseding 001's "no accounts" clause, a `/pricing` change, and new store disclosures — decide it then,
on evidence from step 4, not now.
