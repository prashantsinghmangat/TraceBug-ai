# PROGRESS archive - closed entries

Moved out of `PROGRESS.md` on 2026-10-12. Ten entries, Phase 0 through Phase 4 Step A, all closed.

**Nothing here is current.** Open issues recorded in these entries were either resolved by a later
phase or carried forward into `docs/launch/STATE.md`; the file names and line numbers are as they were
on the day. Read it only to answer "why was it done that way", and say so when you open it.

## Phase 0 - findings (2026-10-11)
- Read-only investigation of all 10 questions; no code changed. Report: `docs/launch/phase0-findings.md`.
- Verified against code: `build/manifest.base.json`, `build/build-ext.mjs`, `background.js`, `popup.js`,
  `content-script.js`, `src/integrations/tracker-client.ts`, `src/ai/llm-client.ts`, `src/storage.ts`,
  `src/ui/quick-bug.ts`, `playwright.config.ts`, `e2e/ext-*.e2e.mjs`.
- Headlines: audit #3/#4 (secrets + tickets in page localStorage) CONFIRMED and are the real work. #2 (tabCapture)
  already done; `tabs` was never in the manifest; Phase 1's permission request/decline flow already exists in
  `popup.js:295-339`. Phase 8's Chrome Beta nightly can't load an unpacked extension (Chrome 137+).
- Open issues: `tracebug-extension/manifest.json` (dev) duplicates `manifest.base.json` and must be edited in
  tandem; removing `<all_urls>` breaks `background.js:189` (`!tab.url` guard) until fixed.

## Phase 2a - secrets out of the host page (2026-10-11)
- Extension mode now declares `transport: "extension"` at init; integration tokens + AI key live in
  `chrome.storage.local`, entered only in a new **TraceBug settings** page (`options_ui`, `open_in_tab`).
  In-page modals link to it instead of rendering (and pre-filling) token fields. Getters stayed SYNC: the
  content script publishes a boolean-only snapshot on `<html data-tb-caps>`, mirroring the data-tb-redact
  bridge. Lazy migration moves pre-1.11 page keys, keeps an existing extension config on conflict, and
  records a notice naming the discarded site.
- Files: new `src/ext-transport.ts`, `tracebug-extension/{options.html,options.js,secret-migration.js}`,
  `tests/{ext-secrets,secret-migration,no-page-secret-fields}.test.ts`; edited `src/types.ts`, `src/index.ts`,
  `src/integrations/tracker-client.ts`, `src/ai/llm-client.ts`, `src/ui/quick-bug.ts`,
  `tracebug-extension/{background.js,content-script.js,tracebug-init.js,manifest.json}`,
  `build/{manifest.base.json,build-ext.mjs}`, `CHANGELOG.md`.
- Verified: typecheck clean; `npm test` 29 files / 368 passing (48 new); `build` + `build:ext` OK with
  options/secret-migration present in both dist targets; `ext:lint` 0 errors, 69 warnings all pre-existing
  (62 in the generated bundle, none from the new files); `ext:firefox` installs the add-on cleanly.
- Open issues: **2a is not shippable alone** - provider sends + AI analysis are broken in extension mode until
  2b (they throw a message pointing at settings). Options-page rendering in Firefox and the real migration on a
  live site are NOT automated - needs a manual pass. `tracebug-extension/manifest.json` (dev) still duplicates
  `manifest.base.json`; both were edited by hand here.

## Phase 2a - verification pass before 2b (2026-10-11)
- Real upgrade path automated instead of hand-tested: `e2e/ext-secret-migration.e2e.mjs` loads the **actual
  1.10.1 build** (`git worktree add D:/tmp/tb-1101 v1.10.1`; 1.10.1 commits its built `tracebug-sdk.js`, so no
  build step), has the OLD code write a fake GitHub PAT + Slack hook + AI key into page `localStorage` on two
  origins (localhost and 127.0.0.1), then reloads the 1.11 build over the **same browser profile**.
- 26/26 PASS: page keys gone on both origins; `tb_integrations_v1`/`tb_ai_config_v1` hold them; first origin's
  token KEPT not overwritten; one notice naming `127.0.0.1` with no secret in it; `data-tb-caps` correct and
  secret-free; no secret in `outerHTML`, any input `.value`, or page local/sessionStorage; options page renders,
  shows Configured, surfaces the notice, prints no token.
- Firefox: `options.js` uses only callback-style `chrome.storage.local` + `runtime.lastError` (FF 128 OK).
  Playwright cannot install a WebExtension into Firefox, so the page was served from `dist/firefox` and driven
  under Gecko 151 with a storage shim - renders, saves, pill flips to "Configured", no page errors, token not
  echoed back. Remaining gap: nobody has opened the page via `about:addons` -> Preferences on a real install.
- Open issues: `manifest.json`/`package.json` still say 1.10.1 (the 1.11.0 bump is a release step, not a bug).
  PLAN.md amended - `data-tb-caps` residual accepted, Ollama custom `baseUrl` handed to Phase 1, real-DOM
  no-token-in-page test added to Phase 8.

## Store screenshots - marketing-screenshots.mjs extended (2026-10-11)
- `e2e/marketing-screenshots.mjs` now also writes 8 store-ready **element crops** at DPR 2: `popup.png`,
  `hud.png`, `hud-context.png`, `shot-01-report-hero.png`, `shot-02-console.png`, `shot-04-privacy.png`,
  `shot-04b-blurred-element.png`, `shot-05a-export-menu.png`. Parts 1-3 and their filenames are unchanged
  (only `ai` joined the viewer tab loops, adding `1-report-ai.png` / `5-fresh-report-ai.png`).
- Store crops come from their own session (Part 4) so the originals are untouched. That session drives the real
  `startVideoRecording()` - the only path that mounts `#tracebug-recording-hud`, and the HUD is where the blur
  tool lives - and opens the ticket with Ctrl+Shift+B rather than Stop, because `hideRecordingHUD()` calls
  `removeAllBlurBoxes()` and would strip the blur before it reached a capture. Part 5 loads the packaged MV3
  build via `launchPersistentContext` for `popup.png`.
- Verified: full run green; `shot-02-console.png` asserts TypeError + both 404s + `Bearer [REDACTED]` are
  hit-test visible in one frame, not merely present in `innerText`. Any missing selector aborts the run naming it.
- Open issues: (1) **blur does not survive export** - html2canvas ignores CSS `filter`, and rrweb's
  `maskTextClass: "tb-mask"` masks text NODES, so an `<input>` value replays in the clear; the HUD Blur tooltip
  says "captured in the recording". `shot-04b` is a live-page crop because of this. (2) `shot-02` relaxes
  `.tb-vtabpanels` overflow at render time (500px scrollport vs 665px feed - no scroll offset fits all four
  markers); the exported .html on disk is unmodified. (3) `popup.png` needs a `chrome.tabs.query` shim: opened
  as a tab, popup.js correctly sees a `chrome-extension://` URL and renders "Can't run on this page".

## Phase 2b - the bridge, per-send confirmation, optional host permissions (2026-10-12)
- Provider calls moved into the service worker. The page sends CONTENT only (`{title,body}` / `{text}` /
  `{prompt}`) over exactly two verbs, and an unexpected field is REJECTED at both the content script and the
  worker - so a page cannot supply a repo, webhook, key or base URL, and a probe gets told no. Every tracker
  send is confirmed in an extension-owned popup (requesting origin + destination + title + the FULL scrollable
  body, all `textContent`, with remote-image and @mention warnings). Approve/cancel is accepted only from
  `confirm-send.html`, checked by `sender.url` - note `sender.tab` IS set for a popup window, so "no tab"
  could not be the discriminator. Results go to the one requesting tab's top frame (`{frameId: 0}`), never
  broadcast. Pending requests live in `chrome.storage.session` and the 2-minute timeout on `chrome.alarms`,
  so both survive a worker restart; one pending per tab, 3 overall. LLM: approved per site (revocable in
  settings), then 10/min per origin. Slack now reads its real reply - Phase 6's Slack item is RESOLVED.
- New files: `src/providers/api.ts` (the one place a provider is called, bundled for the worker by a new tsup
  entry `tracebug-provider-api`), `src/ext-rpc.ts`, `tracebug-extension/provider-bridge.js`,
  `tracebug-extension/confirm-send.html` + `.js`, `tests/provider-bridge.test.ts`, `tests/provider-api.test.ts`,
  `e2e/ext-provider-confirm.e2e.mjs`.
- Edited: `src/video-recorder.ts` (rpcCall moved out), `src/ui/quick-bug.ts` (cancel is not a failure),
  `src/integrations/tracker-client.ts`, `src/ai/llm-client.ts`, `tracebug-extension/background.js`,
  `content-script.js`, `options.js`, `options.html`, `manifest.json`, `build/manifest.base.json`,
  `build/build-ext.mjs`, `tsup.config.ts`, `tests/ext-secrets.test.ts`, `CHANGELOG.md`, `docs/launch/PLAN.md`.
- Verified: typecheck + lint clean; `npm test` 31 files / 466 passing (97 new); `build` + `build:ext` ship all
  four new extension files to both targets; `ext:lint` 0 errors / 69 warnings - byte-identical distribution to
  2a (62 generated bundle, 3 background, 2 manifest, 2 popup), so nothing new from these files; `ext:firefox`
  installs with the 3-script `background.scripts` array; `e2e/ext-provider-confirm.e2e.mjs` 49/49, including
  a real api.github.com 401 surfaced as a plain sentence, a real LLM round trip, and the rate limit biting at
  10; `e2e/ext-secret-migration.e2e.mjs` still 26/26.
- Open issues: **new `alarms` permission** (silent, no install warning) - approved explicitly, but worth a line
  in the store "what's new". Custom Ollama `baseUrl` still fails by design, with a `TODO(phase-1)` at the
  failure site. The real 2-minute timeout is asserted only as "the alarm is armed at ~120s" - the cancel path it
  runs is covered through the reaper instead. `tracebug-extension/manifest.json` still duplicates
  `manifest.base.json`; both were edited by hand again.

## Phase 1 - permissions and trust (2026-10-12)
- `<all_urls>` moved to `optional_host_permissions` in BOTH manifests, so a fresh install now asks for
  **nothing**. The `!tab.url` guard at `background.js:189` is gone (with `<all_urls>` optional, `tab.url` is
  undefined on most tabs and that guard would have killed re-injection after navigation outright); the decision
  below it only ever needed `tabId`. Checked, not assumed: neither manifest has a `content_scripts` key, and the
  two production `chrome.tabs.query` calls pass `{}` and read only `tab.id`, so neither needs host access.
  `popup.js`'s existing request/decline/degrade flow was left alone - it already did exactly what the plan
  specifies.
- **Ctrl+Shift+B** (handed over by Phase 2b's `TODO`): it is a page-level keydown handler inside the injected
  SDK, so it cannot call `permissions.request()` - and it does not need to. It still captures the current page;
  when access is known to be withheld it now shows an 8-second action toast saying the capture covers this page
  only and where to allow more. "Known" is the point: the worker answers `TB_HOST_ACCESS` (the permissions API
  is exposed to neither the page world NOR a content script), the content script publishes it as `hostAccess`
  on the existing `<html data-tb-caps>` snapshot, and `undefined` stays silent rather than guessing.
  `permissions.onAdded/onRemoved` nudges injected tabs so a grant takes effect without a reload.
- **Custom Ollama `baseUrl`** is no longer a refusal: the settings page requests that one origin on save
  (`aiHostPatterns`, synchronous so the user gesture survives) and the worker checks the same origin. Only an
  unparseable or non-HTTP URL is still rejected, now in the settings page rather than at send time.
- Files: new `docs/testing/upgrade-host-permission.md`, `e2e/ext-host-access.mjs`; edited
  `tracebug-extension/{build/manifest.base.json,manifest.json,background.js,content-script.js,options.js,tracebug-init.js}`,
  `src/{ext-transport.ts,index.ts,dashboard.ts}`, `tests/ext-secrets.test.ts`, `CHANGELOG.md`, and the five e2e
  harnesses' launch paths.
- **Install warnings, before -> after (Chrome).** Before: one - *"Read and change all your data on all
  websites"*. After: **none**. `activeTab`, `storage`, `unlimitedStorage`, `scripting`, `alarms` and `offscreen`
  are all silent, and optional host permissions carry no install-time warning. Firefox: the *Access your data
  for all websites* entry moves from the install prompt to the add-on's own opt-in Permissions list, which is
  where Firefox already put it. No warning was added anywhere.
- Verified: typecheck + lint clean; `npm test` 32 files / 495 passing (+29: 4 host-access, 10 Actions-tab,
  15 body-cap); `build` + `build:ext` OK; `ext:lint` 0 errors / 69 warnings - the same total as 2a and 2b, so
  nothing new; `ext:firefox` installs cleanly. `e2e/ext-provider-confirm.e2e.mjs` 57/57 (8 new),
  `ext-secret-migration.e2e.mjs` 26/26 - and that run shows `data-tb-caps` carrying `"hostAccess":true`, so the
  new bridge is confirmed in a real browser. `ext-redaction` and `ext-player-csp` also re-run green.
- Open issues: the permission flip broke every e2e harness, for a reason worth knowing - they inject from the
  service worker instead of through a real toolbar click, and the click is what grants `activeTab`; an OPTIONAL
  permission cannot be granted without a native dialog Playwright can't click. All five now load a temp COPY of
  the build with `<all_urls>` re-declared (`e2e/ext-host-access.mjs`), i.e. they test the state of a user who
  granted access. The **withheld**-access path therefore has no automated coverage at all. **One item cannot be
  verified automatically and is the highest risk in this phase:** `popup.js:144-166` reads `tab.url`, which now
  comes from `activeTab` alone - if opening the popup does not grant it in time, EVERY page shows "Can't run on
  this page". The manual script calls that out explicitly. The real-upgrade grant-survives test is manual by
  nature (it needs two same-id signed builds) - `docs/testing/upgrade-host-permission.md`.
  `tracebug-extension/manifest.json` still duplicates `manifest.base.json`; both edited by hand again.

## Fix A - Actions-tab error and warning rows (2026-10-12)
- Error rows in the Actions tab printed the literal `[object Object]` and `console.warn` rows printed the bare
  word `Warning`, both from one cause: every collector emits the text NESTED as `data.error.message`
  (`collectors.ts` `wrapConsoleLevel` / `collectErrors`), while `action-chips.ts:393` read `data.message` and
  then stringified the `data.error` OBJECT when that came up empty. A new `errorText()` reads the nested message,
  falls back to the error NAME (a `TypeError` with no message still beats "Runtime error"), accepts a plain
  string, and never stringifies an object.
- `src/action-chips.ts` only - `timeline-builder.ts` and `report-builder.ts` already read the nested field, so
  this was the single wrong reader.
- Verified: new `tests/action-chips.test.ts`, 10 cases built on the exact emitted shapes, so a collector change
  that moves the message fails here instead of in a report.

## Fix B - provider body caps (2026-10-12)
- An over-limit body was not a degraded send but NO send: GitHub answers 422 "body is too long" and the whole
  report is lost. `capProviderBody()` in `src/providers/api.ts` now caps it - GitHub **65,536** characters,
  **Slack 40,000** (checked: the documented ceiling for a message's `text`), Linear matched to GitHub's since
  Linear publishes none. The cut backs off to the last paragraph break, line break or space within 1,000
  characters so no line is sheared, CLOSES a ``` fence the cut would have left open (otherwise the notice and
  everything after it renders as code), and ends with a pointer to the full .html export.
- The worker caps **before** opening the confirmation window, so the user approves the exact text that will be
  sent: the "Before you send" box leads with "Shortened to fit GitHub: 240,000 characters became 65,527…" and
  the body label reads "Body - shortened to fit". The post* functions cap again as a backstop, which is the only
  cap in SDK (npm) mode.
- Files: `src/providers/api.ts`, `tracebug-extension/{background.js,confirm-send.js}`,
  `tests/provider-api.test.ts` (+15), `e2e/ext-provider-confirm.e2e.mjs` (+8).
- Verified: 49 unit cases in `provider-api.test.ts` including a sweep at limit+1, 2x and 10x for all three
  providers; the e2e proves the real confirmation window shows 65,527 characters, the cut on a line boundary,
  the warning naming both sizes, and the shortened label. Not capped: the issue TITLE (GitHub's 256-character
  limit) - out of scope here, and titles come from `generateBugTitle`, but it is the next thing a 422 could come
  from.

## Phase 3 - restricted pages, orphaned tabs, updates, a real shortcut (2026-10-12)
- Two decisions moved into a new pure `tracebug-extension/page-support.js` (vm-testable, same pattern as
  `provider-bridge.js`): `classifyPage()` before injecting and `explainInjectionError()` after a failure. The
  popup's "can't run here" panel is now data-driven with one action button, and gained the three cases it was
  missing - the add-on stores, `file://` without the file-URL grant, and the PDF viewer (mapped from the error,
  since a `.pdf` URL is indistinguishable from HTML beforehand). **Dropped the old guard's `!tab.url`
  condition**: with `<all_urls>` optional that is the normal state, so it would have shown "Can't run on this
  page" on every page - Phase 1 flagged this as its highest-risk item and it now has a test.
- Orphaned tabs: the worker pings before dispatching and repairs what doesn't answer. Injection is split into
  `injectBridge` / `injectPageWorld` because they fail independently - the bridge dies with its extension
  instance, the page-world SDK does not (it is ordinary page JS) - so the repair replaces the BRIDGE ONLY when
  the ping answer reports a live `#tracebug-root`, or a second toolbar mounts. The `content-script.js` load
  guard had to change with it: a boolean flag survives in the orphaned isolated world, which made re-injection
  a silent no-op; it is now a liveness probe closing over its own instance's `chrome`.
- `onUpdateAvailable` is held while recording and applied after. The re-check lives in `persistState()`, not on
  one stop handler, because FIVE paths clear `_recordingTabId` and any of them could drop a held update. The
  flag is version-stamped (`updatePendingFrom`) so a stale one cannot reload-loop the worker, and the reload
  waits 2s so the stop reply still reaches the page.
- **The shortcut is a real `commands` entry now, default `Alt+B` - NOT `Ctrl+Shift+B`.** Chrome refuses that
  (bookmarks bar) *and* refuses `Alt+Shift+B` (focus bookmarks bar), returning an empty shortcut for both;
  measured by probing 11 candidates, 9 of which bound fine, so it is a real collision not an environment
  quirk. Approved 2026-10-12. Both keys now work and do different jobs: `Alt+B` captures from a cold start
  anywhere, `Ctrl+Shift+B` opens Quick Bug on a page that already has TraceBug. No UI hardcodes the key - the
  worker reads `commands.getAll()`, publishes it on the existing `data-tb-caps` snapshot, and the popup and
  in-page tips render it (or offer "Set a shortcut"). `browserOwnsQuickCapture()` silences the in-page handler
  only if the user rebinds the command onto that same combo. Also fixed `page-support.js` missing from Chrome's
  `importScripts` list - Step 1 had registered it for Firefox only, so the worker would have thrown on Chrome.
- New: `tests/helpers/chrome-mock.ts` runs the REAL `background.js` in a `node:vm` against a recording fake
  `chrome` - the first automated coverage of the declined-host-access path, which Phase 1 recorded as having
  none. `tests/background-tab-lifecycle.test.ts` (22) + `tests/page-support.test.ts` (46) + 13 in
  `ext-secrets.test.ts`. Files: new `page-support.js`, `docs/testing/restricted-pages.md`; edited
  `popup.{js,html}`, `styles.css`, `background.js`, `content-script.js`, `tracebug-init.js`, both manifests,
  `build-ext.mjs`, `src/{ext-transport,dashboard,index}.ts`, `src/ui/quick-bug.ts`,
  `e2e/ext-provider-confirm.e2e.mjs`, `docs/quickstart.md`, `docs/testing/upgrade-host-permission.md`,
  `CHANGELOG.md`.
- Verified: `npm test` 34 files / 576 passing (was 495, +81); typecheck + lint clean; `build` + `build:ext` OK;
  `ext:lint` 0 errors / 69 warnings - byte-identical distribution to 2a/2b/Phase 1, so nothing new;
  `ext:firefox` installs cleanly with the `commands` key and the 4-script `background.scripts` array.
  `ext-provider-confirm` green including 3 new checks that prove `Alt+B` really bound and reached the page;
  `ext-secret-migration` 26/26 and `ext-redaction` green (both depend on the rewritten content-script guard).
- Open issues: (1) **no harness orphans a live tab** - they all open fresh tabs, so the liveness-probe guard is
  unit-tested and reasoned but not proven in a browser; section 4 of `docs/testing/restricted-pages.md` is the
  manual row. (2) The update deferral **cannot be triggered locally at all** - `onUpdateAvailable` never fires
  for an unpacked extension - so it is a post-release watch item, not a pre-release check. (3) A recording that
  STARTS inside the 2s reload delay is guarded in code but not covered, since driving `tb:rec:start` needs a
  real offscreen host. (4) Whether branded Chrome and Firefox bind `Alt+B` is still manual; Chromium is a
  signal, not proof. (5) `tracebug-extension/manifest.json` still duplicates `manifest.base.json`; both edited
  by hand again - four phases running, worth generating.

## Phase 4, Step A - the first capture records events, not video (2026-10-12)
- **Capture Bug no longer opens a screen-share picker.** New `startEventsCapture()` /
  `stopEventsCapture()` on the SDK arm the session in the *existing* `"events"` mode, start rrweb in
  the page, and mount the recording HUD in a new `mode: "events"` (no Pause, no mic - nothing to
  pause or mute; a wall-clock timer instead of `getVideoElapsedMs()`; Stop / Screenshot / Draw /
  Blur kept, because blur masks the element's text in the replay too). Video is an opt-in checkbox
  in Record options, persisted in the popup's existing `tracebug_record_opts` blob, defaulting OFF
  even for a stored blob that predates the option. Surface and mic grey out while it is off, and the
  hero button's label and icon change with it - it must not promise a recording it won't make.
- **The DOM replay needed a carrier.** Until now `rrwebEvents` only ever rode on a `VideoRecording`.
  New stash in `rrweb-recorder.ts` (`stashDomReplay`/`get`/`clear`), and `report-builder` builds a
  **replay-only `report.video`** from it when the session has no video - same ownership rule as
  `getSessionVideo`, every video field empty. Chosen over a new field because every exporter already
  prefers the rrweb branch and drops the video when `rrwebEvents` is present, so it flows through
  untouched. Deliberately NOT stashed into `_lastRecording`: the ticket modal reads
  `getSessionVideo()` directly and would render a `<video>` with an empty `src`, tripping its "CSP
  blocks embedded video" notice. Two consumers that read "object present" as "video present" were
  fixed (`ai-prompt.ts`, `share-link.ts`).
- **Navigation survival** came mostly free (`index.ts:527-545` already resumes an `"events"`
  session), but the HUD is that capture's only Stop control, so it has to come back. New
  `tracebug_events_capture_started` key - a timestamp, not a boolean, because it answers two
  questions: only a HUD-driven capture re-mounts the HUD (a toolbar ■-tracked session must not, or
  the page shows two stop buttons), and the original start time keeps the timer from resetting to
  00:00 on every page.
- Files: new `tests/events-capture.test.ts`, `e2e/ext-events-capture.e2e.mjs`; edited
  `src/{index,storage,report-builder,rrweb-recorder}.ts`, `src/ui/recording-hud.ts`,
  `src/exporters/{ai-prompt,share-link}.ts`,
  `tracebug-extension/{popup.html,popup.js,background.js,content-script.js,tracebug-init.js}`,
  `tests/background-tab-lifecycle.test.ts`, `CHANGELOG.md`.
- Verified: typecheck + lint clean; `npm test` **35 files / 590 passing** (was 34/576: +10
  events-capture, +4 worker video-opt-in). `build` + `build:ext` OK; `ext:lint` 0 errors / **69**
  warnings with the distribution byte-identical to 2a/2b/Phase 1/Phase 3 (62 generated bundle, 3
  background, 2 manifest, 2 popup) - an icon swap had briefly made it 70, so the CTA ships both SVGs
  in the markup and toggles them instead of assigning `innerHTML`; `ext:firefox` installs cleanly.
  `e2e/ext-events-capture.e2e.mjs` **21/21** in a real MV3 browser, including the negative checks
  that matter: no offscreen document is ever created, a `getDisplayMedia` tripwire on the page is
  never tripped, `isVideoRecording()` stays false - and then the report carries the console error,
  the 500s, actions from BOTH pages and 9 rrweb events with `dataUrl: ""` / `sizeBytes: 0`.
  `ext-secret-migration` 26/26, `ext-provider-confirm` and `ext-redaction` green.
- Open issues: (1) the DOM replay covers only the page a capture ENDS on - rrweb observers die with
  the document; the console/network/action timeline does span pages. Documented, not fixed. (2) The
  new harness replays the worker's injection itself, because an extension cannot `sendMessage` to
  its own service worker; the worker's half (building the message, defaulting `video` to false) is
  unit-covered in `background-tab-lifecycle.test.ts` instead. (3) `e2e/ext-events-capture.e2e.mjs`
  uses repo-relative paths; the five older harnesses still hardcode `D:/Project/TraceBug-ai` (Phase
  8). (4) Steps B-D of Phase 4 still pending; the welcome page and "What's new" card are blocked on
  `docs/launch/screens.md` + the Stitch designs, which are not in the repo.

## Phase 4, Step B - the share dialog explained, and macOS answered (2026-10-12)
- **`surfaceMode` was a dead setting in the extension.** The popup persisted it, `background.js` and
  `content-script.js` forwarded it, the `tb:rec:start` RPC carried it - and `offscreen.js` never read
  it (grep: zero hits). Only `src/video-recorder.ts`'s in-page path honoured it, so the two
  transports disagreed and `docs/chrome-extension.md:66` described the SDK's behaviour as the
  extension's. `preferCurrentTab` is now passed when the user chose "Current tab", matching the SDK.
- **A macOS Screen-Recording denial read as a user cancel.** `getDisplayMedia` raises
  `NotAllowedError` for both, and `offscreen.js` collapsed every `NotAllowedError` into
  `"cancelled"` - so a blocked browser produced "Recording cancelled" and nothing pointing at System
  Settings. New `src/capture-errors.ts` branches on the MESSAGE ("Permission denied by system"), not
  on the platform or the user agent: macOS is the only OS with this gate, so the error identifies the
  situation and UA-sniffing would only add a worse guess on top of a good one. A new `"blocked"`
  status (distinct from `"error"`) carries it, so the union makes TypeScript point at any caller that
  forgets, and the notice is sticky with a **Capture without video** button rather than a 2.5s toast
  - a four-step instruction ending in "restart your browser" cannot be on a timer. **Found while
  wiring it:** the popup's capture path passes no `onStatus` at all, so this failure was previously
  *completely silent* there - no dialog, no capture, no message.
- **The picker line** lives in `src/ui/pre-record.ts` (the module that already owns the moment before
  a recording) and is called from `video-recorder.startVideoRecording` - the one function every
  transport and every caller funnels through - and cleared in its `finally`, which covers started,
  cancelled and failed alike. Copy branches on the mode because the dialog does: with
  `preferCurrentTab` there is no list to "pick this tab" from.
- Files: new `src/capture-errors.ts`, `tests/{capture-errors,picker-hint,offscreen-capture}.test.ts`;
  edited `src/{video-recorder,index,compact-toolbar}.ts`, `src/ui/{pre-record,toast}.ts`,
  `tracebug-extension/offscreen.js`, `e2e/ext-events-capture.e2e.mjs`,
  `docs/{quickstart.md,chrome-extension.md}`, `CHANGELOG.md`. `showActionToast` gained an optional
  `autoDismissMs` (`null` = until dismissed); its 8s default is unchanged for existing callers.
- Verified: typecheck + lint clean; `npm test` **38 files / 626 passing** (+36 across
  capture-errors, picker-hint and offscreen-capture). *(Corrected: this line first said
  37 files / 618 - a misread run. The commit `fde3619` adds exactly those three files, and a
  re-run of the suite at that commit gives 38/626.)* `build` + `build:ext` OK; `ext:lint` 0
  errors / **69** warnings, distribution unchanged again; `ext:firefox` installs.
  `ext-events-capture` **22/22** (+1: no picker hint on the events path). `ext-provider-confirm`,
  `ext-secret-migration` 26/26 and `ext-redaction` all still green.
- Notable test choices: `tests/offscreen-capture.test.ts` runs the REAL `offscreen.js` in a
  `node:vm` with a fake `navigator.mediaDevices` and asserts the constraints it passes - an offscreen
  document is not a Playwright page, so no real browser can see them. `tests/capture-errors.test.ts`
  pulls the local `isSystemPermissionDenial` copy out of `offscreen.js` and runs it against the same
  cases as the SDK's, so the duplicated predicate (the file cannot import SDK modules) cannot drift
  silently.
- Open issues: (1) **the macOS block itself is still unverifiable here** - it needs a real Mac with
  the permission off; what is tested is that the error string maps correctly, in both copies.
  (2) Whether **Firefox** honours `preferCurrentTab` and what its OS-denial message says are both
  manual rows. (3) The in-page (npm SDK) path's system-denial branch has unit coverage of the
  predicate but no browser test, same reason as (1).

## Phase 4 - two additions after Step B (2026-10-12)

- **The video pref moved to `chrome.storage.local`.** It lived in the popup's own `localStorage`,
  which a service worker can neither read nor write, so one question had no answer: has this user
  chosen whether to record video, or have they never been asked? A missing field is not a choice -
  and that ambiguity is what silently flipped a 1.10 always-video user to no-video. The blob is now
  `tb_record_opts` with an explicit `videoSetBy: "user" | "default"`, and `runtime.onInstalled`
  seeds a default that **differs by reason**: video **off** on install, video **on** on update,
  because a pre-Phase-4 user has been recording video on every capture whether they asked to or
  not, and flipping that silently would take away what they use TraceBug for. A `"user"` value is
  never overwritten in either direction. Two guards: on `update` a stored `video` boolean means
  this build already decided for this profile, so the update default does not re-apply (without it,
  a fresh installer who never opened Record options would have video switched **on** by their next
  update); and the popup's migration falls back to the stored seed rather than a literal `false`
  when the legacy blob carries no answer, or the first popup open would undo the update seed. The
  migration has to merge rather than skip-if-present: onInstalled always runs before the popup is
  first opened, so the seed is already there, and "only migrate when the key is absent" would
  discard the choice of a 1.11 user who had turned video on. `videoSetBy` is promoted to `"user"`
  only by the checkbox's own handler - not by a surface or delay change, and not by clicking
  Capture Bug, since accepting a default is not choosing one and a `"user"` stamp would freeze that
  profile on a default it never saw.
- **The exported replay heading names its page.** rrweb restarts on every document while an events
  capture deliberately survives a navigation, so the console/network/action lists span the whole
  capture and the replay beside them covers only the page it ended on. The heading now reads
  "Replay of the last page (/checkout/payment)" on the DOM-replay path. Not on the video path - a
  screen recording keeps rolling across navigations, so there the label would be the inaccuracy -
  and the timeline scrubber keeps its own "Replay" label, which is built from the session's events
  and really does span everything. The href is read from the rrweb Meta event (`type: 4`) and stored
  as `payload.rrwebPage` **before** gzipping, so the viewer need not inflate the stream to render a
  heading.
- Files: new `tests/{record-opts,replay-page-label}.test.ts`; edited
  `tracebug-extension/{background.js,popup.js}`, `src/exporters/{html-template,html-replay}.ts`.
  Deleted `docs/launch/designs/tracebug_welcome_page_variant_{a_split_workbench,b_guided_timeline}/`
  (unused, and carried invented claims a later session could have copied).
- Verified: typecheck + lint clean; `npm test` **40 files / 658 passing** (+32: 25 record-opts,
  7 replay-page-label). `build` + `build:ext` OK; `ext:lint` 0 errors / **69** warnings, baseline
  unchanged. `ext-events-capture` **22/22** - and its navigation checks corroborate the label: the
  capture crosses a navigation, the timer keeps counting, and the report comes back with 9 rrweb
  events, i.e. the last page's stream only.
- Notable test choice: `popup.js` is one `DOMContentLoaded` closure over the whole popup DOM, so it
  cannot be evaluated in a `node:vm` the way `offscreen.js` can. `tests/record-opts.test.ts` slices
  the real `loadRecordOpts` text out of the shipped file and runs that, injecting the two key
  constants and pinning their literals against the source so a rename cannot pass silently. Weaker
  than loading the file; stronger than a copy of the logic.
- Open issues: (1) The popup migration is **not** covered end-to-end in a browser - the slices test
  the precedence rules and the stamping, not the popup actually opening. Two manual passes worth
  doing: a profile with a `tracebug_record_opts` blob holding `video: true`, updated, should still
  show the checkbox ticked; and a pre-1.11 profile with no `video` field at all, updated, should
  show it ticked too (the update seed) rather than cleared. (2) The reason split means the two
  populations now see different first captures, so any manual script that says "the first capture
  records events, not video" is only true of a fresh install.

## Phase 4, Step C - a welcome page that works offline (2026-10-12)

- First run opened the REMOTE `tracebug.dev/try.html`, so the first thing a new user saw depended on
  their network and on a page that ships separately. Now `tracebug-extension/welcome.html` + `welcome.js`
  (bundled, no remote assets, in `SHARED_FILES`), with that playground as its step 2.
- Nothing is hardcoded that the page has no right to assert: version from `getManifest()`, the capture
  shortcut from `chrome.commands` (plus the "No shortcut set" variant), and the rebind link branches on
  the extension URL scheme with text-step fallback if Firefox refuses `about:addons`.
- The "Rolling this out to a team?" card is ABSENT - `tracebug.dev/teams` does not exist. `TEAM_GUIDE_URL`
  is empty and the card builds itself when set. Corrected `screens.md`, which told a future session to
  draw a fixed Ctrl/Shift/B key group - a keystroke that captures nothing since Phase 3.
- Files: new `welcome.html`, `welcome.js`, `tests/first-run.test.ts`; edited `background.js`,
  `build/build-ext.mjs`, `screens.md`, `CHANGELOG.md`. Verified: check.mjs --full all green,
  669 passing / 41 files (+11), ext:lint 0 errors / 69 warnings.
- Open: the page has never been RENDERED (tests assert source, not layout); and `dist/**` is read-denied
  by `.claude/settings.json`, so the build output could not be inspected here - only `SHARED_FILES`.

## Phase 4, Step D - what's new, per version (2026-10-12)

- An update no longer steals a tab. `background.js` `flagWhatsNew` writes the landed version to
  `tb_whats_new` and holds no copy at all; `popup.js` owns a literal per-version `WHATS_NEW` table and
  renders the card only when that version has an entry. A release that forgets an entry shows nothing
  rather than an empty box, and the stale flag is dropped so it is not reconsidered on every open.
- **The card is invisible until the version bump** - the table is keyed `1.11.0`, the manifest says
  `1.10.1`. That is the design working, not a bug: copy appears when the release it describes ships.
- `ext:lint` caught a real one. The check icon was built with `innerHTML`, which web-ext flags
  UNSAFE_VAR_ASSIGNMENT - warnings went 69 -> 70 and the baseline failed the gate. Rebuilt with
  `createElementNS` (`wnCheckIcon`); back to 69. Exactly what the baseline is for.
- Files: new `tests/whats-new.test.ts`; edited `background.js`, `popup.js`, `popup.html`, `styles.css`,
  `tests/helpers/chrome-mock.ts` (version now settable), `CHANGELOG.md`. Verified: check.mjs --full all
  green, 685 passing / 42 files (+16), ext:lint 0 errors / 69 warnings; ext-events-capture 22/22,
  ext-redaction 4/4.
- Open: the card has never been RENDERED - no screenshot, no real popup. Needs a profile updated from
  a 1.11.0 build, which cannot exist until the version is bumped.

## Phase 4, Step E - which page, and why you left (2026-10-12)

- The popup's "can't run here" panel now says WHICH page it means: a host/path card fed by a new
  `describePage` in `page-support.js` (there, not popup.js, so the worker could reuse it and it is unit
  testable). It returns null - card absent, not blank - when `tab.url` is invisible, which since Phase 1
  is the normal state. Plus one glyph per reason, indigo only where one click fixes it; `csp`,
  `needs-access` and `unknown` keep the pixel-bug fallback, as `screens.md` names no glyph for them.
- `runtime.setUninstallURL` -> `https://tracebug.dev/bye?v=<version>`, set at worker start rather than on
  install so a profile running since before this version still gets it. Version only: a test asserts the
  query string has exactly one key, because the page's fine print promises that.
- New `website/app/bye` (page + client form): seven reasons, optional note and email, Send and an
  equally prominent Skip, thank-you state with GitHub-issue and reinstall links. No navbar, no footer,
  noindex - someone who just uninstalled is not a lead. POSTs via Netlify Forms like `/feedback`;
  registered in `public/__forms.html`, without which submissions are accepted and silently dropped.
- Files: new `website/app/bye/{page.tsx,ByeForm.tsx}`, `tests/uninstall-and-page-card.test.ts`; edited
  `page-support.js`, `popup.{js,html}`, `styles.css`, `background.js`, `__forms.html`, chrome-mock
  (records the uninstall URL), `CHANGELOG.md`. Verified: check.mjs --full green, 708 passing / 43 files
  (+23), ext:lint 0/69, website `tsc --noEmit` clean, ext-events-capture 22/22, ext-redaction 4/4.
- Open: neither the popup states nor `/bye` has been RENDERED. `/bye` also needs one real submission
  against Netlify to prove the form is collected - that cannot be tested locally.

## Phase 4, Step F - the review ask, and a footer you can remove (2026-10-12)

- New `src/links.ts` is the one place store URLs and UTM tags live (Phase 5's last item). **I had
  invented a store id and an AMO slug on the first pass**; the real Chrome id is
  `fdemmibikigigkfjngclmdheeajhdgaj`, verified against CHANGELOG.md and three docs that agree. The
  repo has no confirmed AMO slug, so there is deliberately **no Firefox listing constant** - a guessed
  store URL baked into an export is a dead link for whoever reads that report later. Also corrected the
  invented slug I had put in `website/app/bye/ByeForm.tsx` during Step E.
- The exported `.html` footer already existed, pointing at `tracebug.dev/?ref=replay`. Retargeted to the
  store listing with `utm_source=report&utm_medium=export`, and made removable: `showFooter` on the
  payload, `tracebug_show_export_footer` as the pref, and a `menuitemcheckbox` in the export menu. An
  export is often attached to a public issue or sent to a client; a promotional line must not be
  unremovable there.
- New `src/ui/review-ask.ts`: asks after the 3rd successful export, **never in the user's first
  session**, once more at the 10th if dismissed, then never. Marked asked at SHOW time, so ignoring it
  counts. Counting hooks the two export paths only after a file exists. No rating, no count, no social
  proof, no incentive - asserted as rules in the tests, not as implementation.
- Files: new `src/links.ts`, `src/ui/review-ask.ts`, `tests/review-ask.test.ts`; edited
  `src/exporters/{html-template,html-replay}.ts`, `src/ui/quick-bug.ts`, `website/app/bye/ByeForm.tsx`,
  `docs/launch/{PLAN,STATE}.md`, `CHANGELOG.md`. Verified: check.mjs --full green, 730 passing /
  44 files (+22), ext:lint 0/69; milestone-ask 5/5, ext-events-capture 22/22, ext-player-csp green.
- Open: the card has never been RENDERED, and the review link cannot be clicked through in a test.
  Phase 5 is now down to the **issue signature** alone; `PLAN.md` Phase 5 is annotated accordingly.

## Phase 5 closed - the issue signature (2026-10-12)

- New `src/integrations/issue-signature.ts`: "Reported with TraceBug" linking to the listing with
  `utm_source=issue`. Applied at `tracker-client.ts`'s `issueBody` and a new `slackText`, which is the
  one chokepoint GitHub, Linear, the page-world path AND the extension bridge path all pass through -
  signing at the call sites would have let the bridge path drift from the page path silently.
- Slack already ended every post with an unlinked `_Reported via TraceBug_`. That line is REPLACED, not
  appended to; two credits in one message would be worse than either. With the signature off, the old
  line is left alone rather than silently deleted.
- Idempotent by design (`body.includes(TEXT)` guard), because a body can pass through more than one
  helper. Toggle sits beside the export-footer one in the export menu, default on, labelled
  "Issue credit: on/off" - an issue body is written into someone else's tracker and stays there.
- Files: new `src/integrations/issue-signature.ts`, `tests/issue-signature.test.ts`; edited
  `src/integrations/tracker-client.ts`, `src/ui/quick-bug.ts`, `docs/launch/{PLAN,STATE}.md`,
  `CHANGELOG.md`. Verified: check.mjs --full green, 746 passing / 45 files (+16), ext:lint 0/69,
  ext-provider-confirm 61/61 (it inspects real send bodies).
- **Phase 5 is now complete** and `PLAN.md` says so. `STATE.md` was rewritten rather than appended to:
  it had grown a per-step changelog, which is what PROGRESS is for. Next: Phases 6-9.

## Phase 6 - edge cases (2026-10-13)

- **Oversize exports.** Above a 20 MB estimate the modal now says so, names GitHub's 25 MB attachment
  cap, and offers what is actually possible. PLAN.md's "DOM replay only (no video)" fallback **cannot
  fire**: when a DOM replay exists the exporter already drops the video, so that is the small export.
  The oversize case is the opposite branch - no replay, WebM base64-embedded - where the offers are
  "Export without video" (new path, `includeVideo: false`) and taking the `.webm` separately. Warned at
  20 rather than 25 because the figure is an estimate and a 26 MB surprise after a wait is the failure.
- **Canvas pages.** New `src/replay-fidelity.ts`: rrweb runs with `recordCanvas: false`, so a
  canvas-driven page replays as a correctly-sized empty box. Warned at events-capture start, where
  "turn on video" is still an option, measured on RENDERED area vs viewport (>25%) so sparklines and
  2000px-backing-store icons don't trigger it. TraceBug's own draw canvas and anything under
  `#tracebug-root` are excluded. Auto-dismisses after 12s with a Stop action - a sticky notice over the
  page you are reproducing a bug on would be worse than the problem.
- **Jira** menu item is now "Copy for Jira", with a tooltip saying why it cannot file (Jira Cloud is
  CORS-blocked for browser XHR). The Slack item needed nothing - resolved by Phase 2b.
- Files: new `src/replay-fidelity.ts`, `tests/phase6-edges.test.ts`; edited `src/index.ts`,
  `src/ui/quick-bug.ts`, `tests/review-ask.test.ts`, `docs/launch/{PLAN,STATE}.md`, `CHANGELOG.md`.
  Verified: check.mjs --full green, 763 passing / 46 files (+17), ext:lint 0/69; ext-events-capture
  22/22, blur-tracking 7/7, pre-record 7/7.
- One test of mine needed loosening: `review-ask` pinned `showFooter` to exactly 2 call sites, and the
  new no-video path is a legitimate third. Now asserts coverage of every export path instead of a count.

## Phase 7 - diagnostics without telemetry (2026-10-13)

- New `tracebug-extension/diagnostics.js`: a scrubber, a 20-entry error ring in
  `chrome.storage.session`, and a report builder. Loaded by the worker (importScripts + Firefox
  `background.scripts`) and the popup, same pattern as `page-support.js`. No `fetch`, no
  `sendBeacon`, no `WebSocket` - a test asserts that, because a network call here would make "no
  telemetry" false.
- The scrubber is the privacy boundary: whatever it misses, the user pastes into a public issue.
  **The leak test PLAN.md asked for found a real leak on the first run** - a 16-digit card number
  inside `<input value="...">` passed every rule (my opaque-run rule needed 24+ chars). Fixed with a
  12+-digit rule AND an HTML-markup strip that runs FIRST, before the placeholders that themselves
  look like tags. Tests assert against real browser error strings, not against the regexes.
- Stack frames are filtered to TraceBug's own files, so a host-page script path - which is both a URL
  and useless for fixing TraceBug - never appears. Granted origins are matched against our own
  declared list and anything else is counted, not named: a user who pointed Ollama at
  `llm.acme.internal` has granted their own infrastructure.
- The UA is read in exactly one place, reduced to a browser name + MAJOR version and an OS family.
  That is reporting, not branching - the project's feature-detect rule is about deciding behaviour.
- Files: new `diagnostics.js`, `tests/diagnostics.test.ts`; edited `background.js`, `popup.{js,html}`,
  `build/build-ext.mjs`. Verified: check.mjs --full green, 796 passing / 47 files (+33), ext:lint
  0 errors / 69 warnings; ext-redaction 4/4, ext-events-capture 22/22, ext-provider-confirm 61/61.
- `ext:lint` caught a broken string literal in popup.js that `typecheck` and `lint` both missed -
  extension JS is outside the TS pipeline, so web-ext is the only parser that sees it.

## Phase 8 (partial) - the Phase 2a guarantee, in a real DOM (2026-10-13)

- New `e2e/ext-no-secrets-in-page.e2e.mjs`. Seeds a GitHub PAT, a Linear key, a Slack webhook and an AI
  key into `chrome.storage.local`, runs the real injection chain, opens the ticket modal and the
  settings pointer, then harvests everything a page script could read - FROM INSIDE THE PAGE, because
  that is the threat model. 13 checks, all passing.
- **Proved it can fail.** Planted the token as a `.value` PROPERTY only, the way the old
  `value="${escapeHtml(tok)}"` prefill did: `clean: outerHTML` passed while the `.value` check failed.
  An outerHTML-only test would have missed it entirely - which is the whole reason PLAN.md asked for
  this one.
- That exercise found two reporting flaws of mine: shadow-root input values were bucketed as plain
  inputs (so a failure pointed at the wrong part of the DOM), and the settings-pointer check printed
  "DOM still clean" even when it wasn't. Both fixed, then re-verified with a shadow-only leak, which
  now reports as a shadow leak with the other buckets correctly clean.
- The suite also asserts the harvester can see the page's OWN values (`hunter2`, a shadow value, a
  storage value). Without that, every "clean" result could be a false negative from a broken harvester.
- Added to `ci.yml`'s e2e job - possible now that extension loading works headless - and to
  `e2e/README.md`. Verified: check.mjs green, 796 passing / 47 files; the suite 13/13.
- **Phase 8 steps 2-4 (fixtures, smoke spec, golden report, CI nightly) are deferred to after
  submission**, by decision. Only this item was pulled forward.

## Growth audit reconciled into the plan (2026-10-14)

- Rewrote `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored): the Oct 11 "25 -> 1,000 installs"
  audit, re-scored against code.
  **24 of 32 items done, 1 deferred to v2.0 (saved tickets -> IndexedDB), 7 open** - and every
  open one needs a person, a browser or an outside channel, not a session. Calendar redated from
  Oct 14; submission Thu Oct 16; Show HN moved behind 1.11.1 because a paused feature reads as a
  broken one to the HN crowd.
- Recorded two collisions the audit could not see: the video pause overtakes its fix #7 entirely,
  and "This tab" capture needs the `tabCapture` permission its own fix #2 told us to drop - which
  is the install warning fix #1 told us to avoid. That trade is a product decision, now written down.
- `PLAN.md`: Phase 4 C/D and Phase 9 marked done; new **Phase 10** (1.11.1 video, pointing at
  `video-1.11.1.md`) and **Phase 11** (1.12 Site Audit, with the 1.12a/b/c split and the axe-core
  size question). `STATE.md` gained a pointer to it. Docs only - no code touched, no gates run.

## Doc and copy pass for the video pause (2026-10-14)

- **Two user-visible strings still told people to use a control 1.11 removed.** The canvas toast
  said "stop and turn on Record video too"; the `WHATS_NEW` 1.11.0 card said "turn it off to try"
  capture-without-sharing. Both are fixed. The toast branches on the existing `isVideoOffered()`, so
  the npm SDK keeps the correct advice and 1.11.1 reverts it with no edit; the card now says video is
  paused, when it returns, and that the setting is kept. **Both were pinned by tests asserting the
  stale copy** - `tests/{whats-new,phase6-edges}.test.ts` now pin the new intent, and phase6 gained
  an extension-branch case (jsdom defaults to the SDK path, so the old test would have passed over
  the bug). Also `docs/launch/screens.md` screen 4, the design source for that card.
- `docs/chrome-extension.md`: Capture Bug is events-only, the mic line and the capture-surface option
  are gone, "Nothing leaves the browser" is now the privacy page's wording, the file tree matches the
  shipped files, and the architecture block no longer presents the offscreen document as live.
  **The permissions table was rebuilt from `manifest.base.json` - it was wrong in five ways** (listed
  `tabs`, `offscreen`, `tabCapture` and a required `<all_urls>`; omitted `alarms`), which made the
  extension read as far more invasive than it is. Optional host permissions are now a table of their
  own with what triggers each. Same sweep removed the three stale "Current tab / macOS" lines from
  `quickstart.md`, scoped the macOS paragraph, and fixed `README.md`'s Record-options sentence.
  `docs/api-reference.md`'s `surfaceMode` stays - it is the SDK's, and it works.
- `RELEASE_CHECKLIST.md` rows 1-3 rewritten: the checkbox they read off is gone, so they now verify
  `tb_record_opts` keeps `video: true` across the upgrade **while the capture stays events-only** -
  the pair 1.11.1 depends on. Row 9's oversize half marked skipped (its branch cannot be produced
  without video); the canvas half stays and now expects the new copy. Both carry restore notes, as
  does `video-1.11.1.md` step 5b.
- The growth plan: Oct 14 is a Wednesday - week 1 redated (submission stays **Fri Oct 16**, Showoff
  Saturday is **Sat Oct 17**). Show HN is no longer a fixed Oct 27 but the first Tuesday after 1.11.1
  is *approved*; if review slips it slips to Nov 3. `store-submission-pack.md`: `unlimitedStorage`
  justified without mentioning video, intro line and §5 removed.
- Verified: `node scripts/check.mjs --full` green - **818 passing / 48 files**, ext:lint 0 errors /
  69 warnings, versions 1.11.0. That one number now appears in STATE, the growth plan and
  video-1.11.1.md,
  which disagreed (796/47 and "817 unit tests"). Fixed STATE's `zip:ext` path, which had been
  corrupted to a literal tab: it is `C:\Windows\System32\tar.exe`.
- Trimmed: STATE.md 127 -> 60 lines, PROGRESS.md 285 -> 2 entries (9 moved to the archive), PLAN.md
  291 -> 215 with Phases 4-7 as one line each and their full text in `PLAN-archive.md`.
- **The growth plan stays out of the repo.** The reconciled plan went into
  `docs-internal/GROWTH-PLAN-30DAY.md`, replacing the Oct 11 copy, and the tracked
  `docs/launch/GROWTH.md` was deleted (it was never staged, so there was nothing to `git rm`).
  `docs-internal/` is still ignored via `.gitignore:34` and holds no tracked files. Four sections of
  the original were preserved rather than dropped - the Verdict and its scenario table, Store
  listing and conversion, the no-telemetry feedback signals, and Sources - and its stale
  "tokens are readable by the host page" premise is annotated, not silently deleted. Its test plan
  now points at `docs/RELEASE_CHECKLIST.md` and its Site Audit roadmap at `PLAN.md` § Phase 11.
- **The privacy page no longer justifies `offscreen`**, which 1.11 does not request
  (`website/app/privacy/page.tsx`); `unlimitedStorage` there and in the submission pack is justified
  by the replay alone. Restoring all of it is step 5b / the `offscreen` block in `video-1.11.1.md`.
- Open: the AMO slug contradiction (`docs/compatibility.md` publishes a URL `src/links.ts` refuses
  to hold) - left alone deliberately, pending confirmation of the real slug. **CLOSED 2026-10-15:
  the published URL was a 404; the real slug is `tracebug-bug-reports-for-ai`.**
## Offscreen files, the AMO slug, and a git rule (2026-10-15)

- **`offscreen.{html,js}` no longer ship while video is paused.** They were inert - no permission,
  and no `tb:rec:*` is sent when `isVideoOffered()` is false - but a document the manifest cannot
  open is an oddity in a reviewed package. `build-ext.mjs` parses `VIDEO_ENABLED_IN_EXTENSION` out
  of `src/video-recorder.ts` rather than carrying a second flag, and throws if it is renamed.
  Archives 30 -> 28 files, both targets, `PK` confirmed; `ext-shipping-path` 16/16 with them absent.
- **The AMO link we published was a 404.** `/addon/tracebug/` does not exist. Resolved by GUID, not
  by name: AMO's API for `tracebug@prashantsinghmangat` returns slug `tracebug-bug-reports-for-ai`,
  public, 1.10.1. Now in `src/links.ts`; the guard test was INVERTED (it asserted no Firefox link
  could be declared - the risk is now declaring the wrong one) and cross-checks `compatibility.md`.
- **Privacy page stopped justifying `offscreen`**, which 1.11 does not request; restore notes for
  all four permission surfaces are in `video-1.11.1.md`.
- **Git: `--only <paths>` is now a rule** (`CLAUDE.md`), plus `Bash(git push:*)` in the settings
  deny list. A bare `git add` had swept 19 files into a commit meant for 7.
- Verified: `check.mjs --full` green - **819 passing / 48 files**, ext:lint 0 errors / 69 warnings.
  Five commits on `develop`. Open: nothing blocking; the remaining items need a person.

## 1.11.1 capture fixes — the audit's Option A (2026-10-19)

- **Why:** a tester's ticket read "1 screenshot attached · 0 events". `docs/audit/capture-architecture.md`
  reproduced every cause in a real browser; this is its Option A, in the agreed order.
- **Shipped:** network dedupe (wrapper row wins, paired on resolved URL + start within 50ms) ·
  page-load backfill rebuilt (failed-or-slow only, `phase: "page-load"`, no invented `GET`) ·
  contenteditable typing captured under the input redaction rules and cap · the DOM replay now masks
  sensitive editors and applies the user's Mask patterns · the **zombie capture is gone** (the worker
  owns "is a capture running", `tb:capture:status`) with "Capture ended when you left <host>" on the
  next page · honest HUD ("Replay, not video" + a live tally that matches the ticket) · an iframe
  warning on the canvas pattern, **no `allFrames`** (ADR 008 / Phase 12 instead).
- **Files:** `src/{collectors,network-dedupe,replay-masking,capture-ownership,replay-fidelity,
  rrweb-recorder,report-builder,index}.ts`, `tracebug-extension/{background,content-script,popup}.js`,
  `popup.html`, `docs/{compatibility,chrome-extension}.md`, `docs/adr/008-*`, PLAN Phase 12.
- **Verified:** `check.mjs --full` 894 passing / 53 files; new e2e `ext-cross-site-capture` 10/10;
  `ext-{events-capture,redaction,shipping-path}` 22/4/16. Live fixtures for every claim above.
- **Open:** replay masking with user patterns runs a regex pass per text node — unbenchmarked on a
  2.6 MB snapshot. Video (Phase 10) is still untouched and comes next.

## 1.11.1 release prep, and three checks before it (2026-10-19)

- **Worker restart:** `captureTabs` is in `tb_sw_state_v1` and `tb:capture:status` awaits `_hydrated`
  — now proven, not inspected. `tests/capture-ownership-worker.test.ts` loads background.js against a
  seeded `storage.session` (exactly a restarted worker); the e2e stops the real worker over CDP and
  asserts a sentinel global is gone first, so the case cannot pass vacuously. 13/13.
- **Origin now comes from Chrome** (`sender.origin` → `sender.url` → the page's claim, in that order),
  so a page cannot name its own origin to keep or kill its capture.
- **Benchmarked the mask pass** on 20,000 text nodes / 1.8 MB of text, 5 patterns, 30s of typing
  (~9,000 keystrokes): snapshot 743/820/824 ms without rules vs 687/785/802 ms with — the delta is
  below run-to-run noise and far under the 50 ms budget; typing p95 gap 5.0 ms both ways, **zero long
  tasks**. Patterns are now compiled into one alternation. The tester's real 2.6 MB snapshot is 118
  text nodes / 931 chars — its weight is inlined images, not text.
- **Released as 1.11.1:** eight surfaces bumped, CHANGELOG + "What's new" card, four new
  RELEASE_CHECKLIST rows (10a-10d), Phase 10 renamed to 1.11.2. `check.mjs --full` 904 passing / 54
  files; zips 28 files, `PK`, no `offscreen`; cross-site 13/13, events 22/22, shipping 16/16.

## 1.11.2 release prep — correctness (2026-10-22)

- **What:** Bug 0 (own global + defer to a host toolbar), T-01, T-02 (committed earlier) plus T-05
  (export link, not modal), T-06 (no Capture button on the error card mid-capture), T-13 (popup
  cross-site row removed; options shows an old `<all_urls>` grant with Remove), stale Ollama origin
  released, welcome page v2. Eight surfaces on 1.11.2, CHANGELOG + "What's new", store copy,
  RELEASE_CHECKLIST rows 10e-10h (10a was split by a misplaced row; fixed). User-facing "video
  returns in 1.11.2" corrected to 1.11.3 (popup, canvas toast, README, docs).
- **Verified:** `check.mjs --full` 928 passing / 57 files, ext:lint 0 errors / 69 warnings.
  e2e: sdk-isolation 17/17, cross-site 13/13, shipping-path 16/16, events 22/22, redaction 4/4,
  no-secrets 13/13, github-send-confirm 9/9, secret-migration 25/25. `website` `next build` OK.
  Zips: 28 files each, `PK`, no `offscreen`, ~835 KB. Deleted the unused
  `src/ui/{upgrade,screenshot-trim}-modal.ts` (knip). Open: `package-lock.json` root version not bumped here.

## REC badge + screen recording restored (2026-10-23)

- **REC badge:** the toolbar badge only ever showed green "ON" for "SDK loaded," identical whether a
  capture was running or not. `background.js`'s `updateBadge()` now checks the existing `captureTabs`
  map and shows a red "REC" the instant `TB_START_RECORDING`/`tb:capture:started` fires, reverting on
  `tb:capture:stopped` or `endCapture()`.
- **Screen recording restored (`VIDEO_ENABLED_IN_EXTENSION = true`):** re-verified Bug 1 ("recording
  lost on stop", `docs/launch/video-1.11.1.md`) in a real browser two ways — plain stop, and a
  mid-recording reload — and it did **not** reproduce; the `quick-bug.ts` stash-then-refresh rework
  (commit `dda5ac8`) looks to have already fixed the race the doc's hypothesis described. Bug 4 (HUD
  mic-mute wired to a stream the extension never owns) is still real but was left as-is on purpose:
  `hasMicrophoneTrack()` is permanently false for the extension transport, so the button already
  renders disabled with an honest tooltip rather than a dead click. Bug 2 (fullscreen) stays open,
  polish only. Restored: `offscreen` permission (manifest.json + `build-ext.mjs`'s `chromeManifest()`,
  gated on the same flag build-ext already parses), popup's `optVideo`/`micOpt` markup, WHATS_NEW
  1.11.2 card, RELEASE_CHECKLIST rows 1-3/9 UI-based steps, permission-justification docs
  (`store-submission-pack.md` §7b, `docs-internal/CHROME-WEB-STORE-LISTING.md` §7b,
  `docs/chrome-extension.md`, `website/app/privacy/page.tsx`), README/quickstart video sentences.
  Replaced `tests/video-paused-1-11.test.ts` → `tests/video-enabled-1-11-2.test.ts` (pins the
  restored behaviour, not just removes the old pin) and `tests/phase6-edges.test.ts`'s inverted
  canvas-toast assertion.
- **Verified:** `check.mjs --full` 925 passing / 57 files (one file renamed, not net-new), ext:lint 0
  errors / 69 warnings, `check:versions` all surfaces on 1.11.2. New e2e:
  `ext-video-recording.e2e.mjs` (8/8, the two Bug-1 repro scenarios with fake-media flags),
  `ext-shipping-path.e2e.mjs` rewritten for "stored video:true is now honoured" (14/14, was asserting
  the opposite). `ext-events-capture.e2e.mjs` re-run clean (22/22) — events-only path unaffected.
  Open: Bug 2 (fullscreen) and Bug 4 (mic-mute) stay in `video-1.11.1.md` as known, non-blocking gaps;
  `docs-internal/GROWTH-PLAN-30DAY.md`'s dated video-pause references were left untouched (internal
  scheduling doc, not store/user-facing).

## A fifth bug: Trusted Types CSP broke the dashboard on real sites (2026-10-23)

- **What:** the user hit a DevTools "Errors" panel full of `This document requires 'TrustedHTML'
  assignment. The action has been blocked.` on stitch.withgoogle.com, stack-traced to
  `mountCompactToolbar`, with cascading `[TraceBug] Dashboard mount failed` and
  `[TraceBug] Failed to open ticket modal after auto-stop` errors. Root cause: a host page can enforce
  `require-trusted-types-for 'script'` CSP, which gates every HTML-producing sink
  (innerHTML/outerHTML/insertAdjacentHTML) — confirmed live via `curl -sD -` against
  stitch.withgoogle.com's own response headers. `src/`'s UI code had 89 raw `el.innerHTML = html`
  assignments across 14 files; every one of them threw synchronously there, aborting whatever function
  it was in partway through and leaving the toolbar/dashboard/HUD/ticket-modal half-built or entirely
  silent.
- **First attempt was wrong:** assumed `DOMParser.parseFromString` was exempt from Trusted Types (a
  common belief, since DOMParser documents are inert). It is NOT — confirmed by hand against a real
  CSP-enforcing fixture; `Range.createContextualFragment` is also gated. There is no string-to-HTML
  parsing API Trusted Types leaves open.
- **Actual fix:** `src/ui/helpers.ts`'s new `setInnerHTML(el, html)`, a three-tier fallback — (1) the
  direct assignment, works on the overwhelming majority of pages; (2) TraceBug's own Trusted Types
  policy (cached, created once), which works on any page enforcing Trusted Types without ALSO
  restricting which policy names are allowed — confirmed this is stitch.withgoogle.com's exact case
  (its CSP has no `trusted-types` allow-list directive at all); (3) last resort, clear the element's
  children rather than let the exception propagate and abort every statement after it — the only
  option left on a page that also locks the policy-name allow-list, since no HTML-parsing API survives
  that combination without a full plain-DOM-API rewrite. All 89 call sites across
  `compact-toolbar.ts`, `dashboard.ts`, `draw-mode.ts`, `element-annotate.ts`, `inspect-mode.ts`,
  `quick-bug.ts`, `recording-hud.ts`, `replay-scrubber.ts`, `issues-panel.ts`, `live-bug-card.ts`,
  `milestone-ask.ts`, `pre-record.ts` and `toast.ts` now go through it (`exporters/html-template.ts`'s
  10 were deliberately left alone — that file generates the standalone exported `.html` viewer, which
  runs as its own document with no host-page CSP, not injected into a third-party page). Replaced
  mechanically via a one-off transform script (a hand-rolled template-literal-aware scanner, since a
  blind regex corrupted a multi-hundred-line template on the first attempt — caught by `tsc` before it
  reached disk) with every output reviewed via `git diff` and the full gate suite as the safety net.
- **Verified:** `check.mjs --full` 937 passing / 58 files. `ext:lint` warnings dropped from 69 to 22 —
  the `UNSAFE_VAR_ASSIGNMENT` innerHTML warnings the fix eliminates, confirming it; baseline lowered
  accordingly (two legitimate innerHTML assignments remain, both inside `setInnerHTML` itself). New
  unit suite `tests/safe-set-inner-html.test.ts` (8 tests, all three tiers). New e2e
  `ext-trusted-types-page.e2e.mjs`, two scenarios against REAL CSP headers: the realistic one
  (stitch.withgoogle.com's actual policy — HUD mounts, ticket modal opens, zero TrustedHTML errors,
  9/9) and an adversarial one (policy names also locked down — degrades without throwing, doesn't
  crash the extension or the page). All other capture e2e suites re-run clean.

## A sixth bug: the worker-restart fix had a hydration race (2026-10-23)

- **What:** the user hit "This site runs its own TraceBug" a THIRD time, on stitch.withgoogle.com,
  after the worker-restart fix (bug #4) had already shipped. Root cause: that fix added
  `activeTabs.has(tabId)` to `handleComboAction`'s decision between the repair path and the
  fresh-injection path — but `handleComboAction` itself never awaited `_hydrated` before reading it.
  A real MV3 worker can be woken BY the very message that triggers `handleComboAction` (the idle
  timeout killed it, then the user's click is what wakes it back up) — in that exact case,
  `_hydrated`'s own `chrome.storage.session` read is still in flight, `activeTabs` is still the empty
  Set it starts as, and the fix from bug #4 silently doesn't fire. Reading a value one tick too early
  is exactly as wrong as never reading it, and this is almost certainly the real, narrow-timing-window
  cause behind the chatgpt.com AND stitch.withgoogle.com reports alike — not anything site-specific.
- **Fix:** one line — `await _hydrated` at the top of `handleComboAction`, before anything reads
  `activeTabs` or `injectedTabs`. Every OTHER function that touches that bookkeeping already did this
  (`injectSDK`, `ensureAlive`); `handleComboAction` was the one gap.
- **Verified:** a new unit test deliberately skips the `settle()` call every other test in the file
  uses right after `loadBackground()` — that delay is exactly what was masking this race in every
  earlier test, including bug #4's own. Confirmed by temporarily reverting the fix and re-running:
  the test fails with the exact `tracebug-host-ui-present` error the user saw, then passes clean with
  the fix restored. `check.mjs --full` 938 passing / 58 files. Full e2e sweep re-run clean:
  `ext-events-capture` (22/22), `ext-cross-site-capture` (13/13), `ext-badge-host-ui-defer` (4/4),
  `ext-worker-restart-reinject` (4/4), `ext-video-recording` (8/8), `ext-shipping-path` (16/16),
  `ext-trusted-types-page` (9/9) — 76/76 total.
- **Not verified this round: Firefox.** This project has no automated Firefox e2e — `npm run
  ext:firefox` is interactive (`web-ext run` blocks until Firefox closes) and deliberately not a gate.
  Everything above was verified in Chromium only; a manual Firefox pass is still owed before release.
- **Open architectural question, not acted on:** the user asked for the capture flow to be
  simplified, closer to how Jam does it. The host-UI detection this bug (and #1 and #4) kept tripping
  over is fundamentally a heuristic — background.js infers "is this tab already ours?" from in-memory
  bookkeeping (`injectedTabs`, `activeTabs`) that has repeatedly proven fragile across worker restarts
  and timing races. A more robust alternative: have `tracebug-init.js` stamp a DOM marker (e.g.
  `document.documentElement.dataset.tracebugExtension`) the instant it mounts, and have
  `detectHostTraceBugUI()` check that marker instead of inferring ownership from the worker's memory
  at all — correct regardless of restarts, since it depends only on DOM state. Not implemented: it
  touches the same surface as `docs/launch/sdk-isolation-1.11.2.md` and deserves its own careful pass
  rather than a same-turn rewrite under time pressure.

## Three real capture-flow bugs found by hand-testing the real extension (2026-10-23)

- **What:** the user hand-tested the real unpacked extension (not the e2e harness's synthetic
  `sendMessage` shortcuts) and found the REC badge lying in two ways, plus the popup silently
  offering to clobber a running capture.
  1. **Stale REC badge on a host-UI-deferred navigation.** Start a capture on a plain site, navigate
     the same tab to a site running its own TraceBug — `injectSDK()` correctly defers (one interface
     per page), but nothing on a deferred page ever pings `tb:capture:status` (the only other way a
     capture ends), so `captureTabs` — and the badge — stuck forever. Fixed: `injectSDK()`'s catch
     path now calls `endCapture(tabId, "inject-failed")` for any injection failure, not just this one.
  2. **A video stop never told the worker.** Only `stopEventsCapture()` ever called
     `announceCaptureStopped()` — `stopVideoRecording()`, the native "Stop sharing" auto-stop path,
     and `destroy()` did not. A completely normal video capture left the REC badge stuck after
     Stop. Fixed at both choke points in `src/index.ts`: `_handleRecordingStarted()` /
     `_handleAutoStop()` (covers every trigger and transport, including the on-page toolbar's own
     Record button, which bypasses the popup's combo action entirely) now announce start/stop, and
     `stopVideoRecording()` / `destroy()` announce stop directly.
  3. **The popup had zero awareness of an in-progress capture.** Reopening it showed the identical
     idle "Capture Bug" hero whether or not a capture was already running — and clicking it would
     silently end the running session (`startEventsCapture`/`startVideoRecording` both tear down the
     active session before arming a new one), no confirmation. Fixed: `GET_STATE` now returns
     `capturing`; the popup disables the hero button and relabels it ("Capturing… · Already running
     on this tab — use Stop in the on-page bar") when true.
- **Verified:** `check.mjs --full` 927 passing / 57 files. New unit coverage in
  `tests/background-tab-lifecycle.test.ts` (the host-UI-defer badge-clear case, and `GET_STATE`'s
  `capturing` field) using the existing `chrome-mock.ts` harness — far more reliable than Playwright
  for exercising `background.js`'s internals directly. New e2e:
  `ext-badge-host-ui-defer.e2e.mjs` (4/4, real browser, real navigation). `ext-shipping-path.e2e.mjs`
  gained two badge assertions (REC while recording, cleared after stop) — 16/16.
  `ext-video-recording.e2e.mjs` (8/8), `ext-cross-site-capture.e2e.mjs` (13/13),
  `ext-events-capture.e2e.mjs` (22/22) all re-run clean.
- **Not covered by e2e:** the popup fix (#3) — Playwright can't drive a real MV3 action popup
  correctly (navigating a tab to `chrome-extension://id/popup.html` makes Playwright's "active tab"
  resolve to the popup itself, not the page behind it, so `popup.js`'s own
  `chrome.tabs.query({active:true, currentWindow:true})` breaks). Verified by code review only;
  worth a manual check before shipping.


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
- **Scope, stated at the time:** this fixed `style-src-elem` violations only, not `style-src-attr`
  (inline `style="..."` attributes) — see the next entry, which closed that gap the same day once the
  user reported the dashboard was still completely invisible on claude.ai.
- **Verified:** new `e2e/ext-style-nonce-page.e2e.mjs` — a real nonce-gated CSP fixture. `check.mjs
  --full` all green (939/58); re-run clean: `ext-trusted-types-page` 9/9, `ext-shipping-path` 16/16,
  `ext-video-recording` 8/8, `ext-sdk-isolation` 17/17.

## The style-src-attr gap closed for real: inline style="" attributes survive the same CSP (2026-10-26)

- **What:** the user reported TraceBug worked on temp-mail.org but "nothing appears at all" on the same
  claude.ai artifact page the nonce fix above targeted. Root cause: nearly all of TraceBug's actual
  layout comes from inline `style="..."` HTML ATTRIBUTES — baked into the markup passed to
  `setInnerHTML()` across the toolbar/HUD/modal, plus ~108 direct `el.setAttribute("style", ...)`/
  `el.style.cssText = ...` call sites. A nonce cannot cover attributes at all (Chrome has no nonce/hash
  path for `style=""` without `unsafe-hashes`), so every one of those was silently dropped — the
  dashboard mounted into the DOM with zero positioning, invisible rather than broken-looking.
- **Key finding, confirmed experimentally** (a throwaway Playwright probe against a real nonce-CSP
  page, not assumed): when this CSP blocks an inline style attribute, `el.getAttribute("style")` still
  returns the original string — the attribute itself survives. What's blocked is folding that string
  into the element's live `CSSStyleDeclaration` (`el.style.cssText` reads back empty, nothing renders).
  Setting individual LONGHAND properties through the CSSOM (`el.style.setProperty(prop, value)`) is a
  direct mutation of that object, not a reparse of the attribute — it does not go through the CSP gate
  at all, and took effect immediately in the probe.
- **Fix, two parts:** (1) `setInnerHTML()` (`src/ui/helpers.ts`) now calls a new
  `reviveInlineStylesForCsp()` after every assignment, which walks the inserted subtree and replays
  each element's `style` attribute through the CSSOM via a new `setInlineStyle()` (a small
  paren-depth-aware declaration-list parser, needed so a value like
  `url(data:image/png;base64,AAAA==)` doesn't get sliced apart by its embedded `;`/`:`). This covers
  the bulk of the problem — nearly every styled element in every HTML template — with ONE chokepoint
  change, not hundreds of call-site edits. (2) The ~108 direct `setAttribute("style", ...)`/
  `style.cssText = ...` sites across 11 files (`compact-toolbar.ts`, `dashboard.ts`, `draw-mode.ts`,
  `element-annotate.ts`, `inspect-mode.ts`, `quick-bug.ts`, `pre-record.ts`, `review-ask.ts`,
  `milestone-ask.ts`, `toast.ts`, `annotation-store.ts`) were mechanically converted to
  `setInlineStyle()` via a one-off codemod script (deleted after use) — written with a dry-run-first,
  diff-reviewed-before-trusting workflow after its first pass corrupted `milestone-ask.ts` by mistaking
  an apostrophe inside a `//` comment ("the modal's overlay") for a string delimiter; fixed by making
  the scanner skip `//` and `/* */` comments, then re-verified clean via `tsc --noEmit` + a full diff
  review of all 11 files before trusting it.
- **Collateral fix:** `tests/picker-hint.test.ts` asserted on the exact serialized `getAttribute('style')`
  string (`"position:fixed!important"`, no spaces) — which legitimately changes format now that the
  value is built via individual `setProperty()` calls rather than one raw attribute string. Rewritten to
  assert against the live CSSOM (`el.style.position`, `el.style.getPropertyPriority(...)`) instead,
  which is a strictly stronger check of actual behavior, immune to incidental serialization differences.
- **Verified:** `e2e/ext-style-nonce-page.e2e.mjs` extended to 7/7 — now asserts the real toolbar (built
  via `setInnerHTML` with inline `style=""` attributes, not a synthetic probe) actually renders with
  non-zero size and has a genuinely clickable button under the nonce CSP, not just that a `<style>` tag
  carries a nonce. `check.mjs --full` all green (939/58, unchanged baseline) after fixing the one
  resulting test. Re-run clean: `ext-trusted-types-page` 9/9, `ext-shipping-path` 16/16,
  `ext-video-recording` 8/8, `ext-sdk-isolation` 17/17, `ext-events-capture` 22/22,
  `ext-reload-reinject` 8/8, `ext-worker-restart-reinject` 4/4, `ext-badge-host-ui-defer` 4/4.

## External fresh-eyes review (Brutally.ai), no code changes (2026-10-27)

- **What:** an outside AI tool scored TraceBug 6.8/10, flagging adoption friction and monetization as
  the main risks. Logged as input to the recurring fresh-eyes/buyer audit, not as new engineering work.
- **Mostly stale/already done:** its "build one-click GitHub/Linear export" fix already exists
  (`src/github-issue.ts`, `src/linear-issue.ts`, tracker "Send to…" buttons). Its other three asks
  (aggressive integration push, open-core/enterprise tier) are speculative features with no user
  evidence — out of scope per the engineering allowlist.
- **One open question worth checking, not building:** can a non-technical QA/PM trigger a capture and
  export in under two clicks without the terminal, using the *current* popup flow? No code changed here
  to answer that — needs an actual walkthrough, not a feature.

## The TraceBug logo now links home wherever it appears in a header (2026-10-26)

- **What:** the logo+wordmark in the popup header, `welcome.html`'s top bar, and the in-page dashboard
  panel header was a static, non-interactive mark in all three places — user-requested click-through.
- **Fix:** each wrapped in an `<a target="_blank" rel="noopener">` to `tracebug.dev`, with
  hover/focus-visible styles added. `welcome.html` sets the href via `welcome.js` at runtime
  (`id="homeLogo"`, same pattern as its other outbound links) rather than hardcoding it in the markup —
  `tests/first-run.test.ts` asserts the bundled first-run page ships zero literal `https:` hrefs, so it
  can render fully offline. `popup.html`'s footer already links `tracebug.dev` directly with no such
  constraint, so its logo link is a plain hardcoded href. Checked other candidate headers
  (`options.html`, the ticket modal, the compact toolbar, `confirm-send.html`, `player.html`) — none
  have a logo mark to begin with, so there was nothing to change there.
- **Verified:** `check.mjs --full` all green (939/58, unchanged baseline) after fixing the
  `first-run.test.ts` regression the first pass caused by hardcoding the welcome-page href.

## New e2e feature×site matrix finds and fixes two real extension bugs (2026-10-27)

- **What:** built `e2e/ext-feature-matrix.e2e.mjs` + `e2e/site-fixtures.mjs` — a real-browser matrix
  covering screen recording, microphone, event capture and UI buttons across 5 local site fixtures
  (static/SPA/login/heavy-media/restrictive-CSP) plus dedicated failure-case fixtures (iframe-heavy,
  denied permissions, tab-closed-mid-recording). Run: `npm run build:ext` then
  `node e2e/ext-feature-matrix.e2e.mjs`. 56-57/59 checks pass; 6 skips are documented harness
  limitations (mic permission can't be granted to the offscreen document from Playwright; headless
  Chromium has no real picker to force-deny), not product gaps.
- **Bug 1, fixed — Tab-mode recording lost forever + offscreen leak if the recorded tab closes
  mid-recording.** `chrome.tabs.onRemoved` fired immediately (confirmed by listening for it directly)
  but `background.js`'s handler only cleared bookkeeping; the captured track's own `ended` event never
  fired for a `chrome.tabCapture`-sourced stream, so nothing ever called `stopAndBuildRecording()`.
  Result: `chrome.storage.local` stayed empty forever and the offscreen document never closed. Fix:
  `chrome.tabs.onRemoved`'s listener now explicitly sends a `tb:rec:stop` RPC when the closed tab is
  the one pinned by `_recordingTabId`, then closes the recorder host — independent of the track's
  `ended` event. Residual, smaller limitation: the tab is already gone by the time this runs, so the
  last ~1-2s of footage before closure can still be minimal: not re-broken, just an inherent limit of
  recovering from an already-closed source.
- **Bug 2, fixed — the HUD's Pause button lied in extension mode.** Clicking it flipped the icon to
  "paused" and set `dataset.active="1"`, but `pauseVideoRecording()` is guarded on `_active`, which
  only the npm SDK's in-page transport ever sets — so in the extension the timer kept counting and the
  recording kept running the whole time, visibly contradicting its own button. Fix:
  `recording-hud.ts` now drops the Pause button entirely in extension mode (`pauseAvailable`), the same
  pattern already used for the mic button's equivalent "page can't reach the offscreen stream" gap.
  Updated `e2e/ext-shipping-path.e2e.mjs`'s stale assertion (asserted the button's mere presence as
  proof pause worked — it didn't) to match.
- **Verified:** `check.mjs --full` all green (939/58). The matrix itself re-run clean after both fixes,
  confirming the tab-close case now writes to storage and closes the offscreen host, and the Pause
  button is honestly absent rather than present-but-dead.
- **Open issue found, not a code bug:** ~49 leftover `chrome.exe` processes accumulated on this machine
  from the session's many Playwright runs (`ctx.close()` isn't fully reaping them), causing intermittent
  near-empty recordings under load later in the session — confirmed via an A/B stash test that this
  reproduces identically with or without the two fixes above, so it's environment exhaustion, not a
  regression. Not cleaned up here (didn't want to kill processes without being sure none were a real,
  user-open browser window) — worth a Chrome restart before trusting another heavy e2e run.

## Mic toggle on the record countdown; Console/Actions tab split (2026-10-27)

- **Mic toggle, user-requested.** `runRecordCountdown(seconds, opts?)` (`src/ui/pre-record.ts`) takes a
  new optional `{ withMicrophone }` — when passed, the fullscreen countdown overlay gains a "Mic is
  on/off" toggle starting at that state; the final choice is read via the new `getCountdownMicChoice()`
  right after the countdown resolves. Purely additive — no mic option, no toggle, unchanged behavior;
  `runRecordCountdown`'s own return value is untouched (still the plain `boolean` documented in
  `docs/api-reference.md`), so this isn't a breaking change to that public API. `prepareRecording()` in
  `src/index.ts` wires it in: the toggle only appears for an actual video capture with a delay already
  configured (matches the user's explicit choice — no new friction for instant/no-delay captures), and
  its final state becomes the mic setting the recording actually starts with. Flows through
  `tracebug-init.js`'s "record" case, so it's live in the extension's popup → Capture Bug path, not just
  the npm SDK. Covered by 4 new checks in `e2e/pre-record.e2e.mjs` (toggle absent/present, click flips
  it, choice readable after resolve) — 11/11 passing. That file's existing checks were also silently
  broken before this pass: `try.html` stopped auto-loading the SDK on page load at some earlier point
  (a deliberate fix for a host-page/extension race, per its own comment) and the test never got updated
  to click the "in-page demo" button first — fixed as a drive-by since it blocked verifying the new work.
- **Console/Actions tab split, user-requested** (pointed at a BetterBug screenshot's clean "Steps" list
  as the bar). Both tabs used to be "unified timelines" that each pulled in things that didn't belong:
  Console (`_buildConsoleFeed`/`_buildConsoleTab` in `src/ui/quick-bug.ts`, plus the exported `.html`
  viewer's duplicate copy in `src/exporters/html-template.ts`) mixed console logs with navigation,
  network errors, user-activity and video markers behind filter pills; Actions
  (`buildActionChips`, `src/action-chips.ts`) mixed clicks/inputs/navigation with error/warning/API-request
  chips that duplicated Console and Network. Now: **Console tab = console output only.** **Actions tab =
  the user's story only** — click/input/select/submit/navigate chips (unchanged, richer cards) plus NEW
  simple one-line rows for recording start/stop (`_renderStepRow`, mirrored in the exported viewer as
  `.tb-vstep-row`), interleaved by timestamp. Network errors/requests were never duplicated out of the
  Network tab — removing them from Console and Actions just stopped the duplication.
- **Found and fixed a real, separate bug while moving this:** `report-builder.ts`'s `consoleLogs`/
  `consoleErrors` construction read `e.data.error?.message || ""` with no fallback chain and then
  **dropped the entry entirely** if that came up empty (`.filter(e => !!e.message)`) — so a bare
  `new TypeError()` (empty message, but a real name) or an argument-less `console.warn()` vanished from
  the Console tab with no trace, not even showing "Warning". This exact bug was already fixed once, but
  only inside `action-chips.ts`'s now-deleted error-chip builder (`errorText()`) — which is why it
  regressed for Console specifically. Ported the fix forward as `extractConsoleMessage()` in
  `report-builder.ts` (nested message → error name → top-level message → level-aware fallback, never
  stringifies an object), applied to both `consoleLogs` and `consoleErrors`, and the filter-that-drops-
  empty-messages is gone since the fallback now guarantees non-empty text. Tests moved from
  `tests/action-chips.test.ts` (deleted the error/warning describe blocks, since that behavior left
  action-chips.ts) to the renamed `tests/console-message-extraction.test.ts`, now testing
  `extractConsoleMessage` directly — 7/7 passing.
- **Verified:** `check.mjs --full` all green (936 tests — down from 939, net of removing redundant
  error/warning chip tests and adding the mic-toggle ones). `e2e/pre-record.e2e.mjs` 11/11.

## Popup's mic toggle could show ON with no real permission behind it (2026-10-27)

- **User-reported, hand-tested, real:** mic toggled ON in the popup (Desktop mode, no delay), tab +
  audio shared, recording completed — no mic audio in the result, with nothing telling the user why.
  Matches a gap the codebase's own comments already half-document: `popup.js`'s mic toggle click handler
  calls `getUserMedia({audio:true})` directly in the popup, but per `showMicNotice`'s comment, Chrome's
  native permission prompt (shown the FIRST time, when the permission is still in the "prompt" state)
  steals focus and closes the popup before the click handler's `try`/`catch` can run either branch — so
  a first-time click silently did nothing: no grant, no error shown, no toggle update. The ONLY place
  that can actually complete a first-time grant is `options.js`'s mic card (survives the prompt — it's a
  real tab), which already existed but nothing routed a first-time popup click there.
- **Fixed, two parts in `popup.js`:** (1) on popup open, if the stored "mic on" preference is true, it's
  now re-checked against `navigator.permissions.query({name:"microphone"})` — if the real permission
  isn't actually `"granted"` (never completed, later revoked, or reset by an unpacked-extension reload),
  the toggle is corrected to OFF and the existing "Grant in TraceBug settings" notice shows, instead of
  silently lying about its own state. (2) the click handler now checks permission state BEFORE calling
  `getUserMedia` directly: a `"prompt"` or `"denied"` state routes straight to the settings notice
  (avoiding the popup-killing call entirely); only an already-`"granted"` state calls `getUserMedia`
  directly, which is safe since no native prompt shows and the popup survives.
- **Verified:** `check.mjs --full` all green (936/58, unchanged). Could not verify against a real
  microphone/browser from here — this fix closes the failure mode visible in code and matches the
  user's exact repro, but needs confirmation on a real machine (see STATE.md-style open question below).
- **Open question, needs the user to check:** does `chrome://settings/content/microphone` show TraceBug
  listed as Allowed? If yes, the toggle was lying about an ungranted permission and this fix should
  resolve it. If no even after using the Options page's "Allow microphone" button, that would point to a
  deeper issue — Chrome's offscreen-document media-permission inheritance not working the way
  `offscreen.js`'s own comments assume — which would need separate investigation, not covered by this fix.
