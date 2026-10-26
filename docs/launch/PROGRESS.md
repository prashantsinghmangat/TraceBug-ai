# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## Two more stuck-REC-badge gaps in the same bail-out class (2026-10-26)

- **What:** the user hit "Capturing…" with no actual recording a third and fourth way. (1) Capture Bug
  with video + "blur first": `src/ui/pre-record.ts`'s `startBlurThenRecord()` arm bar has a Cancel
  button, but `src/index.ts`'s `prepareRecording()` never passed an `onCancel` callback — clicking it
  removed the blur boxes and did nothing else. (2) The same gap existed for Esc during the start-delay
  countdown (`runRecordCountdown` resolving `false`). In both cases `background.js` had already marked
  the tab "capturing" the instant the popup's click dispatched `TB_START_RECORDING` (the same optimistic
  badge-set behind the 2026-10-26 video-cancel fix above), but `startVideoRecording()` — the one place
  that already knew to call `announceCaptureStopped()` on failure — was never reached, because the bail
  happens one step earlier, before `begin()` ever runs.
- **Fix:** `prepareRecording()` now passes `onCancel: () => void announceCaptureStopped()` to
  `startBlurThenRecord()`, and calls the same thing when the countdown resolves `false`. Both are
  no-ops outside the extension (`announceCaptureStopped()` already checks `isExtensionContext()`).
- **Verified:** `check.mjs --full` all green (939/58, unchanged baseline). No new automated test — same
  reasoning as the video-cancel fix: the real repro needs a human to click Cancel/press Esc mid-flow in
  a live popup, not something the existing fake-media-stream e2e harness drives.

## CSP style-src nonces: TraceBug's own `<style>` tags were silently dropped (2026-10-26)

- **What:** on a claude.ai artifact page (`style-src 'nonce-...'`, no `unsafe-inline`), every `<style>`
  element TraceBug creates — theme variables, the dashboard's CSS reset, every animation keyframe —
  was silently ignored: unlike Trusted Types, this CSP directive doesn't throw, so there was no
  exception to catch, just an unstyled, broken-looking dashboard and a console full of CSP violation
  reports (which TraceBug's own collector then captured as "errors" in its own bug report, which is how
  the user found it — first stack frame: `theme.ts`'s `_applyThemeVars`).
- **Fix:** a new `createStyleTag()` in `src/ui/helpers.ts` borrows the nonce the host page already used
  on one of its own inline `<script>`/`<style>`/`<link>` tags, via the `.nonce` IDL property (browsers
  deliberately expose it to trusted script even though `getAttribute`/`outerHTML` hide it, to stop a
  nonce leaking out through injected markup). All 17 `document.createElement("style")` call sites
  across `src/` now go through it — same chokepoint pattern as `setInnerHTML` for Trusted Types.
- **Scope, stated plainly:** this fixes `style-src-elem` violations only. It does NOT fix
  `style-src-attr` violations — the many `el.setAttribute("style", "...")` calls throughout the
  HUD/toolbar/overlays, which a nonce cannot cover at all (Chrome has no nonce/hash path for the style
  attribute without `unsafe-hashes`) and which need per-call-site conversion to the CSSOM
  (`el.style.prop = ...`, which bypasses this CSP gate entirely) — a separate pass comparable in size
  to the original 89-site Trusted Types sweep. Not attempted here.
- **Verified:** new `e2e/ext-style-nonce-page.e2e.mjs` (5/5) — a real nonce-gated CSP fixture, confirms
  the fixture genuinely enforces it, zero style-ELEMENT violations during mount, the tag carries the
  right nonce, and the CSS actually took effect (`#tracebug-root` computes to `position: fixed`, not
  just "the attribute is present"). Logs the leftover style-ATTRIBUTE violation count as known/out of
  scope rather than hiding it. `check.mjs --full` all green (939/58); re-run clean: `ext-trusted-types-page`
  9/9, `ext-shipping-path` 16/16, `ext-video-recording` 8/8, `ext-sdk-isolation` 17/17.
