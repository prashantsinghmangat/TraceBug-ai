# Bug Reporting

TraceBug automatically captures everything needed for a bug report. When a tester finds a bug, they can generate a complete, developer-ready report with one click.

## What TraceBug Records

TraceBug silently captures these events as users interact with the app:

| Event Type | What's Captured |
|-----------|----------------|
| **Clicks** | Element tag, text, id, class, aria-label, role, data-testid, href, button type |
| **Inputs** | Field name, type, value (sensitive fields auto-redacted), placeholder |
| **Dropdowns** | Selected option, all available options, field name |
| **Form Submissions** | Form id, action, method, all field values (passwords redacted) |
| **Navigation** | From path, to path |
| **API Requests** | URL, method, status code, duration (fetch + XMLHttpRequest) |
| **Errors** | Message, stack trace, source file, line, column |
| **Console Errors** | console.error() arguments |
| **Console Warnings** | console.warn() + console.info() arguments, 50 each (when `captureConsole: "warnings"` or `"all"`) |
| **Console Logs** | console.log() arguments, first 50 (when `captureConsole: "all"`) |
| **Promise Rejections** | Rejection reason + stack trace |

### Privacy

Sensitive data is **automatically redacted**:
- Password fields → `[REDACTED]`
- Credit card numbers → `[REDACTED]`
- SSN patterns → `[REDACTED]`
- Token/secret fields → `[REDACTED]`

### Framework Noise Filtering

Internal dev-server requests are automatically excluded:
- Next.js: `__nextjs_original-stack-frame`, `_next/static/webpack`
- Webpack: `__webpack_hmr`, `.hot-update.`
- Vite: `__vite_ping`, `@vite/client`
- General: `sockjs-node`, `turbopack-hmr`

## Quick Bug modal

`Ctrl+Shift+B` (or ⚡ on the toolbar) opens the **Quick Bug** modal — the review-and-export surface for the current session. Header: auto-generated title + severity/priority badge. It has:

- **Replay** — the interactive DOM replay (or the screen recording), with a play/seek control bar. Clicking a Console/Network/Events row seeks the replay to that moment.
- **Editable description** — auto-filled with root cause, repro steps, environment, errors, and failed requests.
- **Screenshots** — primary preview + numbered thumbnail strip.
- **Tabs**: **Info** (environment + storage) · **Console** (unified event feed) · **Network** (DevTools-style request table) · **Actions** (action chips) · **AI** (prompt + BYO-key analysis) · **Events** (raw timeline).
- **Export/file** actions — see [ticket-flow.md](ticket-flow.md#step-4--export).

## Saved Tickets

The **✓ View saved tickets** toolbar button opens the offline Saved Tickets list: every ticket you explicitly saved, with error/healthy indicators and one-click re-open. Everything is read from `localStorage` — nothing is uploaded.

## Screenshots

### Capture

Screenshots are no longer instant downloads. They accumulate in the **active ticket** while you record; downloads happen only when you export the ticket.

- Click the **Camera** button in the toolbar (or press `Ctrl+Shift+S`) — the screenshot is added to the ticket
- Toast confirms: "Added to ticket · N screenshots"
- TraceBug hides its own UI, captures the page, then restores the UI
- Screenshots are auto-named based on context: `01_click_button.png`, `02_enter_field.png`
- In the Chrome Extension, screenshots use `chrome.tabs.captureVisibleTab` for reliable cross-origin capture

### Region Screenshot (Snipping Tool)

For when you only want part of the page:

- Click the **corner-square** button in the toolbar (next to the camera) — tooltip "Region Screenshot — drag to select, added to ticket"
- A translucent overlay covers the page; **drag a rectangle** over the area you want
- On release, the cropped PNG is added to the active ticket with a `_region.png` filename suffix
- Press `Esc` to cancel without capturing
- Programmatically: `await TraceBug.takeRegionScreenshot()` (resolves to `null` if cancelled)

### Reviewing the Ticket

> Full step-by-step flow with all options: see [docs/ticket-flow.md](ticket-flow.md).

When you're done reproducing the bug, click the **recording toggle** to stop, or call `TraceBug.stopRecording()`. This opens the **ticket-review modal**:

- Header: "Bug Ticket — Review & Export"
- Auto-filled title and description (root cause, steps, environment, errors, failed requests)
- **Primary preview** of the first screenshot
- **Numbered thumbnail strip** of every other screenshot; click any thumbnail to swap it into the primary preview
- Export actions: **Export .html** (interactive replay), **Export HAR**, **Fix with AI**, and under **More ▾** — **Export for AI (.html)**, **Download report (.md)**, **Download screenshots**, and file a real GitHub / Linear / Slack / Jira issue. See [ticket-flow.md](ticket-flow.md#step-4--export).
- Press `Ctrl+Shift+B` (or call `TraceBug.quickCapture()`) to open the same modal at any time

### Screenshot with Annotations

Annotation badges/outlines that are visible on the page are included when you capture. Take a screenshot (📷 toolbar button or `TraceBug.takeScreenshot()`) while the markers are on screen.

Programmatically: `await TraceBug.takeScreenshot()`  _(no arguments; region variant: `takeRegionScreenshot()`)_

### Annotation Editor

After capturing, an annotation editor opens with:

| Tool | Description |
|------|-------------|
| **Highlight** (rectangle) | Draw semi-transparent rectangles to highlight areas |
| **Arrow** | Draw arrows with arrowheads to point at elements |
| **Text** | Place text labels with dark background for readability |
| **Colors** | Red, Yellow, Green, Blue |
| **Undo** | Remove last drawn annotation |
| **Clear** | Remove all drawn annotations |

Click **Save Annotated** to merge annotations into the screenshot — the annotated image auto-downloads to your system. Or click **Download** to save the annotated version without merging.

### Storage

Screenshots are stored **in memory** (not localStorage) to avoid quota issues. They persist for the current page session and are included in generated reports.

## Voice Notes

Describe bugs by speaking. Uses the Web Speech API — completely free, no API keys.

### How to Use

1. Open a session detail in the panel
2. Click **Voice Note**
3. Click **Start Recording** and speak
4. Your words appear in real-time
5. Click **Stop** when done
6. Edit the transcript if needed
7. Click **Save as Note** — saves as a tester annotation

### Supported Browsers

Voice recording works in all Chromium browsers: Chrome, Edge, Brave, Opera.

### Features

- Real-time transcript with interim results
- Auto-punctuation (capitalize sentences, add periods)
- Spoken "period" and "comma" converted to punctuation
- Continuous mode with auto-restart on browser timeout
- Editable transcript before saving

## The Debugging Assistant (v1.3+)

Every report generated by TraceBug now opens with four derived signals that turn "what happened" into "why it likely happened":

1. **🔍 Possible Cause** — a deterministic root-cause hint with confidence tier (high / medium / low).
2. **TL;DR** — a one-sentence summary combining network, error, click, and page signals.
3. **User clicked** — the element interacted with right before the bug.
4. **Recent Actions** — the last ~10 user actions as plain-English steps.

These appear at the top of GitHub issues, Jira tickets, PDF reports, and the Quick Bug modal — developers understand the bug without scrolling.

### Root Cause Confidence Tiers

| Signal present | Confidence | Example |
|---|---|---|
| Network failure | `high` | `"API POST /orders failed with 500 after clicking 'Place Order'"` |
| Runtime error only | `medium` | `"TypeError suggests undefined/null data — the response or upstream value was likely missing"` |
| Click with no effect | `low` | `"Click on 'Submit' did not trigger any observable effect"` |

The engine maps error messages to plain-English causes: `cannot read prop` → "undefined/null data", `is not a function` → "non-callable target", `is not defined` → "missing variable/import", `failed to fetch` → "CORS, offline, or DNS", plus timeout, abort, quota, and parse-error variants.

### Response Body Snippets

For every failed network request, the first 200 chars of the response body are captured asynchronously (never blocks the request). These ship inline in every export format:

- GitHub: collapsible `<details>` block under the Failed Requests table
- Jira: `h4. Response Snippets` with `{code}` blocks
- PDF: monospace blocks under the Failed Requests table

The buffer holds the last 10 failures in memory (~2KB steady state) and is cleared on `destroy()` or "Clear All Data."

---

## Export Formats

### GitHub Issue

Generates formatted Markdown ready to paste into a GitHub issue:

```markdown
## Vendor Update Fails — TypeError

> 🔍 Possible Cause (high confidence): API POST /api/vendor/update failed with 500 after clicking 'Update'

> **TL;DR:** API POST /api/vendor/update failed with 500 when clicking 'Update' button on /vendor

**Environment:** Chrome 121 · Windows 11 · 1920x1080 · desktop
**URL:** https://app.example.com/vendor

**User clicked:** `<button>` "Update" — `#vendor-form > button.primary`

### Recent Actions
1. Clicked 'Edit' button
2. Selected 'Inactive' in status
3. Clicked 'Update' button

### Steps to Reproduce
1. Navigate to /vendor
2. Click "Edit" button
3. Select "Inactive" from Status dropdown
4. Click "Update" button

### Failed Requests
| Method | URL | Status | Duration |
|--------|-----|--------|----------|
| POST | `/api/vendor/update` | 500 | 312ms |

<details>
<summary>Response snippets</summary>

**POST /api/vendor/update → 500**
```
{"error":"Internal Server Error","message":"Cannot read property 'status' of undefined"}
```
</details>

### Screenshots
(screenshots auto-downloaded as separate files)
```

Click **GitHub Issue** in the session detail to copy to clipboard. Screenshots are auto-downloaded so you can attach them to the issue.

### Jira Ticket

Generates Jira markup with:
- **Root cause panel** — `{panel}` block with confidence-tier badge
- **TL;DR panel** — one-line summary
- **Recent Actions** — numbered list of the last ~10 user actions
- **Summary** — auto-generated bug title
- **Priority** — based on error severity
- **Labels** — auto-tagged (e.g., `tracebug`, `bug`, `has-errors`, `api-failure`)
- **Description** — reproduction steps, response snippets, environment

### PDF Report

Generates a print-optimized HTML report and opens the browser's print dialog. Save as PDF from there.

The report includes:
- Root cause banner (color-coded: red for HIGH, orange for MEDIUM, grey for LOW)
- TL;DR banner
- Recent Actions list
- Session overview with status badge
- Problems detected with severity indicators
- Error details with stack trace
- Reproduction steps
- Failed requests table with response snippets
- Full event timeline with color-coded icons
- API call breakdown

### Raw Formats

From the session detail, you can also download:
- **JSON** — Raw session data for programmatic use
- **Text Report** — Plain text summary
- **HTML Report** — Styled visual report

## Tester Notes

### Adding Notes

Click **Add Note** in the session detail QA toolbar:
- **What did you observe?** — Main description
- **Expected behavior** — What should happen
- **Actual behavior** — What actually happened
- **Severity** — Critical / Major / Minor / Info

Notes are saved to the session and included in all generated reports.

## Auto-Generated Content

TraceBug automatically generates:

| Feature | How It Works |
|---------|-------------|
| **Bug Title** | Heuristic-based, e.g., "Vendor Update Fails — TypeError" |
| **Flow Summary** | e.g., "Click 'Edit' → Select 'Inactive' → Click 'Update'" |
| **Reproduction Steps** | Ordered steps from the event timeline |
| **Error Classification** | TypeError, ReferenceError, NetworkError, etc. |
| **Problem Detection** | Scans for runtime errors, 5xx/4xx API errors, slow responses, console errors |
