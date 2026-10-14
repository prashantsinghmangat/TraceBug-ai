# Launch state — read this, not the archives

Current state only. History is in `PROGRESS-archive.md`; the full text of finished phases is in
`PLAN-archive.md`. Facts here are verified against code, not docs. Last updated 2026-10-12.

## Where we are

**All engineering for 1.11.0 is done. Everything left is human-only.** Last updated 2026-10-14.

- Branch `develop`, version **1.11.0** across all eight surfaces `check:versions` guards.
- Store archives **must be rebuilt**: the ones on disk predate the video pause and the
  `offscreen` removal. `npm run zip:ext`, then confirm `PK` and no `offscreen` in the manifest.
- Store archives last verified (`PK`, 30 files, right manifest in each):
  - `releases/tracebug-extension-v1.11.0.zip` (824 KB) -> Chrome Web Store
  - `releases/tracebug-firefox-v1.11.0.zip` (824 KB) -> Firefox AMO
- **Phases 0-7 and 9 are done.** Permissions optional, secrets and provider calls out of the host
  page, restricted pages and orphaned tabs handled, events-only capture as the default, bundled
  welcome page, per-version "What's new" card, uninstall survey, review ask, export footer and issue
  credit, oversize-export notice, canvas-replay warning, copy-and-docs consistency.
- **Screen recording is PAUSED in the extension for 1.11.** One switch,
  `VIDEO_ENABLED_IN_EXTENSION` in `src/video-recorder.ts`, enforced at the transport so no entry
  point can start one - a stored `tb_record_opts.video: true` is read and ignored, never erased, so
  1.11.1 restores the user's choice by flipping the constant. The `offscreen` permission is out of
  both manifests with it. **Four bugs, the unverified lead on the worst one, and the restore
  checklist: `docs/launch/video-1.11.1.md`.** The npm SDK is untouched and records video as before.
- **Phase 8 is deferred to after submission**, except two items done early: the e2e harnesses run
  anywhere and headless (`e2e/paths.mjs`), and `e2e/ext-no-secrets-in-page.e2e.mjs` is in CI.
  Outstanding: `e2e/fixtures/`, `extension-smoke.spec.ts`, the golden-report check, the CI nightly.

## What is left before submission - all of it needs a person

Automated gates are green and cannot say more than they already have:
`check.mjs --full` = 796 passing / 47 files, `ext:lint` 0 errors / 69 warnings, `check:versions` 1.11.0.

1. **Run `npm run ext:firefox` and look at it.** NOT a gate - `web-ext run` stays open until the
   browser is closed, so check.mjs refuses it. Firefox is unverified for 1.11.
2. **Work `docs/RELEASE_CHECKLIST.md` rows 1-10** plus
   `docs/testing/{restricted-pages,upgrade-host-permission}.md`. Several surfaces have never been
   RENDERED, only source-tested: the welcome page, the "What's new" card (testable for the first time
   now the version is 1.11.0), the three "can't run here" states, `/bye`, the review card, the
   oversize notice and the canvas warning. Three things need hardware or an OS state no runner has:
   the **macOS Screen-Recording denial** (a Mac with the permission off), whether **Firefox** honours
   `preferCurrentTab` and what its OS-denial message says, and which branch Firefox takes when
   `welcome.js` asks `tabs.create` for `about:addons`.
3. **Submit one real `/bye` form** and confirm it lands in Netlify Forms under `uninstall`. A
   field-name mismatch is accepted and silently discarded - there is no other way to check.
4. **Read the diagnostics output properly**, hunting for any URL, hostname, path or page text. The
   scrubber is tested against the cases I could think of; users will paste this into public issues.
5. **Check `tracebug.dev/privacy` renders correctly** after the rewrite, and decide whether it needs
   a sentence distinguishing extension mode from npm-SDK mode: the new token paragraph describes the
   extension, while the SDK still stores tokens in the page's own localStorage.

### Closed since the bump

- **Store listing is submission-ready.** Name `TraceBug: Bug Report Recorder & Replay` (38 chars) and
  the search-led description are in BOTH manifests and in the listing doc; §7b carries the current
  permission table and the data-use disclosure, warning removed.
- **`/demo.html` -> `/try.html` verified.** 308, tested against `next dev`. It stays in
  `next.config.js`: the site is not a static export, and the Next runtime serves requests ahead of
  Netlify's redirect layer.
- **The privacy policy no longer claims "no data is ever sent to any server."** It says nothing goes
  to TraceBug, and documents the three things that do leave the device.

## Carried forward from Phases 4–7

- **Version bumps touch eight surfaces**, not two. `npm run check:versions` names them all (the npm
  package, `server.json` ×2, `website/lib/version.ts` ×2 — including the `v1.11` minor tag — the
  `CHANGELOG.md` heading and a docs example). `manifest.base.json` has **no** version field by design:
  `build-ext.mjs` injects it from `package.json`. `check:versions` runs inside `zip:ext`.
- **A release needs one new `WHATS_NEW` entry** in `popup.js`, keyed by version. No entry means no
  card, which is the intended failure. 1.11.0's is written.
- **`zip:ext` calls bsdtar by ABSOLUTE path** (`System32	ar.exe`) and refuses to report success
  unless the output starts with `PK`. Bare `tar` resolves to GNU tar wherever Git Bash is on PATH, and
  GNU tar silently writes an uncompressed TAR named `.zip` — 1.11.0's first archives were exactly
  that, and both stores would have rejected them after an "[OK] store zip" line.
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
- **Firefox AMO caps manifest `name` at 45 characters; Chrome allows 75.** One manifest feeds both
  builds, so 45 binds. Exceed it and `ext:lint` fails with `JSON_INVALID "/name"` while Chrome accepts
  it happily - a Chrome-only check will not catch it. Limits table in
  `docs/launch/store-submission-pack.md` §1.
- Two credit settings sit together in the export **More ▾** menu and both default on:
  `tracebug_show_export_footer` (the bar in an exported `.html`) and `tracebug_issue_signature`
  (the line in GitHub / Linear / Slack bodies).

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
