# Video in the extension — what's broken, and what 1.11.1 has to fix

Screen recording is **paused in the extension** for 1.11. One switch turns it
back on: `VIDEO_ENABLED_IN_EXTENSION` in `src/video-recorder.ts`. Do not flip it
until the four bugs below are fixed, because all four were found by using the
product for an hour and none of them was caught by the suite (818 passing /
48 files as of 2026-10-14).

**The npm SDK is unaffected and was never paused.** It records in the page and
owns its own stream, which is precisely why it works.

## Why they all cluster

One root cause, worth stating before the list: **in the extension the recording
lives in an offscreen document, and the page only holds a handle to it.** Every
bug below is a place where page-side code assumes it owns the stream, or where
the hand-off across that boundary drops something. Fixing them one at a time
will work; fixing the seam properly would be better.

A second, sharper lesson: the tests that covered this code asserted *that a key
was passed*, never *that the call was one a browser would accept*. The fake
`getDisplayMedia` in `tests/offscreen-capture.test.ts` accepts any object, so a
self-contradictory constraint pair passed for weeks — one assertion had the
broken value written into it as the expected result. **Any fix here needs a real
browser in the loop**: `e2e/ext-shipping-path.e2e.mjs` is the pattern.

---

## Bug 1 — a recording is lost on stop (WORST)

**Symptom.** Capture with video from the popup, reproduce, stop. The ticket
opens empty: no video, no screenshot. The session timeline *does* show
`Video started` … `Video stopped` and the user's clicks, so the recording ran.

**What that tells us.** The capture succeeded; the **hand-off** failed. The blob
goes offscreen → `chrome.storage.local` (`tb_rec_data_v2` / `tb_rec_meta_v2`)
→ read back by the page via `restoreLastRecordingFromOffscreen()`.

**HYPOTHESIS — UNVERIFIED.** The ticket modal opens before
`restoreLastRecordingFromOffscreen()` resolves, so `getSessionVideo()` returns
null and the modal renders video-less. `quick-bug.ts` calls it in at least four
places (`:249`, `:1267`, `:1339`, `:1478`), which suggests the race has been
patched at call sites rather than fixed at the source.

**I have guessed wrong twice on this path already** (see bug 3's history), so
treat the above as a starting point, not a diagnosis. Reproduce first:

1. `node e2e/ext-shipping-path.e2e.mjs`, adapted to flip
   `VIDEO_ENABLED_IN_EXTENSION` and record for real.
2. Instrument the three hops — does `tb_rec_data_v2` actually get written? Is it
   non-empty? Does the page read it before or after the modal mounts?
3. A 4 MB video base64-encodes to ~5.6 MB. `unlimitedStorage` is granted, so
   quota *should* be fine — but confirm rather than assume.

**Also worth checking:** `getSessionVideo()` requires
`v.startedAt >= session.createdAt - VIDEO_SESSION_GRACE_MS`. If the session is
created after the recording starts, a perfectly good video is discarded as
belonging to a previous session.

## Bug 2 — no fullscreen in the video preview

**Symptom.** The player in the ticket modal, and in the exported `.html`, has no
working fullscreen.

**Not investigated.** `<video controls playsinline>` should expose it natively,
so the likely causes are the surrounding chrome rather than the element: a
containing block created by a `transform`/`filter` on the modal, `overflow:
hidden` on an ancestor, or the Fullscreen API being refused inside the injected
root. Check the export viewer separately — it is a different document with its
own CSS, so it can fail for a different reason.

While here, the rest of the player is bare next to the competition: speed
control, skip, volume, and a "share at timestamp" affordance. Lower priority
than the four bugs.

## Bug 3 — the microphone cannot be granted from anywhere that can prompt

**Symptom.** "Include microphone" is ticked; the recording has no audio.
`chrome://extensions` shows `[TraceBug offscreen] microphone unavailable …
NotAllowedError`.

**Cause, confirmed.** Two surfaces, neither of which can ask:

- the **offscreen document** has no UI, so it cannot prompt at all;
- the **popup** is dismissed the instant it loses focus, and Chrome's
  permission prompt takes focus — so the prompt kills the popup and the pending
  `getUserMedia` rejects with `NotAllowedError`. The user sees a refusal having
  never been asked anything, and TraceBug appears in **no** blocked list in
  `chrome://settings/content/microphone` because it was never blocked.

**Already half-fixed in 1.11.** TraceBug settings (`options.html`) now has a
Microphone card that grants it from a real tab, and the grant persists for the
extension origin. What remains for 1.11.1:

- Restore the popup's mic row (removed with the rest of the video UI) and point
  it at settings when the permission is missing.
- **Copy Jam's placement.** Jam shows "You haven't granted microphone
  permissions to Jam yet" **on the HUD**, next to the mic button — at the moment
  and place the user is trying to use it. Our equivalent sat at the foot of the
  popup, below the fold. The HUD is the right home.

## Bug 4 — the HUD mic button is wired to a stream the page does not own

**Symptom.** Clicking the mic icon in the recording HUD does nothing.

**Cause, confirmed.** `hasMicrophoneTrack()`, `isMicrophoneMuted()` and
`setMicrophoneMuted()` in `src/video-recorder.ts` all operate on `_stream`,
which is **null in the page** in extension mode. So `micAvailable` is always
false, the button renders disabled, and mute was never implemented for this
transport at all.

**The gap is an RPC.** `pauseVideoRecording` has an `isExtensionContext()`
branch that forwards over the bridge; the three mic functions do not. 1.11.1
needs `tb:rec:mic-mute` (and a `micIncluded` flag in `tb:rec:status`, which
`offscreen.js` already broadcasts on `tb:rec:started` — so the data exists and
is simply not plumbed).

---

## Also removed in 1.11, and why — do not restore blindly

**`preferCurrentTab` in `offscreen.js`.** Phase 4 Step B added it believing it
mirrored the in-page path. It cannot work there: the hint means "the tab of the
**calling document**", and an offscreen document has no tab. Paired with the
existing `selfBrowserSurface: "exclude"` it also made Chrome reject the whole
call — *"Self-contradictory configuration"* — so every current-tab recording
ended as "Recording cancelled".

Capturing a specific tab from an offscreen document needs
`chrome.tabCapture.getMediaStreamId`, which needs the **`tabCapture`
permission** — dropped in 1.10.1 to lose the browsing-history install warning.
Adding it back is a product decision, not a bug fix. **Until that decision is
made, "This tab" cannot be offered in the extension**, which is why both the
popup dropdown and the preflight's surface choice are gone there (the npm SDK
keeps both, where they work).

**The `offscreen` permission** is out of both manifests, since nothing creates
an offscreen document any more. Restore it in `build-ext.mjs` `chromeManifest()`
and in `tracebug-extension/manifest.json` together with the feature — and put
the row back in **four** places that justify permissions to a reader:
§7b of `docs/launch/store-submission-pack.md`, §7b of
`docs-internal/CHROME-WEB-STORE-LISTING.md`, the permissions table in
`docs/chrome-extension.md` (which also names it in a "not present, deliberately"
line to delete), and the **live privacy page**,
`website/app/privacy/page.tsx` — its Chrome-extension permission list. The
wording removed from the site was: *"offscreen — To keep an optional screen
recording running while you move between pages."* The same edit also narrowed
`unlimitedStorage` there and in the submission pack to "a report with an
interactive replay"; widen it back to "a replay or a video".

A store listing that justifies a permission the manifest does not request is a
review flag, and a privacy page that does it is simply wrong — which is why this
is on the restore list rather than left as a harmless leftover.

## Flipping the switch

1. Fix bugs 1 and 4 (3 is half done; 2 is polish).
2. `VIDEO_ENABLED_IN_EXTENSION = true`.
3. Restore: the popup's `optVideo` checkbox and `micOpt` row (`popup.html` — the
   markup is commented, not deleted, and `popup.js` is null-safe around it), the
   `offscreen` permission in both manifests, and §7b's `offscreen` row.
4. Un-gate `restoreFromOffscreenIfActive` / `restoreLastRecordingFromOffscreen`
   — they early-return while video is off.
5. `tests/video-paused-1-11.test.ts` will fail wholesale. That is correct: it
   exists to pin 1.11's behaviour. Replace it, don't weaken it.
5b. **The copy that was rewritten for the pause.** The canvas toast needs no
   edit — `src/replay-fidelity.ts` branches on `isVideoOffered()` and reverts to
   "turn on Record video too" by itself. These do need editing, and each has a
   test or a note naming the revert: the `WHATS_NEW` card in `popup.js` (plus
   `tests/whats-new.test.ts` and `docs/launch/screens.md` screen 4),
   `docs/RELEASE_CHECKLIST.md` rows 1-3 (UI-based steps, see the block quote
   there) and row 9's oversize half, and the video sentences in
   `docs/{quickstart,chrome-extension}.md` and `README.md`.
6. Extend `e2e/ext-shipping-path.e2e.mjs` to record for real and assert the
   video arrives in the ticket. **A unit test cannot make this guarantee.**

## Unrelated ideas parked here so they are not lost

- **Trim / crop a recording before export** (Jam has it). Fits TraceBug better
  than it fits Jam: trimming is the only real answer to the 20 MB/25 MB
  attachment ceiling that `_oversizeExportNotice` currently just warns about.
- **An "MCP" tab in the ticket**, like Jam's. Worth doing, but **not as a copy**.
  Jam needs a tab teaching MCP setup because their reports live on their server
  and the agent must be told how to reach them. A TraceBug export is already a
  local file an MCP server reads (`npx tracebug mcp --dir`). The missing piece
  is not setup instructions — it is **intent-named prompts**: *Fix it*,
  *Summarize*, *E2E test*, each copyable, instead of one generic "Fix with AI"
  blob. Small change, no server, and it reads as a richer feature than theirs
  because the data is already local.
