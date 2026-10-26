# Launch state — read this, not the archives

Engineering state only, verified against code. Last updated 2026-10-24. Calendar, channels and the
32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored, and now
stale on the video-pause dates below — not corrected, it is a scheduling doc, not a spec).
History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`. Open phases: `PLAN.md` 8, 11, 12 (10b's
"flip the switch" step and 1.11.3's Tab-mode step are both DONE — see below).

**1.11.3 adds a Jam-style no-picker "Tab" record mode** (`docs/audit/capture-flow-1.11.3.md`, the
user's explicit decision to add `tabCapture` as an **optional** permission — never required, never at
install). `chrome.tabCapture.getMediaStreamId` is resolved in `background.js` (`resolveTabCaptureStreamId`,
only background has a real tab to target) and handed to `offscreen.js`, which consumes it via
`getUserMedia`'s legacy `chromeMediaSource` constraint and re-routes the captured tab audio back to the
user's speakers (chrome.tabCapture mutes it otherwise). The popup's Record options gained a **Tab |
Desktop** switch (`popup.js`'s `surfaceTabBtn`/`surfaceDesktopBtn`, replacing the old dead `#optSurface`
select) that requests the permission synchronously on first use and falls back to Desktop's picker on
decline or on Firefox (no `chrome.tabCapture` there — feature-detected, not user-agent-branched).
Options gained a matching grant/remove card. **Bug 4** from `video-1.11.1.md` (HUD mic-mute wired to a
stream the extension page doesn't own) is now properly fixed via a `tb:rec:mic-mute` offscreen RPC,
not just safely disabled — see `tests/video-enabled-1-11-2.test.ts`'s updated "Bug 4 is fixed" test and
`src/video-recorder.ts`'s `_extMicIncluded`/`_extMicMuted` cache. Verified with two new real-browser
e2e scenarios in `e2e/ext-video-recording-tab.e2e.mjs` (no-picker start, same-origin nav survival) —
8/8 — plus the existing Desktop-mode and shipping-path suites re-run clean. **Not verified here, and
listed in `docs/RELEASE_CHECKLIST.md` rows 11-15**: the real Chrome permission-prompt click, the
decline-fallback UI in a live browser, that an existing 1.11.2 user is not disabled on update, macOS's
Screen Recording permission interaction (if any) with Tab mode, and a real Firefox run (`npm run
ext:firefox` cannot be driven from here — it blocks until a human closes the browser).
`scripts/check-baseline.json`'s `ext:lint` baseline was raised 22 → 26 (user-approved): `chrome.tabCapture`
references in the three shared files now flag `UNSUPPORTED_API` on the Firefox lint target, harmlessly,
since Firefox never reaches that code path (feature-detected).

**Known pre-existing drift, found while working here, not fixed in this pass:** several of
`CODEMAP.md`'s `background.js` symbol line numbers (`injectBridge`, `injectSDK`, `handleComboAction`,
`pingTab`, the message-verb table, etc.) were already hundreds of lines stale **before** this change —
confirmed while locating `handleRecordingMessage` (mapped ~1055, actually 1302 pre-1.11.3 edits). This
pass only corrected the two entries it directly touched (`background.js`'s line count,
`video-recorder.ts`'s mic-function lines). `background.js` deserves a full CODEMAP re-pass next time
someone is in that file.

**1.11.2 is release-ready** (PLAN Phase 10a, correctness — plus screen recording). 1.11.1
is tagged (`v1.11.1`, `42becbb`) and pushed. Branch `develop`, **1.11.3** on the eight surfaces
`check:versions` guards. `check.mjs --full`: **939 passing / 58 files**, `ext:lint` 0 errors /
26 warnings (baseline raised from 22 for the `tabCapture` feature-detection above). The npm packages
(`tracebug-sdk`, `tracebug`) are still **1.10.1 on npm** — 1.11.x has never been published there.

**Screen recording is RESTORED in the extension as of 1.11.2** (PLAN Phase 10b, done — this moved up
from 1.11.3). `VIDEO_ENABLED_IN_EXTENSION = true` in `src/video-recorder.ts`; a stored
`tb_record_opts.video: true` is honoured again, the `offscreen` permission is back in both manifests
(`tracebug-extension/manifest.json`, and `build-ext.mjs`'s `chromeManifest()` gates it on the same
flag it already parses), and the popup's `optVideo`/`micOpt` markup is back. Of the four bugs in
`docs/launch/video-1.11.1.md` (the FILE name is historical): **Bug 1** (recording lost on stop) was
re-verified in a real browser two ways (plain stop, mid-recording reload) and did **not**
reproduce — the `quick-bug.ts` stash-then-refresh rework (`dda5ac8`) looks to have already fixed it;
see `e2e/ext-video-recording.e2e.mjs`. **Bug 4** (HUD mic-mute wired to a stream the extension never
owns) is still real, left unfixed on purpose: `hasMicrophoneTrack()` is permanently false for the
extension transport, so the button already renders disabled with an honest tooltip instead of a dead
click. **Bug 2** (no fullscreen in the player) is still open, polish only, not a blocker. The npm SDK
was never affected and records video as before.

**A host page enforcing Trusted Types CSP used to break the entire dashboard** — confirmed live on
stitch.withgoogle.com, which sets `require-trusted-types-for 'script'`. That gates every HTML-string
sink (innerHTML/outerHTML/insertAdjacentHTML, and — contrary to a common belief — also
`DOMParser.parseFromString` and `Range.createContextualFragment`), so all 89 raw
`el.innerHTML = html` assignments across the dashboard, toolbar, HUD and ticket-modal code threw
synchronously there. Fixed: `src/ui/helpers.ts`'s `setInnerHTML()` — direct assignment, then
TraceBug's own cached Trusted Types policy (works unless the site ALSO restricts which policy names
are allowed, confirmed stitch.withgoogle.com does not), then a safe empty-rather-than-throw last
resort. `ext:lint` warnings dropped 69 → 22 as a direct, confirming side effect. See
`e2e/ext-trusted-types-page.e2e.mjs` and `PROGRESS.md` 2026-10-23.

## What 1.11.2 contains

- **Bug 0 — SDK isolation** (`docs/launch/sdk-isolation-1.11.2.md`): the extension injects
  `tracebug-sdk-ext.js` under `window.__TraceBugExtension`; it never adopts a page's `window.TraceBug`,
  and **defers entirely** when a host page's own toolbar is up. `tracebug-sdk.js` is no longer in the
  package (~700 KB smaller). `e2e/ext-sdk-isolation.e2e.mjs` 17/17.
- **T-01/T-02**: Summary skips noise requests; tracker buttons say "Send to…" when configured.
- **T-05**: no MCP modal after export — a one-line "Open in your AI agent →" link on the toast.
- **T-06**: the live error card drops its Capture button while a capture runs.
- **T-13**: popup "Keep capturing across sites" row removed; `tb_host_perm_declined` no longer
  written. Options shows an existing `<all_urls>` grant with **Remove**. `<all_urls>` stays declared
  optional — it is what lets settings request a single custom Ollama host.
- Ollama: changing/removing a custom host releases the old origin. Welcome page v2 (three steps,
  `npx tracebug mcp` + Copy, `⌥` on Mac, Firefox pin copy).

## What 1.11.3 adds

- **Tab mode**: a no-picker current-tab recording via `chrome.tabCapture`, `tabCapture` added to
  `optional_permissions` only (user-approved; never required, never at install). Popup's Record
  options gained a **Tab | Desktop** switch; Options gained a matching grant/remove card. Falls back
  to Desktop's picker on decline or on Firefox (no `chrome.tabCapture` there).
- **Bug 4 fixed properly** (`video-1.11.1.md`): the HUD mic-mute button now works for an extension
  recording via a new `tb:rec:mic-mute` offscreen RPC, not just rendered disabled.
- See `docs/audit/capture-flow-1.11.3.md` and `PROGRESS.md` 2026-10-24 for the full writeup.
  **Uncommitted** — nothing in this section has been pushed or tagged yet.

## Left before release — all of it needs a person

1. **Uncommitted on `develop`**: everything in "What 1.11.3 adds" above, plus the earlier-committed
   `247d65e` (REC badge) and `6782e3a` (video restore). Per the repo's "never push" rule, nothing here
   pushes or tags itself — push `develop`, merge to `main`, tag `v1.11.3` once the manual rows below
   (including the new 11–15) are walked. `package-lock.json` has an unrelated pre-existing modification
   still sitting uncommitted — decide what to do with it before pushing.
2. **`docs/RELEASE_CHECKLIST.md`** — now needs a **full** manual pass, not just 10a–10h: rows 1–3
   (video setting survives the upgrade) and row 9 (oversize-export notice) are live again now that
   video is restored and have not been run by a human yet, only by the new e2e. Plus 10 (diagnostics)
   and the new **11–15** (Tab mode's permission prompt, decline fallback, existing-user update,
   macOS, Firefox fallback — none of which can be driven from here). Run in Chrome **and**
   `npm run ext:firefox` (not a gate — `web-ext run` blocks until Firefox
   closes). Firefox needs its own look at video specifically: it uses a window-host recorder, not
   Chrome's offscreen document (`offscreen.js`'s `IS_WINDOW_HOST` branch), and that path has only ever
   been exercised by reading code, not by a real recording in Firefox.
3. **Store screenshots**: the popup gained a video checkbox + mic row back (on top of the row it lost
   earlier) and the welcome page is new; check the five listing shots still match.
4. **Build zips** (`npm run zip:ext` — 30 files per zip now, was 28 with video off), upload to CWS and
   AMO with the §4 copy in `store-submission-pack.md`, **and** the `offscreen` permission justification
   now in §7b — a listing that doesn't justify a permission the manifest requests is a review flag.
5. **npm**: publish `tracebug-sdk` and `packages/tracebug` 1.11.2 (and the MCP registry `server.json`).
6. **Deploy the website** (Netlify, `website/`), then check `/privacy` (now mentions `offscreen`),
   `/try`, `/bye`. One real `/bye` submission must show in Netlify Forms under `uninstall`.
7. **Known, accepted gaps to disclose or track, not block on**: Bug 2 (no fullscreen in the video
   player/exported viewer) and Bug 4 (HUD mic-mute button renders disabled in the extension rather
   than working) — both in `docs/launch/video-1.11.1.md`.
8. **Manually verify the popup's "already capturing" state** (`applyCapturingUI()` in `popup.js`):
   start a capture, reopen the popup, confirm it shows "Capturing…" with the hero button disabled
   instead of inviting a second start. This one is NOT covered by e2e — Playwright can't drive a real
   MV3 action popup without breaking its `active tab` resolution — only by code review and the unit
   test for the `GET_STATE` field it reads.
9. **A manual Firefox pass is still owed.** Everything in this round's six capture-flow / rendering
   bugs (see `PROGRESS.md` 2026-10-23 entries) was verified in Chromium only — this project has no
   automated Firefox e2e (`npm run ext:firefox` is interactive, deliberately not a gate). `background.js`
   and `src/ui/helpers.ts` are shared files, not Chrome-specific, so the fixes should carry over, but
   none of them has actually been run in Firefox yet.

All six bugs this round were found by hand-testing the real unpacked extension — none were caught by
the original e2e suite, because it drove `background.js` through synthetic `sendMessage` shortcuts
rather than real popup clicks, real worker restarts, or real host-page CSP. The sixth (a hydration
race in `handleComboAction`) is the likely TRUE root cause tying together the chatgpt.com and
stitch.withgoogle.com host-UI misdiagnoses reported at different points — a narrow timing window, not
anything site-specific. An architectural simplification was proposed but not acted on: see
`PROGRESS.md`'s "Open architectural question" note for the DOM-marker alternative to the current
in-memory-bookkeeping heuristic.

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
