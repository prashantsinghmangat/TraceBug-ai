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

## CI red on push to main — two e2e suites broken since Oct 21, unrelated to the push (2026-10-29)

- **What broke CI:** the push of the Tab-mode fixes (`0a9a038`) and a follow-up docs commit both failed
  the `e2e` job. Root cause confirmed pre-existing, not caused by either push: `website/public/try.html`
  stopped auto-loading the SDK on page load back in `4a7511d` (2026-10-21, a deliberate fix so the demo
  page doesn't race the extension's own injected copy) — the "No extension? Try the in-page demo" button
  is what loads it now. `e2e/blur-tracking.e2e.mjs` and `e2e/inspect-mode.e2e.mjs` were never updated to
  click `#inPageDemoBtn` first (unlike `e2e/pre-record.e2e.mjs`, which got this fix at the time), so
  every run since Oct 21 has called into `window.TraceBug` while it was still `undefined` and thrown
  immediately — `ext-shipping-path` and `ext-no-secrets-in-page` don't touch `try.html` and were
  unaffected. Fixed both by adding the same `await page.click("#inPageDemoBtn")` + wait that
  `pre-record.e2e.mjs` already has.
- **A second, genuinely separate bug surfaced once blur-tracking could run far enough to hit it:**
  clicking `#inPageDemoBtn` itself scrolls the page ~226px (a pre-existing quirk of this specific demo
  page's layout, unrelated to blur mode or anything TraceBug does) — the test captured the coupon
  field's bounding box once, then reused that now-stale coordinate after a scroll-down-then-back-to-0
  round trip, so its "click again to unblur" landed on the wrong element and silently blurred something
  else instead. Fixed by re-measuring the bounding box after the scroll round trip rather than reusing
  the original one. The actual blur/unblur toggle logic (`src/ui/blur-tool.ts`) was never at fault.
- **Verified:** all 5 suites the CI workflow actually runs (`e2e/blur-tracking.e2e.mjs` 7/7,
  `e2e/pre-record.e2e.mjs` 11/11, `e2e/inspect-mode.e2e.mjs` 8/8, `e2e/ext-shipping-path.e2e.mjs` 16/16,
  `e2e/ext-no-secrets-in-page.e2e.mjs` 13/13) run clean locally end to end, matching the CI job's own
  commands. `check.mjs --full` still green (936/58, unchanged baseline).

## npm published; STATE.md's Firefox-pass status corrected, not closed (2026-10-29)

- **Published for real:** `tracebug-sdk` and `tracebug` (the MCP CLI) both now show `1.11.3` as
  `dist-tags.latest` on the real registry (confirmed via a raw `registry.npmjs.org` fetch, not just
  `npm view`'s cache — the first publish attempt looked successful in the terminal but silently never
  completed because the browser-based 2FA/publish-approval step was skipped). A fresh `npx
  tracebug@latest help` resolves and runs. The MCP registry (`server.json`) is still not pushed — a
  separate submission flow, not attempted yet.
- **STATE.md's open item 9 corrected, not marked done:** asked the user directly what Firefox testing
  actually happened rather than assume — confirmed only RELEASE_CHECKLIST rows 16 (mic grant/choose) and
  17 (countdown mic toggle) were hand-verified in a real Firefox build. Row 15 (Tab mode greyed out with
  a tooltip) and the Oct 23 capture-flow/rendering bug list remain Chromium-only. STATE.md now says this
  explicitly instead of a blanket "still owed" that undersold what's done or a blanket "verified" that
  would have oversold it.

## MCP registry published: io.github.prashantsinghmangat/tracebug@1.11.3 (2026-10-29)

- Installed `mcp-publisher` (the official CLI, github.com/modelcontextprotocol/registry releases —
  Windows amd64 tarball). `packages/tracebug/server.json` validated clean against the live registry
  schema on the first try (`mcp-publisher validate`) — no changes needed to the file itself.
- **First publish attempt 403'd**: the GitHub device-flow login authenticated as
  `io.github.prashantsingh1-tz` (a different GitHub account than the repo's actual owner,
  `prashantsinghmangat`) because that was the account already signed into the browser. Fixed by logging
  out and re-authenticating with the browser signed into the correct personal account.
- **Verified independently**, not just trusting the CLI's own success message: queried the registry's
  public search API directly (`registry.modelcontextprotocol.io/v0.1/servers?search=...`) and confirmed
  `"version": "1.11.3"`, `"status": "active"`, `"isLatest": true`.
- All three 1.11.3 distribution channels are now done: npm (`tracebug-sdk` + `tracebug`), MCP registry,
  and AMO submission (pending review). CWS upload is the one still open.

## 1.11.4 prepared: report fixes found while recording the demo video (2026-10-31)

- **What:** clicks record the values their button acted on (`clickContextFields` in `src/collectors.ts`;
  steps read `Click … (coupon = "SAVE20")`, Playwright spec fills them first); failed favicon/asset
  requests left out of repro steps and the AI prompt; `console.error(err)` keeps message + stack (9addaf2).
- **Files:** `src/{collectors,repro-generator}.ts`, `src/exporters/{ai-prompt,playwright-test}.ts`, privacy
  page, popup What's New, CHANGELOG, all version surfaces → 1.11.4; tests `click-context`, `ai-prompt` (new).
- **Verified:** `check.mjs --full` 950/950, versions on 1.11.4; real Chromium run of the demo shop with the
  built SDK (SAVE20 typed before capture → step shows it; `.ico` 404 out of steps). `package-lock.json`
  root version not bumped (file is permission-blocked here). Not released: stores, npm, MCP all pending.

## Hygiene audit applied: axe out of the extension bundle, dead code, stale docs, Next patch (2026-10-31)

- **What:** `docs/audit/hygiene-2026-10-31.md` rows 1, 2, 6, 7 (minus documented plugin runners), 9–13. axe-core stubbed in the `tracebug-sdk-ext` build only (3,454,292 → 1,988,928 B); 19 unused exports + `_trimmed` removed (159 lines); unused `tracebug-demo-poster.png` deleted; website `next` 14.2.5 → 14.2.35 + non-force `npm audit fix`.
- **Files:** `tsup.config.ts`, 14 `src/` files, `website/package{,-lock}.json`, `scripts/check-baseline.json` (ext:lint 26 → 14), CLAUDE.md, ADR 004/005, `docs/performance.md`, STATE.md (rewritten), CODEMAP.md (all line refs refreshed).
- **Verified:** `check.mjs --full` green (950/60, ext:lint 0/14, versions 1.11.4); e2e `ext-shipping-path` 16/16, `ext-sdk-isolation` 17/17, `ext-events-capture` 22/22; `next build` OK.
- **Open:** Next 14.2.35 still has 25 advisories (3 critical, need ≥15.5.28 — major upgrade, user decision); documented plugin `onReport`/`onExport` hooks never fire; audit #3/#4 deferred, #5/#8/#14–16 not approved.

## Follow-ups: image optimizer off, plugin hooks wired, single script-tag SDK copy (2026-10-31)

- **Next:** `website/next.config.js` `images: { unoptimized: true }` (no `next/image` users) closes GHSA-2xp9/2464; GHSA-p293 (Windows-hosted only) + 22 others wait for a ≥15.5.28 upgrade, deferred by the user. Local `next start`: `/_next/image` → 404; live check owed after deploy.
- **Plugins:** documented `onReport`/`onExport` now run (`report-builder.ts`, 9 export sites in 6 files; isolated runners in `plugin-system.ts`); format names in `docs/api-reference.md`; `tests/plugin-hooks.test.ts` (5).
- **#5:** tsup writes `website/public/tracebug-sdk.js` directly; copy steps, `tracebug-extension/tracebug-sdk.js`, its eslint ignore gone; CI size check, README, `docs/architecture.md`, CLAUDE.md repointed.
- **Verified:** `check.mjs --full` green; CI's 5 e2e suites pass; benchmark reads the new path. `.claude/settings.json:35` still denies reading the deleted path — harmless, left alone.

## Recording: Tab-mode fallback reasons + Tab default on Chrome (2026-11-01)

- **What:** proposal §16 steps 1 and 3 (`docs/audit/recording-architecture-proposal.md`). User decisions: Tab is the default only for users on the default (`surfaceSetBy`), with Desktop choices kept. Failure still falls back to the share dialog, now naming the reason (permission declined / link expired / page not allowed). Step 4 (required `tabCapture`): no. Step 2 waits on a manual check.
- **Files:** `tracebug-extension/{background,offscreen,popup}.js`, `popup.html`, `src/{video-recorder,index}.ts`, `scripts/check-baseline.json` (14 → 13); tests `surface-default`, `tab-mode-fallback` (new), `record-opts`, `offscreen-capture`; `docs/chrome-extension.md`, `docs/RELEASE_CHECKLIST.md` rows 11/12/12b/15.
- **Verified:** `check.mjs --full` green (978/64, ext:lint 0/13, versions 1.11.4); e2e tab 8/8, desktop 8/8, shipping-path 16/16.
- **Open:** real permission flow, including the popup closing on the grant bubble (parked start); Firefox pass; and the step-2 check (toolbar start on a granted tab, before and after navigation). Not committed.

## Recording: tabCapture required (Jam/BetterBugs parity), Trusted Types noise, honest Tab e2e (2026-11-01)

- **What:** user chose required `tabCapture` after measured evidence: Chrome refuses a tab invoked before an optional grant, so the optional flow always showed the share picker on its first tab. Jam 5.96.0 / BetterBugs 1.1.10 manifests (read from their CWS packages) both declare it required. Removed the optional-grant code; `setInnerHTML` tries the TT policy first (youtube.com error spam); Tab e2e asserts real results.
- **Files:** `tracebug-extension/{manifest.json,build/manifest.base.json,build/build-ext.mjs,background.js,popup.js,options.{js,html}}`, `src/ui/helpers.ts`, `scripts/check-baseline.json` (13 → 12); tests `surface-default`, `tab-mode-fallback`, `safe-set-inner-html`; `e2e/ext-video-recording-tab.e2e.mjs`; `docs/chrome-extension.md`, `RELEASE_CHECKLIST.md` 11–13, `store-submission-pack.md`, website `/privacy`.
- **Verified:** `check.mjs --full` green (979/64, lint 0/12); e2e tab 8/8, trusted-types 9/9, style-nonce 7/7; dist manifests checked (Chrome has `tabCapture`, Firefox none); real-click probe on the new build: no picker, audible playback (peak 0.51).
- **Open:** 0-byte Tab recordings when stopped at ~3.5s (2/6 probe runs); CWS listing (`docs-internal/`) permission text; re-approval on update (row 13) and Firefox by hand. Not committed.


## Recording: microphone lost in Tab mode — mix audio sources into one track (2026-11-01)

- **What:** user report — Tab + Microphone On gave a video with no voice; Desktop had it. MediaRecorder records only the first audio track, and Tab mode puts tab audio first. Measured in Chromium (tab track disabled, mic live → silent file). `offscreen.js` now mixes all audio sources into one track when there is more than one (`_mixAudioCtx`, closed in teardown); also fixes Desktop + "Share tab audio" + mic.
- **Files:** `tracebug-extension/offscreen.js`; `tests/offscreen-capture.test.ts` (3 guards).
- **Verified:** probes on the real extension — mic audible with the tab track disabled, tab audible with the mic muted, mic-off unchanged; `check.mjs --full` green (982/64, lint 0/12); e2e desktop 8/8, tab 8/8. Real voice check is the user's (fake devices only here). Not committed.

## Recording: an early Stop no longer saves an empty video (2026-11-01)

- **What:** MediaRecorder emits no real data for ~3 s after start() (measured: first data ~3.1 s, any codec/page), so a Stop before that finalized a 0-byte file — also `ext-shipping-path`'s intermittent failure. `stopAndBuildRecording` now waits (≤6 s) for ≥1 KB before stopping, and keeps captured chunks if the recorder ends meanwhile.
- **Files:** `tracebug-extension/offscreen.js`; `tests/offscreen-capture.test.ts` (4 cases, harness gains `run`), `tests/recorder-mime.test.ts` (seeds data so the stop-hang test isolates the `stop` fallback).
- **Verified:** A/B on the real extension, Stop at 1 s: without the wait 0 bytes ×2, with it 66–77 KB playable with audio ×2. `check.mjs --full` green (986/64, lint 0/12); e2e desktop 8/8, tab 8/8, shipping-path 16/16 ×3.
- **Open:** what the on-page toolbar shows during that ≤3 s wait was not checked. Not committed.

## 1.11.5 prepared: version bump, CHANGELOG, What's New (2026-11-01)

- **What:** `develop` fast-forwarded to `main` (`edd1dbe`), then every `check:versions` surface → 1.11.5; CHANGELOG `[1.11.5]` (Tab with no prompt/dialog, `tabCapture` now required + re-approval on update, Tab default, mic mixed in, early Stop not empty, fallback reasons, no TrustedHTML errors); popup `WHATS_NEW["1.11.5"]` (3 lines); STATE release status and Open list rewritten.
- **Files:** `package.json`, `tracebug-extension/manifest.json`, `packages/tracebug/{package,server}.json`, `website/lib/version.ts`, `docs/getting-started.md`, `CHANGELOG.md`, `tracebug-extension/popup.js`, STATE, PROGRESS.
- **Verified:** `check.mjs --full` green (986/64, lint 0/12, all surfaces on 1.11.5).
- **Open:** `package-lock.json` root version (permission-blocked here); manual checklist rows; CWS listing text; the release itself. Not committed.

## 1.11.5 released to npm, MCP registry, website; stores in review (2026-11-01)

- **What:** user committed the release (`4975bbc`) and lockfile (`4da3203`), ran sanity checks, built zips (`npm run zip:ext`), submitted CWS (new `tabCapture` justification in the privacy form) and AMO, published `tracebug-sdk` and `tracebug` 1.11.5, installed `mcp-publisher` and published registry 1.11.5, deployed the site, tagged `v1.11.5`.
- **Files:** STATE, PROGRESS; `docs-internal/CHROME-WEB-STORE-LISTING.md` §7b (gitignored).
- **Verified:** `npm view` both packages at 1.11.5 (`bin` = `bin.mjs`); registry query shows 1.11.5 `isLatest`; live `tracebug-sdk.js` sha256 = repo's (`8B1582…D92D`).
- **Open:** CWS and AMO approval; post-release surface check and `npx tracebug@1.11.5 mcp --help`.

## 1.11.6 prepared: minimum-click workflow fixes, P0 + P1 (2026-11-03)

- **What:** mapped five flows (install → capture → report → agent → fix/verify) into
  `minimum-click-workflow.md`, then fixed the dead ends: `--dir`-free setup everywhere, draft only on real
  edits and cleared on export, toolbar Record `surfaceMode: "auto"`, welcome setup command + Alt+B wording,
  persistent hand-off toast, newest-first listing, edits in Fix with AI (`reporterNotes`), Cursor/Windsurf
  JSON, Playwright-test text, popup/AI-tab copy.
- **Files:** `src/ui/quick-bug.ts`, `src/{compact-toolbar,video-recorder,index}.ts`, `src/exporters/{ai-prompt,html-template}.ts`,
  `cli/mcp-server.ts`, `tracebug-extension/{background.js,popup.js,popup.html,welcome.html,welcome.js}`, docs
  (`mcp.md`, quickstart, playwright, READMEs), website MCP/playwright/ai-bug-fix pages, versions → 1.11.6.
- **Verified:** `check.mjs --full` 988/988; website tsc + lint; welcome page rendered. **Not verified:** toolbar
  Tab mode in a real Chrome/Firefox (the background test fake can't start a recording). `package-lock.json` not bumped.
- **Playground run (`D:\tmp\tracebug-playground`, guide outside it) → three more fixes:** title/summary use the action
  before the first failure (`lastUserActionBefore`, `firstFailureIndex`); undefined-access hint says find the missing
  value first; all four agent prompts share `src/exporters/agent-workflow.ts`. Gates 1002/1002.
- **Second run (fixed app, no bug):** no-failure reports say "No errors or failed requests were captured" (`NO_FAILURE_HINT`)
  instead of a guessed cause, in the hint, the AI prompt and the MCP guide; dead click = re-click within 1.5–8 s; timeline
  drops the Resource Timing duplicate (`dedupeNetworkRows`). Gates 1012/1012. Open: reports include every cookie of the host
  (on localhost that's other local apps' cookies too).
- **Third run (bug + clean):** both behaved as designed (right title/hint, Claude red-tested and asked; clean run asked
  instead of guessing). Fixed: slow typing collapses to one step/fill (`collapseTyping`), clean titles start "No errors
  captured:". Gates 1017/1017.

## 1.12 item 1: only real failures are failures (2026-11-04)

- **What:** status 0 no longer means "failed" by itself. `src/request-status.ts` (`isFailedRequest`, `requestStatusLabel`):
  Resource Timing status 0 = unknown, fetch AbortError / XHR abort = `aborted`, `no-cors` = `opaque`; real network errors stay failures.
- **Files:** collectors (tagging), report-builder, title-generator, timeline-builder, repro-generator, index, dashboard,
  quick-bug + html-template Network tabs, mcp-server `get_network_activity` (`statusNote`), types; `tests/request-status.test.ts`.
- **Verified:** check.mjs --full 1033/1033. Not changed: the Playwright reporter's own failure rule (separate capture path).

## 1.12 item 2: never lose the lead-up (2026-11-04)

- **What:** in-capture Resource Timing rows skipped for fetch/XHR (wrapper records them) and kept for assets only when
  failed/slow; `maxEvents` 200 → 500; `session.droppedEvents` counted on trim and storage-full halving; pending typing
  flushed on pointerdown / Enter / pagehide / stop; page-load rows stamped with their own `_ts`.
- **Files:** collectors, storage, index, types, docs (configuration, api-reference, performance); tests `input-flush` (new),
  `page-load-backfill` (rules updated), `storage`. **Verified:** check.mjs --full 1042/1042. **Behaviour change:** the
  Network tab no longer lists successful asset loads made during a capture. Not run: e2e suites that may count those rows.

## 1.12 item 3: Evidence Integrity block (2026-11-04)

- **What:** `src/evidence-summary.ts` (captured / not captured / redacted / dropped / complete) on `report.evidence`;
  shown in the ticket Info tab, `.html` Info rows, AI prompt "Evidence coverage", MCP `get_bug_report.evidence` + guide
  gaps step. No-failure hint caveats an incomplete capture. Session records `consoleLevel`; console caps flagged.
- **Files:** evidence-summary (new), collectors, storage, index, types, report-builder, ai-prompt, html-replay,
  html-template, quick-bug, mcp-server; `tests/evidence-summary.test.ts` (new, 13). **Verified:** check.mjs --full 1055/1055.

## 1.12 item 4: fresh, durable evidence (2026-11-04)

- **What:** `getAllSessions` returns unflushed in-memory state (copy); repro steps always rebuilt in `buildReport`;
  failure snippets persisted on the `api_request` event (`attachResponseSnippet` via `onNetworkFailure`); storage
  snapshot saved at first error / stop (`session.storageSnapshot`); `environment.url` = bug page, `startUrl` kept.
- **Files:** storage, collectors, index, report-builder, evidence-summary, types, html-replay, quick-bug;
  `tests/fresh-evidence.test.ts` (new, 8). **Verified:** check.mjs --full 1063/1063. **Cost:** saved sessions grow by
  the storage snapshot (≤ ~45 KB worst case, usually a few KB).

## 1.12 item 5: privacy by default (2026-11-04)

- **What:** `redactUrl` (url-hygiene; query + fragment) for request/page/link/form-action/rrweb-meta URLs; form submits skip
  hidden/file fields (`hiddenSkipped`) and use `isSensitiveField`; token scrub on input/form values and voice notes; cookies
  names only (`valueOmitted`) unless `captureCookieValues`; evidence block + redaction summary report them.
- **Files:** url-hygiene, collectors, environment, rrweb-recorder, storage-capture, index, types, evidence-summary,
  redaction-summary, voice-recorder, dashboard, quick-bug, html-replay, annotation-store; docs (configuration,
  api-reference, bug-reporting); `tests/privacy-defaults.test.ts` (new, 12). **Verified:** check.mjs --full 1075/1075.

## 1.12 report-quality benchmark (2026-11-04)

- **What:** `e2e/report-quality.e2e.mjs` — 5 scenarios on an in-file shop via the real extension, 84 checks against an
  answer key; `e2e:quality` gate in `check.mjs --full`. First run failed 4 checks → fixed: URL tokens in stacks
  (`redactUrlsInText` in the shared text scrub + `source`), hidden-input values in rrweb (`scrubHiddenInputs`),
  `/favicon.ico` excluded from `networkErrors` (`isBrowserFavicon`).
- **Files:** e2e/report-quality.e2e.mjs, e2e/README, scripts/check.mjs, package.json, url-hygiene, sanitize/cloud-upload,
  collectors, rrweb-recorder, report-builder; `tests/benchmark-leaks.test.ts` (new, 6). **Verified:** check.mjs --full 1081/1081 + 84/84.

## 1.12 e2e sweep (2026-11-04)

- **All 24 `e2e/*.e2e.mjs` suites pass.** No product regressions from items 1–5. Fixed two stale tests in
  `milestone-ask.e2e.mjs` (try.html loads the SDK only via the in-page demo button since 4a7511d; the card waits for the
  modal to close since 8ef6859). `ext-feature-matrix` static/screen-recording "stops and saves" failed once, passed
  64/64 on re-run (timing). `ext-secret-migration` needs `git worktree add D:/tmp/tb-1101 v1.10.1` (now present) → 25/25.

## Website redesign ready on `website-revamp`, not deployed (2026-11-10)

- Midnight coral theme (#FF5C6C), coral prompt logo on site + extension, hero "Capture the bug. Let AI fix it." with Trace chip and traced-paths backdrop, mobile hero trimmed; Features cards no longer overclaim (`358ce36`). Commits `ad44157` (website), `1127f54` (extension icons/popup/welcome).
- Verified: `check.mjs --full` green (1081 tests, 84/84 report checks), `next build` 62/62, production smoke test of 25 routes + homepage links (all 200, 404 page correct), screenshots at 360/390/430/1440 in dark and light.
- Open: the branch also carries unreleased 1.11.6 + 1.12 commits, so merging it to `main` (Netlify deploys `main`) ships the 1.12 script-tag SDK and 1.11.6 docs before the stores. Decide: release first, or cherry-pick the website commits onto `main`.

## Site/extension conversion audit applied on `website-revamp`, uncommitted (2026-11-10)

- Site: shared `InstallButtons` (Firefox visitors get "Add to Firefox" as the filled button; nav, hero, closing CTA, pricing, mascot, /bye); install CTA on 7 dead-end pages; nav cut to 5 links; one header system (`text-h2 font-medium`, sentence case, an `h1` on every page); `/docs` rewritten extension-first; `/features` got a header + install; `/privacy` got nav/footer and a "This website" section. Fixed: dead `#mcp` link on /features, squashed pricing button and clipped MCP commands on phones, faux-bold text (Space Grotesk 600/700 now loaded), changelog hiding `[Unreleased]`. Copy checked against code: Alt+B = screenshot ticket, "Export replay (.html)", nine MCP tools, one `claude mcp add -s user` command, AI key kept in extension storage.
- Extension: in-page UI (`src/theme.ts`, ~20 files, `tracebug-injected-styles.css` mirror) and options/confirm/player/welcome on Midnight coral; `--tb-on-accent` ink text on coral fills; category colours (replay markers, navigate chip, redesign intent, pen palette) kept; popup "Auto" theme now follows the system; two invalid CSS declarations fixed; tooltip "TraceBug: capture a bug"; `homepage_url` → tracebug.dev.
- Verified: `check.mjs --full` green (1081 tests, 84/84 report checks, all surfaces on 1.11.6); website `tsc` + `next lint` clean; 9 routes × 375/768/1280 rendered with no overflow or console errors; popup/options/welcome screenshotted light + dark. Not run: `npm run ext:firefox`, `next build`, the in-page modal in a real tab.
- Open: exported report (`src/exporters/html-template.ts`) still indigo; home-page mobile items left as is (comparison grid scrolls without a hint, integrations orbit crowds at 375, demo poster's play pill overlaps a card at 1280, mascot bubble can cover a heading).

## Release testing for 1.11.6 + 1.12, automated part (2026-11-10)

- On `2555d31` (`website-revamp`, after the coral recolour): `check.mjs --full` green — 1081 tests / 72 files, ext:lint 0 errors / 12 warnings, all surfaces on 1.11.6, report quality 84/84. All 24 `e2e/*.e2e.mjs` suites pass first time (feature-matrix 64/64, provider-confirm 61/61, secret-migration 25/25 after recreating `git worktree add --detach D:/tmp/tb-1101 v1.10.1`); ext-player-csp verdict OK. `benchmark.mjs`: init 10.9 ms, ~31 µs per interaction, export 112 KB.
- MCP vs the 2026-07-28 spec (stateless, `server/discover`): our server answers `server/discover` with -32601, which dual-era clients treat as "legacy, fall back to initialize"; fallback init, tools/list (9) and list_bug_reports all work. Modern-only clients would fail — adding `server/discover` is a follow-up, not a blocker.
- Not run (needs a person): `npm run ext:firefox`, ticket modal in a real tab, toolbar Record in Chrome Tab mode, RELEASE_CHECKLIST manual rows.
- Also: `docs/audit-quality/implementation-plan.md` (new, uncommitted) — Site Audit + verified-fix sprint plan; four blockers to decide before code.
