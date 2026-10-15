# Launch state — read this, not the archives

Engineering state only, verified against code. Last updated 2026-10-15. Calendar, channels and the
32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored).
History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`. Post-submission phases: `PLAN.md` 8, 10, 11.

**All engineering for 1.11.0 is done; everything left is human-only.** Branch `develop`, 1.11.0 on
the eight surfaces `check:versions` guards. `check.mjs --full`: **819 passing / 48 files**,
`ext:lint` 0 errors / 69 warnings. Phases 0–7 and 9 are closed (permissions optional, secrets and
provider calls out of the host page, restricted pages and orphaned tabs handled, events-only capture
the default, bundled welcome page, "What's new" card, uninstall survey, review ask, export footer,
issue credit, oversize notice, canvas warning, docs and copy consistency). Phase 8 is deferred but
for `e2e/paths.mjs` (headless anywhere) and `e2e/ext-no-secrets-in-page.e2e.mjs` (in CI).

**Screen recording is PAUSED in the extension.** `VIDEO_ENABLED_IN_EXTENSION` in
`src/video-recorder.ts`, enforced at the transport; a stored `tb_record_opts.video: true` is read and
ignored, never erased, and the `offscreen` permission is out of both manifests with it. Four bugs and
the restore checklist: `video-1.11.1.md`. The npm SDK is untouched and records video as before.

## Left before submission — all of it needs a person

Dated in `docs-internal/GROWTH-PLAN-30DAY.md` week 1; submit **Fri Oct 16**.

1. **Deploy the website**, then check `tracebug.dev/privacy` renders - the `offscreen` removal is committed but not live until deploy. May still need an extension-vs-npm-SDK sentence.
2. **`npm run ext:firefox` and look at it.** NOT a gate (`web-ext run` blocks until the browser closes); Firefox is unverified for 1.11.
3. **`docs/RELEASE_CHECKLIST.md` rows 1–10** plus `docs/testing/{restricted-pages,upgrade-host-permission}.md`.
   Seven surfaces have never been RENDERED, only source-tested. Skipped while video is paused: row 9's
   oversize half and the macOS/Firefox video-denial checks. One runner-proof item remains: `welcome.js`
   asking Firefox for `about:addons`.
4. **One real `/bye` submission**, confirmed in Netlify Forms under `uninstall` — a field-name mismatch is silently discarded, so there is no other check.
5. **Read the diagnostics output** for any URL, hostname, path or page text: users paste it publicly.
6. **Final zips are built**: 28 files, `PK`, no `offscreen`, AMO slug in. Rebuild only on a code change.

## Gotchas that are still true

- **Two manifests, hand-synced.** `build/manifest.base.json` is the source of truth;
  `tracebug-extension/manifest.json` is the unpacked/dev copy (it alone carries `background`,
  `version`, `minimum_chrome_version`) — `build-ext.mjs` writes only to `dist/`.
- **Version bumps touch eight surfaces** (`check:versions` names them; `manifest.base.json` has no
  version field by design), and a release needs a new `WHATS_NEW` entry in `popup.js` — no entry, no card.
- **`zip:ext` calls bsdtar by ABSOLUTE path** (`C:\Windows\System32\tar.exe`) and refuses to report success unless
  the output starts with `PK`. Bare `tar` is GNU tar wherever Git Bash is on PATH, and GNU tar
  silently writes an uncompressed TAR named `.zip` — 1.11.0's first archives were exactly that.
- **AMO caps manifest `name` at 45 chars, Chrome 75**, and one manifest feeds both. The slug is
  **`tracebug-bug-reports-for-ai`** (verified by GUID, in `src/links.ts`); `/addon/tracebug/` is a 404.
- **`tab.url` is normally `undefined`** now `<all_urls>` is optional — classify with `classifyPage`
  (`page-support.js`); read the shortcut from `chrome.commands` at runtime (`Alt+B`).
- **The offscreen files follow `VIDEO_ENABLED_IN_EXTENSION`.** `build-ext.mjs` parses it out of
  `src/video-recorder.ts` and ships `offscreen.{html,js}` only when true, so 1.11.1 flips one
  constant and they return (28 files -> 30). It **throws** if the constant is renamed: a silent
  "off" would ship a build with no recorder.
- **The DOM replay never records canvas**, so a canvas page replays as an empty box;
  `src/replay-fidelity.ts` warns above 25% of the viewport, branching its advice on `isVideoOffered()`.
- **`diagnostics.js` `scrub()` is a privacy boundary.** Rules run in a fixed order (markup FIRST) and tests assert against real browser error text — add a rule there, with a case, not a call-site filter.
- **e2e pre-grants `<all_urls>`** so it never exercises the declined path (unit tests do), and **branded
  Chrome 137+ ignores `--load-extension`** — e2e uses bundled Chromium, so Phase 8's Beta nightly cannot work.
- `web_accessible_resources` must stay `<all_urls>` (CSP-proof player iframe); `webNavigation` must
  not be added; `chrome.storage.sync` redaction rules are correct; worker state lives in
  `chrome.storage.session` (`tb_sw_state_v1`) — mutate only after awaiting `_hydrated`. The SDK runs
  in the page's **MAIN world**: no secrets in page `localStorage`, ever.
