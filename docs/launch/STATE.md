# Launch state — read this, not the archives

Engineering state only, verified against code and git. Last updated 2026-11-01. Calendar, channels and
the 32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored; a
scheduling doc, not a spec — may be stale). History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`.
Open phases: `PLAN.md` 8, 11, 12.

## Where things stand

- **1.11.3 is live everywhere**: Chrome Web Store (approved 2026-10-30), AMO, npm (`tracebug-sdk` and
  `tracebug` both `latest`), MCP registry (`io.github.prashantsinghmangat/tracebug`), website. Tagged
  `v1.11.3` (`0a9a038`); `main` is at `4271e9c` (site/docs on top of the tag).
- **1.11.4 is released (2026-11-01)**: Chrome Web Store, AMO, npm (`tracebug-sdk`, `tracebug`), website
  (`main`), tag `v1.11.4`. **MCP registry still lists 1.11.3**: run `mcp-publisher publish` from
  `packages/tracebug` (see `docs/RELEASING.md` §6). Contents: clicks record the field values their button
  acted on, favicon/asset failures dropped from repro steps and the AI prompt, `console.error(err)` keeps
  message + stack, the extension's injected bundle is 42% smaller (axe-core stubbed), plugin
  `onReport`/`onExport` hooks fire, website on Next 14.2.35 with the image optimizer off. How to release:
  `docs/RELEASING.md`.
  `package-lock.json`'s root version was not bumped (uncommitted edit pending; agents are
  permission-blocked from that file).
- **Gates**: `node scripts/check.mjs --full` green — 955 tests / 61 files, `ext:lint` 0 errors / 14
  warnings (baseline lowered 26 → 14 on 2026-10-31: the axe-core stub removed 12 warnings that came from
  axe's own code in the injected bundle; the `tabCapture` feature-detection warnings are still among the 14).
- **Hygiene audit 2026-10-31** (`docs/audit/hygiene-2026-10-31.md`): approved rows applied, uncommitted —
  see `PROGRESS.md` 2026-10-31. Outcomes that matter here:
  - The injected extension bundle (`tracebug-sdk-ext.js`) no longer carries axe-core: 3.45 MB → 1.99 MB.
    The script-tag/npm builds keep it (`scanPage()` is public API there).
  - **Website: Next 14.2.35 with the image optimizer off** (`images: { unoptimized: true }` — nothing
    uses `next/image`). That closes the two image-optimizer RCEs (GHSA-2xp9, GHSA-2464). Still open
    until a Next ≥ 15.5.28 upgrade (**user decision: not now**): GHSA-p293 (RCE only when the Next server
    runs on Windows — production is Netlify/Linux) and 22 non-critical advisories. After the next
    deploy, check by hand that `https://tracebug.dev/_next/image?url=…` no longer serves (it was
    answered by Netlify Image CDN before the change).
  - **Plugin `onReport` / `onExport` hooks now fire** (they were documented but never called):
    `buildReport()` runs `onReport`; 9 text exports run `onExport` (format names in
    `docs/api-reference.md`). A throwing/wrong-typed hook is skipped with a warning. `tests/plugin-hooks.test.ts`.
  - The script-tag SDK is built straight to `website/public/tracebug-sdk.js` — the only copy;
    `tracebug-extension/tracebug-sdk.js` no longer exists.
  - Deferred by the user: lazy-loading the 269 KB rrweb replay runtime in the extension (audit #3),
    root `npm audit fix` (audit #4).

- **Recording Tab/Desktop work on `develop`, uncommitted (2026-11-01)** — see
  `docs/audit/recording-architecture-proposal.md`; user decisions in PROGRESS 2026-11-01.
  - **`tabCapture` is a REQUIRED Chrome permission now** (user decision after the evidence below;
    `build-ext.mjs` adds it with `offscreen`; `manifest.json`; Firefox build has none). Existing Chrome
    users get Chrome's re-approval prompt on the update (RELEASE_CHECKLIST row 13). The optional-grant
    machinery is gone: popup request-on-Start, the parked start in `chrome.storage.session`, the
    `permissions.onAdded` Tab listener, the Options "Record current tab" card, the worker's
    namespace-binding retry (STATE's old "Tab-mode retry is unproven" item is moot).
  - **Why (measured in real Chromium with scratch probes, not in the repo):** `getMediaStreamId` needs
    the extension invoked on the tab (`<all_urls>` doesn't substitute); invoked → works, incl. after
    same-origin navigation; cross-origin navigation → refused until invoked again. A tab invoked
    BEFORE an optional grant stays refused after it (even re-invoked or reloaded) — so the optional
    flow could never record the tab it was granted on. A runtime grant binds `chrome.<ns>` in a
    running worker instantly. **Jam 5.96.0 and BetterBugs 1.1.10** (manifests read from their CWS
    packages) declare `tabCapture` + `<all_urls>` required and capture the same way TraceBug does.
  - Tab is the Chrome default for users on the default (`surfaceSetBy` in `tb_record_opts`;
    `resolveSurface` in `popup.js`); Firefox hides the switch. A fallback to the share dialog names its
    reason (`permission` / `not-allowed` / `expired` / `unavailable`; `explainTabModeFallback`); an
    expired stream id falls back instead of failing. No picker hint in extension Tab mode.
  - **`setInnerHTML` tries the Trusted Types policy first** (`src/ui/helpers.ts`): on youtube.com the
    raw-first order logged one violation per call in chrome://extensions Errors though the UI rendered.
  - **`ext-video-recording-tab` used to prove nothing** (it read the content script's instant ack and
    the fake-UI flag auto-accepted the picker). Scenario 1 now asserts the real fallback reason; the
    no-picker path is manual (row 11) — headless can't click the toolbar icon.
  - **Gates:** `check.mjs --full` green: 979 tests / 64 files, `ext:lint` 0 errors / 12 warnings
    (baseline 14 → 12 across these changes), versions 1.11.4. e2e: tab 8/8, trusted-types 9/9,
    style-nonce 7/7 (desktop 8/8 and shipping-path 16/16 earlier in the day, before the permission move).
  - **Mic narration was dropped in Tab mode — fixed** (`offscreen.js`): MediaRecorder records only the
    FIRST audio track; Tab mode had tab audio first, mic second (Desktop + "Share tab audio" + mic too).
    Measured: tab track disabled + live mic → silent file. Now >1 audio source is mixed into one track
    (`_mixAudioCtx`); probes: mic survives with the tab track disabled, tab audio survives a muted mic,
    mic-off path unchanged. `check.mjs --full` 982/64; e2e desktop 8/8, tab 8/8.
  - **Empty short recordings — fixed** (`offscreen.js` `waitForFirstData`): MediaRecorder writes nothing
    for the first ~2–3 s (Chromium 149: first data ~3.1 s; VP8 or VP9, static or animated page), so a
    Stop before then saved 0 bytes — the cause of `ext-shipping-path`'s intermittent "video rode along"
    failure too. An explicit stop now keeps recording until ≥1 KB is written (≤6 s), then stops; if the
    recorder ends during the wait it keeps what it has. A/B at a 1 s stop: 0 bytes → ~70 KB, audible.
    Trade-off: a Stop in the first ~3 s takes that long to finish.
  - **Owed by hand:** RELEASE_CHECKLIST rows 11–13, 12b, 15; Firefox not looked at. Step 2 (Tab from
    the on-page toolbar) not started — the measured rule above answers its question (works on a tab
    TraceBug was opened on, until a cross-origin navigation).

## What 1.11.x added (pointers — details live in PROGRESS and the audit docs)

- **1.11.2**: SDK isolation (`tracebug-sdk-ext.js` under `window.__TraceBugExtension`, defers when a
  host page's own toolbar is up — `docs/launch/sdk-isolation-1.11.2.md`); screen recording restored
  (`VIDEO_ENABLED_IN_EXTENSION = true`, `offscreen` permission back); T-01/02/05/06/13 UI fixes.
- **Host-page CSP hardening**: Trusted Types (`setInnerHTML()` with TraceBug's own policy) and
  `style-src` (nonce borrowing in `createStyleTag()`, inline styles replayed through the CSSOM) — both in
  `src/ui/helpers.ts`; e2e `ext-trusted-types-page`, `ext-style-nonce-page`. PROGRESS 2026-10-23/26.
- **1.11.3**: Tab record mode via `chrome.tabCapture` (**optional** permission only, never at install;
  falls back to the Desktop picker on decline or on Firefox, feature-detected). HUD mic-mute works for
  extension recordings via the `tb:rec:mic-mute` offscreen RPC (**Bug 4 is fixed**). Three Tab-mode bugs
  and the stuck REC badge fixed before release. `docs/audit/capture-flow-1.11.3.md`, PROGRESS 2026-10-29.

## Open — all of it needs a person

1. **Release 1.11.4**: tag, merge to `main`, `npm run zip:ext` → CWS + AMO uploads, npm publish (both
   packages), MCP registry (`mcp-publisher`), website deploy. Not done from here (no push, no publish).
2. **Manual checks never recorded as run** (1.11.3 shipped with them open):
   `docs/RELEASE_CHECKLIST.md` rows 1–3 and 9 (video upgrade path, oversize notice), 10 (diagnostics),
   11–15 (Tab mode's real permission prompt, decline fallback, existing-user update, macOS, Firefox
   fallback); the popup's "already capturing" state (`applyCapturingUI()` in `popup.js` — not
   e2e-coverable); store screenshots vs. the current popup and welcome page.
3. **Tab-mode retry is unproven**: `resolveTabCaptureStreamId`'s bounded retry targets a
   `chrome.tabCapture` binding race in an already-running worker that can't be reproduced here. Re-run the
   repro (grant Tab permission, start a Tab recording without reopening the extension).
4. **Firefox pass is partial**: rows 16–17 (mic grant, countdown mic toggle) verified by hand. Row 15
   (Tab greyed out, Desktop via the window-host recorder — `offscreen.js`'s `IS_WINDOW_HOST` branch) and
   the 2026-10-23 capture-flow/rendering fixes are Chromium-only so far. No automated Firefox e2e exists
   (`npm run ext:firefox` is interactive).
5. **Website unverified pages**: `/privacy` (mentions `offscreen`), `/try`, `/bye`, and one real `/bye`
   submission arriving in Netlify Forms under `uninstall`.
6. **Known, accepted gap**: Bug 2 — no fullscreen in the video player / exported viewer
   (`docs/launch/video-1.11.1.md`). Polish, not a blocker.
7. **Open architectural question**: the DOM-marker alternative to the in-memory host-UI heuristic in
   `handleComboAction` — see PROGRESS's "Open architectural question" note. Proposed, not acted on.

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
  `src/video-recorder.ts` and ships `offscreen.{html,js}` — plus the `offscreen` manifest permission,
  gated the same way — only when true. 1.11.2 flipped it (30 files in each zip now, was 28 with video
  off). It **throws** if the constant is renamed: a silent "off" would ship a build with no recorder.
  A future pause would need the reverse: flip it back to `false` and re-run `zip:ext` to confirm the
  count drops to 28 and the permission is gone.
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
  `enableDashboard: false` is unaffected. **Telling "our own surviving mount" apart from a real host
  UI no longer relies only on `activeTabs`** (in-memory/`chrome.storage.session`, which does not
  survive an extension reload or update) — `src/dashboard.ts`'s `mountDashboard()` also sets a
  page-scoped `tracebug_ext_owns_ui` sessionStorage marker (`EXTENSION_OWNER_KEY` in
  `page-support.js`), reported back as `extensionOwned` on `TB_PING` and checked by `injectSDK()` —
  see PROGRESS.md 2026-10-26 ("closed for real") and `e2e/ext-reload-reinject.e2e.mjs`.
- **The DOM replay never records canvas**, so a canvas page replays as an empty box;
  `src/replay-fidelity.ts` warns above 25% of the viewport, branching its advice on `isVideoOffered()`.
- **`diagnostics.js` `scrub()` is a privacy boundary.** Rules run in a fixed order (markup FIRST) and tests assert against real browser error text — add a rule there, with a case, not a call-site filter.
- **e2e pre-grants `<all_urls>`** so it never exercises the declined path (unit tests do), and **branded
  Chrome 137+ ignores `--load-extension`** — e2e uses bundled Chromium, so Phase 8's Beta nightly cannot work.
- `web_accessible_resources` must stay `<all_urls>` (CSP-proof player iframe); `webNavigation` must
  not be added; `chrome.storage.sync` redaction rules are correct; worker state lives in
  `chrome.storage.session` (`tb_sw_state_v1`) — mutate only after awaiting `_hydrated`. The SDK runs
  in the page's **MAIN world**: no secrets in page `localStorage`, ever.
- **The extension build stubs html2canvas and axe-core** (`tsup.config.ts`); the script-tag build
  (`website/public/tracebug-sdk.js`) stubs only html2canvas. A feature that needs axe in the extension must remove that
  stub deliberately — it will otherwise silently return no a11y results.
