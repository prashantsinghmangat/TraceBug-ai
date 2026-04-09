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
| **Console Warnings** | console.warn() arguments (when `captureConsole: "warnings"` or `"all"`) |
| **Console Logs** | console.log() arguments, last 50 (when `captureConsole: "all"`) |
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

## Session Panel

Click the **TraceBug logo** in the compact toolbar to open the session panel. It shows:

### Session List
- All recorded sessions sorted by most recent
- **Search bar** — filter sessions by error message, page URL, or session ID
- **Filter dropdown** — "All", "Has errors", "Healthy"
- Red dot = session has errors, Green dot = healthy
- "Repro Ready" badge when reproduction steps are available
- **Auto-named sessions** — e.g., "Login Session", "Vendor Session" (based on primary page)
- **Preview line** — shows last error or last action, not just event count

### Session Detail (click a session)

The detail view has a **sticky header** with the auto-generated bug title and severity badge, plus a **tabbed layout**:

#### Overview Tab
- **QA Tools** — Screenshot, Add Note, Voice Note
- **Session Overview** — Duration, events, pages visited, API calls, error status
- **Problems Detected** — Critical/warning/info issues with icons and details
- **Error Details** — Error type classification, message, stack trace, source location
- **Performance** — Average/slowest response time, success rate, per-API breakdown with visual bars
- **Reproduction Steps** — Auto-generated steps with copy button
- **Tester Notes** — All annotations with severity badges
- **Screenshots** — Inline images with filenames
- **Environment** — Browser, OS, viewport, device type

#### Timeline Tab
- Full chronological event stream with color-coded icons
- Time gap indicators between events
- Inline values for each event type
- API calls show method, status, duration with visual bars

#### Errors Tab (only shown if errors exist)
- Grouped error details with type classification
- Stack traces with expandable view
- Error count badge on the tab

#### Export Tab
- **Issue Trackers** — GitHub Issue (Markdown), Jira Ticket
- **Downloads** — PDF Report, JSON, Text Report, HTML Report
- **Clipboard** — Copy Full Report (plain text)
- **Delete** — Delete this session

## Screenshots

### Capture

- Click the **Camera** button in the toolbar or press `Ctrl+Shift+S`
- The screenshot **auto-downloads** to your system as a PNG file
- TraceBug hides its own UI, captures the page, then restores the UI
- Screenshots are auto-named based on context: `01_click_button.png`, `02_enter_field.png`
- In the Chrome Extension, screenshots use `chrome.tabs.captureVisibleTab` for reliable cross-origin capture

### Screenshot with Annotations

To capture a screenshot that includes annotation badges and outlines visible on the page:
1. Open the **Annotation List** panel (list icon in toolbar)
2. Click the green **"Save"** button
3. The page is captured with all annotation markers visible, and the PNG auto-downloads

Programmatically: `await TraceBug.takeScreenshot({ includeAnnotations: true })`

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

## Export Formats

### GitHub Issue

Generates formatted Markdown ready to paste into a GitHub issue:

```markdown
## Bug Report: Vendor Update Fails — TypeError

### Steps to Reproduce
1. Navigate to /vendor
2. Click "Edit" button
3. Select "Inactive" from Status dropdown
4. Click "Update" button

### Error
TypeError: Cannot read properties of undefined (reading 'status')

### Environment
- Browser: Chrome 120.0
- OS: Windows 11
- Viewport: 1920x1080

### Screenshots
(screenshots auto-downloaded as separate files)
```

Click **GitHub Issue** in the session detail to copy to clipboard. Screenshots are auto-downloaded so you can attach them to the issue.

### Jira Ticket

Generates Jira markup format with:
- **Summary** — Auto-generated bug title
- **Priority** — Based on error severity
- **Labels** — Auto-tagged (e.g., `bug`, `frontend`, `runtime-error`)
- **Description** — Full reproduction steps, error details, environment

### PDF Report

Generates a print-optimized HTML report and opens the browser's print dialog. Save as PDF from there.

The report includes:
- Session overview with status badge
- Problems detected with severity indicators
- Error details with stack trace
- Reproduction steps
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
