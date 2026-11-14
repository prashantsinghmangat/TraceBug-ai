# Launch state — read this, not the archives

Current facts only, verified against code and git. Last updated **2026-11-13** (1.12.0 live; email built + committed, not deployed; audit saved results uncommitted). **Keep this file under
~80 lines: rewrite it, never append** — history goes in `PROGRESS.md` (append-only, never read whole).
Code locations: `CODEMAP.md`. Release mechanics: `docs/RELEASING.md`.

## Where things stand

- **Gates** (2026-11-13, `develop` + uncommitted work): `check.mjs --full` green — 1233/82, ext:lint 0/22 (baseline 22),
  84/84 report, 80/80 audit, 40/40 extension audit, 22/22 audit gate, 23/23 email ask; all e2e green
  (`ext-shipping-path` / `ext-feature-matrix` can flake under load — rerun alone before believing a fail).
- **Site Audit on branch `site-audit`** (from `develop`; plan `docs/audit-quality/implementation-plan.md`), committed
  through `f96db4d`; docs pass uncommitted. User guide `docs/site-audit.md`; agent brief `docs/AGENT-BRIEF.md` (update it
  when a feature or MCP tool changes); website docs `#audit`, home tab, /features cell. Sprint scans done: popup's first card **Audit this page** (chevron = 4 scans) + toolbar **Audit** button →
  side panel (docked right/left or dragged free by its header, remembered; minimise; Locate keeps it open). Scans: All / Auto Review / Accessibility (axe + keyboard pass incl. 2.4.11) /
  Performance & SEO. 0–100 score per category + overall (`src/audit/score.ts`: multiplicative shares, pooled, stored in
  `AuditRun.score`), per-finding WCAG + fix (contrast → nearest passing colour); SEO adds social tags, JSON-LD validity, robots.txt
  blocking (reads /robots.txt — the audit's only requests), sitemap; perf adds image oversize/format; axe "incomplete" →
  `AuditRun.review` ("Needs a person to check", unscored); category `mobile` = phone width in a hidden 390px
  same-site iframe (`detectors/mobile.ts`, in All checks + Auto Review; not run where framing is forbidden); panel groups findings by rule,
  Copy for AI (`src/audit/prompt.ts`). Noise study: `node e2e/audit-noise.mjs <dir>` (manual, public sites): findings 260 → 129,
  gov.uk 98 — rerun it before changing a detector's thresholds. Calibrated vs Lighthouse 12.8 (2026-11-12): a11y stricter by
  design (count-weighted), perf now has `perf/blocking` (TBT, load only) and CLS = worst burst. Export → `payload.audit` + viewer Audit tab; MCP
  `get_audit`/`get_finding`/`compare_audits` (page text under `untrusted`) — **12 tools**, docs say so (blog
  posts in `website/lib/blog.ts` still say "nine"; dated, left). axe is `vendor/axe.min.js`, injected on demand
  (popup: `TB_RUN_AUDIT`; toolbar: `TB_LOAD_AXE`). ext:lint baseline 22, approved (axe's own code).
  Agent acceptance test passed; rerun `node e2e/audit-agent-loop.mjs setup|verify <dir>`.
- **1.12.0 (the audit release) is live everywhere** (2026-11-13, verified): npm `tracebug-sdk` + `tracebug` 1.12.0, MCP
  registry `isLatest`, AMO 1.12.0 public, CWS approved (per owner; the CWS page can't be fetched by script), `main` =
  `develop` = merge `10c7595`, tag `v1.12.0` pushed, tracebug.dev serves the new SDK (hash matches) with the audit pages
  and `llms.txt`, `npx -y tracebug@1.12.0 mcp --help` works in an empty folder. 1.11.6 skipped the stores.
- **Website deployed from `main` = `e7c9e59`** (2026-11-14). It includes the email list, the OTP routes and
  the **P0 security fixes**, which were verified live:
  - the cloud routes and `/auth/callback` return 404;
  - the OTP routes accept extension origins only;
  - migration 0009 (send log) is applied.

  The extension side of the sign-in gate is in no store release yet. Audit:
  `docs/audit/website-complete-security-ux-audit.md` (its status box lists what is done). **P1 is uncommitted on
  `develop`:**
  - Firefox optional data-collection consent;
  - privacy, pricing and email copy;
  - `queued` status and 429 handling;
  - migration **0010** (wrong-code lockout plus locking writes on the parked cloud tables) — not applied yet;
  - the session revoke after verify.

  The P1 owner steps in that box block the gate's store release.
- Committed: Fix with AI + MCP `fix_site_audit` (`c7a37fa`); popup **email ask** after the 2nd
  saved ticket/export (audits counted, not triggering — the gate covers them) + sending via Resend free — double opt-in, `/api/confirm`, `/api/unsubscribe` (+ RFC 8058),
  `/email`, `website/scripts/email.mjs` (`01df764`, `9a8674a`; `e2e/ext-email-ask.e2e.mjs` 21/21, not in `check.mjs`).
  Owner setup done and tested locally end to end (Resend domain + DNS, migrations 0007/0008, Netlify env, Auth SMTP).
  **Uncommitted:** audit **saved results** — last run per page + scan in `sessionStorage` (`src/audit/last-run.ts`,
  own quota, never page `localStorage`); popup/toolbar Audit shows it instead of scanning ("Your last scan…"), Re-scan
  compares against it even after a reload, with **old → new score** pills (`.tb-au-delta`); **Open in Claude** in the
  panel footer (2×2 grid). Tests: `tests/audit-last-run.test.ts`, `ext-site-audit` 40/40.
  **Also uncommitted — Site Audit sign-in gate** (ADR 009; `sign-in-gate-plan.md` "As built"): 3 free audits, then a
  free email + code account on `signin.html`; audit only; fail open; separate unticked marketing box; website
  `/api/ext/otp/start|verify`, `/api/keepalive` + `.github/workflows/keepalive.yml`. e2e `ext-audit-gate` 22/22.
  `check.mjs --full` now also runs `e2e:audit-gate` and `e2e:email-ask`. Email card: audits no longer trigger it;
  never shown when signed in for Site Audit. Popup header **account icon** (menu: who's signed in / free audits left,
  Sign in / Sign out / Delete) + Audit card shows free audits left; welcome page **optional, skippable** sign-in card.
  1.12.0 blog post in `website/lib/blog.ts` (no cover yet) + kit `docs-internal/marketing/posts-1.12.0.md`.
  Follow-ups: drop the Chrome "New in 1.12.0" paragraph in a few weeks; registry description still says "bug reports"
  only (`server.json`, next version); blog/announce posts (RELEASING §8).
  Next per plan: the day-14 gate (incl. pricing, B4), then Design Tokens → Components → Visual Comparison.

## Open — needs a person

1. Announce 1.12.0 (RELEASING §8: blog post, posts, dev.to); confirm the GitHub release for `v1.12.0` exists.
2. `RELEASE_CHECKLIST.md` rows never recorded as run: 1–3, 9, 10, 12b, 13 (best on the real store update), 14 (macOS).
3. AMO slide/caption say "Record a tab, window or screen" — confirm Firefox's picker offers tabs.
4. Pricing (B4) decided 2026-11-13: `monetization-plan.md`; sign-in gate decided (ADR 009) and built.
5. Accepted gaps: no fullscreen in the video player; no site-wide CSP; Next 14 advisories (upgrade deferred).
7. Sign-in gate go-live (owner): Supabase templates (code + link) and OTP length 6 **done**, local sign-in tested
   2026-11-13; still: apply migration 0010, paste the new code template, mail for hello@tracebug.dev, (optionally `OTP_DAILY_CAP`)
   from Netlify, drop `{{ .ConfirmationURL }}` from the code template, Auth email limit ~30/hour, deploy website first, live sign-in + delete test, run keep-alive once,
   store/website copy at release — `sign-in-gate-plan.md` *Owner setup before release*.
6. Email go-live (owner): merge `develop` → `main`; live test on tracebug.dev (sign up, confirm, unsubscribe);
   send the backlog (`website`: `node --env-file=.env.local scripts/email.mjs confirm`, then `--send`); CWS data-use
   answers at the next extension release; free Supabase **keep-alive** Action (required if the sign-in gate ships).
   Link-scanner fix done (uncommitted): GET shows `/email` with a button, the button POSTs. Netlify env
   `CONFIRM_DAILY_CAP=30`; Supabase Auth email limit ~30/hour.
   Live test: the confirm link must start `https://tracebug.dev/api/confirm`; `scripts/email.mjs --send` now refuses
   a localhost/non-https `NEXT_PUBLIC_SITE_URL` (a dev `.env.local` would otherwise mail localhost links to the list).

## Gotchas that are still true

- **Two manifests, hand-synced.** `build/manifest.base.json` is the source; `tracebug-extension/manifest.json`
  is the dev copy (alone carries `background`, `version`, `minimum_chrome_version`); `build-ext.mjs` writes `dist/`.
- **Version bumps touch every surface `check:versions` names**, and a release needs a `WHATS_NEW` entry in
  `popup.js` — no entry, no card. Store text lives in `docs/STORE-LISTINGS.md` (the release sheet reads it).
- **`zip:ext` uses bsdtar by absolute path** (`C:\Windows\System32\tar.exe`); GNU tar silently writes a TAR named `.zip`.
- **AMO caps manifest `name` at 45 chars**; slug `tracebug-bug-reports-for-ai` (`/addon/tracebug/` is a 404).
- **`tab.url` is normally `undefined`** (`<all_urls>` is optional) — classify with `classifyPage` (`page-support.js`).
- **Offscreen files follow `VIDEO_ENABLED_IN_EXTENSION`** (`src/video-recorder.ts`); `build-ext.mjs` throws if
  the constant is renamed. With video on, each zip has 30 files.
- **Theme tokens reach the in-page UI only via `#tracebug-root[data-tb-theme]`.** `init()` runs before the root
  exists, so `mountDashboard()` must call `applyThemeToRoot()` — any `var(--tb-*)` without a fallback goes
  transparent otherwise. Default theme is light.
- **Two TraceBug instances on one page share the DOM.** If a host page's own toolbar is up, the extension
  defers entirely (`injectSDK()` → `detectHostTraceBugUI()`); our own mount is marked with the
  `tracebug_ext_owns_ui` sessionStorage key. e2e: `ext-reload-reinject`.
- **The extension build stubs html2canvas and axe-core** (`tsup.config.ts`); a feature needing axe in the
  extension must load it deliberately (the audit plan ships it as a separate packaged file).
- **DOM replay never records canvas**; `src/replay-fidelity.ts` warns above 25% of the viewport.
- **`diagnostics.js` `scrub()` is a privacy boundary** — add a rule there with a test, not a call-site filter.
- **e2e pre-grants `<all_urls>`** and uses bundled Chromium (branded Chrome 137+ ignores `--load-extension`).
- `web_accessible_resources` stays `<all_urls>`; never add `webNavigation`; worker state is
  `chrome.storage.session` `tb_sw_state_v1` — mutate only after `_hydrated`. SDK runs in the page MAIN world:
  no secrets in page `localStorage`.
- **Website dev server and `next build` collide** — stop the preview before building.
- **MCP Registry publish is PowerShell `& C:\tools\mcp-publisher.exe`** from `packages\tracebug`; a 401
  "token is expired" means log in again.
