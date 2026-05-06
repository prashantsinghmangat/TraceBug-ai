# Changelog

All notable changes to TraceBug are documented here.

## [Unreleased]

### Added — Sentry Mode (Rolling Video Buffer)

A "Capture this moment" recording flow inspired by NVIDIA Shadowplay / OBS replay buffer. The user arms a session once, then files multiple bug tickets from a single screen-share — no need to re-pick the screen.

- **New module: `src/video-recorder.ts`** — wraps `getDisplayMedia` + `MediaRecorder`. Supports two modes:
  - `mode: "rolling"` (default) — recording continues across captures; `captureRollingBuffer()` snapshots the in-progress recording into a finished `VideoRecording` while the screen-share keeps running.
  - `mode: "standard"` — classic record-then-stop flow.
- **New module: `src/ui/recording-hud.ts`** — floating pill with pulsing red dot, elapsed timer, "captures taken" counter, comment input (timestamped to recording time, Enter to save), 📸 Capture button (rolling mode only), and ⏹ Stop. Defensive CSS injected with `!important` to defeat host-page resets (Tailwind preflight, etc.).
- **Auto-capture on error** — when an unhandled error fires *and* a rolling session is armed, the existing error toast offers "Capture with video" instead of "Capture bug." One click captures the buffer + opens the ticket modal.
- **Smart Stop** — if the user already filed tickets via Capture, Stop ends silently with a toast. If no captures were taken, Stop opens the modal with the full recording (preserves the simple one-shot flow).
- **Public API:**
  - `TraceBug.startVideoRecording({ mode?, withMicrophone?, onStatus? })`
  - `TraceBug.stopVideoRecording(): Promise<VideoRecording | null>`
  - `TraceBug.captureRollingBuffer(): Promise<VideoRecording | null>`
  - `TraceBug.isVideoRecording()` / `isRollingMode()` / `getCaptureCount()`
  - `TraceBug.getLastVideoRecording()`
  - `downloadVideoRecording(rec, filename?)` (named export)
- **Toolbar:** new red Record button (between Region Screenshot and the right edge). Only enabled when the browser supports `getDisplayMedia`.
- **Exports updated:** GitHub issue, Jira ticket, and PDF report now include a "Screen Recording" section listing the auto-downloaded `.webm` filename, duration, file size, and any timestamped comments. Every export action auto-downloads the `.webm` alongside screenshots.
- **Comments reset on capture** — each ticket gets its own set of timestamped comments. Comments accumulate during the recording; capturing snapshots them into the recording and clears the buffer for the next bug.

### Added — Auto-Scanner (Phase 2)

A magnifying-glass toolbar button that runs six in-browser detectors in parallel and surfaces findings as severity-bucketed issues. Each issue offers Locate (flash the offending element), File Ticket (pre-fills the Quick Bug modal), and Dismiss.

- **New runtime dep: `axe-core@4.11.4`** — ~1.4 MB, lazy-loaded via `import("axe-core")` so the base bundle stays light. Only loaded the first time `scanPage()` is called. Extension IIFE bundle grew from 770 KB → 2.17 MB.
- **New module: `src/scanner/index.ts`** — orchestrator. Runs all detectors in parallel via `Promise.all` + per-detector catch wrapper (one failure doesn't block the others). Concurrent `scan()` calls are coalesced. Issues live in memory only — each scan is a fresh run, results clear on reload.
- **New module: `src/scanner/helpers.ts`** — shared selector builder (id → data-testid → tag+nth-of-type chain), severity coercion, ID generator.
- **Detectors** (one file each in `src/scanner/detectors/`):
  - **`a11y.ts`** — axe-core, restricted to WCAG 2.0/2.1 A+AA rules (skips noisy `best-practice`). Multi-element violations roll into one issue with a `(+ N more)` suffix.
  - **`broken-images.ts`** — `<img>` where `naturalWidth === 0 && complete === true`.
  - **`mixed-content.ts`** — `http://` resources on HTTPS pages. Covers `img`, `script`, `iframe`, `link[rel=stylesheet|preload|prefetch|manifest|icon]`, `audio`, `video`, `source`, `embed`, `object`.
  - **`session-data.ts`** — three detectors that classify already-collected session data: `console-error` (deduped by message), `failed-request` (4xx/5xx/network-error with response snippets), `slow-api` (successful requests over 2s).
- **New module: `src/ui/issues-panel.ts`** — modal grouped by severity. Defensive CSS with `!important` rules. Locate scrolls into view + outlines the element with a 2.4s purple flash. File Ticket pre-fills the Quick Bug modal via the new `prefilledTitle` / `prefilledDescription` options on `showQuickBugCapture()`.
- **New types in `src/types.ts`:** `Issue`, `IssueDetector` (`"axe-a11y" | "broken-image" | "mixed-content" | "console-error" | "slow-api" | "failed-request"`), `IssueSeverity` (`"critical" | "serious" | "moderate" | "minor"`).
- **Public API:**
  - `TraceBug.scanPage(): Promise<ScanResult>`
  - `TraceBug.showIssuesPanel({ rescan? })` — runs a fresh scan first by default
  - `TraceBug.getIssues({ includeDismissed? })`
  - `TraceBug.dismissIssue(id)` / `undismissIssue(id)` / `clearIssues()`
  - `TraceBug.getIssue(id)` / `getIssueCounts()` (severity-bucketed counts)
  - Named exports: `scan`, `getIssues`, `dismissIssue`, etc.

### Changed — UX Cleanup (v1.0 polish pass)

The toolbar grew to 10 buttons over multiple feature releases. Many overlapped or competed for attention. This release cuts the noise so the daily-use surface is just **capture, scan, record**.

- **Toolbar reduced from 10 → 6 elements:** Logo · ⚡ Quick Bug · 🔍 Scan · 📷 Screenshot · ⬚ Region · 🔴 Record. Removed: standalone recording-state dot, Annotate button, Draw button, Annotation List button + badge, Settings card button, Help button.
- **Quick Bug modal exports reduced from 5 → 3:** Open in GitHub · Copy as GitHub · Copy as Jira. Removed: Copy as Plain Text (GitHub markdown is pasteable anywhere), Download Screenshots (every export already auto-downloads them).
- **First-run onboarding tour removed.** Most users skipped it. Logo pulse retained as a subtle "we're here" hint; button tooltips are the only discovery aid.
- **Source files retained for all cut features.** `src/element-annotate.ts`, `src/draw-mode.ts`, `src/onboarding.ts`, `src/pdf-generator.ts` still ship in the bundle and remain accessible programmatically — `TraceBug.activateAnnotateMode()`, `TraceBug.activateDrawMode()`, `TraceBug.downloadPdf()`, `replayOnboarding()`. Only the default UI surface changed.
- **`shortcuts.annotate` and `shortcuts.draw` config keys retained** in the `TraceBugConfig` type for backwards compatibility. They're now no-ops since the corresponding toolbar buttons aren't mounted.
- **Build artifacts:** Extension IIFE 2.17 MB (axe-core dominates). npm DTS 32 KB. All 74 tests pass.

### Added — Freemium Plan

Local-only Free/Premium split. No backend, no auth, no payment. Plan is a flag in `chrome.storage.local` / `localStorage`. Free users get the full bug-reporting workflow; premium unlocks polish features.

- **New module: `src/plan.ts`** — `getPlan()`, `isPremium()`, `setPlan()`, `hydratePlan()`, `FREE_LIMITS`. Plan exposed on the SDK singleton and as named exports.
- **New module: `src/ui/upgrade-modal.ts`** — minimal centered modal with a placeholder "Upgrade — Coming Soon" CTA and a dev-only toggle for flipping the plan flag locally.
- **Gates:**
  - **Screenshots** — free users capped at 2 per ticket (`FREE_LIMITS.screenshots`). Both `takeScreenshot()` and `takeRegionScreenshot()` return `null` and show the upgrade modal at the cap. Toolbar buttons enforce the same.
  - **PDF export** — `TraceBug.downloadPdf()` opens upgrade modal; no PDF is generated.
  - **Jira ticket** — `TraceBug.getJiraTicket()` returns `null` and opens upgrade modal. The Quick Bug modal renders the Jira button as `🔒 Jira Ticket (Premium)` (muted) for free users; premium gets the blue `🎫 Copy as Jira Ticket`.
  - **Advanced metadata** — `consoleErrors` and `networkErrors` arrays in the generated report are blanked out for free users. Capture still happens (cheap); only the export is redacted.
  - **Custom branding** — new `companyName` config option, ignored on free. On premium, every export is prefixed with `> _Reported via TraceBug — {companyName}_`.
- **UI surfaces:**
  - Toolbar settings card now shows a `Free Plan` / `✨ Premium` badge next to the screenshot count (clickable; opens upgrade modal). Screenshot count line shows `N / 2` cap on free.
  - Quick Bug modal footer shows the same badge alongside "Draft auto-saved".
- **Dev toggle** — the upgrade modal exposes a small `Dev: enable Premium` button so testers can flip the flag without redeploying. Persists across sessions.
- **Backwards compat:** `getJiraTicket()` and `downloadPdf()` previously always succeeded for any caller; they now return `null` / open the modal for free users. Existing premium-equivalent flows (programmatic `generateGitHubIssue`, etc.) are unchanged.

See [docs/freemium.md](docs/freemium.md) for the full spec, gate table, and test steps.

### Changed — Ticket-First Capture Flow

Screenshot capture is no longer an instant download. Captured shots accumulate in the active **bug ticket**; downloads happen only when the user exports the ticket.

- **Toolbar Screenshot button** — captures a full-viewport screenshot and stores it in the ticket. Toast: "Added to ticket · N screenshots". No file is written to disk.
- **Toolbar Region Screenshot button** — same flow: drag-to-crop, store in the ticket, no download.
- **`TraceBug.stopRecording()`** — pauses recording **and** auto-opens the ticket-review modal so the user sees every step + every screenshot before exporting.
- **Ticket-review modal** (the renamed Quick Bug modal — title is now "Bug Ticket — Review & Export"):
  - Renders **all** screenshots in the active ticket as a numbered thumbnail strip below the primary preview.
  - Click any thumbnail to swap it into the primary preview.
  - Header shows screenshot count (e.g. "3 screenshots attached · download/copy includes all screenshots").
- **Bulk export** — every export action (Open in GitHub, Copy as GitHub Issue, Copy as Jira Ticket, Copy as Plain Text, Download Screenshots) downloads **every** screenshot in the ticket, staggered 120ms apart so the browser doesn't drop concurrent downloads.
- Toast labels updated to reflect the count, e.g. "✓ Copied as Jira Ticket · downloading 3 screenshots".

### Added — Region Screenshot (Snipping Tool)

- **`TraceBug.takeRegionScreenshot()`** — drag-to-select-area screenshot. Shows a fullscreen overlay with a translucent dim layer; user drags a rectangle; the cropped PNG is pushed to `getScreenshots()`. Press `Esc` to cancel.
  - Reuses the existing `captureScreenshot()` pipeline, so it inherits `chrome.tabs.captureVisibleTab` in extension context and the html2canvas fallback in plain-SDK context — no new dependencies.
  - Crops via canvas with DPR-aware scaling (`naturalWidth / window.innerWidth`).
  - Returns `null` if the user presses `Esc` or selects a region smaller than 5×5 px.
  - New module: `src/region-screenshot.ts`
  - New export: `captureRegionScreenshot`
- **Toolbar button** — a corner-square icon next to the existing camera, tooltip "Region Screenshot — drag to select, added to ticket".
- Overlay carries `data-tracebug="region-overlay"` so the existing `isTraceBugElement` filter ignores its own clicks.

### Added — Recording Aliases

- **`TraceBug.startRecording()`** — alias for `resumeRecording()`. Semantic only; behavior is unchanged.
- **`TraceBug.stopRecording()`** — calls `pauseRecording()` **and** auto-opens the ticket-review modal. The modal flow above is the only behavioral difference from `pauseRecording()`.

## [1.3.0] - 2026-04-13

### Added — Debugging Assistant

- **🔍 Root Cause Hint Engine** — every report now leads with a one-line, confidence-tiered cause hint. Deterministic, no AI APIs.
  - `HIGH` — when a failed network request is present: `"API POST /orders failed with 500 after clicking 'Place Order'"`
  - `MEDIUM` — when only a runtime error is present: `"TypeError suggests undefined/null data — the response or upstream value was likely missing"`
  - `LOW` — click without downstream signal: `"Click on 'Submit' did not trigger any observable effect"`
  - Injected at the top of GitHub issues, Jira tickets, PDF reports, and the Quick Bug modal
  - New exports: `generateRootCauseHint(report)`, `formatRootCauseLine(rc)`
  - New type: `RootCauseHint { hint, confidence }`
- **🧠 Smart Bug Summary** — one-sentence TL;DR derived from network + error + click + page signals. Rendered as a blockquote on GitHub, a `{panel}` on Jira, and an indigo banner on PDF.
  - Example: `"API POST /orders failed with 500 when clicking 'Place Order' button on /checkout"`
  - New export: `generateSmartSummary(report)`
- **🧩 Session Steps** — last ~10 user actions converted to plain-English strings (`"Clicked 'Edit' button"`, `"Navigated to /checkout"`). FIFO queue. Injected as a numbered list in all exports.
  - New export: `generateSessionSteps(events)`
- **🎯 Clicked Element snapshot** — structured `{ tag, text, selector, id, ariaLabel, testId, page }` for the last click before the bug. Surfaced as a `**User clicked:**` line in exports.
  - New export: `extractClickedElement(events)`
  - New type: `ClickedElementSummary`

### Added — Network Failure Capture

- **Response body snippets** — first 200 chars of every failed `fetch` or `XHR` response, captured asynchronously after the response returns (never blocks the request).
  - Rendered as a collapsible `<details>` block in GitHub, `h4. Response Snippets` on Jira, monospace blocks in PDF
  - Fetch path clones the response and reads text on a microtask tick — the caller gets the response unchanged
  - XHR path reads `responseText` on `loadend` only for `status >= 400 || status === 0`
- **Last-10 failures ring buffer** — in-memory FIFO, ~2KB steady state, cleared on `destroy()` and on "Clear All Data"
  - New export: `getNetworkFailures()` and `TraceBug.getNetworkFailures()`
  - New types: `NetworkFailure`, `NetworkErrorEntry` (with optional `response` field)

### Fixed — Session & Data Integrity

- **Clear All Sessions was silently undone by the pending flush** — after clicking "Clear All Data", the next event re-wrote the stale in-memory cache back to localStorage. Now `clearAllSessions()` cancels any pending flush and drops the cache before wiping storage.
- **Deleted sessions could resurrect themselves** — `deleteSession(id)` now invalidates the cache; pending flushes can't re-save the deleted row.
- **Race between flush queue and mutator writes** — `updateSessionError`, `addAnnotation`, `saveEnvironment` previously read from localStorage, ignoring newer events in the pending cache; their writes then overwrote the cache on flush. All three now read through the cache and call `scheduleFlush()`.
- **Network failure buffer leaked across cleared sessions** — `buildReport()` now filters buffer entries by `timestamp >= session.createdAt` so a fresh session cannot inherit failures from a cleared one.

### Changed

- **"Clear All Data" now actually clears everything** — sessions + screenshots + voice transcripts + element annotations + annotation badges + network failure buffer. Applied to both the dashboard panel's Clear button and the compact toolbar's settings card. Confirm dialog updated to list what's being wiped.
- **Every report starts with root cause + TL;DR** — GitHub issues, Jira tickets, PDF reports, and Quick Bug modal descriptions all lead with these two lines so a reader understands the bug without scrolling.

## [1.2.0] - 2026-04-09

### Added — API
- **`TraceBug.quickCapture()`** — one-shot bug capture flow: screenshot + auto-filled modal + 1-click copy to GitHub/Jira/Text. Keyboard shortcut: `Ctrl+Shift+B`. Cuts bug reporting from ~7 clicks to 2.
- **`TraceBug.setUser({ id, email, name })`** — identify users for session attribution, persisted in localStorage
- **`TraceBug.getUser()` / `TraceBug.clearUser()`** — query and clear identified user
- **`TraceBug.markAsBug()`** — flag current session as a bug (adds `isBug: true`)
- **`TraceBug.getCompactReport()`** — 2-sentence Slack-friendly summary of the session
- **`TraceBug.getErrorCount()` / `TraceBug.exportSessionJSON()`** — CI/CD integration helpers
- **`TraceBug.use(plugin)` / `TraceBug.removePlugin(name)`** — plugin registration API
- **`TraceBug.on(event, callback)`** — subscribe to lifecycle hooks (session:start, error:captured, screenshot:taken, report:generated, etc.)
- **`TraceBugUser` type** exported
- **`takeScreenshot({ includeAnnotations })`** option — capture page with annotation badges visible

### Added — Features
- **Theme system** — dark/light/auto themes with 45+ CSS custom property design tokens, follows `prefers-color-scheme` in auto mode
- **Configurable toolbar position** — `toolbarPosition: 'right' | 'left' | 'bottom-right' | 'bottom-left'`
- **Draggable toolbar** — drag to any position, persisted in `tracebug_toolbar_pos` localStorage key
- **Mobile FAB mode** — viewport < 768px collapses toolbar to a single floating action button; panel becomes full-width bottom sheet
- **First-run onboarding** — 4-step tooltip tour shown once, "?" help button on toolbar to replay
- **Console capture levels** — `captureConsole: 'errors' | 'warnings' | 'all' | 'none'` (new event types: `console_warn`, `console_log`)
- **Tab-based session detail** — Overview / Timeline / Errors / Export tabs with sticky header (bug title + severity badge)
- **Session search & filter** — search by error message, URL, or session ID; filter by all/errors/healthy
- **Session auto-naming** — sessions named by primary page (e.g., "Login Session")
- **Toast notifications** — visual feedback for actions with aria-live announcements for screen readers
- **Clickable annotation badges** — numbered badges on annotated elements open a popover with intent, severity, and comment
- **Screenshots in annotation list panel** — alongside element annotations and draw regions, with inline previews and per-item download
- **Screenshot auto-download** — screenshots and "Save Annotated" auto-download PNG files to the user's system
- **Extension screenshot via `chrome.tabs.captureVisibleTab`** — replaces html2canvas in the Chrome Extension for CORS-safe captures
- **CLI tool** — `npx tracebug init` auto-detects framework (React, Next.js, Vue, Angular, Svelte, Nuxt, vanilla) and prints setup snippet
- **Custom keyboard shortcuts** — `shortcuts: { screenshot, annotate, draw }` config option

### Added — Website & SEO
- **Chrome Web Store publication** — one-click install at `chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj`
- **Cross-browser support docs** — Chrome, Edge, Brave, Opera (Chrome Web Store); npm SDK for Firefox/Safari
- **4 programmatic SEO pages** — `/compare/sentry-alternative`, `/compare/logrocket-alternative`, `/compare/bugsnag-alternative`, `/compare/frontend-bug-reporting-tool`
- **Sitemap.xml + robots.txt** via Next.js metadata API
- **JSON-LD structured data** (SoftwareApplication schema) in root layout
- **Per-page metadata** — unique title/description/OG for docs page
- **OG image** — PNG via Next.js ImageResponse route (replaces SVG that social platforms couldn't render)
- **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy in `next.config.js`
- **Scroll-reveal animations** — IntersectionObserver-based with `prefers-reduced-motion` respect
- **Mobile-responsive comparison table** — card layout on `< md` viewports

### Added — Infrastructure
- **Config validation** — runtime checks on `init()` (projectId required, maxEvents/maxSessions must be positive); invalid values warn and fall back to defaults
- **OSS infrastructure** — CONTRIBUTING.md, CHANGELOG.md, `.github/ISSUE_TEMPLATE/` (bug_report.md, feature_request.md), `.github/workflows/ci.yml`
- **README badges** — npm version, monthly downloads, GitHub stars, MIT license
- **`ui/` module directory** — extracted dashboard helpers (`helpers.ts`, `toast.ts`, `index.ts`) from the 2000-line `dashboard.ts`

### Fixed
- **Global error boundary** — entire `init()` body + all collectors + dashboard mount wrapped in try/catch; SDK never crashes host app
- **Resilient fetch/XHR wrappers** — original function ALWAYS called even if tracking throws; handles Request objects, URL objects, strings
- **Footer privacy link** — changed from `#` to `/privacy`
- **Docs page metadata** — unique title/description instead of falling back to root layout

### Changed
- All UI components migrated from hardcoded colors to CSS custom properties (`var(--tb-*)`)
- Collectors hardened with try/catch — never break host app event handling
- `html2canvas` pinned to exact version `1.4.1` (removed caret range)

## [1.1.1] - 2026-03-12

### Initial Public Release
- Session recording (clicks, inputs, navigation, API calls, errors)
- Screenshot capture with annotation editor (rectangles, arrows, text)
- Voice bug descriptions via Web Speech API
- Element annotation mode (click elements to attach feedback)
- Draw mode (rectangles/ellipses on live page)
- GitHub Issue and Jira Ticket export (one-click copy)
- PDF report generation
- Auto-generated reproduction steps
- Auto bug title and flow summary
- Environment detection (browser, OS, viewport, device, connection)
- Privacy: passwords, credit cards, SSNs, tokens auto-redacted
- Framework noise filtering (Next.js, Webpack, Vite, Turbopack)
- Chrome Extension (Manifest V3, CSP-safe injection)
- npm package with ESM + CJS + IIFE + TypeScript declarations
