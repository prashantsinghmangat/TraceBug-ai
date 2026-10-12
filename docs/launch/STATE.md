# Launch state — read this, not the archives

Current state only. History is in `PROGRESS-archive.md`; the full text of finished phases is in
`PLAN-archive.md`. Facts here are verified against code, not docs. Last updated 2026-10-12.

## Where we are

- Branch `develop`, preparing **1.11.0**. Version strings still say **1.10.1** (`package.json`,
  `tracebug-extension/manifest.json`) — that is the live store build. Bumping is a release step, not done.
- **Done:** Phase 0 (investigate), 1 (optional `<all_urls>`, no install warning), 2a+2b (secrets and
  provider calls out of the host page, per-send confirmation), 3 (restricted pages, orphan re-inject,
  deferred updates, real `Alt+B` command), 4 Steps A+B (events-only default capture, picker hint,
  macOS denial), the two Step-B additions (video pref in `chrome.storage.local`, replay heading names
  its page), **Step C** (bundled `welcome.html`; first run no longer needs the network) and **Step D**
  (per-version "What's new" card in the popup, no tab stolen on update), and **Step E** (popup "can't run here" states carry the page and a per-reason glyph; `/bye` uninstall survey; `setUninstallURL`).
- **Next: Phases 5–9 in `PLAN.md`. Phase 8 needs rescoping — see gotchas.

## Phase 4, what is left

- **Step D is done.** `background.js` writes the landed version to `tb_whats_new`; `popup.js` holds the
  copy in a per-version `WHATS_NEW` table and shows the card only when that version has an entry.
  **The card is invisible until the version bump**: the table is keyed `1.11.0` and the manifest still
  says `1.10.1`, so an update today flags `1.10.1`, finds no copy and shows nothing. Adding a release
  means adding a `WHATS_NEW` entry - there is nothing else to wire.
- **Step E is done.** `describePage` (page-support.js) feeds the host/path card, which is ABSENT when
  `tab.url` is invisible. One glyph per reason; `csp` / `needs-access` / `unknown` keep the pixel-bug
  fallback because `screens.md` names no glyph for them. `setUninstallURL` is set at worker start and
  carries `?v=<version>` and nothing else.
- **Step F is done.** `src/links.ts` is the single source for store URLs and UTM tags; the export
  footer points at the store listing and is removable (`tracebug_show_export_footer`, toggle in the
  export menu); `src/ui/review-ask.ts` asks at the 3rd export, never in the first session, once more
  at the 10th, then never.
- **Phase 5 is now mostly done ahead of schedule** - its footer, review-prompt, uninstall-survey and
  constants-file items all landed in Steps E and F. What remains of Phase 5 is the **issue signature**
  ("Reported with TraceBug" appended to GitHub/Linear/Slack bodies, with a toggle). Update `PLAN.md`
  Phase 5 before starting it.
- `welcome.html` / `welcome.js` are done and in `SHARED_FILES`. The **"Rolling this out to a team?"
  card is deliberately absent** — `tracebug.dev/teams` does not exist and the page must not ship a
  404. `welcome.js` has an empty `TEAM_GUIDE_URL`; set it and the card builds itself.
- The shortcut must be described as **`Alt+B`**, read from `chrome.commands` at runtime — never hardcoded.
  `Ctrl+Shift+B` is a page-level handler that only works once TraceBug is on the tab.
- **Bump the version to 1.11.0** in `package.json` and `tracebug-extension/manifest.json`, then run
  `npm run check:versions` — it names every other surface that has to move with them (the npm package,
  `server.json` ×2, `website/lib/version.ts` ×2, the `CHANGELOG.md` heading, a docs example).
  `manifest.base.json` has **no** version field by design: `build-ext.mjs` injects it from `package.json`.
  `check:versions` is already wired into `zip:ext`, so a store zip cannot be built with a stale manifest.

## Open human checks (cannot be automated here)

- `docs/RELEASE_CHECKLIST.md` — three Record-options upgrade rows (the popup migration has no browser test).
- **The welcome page has never been rendered.** Its tests assert the source, not the layout: install on
  a clean profile and look at it, on Chrome and Firefox. Step 3 must show a real key or the empty state.
- **Firefox and `about:addons`:** `welcome.js` falls back to text steps if `tabs.create` refuses it.
  Which branch Firefox takes is unverified.
- The **macOS Screen-Recording denial** needs a real Mac with the permission off. Only the error-string
  mapping is tested.
- Whether **Firefox** honours `preferCurrentTab`, and what its OS-denial message says.
- `docs/testing/upgrade-host-permission.md` — an already-granted `<all_urls>` surviving the upgrade.

## Gotchas that are still true

- **Two manifests, hand-synced.** `tracebug-extension/build/manifest.base.json` is the source of truth;
  `tracebug-extension/manifest.json` is the separate unpacked/dev copy (it alone carries `background`,
  `version`, `minimum_chrome_version`). `build-ext.mjs` writes only to `dist/`, so editing one and not the
  other is a live trap.
- **`tab.url` is normally `undefined`.** `<all_urls>` is optional now, so never guard on it or branch on it
  without a fallback. Check the page with `page-support.js` `classifyPage`, and only when a URL is visible.
- **The e2e harness pre-grants `<all_urls>`** (`e2e/ext-host-access.mjs` copies the build and re-declares it
  as required) because an optional grant needs a dialog no runner can click. So e2e never exercises the
  declined path — unit tests do.
- **Branded Chrome 137+ silently ignores `--load-extension`.** Extension e2e uses bundled Chromium
  deliberately. Phase 8's "nightly against Chrome Beta" cannot work this way.
- The e2e `.mjs` scripts are plain node, not Playwright specs (`playwright.config.ts` matches `*.spec.ts`
  only), and they hardcode absolute `D:/Project/TraceBug-ai/...` paths. Both must change before CI.
  `e2e/demo-failure.spec.ts` fails on purpose — a smoke spec in `testDir` would inherit that and the
  TraceBug reporter.
- `web_accessible_resources` must stay `<all_urls>` for the CSP-proof player iframe.
- Redaction rules live in `chrome.storage.sync` and were always correct — leave them alone.
- Worker state (`activeTabs`, `_recordingTabId`, `_updatePending`) persists to `chrome.storage.session`
  under `tb_sw_state_v1` and rehydrates on every worker start; mutate only after awaiting `_hydrated`.
- `webNavigation` is not used and must not be added — `tabs.onUpdated` plus `activeTabs` already covers it.
- The SDK runs in the page's **MAIN world**, so page `localStorage` is readable by the host site. No secrets
  there, ever (`CLAUDE.md`).
