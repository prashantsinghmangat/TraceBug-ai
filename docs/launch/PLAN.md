# TraceBug v1.11 launch-readiness plan

Run one phase at a time, each in a **fresh Claude Code session**. After each phase: review the diff, run the
checks, then start the next session with "Use the phase skill: Phase N." That reads `docs/launch/STATE.md` and
this file's live sections only - not the archives.

**As of 2026-10-14 every engineering phase for 1.11.0 is closed.** What is left before submission
needs a person, not a session: `STATE.md` § "Left before submission". The marketing,
distribution and release calendar - and the status of all 32 items from the Oct 11 growth audit -
live in `docs-internal/GROWTH-PLAN-30DAY.md`, which is gitignored and deliberately not in this
repo. The phases below that are still open are **post-submission**: Phase 8's
remainder, Phase 10 (1.11.1, video) and Phase 11 (1.12, Site Audit).

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
  before it opens, and a macOS Screen-Recording denial is no longer reported as a user cancel.
- **Phase 4 Steps C + D.** Done. `tracebug-extension/welcome.html` is bundled and opened on install, with no
  remote assets; an update shows the per-version "What's new" card in the popup instead of a tab.
- **Phase 5 - Sharing loop and review ask.** Done. Export footer, issue signature, the review ask after the
  3rd export, the uninstall survey, and all store URLs + UTM values in `src/links.ts`.
- **Phase 6 - Edge cases.** Done. Oversize-export notice, "Copy for Jira", the canvas/CSP replay warning.
  Slack was already resolved by Phase 2b. One correction worth keeping: the plan's "DOM replay only (no
  video)" fallback cannot fire - when a replay exists the exporter already drops the video, so that IS the
  small export; the oversize branch is the opposite one.
- **Phase 7 - Diagnostics without telemetry.** Done. `diagnostics.js` owns the scrubbing, the session error
  ring and the report; the popup's "Having trouble?" panel offers **Copy diagnostics** and **Report a
  TraceBug bug**. The leak test it asked for found a real leak on its first run.
- **Phase 9 - Docs and copy consistency.** Done. Firefox documented as live, the four-action popup, the new
  permission table, the "nothing goes to TraceBug" wording, the Product Hunt badge removed from the website.

Full text of Phases 4-7: `PLAN-archive.md`.

## Phase 8 - Smoke-test harness and release checklist

**DEFERRED TO AFTER SUBMISSION**, except two items already done:

- **[DONE] The harnesses run anywhere, headless.** `e2e/paths.mjs` replaced the hardcoded
  `D:/Project/TraceBug-ai` paths, and all five extension suites run in Chromium's new headless mode.
  **Verified:** bundled Chromium loads an unpacked MV3 extension headless and the service worker
  registers (manifest version read back through it). Branded Chrome 137+ still ignores
  `--load-extension`, so the nightly-against-Chrome-Beta item below cannot work and stays a manual row.
- **[DONE] The no-token-in-the-page test:** `e2e/ext-no-secrets-in-page.e2e.mjs`, in CI.

Everything else here - fixtures, `extension-smoke.spec.ts`, the golden report check, the nightly - is
post-submission work.

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
- **[DONE] No token anywhere in the page - the Phase 2a guarantee, tested in a real DOM.** Seed a GitHub PAT, a Linear
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

## Phase 9 - Docs and copy consistency (DONE)

**PHASE 9 IS DONE** (2026-10-13/14). Every item below landed; they are kept for context, not as
instructions. The listing copy that came out of it is in `store-submission-pack.md`.

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

## Phase 10 - 1.11.1: video back in the extension (post-submission, week of Oct 19)

Screen recording is paused in 1.11 behind `VIDEO_ENABLED_IN_EXTENSION` in `src/video-recorder.ts`.
**The full brief is `docs/launch/video-1.11.1.md` - read it, not this summary.** The order:

- **Bug 1 (worst): a recording is lost on stop.** The capture runs, the ticket opens empty. The hand-off
  offscreen -> `chrome.storage.local` -> page is where it fails. The stated cause is a **hypothesis, and two
  earlier guesses on this path were wrong** - reproduce in a real browser first, instrumenting all three hops.
  Check `getSessionVideo()`'s `VIDEO_SESSION_GRACE_MS` window too: a session created after the recording starts
  discards a perfectly good video.
- **Bug 4: the HUD mic button is wired to `_stream`, which is null in the page** in extension mode. The gap is
  an RPC - `tb:rec:mic-mute`, plus a `micIncluded` flag in `tb:rec:status` that `offscreen.js` already
  broadcasts.
- **Bug 3 is half done** (the options-page Microphone card grants it from a real tab). What remains is the
  popup's mic row and - copying Jam's placement - the "no microphone permission yet" line **on the HUD**,
  where the user is actually trying to use it.
- **Bug 2 (polish): no working fullscreen in the preview.** Check the modal and the exported viewer
  separately; they are different documents and can fail for different reasons.
- **Do not restore `preferCurrentTab` in `offscreen.js`.** It means "the tab of the calling document" and an
  offscreen document has no tab; paired with `selfBrowserSurface: "exclude"` Chrome rejects the whole call.
  Offering "This tab" needs `chrome.tabCapture.getMediaStreamId` and the **`tabCapture` permission** - a
  product decision (it brings back the browsing-history install warning), not a bug fix.
- Flipping the switch also restores: the popup's `optVideo` checkbox and `micOpt` row (commented, not deleted),
  the `offscreen` permission in **both** manifests, and the `offscreen` row in §7b of the two store docs.
- `tests/video-paused-1-11.test.ts` will fail wholesale. That is correct - it pins 1.11's behaviour. **Replace
  it, don't weaken it.** And extend `e2e/ext-shipping-path.e2e.mjs` to record for real: all four bugs survived
  817 unit tests because the fake `getDisplayMedia` accepts constraint pairs a browser rejects.

## Phase 11 - 1.12: the Site Audit tab (post-submission, after 1.11.1)

Build it only once 1.11 is approved and 1.11.1 has brought video back. The pitch is "find the bug, then trace
it". Three things keep it from being a copy of Exploratory Tester: **every finding becomes a ticket** through
the existing confirm window; **findings ride in the report**, so the `.html` a developer opens shows both; and
**the MCP server exposes the audit**, so "fix the 6 accessibility errors on /checkout" works in Claude Code.

Design rules: no new install warnings (`activeTab` + `scripting`, on an explicit **Run audit**; other-domain
link checks ask for optional host access at that moment). Read-only by default - active tests that fill or
toggle anything are opt-in per run, with a warning, because on a real site they can place an order. Offline
and bundled - axe-core and any dictionary ship in the package and load only when an audit starts. Honest
numbers - a category with nothing to test shows N/A and never counts as passed. Reuse the report builder, the
provider send and redaction; no new export formats.

- **1.12a (the one worth announcing):** accessibility (axe-core, WCAG 2.1 AA), SEO meta tags, images, links,
  resource/API failures, page-load and slow requests, console errors, page-type detection - plus ticket and
  export.
- **1.12b:** passive form checks, spelling (bundled en-US), security basics (mixed content, CSP/HSTS/XFO via a
  same-origin fetch), and a `get_audit` MCP tool.
- **1.12c:** active form validation and control toggling (opt-in, never submits), and an audit diff between two
  runs of the same URL.
- **Open question before committing to 1.12b's dictionary:** axe-core alone is ~0.5 MB minified. Measure the
  1.12a zip first.

## Final report

When all phases are done, produce:

1. A table of each fix -> status -> files changed -> how it was verified.
2. The final manifest permissions and the exact install-time warnings.
3. Anything that could not be verified automatically and must be checked by hand before submitting to the
   Chrome Web Store.
4. The draft "What's new in 1.11" text for the store listing (3-5 lines).
