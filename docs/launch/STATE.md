# Launch state — read this, not the archives

Current state only. History is in `PROGRESS-archive.md`; the full text of finished phases is in
`PLAN-archive.md`. Facts here are verified against code, not docs. Last updated 2026-10-12.

## Where we are

- Branch `develop`, preparing **1.11.0**. Version strings still say **1.10.1** (`package.json`,
  `tracebug-extension/manifest.json`) — that is the live store build. Bumping is a release step, not done.
- **Phases 0–7 are done.** Permissions optional, secrets and provider calls out of the host page,
  restricted pages and orphaned tabs handled, events-only capture as the default, bundled welcome page,
  per-version "What's new" card, uninstall survey, review ask and the export footer / issue credit.
  Phase 6 added the oversize-export notice, the canvas-replay warning and the Jira relabel; Phase 7
  added diagnostics the user copies out themselves.
  Per-phase history is in `PROGRESS.md`; `PLAN.md` marks the finished items.
- **Next: Phases 8–9 in `PLAN.md`.** Phase 8 needs rescoping — see gotchas.

## Carried forward from Phases 4–7

- **Bump the version to 1.11.0** in `package.json` and `tracebug-extension/manifest.json`, then run
  `npm run check:versions` — it names every other surface that has to move with them (the npm package,
  `server.json` ×2, `website/lib/version.ts` ×2, the `CHANGELOG.md` heading, a docs example).
  `manifest.base.json` has **no** version field by design: `build-ext.mjs` injects it from `package.json`.
  `check:versions` is already wired into `zip:ext`, so a store zip cannot be built with a stale manifest.
- **The "What's new" card is invisible until that bump.** `popup.js`'s `WHATS_NEW` table is keyed
  `1.11.0` while the manifest says `1.10.1`, so an update today flags `1.10.1`, finds no copy and shows
  nothing. A future release means adding one `WHATS_NEW` entry — nothing else to wire.
- **No Firefox store link exists anywhere in `src/`.** `src/links.ts` holds the Chrome listing id only;
  the repo has no confirmed AMO slug and a guessed one would be a dead link inside exported reports. Add
  it there, once, when the real URL is known. A test blocks it creeping back in elsewhere.
- **The "Rolling this out to a team?" card is deliberately absent** from the welcome page —
  `tracebug.dev/teams` does not exist. `welcome.js` has an empty `TEAM_GUIDE_URL`; set it and the card
  builds itself.
- The capture shortcut must always be read from `chrome.commands` at runtime, never hardcoded — default
  **`Alt+B`**. `Ctrl+Shift+B` is a page-level handler that only works once TraceBug is on the tab.
- **The DOM replay never records canvas** (`recordCanvas: false` in `rrweb-recorder.ts`), so a
  canvas-driven page replays as an empty box. `src/replay-fidelity.ts` warns at events-capture start
  when a canvas covers >25% of the viewport; video is the only fix. Don't "fix" this by enabling
  `recordCanvas` without measuring - it is off for size and speed reasons.
- **`diagnostics.js` `scrub()` is a privacy boundary, not a nicety** - whatever it misses, the user
  pastes into a public GitHub issue. Its rules run in a fixed order (markup FIRST, before placeholders
  that look like tags), and `tests/diagnostics.test.ts` asserts against real browser error text rather
  than against the regexes. Add a rule there, with a case, rather than filtering at a call site.
- Two credit settings sit together in the export **More ▾** menu and both default on:
  `tracebug_show_export_footer` (the bar in an exported `.html`) and `tracebug_issue_signature`
  (the line in GitHub / Linear / Slack bodies).

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
