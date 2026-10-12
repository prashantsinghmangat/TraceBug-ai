# TraceBug v1.11 launch-readiness plan

Run one phase at a time, each in a **fresh Claude Code session**. After each phase: review the diff, run the
checks, then start the next session with "Use the phase skill: Phase N." That reads `docs/launch/STATE.md` and
this file's live sections only - not the archives.

## How this is run

- **Plan mode is read-only.** If a phase is investigated in plan mode, the plan must be approved before any file
  can be written - including any findings report the investigation produces.
- **Prashant commits after every phase**, on `develop`, using the suggested message. Claude never commits. This
  keeps each phase individually revertable and keeps the next session's `git diff` small.

You are working in the TraceBug repo (Chrome/Firefox MV3 extension in `tracebug-extension/`, SDK in `src/`,
MCP CLI in `cli/`, docs in `docs/`). We are preparing release **1.11.0** for a growth push. The job is to fix
launch-blocking UX, trust and reliability issues, add a few sharing mechanics, and set up a smoke-test harness.

## Ground rules (do not violate)

- Respect the ADRs in `docs/adr/`: **no backend** (001), **single-file offline HTML export** (002), **MV3** (004),
  **zero runtime dependencies** (005), **stdio-only MCP** (006). The exported `.html` must never load a remote resource.
- **No telemetry, no analytics, no network calls from the extension** other than the ones the user explicitly
  triggers (GitHub/Linear/Slack/LLM provider).
- Do not break the storage invariants in `docs/ticket-flow.md` ("Storage invariants") or `tests/storage.test.ts`.
- **Never add a manifest permission.** Removing or making permissions optional is allowed. If a fix seems to need
  a new permission, stop and ask.
- Keep the Firefox build working (`strict_min_version: 128`). Where Chrome and Firefox differ, branch on feature
  detection, not on user-agent strings.
- One phase = one small set of changes with a clear suggested commit message. **Do not commit** - leave the work
  uncommitted on `develop` for review. Update `CHANGELOG.md` under `1.11.0` as you go.
- After each phase: run `npm run build`, `npm test`, and any tests you added. Report what passed and what you
  couldn't verify, then **stop and wait**.

## Token discipline

- Each phase starts by reading `CLAUDE.md`, `docs/launch/STATE.md` and this file's live sections. Don't
  re-explore what those already answer, and don't open `PLAN-archive.md`, `PROGRESS-archive.md` or
  `phase0-findings-archive.md` unless you need to know *why* a finished decision went the way it did.
- Use `docs/launch/CODEMAP.md` before grepping the large files.
- At the end of every phase: rewrite `docs/launch/STATE.md` (replace, don't append) and add <=5 lines to
  `docs/launch/PROGRESS.md`: what changed, files touched, how it was verified, open issues.

## Finished phases - one line each

Full text in `PLAN-archive.md`. What survived as a live fact is in `STATE.md`. Do not re-read these.

- **Phase 0 - Investigate first.** Done 2026-10-11. Report was `phase0-findings.md`, now archived; its
  still-true findings are in `STATE.md`.
- **Phase 1 - Permissions and trust.** Done. `<all_urls>` moved to `optional_host_permissions`, so a fresh
  install asks for nothing. The request/decline/degrade flow already existed and was kept.
- **Phase 2a + 2b - Secrets out of the host page.** Done. Tokens and the AI key live in `chrome.storage.local`
  and are entered in the extension's own settings page; every provider call runs in the worker behind a
  confirmation window. Page-world code never receives a secret.
- **Phase 3 - Restricted pages, orphaned tabs, updates.** Done. Webstore / PDF / `file://` each get their own
  sentence and a button; a ping re-injects orphaned tabs; `onUpdateAvailable` is held during a recording; the
  capture shortcut is a real browser command, `Alt+B`.
- **Phase 4 Steps A + B.** Done. Events-only capture is the popup's default, the share dialog is explained
  before it opens, and a macOS Screen-Recording denial is no longer reported as a user cancel. **Steps C and D
  are still open - see below.**

## Phase 4 - First run (Steps C and D remain)

Steps A and B are done; their text is in `PLAN-archive.md`. What is left:

There is already an `onInstalled` handler in `background.js` but it opens the **remote**
`https://tracebug.dev/try.html?welcome=extension`, so first run depends on the network. **Bundle the welcome
page in the extension and keep the remote page only as a link from it.**

- **Step C.** On `runtime.onInstalled` with `reason === "install"`, open a bundled welcome page
  (`welcome.html` inside the extension; no remote assets - add it to `SHARED_FILES` in `build/build-ext.mjs`).
  It includes:
  1. Pin TraceBug to the toolbar (with an image).
  2. A **Try it now** button that opens `https://tracebug.dev/try.html` (a deliberately broken demo) - now a
     link *from* the bundled page, not the landing page itself.
  3. The capture shortcut, **stated accurately**: Phase 3 registered a real `commands` entry, default
     **`Alt+B`**, and the page must read the bound key from `chrome.commands` rather than hardcode it (the user
     can rebind or clear it). `Ctrl+Shift+B` is a separate page-level handler that only opens Quick Bug once
     TraceBug is already running on the tab - do not present it as the capture shortcut.
  4. A plain-language privacy box: what's captured, that nothing goes to TraceBug, and that you choose what goes
     to GitHub, Slack or your LLM.
  5. A small "Rolling this out to a team?" link to `https://tracebug.dev/teams`.
  Design to follow: `docs/launch/designs/tracebug_welcome_quickstart_page/`.
- **Step D.** On `reason === "update"`, do not open a tab; show a small "What's new" card in the popup instead,
  dismissed state in `chrome.storage.local`. Copy is in `tracebug-stitch-prompts-screens.md` screen 4 - note its
  capture line is phrased as an invitation, because an updating user keeps video on.
- **Firefox check (this phase adds `welcome.html` and touches the extension):** run `npm run build:ext`, then
  `npm run ext:lint` and `npm run ext:firefox`. Confirm `welcome.html` is included in the Firefox build output
  and that `runtime.onInstalled` fires there; note that the shortcut and `getDisplayMedia` picker copy differ on
  Firefox.

## Phase 5 - Sharing loop and review ask (referral mechanics 1-3)

- **Exported `.html` footer:** a small, unobtrusive bar: "Captured with TraceBug - free & local. Capture your
  own ->" linking to the Chrome Web Store listing with `?utm_source=report&utm_medium=export`. Pure inline
  HTML/CSS, no remote loads, works offline. Add a setting to hide it (`showExportFooter`, default true), shown in
  the export modal.
- **Issue signature:** append one line to GitHub, Linear and Slack bodies: "Reported with TraceBug" linking to
  the listing with `utm_source=issue`. Show it in the export preview, with a one-click toggle to remove it,
  default on.
- **Review prompt:** count successful exports in extension storage. After the 3rd successful export (never in the
  first session), show a dismissible prompt: "Did TraceBug save you time? Rate it ->" linking to the store
  reviews page. If dismissed, ask once more after the 10th export, then never again. No incentives.
- **Uninstall survey:** call `runtime.setUninstallURL("https://tracebug.dev/bye?v=<version>")`. Send the version
  only, no identifiers.
- Store-listing URLs and UTM values live in one constants file.

## Phase 6 - Edge cases (week-2 audit items)

- **Large exports:** before export, show the estimated file size. Above 20 MB, warn that GitHub attachments cap
  at 25 MB, and offer "DOM replay only (no video)" or `.zip`.
- **Slack: RESOLVED by Phase 2b (2026-10-12) - nothing left to do here.** The worker drops `mode: "no-cors"`
  when `https://hooks.slack.com/*` is granted and reads Slack's real reply, including its terse rejection
  reasons (`invalid_payload`, `no_service`); the options page requests that origin when Slack is saved, so the
  grant is in place before the first send. Without the grant it falls back to the opaque post, which still
  delivers the message. Page-mode (npm) SDK keeps `opaque: true` - it cannot read a cross-origin opaque
  response and never will. See `postSlackMessage` / `readResponse` in `src/providers/api.ts` and
  `tests/provider-api.test.ts`.
- **Jira:** rename the button to "Copy for Jira" wherever it implies filing.
- **Strict-CSP and canvas/WebGL pages:** detect a heavy canvas or a CSP that blocks the inline pieces, and show a
  one-line notice recommending video capture.

## Phase 7 - Diagnostics without telemetry

- Add a popup menu item **Copy diagnostics**. It copies extension version, browser and version, OS, granted
  permissions, whether the current page is restricted, and the last 20 TraceBug-internal errors (message + stack
  from extension code only). Keep that error ring buffer in `chrome.storage.session` or memory.
- **Strip all URLs, page content, storage values and user data.** Add a test that fails if a URL or a DOM string
  leaks into diagnostics.
- Add **Report a TraceBug bug**: it opens the GitHub new-issue page for the repo, prefilled with the diagnostics.

## Phase 8 - Smoke-test harness and release checklist

- Add `e2e/extension-smoke.spec.ts` (Playwright, Chromium). Launch a persistent context with
  `--disable-extensions-except` and `--load-extension` pointing to the built extension, plus
  `--use-fake-ui-for-media-stream` and `--auto-select-desktop-capture-source=<fixture tab title>`.
- Add fixture pages under `e2e/fixtures/`: static, a small React-style SPA with a failing fetch and a console
  error, a strict-CSP page, an iframe + shadow DOM page, a canvas-heavy page, and a page with a seeded JWT, a
  `password` field and a custom-redaction field.
- Automate these checks: fresh install opens the welcome page; no-video capture produces a report with console,
  network and replay; navigation mid-capture survives; restricted-page message appears for `chrome://extensions`;
  `.html` export opens offline and contains the footer; redaction masks all three seeded values in every export
  format; diagnostics contain no URLs.
- **No token anywhere in the page - the Phase 2a guarantee, tested in a real DOM.** Seed a GitHub PAT, a Linear
  key, a Slack webhook and an AI key into extension storage, open the Quick Bug modal on a fixture page, and
  assert none of those strings appears anywhere in the page: `document.documentElement.outerHTML`, every
  `input`/`textarea` `.value` (not just the attribute), every open shadow root, and page `localStorage` /
  `sessionStorage`. `tests/no-page-secret-fields.test.ts` only checks this at the unit level - this is the
  real-browser version, and it is the test that would have caught the `value="${escapeHtml(...)}"` pre-fill.
- Add a **golden report check**: export from a fixed fixture and compare structure (tabs present, event count
  range, redaction markers) with a stored snapshot.
- Reuse the working harnesses rather than starting over: `e2e/ext-redaction.e2e.mjs:27-30` and
  `e2e/ext-player-csp.e2e.mjs:27-30` already load the unpacked extension. Before reusing them, fix the
  hardcoded `D:/Project/TraceBug-ai/...` paths and note they are plain `node` scripts, not Playwright specs
  (`playwright.config.ts` `testDir: "./e2e"` only matches `*.spec.ts`). The smoke spec needs its **own
  Playwright project** - the default config sets `channel: "chrome"` and attaches the TraceBug reporter, and
  `e2e/demo-failure.spec.ts` fails on purpose.
- Add a GitHub Actions workflow: run the smoke test on push, plus a nightly run against a beta channel.
  **Caveat (Phase 0, item 10):** branded Chrome 137+ silently ignores `--load-extension`, so the nightly cannot
  use branded Chrome Beta. **First verify** whether Chrome for Testing's beta channel still accepts the flag
  (`npx @puppeteer/browsers install chrome@beta`, then point `executablePath` at it and assert the extension's
  service worker actually registers). If it does, run the nightly there. If it does not, run the nightly on
  bundled Chromium only and move Chrome Beta to a manual row on the release checklist. Report which applies -
  do not assume it works.
- **`docs/RELEASE_CHECKLIST.md` already exists** - Phase 4 started it with the three Record-options upgrade
  rows, because they were found while writing that code and would otherwise have been lost. **Extend it, do
  not replace it.** Still to add: upgrade from the previous store version with saved tickets and keys
  surviving, macOS screen-recording permission, Edge, Brave, Firefox 128 ESR + latest, real
  GitHub/Linear/Slack test targets, MCP `npx tracebug mcp --dir` listing the new report.

## Phase 9 - Docs and copy consistency

- `docs/chrome-extension.md`: Firefox **is** supported (link the AMO listing). Fix "three-action popup" (there
  are four actions). Update the permissions table to the new manifest. Explain why site access is optional.
- `docs/compatibility.md`: remove "AMO submission in progress"; the add-on is live.
- Everywhere: replace "nothing leaves the browser" with "Nothing goes to TraceBug. You choose what's sent to
  GitHub, Slack, Linear or your LLM provider."
- Update `CHANGELOG.md` and `docs/migrating.md` for 1.11.0, including the token and saved-ticket migration.
- Also on the website (`website/`, Next.js app in the same repo):
  - Remove the Product Hunt "featured" badge embed at `website/components/Footer.tsx:92-101` (the launch was not
    featured). The "Review us on Product Hunt" link at line 43 is fine to keep.
  - `website/components/faq-data.ts:10` ("Is it really free? What's the catch?") already has a substantive
    answer - leave it unless it reads as evasive. The FAQ entry that actually needs fixing is "Does my data
    leave the browser?" (same file, next entry), which says "no uploads, no analytics, no telemetry" without
    mentioning that the AI debugger and the GitHub/Linear/Slack integrations do send data to those providers
    when the user asks them to. Apply the same rewording as the docs.
  - `website/components/FAQ.tsx:21` subtitle claims "including the catch (there isn't one)" - keep or reword to
    match whatever the answers now say.
- List any other contradictions found between the docs, the website and the code.

## Final report

When all phases are done, produce:

1. A table of each fix -> status -> files changed -> how it was verified.
2. The final manifest permissions and the exact install-time warnings.
3. Anything that could not be verified automatically and must be checked by hand before submitting to the
   Chrome Web Store.
4. The draft "What's new in 1.11" text for the store listing (3-5 lines).
