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
