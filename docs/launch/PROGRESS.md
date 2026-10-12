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
