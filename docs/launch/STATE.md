# Launch state — read this, not the archives

Current facts only, verified against code and git. Last updated **2026-11-13** (1.12.0 live; email ask + sending built, unreleased). **Keep this file under
~80 lines: rewrite it, never append** — history goes in `PROGRESS.md` (append-only, never read whole).
Code locations: `CODEMAP.md`. Release mechanics: `docs/RELEASING.md`.

## Where things stand

- **Gates** (2026-11-12, `site-audit`): `check.mjs --full` green — 1226/81, ext:lint 0/22 (baseline 22),
  84/84 report, 76/76 audit, 35/35 extension audit; all e2e green
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
- **Unreleased on `develop` (uncommitted):** audit panel **Fix with AI** (downloads the audit + copies "Fix the latest
  TraceBug site audit."; can't detect MCP, so it always offers "Agent not set up?"), MCP prompt `fix_site_audit`
  (steps in `src/exporters/agent-workflow.ts` `auditFixWorkflowSteps`), METRICS.md trust metrics (no data yet).
  Also uncommitted: **optional email ask** in the popup after the 2nd audit/ticket/export (`email-capture-plan.md`;
  `e2e/ext-email-ask.e2e.mjs` 20/20, not in `check.mjs`), opt-in usage counts, notify-me sources + migration 0007
  (not applied), privacy page updated. **Email sending built** (Resend free, plain fetch): double opt-in on
  notify-me + rate limits, `/api/confirm`, `/api/unsubscribe` (+ RFC 8058), `/email` status page, migration 0008
  (not applied), monthly/backlog script `website/scripts/email.mjs` — details + owner setup in
  `email-capture-plan.md` *Sending*. All signup surfaces now say "at most one email a month" and "check your inbox".
  **Before release:** owner sets up Resend + DNS + env, applies 0007/0008, tests a signup end to end;
  CWS data-use answers (STORE-LISTINGS). 1.12.0 blog post in `website/lib/blog.ts` (no cover yet) + kit
  `docs-internal/marketing/posts-1.12.0.md`.
  Follow-ups: drop the Chrome "New in 1.12.0" paragraph in a few weeks; registry description still says "bug reports"
  only (`server.json`, next version); blog/announce posts (RELEASING §8).
  Next per plan: the day-14 gate (incl. pricing, B4), then Design Tokens → Components → Visual Comparison.

## Open — needs a person

1. Announce 1.12.0 (RELEASING §8: blog post, posts, dev.to); confirm the GitHub release for `v1.12.0` exists.
2. `RELEASE_CHECKLIST.md` rows never recorded as run: 1–3, 9, 10, 12b, 13 (best on the real store update), 14 (macOS).
3. AMO slide/caption say "Record a tab, window or screen" — confirm Firefox's picker offers tabs.
4. Pricing (B4) decided 2026-11-13: `monetization-plan.md` (approved; no licensing/Pro code until a Founder
   pre-sale validates one feature). Email ask + sending: `email-capture-plan.md` (built; owner setup pending, Open #6).
5. Accepted gaps: no fullscreen in the video player; no site-wide CSP; Next 14 advisories (upgrade deferred).
6. Email setup (owner): Resend account + tracebug.dev DNS (SPF/DKIM/MX on `send`, DMARC), Netlify env
   (`RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`), migrations 0007 + 0008, Supabase Auth custom SMTP.
   Free Supabase pauses after 7 idle days: signups and unsubscribe links then fail until restored.

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
