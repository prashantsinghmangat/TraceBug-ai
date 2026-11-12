# Launch state — read this, not the archives

Current facts only, verified against code and git. Last updated **2026-11-12** (audit score + docked panel, 1.12.0 prepared). **Keep this file under
~80 lines: rewrite it, never append** — history goes in `PROGRESS.md` (append-only, never read whole).
Code locations: `CODEMAP.md`. Release mechanics: `docs/RELEASING.md`.

## Where things stand

- **1.11.6 is half-released.** Live: npm `tracebug-sdk` + `tracebug` (`bin` OK) and the MCP Registry
  (`isLatest`), 2026-11-12. **Not yet:** Chrome Web Store and AMO uploads, then merge `develop` → `main`
  and tag `v1.11.6`. Everything for it is in `docs/release-sheets/1.11.6.md` (regenerate with
  `node scripts/release-sheet.mjs` after any change; rebuild zips with `npm run zip:ext` first, they
  predate `a0596f6`). Store screenshots, promo tiles and banners are regenerated in coral (`assets/`).
- **1.11.6 contents** (CHANGELOG `[1.11.6]`): the "1.12 Evidence Integrity" work (real failures only,
  evidence block, privacy by default, lead-up kept), Midnight coral look incl. the exported report,
  one setup command `CLAUDE_MCP_ADD`, no duplicated issue text, theme tokens actually applied to the
  in-page UI (broken since 1.11.3), video + audio kept in exports, description rendered as markdown.
- **Website** (`main` → Netlify): coral redesign, canonical URLs, a11y/UI fixes, two SEO blog posts with
  FAQ schema are live. `website/public/try.html` coral recolour is on `develop` — cherry-pick it.
  The 1.11.6 SDK + setup-command pages go live only with the release merge.
- **Gates** (2026-11-12, `site-audit`): `check.mjs --full` green — 1217/81, ext:lint 0/22 (baseline 22),
  84/84 report, 74/74 audit, 33/33 extension audit; all e2e green
  (`ext-shipping-path` / `ext-feature-matrix` can flake under load — rerun alone before believing a fail).
- **Site Audit on branch `site-audit`** (from `develop`; plan `docs/audit-quality/implementation-plan.md`), all
  uncommitted, sprint scans done: popup "Audit ▾" + toolbar **Audit** button → docked side panel (right/left,
  minimise; Locate keeps it open). Scans: All / Auto Review / Accessibility (axe + keyboard pass incl. 2.4.11) /
  Performance & SEO. 0–100 score per category + overall (`src/audit/score.ts`: multiplicative shares, pooled, stored in
  `AuditRun.score`), per-finding WCAG + fix (contrast → nearest passing colour); SEO adds social tags, JSON-LD validity, robots.txt
  blocking (reads /robots.txt — the audit's only requests), sitemap; perf adds image oversize/format; axe "incomplete" →
  `AuditRun.review` ("Needs a person to check", unscored); category `mobile` = phone width in a hidden 390px
  same-site iframe (`detectors/mobile.ts`, in All checks + Auto Review; not run where framing is forbidden); panel groups findings by rule,
  Copy for AI (`src/audit/prompt.ts`). Noise study: `node e2e/audit-noise.mjs <dir>` (manual, public sites): findings 260 → 129,
  gov.uk 94–100 — rerun it before changing a detector's thresholds. Export → `payload.audit` + viewer Audit tab; MCP
  `get_audit`/`get_finding`/`compare_audits` (page text under `untrusted`) — **12 tools**, docs say so (blog
  posts in `website/lib/blog.ts` still say "nine"; dated, left). axe is `vendor/axe.min.js`, injected on demand
  (popup: `TB_RUN_AUDIT`; toolbar: `TB_LOAD_AXE`). ext:lint baseline 22, approved (axe's own code).
  Agent acceptance test passed; rerun `node e2e/audit-agent-loop.mjs setup|verify <dir>`.
- **1.12.0 (the audit release) is prepared**, uncommitted: all `check:versions` surfaces, CHANGELOG `[1.12.0]`
  (fix the date on release day), `WHATS_NEW["1.12.0"]`, STORE-LISTINGS (New in, Firefox notes, single purpose, axe
  AMO note), `docs/release-sheets/1.12.0.md`, zips. `package-lock.json` root version **not bumped** (run
  `npm install --package-lock-only`). **Never build or regenerate 1.11.6 from this branch** — do it on `develop`.
  Chrome description body has no Site Audit section yet. Merge `site-audit` only after 1.11.6 ships.
  Next per plan: the day-14 gate (incl. pricing, B4), then Design Tokens → Components → Visual Comparison.

## Open — needs a person

1. Chrome/AMO upload of 1.11.6 (sheet §1–2), after hand checks: `dist/chrome` unpacked, `npm run ext:firefox`.
2. `RELEASE_CHECKLIST.md` rows never recorded as run: 1–3, 9, 10, 12b, 13 (best on the real store update), 14 (macOS).
3. AMO slide/caption say "Record a tab, window or screen" — confirm Firefox's picker offers tabs.
4. Pricing rule vs. paid pilots (audit plan B4): decide before the sprint's paid-pilot step.
5. Accepted gaps: no fullscreen in the video player; no site-wide CSP; Next 14 advisories (upgrade deferred).

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
