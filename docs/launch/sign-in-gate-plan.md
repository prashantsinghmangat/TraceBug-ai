# Sign-in gate plan — 3 free audits, then a free account

Status: **approved 2026-11-13 (ADR 009); built on `develop`, uncommitted, unreleased.** Tests: `e2e/ext-audit-gate.e2e.mjs` 22/22. Replaces the soft email ask for Site Audit once built.
Reverses two earlier decisions — "no account in the extension" (`monetization-plan.md`) and ADR 001's
"no accounts, no quotas" — so it needs **ADR 009** before code. Everything stays free; only an email is required.

## Why (owner, 2026-11-13)

The soft ask can be dismissed with one click, so it won't build a list. We need verified addresses of people who
actually audit pages, to learn the user journey and to tell them about Pro. A free account after 3 audits is the trade.

## What the user sees

| Step | Experience |
|---|---|
| Install | Nothing asked. |
| Audits 1–3 | Free, full results. After the 3rd: "That was your last free audit. A free account keeps it going — just your email." |
| 4th audit (popup card, menu or toolbar) | No scan. The popup shows **Sign in to keep auditing**; the toolbar opens `signin.html` (an extension page — never a form on the user's site, where the page's scripts could read it). |
| Sign in | Email → 6-digit code by email → done. No password. Same flow signs in a returning user. |
| After | Unlimited audits, as today. Saved results, re-scan, Copy for AI / Open in Claude all unchanged. |

**What stays free with no account:** bug capture, screenshots, recording, exports, tickets, MCP, the SDK and CLI —
`/pricing` promises local capture, and the store listing is built on it. **Already-run results are never locked:**
a user over the limit still sees their last saved result and can export it; only a *new* scan asks.

## How it works (all free tiers)

| Piece | Choice | Why |
|---|---|---|
| Accounts | **Supabase Auth, email OTP** (6-digit code) | Free plan covers far more monthly users than we have. A code works inside an extension; a magic link would open a web page and lose the extension context. |
| Code emails | Supabase Auth → Resend SMTP (already set up) | Free. **Resend's free plan is 100 emails/day across everything** — codes, confirms, the monthly send. See *Limits*. |
| Calls | Extension → `tracebug.dev/api/ext/otp/start` and `/verify` (new Next routes) → Supabase | One host the extension already talks to; the Supabase keys stay on the server; CORS already handled. No new manifest permission. |
| Counter | `tb_audit_gate_v1` in `chrome.storage.local`: `{ audits, account: { email, userId, verifiedAt } }` | Extension-owned, not readable by sites. Counted where `TB_SUCCESS` kind `audit` already lands (`background.js` `recordSuccess`). |
| Check | Before an audit runs: popup (`btnAuditRun`, menu) and worker (`TB_RUN_AUDIT`, toolbar `TB_LOAD_AXE` path) | One function in the worker answers "may this audit run?". |
| Marketing consent | **Separate, unticked box** at sign-in: "Send me product news and Pro offers (at most one email a month)" | An account email is not permission to market (GDPR, India's DPDP Act, CAN-SPAM opt-out). Signed-in + ticked → added to the update list as confirmed; not ticked → account emails only. |

**Fail open.** If tracebug.dev or Supabase is unreachable, the daily email cap is hit, or the code email fails, the
audit runs anyway and the popup says "Couldn't reach sign-in — this one's on us." A sign-in outage must never break the
product. This also makes the Supabase **keep-alive** (free weekly GitHub Action) required, not optional.

**It's a speed bump, not a lock.** Clearing extension storage resets the count, and the npm SDK has no gate (MIT). That's
fine: the goal is email from honest users, not enforcement. Don't spend effort hardening it.

## Limits to watch

- **Resend free: 100 emails/day in total** — confirm emails (capped by `CONFIRM_DAILY_CAP`, default 30), sign-in
  codes, delete codes and the monthly send share it. Realistically **30–40 sign-ins a day** before codes start
  failing (and the gate fails open). When sign-ins pass ~40/day, move to a paid Resend plan or add a second free
  SMTP provider for Auth only (Brevo's free plan has a higher daily limit — check its current terms).
- Supabase Auth's own email rate limit (per hour, set in the dashboard) must be raised to match.
- Supabase free projects pause after 7 days idle → the keep-alive Action.

## Existing users

Everyone starts at 0 on the update that ships this, so current users get 3 more free audits — no one hits a wall on the
first open after updating. The `WHATS_NEW` card for that release says plainly: "Site Audit now needs a free account after 3 audits."

## Before release (store and legal)

- **ADR 009**: "Free account required for Site Audit after 3 audits" — supersedes ADR 001's "no accounts, no quotas" for
  the audit only; local capture stays account-free.
- **CWS**: listing text (remove any "no account" claim that covers the audit), data-use answers — *Personally identifiable
  information* (email) and *Authentication information*. **AMO**: check the current add-on policies on requiring an
  account and disclose it in the listing; the privacy policy link covers the data.
- **Website**: `/privacy` (account email, what's stored, how to delete the account), `/pricing` (audit: free with an
  account), docs `#audit`, README, blog posts that say "no account".
- **Account deletion**: a "Delete my account" link (email → code → delete) — store policies and privacy law expect it.

## Build steps (when approved)

1. ADR 009 + this plan approved.
2. Website: `/api/ext/otp/start`, `/api/ext/otp/verify`, `/api/ext/account/delete`; marketing-consent row into `email_signups`
   (source `ext-signin`, confirmed). Rate-limit like `notify-me`.
3. Extension: worker gate + counter, popup sign-in card (replaces the soft email ask for audit users), `signin.html` for
   the toolbar path, "Signed in as … · Sign out" in options.
4. Fail-open paths and their messages.
5. e2e: 3 free → blocked → code (mocked) → unlimited; fail-open when the server is down; capture never gated;
   saved results still visible over the limit.
6. Store/legal updates above, then release.

## Decisions for the owner

1. ~~Gate Site Audit only or also capture?~~ **Decided 2026-11-13: Site Audit only.** Capture, screenshots, recording,
   exports, tickets, MCP, SDK and CLI stay account-free.
2. **Decided: 3 audits in total.**
3. **Decided: separate, unticked marketing box.**
4. **Decided: add the free keep-alive Action.**

## Measuring it

Signups by source (`ext-signin`), share who tick marketing, sign-in completion (codes sent vs verified — Supabase Auth logs),
and uninstall-form reasons and store reviews mentioning sign-in. If store rating drops or uninstall reasons cite the gate,
raise the free count before removing the gate.

## As built (2026-11-13)

- Worker: `background.js` `auditPermit` / `readAuditGate`, key `tb_audit_gate_v1` `{ audits, account, graceUntil }`,
  messages `TB_AUDIT_PERMIT`, `TB_OPEN_SIGNIN`; finished audits counted in `recordSuccess`.
- Page: `src/ui/audit-panel.ts` `auditPermit()` before every scan (popup, toolbar, Re-scan, scan bar; 3 s timeout =
  allowed), `showGate` keeps the saved result + export, notes "N free audits left" / "That was your last free audit".
- Bridge: content-script `tracebug-audit-permit-request` → `tracebug-ext-audit-permit`, `tracebug-open-signin`.
- Sign-in page: `tracebug-extension/signin.html` + `signin.js` (email → code; sign out; `?mode=delete`); options card links it.
- Website: `/api/ext/otp/start`, `/api/ext/otp/verify` (`intent: "delete"` deletes the user and their `email_signups` rows),
  `website/lib/ext-auth.ts`; consent row `source: "ext-signin"`, confirmed. Keep-alive: `/api/keepalive` +
  `.github/workflows/keepalive.yml` (Mon + Thu).
- Grace: unreachable sign-in → audits open for 1 hour (`graceUntil`).
- Popup: header person icon (`#acctBtn`, green dot = signed in) → menu with email or "N of 3 free audits left",
  Sign in free / Sign out / Delete account (`popup.js` `initAccount`); the Audit card subtitle shows free audits left.
- Welcome page: optional, skippable "Sign in for Site Audit" card (`welcome.js` `initAccountCard`; skip remembered in
  `tb_welcome_signin_skipped`; hidden when signed in). Privacy chip now "No account to capture".

## Owner setup before release

1. **Done 2026-11-13 (templates + OTP length 6; confirm the rate limit and Netlify env):** Supabase → Authentication → Email Templates: put `{{ .Token }}` in **Magic Link** and **Confirm signup**
   ("Your TraceBug code: {{ .Token }}"), so the email carries a code. Email OTP length 6. Raise the Auth email rate
   limit from 10 to ~30 per hour (it otherwise runs out before Resend's daily 100). Netlify env: `CONFIRM_DAILY_CAP=30`
   (also the code default now).
2. Deploy the website (routes must be live before the extension release), then test a real sign-in from an
   unpacked build: start → code email → verify → audit runs; delete → user gone in Supabase Auth.
3. Keep-alive: GitHub runs scheduled workflows only from the default branch, and `/api/keepalive` must be deployed —
   so after the merge to `main` and the Netlify deploy, run it once from the Actions tab (workflow_dispatch).
4. At the extension release: STORE-LISTINGS *Site Audit sign-in* block; `WHATS_NEW` entry; website copy that says
   "no account" for the whole product → "no account for capture" — README line 40, `components/faq-data.ts` (Is it
   free?), `app/docs/page.tsx` #audit, `components/FinalCTA.tsx`; recaption store slides.

