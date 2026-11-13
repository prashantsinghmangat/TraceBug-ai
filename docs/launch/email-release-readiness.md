# Email flow — release readiness (audit 2026-11-13)

Scope: everything that sends or stores an email address — the popup **email ask**, the SDK 5th-ticket card,
the website forms, `/api/notify-me` → confirm → unsubscribe, the monthly send script, and the Site Audit
**sign-in** (code email through Supabase Auth + Resend). Plans: `email-capture-plan.md`, `sign-in-gate-plan.md`.
Mechanics of a release: `docs/RELEASING.md`; the per-version sheet comes from `node scripts/release-sheet.mjs`.

## Verdict

The code is release-ready (the one broken link, finding 1, is now fixed). The flow is correct on every path I traced:
double opt-in, scanner-safe links, RFC 8058 one-click unsubscribe, unsubscribe beats any old confirm, the
daily cap, `--send` refusing localhost links, and the sign-in failing open. What is **not** ready is the
**release order**: the website must go live first, and today that would also ship unreleased features.

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Fixed 2026-11-13 (uncommitted)** — `components/UpdatesSignup.tsx` on the home page between FAQ and install, source `home` | `https://tracebug.dev/#updates` is the fallback link in the popup ask (`popup.js` ~1476) and in the SDK 5th-ticket card (`src/ui/milestone-ask.ts`, already shipped in 1.12.0). No page has `id="updates"` and the home page has no signup form, so a user whose signup failed lands on the home page with nothing to sign up with. | Website-only: add a signup section with `id="updates"` to the home page (`EmailCapture`, a new source such as `home` added to `ALLOWED_SOURCES` and the component's type). Fixes shipped extensions too; no extension change needed. |
| 2 | **Must decide** | Release order conflict. The sign-in and email routes must be live **before** the extension ships (sign-in-gate-plan *Owner setup* step 2), but the release sheet says merge to `main` only **after** CWS approves. `develop` → `main` today would also deploy `website/public/tracebug-sdk.js` (unreleased SDK, still labelled 1.12.0, to every script-tag user) and the docs page's **Fix with AI** step. | Recommended: a website-only deploy first — a branch from `main` carrying only the email/sign-in files (list below), merged to `main`. Then the normal release, merging `develop` after CWS approval. |
| 3 | Must do at release | "No account" copy across the site contradicts the Site Audit sign-in: `README.md:40`, `components/faq-data.ts:11`, `app/docs/page.tsx:242`, `components/FinalCTA.tsx:25`, `components/Hero.tsx:129` (and `HowItWorks.tsx:17`, `MascotWalker.tsx:31`, fine if read as "for capture"). STORE-LISTINGS *Site Audit sign-in* block has the replacement text. | Change on the release day, with the store text. |
| 4 | Low | After someone unsubscribes, an old confirm email's button still says "You're confirmed" (`/api/confirm` sets `confirmed_at` only on unconfirmed rows; an already-confirmed row is a no-op). They are **not** re-subscribed — only the message is wrong. | Optional: return `s=unsubscribed`-style text when the address's latest unsubscribe is later. |
| 5 | Low | `/api/confirm` and `/api/unsubscribe` don't check the Supabase env like `notify-me` does; with env missing they 500 instead of showing `/email?s=error`. | Optional; only matters if Netlify env is lost. |
| 6 | Low | `scripts/email.mjs` reads `email_signups` / `email_subscribers` without paging: Supabase returns at most 1,000 rows. | Add `.range()` paging before the list passes ~800 addresses. |
| 7 | Low | Popup ask shows "Couldn't reach tracebug.dev" for a 429 (rate limited) too. | Optional wording. |
| 8 | Note | Sign-in with the marketing box ticked stores a row with `confirm_sent_at` set, so it counts toward `CONFIRM_DAILY_CAP` although no email went out. Harmless at today's volume. | — |
| 9 | Note | The keep-alive workflow runs only from `main` and only once `/api/keepalive` is deployed. GitHub disables scheduled workflows after 60 days without commits. | Run it once by hand after the deploy; check the Actions tab monthly. |

Checked and fine: token format (64 hex, unique indexes), `email_subscribers` view is service-role only
(`security_invoker`, revoked from anon), the popup and sign-in page send no cookies (`credentials: "omit"`),
`/email` is `noindex` and `no-referrer`, update emails escape the body, `List-Unsubscribe` + `-Post` headers,
the account delete removes the Auth user **and** every `email_signups` row, privacy page covers the list, Resend
and the account. Website `tsc --noEmit`: clean.

## Website-only deploy (if you take finding 2's recommendation)

Files that belong to the email + sign-in backend, safe before the extension release:
`website/app/api/{notify-me,confirm,unsubscribe,keepalive}/route.ts`, `website/app/api/ext/otp/{start,verify}/route.ts`,
`website/lib/{mailer.mjs,ext-auth.ts}`, `website/app/email/page.tsx`, `website/app/privacy/page.tsx`,
`website/components/EmailCapture.tsx`, `website/components/UpdatesSignup.tsx` + `website/app/page.tsx` (the #updates section), `website/app/blog/[slug]/page.tsx` + `pricing/PricingClient.tsx` (copy only),
`website/scripts/email.mjs`, `website/supabase/migrations/0007*`, `0008*`, `.github/workflows/keepalive.yml`,
**Not** `website/public/tracebug-sdk.js` or `website/app/docs/page.tsx` (Fix with AI).
The privacy text on the sign-in is written conditionally ("when the extension version you use asks…"), so it can go first.

## Before release — what to check

### A. Owner setup (once)
- [ ] Netlify env (production): `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (an inbox you read), `NEXT_PUBLIC_SITE_URL=https://tracebug.dev`
      (or unset), `CONFIRM_DAILY_CAP=30`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Production Supabase: migrations 0007 and 0008 applied (`select confirm_token from email_signups limit 1` works; view `email_subscribers` exists).
- [ ] Supabase Auth: SMTP = Resend (`smtp.resend.com:465`, user `resend`); templates carry `{{ .Token }}`; OTP length 6; email rate limit ~30/hour.
- [ ] Resend: domain verified, sender in `EMAIL_FROM` on that domain; a test email lands in Inbox (not Spam) at Gmail and Outlook.

### B. Website live test (after the website deploy, before the extension)
- [ ] Sign up on `/pricing` with a fresh address → "check your inbox" → one confirm email; its link starts `https://tracebug.dev/api/confirm`.
- [ ] Open the link → `/email` shows **Confirm my email** (nothing changed yet) → click → "You're confirmed"; row has `confirmed_at`.
- [ ] Same address again → "You're already on the list", no second email.
- [ ] `node --env-file=.env.local scripts/email.mjs send <test>.txt` (dry run) shows the right subscriber count and links at https://tracebug.dev.
- [ ] Send one real update to yourself only; Gmail shows its own **Unsubscribe** button; use it → all rows for the address get `unsubscribed_at`; the view drops it.
- [ ] Body link unsubscribe: `/email` shows **Unsubscribe** → click → "You're unsubscribed".
- [ ] A bad token (`/api/confirm?token=abc`) → "That link doesn't work".
- [ ] `https://tracebug.dev/api/keepalive` → `{"ok":true}`; run the keep-alive workflow once from the Actions tab.
- [ ] `https://tracebug.dev/#updates` lands on the signup form (finding 1); a signup there stores source `home`.
- [ ] Sign-in from an **unpacked** build pointed at production: 4th audit → `signin.html` → code email → verify → audit runs; marketing box ticked → confirmed `ext-signin` row; Delete → Auth user and rows gone.
- [ ] Backlog: `scripts/email.mjs confirm` dry run, then `--send --limit` under what is left of today's 100.

### C. Extension release (normal RELEASING.md flow)
- [ ] Version bump, CHANGELOG `[Unreleased]` → version, `WHATS_NEW` entry in `popup.js`, STORE-LISTINGS "New in" + Firefox notes, then `node scripts/release-sheet.mjs`.
- [ ] STORE-LISTINGS: apply the *Email ask* and *Site Audit sign-in* blocks — CWS data-use: tick **Personally identifiable information** and **Authentication information**; description "No account…" line; reviewer note; AMO note.
- [ ] Site copy from finding 3; recaption store slides that say "no account" for the whole product.
- [ ] `node scripts/check.mjs --full` green on the release commit (includes `e2e:email-ask` and `e2e:audit-gate`), then `npm run ext:firefox` by hand.
- [ ] Unpacked smoke: 2nd saved ticket/export → popup card; ✕ → returns at 10; "No thanks" → never; signup → "check your inbox"; offline → fallback link works; signed in for Site Audit → card never shows.
- [ ] Firefox: same popup signup and sign-in (fetch from extension pages to tracebug.dev, no new permission).
- [ ] Permissions diff in the sheet says **none**.

### D. After release
- [ ] `RELEASE_CHECKLIST.md` rows recorded; STATE.md + PROGRESS.md updated.
- [ ] Watch Resend's daily usage the first week (confirms + codes + sends share 100/day).
- [ ] Four weeks on: signups by `source` ÷ weekly users into `METRICS.md` (plan step 4).
