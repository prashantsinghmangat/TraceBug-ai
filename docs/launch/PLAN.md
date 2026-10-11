# TraceBug v1.11 launch-readiness plan

Run one phase at a time, each in a **fresh Claude Code session**. After each phase: review the diff, run the
checks, then start the next session with "Read CLAUDE.md, docs/launch/PLAN.md and docs/launch/phase0-findings.md,
then do Phase N."

## How this is run

- **Plan mode is read-only.** If a phase is investigated in plan mode, the plan must be approved before any file
  can be written - including Phase 0's own findings report. Opener for Phase 0: "...When the report is ready,
  exit plan mode and save it to `docs/launch/phase0-findings.md`."
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

- Each phase starts by reading `CLAUDE.md`, this plan, `docs/launch/phase0-findings.md` and
  `docs/launch/PROGRESS.md`. Don't re-explore what those already answer.
- At the end of every phase, append 3-5 lines to `docs/launch/PROGRESS.md`: what changed, files touched, how it
  was verified, open issues.

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
- Acceptance: a fresh install shows the smallest possible warning set. List the before and after warnings.
- **Firefox check (this phase touches the manifest):** run `npm run build:ext`, then `npm run ext:lint`
  (web-ext lint on `tracebug-extension/dist/firefox`) and `npm run ext:firefox` to confirm the add-on still
  loads. Report any web-ext warning, even a pre-existing one.

## Phase 2 - Secrets and saved tickets out of the host page (audit fixes #3, #4)

- In **extension mode**, store integration tokens, the AI provider key and config, and redaction rules in
  `chrome.storage.local` (rules may stay in `chrome.storage.sync` if already there). Never store them in page
  `localStorage`.
- Make the provider API calls (GitHub, Linear, Slack webhook, Anthropic, OpenAI, Ollama) from the **background
  service worker**, via a message from the content script. The page-world SDK must never receive the raw secret.
- One-time migration: if an old key exists in a page's `localStorage` under `tracebug_integrations` or
  `tracebug_ai_config`, move it into extension storage and delete it from the page.
- In extension mode, also mirror **saved tickets** to `chrome.storage.local` (the extension has
  `unlimitedStorage`). **View tickets** then shows tickets from all sites, grouped by origin. Keep the storage
  invariants: verify the write before showing "Saved", never evict saved tickets, warn before degradation.
- SDK-only (npm) mode keeps current behaviour. Add a short doc note that SDK users should only configure tokens
  in dev builds.
- Acceptance: tests showing (a) page JS cannot read the token in extension mode, (b) the migration works,
  (c) tickets saved on origin A are visible from origin B and survive clearing site data for A.

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

## Phase 4 - First run and the first capture (audit fixes #7, #8)

- On `runtime.onInstalled` with `reason === "install"`, open a bundled welcome page (`welcome.html` inside the
  extension; no remote assets). It includes:
  1. Pin TraceBug to the toolbar (with an image).
  2. A **Try it now** button that opens `https://tracebug.dev/try.html` (a deliberately broken demo).
  3. The `Ctrl+Shift+B` / `Cmd+Shift+B` shortcut.
  4. A plain-language privacy box: what's captured, that nothing goes to TraceBug, and that you choose what goes
     to GitHub, Slack or your LLM.
  5. A small "Rolling this out to a team?" link to `https://tracebug.dev/teams`.
  On `reason === "update"`, do not open a tab; show a small "What's new" dot in the popup instead.
- Make the default first-run capture **no video** (events + console + network + DOM replay). No screen-share
  picker for the first capture. Video becomes an explicit option ("Record video too") that is remembered once
  chosen.
- Before `getDisplayMedia` opens, show one line explaining the picker ("Chrome will ask what to share - pick this
  tab"). If capture fails on macOS with a permission error, show how to enable Screen Recording for the browser
  in System Settings.
- Fix the copy mismatch: the quickstart says "pick this tab", and the extension doc says it's pre-selected. Make
  the UI and both docs agree with real behaviour.
- **Firefox check (this phase adds `welcome.html` and touches the extension):** run `npm run build:ext`, then
  `npm run ext:lint` and `npm run ext:firefox`. Confirm `welcome.html` is included in the Firefox build output
  and that `runtime.onInstalled` fires there; note that the `Ctrl+Shift+B` default shortcut and
  `getDisplayMedia` picker copy differ on Firefox.

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
- **Slack:** because webhook responses are CORS-opaque, change the success toast to "Sent to Slack (Slack doesn't
  confirm delivery)".
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
- Add a **golden report check**: export from a fixed fixture and compare structure (tabs present, event count
  range, redaction markers) with a stored snapshot.
- Add a GitHub Actions workflow: run the smoke test on push, plus a nightly run against **Chrome Beta**.
- Write `docs/RELEASE_CHECKLIST.md` with the manual items that can't be automated: upgrade from the previous
  store version with saved tickets and keys surviving, macOS screen-recording permission, Edge, Brave, Firefox
  128 ESR + latest, real GitHub/Linear/Slack test targets, MCP `npx tracebug mcp --dir` listing the new report.

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
