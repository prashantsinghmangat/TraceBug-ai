# Launch state — read this, not the archives

Current state only. History is in `PROGRESS-archive.md`; the full text of finished phases is in
`PLAN-archive.md`. Facts here are verified against code, not docs. Last updated 2026-10-12.

## Where we are

- Branch `develop`, preparing **1.11.0**. Version strings still say **1.10.1** (`package.json`,
  `tracebug-extension/manifest.json`) — that is the live store build. Bumping is a release step, not done.
- **Done:** Phase 0 (investigate), 1 (optional `<all_urls>`, no install warning), 2a+2b (secrets and
  provider calls out of the host page, per-send confirmation), 3 (restricted pages, orphan re-inject,
  deferred updates, real `Alt+B` command), 4 Steps A+B (events-only default capture, picker hint,
  macOS denial) and the two Step-B additions (video pref in `chrome.storage.local`, replay heading
  names its page).
- **Next: Phase 4 Steps C & D**, then Phases 5–9 in `PLAN.md`. Phase 8 needs rescoping — see gotchas.

## Phase 4, what is left

- **Step C — bundled welcome page.** `onInstalled` (`background.js`) still opens the REMOTE
  `https://tracebug.dev/try.html?welcome=extension`, so first run needs the network. Build
  `tracebug-extension/welcome.html` (no remote assets; add to `SHARED_FILES` in `build/build-ext.mjs`),
  keep the remote page as a link from it. Content list is in `PLAN.md` Phase 4. Design to follow:
  `docs/launch/designs/tracebug_welcome_quickstart_page/`.
- **Step D — "What's new" card** in the popup on `reason === "update"` (no tab opened). Copy is in
  `docs/launch/screens.md` screen 4. Dismissed state in `chrome.storage.local`.
- The shortcut must be described as **`Alt+B`**, read from `chrome.commands` at runtime — never hardcoded.
  `Ctrl+Shift+B` is a page-level handler that only works once TraceBug is on the tab.
- **Bump the version to 1.11.0** in `package.json` and `tracebug-extension/manifest.json`, then run
  `npm run check:versions` — it names every other surface that has to move with them (the npm package,
  `server.json` ×2, `website/lib/version.ts` ×2, the `CHANGELOG.md` heading, a docs example).
  `manifest.base.json` has **no** version field by design: `build-ext.mjs` injects it from `package.json`.
  `check:versions` is already wired into `zip:ext`, so a store zip cannot be built with a stale manifest.

## Open human checks (cannot be automated here)

- `docs/RELEASE_CHECKLIST.md` — three Record-options upgrade rows (the popup migration has no browser test).
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
