# Launch state — read this, not the archives

Current facts only, verified against code and git. Last updated **2026-11-12**. **Keep this file under
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
- **Gates** (2026-11-11): `check.mjs --full` 1098/76, ext:lint 0/12, 84/84 report checks; all e2e green
  (`ext-shipping-path` / `ext-feature-matrix` can flake under load — rerun alone before believing a fail).
- **Next engineering: Site Audit + verified-fix sprint**, plan approved 2026-11-10:
  `docs/audit-quality/implementation-plan.md` (extension runs audits; MCP stays file-only with
  `compare_audits`; no Lighthouse; §4a scan menu). Start Phase B on a branch from `develop`
  (`git checkout -b site-audit develop`) once the uncommitted docs are committed.

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
