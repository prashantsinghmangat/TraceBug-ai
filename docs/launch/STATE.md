# Launch state — read this, not the archives

Engineering state only, verified against code. Last updated 2026-10-19. Calendar, channels and the
32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored).
History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`. Post-submission phases: `PLAN.md` 8, 10, 11, 12.

**1.11.1 is the capture fixes and is release-ready** (the audit's Option A — see below); zips built,
28 files, `PK`. **Video moved to 1.11.2** (PLAN Phase 10): the capture fixes are done and help every
user, video bug 1 still has no confirmed cause. **All engineering for 1.11.0 is
done; everything left there is human-only.** Branch `develop`, **1.11.1** on the eight surfaces `check:versions` guards. `check.mjs --full`: **894 passing / 53 files**,
`ext:lint` 0 errors / 69 warnings. Phases 0–7 and 9 are closed (permissions optional, secrets and
provider calls out of the host page, restricted pages and orphaned tabs handled, events-only capture
the default, bundled welcome page, "What's new" card, uninstall survey, review ask, export footer,
issue credit, oversize notice, canvas warning, docs and copy consistency). Phase 8 is deferred but
for `e2e/paths.mjs` (headless anywhere) and `e2e/ext-no-secrets-in-page.e2e.mjs` (in CI).

**Screen recording is PAUSED in the extension — it returns in 1.11.2.** `VIDEO_ENABLED_IN_EXTENSION` in
`src/video-recorder.ts`, enforced at the transport; a stored `tb_record_opts.video: true` is read and
ignored, never erased, and the `offscreen` permission is out of both manifests with it. Four bugs and
the restore checklist: `video-1.11.1.md` (the FILE name is historical — video is now 1.11.2). The npm SDK is untouched and records video as before.

## 1.11.1 so far — capture, before video

`docs/audit/capture-architecture.md` is the source: a tester's "0 events" ticket, with every cause
reproduced in a real browser. Its **Option A is now shipped** (uncommitted on `develop` unless noted):

- **The worker owns "is a capture running"** (`captureTabs` + `tb:capture:status` in `background.js`,
  `src/capture-ownership.ts`). A cross-origin move ends the capture and the next page says *"Capture
  ended when you left <host>"*; the stale per-origin flag is cleared instead of resurrecting a HUD.
  This is **slice one of ADR 008** — `docs/adr/008-extension-owns-the-session.md`, PLAN Phase 12.
- **Network rows are deduped** (`src/network-dedupe.ts`) — the Resource Timing twin of every fetch/XHR
  is dropped, wrapper row wins, static assets kept. No more phantom `GET` beside a real `POST`.
- **The page load is reported again** — the attach-time drain used to mark it all "seen" while
  recording was false. Now failed-or-slow pre-capture requests come through as `phase: "page-load"`.
- **contenteditable typing is captured** under the same redaction and 200-char cap as `<input>`, and
  the DOM replay **masks sensitive editors** (`src/replay-masking.ts`) — it used to hold in full what
  the event row had redacted.
- **The HUD is honest**: "Replay, not video" next to the dot, plus a live `N events · M requests`
  tally that runs the same dedupe the ticket will.
- **Frame-heavy pages are warned** (`framesCaptureWarning`), on the canvas pattern. **No `allFrames`
  in 1.11.x, deliberately** — it would put input capture inside Stripe/Auth0 frames. v2.0 instead.

**`e2e/ext-cross-site-capture.e2e.mjs` is new and must stay green** (A → B → A: same-origin resumes,
cross-origin ends and says so, no zombie on return). When Phase 12 lands, that spec inverts.

Still open: video (Phase 10) is untouched, and the replay's pattern pass is unbenchmarked on a large
snapshot.

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
  `src/video-recorder.ts` and ships `offscreen.{html,js}` only when true, so 1.11.3 (video,
  `docs/launch/PLAN.md` Phase 10b — renamed from "1.11.2" when 1.11.2 became the correctness phase)
  flips one constant and they return (28 files -> 30). It **throws** if the constant is renamed: a
  silent "off" would ship a build with no recorder.
- **Two TraceBug instances on one page isolate STATE but not DOM.** The extension's injected SDK
  (`tracebug-sdk-ext.js`, `window.__TraceBugExtension`) and a host page's own npm-SDK integration
  (`tracebug-sdk.js`, `window.TraceBug`) are separate globals since `docs/launch/sdk-isolation-1.11.2.md`
  — but both still mount into the same shared DOM under the same hardcoded ids
  (`src/dashboard.ts`), so state isolation alone doesn't stop a second toolbar from trying to appear.
  **Deliberately not supported**: if a host page's own TraceBug toolbar is already up, the extension
  defers entirely (no injection at all, not even under its own global) rather than mounting a second
  one — `background.js`'s `injectSDK()` detects this via `page-support.js`'s
  `detectHostTraceBugUI()` before injecting, same signal `content-script.js`'s `TB_PING` already used
  for repair. The popup shows "This site runs its own TraceBug"; `Alt+B` shows the same sentence as
  an on-page shadow-root notice. A host page whose own SDK integration passes
  `enableDashboard: false` is unaffected.
- **The DOM replay never records canvas**, so a canvas page replays as an empty box;
  `src/replay-fidelity.ts` warns above 25% of the viewport, branching its advice on `isVideoOffered()`.
- **`diagnostics.js` `scrub()` is a privacy boundary.** Rules run in a fixed order (markup FIRST) and tests assert against real browser error text — add a rule there, with a case, not a call-site filter.
- **e2e pre-grants `<all_urls>`** so it never exercises the declined path (unit tests do), and **branded
  Chrome 137+ ignores `--load-extension`** — e2e uses bundled Chromium, so Phase 8's Beta nightly cannot work.
- `web_accessible_resources` must stay `<all_urls>` (CSP-proof player iframe); `webNavigation` must
  not be added; `chrome.storage.sync` redaction rules are correct; worker state lives in
  `chrome.storage.session` (`tb_sw_state_v1`) — mutate only after awaiting `_hydrated`. The SDK runs
  in the page's **MAIN world**: no secrets in page `localStorage`, ever.
