# PLAN archive - the full text of finished phases

Moved out of `PLAN.md` on 2026-10-12 so a session reads only what is left to do. Nothing here is a
live instruction: these phases are **done**. What survived them as a present-tense fact is in
`docs/launch/STATE.md`; what was actually built is in `PROGRESS.md` / `PROGRESS-archive.md`.

Read this only to answer "why was it done that way", and say so when you open it.

## Phase 0 - Investigate first (no code changes)

Save the report as `docs/launch/phase0-findings.md` (aim for under 150 lines), so later phases reuse it instead
of re-reading the codebase.

Read the code and give a short findings report that confirms or refutes each item below, with file paths and line
numbers. Several of these are inferences from the docs, so do not assume they're true.

1. Which permissions and host permissions are in `manifest.json` (Chrome and Firefox variants), and which
   install-time warnings they trigger.
2. Whether `tabCapture` is used anywhere.
3. Whether `tabs` is actually needed, or whether `activeTab` + `webNavigation`/`runtime` messaging could cover
   HUD re-mount after navigation.
4. **In extension mode, where are these stored:** integration tokens (`tracebug_integrations`), the AI key
   (`tracebug_ai_config`), redaction rules, and saved tickets? Confirm whether they land in the **host page's**
   `localStorage`, where page scripts can read them.
5. What happens when the popup's actions are used on a restricted page: `chrome://*`, `chrome-extension://*`,
   `https://chromewebstore.google.com/*`, `edge://*`, `about:*`, the new-tab page, the built-in PDF viewer,
   `view-source:`, and `file://` with and without "Allow access to file URLs".
6. What happens on a tab that was open **before** an extension update or reload (orphaned content script /
   "Extension context invalidated"), and what happens to an in-progress recording if the extension updates.
7. Whether there is any first-run / `runtime.onInstalled` handling in the extension.
8. Whether the extension can capture without video (events + DOM replay only), and what the first-run
   "Capture Bug" path does today.
9. How large-export, Slack-success and Jira-button behaviour work today.
10. Whether the existing Playwright setup (`e2e/`, `playwright.config.ts`) can load the unpacked extension.

End Phase 0 with a proposed order of changes and any item that looks wrong.

## Phase 1 - Permissions and trust (audit fixes #1, #2)

- Remove `tabCapture`.
- Move `<all_urls>` from required host permissions to `optional_host_permissions`. Keep `activeTab` + `scripting`
  for on-demand capture on the current tab.
- Request the optional host permission **only** when needed (for example, at the first recording that has to
  survive navigation to another origin), from a user gesture. Show a one-line reason first: "To keep recording
  when you navigate, TraceBug needs access to the sites you test. Nothing is uploaded."
- If permission is declined, degrade gracefully: capture continues on the current page, with a clear notice that
  navigation will end the capture.
- Drop `tabs` if Phase 0 showed it's replaceable. Otherwise leave it, and say which warning remains.
- **Custom Ollama `baseUrl` (handed over by Phase 2b).** With `<all_urls>` declared optional, the settings page
  can request that single origin instead of failing. Find the `TODO(phase-1)` left at the Ollama failure site,
  replace the error with a per-origin `permissions.request()` from the save handler, and keep the clear error
  for a decline.
- Acceptance: a fresh install shows the smallest possible warning set. List the before and after warnings.
- **Three checks before flipping the manifest** (first two already resolved in Phase 0 - do not re-investigate):
  1. **Static content scripts: already clean.** Neither manifest has a `content_scripts` key; `content-script.js`
     is injected on demand via `chrome.scripting.executeScript` (`background.js:115`). Nothing to move.
  2. **Keyboard shortcut: not a browser shortcut at all.** There is no `commands` key in either manifest and no
     `chrome.commands.onCommand` listener. `Ctrl/Cmd+Shift+B` is a **page-level keydown handler inside the
     injected SDK** (`src/dashboard.ts:177-187`), so it only works once the SDK is already on the page, and it
     cannot call `permissions.request()` (that requires a user gesture in an *extension* page). Leave it as a
     post-injection shortcut; do not route it through the background worker. This also means the Phase 4
     welcome-page copy about the shortcut is misleading - see Phase 4.
  3. **Existing users keep their grant - verify, don't assume.** Moving an origin from `host_permissions` to
     `optional_host_permissions` should preserve an already-granted `<all_urls>` across update, but this must be
     tested, not assumed: install the previous store build, grant access, then load the new build and confirm
     cross-navigation capture still works without a re-prompt. This is the upgrade row on the release checklist
     (Phase 8).
- **Firefox check (this phase touches the manifest):** run `npm run build:ext`, then `npm run ext:lint`
  (web-ext lint on `tracebug-extension/dist/firefox`) and `npm run ext:firefox` to confirm the add-on still
  loads. Report any web-ext warning, even a pre-existing one.

## Phase 2 - Secrets out of the host page (audit fix #3)

**Do this phase first** (see the Phase 0 ordering). Plan approved 2026-10-11 with amendments; **split into 2a
and 2b**, each its own commit. The saved-ticket mirror (audit #4) is **deferred to 1.11.1** - tickets in page
storage are the site's own data, a nuisance rather than a leak, and it should not hold the submission date.

**In extension mode, secrets never enter the page world - not at rest, not in fetch, and not at entry.**
Phase 0 found two exposure paths (storage at rest; `fetch()` running in the page's MAIN world). There is a
**third and faster one**: the integration and AI-key forms are drawn by the SDK *inside the host page* AND
pre-filled with the stored secret as a DOM attribute - `value="${escapeHtml(existing?.apiKey)}"` at
`src/ui/quick-bug.ts:2584` (AI key), `:2667` (GitHub PAT), `:2676` (Linear), `:2683` (Slack webhook). A page
script reads the token straight out of the DOM the moment the modal opens; no keystroke listener needed.

> **Not shippable alone:** once secrets leave page `localStorage` in 2a, the page-world send path cannot reach
> them, so GitHub/Linear/Slack/LLM sending is **broken in extension mode until 2b lands**. Both must ship in
> 1.11.0. Do not submit between them.

### Phase 2a - storage, entry point, migration

- **Step 0 - extension-mode signal (gates everything).** There is **no extension-mode detection in the SDK
  today** (grep `tracebug-extension` in `src/` returns nothing). `tracebug-extension/tracebug-init.js:30`
  already calls `TraceBug.init({...})` - pass an explicit `transport: "extension"` there and thread it into a
  module-level `isExtensionMode()`. Do **not** infer it from `projectId` (user-settable) or feature-detect it
  from the page (a hostile page can fake either).
- **Step 1 - at rest.** Integration tokens and the AI provider key/config move to `chrome.storage.local`
  (`tb_integrations_v1`, `tb_ai_config_v1`). Redaction rules are already in `chrome.storage.sync` - leave them.
  **Do not make the getters async.** The SDK only ever needs to know *whether* each integration is configured:
  the content script pushes a non-secret yes/no snapshot into the page at init and again on
  `chrome.storage.onChanged`, following the existing `<html data-tb-redact>` precedent
  (`tracebug-init.js:17-49`) - booleans only, never a token. Render paths stay synchronous; only the send path
  is async, and it already is. In extension mode `getIntegrationsConfig()` / `getAIConfig()` must return no
  secret at all.
  **Accepted residual (reviewed 2026-10-11, no further work):** a hostile page can flip the `data-tb-caps`
  booleans, and can read which integrations the user has set up. Flipping them only changes which buttons the
  in-page UI offers - the background worker re-reads the real config before any send (Phase 2b) - and the
  "which integrations exist" leak is minor and accepted.
- **Step 2 - entry forms move to an extension page.** Declare **`options_ui` with `open_in_tab: true`** (works
  in both Chrome and Firefox; `npm run ext:lint` will confirm) - **not** `options_page`. Add `options.html` +
  `options.js` to `SHARED_FILES` in `build/build-ext.mjs`. The in-page modal's config sections become a single
  "Configure in TraceBug settings" button; **content scripts cannot call `chrome.runtime.openOptionsPage()`**,
  so the button messages the background worker and the worker opens the page.
- **Step 6 - lazy migration.** When the content script next runs on an origin holding
  `tracebug_integrations` / `tracebug_ai_config` (incl. legacy `tracebug_ai_key`, `src/ai/llm-client.ts:41`),
  move it into extension storage and `removeItem` it. Do not enumerate origins up front - that would mean
  reading every site. **If extension storage already holds a config, keep it and discard the page copy, then
  surface a one-time notice in the options page:** "Removed an older token found on &lt;site&gt;. Re-enter it if
  you still need it." Users may have saved different tokens per site, so a silent discard loses work.
- **Token rotation (changelog + store "What's new"):** add the line "If you configured GitHub, Linear, Slack or
  an AI key before 1.11, revoke and re-create it." These tokens sat where any script on those sites could read
  them.
- **Tests:** no token in page `localStorage` **or in the modal DOM** in extension mode; migration moves and
  deletes the keys (and notifies on discard); SDK mode unchanged.

### Phase 2b - the bridge, per-send confirmation, optional permissions

- **Step 3 - provider calls from the service worker.** Reuse the existing page->SW RPC bridge
  (`content-script.js:217-245`). **The bridge is the part to get right.** Its allowlist at
  `content-script.js:213-215` carries a security comment for a reason: the page controls `e.detail`, so any verb
  added becomes callable by *any script on the page*. A hostile page could not read the token but could **use**
  it - filing issues in the user's repo or posting to their Slack. Therefore:
  - The page sends **only the report payload** - never a destination, URL, or provider setting. The background
    worker resolves provider config itself, verifies the message came from its own content script, and caps
    payload size.
  - **GitHub / Linear / Slack: confirm every send** in an extension-owned window opened by the background
    worker, showing provider, destination (repo / team / channel) and a preview of title and body, with a Send
    button. One extra click is acceptable for something done a few times a day, and it shows the user exactly
    what leaves the browser. (First-send-per-session is **not** enough: after one approval a hostile page could
    spam for the rest of the session, and "session" is vague anyway because the service worker restarts.)
  - **LLM analysis: confirm first use per site**, then allow ~10 requests/minute, so a page cannot burn the
    user's API credits.
- **Step 4 - payload size.** The ~10 MB `sendMessage` limit is already solved in-repo: `_viaStorage` +
  `reattachDataUrl` (`content-script.js:238-243`) writes large blobs to `chrome.storage.local` and passes a
  reference. Reuse it, strip video from provider payloads (no tracker API takes an inline video), and **clear
  the `_viaStorage` blob as soon as the send finishes** - a store reviewer will look for exactly that.
- **Step 5 - optional host permissions (approved; these only, no new required permissions).** Add to
  `optional_host_permissions` in `build/manifest.base.json`, requested from the options page's save handler for
  that provider only. Optional permissions add **no install warning** and do not disable the extension for
  existing users.
  - GitHub `https://api.github.com/*` · Linear `https://api.linear.app/*` · Slack `https://hooks.slack.com/*`
  - OpenAI `https://api.openai.com/*` · Anthropic `https://api.anthropic.com/*`
  - Ollama: **both** `http://localhost/*` **and** `http://127.0.0.1/*`. Chrome match patterns cannot contain a
    port and match any port, so `localhost/*` already covers Ollama's default `http://localhost:11434`
    (`src/ai/llm-client.ts:67`) - but `127.0.0.1` is a *different host* and needs its own pattern. `baseUrl` is
    user-editable. A custom host outside these patterns **fails with a clear message in 2b**, with a
    `TODO(phase-1)` at the failure site. It does not have to stay a failure: once Phase 1 declares `<all_urls>`
    as an optional host permission, the settings page can call `permissions.request()` for that one origin
    (Chrome allows requesting a specific site when a declared optional pattern covers it), so the fixed six-host
    list becomes a convenience rather than a limit. **Phase 1 must pick this up.**
  - With `https://hooks.slack.com/*` granted, the Slack POST can drop `mode: "no-cors"` and read a **real**
    response - this *resolves* Phase 6's Slack item rather than rewording it. Update Phase 6 accordingly.
- **SDK-only (npm) mode keeps current behaviour** throughout 2a and 2b. Add a short doc note that SDK users
  should only configure tokens in dev builds.

## Phase 3 - Restricted pages, orphaned tabs, updates (audit fixes #5, #6)

- In the popup, before injecting, detect restricted URLs (list from Phase 0). Replace the actions with:
  "TraceBug can't run on this page" plus a button **Try it on a demo page** that opens
  `https://tracebug.dev/try.html`. For `file://` without access, explain how to enable "Allow access to file URLs".
- Any injection or messaging failure must show a human message in the popup, never a silent no-op. Map common
  errors to actions: restricted page, page still loading, CSP-blocked, needs reload.
- Orphaned tabs: before use, ping the content script; if there's no answer, re-inject. If re-injection fails,
  show "Reload this tab to capture" with a **Reload tab** button.
- Updates: handle `runtime.onUpdateAvailable`. If a recording is active, defer the reload until it stops;
  otherwise reload. Make sure an in-progress recording is finalized and persisted, not lost.
- Acceptance: a manual test script in `docs/testing/restricted-pages.md` plus automated tests where possible.
- **Firefox check (this phase touches the extension):** run `npm run build:ext`, then `npm run ext:lint` and
  `npm run ext:firefox`. The restricted-URL list differs on Firefox (`about:*`, `moz-extension://*`,
  AMO pages) - cover those too, by feature detection, not user-agent sniffing.

## Phase 4 - the parts that are done

Steps A and B, plus two additions. Kept here in full because the live `PLAN.md` entry now covers only
Steps C and D.

- Make the default first-run capture **no video** (events + console + network + DOM replay). No screen-share
  picker for the first capture. Video becomes an explicit option ("Record video too") that is remembered once
  chosen. *(Done, Step A. The default now splits by install vs update - see STATE.md.)*
- Before `getDisplayMedia` opens, show one line explaining the picker ("Chrome will ask what to share - pick this
  tab"). If capture fails on macOS with a permission error, show how to enable Screen Recording for the browser
  in System Settings. *(Done, Step B.)*
- Fix the copy mismatch: the quickstart says "pick this tab", and the extension doc says it's pre-selected. Make
  the UI and both docs agree with real behaviour. *(Done, Step B.)*
