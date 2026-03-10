# TraceBug SDK

One-stop bug reproduction tool for QA testers and developers. Records user sessions, captures screenshots, and auto-generates developer-ready bug reports — all in the browser.

**Minimum effort from tester. Maximum debugging output for developer.**

No servers. No databases. No API keys. Just `npm install` and go.

**Works with any frontend framework**: React, Angular, Vue, Next.js, Nuxt, Vite, Svelte, SvelteKit, Remix, Astro, or plain HTML.

## What TraceBug Does

```
Tester uses the app normally
  ↓
SDK silently captures: clicks, inputs, navigation, API calls, errors, environment
  ↓
Tester finds a bug → clicks 📸 Screenshot → adds a note ("Expected X, got Y")
  ↓
Clicks "GitHub Issue" or "Jira Ticket"
  ↓
Complete bug report copied to clipboard:
  - Auto-generated title
  - Steps to reproduce
  - Screenshots
  - Console errors + stack traces
  - Failed network requests
  - Environment (browser, OS, viewport)
  - Full session timeline
  ↓
Paste into GitHub/Jira → Developer has everything. No back-and-forth.
```

## Quick Start (2 lines)

```bash
npm install tracebug-sdk
```

```typescript
import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "my-app" });
```

## Features

### Auto-Captured (Zero Effort)

| What | Details |
|------|---------|
| **Clicks** | Element tag, text, id, className, aria-label, role, data-testid, href, button type |
| **Inputs** | Field name, type, value (sensitive fields auto-redacted), placeholder |
| **Dropdowns** | Selected option text + value, all available options |
| **Form Submits** | Form id, action, method, all field values (passwords redacted) |
| **Navigation** | Route from → to (supports pushState, replaceState, popstate) |
| **API Requests** | URL, method, status code, response time (both `fetch` and `XMLHttpRequest`) |
| **Errors** | Message, stack trace, source file, line, column |
| **Console Errors** | `console.error()` calls |
| **Unhandled Rejections** | Promise rejection reason + stack |
| **Environment** | Browser, OS, viewport, device type, connection, language, timezone |

### QA Tools (One Click)

| Tool | What it does |
|------|-------------|
| **📸 Screenshot** | Captures page screenshot with auto-generated name (e.g., `01_click_add_vendor.png`) |
| **📝 Add Note** | Tester adds Expected/Actual/Severity — becomes part of the bug report |
| **🐙 GitHub Issue** | Generates complete GitHub issue markdown — copies to clipboard |
| **🎫 Jira Ticket** | Generates Jira-compatible ticket with priority, labels, description |
| **📄 PDF Report** | Opens printable bug report — save as PDF from browser |

### Auto-Generated

| Output | Details |
|--------|---------|
| **Bug Title** | Smart title from session context (e.g., "Vendor Update Fails — TypeError") |
| **Repro Steps** | Numbered steps generated from event timeline |
| **Session Timeline** | Debug timeline with elapsed timestamps for every event |
| **Environment Snapshot** | Browser version, OS, viewport, device type, connection |

## Installation

### From npm

```bash
npm install tracebug-sdk
```

### From GitHub

```bash
npm install github:prashantsinghmangat/tracebug-ai
```

## Configuration

```typescript
TraceBug.init({
  projectId: "my-app",        // Required: identifies your app
  maxEvents: 200,             // Max events per session (default 200)
  maxSessions: 50,            // Max sessions in localStorage (default 50)
  enableDashboard: true,      // Show the floating bug button (default true)
  enabled: "auto",            // Control when SDK is active (see below)
});
```

### `enabled` option

| Value | Behavior |
|-------|----------|
| `"auto"` | Enabled in dev/staging, disabled in production (default) |
| `"development"` | Only when `NODE_ENV` is `"development"` |
| `"staging"` | Dev + staging hosts (`staging`, `stg`, `uat`, `qa` in hostname) |
| `"all"` | Always enabled, including production |
| `"off"` | Completely disabled |
| `string[]` | Custom hostnames, e.g. `["localhost", "staging.myapp.com"]` |

## Programmatic API

### Core

```typescript
import TraceBug from "tracebug-sdk";

TraceBug.pauseRecording();
TraceBug.resumeRecording();
TraceBug.isRecording();
TraceBug.getSessionId();
TraceBug.destroy();
```

### Screenshots

```typescript
// Capture screenshot (auto-named from last event context)
const screenshot = await TraceBug.takeScreenshot();
// → { filename: "01_click_add_vendor.png", dataUrl: "data:image/png;...", ... }

const allScreenshots = TraceBug.getScreenshots();
```

### Tester Notes

```typescript
TraceBug.addNote({
  text: "Button doesn't respond after selecting Inactive status",
  expected: "Vendor should update successfully",
  actual: "App throws TypeError and freezes",
  severity: "critical",  // "critical" | "major" | "minor" | "info"
});
```

### Reports

```typescript
// Generate complete bug report object
const report = TraceBug.generateReport();

// Get auto-generated bug title
const title = TraceBug.getBugTitle();
// → "Vendor Update Fails — TypeError"

// Get GitHub issue markdown (copies to clipboard in dashboard)
const markdown = TraceBug.getGitHubIssue();

// Get Jira ticket payload
const ticket = TraceBug.getJiraTicket();
// → { summary, description, environment, priority, labels }

// Download PDF report
TraceBug.downloadPdf();

// Get environment info
const env = TraceBug.getEnvironment();
// → { browser: "Chrome", browserVersion: "122", os: "Windows 10/11", ... }
```

### Data Access

```typescript
import { getAllSessions, clearAllSessions, deleteSession } from "tracebug-sdk";

const sessions = getAllSessions();
const bugs = sessions.filter(s => s.errorMessage);
clearAllSessions();
deleteSession("session-id");
```

### Standalone Utilities

```typescript
import {
  generateReproSteps,
  captureEnvironment,
  buildReport,
  generateGitHubIssue,
  generateJiraTicket,
  generateBugTitle,
  buildTimeline,
  formatTimelineText,
} from "tracebug-sdk";
```

## Dashboard

The in-browser dashboard includes:

- **Session list** with error/healthy indicators and "Repro Ready" badges
- **QA Toolbar**: Screenshot, Add Note, GitHub Issue, Jira Ticket, PDF Report
- **Session Overview**: duration, events, pages, API calls
- **Problems Detected**: critical / warning / info severity
- **Error Details**: type classification + stack trace
- **Performance Insights**: avg/slowest response, success rate, per-API breakdown
- **Tester Notes**: all annotations with Expected/Actual/Severity
- **Screenshots Gallery**: all captured screenshots with filenames
- **Environment Info**: browser, OS, viewport, device type
- **Event Timeline**: color-coded, time-gapped, rich event details
- **Reproduction Steps**: auto-generated with copy button
- **Export**: JSON, Text, HTML, PDF, GitHub Issue, Jira Ticket

## Privacy

- Sensitive fields auto-redacted (`password`, `secret`, `token`, `ssn`, `credit`)
- All data stays in `localStorage` — nothing leaves the browser
- SDK never captures its own UI interactions

## Framework Compatibility

| Format | File | Works with |
|--------|------|------------|
| ESM (`import`) | `dist/index.js` | Vite, Next.js, Nuxt, SvelteKit, modern webpack |
| CJS (`require`) | `dist/index.cjs` | Angular CLI, older webpack, Node.js |
| TypeScript | `dist/index.d.ts` | Full type support in both modes |

## Uninstall

```bash
npm uninstall tracebug-sdk
```

Then remove the `TraceBug.init()` call from your app's entry file.

## License

MIT
