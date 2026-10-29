# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## Mic root cause resolved: Windows OS-level mic privacy, not TraceBug (2026-10-27)

- **The open question above answered "already Allowed"** — the origin permission was genuinely granted,
  yet the offscreen document's own `getUserMedia({audio:true})` still threw. Checked the extension's
  service-worker/offscreen console on the user's machine: `[TraceBug offscreen] microphone unavailable…
  NotAllowedError`, thrown from `_startRecordingImpl` at the mic-acquisition try/catch — confirmed
  deeper than the popup-side fix above, not fixed by it.
- **Root cause, found via web research + the user's own symptom** ("I can hear system/meeting audio, not
  the microphone" — exactly matches the code path: `getDisplayMedia`'s tab-audio track is separate from
  the explicit `getUserMedia(audio)` mic call): Windows has its own OS-level microphone privacy gate
  (Settings → Privacy & security → Microphone), independent of Chrome's own per-site permission. If
  Chrome isn't allowed through it, every `getUserMedia(audio)` call fails with a plain `NotAllowedError`
  indistinguishable from a site-permission block — while screen/tab capture, which never touches that
  gate, works fine. This is a platform/OS setting, not a TraceBug or even a Chrome extension-API bug —
  confirmed when the user enabled it and the mic immediately started working.
- **No code change needed for this part** — the popup-side permission-revalidation fix from the entry
  above is still a real, independent improvement (a stale "ON" toggle with no real permission behind it
  is still possible for other reasons, e.g. revoked permission) and stays in.
- **Found and fixed a second, real bug surfaced by the now-working mic:** the HUD's mic button still
  showed disabled even though audio was genuinely in the recording. `recording-hud.ts`'s `micAvailable`
  was computed ONCE at HUD-mount time from `hasMicrophoneTrack()`, but in extension mode that flips true
  only when the offscreen document's separate `tb:rec:started` broadcast arrives — a slower, differently-
  routed message (queries every tab, then messages each one) with no ordering guarantee against the
  `tb:rec:start` RPC response that triggers the HUD to mount. If the broadcast lost that race (as it did
  here), the button stayed permanently stuck disabled for the whole recording despite the mic actually
  working. Fixed by piggybacking a re-check onto the HUD's existing 500ms timer poll: once the button is
  disabled, it keeps checking `hasMicrophoneTrack()` and flips itself (icon state, title, disabled
  attribute) the moment it actually becomes available, instead of only ever reading it once.
- **Verified:** `check.mjs --full` all green (936/58, unchanged). Not verified against a real recording
  by hand from here — the user's own machine now has a working mic, worth one more real capture to
  confirm the HUD button updates correctly live.
- **Added to the plan, user-requested, not investigated further:** an audio transcript of the recorded
  mic narration, as a future idea — see `docs/launch/PLAN.md`'s new "Ideas parked for later" section.

## Popup decluttered: compact site box, Redaction rules + diagnostics moved to settings (2026-10-27)

- **User-requested**, pointing at the popup's own screenshot: the hostname/path box felt oversized for
  what it shows, and "Redaction rules" / "Having trouble?" felt like unused settings-shaped controls
  eating scroll space on every popup open.
- **Hostname box**: `styles.css`'s `.site-label` was a stacked two-line box with 8px/12px padding; now one
  compact line (host + path side by side, path ellipsis-truncated) with tighter padding.
- **Redaction rules and "Having trouble?" (diagnostics) moved from the popup to `options.html`/`options.js`**,
  as two new cards matching the page's existing card style (next to the mic/tabCapture/AI-site cards).
  Removed entirely from `popup.html`/`popup.js` (including the now-dead `.redact-*` CSS block and the
  `diagnostics.js` `<script>` tag popup.js no longer needs) rather than just hidden — these were full
  features, not stubs, so the move is a real relocation: same `chrome.storage.sync` key
  (`tracebug_redact`) for redaction rules, same scrubbed-text diagnostics via `diagnostics.js` (now also
  loaded by `options.html`). One real behavior difference: the popup's diagnostics read a per-tab page
  classification (`diagPageState()`, since the popup opens for a specific tab); `options.html` isn't tied
  to any tab, so that field is a fixed, honest string instead of a guess.
- **Found and fixed a test regression from the move itself:** `tests/diagnostics.test.ts` scraped
  `popup.js`'s source text for the diagnostics functions to verify they existed and behaved correctly —
  four of its assertions broke since that code moved. Updated them to scrape `options.js` instead,
  adjusted for the new function/constant names (`initDiagnosticsCard`, `PAGE_STATE`). Also found the new
  redaction card's `chrome.storage.sync.get()` call crashed `tests/options-ai-host-permissions.test.ts`'s
  options.js load (that test's mock `chrome` object has no `storage.sync` at all, only `storage.local`) —
  wrapped the call in `try {}` to degrade silently when the API isn't there, matching how the rest of
  this file already treats optional browser APIs.
- **Verified:** `check.mjs --full` all green (936/58, unchanged). `tests/diagnostics.test.ts` 33/33.

## REC badge stuck after toolbar-stop; mic-mute RPC dropped; three Tab-mode bugs (2026-10-29)

- **Two bugs found hand-testing before release, both fixed:** the on-page toolbar's own Stop button
  called `video-recorder.ts`'s `stopVideoRecording` directly instead of `index.ts`'s wrapper, so it
  never told the worker the capture ended — the REC badge stuck forever (`compact-toolbar.ts`, now calls
  `announceCaptureStopped()` too). Separately, `content-script.js`'s RPC allowlist was missing
  `tb:rec:mic-mute`, so every HUD mic-mute click was silently rejected before reaching `offscreen.js` —
  the icon flipped but the real track stayed unmuted.
- **Three real Tab-mode bugs found by the user hand-testing 1.11.3's Tab recording, all fixed:**
  (1) `popup.js`'s Tab-select permission grant saves `surfaceMode` only inside the
  `chrome.permissions.request` callback, which never runs if the native OS dialog kills the popup first
  (it does) — fixed with a `chrome.permissions.onAdded` listener in `background.js` that persists the
  choice independent of the popup's survival. (2) `background.js`'s `resolveTabCaptureStreamId` bailed
  to the Desktop/getDisplayMedia fallback the instant `chrome.tabCapture` looked absent, which can
  happen in an already-running service worker right after a grant — reordered to check
  `permissions.contains` first and retry briefly (5×100ms) before giving up; separately, the fallback
  flag (`tabModeFallback`) was already computed and returned correctly but never read anywhere, so the
  user got a surprise native picker with zero explanation — `video-recorder.ts` now surfaces it as a
  warning toast. (3) A fully silent recording (no mic, no tab/system audio) had no indication anywhere
  on Chrome — `offscreen.js` already broadcasts `audioIncluded` but nothing read it; `video-recorder.ts`
  now warns when neither mic nor tab audio made it in.
- **Not fixed, genuinely unverifiable from here:** whether bug 2's retry actually closes the race in a
  real browser — the underlying `chrome.tabCapture` binding-visibility timing in an already-running
  service worker can't be reproduced or measured without one. The fix is a bounded, safe improvement
  over bailing immediately; needs a real hand-test (grant the permission, start a Tab recording in the
  same session without reopening the extension) to confirm it actually resolves the user's repro.
- **Verified:** `check.mjs --full` all green — 936 passing/58 files, `ext:lint` 0 errors/26 warnings
  (unchanged baseline; the Tab-mode retry added a `chrome.tabCapture.getMediaStreamId` reference but a
  shared `tabCaptureAvailable()` helper kept the literal occurrence count, and therefore the warning
  count, the same). No new automated test for any of the five fixes — all five need a human clicking
  through a real popup/native-dialog flow, which the existing fake-media-stream e2e harness doesn't
  drive.
