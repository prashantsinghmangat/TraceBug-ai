# Launch state — read this, not the archives

Engineering state only, verified against code. Last updated 2026-10-14. Calendar, channels and the
32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored).
History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`.

**All engineering for 1.11.0 is done; everything left is human-only.** Branch `develop`, 1.11.0 on
the eight surfaces `check:versions` guards. `check.mjs --full`: **818 passing / 48 files**,
`ext:lint` 0 errors / 69 warnings. Phases 0–7 and 9 are closed (permissions optional, secrets and
provider calls out of the host page, restricted pages and orphaned tabs handled, events-only capture
the default, bundled welcome page, "What's new" card, uninstall survey, review ask, export footer,
issue credit, oversize notice, canvas warning, docs and copy consistency). Phase 8 is deferred except
`e2e/paths.mjs` (harnesses run headless anywhere) and `e2e/ext-no-secrets-in-page.e2e.mjs` (in CI).

**Screen recording is PAUSED in the extension.** `VIDEO_ENABLED_IN_EXTENSION` in
`src/video-recorder.ts`, enforced at the transport; a stored `tb_record_opts.video: true` is read and
ignored, never erased, and the `offscreen` permission is out of both manifests with it. Four bugs and
the restore checklist: `video-1.11.1.md`. The npm SDK is untouched and records video as before.

## Left before submission — all of it needs a person

Dated in `docs-internal/GROWTH-PLAN-30DAY.md` week 1 (Wed 14 – Thu 15; submit Fri 16).

1. **Rebuild the store archives** — those on disk predate the video pause and the `offscreen` removal. `npm run zip:ext`, then confirm `PK` and no `offscreen` in either manifest.
2. **`npm run ext:firefox` and look at it.** NOT a gate (`web-ext run` blocks until the browser closes); Firefox is unverified for 1.11.
3. **`docs/RELEASE_CHECKLIST.md` rows 1–10** plus `docs/testing/{restricted-pages,upgrade-host-permission}.md`.
   Seven surfaces have never been RENDERED, only source-tested; three need hardware no runner has (the
   macOS denial, Firefox's `preferCurrentTab` and OS-denial text, `welcome.js` → `about:addons`).
   Row 9's oversize half is skipped while video is paused.
4. **One real `/bye` submission**, confirmed in Netlify Forms under `uninstall` — a field-name
   mismatch is accepted and silently discarded, so there is no other way to check.
5. **Read the diagnostics output**, hunting for any URL, hostname, path or page text: users paste it
   into public issues.
6. **Check `tracebug.dev/privacy` renders** after the `offscreen` removal; it may still need a sentence separating extension from npm-SDK mode.

## Gotchas that are still true

- **Two manifests, hand-synced.** `build/manifest.base.json` is the source of truth;
  `tracebug-extension/manifest.json` is the unpacked/dev copy (it alone carries `background`,
  `version`, `minimum_chrome_version`) — `build-ext.mjs` writes only to `dist/`.
- **Version bumps touch eight surfaces** (`check:versions` names them; `manifest.base.json` has no
  version field by design), and a release needs a new `WHATS_NEW` entry in `popup.js` — no entry, no card.
- **`zip:ext` calls bsdtar by ABSOLUTE path** (`C:\Windows\System32\tar.exe`) and refuses to report success unless
  the output starts with `PK`. Bare `tar` is GNU tar wherever Git Bash is on PATH, and GNU tar
  silently writes an uncompressed TAR named `.zip` — 1.11.0's first archives were exactly that.
- **AMO caps manifest `name` at 45 chars, Chrome 75**, and one manifest feeds both. **No Firefox store
  link exists in `src/`**: no slug is confirmed, a guess is a dead link inside exported reports — yet
  `docs/compatibility.md` publishes one, so one of the two is wrong.
- **`tab.url` is normally `undefined`** now `<all_urls>` is optional — classify with `classifyPage`
  (`page-support.js`); read the shortcut from `chrome.commands` at runtime (`Alt+B`).
- **The DOM replay never records canvas**, so a canvas page replays as an empty box;
  `src/replay-fidelity.ts` warns above 25% of the viewport, branching its advice on `isVideoOffered()`.
- **`diagnostics.js` `scrub()` is a privacy boundary.** Rules run in a fixed order (markup FIRST) and tests assert against real browser error text — add a rule there, with a case, not a call-site filter.
- **e2e pre-grants `<all_urls>`** so it never exercises the declined path (unit tests do), and
  **branded Chrome 137+ ignores `--load-extension`** — extension e2e uses bundled Chromium, and
  Phase 8's Chrome-Beta nightly cannot work as specified.
- `web_accessible_resources` must stay `<all_urls>` (CSP-proof player iframe); `webNavigation` must
  not be added; `chrome.storage.sync` redaction rules are correct; worker state lives in
  `chrome.storage.session` (`tb_sw_state_v1`) — mutate only after awaiting `_hydrated`. The SDK runs
  in the page's **MAIN world**: no secrets in page `localStorage`, ever.
