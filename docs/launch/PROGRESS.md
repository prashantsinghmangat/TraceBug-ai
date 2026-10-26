# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## A fourth capture-flow bug: worker restarts mislabeled real sites as "runs its own TraceBug" (2026-10-23)

- **What:** the user hit the exact same host-UI error on an ordinary site (chatgpt.com) that had been
  working a moment before — this time with video mode on. Root cause: `injectedTabs` (`background.js`)
  is in-memory only and does not survive an MV3 service-worker restart (the ~30s idle timeout, or an
  extension reload — which the user had just done to pick up this round's fixes), even though the
  tab's content script and page-world SDK do, since they're tied to the page, not the worker.
  `handleComboAction` trusted `injectedTabs.has(tabId)` alone to choose between the repair path
  (`ensureAlive`, safe) and the fresh-injection path (`injectSDK`, whose host-UI check assumes any
  TraceBug DOM it finds belongs to a host page — correct for a truly fresh tab, wrong for our own
  surviving instance). A restarted worker always guessed "fresh," so the very next click on ANY
  already-working tab risked this exact misdiagnosis.
- **Fix:** `handleComboAction` now also trusts `activeTabs` (which IS persisted across a restart,
  unlike `injectedTabs`) plus a live ping before falling through to `injectSDK()`'s host-UI check. A
  ping alone can't disambiguate — "alive + a TraceBug element exists" looks identical whether it's
  ours or a genuine host UI — `activeTabs` is what tells the two apart: it's only ever set after we
  ourselves successfully injected this tab, so if it's there, a later ping finding the same markers
  can only mean our own instance survived.
- **Verified:** two new unit tests in `tests/background-tab-lifecycle.test.ts` (the restart-repair
  case AND the control case — a genuinely untouched tab with a real host UI must still be refused),
  plus a new real-browser e2e, `ext-worker-restart-reinject.e2e.mjs`, that kills the service worker for
  real via CDP (`ServiceWorker.stopAllWorkers`, confirmed with a sentinel the same way
  `ext-cross-site-capture.e2e.mjs` does) without touching the original tab's DOM, then clicks Capture
  Bug again on it — 4/4. `check.mjs --full` 929 passing / 57 files; `ext-events-capture`,
  `ext-cross-site-capture`, `ext-badge-host-ui-defer`, `ext-shipping-path`, `ext-video-recording` all
  re-run clean.

## Phase A audit for "1.11.3" — capture-flow map, read-only (2026-10-23)

- **Headline finding: the "1.11.3" brief was stale.** Screen recording is already live as of 1.11.2
  (`VIDEO_ENABLED_IN_EXTENSION = true`, `getDisplayMedia` with the browser's own picker). The real gap
  vs. the brief is a Jam-style no-picker "record current tab" mode via
  `chrome.tabCapture.getMediaStreamId`, which needs the `tabCapture` permission dropped in 1.10.1 to
  avoid Chrome's browsing-history install warning — a product/permissions decision, not unfinished
  engineering. See `docs/audit/capture-flow-1.11.3.md` for the full entry-point trace, state-duplication
  audit, and permissions analysis.
- **Verified, no code changes:** `e2e/ext-video-recording.e2e.mjs` (8/8) and `e2e/ext-shipping-path.e2e.mjs`
  (16/16) re-run clean, both corroborating Bug 1 (video-1.11.1.md) still not reproducing.
- **Open:** whether to add `tabCapture` for a no-picker tab mode is a decision for the user, not yet
  made — no manifest change made. Several scenarios (cross-origin nav mid-recording, worker restart
  mid-recording, two tabs recording at once) have no existing e2e coverage and need new test
  infrastructure before Phase B, not just manual clicking.

## 1.11.3: the "Tab" no-picker record mode, user-approved as an optional permission (2026-10-24)

- **What:** per the user's explicit decision on the Phase A audit, added `tabCapture` to
  `optional_permissions` only (never required, never at install). `background.js`'s new
  `resolveTabCaptureStreamId()` calls `chrome.tabCapture.getMediaStreamId({targetTabId})` (only
  background has a real tab to target) and hands the id to `offscreen.js`, which consumes it via
  `getUserMedia`'s `chromeMediaSource` constraint and re-routes captured tab audio back to the
  speakers (chrome.tabCapture mutes it otherwise). Popup gained a **Tab | Desktop** switch
  (two buttons, not the old dead `#optSurface` select) that requests the permission synchronously on
  click and falls back to Desktop on decline or on Firefox (feature-detected, not UA-sniffed — Firefox
  manifest strips `optional_permissions` entirely in `build-ext.mjs`). Options gained a matching
  grant/remove card. Also properly fixed **Bug 4** (`video-1.11.1.md`) rather than leaving it disabled:
  a new `tb:rec:mic-mute` offscreen RPC, with `micIncluded`/`micMuted` now real fields on
  `tb:rec:started`/`tb:rec:status`, and `src/video-recorder.ts`'s mic functions branch on
  `isExtensionContext()` to use that state instead of the always-null page-side `_stream`.
- **Also fixed two doc inaccuracies the audit's own draft had repeated:** `tabCapture`'s Chrome warning
  is "Read and change all your data on all websites" (same as `<all_urls>`), not the browsing-history
  warning (that's `tabs`, dropped separately in 1.10.1) — corrected in `docs/chrome-extension.md` and
  `docs/audit/capture-flow-1.11.3.md`. Optional permissions also do not trigger Chrome's
  disable-and-reapprove flow on update (that's only for required `permissions`/`host_permissions`) —
  corrected there too.
- **Files:** `tracebug-extension/{background,offscreen,popup,options}.js`,
  `tracebug-extension/{popup,options}.html`, `styles.css`, `manifest.json`,
  `build/{manifest.base.json,build-ext.mjs}`, `src/video-recorder.ts`, `e2e/ext-host-access.mjs` (new
  `withGrantedTabCapture` fixture), new `e2e/ext-video-recording-tab.e2e.mjs`,
  `tests/{record-opts,video-enabled-1-11-2}.test.ts` updated for the new reality (no stale "Bug 4 not
  fixed" pin left behind), `docs/{chrome-extension,RELEASE_CHECKLIST,launch/store-submission-pack}.md`,
  `docs-internal/CHROME-WEB-STORE-LISTING.md`, `website/app/privacy/page.tsx`, eight version surfaces,
  `CHANGELOG.md`, `WHATS_NEW` card, `scripts/check-baseline.json` (22→26, user-approved).
- **Verified:** `check.mjs --full` all green — 939 passing / 58 files, `ext:lint` 0 errors / 26
  warnings (4 new `UNSUPPORTED_API` from `chrome.tabCapture` referenced in shared Chrome+Firefox
  files, baseline raised with the user's sign-off), all 8 surfaces on 1.11.3. New e2e
  `ext-video-recording-tab.e2e.mjs` 8/8 (no-picker start, same-origin nav survival, no Desktop
  fallback). Re-run clean: `ext-video-recording` 8/8, `ext-shipping-path` 16/16,
  `ext-badge-host-ui-defer` 4/4, `ext-worker-restart-reinject` 4/4, `ext-trusted-types-page` 9/9,
  `ext-sdk-isolation` 17/17, `ext-cross-site-capture` 13/13, `ext-events-capture` 22/22.
- **Not verified here (RELEASE_CHECKLIST rows 11-15):** the real Chrome permission-prompt UI and
  click-through, the decline → fallback UI in a live browser, that an existing 1.11.2 user isn't
  disabled on update, macOS Screen Recording interaction with Tab mode (if any), and a real Firefox
  run (`npm run ext:firefox` blocks until a human closes the browser — can't be driven here).

## Release-readiness sweep for 1.11.3 (2026-10-26)

- Gates green (939 / 58 files, ext:lint 0 errors / 26 warnings), knip: no unused files. Zips 30 files, `PK`, `tabCapture` optional only.
- Release notes caught up with the code: CHANGELOG 1.11.3 gained the Trusted Types, worker-restart misdiagnosis, stuck-REC and popup "Capturing…" fixes; the 1.11.3 "What's new" card and store §4 now cover 1.11.2 too, since 1.11.2 never reached the stores.

## The host-UI misdiagnosis, closed for real: survives an extension reload, not just a worker restart (2026-10-26)

- **What:** the user hit "This site runs its own TraceBug" starting a video capture on an ordinary tab
  (claude.ai) that had worked moments before. The 2026-10-23 fix made `activeTabs`
  (`chrome.storage.session`) the tiebreaker for `injectSDK()`'s host-UI check, which covers a bare MV3
  worker-idle restart — but `chrome.storage.session` itself does not survive the extension being
  reloaded or updated while the tab stays open, which is exactly what happened here. With that gone too,
  the worker had nothing left to tell "our own surviving `#tracebug-root`" from a real host UI, and
  guessed wrong again.
- **Fix:** a durable signal that lives in the PAGE, not the extension — `src/dashboard.ts`'s
  `mountDashboard()` sets a `tracebug_ext_owns_ui` sessionStorage marker the moment it mounts (extension
  context only, cleared on teardown); `content-script.js`'s `TB_PING` reports it as `extensionOwned`;
  `background.js`'s `injectSDK()` only throws `HOST_UI_ERROR` when a TraceBug UI exists AND the page
  didn't set that marker itself. Page storage is origin-scoped, not extension-scoped, so it survives
  exactly what `activeTabs` doesn't. Shared key name in `tracebug-extension/page-support.js`
  (`EXTENSION_OWNER_KEY`), duplicated as a literal in `src/dashboard.ts` since that file ships to both
  the npm SDK and the extension bundle.
- **Verified:** new `e2e/ext-reload-reinject.e2e.mjs` (8/8) — forces exactly this gap by clearing
  `chrome.storage.session` before killing the service worker via CDP, confirms the marker survives where
  `activeTabs` doesn't, and that a second Capture Bug click on the same tab succeeds instead of
  misdiagnosing. `check.mjs --full` all green (939/58, `ext:lint` 0/26, unchanged baseline); re-run clean:
  `ext-badge-host-ui-defer` 4/4, `ext-worker-restart-reinject` 4/4, `ext-video-recording-tab` 8/8,
  `ext-shipping-path` 16/16, `ext-sdk-isolation` 17/17 (genuine host-UI defer still correctly refuses).
- **Also removed:** a stale comment in `popup.js`'s `saveRecordOpts()` claiming video is "always false in
  1.11" — 1.11.2 restored the checkbox and the line below it already stores the real value.
- **Open:** the popup's single "Capture Bug" button + a collapsed "Record options" accordion (video
  on/off lives behind a checkbox there) reads as unclear next to Jam's explicit separate
  screenshot/record entries — flagged by the user as confusing, not yet redesigned. Needs a scoped UX
  proposal before touching `popup.html`/`popup.js` further.
