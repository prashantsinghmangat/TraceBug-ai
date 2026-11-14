# TraceBug website: security, privacy, email, UX and codebase audit

Date: 2026-11-13. Scope: `website/` (Next.js 14.2.35 on Netlify, Supabase, Resend), the extension's email and
sign-in surface, the live site https://tracebug.dev, docs and dependencies. This was a read-only audit: no
code was changed, no email was sent, and no account was created. Production saw only GET, HEAD and OPTIONS
requests, plus one unauthenticated `POST /api/upload/init` with an empty body (it returned 401 and wrote nothing).

Confidence labels: **Confirmed** = reproduced live or proven by the code path. **Likely** = the code says so,
but one external setting (Supabase, Resend, Netlify) decides it. **Needs verification** = it depends on
dashboards I have no access to.

> **Status 2026-11-13 (after the audit):** the P0 fixes are written on `develop`, uncommitted and **not deployed**:
> - **SEC-01:** `website/lib/flags.ts` plus `middleware.ts` 404 every cloud route, including `/share/*` and
>   `/auth/callback`.
> - **SEC-02:** `auth/callback` resolves the URL and then requires the same origin.
> - **SEC-03:**
>   - the OTP routes refuse web-page origins and echo CORS only to extension origins;
>   - a DB send log (migration `0009_otp_send_log.sql`) caps each address at 3 per hour and all sends at
>     `OTP_DAILY_CAP` per day (default 50; over it the route answers 503 and the extension fails open);
>   - the IP fallback uses the last `x-forwarded-for` entry.
>
> Verified: local 404s, origin and CORS checks, the budget logic against a fake PostgREST server, the redirect
> payloads, and `check.mjs`.
>
> **Owner steps:** apply migration 0009 (until then the limiter allows everything and logs it), deploy, then
> re-probe the live redirect.
>
> **2026-11-14:** P0 is deployed (commit `e7c9e59` on `main`), migration 0009 is applied, and a live re-probe passed:
> - the redirect and the cloud routes return 404;
> - the OTP routes return 403 to web origins and send CORS headers only to extensions.
>
> **P1, written on `develop` (uncommitted, not deployed):**
> - **POL-01:** Firefox `data_collection_permissions` gets optional `personallyIdentifyingInfo` and
>   `technicalAndInteraction`, requested at the first send (`signin.js`, `popup.js`).
> - **Privacy page:** no more "nothing goes to TraceBug". It adds Netlify, the Product Hunt badge, the "someone
>   typed your address" case, a delete path that exists and the private contact `hello@tracebug.dev`.
> - **Pricing:** no "forever" promise.
> - **Email:**
>   - the sign-in template drops `{{ .ConfirmationURL }}`;
>   - the confirm email no longer says "nothing more will be sent";
>   - `email.mjs send` refuses to run without `EMAIL_POSTAL_ADDRESS`;
>   - `notify-me` returns `queued` when the confirm email is held back;
>   - the site form and the popup handle 429 and `queued`.
> - **SEC-06:** a per-address wrong-code lockout (5 per hour, migration 0010 `otp_fail_log`), and `verify` now
>   revokes the throwaway Supabase session.
> - **SEC-04:** migration 0010 drops the insert/update policies on the parked `sessions`, `ai_analyses` and
>   storage `reports` tables.
> - **STORE-LISTINGS:** the AMO wording and the Firefox data-collection items are added to the release list.
>
> **Not done, deliberately:**
> - **POL-03** (remove the optional `<all_urls>`): the e2e suites pre-grant it, so it needs its own change.
> - **SEC-09** (the SDK milestone card gets a 403 from customer origins): it degrades to a sign-up link.
> - Re-confirm limits for unsubscribed addresses (Low).
>
> **Owner steps for P1:**
> - apply migration 0010;
> - paste the updated `sign-in-code.html` into **both** Supabase templates;
> - set `EMAIL_POSTAL_ADDRESS` locally before the next monthly send;
> - make `hello@tracebug.dev` receive mail (the apex has no MX: add forwarding);
> - DMARC: add `rua=mailto:…`;
> - Resend: confirm the `send.` domain shows Verified.

---

## 1. Executive summary

**Correction to `docs/launch/STATE.md`.** It says the email list and the sign-in routes are "not on `main` / not
deployed". That is no longer true. `origin/main` is `79849c5 Merge develop: email double opt-in, Site Audit sign-in
gate…`. tracebug.dev serves `/email`, `/api/confirm`, `/api/unsubscribe`, `/api/keepalive` and
`/api/ext/otp/start|verify`. The **extension** side of the sign-in gate is not in any store release yet (1.12.0
predates it). So every server-side finding below is **live today**.

There is no Critical finding. No secret is exposed:

- git history across all branches has only placeholder values in `.env.example` files;
- every secret env var is server-only;
- no client component imports a server module.

RLS is on for every table, the email view is revoked from `anon` and `authenticated`, and there are no
`SECURITY DEFINER` functions.

What needs action, in order:

1. **The parked cloud-sharing APIs are still deployed and not feature-flagged** (`/api/upload/*`,
   `/api/sessions*`, `/api/share/*`, `/api/ai/diagnose`). Only the pages (`/auth`, `/dashboard`) are 404-gated.
   Supabase sign-ups must be on for the new OTP route (`shouldCreateUser: true`). So anyone with the public anon key
   can probably get a session and use these routes:
   - host arbitrary HTML/JS at `tracebug.dev/share/<token>`, which can be framed anywhere (phishing on your
     domain, Safe Browsing risk);
   - burn Anthropic credit through `/api/ai/diagnose`, if `ANTHROPIC_API_KEY` is set in Netlify.

   **High, Likely.**
2. **Open redirect, live.** `https://tracebug.dev/auth/callback?next=/%5Cexample.com` → `307 Location: https://example.com/`.
   **Medium, Confirmed.**
3. **The OTP start endpoint can send email and create accounts for any address.** It has CORS `*`, no captcha,
   only an in-memory per-IP limit, and `shouldCreateUser: true`. That allows email bombing, uses up the Resend daily
   quota shared with confirm emails, and puts the sender's reputation at risk. **Medium, Likely.**
4. **Store, privacy and marketing text says the opposite of the new account and email features**:
   - Firefox `data_collection_permissions: required ["none"]`;
   - "Nothing goes to TraceBug";
   - "No account";
   - "Free forever".

   This is the top **policy** risk for the next extension release. **High (policy) at release, Confirmed.**

Everything else is Medium or below: hardening, UX and cleanup. The product's core claim holds: bug capture is
local. The site has no analytics and no tracking cookies. The only third-party request on every page is the
Product Hunt badge image.

**Production readiness:** the marketing site and the email list are acceptable once P0 items 1–3 are fixed. They
are small changes. **Do not ship the extension's sign-in gate** until the P1 policy and copy items are done.

### Safe containment you can do now (no code change)

- Netlify → Environment: if `ANTHROPIC_API_KEY` is set, remove it. `/api/ai/diagnose` has no caller in the product,
  so nothing breaks.
- Supabase → Storage → bucket `reports`: set a file-size limit and allowed MIME types, or make the bucket reject
  uploads. Supabase → Auth: turn on captcha protection only **after** the route passes a `captchaToken`; it breaks
  sign-in otherwise.
- Resend → check today's sending volume for unexpected `Your TraceBug sign-in code` sends.

---

## 2. Security risk register

| ID | Sev | Conf | Location | Problem → fix | Effort | Pri |
|---|---|---|---|---|---|---|
| SEC-01 | High | Likely | `app/api/upload/init/route.ts:15`, `upload/complete`, `sessions/*`, `share/[token]`, `ai/diagnose/route.ts:39`; flag only in `app/auth/page.tsx:9`, `app/dashboard/page.tsx:8` | Cloud APIs live and accept any Supabase user; sign-ups are on because of `ext/otp/start/route.ts:22` `shouldCreateUser:true`. Attack: anon key → `signInWithOtp` to own mailbox → session cookie → upload HTML → `/share/<token>` (srcDoc `sandbox="allow-scripts"`, `frame-ancestors *`): a fake login form plus `fetch` exfiltration works inside the sandbox. **Fix:** one shared `PHASE2_CLOUD_LIVE` module; return 404 from all cloud routes (or in `middleware.ts`) while false; remove the Anthropic key. | S | P0 |
| SEC-02 | Medium | **Confirmed live** | `app/auth/callback/route.ts:14-24` | `startsWith("/") && !startsWith("//")` misses `/\host` and `/\t/host`. No `code` needed. **Fix:** `const u = new URL(next, req.url); if (u.origin !== new URL(req.url).origin) next = "/"`; redirect to `u.pathname + u.search`. The route could also 404 while cloud is off. | XS | P0 |
| SEC-03 | Medium | Likely | `app/api/ext/otp/start/route.ts:19-22`, `lib/ext-auth.ts:11` (`Access-Control-Allow-Origin: *`), `:41` in-memory limit | Any page or script triggers code emails and `auth.users` rows for arbitrary addresses. Limited only by Supabase's ~60 s/address and its project hourly cap. **Fix:** DB-backed per-email (e.g. 3/h) and per-IP limits; CORS limited to your Chrome and Firefox extension IDs; Supabase captcha (Turnstile) with `captchaToken`; purge never-verified users daily. | M | P0 |
| SEC-04 | Medium | Confirmed (code) | `supabase/migrations/0001_initial.sql` policies `sessions_update_own` / insert | `authenticated` can write any column through PostgREST: `expires_at`, `uploaded`, `share_token`, `storage_key`. A forged `storage_key` is then signed with the service role in `share/[token]/page.tsx:57` (cross-user read), and `cron/purge-expired` deletes it. It needs the victim's UUIDs, so the cross-user part is unlikely. Quota bypass is easy. **Fix:** `REVOKE INSERT, UPDATE ON public.sessions FROM authenticated; GRANT UPDATE (deleted_at)`; server-side writes only; check `storage_key = user_id||'/'||id||'.html'`. Moot if SEC-01 404s the feature. | S | P1 |
| SEC-05 | Low | Confirmed / NV | `lib/ext-auth.ts:43`, `notify-me/route.ts:171-184` | Rate limits are per warm instance, `ipHits.clear()` at 5000 keys resets them all, and there is a fallback to client-sent `x-forwarded-for`. **Fix:** use only `x-nf-client-connection-ip`; keep the limits that matter in Postgres. | S | P1 |
| SEC-06 | Low | Likely | `ext/otp/verify/route.ts:28` | Every Supabase Auth call comes from Netlify's IPs, so Supabase's per-IP OTP/verify limits are global: one abuser can lock out all users. Note the extension fails open, so the impact is mostly on the gate. **Fix:** DB-backed per-email wrong-code counter (lock after 5). | S | P1 |
| SEC-07 | Low | Confirmed | `middleware.ts:41`, `corsHeaders()` | Credentialed CORS for **any** `chrome-extension://`/`moz-extension://`, and the CSRF allowlist exempts all extensions. Exposure is small (SameSite=Lax; `/api/me` is the main leak). **Fix:** allow only your own extension IDs (env var). | XS | P2 |
| SEC-08 | Low | Confirmed | `detail: error.message` in `sessions/route.ts:42`, `sessions/[id]/route.ts:31`, `extend/route.ts:41`, `upload/init/route.ts:101,135`, `share/[token]/route.ts:28`, `notify-me/route.ts:116`, `cron/purge-expired/route.ts:40,48`; `ai/diagnose/route.ts:52,106` | Leaks DB/schema and provider errors (`notify-me` is unauthenticated). **Fix:** log the detail server-side; return the code only. | XS | P2 |
| SEC-09 | Low | Confirmed | `middleware.ts:14` `ALLOWED_API_PREFIXES` | The Origin check misses `/api/ai`, `/api/ext`, `/api/confirm`, `/api/unsubscribe` and `/api/cron`. Only `ai/diagnose` uses cookies (Lax), so this is low. Also, `/api/notify-me` *is* covered, which rejects SDK milestone-card posts from customer origins: this contradicts `notify-me/route.ts:26`. Probable functional bug. **Fix:** invert the logic (check every mutating `/api/*` except a short explicit list) and decide what `notify-me` should accept. | S | P2 |
| SEC-10 | Medium | Confirmed (advisory) | `website/package.json` `next 14.2.35` | `npm audit`: 1 critical and 1 high (postcss, build-only). The image optimizer, Server Actions, rewrites and i18n advisories are **not reachable** (`images.unoptimized`, no `"use server"`, no rewrites). RSC deserialization/DoS and the middleware cache-poisoning advisories plausibly are. **Fix:** plan Next 15.5.x as its own change; already listed as an accepted gap in STATE. | L | P2 |
| SEC-11 | Low | Confirmed | `next.config.js` headers | No site-wide CSP. `X-XSS-Protection: 1; mode=block` is obsolete (set `0` or drop it). `X-Frame-Options: ALLOWALL` is an invalid value (harmless; `frame-ancestors *` rules). HSTS is `max-age=31536000` without `includeSubDomains`. There is no user-controlled HTML sink on the main origin, so CSP is defence-in-depth. Add `Content-Security-Policy-Report-Only` first, then enforce. Inline theme and JSON-LD scripts need hashes, not `unsafe-inline`. | M | P3 |
| SEC-12 | Info | Confirmed | `.gitignore` | Covers `.env`, `.env.local`, `.env.*.local`, but a plain `.env.production` would be committed. Use `.env*` + `!.env.example`. | XS | P3 |

**Checked, no issue found:**

- **IDOR on `sessions/[id]`, `extend`, `upload/complete`:** they use the user's own client, `.eq("user_id", user.id)` and RLS.
- **Share tokens:** 96-bit `randomBytes(12)`; responses omit `storage_key`.
- **Share iframe:** `sandbox="allow-scripts"`, no `allow-same-origin`. Titles are rendered as React text.
- **`sdk-bridge`:** checks the postMessage origin allowlist, fails closed, and replies to the validated origin.
- **`dangerouslySetInnerHTML`:** only on repo-authored content (blog, changelog, JSON-LD).
- **Cron secret:** `timingSafeEqual`, POST only.
- **`keepalive`:** returns only a head count and `{ok}`.
- **Confirm and unsubscribe:** GET is side-effect free; POST requires a 64-hex token.
- **`/bye`:** `v` is regex-checked.
- **Secrets:**
  - `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `CRON_SECRET` are server-only.
  - `NEXT_PUBLIC_*` holds only the URL, the anon key and the allowed origins.
- **HTTP:** redirects to HTTPS with a 301.
- **`/api/me` live:** 401 with `no-cache`; private 404s are `no-store`.

---

## 3. Email and OTP flow audit

### 3.1 Marketing list (live)

**The happy path:**

```
popup ask (after 2nd ticket/export) / website form / SDK milestone card
 → client regex → POST /api/notify-me (credentials omitted)
 → server: regex, ≤254, source allowlist
 → limits: per-IP 5/10 min (memory) · per-address 5 rows/24 h (DB) · 1 confirm/10 min/address (DB)
           · global CONFIRM_DAILY_CAP=30/24 h (DB)
 → insert email_signups (DB-generated 64-hex confirm + unsubscribe tokens)
 → Resend confirm mail
 → GET /api/confirm → /email?s=confirm&token=… (no-referrer) → button POST → confirmed_at
 → member = view email_subscribers
 → monthly: hand-run scripts/email.mjs send (List-Unsubscribe + RFC 8058 Post)
 → unsubscribe POST → unsubscribed_at on all rows for that address
```

**Failure paths:**

| What happens | What the user sees |
|---|---|
| Invalid email | 400 |
| Rate limit (429) | Popup: "Couldn't reach tracebug.dev"; site: "Something went wrong" (misleading) |
| Daily cap hit, Resend fails, or a confirm went out in the last 10 min | 200 "pending": "Check your inbox", but no email until someone runs `email.mjs confirm` by hand (misleading) |
| Already subscribed | "Already on the list" |
| Bad or expired token | "That link doesn't work" |

### 3.2 Site Audit sign-in (server live; extension side unreleased)

**The happy path:**

```
4th audit (background.js:2222) / popup account menu / welcome card → signin.html
 → client regex → POST /api/ext/otp/start (CORS *, per-IP 6/15 min in memory)
 → Supabase signInWithOtp(shouldCreateUser:true) → Supabase SMTP (Resend) → 6-digit code
 → POST /verify (per-IP 12/15 min in memory) → verifyOtp → {email,userId}
   (+ confirmed email_signups row only if the unticked box was ticked)
 → extension chrome.storage.local tb_audit_gate_v1.account → "You're signed in · Re-scan"
 delete: same with ?mode=delete → admin deleteUser + delete email_signups rows
```

**Failure paths:**

| What happens | What the user sees |
|---|---|
| Invalid email | 400 |
| Asking again within ~60 s | 429 `too_soon` ("ask again in N s") |
| Wrong or expired code | 400: one message for both |
| Too many attempts | 429 "Too many tries" |
| Network error or 503 | Gate **fails open** for 1 h (`signin.js:69-73`) |
| Verify succeeds but the storage write fails | Silent: the button re-enables with no message |

### 3.3 Security assessment

| Check | Result |
|---|---|
| OTP randomness, length, expiry, single use | Supabase-generated. Length 6 set in the dashboard per the plan; the route accepts `\d{6,10}`. Expiry value **needs dashboard** |
| Verify attempt limit | Only in-memory per-IP 12/15 min. No per-email/per-code counter. Supabase limits are effectively global (SEC-06). Brute force is impractical (10⁶) |
| Resend limit | Client 30 s, Supabase ~60 s: the first resend usually fails (UX-E3) |
| Enumeration | OTP start/verify: same response for new and existing users. `notify-me` returns `subscribed` vs `pending` (Low, documented as accepted) |
| Tokens in the extension | No access or refresh token reaches the extension. It stores only `{email,userId,verifiedAt}` in `chrome.storage.local`; the content script exposes only `allowed/signedIn/remaining`. Nothing goes to page `localStorage`. Good |
| Server session | `verifyOtp` creates a Supabase session that is never revoked, so orphan sessions pile up (Info). Fix: admin `signOut` after verify |
| Confirm/unsubscribe tokens | 64-hex, DB-random, **plaintext at rest, no expiry**. Acceptable for a low-value list; expire confirm tokens after 30 days |
| Logs | Routes don't log addresses or codes. `mailer.mjs:42` logs the Resend error body, which may echo the address (NV) |
| Unsolicited mail | `notify-me`: ≤5 confirms per victim per day, 30 per day globally; it re-confirms addresses that unsubscribed. `otp/start`: SEC-03 |
| Mail-scanner link consumption | `supabase/email-templates/sign-in-code.html:21` includes `{{ .ConfirmationURL }}`. Link scanners (Outlook Safe Links, etc.) may GET it and consume the token, so the 6-digit code then fails. **Medium, Likely.** Remove the link: website sign-in is parked anyway |

### 3.4 Deliverability: checked live with `nslookup` against 8.8.8.8

| Record | Observed | Assessment |
|---|---|---|
| `send.tracebug.dev` | **CNAME → `send.forge.rmta.net`**; resolves MX `feedback.forge.rmta.net` and SPF `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all` | This is not Resend's usual MX/TXT pair (`feedback-smtp.<region>.amazonses.com`, `include:amazonses.com`). `rmta.net` is hosted on AWS DNS. **Needs verification:** confirm in Resend → Domains that tracebug.dev shows *Verified* and that these are the records Resend asked for. If not, find out who controls `forge.rmta.net` |
| `resend._domainkey` | DKIM public key present | OK |
| `_dmarc` | `v=DMARC1; p=none;` with **no `rua`** | Mail passes, but you get no reports and spoofing is not blocked. Add `rua=mailto:…`; move to `p=quarantine` after 2–4 weeks of clean reports. Gmail/Yahoo bulk-sender rules need DMARC present (met) |
| Apex `tracebug.dev` | No SPF, no MX | Fine if nothing sends From the apex. But replies to `@tracebug.dev` bounce. Set `EMAIL_REPLY_TO` to a working mailbox (NV), or add MX/forwarding |

**Code-side compliance:**

- List-Unsubscribe and List-Unsubscribe-Post are present on the monthly mail.
- Confirm mail is transactional, so no list headers is fine.
- Consent is recorded: `created_at`, `source`, `confirmed_at`. No IP is stored. No version of the consent text is kept.
- **The postal address is optional** (`mailer.mjs:128`): `email.mjs send` should refuse to send when `EMAIL_POSTAL_ADDRESS` is empty (CAN-SPAM).
- **No bounce or complaint handling** in code; it relies on Resend's account suppression (NV).
- **Quota:** Resend free (100/day) is shared by confirm emails, sign-in codes and the monthly send. One OTP flood blocks all three.

**What I could not verify:**

- Supabase: OTP expiry, Auth email rate, captcha.
- Resend: domain status, suppression list, open/click tracking.
- Netlify: env values, log retention, `x-nf-client-connection-ip` guarantees.

### 3.5 Journey UX (the 13 cases)

| Case | Result |
|---|---|
| First-time / existing user | Email → code → done. Identical, clear, mentions spam folder |
| Invalid email | Caught client-side. A typo'd domain fails silently; the user must click "Use a different email" |
| Incorrect / expired code | Same message for both; recoverable. Name "expired" separately |
| Resend / multiple resends | 30 s client vs 60 s server, so the first resend errors. Only the newest code works (stated) |
| Delayed / never received | Only resend or change email; no help link |
| Close and return | **State lost; no "I already have a code" path**, and re-entering the email within 60 s gives `too_soon`. Fix: keep `{email,sentAt}` in `chrome.storage.session` and reopen on the code step |
| Network failure | Fails open for 1 h with a clear message. Good |
| Already registered | Same flow (no separate sign-up). Good |
| Verify ok, session/storage fails | Unhandled rejection, no message (rare) |
| Delete when not signed in on this browser | Needs a sign-in code, then a delete code. Options links only to `signin.html`; the privacy page names a path that doesn't exist |

**Simplest secure flow:**

1. The gate panel opens inline: email field plus a separate unticked updates box.
2. Paste-friendly 6-digit field; resend at 60 s.
3. On success, **the requested audit starts automatically**.
4. Server: DB per-email limit, captcha, no magic link in the mail.

---

## 4. Personal data inventory

| Data | Origin | Stored | Sent to | Retention | User can delete | Necessary |
|---|---|---|---|---|---|---|
| Bug reports, screenshots, recordings, audits | Extension/SDK | Browser only (`chrome.storage`, IndexedDB, exported `.html`) | Only where the user sends them (GitHub/Linear/Slack/own AI key) | User-controlled | Yes | Yes |
| Email (list) | Forms, popup | Supabase `email_signups` | Resend | **Forever, incl. unconfirmed rows** | Unsubscribe; account delete; no self-serve list delete | Yes |
| User-agent, referrer | Request headers | `email_signups` | none | Forever | As above | Questionable: drop or truncate |
| Usage counts | Popup opt-in | `email_signups.usage` | none | Forever | As above | Opt-in, OK |
| Email + user id (account) | Sign-in | Supabase `auth.users`; extension `chrome.storage.local` | Resend (code mail) | Until deleted | Yes | Yes (ADR 009) |
| Supabase sessions | `verifyOtp` | `auth.sessions` (orphaned) | none | Until expiry | Cascades on delete | **No** |
| IP address | Every request | Netlify logs; in-memory limiter | Netlify | Netlify policy (NV) | No | Logs only |
| IP + referrer | Product Hunt badge image, every page | Product Hunt | Product Hunt | Unknown | No | **No** (self-host it) |
| Feedback text (+ optional email) | `/feedback` | Netlify Forms | Netlify | Netlify | Ask | Yes, but not named in the privacy policy |
| Extension version on uninstall | `/bye?v=` | Netlify logs | Netlify | Netlify | n/a | OK |
| Cookies | None set by the site (no analytics; Supabase cookies only if cloud auth existed) | — | — | — | — | — |

No emails or codes appear in URLs. Tokens appear in URLs by design, and the `/email` page sends no referrer.

---

## 5. Privacy and encryption assessment

- **In transit:** HTTPS everywhere, with HSTS on 1 year. Supabase and Resend APIs use TLS. **Confirmed.**
- **At rest:** Supabase Postgres and Storage run on AWS with provider-managed disk encryption. This is the
  provider's general claim; I did **not** verify the project's configuration. The audit makes no app-level
  encryption claim, and none is needed. Confirm and unsubscribe tokens are stored in plaintext (low value).
  Website sign-in has no passwords.
- **Key management:** server env vars in Netlify. No rotation policy is documented (NV).
- **Retention:** none defined for unconfirmed signups or orphan auth users. Proposal: purge unconfirmed rows after
  90 days and never-verified auth users after 7 days, using the existing cron pattern.
- **Access:** service role used only server-side. RLS denies `anon` and `authenticated` on `email_signups`.

**Where the claims and the code disagree (Confirmed):**

| Where | Claim | Reality |
|---|---|---|
| `website/app/privacy/page.tsx:7` (meta description), `:32`, `:180-181` | "Nothing goes to TraceBug" / "none of them goes to TraceBug" | The same page then describes the email list, the account and `/bye` |
| `privacy/page.tsx:257` | Delete path "Options → Site Audit account → Delete my account" | That path does not exist in `options.html` |
| `/privacy` | — | Contact is public GitHub issues only. With accounts, there needs to be a **private** privacy/deletion contact |
| `/privacy` | — | Does not mention Netlify Forms, Netlify logs, the Product Hunt badge, retention periods, or that a third party can create an account for your address |
| Hero and final CTA ("No account · Works offline · Zero telemetry", "Free, no account"); `components/faq-data.ts:11,15,27`; footer "zero backend"; `llms.txt`; `README.md:40`; `website/lib/blog.ts:45,97` (Site Audit post: "needs no account"); `app/compare/[slug]/page.tsx:107` ("No account, ever"); `docs/getting-started.md:3` | No account, no backend, no telemetry | Becomes false when the gate ships. "No backend" is already inaccurate for the website |
| `mailer.mjs:116` (confirm mail) | "Nothing more will be sent to this address" | Further sign-ups and the backlog run do send more |
| `/pricing` | "Free forever… won't change" | Conflicts with the decided "no forever promise" (monetization memo) |

---

## 6. Policy and provider compliance

| ID | Sev | Conf | Finding | Recommendation |
|---|---|---|---|---|
| POL-01 | High (at gate release) | Confirmed | `tracebug-extension/build/build-ext.mjs:175` declares Firefox `data_collection_permissions: { required: ["none"] }`, but the popup email ask and sign-in send an email (PII) to tracebug.dev. AMO requires this to be accurate | Declare `optional: ["personallyIdentifyingInfo", …]` and request it at the point of use, **or** `required` if gating. Re-read the AMO policy before release. Update ADR 009 and `STORE-LISTINGS.md` (AMO copy `:237,:251`, reviewer note `:321` are not on the change list at `:184-196`). Also fix the stale "min_version 115" comment at `:173` |
| POL-02 | High (at release) | Confirmed | CWS/AMO listing text "No account, no upload, nothing goes to TraceBug" (`STORE-LISTINGS.md:56,114,237,251`) | Ship the drafted replacement copy and the CWS data-use answers (email = "Personally identifiable information", purpose = account) in the same release |
| POL-03 | Medium | Confirmed | `optional_host_permissions` includes `<all_urls>` with no justification; `STORE-LISTINGS.md:156` says "never for all sites". Code only checks it to revoke a legacy grant (`options.js:440`) | Remove it from `manifest.base.json` and the dev manifest, if the revoke path still works through `permissions.remove`. CLAUDE.md allows removal |
| POL-04 | Medium | Likely | `/compare/jam-alternative` says Jam is "a paid cloud product" and "built for a human dashboard". Jam has a free plan and its own MCP server | Fact-check all compare pages; add an "as of <date>; trademarks belong to their owners" footer |
| POL-05 | Medium | Confirmed | Privacy policy has no private contact or Limited Use statement | Add a privacy email and the CWS Limited Use sentence |
| POL-06 | Low | Likely | axe-core (MPL-2.0) is shipped minified with its header only (`build-ext.mjs:194-195`) | Add `THIRD_PARTY_NOTICES` with the licence and source URL |
| POL-07 | Low | Confirmed | Legacy cloud-account UI still shipped, commented out (`popup.js:251-303,350`, `popup.html:92-124`) | Remove it before the gate release to avoid reviewer questions about `/api/me` with credentials |
| POL-08 | Low | Likely | `web_accessible_resources` for `<all_urls>` lets sites detect the extension | Add `use_dynamic_url: true` (Chrome); check whether `player.*` must be web-accessible |
| POL-09 | Medium | Likely | Email provider risk: SEC-03 abuse, plus a shared 100/day quota, plus no bounce webhook | Fix SEC-03; watch Resend complaint and bounce rates; consider a separate SMTP for Supabase Auth |

**Verified as fine:**

- No remote code: axe 4.11.4 is packaged, there is no eval, and the extension CSP is `script-src 'self'`.
- Store links resolve to the right listings: CWS 1.12.0, AMO 1.12.0, npm `tracebug` and `tracebug-sdk` 1.12.0.
- Compare pages use no competitor logos.

---

## 7. User journeys and click counts (live site)

| Journey | Start → outcome | Clicks | Forms | Issues |
|---|---|---|---|---|
| Understand the product | Hero | 0 | 0 | The H1 "Capture the bug. Let AI fix it." is clear. The hero is crowded: 2 store buttons, MCP, a PH badge, demo, trust line, 2 logo rows and an animation |
| Install on Chrome | Hero/nav → CWS | 1 | 0 | Good |
| Install on Firefox | Hero (UA-detected primary) → AMO | 1 | 0 | Good. The store names differ between CWS and AMO |
| MCP setup | Nav "AI agents" → `/#mcp` copy box | 1–2 | 0 | Good; also `/docs/mcp/claude-code`, `/cursor` |
| Site Audit docs | Docs → `#audit` | 2 | 0 | Audit has no nav or footer entry; the full guide is on GitHub |
| Pricing | Nav → `/pricing` | 1 | 0 | "Free forever" claim; doesn't mention the 3-audit account |
| Contact/support | Footer → `/feedback` or GitHub | 1–2 | 1 | `/feedback` is blank without JavaScript (`Suspense fallback={null}`). No private contact |
| Email updates | Home `#updates` or `/pricing` | 0–1 | 1 | Two forms with two promises ("Design Tokens…" vs "when cloud sharing ships", and cloud is parked) |
| Site Audit access (after gate ships) | 4th audit → sign-in tab → email → code → back → re-scan | ~4 + 2 fields | 2 | Opens a separate tab, and the audit does not auto-resume |

**Dead ends and broken links:**

- No broken links.
- `/compare` (the hub) is 404; only the slugs exist.
- `/sdk-bridge` returns 200 with `index, follow` and the home page's title.
- 404 pages emit both `noindex` and `index, follow`.

---

## 8. UX and conversion gap analysis

| ID | Sev | Finding | Fix | Effort |
|---|---|---|---|---|
| UX-01 | Medium | Inputs drop the focus outline (`focus:outline-none`) and use only a faint border or ring: `components/EmailCapture.tsx:64`, `app/bye/ByeForm.tsx:180,196`, `app/feedback/FeedbackForm.tsx:179,192` | Use `focus-visible:ring-2 ring-primary`, or drop `outline-none` (the global `:focus-visible` in `globals.css:112` is good) | XS |
| UX-02 | Low | No skip link; `<nav>` and `<footer>` sit inside `<main>` (`app/page.tsx:22-35` and other pages) | Put a header, main and footer in the layout, plus a skip link | S |
| UX-03 | Low | Mobile menu (`components/Navbar.tsx:80-110`) has no `aria-controls`, no Escape close and no focus return; it leaves out GitHub | Add them | XS |
| UX-04 | Low | `/feedback` is empty without JS | Render the H1, intro and a fallback link outside Suspense | XS |
| UX-05 | Low | Home page repeats the MCP pitch about 6 times; "How it works" duplicates the MCP steps; the final CTA repeats the hero | Merge "How it works" with `#mcp`; keep one MCP block | S |
| UX-06 | Low | Site Audit (headline 1.12 feature) is hard to find | Add a nav or footer "Audit" link and one line in the hero | XS |
| UX-07 | Low | Two email lists with different promises | One list, one promise | XS |
| UX-08 | Low | Email-flow UX: misleading 429 and daily-cap messages; resend timer 30 s vs 60 s; no resume with an existing code; delete path | See §3.5 | S |
| UX-09 | Low | `/sdk-bridge` indexable; conflicting robots meta on 404s | Set `robots:{index:false}`, or 404 while cloud is off | XS |

**Measurement:** no analytics exists, so I report **no conversion rates**. A cookie-free way to measure the funnel:

- Netlify log-based analytics, or a counter that increments `count[path][day]`.
- First-party `/go/chrome` and `/go/firefox` 302 redirects that count per-button IDs and store no IP or user-agent.
- Store dashboards for installs and uninstalls, plus `/bye` hits.
- npm download API.
- `email_signups` row counts for start, confirm and unsubscribe.
- Outcome counters in the OTP routes: sent, rate-limited, verified, bad_code, send_failed.

Do **not** add extension-side audit telemetry; it would break "zero telemetry".

---

## 9. Performance and bundle weight

- `website/.next` comes from `next dev`, so I took **no production bundle numbers**. Get real numbers with
  `next build` after stopping the dev server (see the memory note on the dev server and build colliding).
- No third-party scripts. Fonts are self-hosted through `next/font` (Space Grotesk, JetBrains Mono). YouTube is
  click-to-load `youtube-nocookie`.
- **Client JS on every page:** `MascotWalker` (248 lines) and `ConsoleEgg` mount in the layout. Lazy-load
  MascotWalker with `next/dynamic` and `ssr:false`.
- **Large client components that could be split** into a server shell plus a small client part:
  `ReportShowcase.tsx` (342 lines), `FeatureTabs.tsx` (341), and `FAQ.tsx` (it pulls `Testimonials` into the
  client bundle).
- **`/changelog` HTML is 921 KB.** Collapse or paginate older versions. This is the largest measurable page-weight
  issue.
- **`public/` holds 9.1 MB**, but most is not on the home page:
  - `tracebug-sdk.js` (3.7 MB, generated) and `html2canvas.min.js` (199 KB) load only on `try.html`.
  - `tracebug-demo.webm` (1.2 MB) is kept on purpose for URL stability.
  - Blog hero PNGs are 457–518 KB each. Converting to WebP saves about 1.5 MB on blog pages.
- **Root SDK:** ADR 005 holds (only `rrweb`, `html2canvas`, `axe-core`). `npm audit` shows 3 transitive high
  (`rrweb-snapshot → postcss → nanoid`, `source-map-js`), which are not realistically reachable. A non-major fix
  is available through a lockfile refresh.

---

## 10. Unnecessary files and dependencies inventory

For every candidate, "refs" means the `rg` search across `website/app`, `website/components`, `website/lib`,
`website/scripts`, `src/` and `tracebug-extension/`. All candidates are hand-maintained.

| Path | Why | Reference evidence | Breakage risk |
|---|---|---|---|
| `website` dep `geist` | Unused; fonts are `next/font/google` (`app/layout.tsx:2`) | Only package.json mentions it | None |
| `website/components/Icons.tsx` (359 lines) | No importer | 0 refs to `Icons` | None |
| `website/components/Mascot.tsx` | Superseded by `PageMascot` | 0 refs | None |
| `website/components/ui/badge.tsx`, `ui/card.tsx` | No importer | 0 refs | None |
| `website/lib/links.ts` `DEMO_SHORT_URL` | Unused export | Only its own file | None |
| `website/public/avatars/avatar-1.png`, `avatar-5.png` | Testimonials use avatars 2–4 | 0 refs | Public URL: low |
| `website/app/api/ai/diagnose/route.ts` + `lib/anthropic.ts` (+ deps `@anthropic-ai/sdk`, `zod`) | No caller in the SDK, extension or site; cost surface. `lib/anthropic.ts:4` comment is false | 0 callers of `/api/ai/diagnose` | Low. Product decision: part of parked "Phase 2" |
| Parked cloud stack: `app/{auth,dashboard,share,sdk-bridge}`, `api/{sessions,upload,share,cron/purge-expired,auth/signout}`, `lib/{storage,quotas,share-token,types,supabase-browser}`, SDK `src/auth/iframe-bridge.ts`, `src/exporters/share-link.ts`, public `signIn/shareReport/...` in `src/index.ts` | Unreachable from the UI | 404-gated pages; extension blocks commented out | **Keep `/api/me` and `lib/quotas.ts`** (sdk-bridge reads them). Removing the SDK methods is a semver change. Recommend **404-gating now (SEC-01)** and deciding deletion separately |
| `popup.js:251-303`, `popup.html:92-124`, `src/ui/quick-bug.ts` (12 `PHASE2-CLOUD` blocks) | Commented-out legacy cloud UI | Not executed | None |

No deletions were made.

## 11. Documentation cleanup

**Fix (inaccurate):**

- `ARCHITECTURE.md`: no Site Audit, ADR 009 account or 12 MCP tools. It is the first file agents read.
- `docs/launch/PLAN.md`: a closed 1.11 plan that CLAUDE.md describes as "what's left", which misleads agents.
- `docs/launch/STATE.md`: 97 lines (target about 80), and its deploy status is now wrong (§1).
- The "no account" lines in `README.md:40`, `docs/getting-started.md:3`, `website/lib/blog.ts:45,97`,
  `app/compare/[slug]/page.tsx:107` and `STORE-LISTINGS.md`.

**Archive** (finished; `git mv` to `docs/launch/archive/` or `docs/audit/archive/`, then update the CODEMAP and
STATE links):

- `docs/launch/{sdk-isolation-1.11.2,video-1.11.1,screens,minimum-click-workflow}.md`
- `docs/audit/{capture-architecture,recording-architecture-proposal,hygiene-2026-10-31}.md`
- `docs/audit-quality/implementation-plan.md` (a single-file folder)

**Merge:** `docs/quickstart.md` and `docs/getting-started.md` overlap on installation.

**Keep:** ADRs, `ticket-flow.md`, `RELEASING.md`, `RELEASE_CHECKLIST.md`, `STORE-LISTINGS.md`, user docs, and
release sheets.

**Code nits:**

- `notify-me/route.ts:55` duplicates `normEmail` from `lib/ext-auth.ts:21`.
- `lib/blog.ts` (887 lines of inline content) could move to markdown files.

---

## 12. Prioritized remediation roadmap

**P0: immediate (all small; server only; no extension release needed)**

1. **SEC-01** 404-gate every cloud API.
   - **Root cause:** the feature flag lives only in the pages.
   - **Change:** a new `website/lib/flags.ts` exports `PHASE2_CLOUD_LIVE = false`; `middleware.ts` returns 404 for
     `/api/{sessions,upload,share,ai}` and `/share/` while it is false. The pages import the same constant.
   - **Compatibility:** nothing live uses these routes.
   - **Test:** curl each route → 404; the email and OTP routes still work.
   - **Rollback:** flip the constant.
   - Plus remove `ANTHROPIC_API_KEY` from Netlify.
2. **SEC-02** origin check in `/auth/callback`.
   - **Test:** `next=/%5Cexample.com` and `next=/%09/example.com` → same-origin redirect.
   - **Rollback:** trivial.
3. **SEC-03** OTP start hardening.
   - **Change:** DB-backed per-email limit (new small table or reuse `email_signups`-style counting) + CORS
     restricted to extension IDs.
   - **Then:** add a captcha in a follow-up with the extension release.
   - **Compatibility:** the extension origin must be allowed for both browsers. The Firefox extension ID is fixed;
     the Chrome ID is the store ID; dev unpacked IDs come from an env var.
   - **Test:** `e2e/ext-audit-gate` (22) plus curl from a foreign origin → no CORS.
   - **Rollback:** revert the route.

**P1: before the extension sign-in release**

4. POL-01/02 Firefox `data_collection_permissions` + CWS data-use answers + store copy.
5. Rewrite the privacy policy (§5) with a private contact, retention, sub-processors (Netlify, Supabase, Resend,
   Product Hunt), and a delete path that exists.
6. Site and README copy: "No account for bug capture; Site Audit asks for a free email sign-in after 3 audits".
   Fix the "Free forever" pricing line.
7. Remove `{{ .ConfirmationURL }}` from the sign-in-code template (Supabase dashboard + repo copy).
8. SEC-04 column-level grants on `sessions`. Lower priority if P0-1 ships.
9. SEC-05/06 DB-backed limits; drop the XFF fallback; per-email wrong-code lockout; admin `signOut` after verify.
10. Email:
    - DMARC `rua` reporting.
    - Verify the `send.` CNAME in Resend.
    - Make `EMAIL_POSTAL_ADDRESS` mandatory for `send`.
    - Don't re-confirm unsubscribed addresses more than once per 30 days.
    - Return a "queued" status when the cap is hit.
    - Handle 429 separately in the UI.
    - Purge unconfirmed rows and orphan users.
11. POL-03 remove optional `<all_urls>`; POL-07 remove the commented-out legacy cloud UI.

**P2: UX, conversion, performance**

- UX-01 to UX-09.
- Sign-in: resume with an existing code, 60 s resend, auto-resume the audit.
- SEC-07/08/09 hardening.
- Self-host the Product Hunt badge.
- Changelog page weight.
- Lazy-load MascotWalker.
- Split the client components.
- Plan Next 15 (SEC-10).
- Fact-check the compare pages (POL-04).

**P3: cleanup**

- §10 deletions (`geist`, unused components, `ai/diagnose`).
- §11 doc archive and the ARCHITECTURE refresh.
- CSP in report-only mode.
- `.gitignore` `.env*`.
- Remove `X-XSS-Protection`.
- axe THIRD_PARTY_NOTICES.
- WebP blog images.

---

## 13. Tests performed

| Test | Result |
|---|---|
| `node scripts/check.mjs` (typecheck, lint, unit, build) | **All pass**: 1233 tests in 82 files |
| `npx tsc --noEmit -p website` | Pass |
| `npm audit --omit=dev` (website and root) | Website: next (1 critical), postcss (1 high, build-only). Root: 3 high, transitive. See SEC-10 and §9 |
| Live headers on `/`, `/share/x`, `/sdk-bridge`, `/api/me`, `/dashboard` | HSTS 1y, nosniff, XFO SAMEORIGIN, Referrer-Policy; no CSP; private 404s `no-store`; `/api/me` 401 |
| Live open-redirect probe (GET, harmless target `example.com`) | **307 → https://example.com/** |
| Live route inventory (OPTIONS/GET) | `/api/ext/otp/*`, `/api/confirm`, `/api/unsubscribe`, `/api/keepalive`, `/email` deployed; `/api/upload/init` POST → 401; `/api/ai/diagnose` deployed (405 on GET) |
| DNS: SPF, DKIM, DMARC, MX, NS | See §3.4 |
| Git history secret scan (`.env*` additions, service-role/JWT patterns) | Only placeholder example files |
| Live page and link crawl (GET only; about 25 pages plus store, npm and GitHub links) | All resolve; results in §7 |

**Not run:** `check.mjs --full` and e2e suites (no extension code changed; STATE records them green today); a
production `next build` bundle analysis (the dev server may be running); any test that sends email or creates an
account.

## 14. Could not verify

- Supabase dashboard:
  - whether sign-ups are enabled (decides SEC-01 and SEC-03 exploitability);
  - OTP expiry and length;
  - the Auth email rate limit;
  - captcha;
  - the `reports` bucket size and MIME limits;
  - backups and PITR.
- Resend:
  - domain status for the `send.` CNAME;
  - suppression list;
  - open/click tracking;
  - daily usage;
  - whether error bodies echo addresses.
- Netlify:
  - env values (`ANTHROPIC_API_KEY`, `EMAIL_POSTAL_ADDRESS`, `EMAIL_REPLY_TO`, `CONFIRM_DAILY_CAP`);
  - log retention;
  - whether `x-nf-client-connection-ip` is always set and unspoofable.
- Actual exploitation of SEC-01. Not attempted: it would create an account and upload content to production.
- Production JS bundle sizes; real-device mobile and screen-reader testing; any funnel numbers (no analytics exists).

## 15. Production-readiness assessment

| Area | Verdict |
|---|---|
| Local-first core (capture, export, MCP) | Ready. The privacy claims hold for this path |
| Marketing site | Ready after P0-2 (redirect). Hygiene items are minor |
| Email list | Live and mostly sound (double opt-in, RFC 8058, DB caps). Needs P0-3 and P1-10 to protect sender reputation |
| Website API surface | **Not ready until P0-1:** the parked cloud routes are an open door if Supabase sign-ups are on |
| Extension sign-in gate | **Not ready to ship to the stores** until P1-4 to P1-7. The server side works, but the policy and copy contradict it |

The fixes are small and remove code rather than add it: the biggest risk reduction comes from **switching off
what the product no longer uses** (cloud APIs, magic link, `<all_urls>`, `ai/diagnose`) and **making the copy
match the new account**, not from adding features.
