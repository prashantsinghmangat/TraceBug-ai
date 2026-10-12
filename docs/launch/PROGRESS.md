# v1.11 launch work - progress log

Append 3-5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom.

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
