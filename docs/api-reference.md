# API Reference

Complete reference for the TraceBug SDK programmatic API.

## Default Export

```typescript
import TraceBug from "tracebug-sdk";
```

`TraceBug` is a singleton instance of `TraceBugSDK`. All methods are called on this instance.

---

## Initialization

### `TraceBug.init(config)`

Initialize TraceBug. Call once on app startup.

```typescript
TraceBug.init({
  projectId: "my-app",        // Required
  maxEvents: 200,             // Default: 200
  maxSessions: 50,            // Default: 50
  enableDashboard: true,      // Default: true
  enabled: "auto",            // Default: "auto"
  theme: "dark",              // Default: "dark"
  toolbarPosition: "right",   // Default: "right"
  minimized: false,           // Default: false
  captureConsole: "errors",   // Default: "errors"
  shortcuts: { ... },         // Custom keyboard shortcuts
});
```

**Parameters:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `projectId` | `string` | *required* | Identifies your app in stored data |
| `maxEvents` | `number` | `200` | Max events stored per session |
| `maxSessions` | `number` | `50` | Max sessions kept in localStorage |
| `enableDashboard` | `boolean` | `true` | Show the compact toolbar on page |
| `enabled` | `string \| string[]` | `"auto"` | Controls when SDK is active (see [Configuration](configuration.md)) |
| `theme` | `"dark" \| "light" \| "auto"` | `"dark"` | Color theme (`"auto"` follows system preference) |
| `toolbarPosition` | `"right" \| "left" \| "bottom-right" \| "bottom-left"` | `"right"` | Toolbar position on screen |
| `minimized` | `boolean` | `false` | Start in minimized FAB mode |
| `captureConsole` | `"errors" \| "warnings" \| "all" \| "none"` | `"errors"` | Console capture level |
| `shortcuts` | `object` | `{}` | Custom keyboard shortcuts |

### `TraceBug.destroy()`

Tear down the SDK completely. Removes all listeners, dashboard UI, and clears in-memory data.

```typescript
TraceBug.destroy();
```

---

## Plan (Freemium)

> Full details: [docs/freemium.md](freemium.md)

### `TraceBug.getPlan(): "free" | "premium"`
Returns the current plan. Hydrated from `chrome.storage.local` (extension) or `localStorage` (web SDK) at init.

### `TraceBug.isPremium(): boolean`
Convenience for `getPlan() === "premium"`.

### `TraceBug.setPlan(plan): Promise<void>`
Persist the plan. Used by the in-modal dev toggle and (future) upgrade flow.

### `TraceBug.hydratePlan(): Promise<Plan>`
Read storage and cache. Called automatically at `init()`; rarely needed directly.

### `TraceBug.FREE_LIMITS`
`{ screenshots: 2 }` — the free-tier caps.

**Free vs premium gates summary** (see [docs/freemium.md](freemium.md) for the full table):

| Method | Free behavior |
|---|---|
| `takeScreenshot()` / `takeRegionScreenshot()` | Returns `null` and shows upgrade modal at the 2-screenshot cap |
| `downloadPdf()` | Shows upgrade modal; no PDF generated |
| `getJiraTicket()` | Shows upgrade modal; returns `null` |
| `generateReport()` | Returns the report with `consoleErrors: []` and `networkErrors: []` |
| `companyName` config | Ignored (no branding line prepended) |

---

## Recording Control

### `TraceBug.pauseRecording()`

Pause event capture. Events will not be recorded until resumed.

### `TraceBug.resumeRecording()`

Resume recording after a pause.

### `TraceBug.startRecording()`

Alias for `resumeRecording()`. Use `start` / `stop` when you want a clear "begin a bug ticket" semantic.

### `TraceBug.stopRecording()`

Pauses recording **and** opens the ticket-review modal so the user can see every captured step + screenshot before exporting. Equivalent to `pauseRecording()` followed by `quickCapture()`.

```typescript
TraceBug.startRecording();          // begin recording a ticket
// ...user clicks around, takes screenshots via toolbar...
TraceBug.stopRecording();           // pauses + opens the ticket-review modal
```

The modal uses any screenshots already stashed in the ticket; downloads happen only when the user clicks an export action.

### `TraceBug.isRecording(): boolean`

Returns `true` if currently recording events.

### `TraceBug.getSessionId(): string | null`

Returns the current session ID, or `null` if not initialized.

---

## Bug Ticket Flow

> Full step-by-step flow with all options: see [docs/ticket-flow.md](ticket-flow.md).

TraceBug treats a recording cycle as a **bug ticket**:

1. `startRecording()` (or just leave recording on by default)
2. User reproduces the bug. Toolbar buttons (camera / region) **add screenshots to the ticket** — no instant downloads.
3. `stopRecording()` (or click the recording toggle) → ticket-review modal opens automatically.
4. User reviews title + description + numbered screenshot gallery.
5. Click any export action — **all** screenshots in the ticket download alongside the markdown/clipboard payload.

The ticket-review modal is the same modal opened by `quickCapture()` / `Ctrl+Shift+B`; calling either path is equivalent.

### `TraceBug.quickCapture(): Promise<void>`

Open the ticket-review modal. If the active ticket already has screenshots (added via the toolbar during recording), the modal renders all of them as a numbered gallery; otherwise it captures one fresh so the modal isn't empty.

```typescript
await TraceBug.quickCapture();
```

**Keyboard shortcut:** `Ctrl+Shift+B` (works anywhere on the page when the dashboard is mounted).

**Toolbar button:** Click the ⚡ icon (first button after the recording dot).

The modal:
- Header: "Bug Ticket — Review & Export" with a count line ("3 screenshots attached · download/copy includes all screenshots")
- Auto-fills title from session context (`generateBugTitle`)
- Auto-fills description with steps + environment + error details
- Renders the **primary preview** (first screenshot) and a **numbered thumbnail strip** for the rest; click a thumbnail to swap it into the primary preview
- Auto-saves draft to `tracebug_last_bug_draft` (recovered if you accidentally close)
- Closes on Escape, click-outside, or after a successful export

**Export actions (all download every screenshot in the ticket):**

| Button | Action | Screenshots |
|--------|--------|-------------|
| Open in GitHub | Opens prefilled GitHub issue page in a new tab | All downloaded, staggered 120ms |
| Copy as GitHub Issue | Copies markdown to clipboard | All downloaded, staggered 120ms |
| Copy as Jira Ticket | Copies Jira-formatted text to clipboard | All downloaded, staggered 120ms |
| Copy as Plain Text | Copies title + description | All downloaded, staggered 120ms |
| Download Screenshots | Downloads only — no clipboard | All, staggered 120ms |

## Screenshots

### `TraceBug.takeScreenshot(options?): Promise<ScreenshotData | null>`

Capture a screenshot of the current page. The file auto-downloads to the user's system. Returns the screenshot data including base64 data URL, filename, and dimensions.

```typescript
// Standard screenshot (clean page, annotations hidden)
const screenshot = await TraceBug.takeScreenshot();

// Screenshot with annotations visible (badges + outlines stay on screen)
const annotated = await TraceBug.takeScreenshot({ includeAnnotations: true });
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeAnnotations` | `boolean` | `false` | Keep annotation badges and outlines visible in the screenshot |

In the Chrome Extension, screenshots use `chrome.tabs.captureVisibleTab` instead of html2canvas for reliable cross-origin capture.

### `TraceBug.takeRegionScreenshot(): Promise<ScreenshotData | null>`

Snipping-tool style screenshot. Shows a fullscreen overlay; the user drags a rectangle; the cropped PNG is **added to the active ticket** (`getScreenshots()`). It is **not** auto-downloaded — downloads happen only when the user exports the ticket from the review modal.

```typescript
const region = await TraceBug.takeRegionScreenshot();
if (region) {
  console.log("Added to ticket:", region.filename, region.width, region.height);
}
```

**Behavior:**
- Press `Esc` while the overlay is open to cancel — resolves to `null`
- Drag smaller than 5×5 px — resolves to `null`
- Cropping handles devicePixelRatio (scales source by `naturalWidth / window.innerWidth`)
- Filename pattern: `XX_..._region.png` (the `_region` suffix differentiates from full-viewport captures)

**Toolbar button:** corner-square icon next to the camera (tooltip: "Region Screenshot — drag to select, added to ticket").

### `TraceBug.getScreenshots(): ScreenshotData[]`

Get all screenshots captured in the current session.

**ScreenshotData type:**

```typescript
interface ScreenshotData {
  id: string;
  timestamp: number;
  dataUrl: string;      // Base64 PNG
  filename: string;     // e.g. "01_click_button.png"
  eventContext: string;  // What triggered capture
  page: string;         // URL pathname
  width: number;
  height: number;
}
```

---

## Tester Notes

### `TraceBug.addNote(options)`

Add a tester annotation to the current session.

```typescript
TraceBug.addNote({
  text: "Button doesn't respond after first click",
  expected: "Button should submit the form",
  actual: "Nothing happens on click",
  severity: "critical",
});
```

**Options:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `text` | `string` | Yes | The observation |
| `expected` | `string` | No | Expected behavior |
| `actual` | `string` | No | Actual behavior |
| `severity` | `"critical" \| "major" \| "minor" \| "info"` | No | Default: `"info"` |
| `screenshotId` | `string` | No | Link to a screenshot |

---

## Voice Recording

Uses the Web Speech API (free, built into Chrome/Edge/Brave). No audio is stored — only text transcripts.

### `TraceBug.isVoiceSupported(): boolean`

Check if the browser supports speech recognition.

### `TraceBug.startVoiceRecording(options?): boolean`

Start speech-to-text recording. Returns `true` if started successfully.

```typescript
TraceBug.startVoiceRecording({
  onUpdate: (text, interim) => {
    console.log("Transcript:", text);
    console.log("Speaking:", interim);
  },
  onStatus: (status, message) => {
    console.log(status); // "recording" | "stopped" | "error"
  },
});
```

### `TraceBug.stopVoiceRecording(): VoiceTranscript | null`

Stop recording and return the transcript.

### `TraceBug.isVoiceRecording(): boolean`

Check if voice is currently recording.

### `TraceBug.getVoiceTranscripts(): VoiceTranscript[]`

Get all voice transcripts from the session.

---

## Element Annotate Mode

Click any element on the page to select it and attach structured feedback (intent, severity, comment). Page scroll freezes during annotation.

### `TraceBug.activateAnnotateMode()`

Enter annotate mode. A purple banner appears at the top of the page.

### `TraceBug.deactivateAnnotateMode()`

Exit annotate mode.

### `TraceBug.isAnnotateModeActive(): boolean`

Check if annotate mode is currently active.

**In annotate mode:**
- Hover over elements to see a purple highlight
- Click an element to open the feedback form
- Hold `Shift` and click to select multiple elements
- Right-click to open feedback for multi-selected elements
- Press `Esc` to exit

---

## Draw Mode

Draw rectangles or ellipses directly on the live page to mark layout, spacing, or alignment regions.

### `TraceBug.activateDrawMode()`

Enter draw mode. A toolbar appears at the top with shape and color options.

### `TraceBug.deactivateDrawMode()`

Exit draw mode.

### `TraceBug.isDrawModeActive(): boolean`

Check if draw mode is currently active.

**In draw mode:**
- Drag to draw shapes
- Choose between Rectangle and Ellipse
- Pick from 5 colors (Purple, Red, Yellow, Green, Blue)
- Add a comment after each shape
- Press `Esc` or click **Done** to exit

---

## UI Annotations (Export)

### `TraceBug.getAnnotationReport(): UIAnnotationReport`

Get a complete report of all element annotations and draw regions.

```typescript
const report = TraceBug.getAnnotationReport();
console.log(report.elementAnnotations); // ElementAnnotation[]
console.log(report.drawRegions);        // DrawRegion[]
```

### `TraceBug.exportAnnotationsJSON(): string`

Export all annotations as a formatted JSON string.

### `TraceBug.exportAnnotationsMarkdown(): string`

Export all annotations as a Markdown document.

### `TraceBug.copyAnnotationsToClipboard(format): Promise<boolean>`

Copy annotations to clipboard. Returns `true` on success.

```typescript
await TraceBug.copyAnnotationsToClipboard("markdown");
await TraceBug.copyAnnotationsToClipboard("json");
```

### `TraceBug.clearAnnotations()`

Remove all element annotations and draw regions.

---

## Report Generation

### `TraceBug.generateReport(): BugReport | null`

Generate a complete bug report for the current session including steps, errors, environment, screenshots, annotations, and timeline.

### `TraceBug.getGitHubIssue(): string | null`

Generate a GitHub issue in Markdown format. Copies to clipboard via the dashboard.

### `TraceBug.getJiraTicket(): JiraTicket | null`

Generate a Jira ticket payload with summary, description, priority, and labels.

### `TraceBug.downloadPdf()`

Generate a print-optimized HTML report and open the browser print dialog.

### `TraceBug.getBugTitle(): string | null`

Get an auto-generated bug title based on the session timeline (e.g., "Vendor Update Fails — TypeError").

### `TraceBug.getEnvironment(): EnvironmentInfo`

Get current environment info: browser, OS, viewport, device type, connection type.

---

## Debugging Assistant (v1.3+)

Every report generated by TraceBug now includes four derived fields that turn "what happened" into "why it likely happened." You rarely need to call these directly — they are populated automatically when you call `TraceBug.generateReport()` — but they are exported for advanced use.

### `TraceBug.getNetworkFailures(): NetworkFailure[]`

Returns the last 10 failed network requests captured in memory, newest last, with response body snippets. Cleared on `destroy()` and on "Clear All Data."

```typescript
TraceBug.getNetworkFailures();
// [
//   { url: "/api/orders", method: "POST", status: 500,
//     response: "{\"error\":\"database timeout\"}", timestamp: 1712992347123 },
//   ...
// ]
```

### `generateRootCauseHint(report): RootCauseHint`

Produces a confidence-tiered cause hint. Pure function, no async. Reads only `report.networkErrors[0]`, `report.consoleErrors[0]`, and `report.clickedElement`.

```typescript
import { generateRootCauseHint } from "tracebug-sdk";
const report = TraceBug.generateReport()!;
generateRootCauseHint(report);
// { hint: "API POST /orders failed with 500 after clicking 'Place Order'",
//   confidence: "high" }
```

Confidence tiers:

| Signal | Confidence | Example |
|---|---|---|
| Network failure present | `high` | `"API POST /orders failed with 500 after clicking 'Place Order'"` |
| Runtime error, no network | `medium` | `"TypeError suggests undefined/null data — the response or upstream value was likely missing"` |
| Click only / fallback | `low` | `"Click on 'Submit' did not trigger any observable effect"` |

### `formatRootCauseLine(rc): string`

Renders a `RootCauseHint` as the shared one-liner used by all exporters:

```
🔍 Possible Cause (high confidence): API POST /orders failed with 500 after clicking 'Place Order'
```

### `generateSmartSummary(report): string`

One-sentence TL;DR. Uses network + error + click + page signals in priority order.

```typescript
import { generateSmartSummary } from "tracebug-sdk";
generateSmartSummary(TraceBug.generateReport()!);
// "API POST /orders failed with 500 when clicking 'Place Order' button on /checkout"
```

### `generateSessionSteps(events): string[]`

Last ~10 user-facing actions as plain-English strings (FIFO). Input events are intentionally skipped to keep the list scannable.

```typescript
import { generateSessionSteps, getAllSessions } from "tracebug-sdk";
const session = getAllSessions().at(-1)!;
generateSessionSteps(session.events);
// [
//   "Clicked 'Cart' link",
//   "Navigated to /checkout",
//   "Selected 'Express shipping' in delivery",
//   "Clicked 'Place Order' button",
// ]
```

### `extractClickedElement(events): ClickedElementSummary | null`

Structured snapshot of the last click before the bug.

```typescript
import { extractClickedElement } from "tracebug-sdk";
extractClickedElement(session.events);
// {
//   tag: "button",
//   text: "Place Order",
//   selector: "#checkout-form > button.primary",
//   id: "place-order",
//   ariaLabel: "Place your order",
//   testId: "checkout-submit",
//   page: "/checkout",
// }
```

---

## User Identification

### `TraceBug.setUser(user)`

Identify the current user. The user is persisted in localStorage and attached to all sessions.

```typescript
TraceBug.setUser({
  id: "user_123",
  email: "dev@example.com",
  name: "Jane Doe",
});
```

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique user identifier |
| `email` | `string` | No | User email |
| `name` | `string` | No | Display name |

Custom fields are also supported: `TraceBug.setUser({ id: "123", plan: "pro", role: "admin" })`.

### `TraceBug.getUser(): TraceBugUser | null`

Get the identified user, or `null` if not set.

### `TraceBug.clearUser()`

Clear the identified user from localStorage.

---

## Bug Flagging

### `TraceBug.markAsBug()`

Flag the current session as a bug. Adds an `isBug: true` property to the session in localStorage.

```typescript
TraceBug.markAsBug();
```

### `TraceBug.getCompactReport(): string | null`

Get a 2-3 sentence Slack-friendly summary of the current session.

```typescript
const summary = TraceBug.getCompactReport();
// "Bug on /vendor — TypeError: Cannot read 'status' after clicking Edit → selecting Inactive → clicking Update. POST /api/vendor/update returned 500. Chrome 121, Windows 11."
```

---

## Plugin System

Register plugins to filter, transform, or enrich events and reports.

### `TraceBug.use(plugin)`

Register a plugin.

```typescript
TraceBug.use({
  name: "my-plugin",
  onEvent: (event) => {
    // Return event to keep, null to filter out
    if (event.type === "console_log") return null;
    return event;
  },
  onReport: (report) => {
    // Enrich the report
    report.title = `[MyApp] ${report.title}`;
    return report;
  },
  onExport: (format, data) => {
    // Transform export output
    return data;
  },
});
```

**Plugin interface:**

| Method | Type | Description |
|--------|------|-------------|
| `name` | `string` | Unique plugin name |
| `onEvent` | `(event) => event \| null` | Filter/transform events before storage. Return `null` to drop. |
| `onReport` | `(report) => report` | Enrich reports before export |
| `onExport` | `(format, data) => data` | Transform export output |
| `onInit` | `() => void` | Called when plugin is registered |
| `onDestroy` | `() => void` | Called when plugin is removed |

### `TraceBug.removePlugin(name)`

Unregister a plugin by name.

### `TraceBug.on(event, callback)`

Subscribe to lifecycle hooks. Returns an unsubscribe function.

```typescript
const unsub = TraceBug.on("error:captured", (error) => {
  console.log("Error caught:", error);
});

// Later: unsub() to stop listening
```

**Available hooks:**

| Hook | Payload | Description |
|------|---------|-------------|
| `session:start` | `sessionId` | New session started |
| `error:captured` | `TraceBugEvent` | Runtime error or unhandled rejection captured |
| `screenshot:taken` | `ScreenshotData` | Screenshot captured |
| `report:generated` | `BugReport` | Report generated |
| `recording:paused` | — | Recording paused |
| `recording:resumed` | — | Recording resumed |
| `annotate:saved` | `ElementAnnotation` | Element annotation saved |
| `draw:saved` | `DrawRegion` | Draw region saved |

---

## CI/CD Helpers

Methods for integrating TraceBug into automated test pipelines.

### `TraceBug.getErrorCount(): number`

Get the number of errors in the current session. Useful for test assertions.

```typescript
// In a Playwright/Cypress test
expect(TraceBug.getErrorCount()).toBe(0);
```

### `TraceBug.exportSessionJSON(): string | null`

Export the current session as a formatted JSON string. Useful for CI artifact uploads.

```typescript
const json = TraceBug.exportSessionJSON();
// Upload as test artifact on failure
```

---

## Standalone Exports

These functions can be imported directly without the TraceBug instance:

```typescript
import {
  getAllSessions,
  clearAllSessions,
  deleteSession,
  generateReproSteps,
  captureEnvironment,
  buildReport,
  // Debugging Assistant (v1.3+)
  generateRootCauseHint,
  formatRootCauseLine,
  generateSmartSummary,
  generateSessionSteps,
  extractClickedElement,
  getNetworkFailures,
  // Report formatters
  generateGitHubIssue,
  generateJiraTicket,
  generatePdfReport,
  downloadPdfAsHtml,
  generateBugTitle,
  generateFlowSummary,
  buildTimeline,
  formatTimelineText,
  captureScreenshot,
  captureRegionScreenshot,
  getScreenshots,
  downloadAllScreenshots,
  startVoiceRecording,
  stopVoiceRecording,
  isVoiceSupported,
  isVoiceRecording,
  getVoiceTranscripts,
  clearVoiceTranscripts,
} from "tracebug-sdk";
```

---

## Types

All types are exported from the package:

```typescript
import type {
  TraceBugConfig,
  TraceBugEvent,
  TraceBugUser,
  StoredSession,
  BugReport,
  Annotation,
  ScreenshotData,
  EnvironmentInfo,
  ElementAnnotation,
  DrawRegion,
  UIAnnotationReport,
  AnnotationIntent,
  VoiceTranscript,
  JiraTicket,
  TraceBugPlugin,
  // Debugging Assistant (v1.3+)
  RootCauseHint,
  ClickedElementSummary,
  NetworkErrorEntry,
  NetworkFailure,
} from "tracebug-sdk";
```

### `BugReport` (updated in v1.3)

```typescript
interface BugReport {
  title: string;
  /** One-sentence TL;DR — generated via generateSmartSummary() */
  summary: string;
  /** 🔍 Possible Cause hint — generated via generateRootCauseHint() */
  rootCause: RootCauseHint;
  /** Last ~10 readable user actions, FIFO */
  sessionSteps: string[];
  /** Structured info about the last click before the bug */
  clickedElement: ClickedElementSummary | null;
  steps: string;
  environment: EnvironmentInfo;
  consoleErrors: { message: string; stack?: string; timestamp: number }[];
  /** networkErrors entries now include an optional response snippet */
  networkErrors: NetworkErrorEntry[];
  annotations: Annotation[];
  screenshots: ScreenshotData[];
  timeline: TimelineEntry[];
  voiceTranscripts: VoiceTranscriptData[];
  session: StoredSession;
  generatedAt: number;
}
```

### `RootCauseHint`

```typescript
interface RootCauseHint {
  hint: string;
  confidence: "high" | "medium" | "low";
}
```

### `NetworkErrorEntry`

```typescript
interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  /** First 200 chars of the response body (failures only). May be omitted. */
  response?: string;
}
```

### `NetworkFailure`

In-memory ring-buffer entry returned by `getNetworkFailures()`.

```typescript
interface NetworkFailure {
  url: string;
  method: string;
  status: number;
  response: string;
  timestamp: number;
}
```

### `ClickedElementSummary`

```typescript
interface ClickedElementSummary {
  tag: string;
  text: string;
  selector?: string;
  id?: string;
  ariaLabel?: string;
  testId?: string;
  page: string;
}
```
