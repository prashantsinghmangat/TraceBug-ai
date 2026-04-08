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

## Recording Control

### `TraceBug.pauseRecording()`

Pause event capture. Events will not be recorded until resumed.

### `TraceBug.resumeRecording()`

Resume recording after a pause.

### `TraceBug.isRecording(): boolean`

Returns `true` if currently recording events.

### `TraceBug.getSessionId(): string | null`

Returns the current session ID, or `null` if not initialized.

---

## Screenshots

### `TraceBug.takeScreenshot(): Promise<ScreenshotData | null>`

Capture a screenshot of the current page using html2canvas. Returns the screenshot data including base64 data URL, filename, and dimensions.

```typescript
const screenshot = await TraceBug.takeScreenshot();
console.log(screenshot?.filename); // "01_click_button.png"
```

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
  generateGitHubIssue,
  generateJiraTicket,
  generatePdfReport,
  downloadPdfAsHtml,
  generateBugTitle,
  generateFlowSummary,
  buildTimeline,
  formatTimelineText,
  captureScreenshot,
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
} from "tracebug-sdk";
```
