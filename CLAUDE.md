# TraceBug AI - Project Context

## What is this?
Zero-backend, browser-only SDK that records user sessions and auto-generates bug reproduction steps. All data stays in localStorage. No servers, no API keys, no external dependencies.

Available as both an **npm package** (for developers) and a **Chrome Extension** (for non-developers).

Works with **any frontend framework**: React, Angular, Vue, Next.js, Nuxt, Vite, Svelte, Remix, Astro, plain HTML — anything that runs in a browser.

## How It Works
1. User interacts with the app (clicks, types, navigates, triggers API calls)
2. SDK silently captures all events into localStorage (grouped by session)
3. Each page load creates a new session automatically
4. When an error occurs, reproduction steps are generated instantly in-browser
5. Developer clicks the floating bug button to view the full session report
6. Reports can be downloaded as JSON, text, standalone HTML, or PDF
7. One-click GitHub issue / Jira ticket generation with copy to clipboard

## Project Structure
```
tracebug-ai/
├── src/                       # SDK source (published as "tracebug-sdk")
│   ├── index.ts               # Entry point — TraceBug.init(), pause/resume, destroy, screenshot, notes, reports
│   ├── types.ts               # TypeScript interfaces (TraceBugConfig, TraceBugEvent, StoredSession, BugReport, Annotation, etc.)
│   ├── collectors.ts          # Event collectors with SDK self-filtering (isTraceBugElement) + framework noise filtering
│   ├── storage.ts             # localStorage persistence — sessions, annotations, environment
│   ├── repro-generator.ts     # Generates human-readable reproduction steps from events
│   ├── dashboard.ts           # In-browser slide-out panel with QA toolbar (vanilla DOM, !important CSS, appended to <html>)
│   ├── environment.ts         # Auto-captures browser, OS, viewport, device, connection info
│   ├── screenshot.ts          # Screenshot capture with smart auto-naming from event context
│   ├── title-generator.ts     # Auto-generates bug titles and flow summaries from session events
│   ├── timeline-builder.ts    # Builds debug timeline with elapsed timestamps
│   ├── report-builder.ts      # Assembles complete BugReport from session data
│   ├── github-issue.ts        # GitHub issue markdown generator
│   ├── jira-issue.ts          # Jira ticket template generator (Jira markup format)
│   └── pdf-generator.ts       # Print-optimized HTML report (save as PDF from browser)
├── tracebug-extension/        # Chrome Extension (Manifest V3)
│   ├── manifest.json          # Extension config — permissions, content scripts, web accessible resources
│   ├── background.js          # Service worker — site enable/disable, SDK injection via chrome.scripting API
│   ├── content-script.js      # Bridge between popup/background and page-context SDK
│   ├── tracebug-init.js       # Page-context initializer — SDK init + extension action handlers
│   ├── tracebug-sdk.js        # Auto-built IIFE bundle (from tsup, ~145KB)
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic — toggle, quick actions, site list
│   ├── styles.css             # Dark-themed popup styles
│   ├── generate-icons.html    # Helper to generate better icons in browser
│   └── icons/                 # Extension icons (16, 48, 128px)
├── example-app/               # Demo Next.js 14 app with deliberate bug
│   └── app/
│       ├── tracebug-init.tsx   # Dynamic import of SDK from npm package
│       ├── layout.tsx
│       ├── page.tsx            # Home page with links
│       └── vendor/page.tsx     # Demo page with intentional TypeError bug
├── package.json               # SDK config — dual CJS/ESM, conditional exports
├── tsconfig.json              # TypeScript config (target ES2018, module ES2020)
├── tsup.config.ts             # tsup bundler config — CJS + ESM + IIFE (extension)
└── dist/                      # Built output (gitignored, auto-built via prepare script)
    ├── index.js               # ESM output
    ├── index.cjs              # CJS output
    ├── index.d.ts             # TypeScript declarations (ESM)
    └── index.d.cts            # TypeScript declarations (CJS)
```

## Key Architecture Decisions

### Triple Build Output (CJS + ESM + IIFE)
- Built with `tsup` configured in `tsup.config.ts` with two build entries
- Entry 1: CJS (`dist/index.cjs`) + ESM (`dist/index.js`) + DTS for npm package
- Entry 2: IIFE (`tracebug-extension/tracebug-sdk.js`) for Chrome Extension
- IIFE build exposes `window.TraceBug` via footer script with `__TRACEBUG_LOADED__` guard
- `package.json` uses conditional `exports` field so bundlers pick the right format

### Chrome Extension Architecture
- **Manifest V3** with `scripting`, `storage`, `tabs`, `activeTab` permissions
- **CSP-safe injection**: Uses `chrome.scripting.executeScript({ world: "MAIN" })` — NOT DOM `<script>` tags. This bypasses page CSP entirely.
- **Per-site toggle**: Enabled sites stored in `chrome.storage.local`
- **Duplicate injection guard**: `injectedTabs` Set in background + `__TRACEBUG_INITIALIZED__` flag in page context
- **Clipboard fallback**: Uses `document.execCommand("copy")` via hidden textarea when `navigator.clipboard` fails (popup steals focus from page)
- **Communication flow**: Popup → Background (chrome.runtime.sendMessage) → Content Script (chrome.tabs.sendMessage) → Page (CustomEvent)

### Dashboard Z-Index Strategy
- Dashboard button and panel use `z-index: 2147483647 !important` (max 32-bit int)
- All styles injected via a `<style>` tag with `!important` rules — cannot be overridden by app CSS
- Root container `#tracebug-root` appended to `document.documentElement` (`<html>`) not `<body>` — escapes all body stacking contexts
- `isolation: isolate` on root creates its own stacking context
- `pointer-events: none` on root with `pointer-events: auto` on children — doesn't block page interaction

### Session Management
- New session ID generated on **every page load** (no sessionStorage caching)
- Sessions stored in localStorage under key `tracebug_sessions`
- Sessions capped at 50, events at 200 per session
- Old sessions auto-pruned when limit exceeded

### SDK Self-Filtering
- All collectors check `isTraceBugElement()` before emitting events
- Checks `#tracebug-root` container, then walks up DOM looking for `id="tracebug-*"`, `class="tracebug-*"`, or `data-tracebug` attributes
- Filters screenshot annotation canvas, save buttons, and all dashboard UI
- SDK's own interactions never appear in the event timeline

### Framework Noise Filtering
- Internal dev-server URLs are auto-filtered from API tracking:
  - Next.js: `__nextjs_original-stack-frame`, `_next/static/webpack`, `_next/webpack-hmr`
  - Webpack: `__webpack_hmr`, `.hot-update.`, `webpack-dev-server`
  - Vite: `__vite_ping`, `@vite/client`, `@react-refresh`
  - General: `sockjs-node`, `turbopack-hmr`

## Event Types Captured

| Type | What it captures |
|------|-----------------|
| `click` | tag, text, id, className, aria-label, role, data-testid, href (links), button type, form context |
| `input` | field name, type, actual value (sensitive fields auto-redacted), placeholder, checked state (checkbox/radio) |
| `select_change` | selected option text + value, all available options, field name |
| `form_submit` | form id, action, method, all field names + values (passwords redacted) |
| `route_change` | from path → to path |
| `api_request` | URL, method, status code, duration in ms (fetch + XMLHttpRequest) |
| `error` | message, stack trace, source file, line, column |
| `console_error` | console.error() arguments joined |
| `unhandled_rejection` | promise rejection reason + stack |

## Dashboard Features
- **Session list** with red/green dot indicators (error/healthy) and "Repro Ready" badges
- **Recording toggle** — pause/resume button with live green/red indicator dot
- **QA Toolbar**: Screenshot, Add Note, GitHub Issue, Jira Ticket, PDF Report
- **Session detail view**:
  - Session Overview card (duration, events, pages, API calls, error status)
  - Problems Detected panel (critical/warning/info severity with counts)
  - Error Details with type classification (TypeError, ReferenceError, etc.) and stack trace parsing
  - Performance insights (avg/slowest response time, success %, per-API breakdown with bars)
  - Rich event timeline with time gap indicators, color-coded icons, inline values
  - Reproduction Steps section with copy button
  - Tester Notes display (annotations with severity badges)
  - Screenshots gallery (inline images with filenames)
  - Environment Info grid (browser, OS, viewport, device)
- **Download reports**: JSON, Text, HTML, PDF
- **Copy to clipboard**: Full Report, GitHub Issue, Jira Ticket
- Event types color-coded: clicks (blue), inputs (purple), selects (green), forms (orange), navigation (cyan), API (yellow), errors (red)

## Build & Run
```bash
# Build SDK (produces CJS + ESM + IIFE for extension)
cd tracebug-ai && npm install && npm run build

# Run example app
cd example-app && npm install && npm run dev
# Open http://localhost:3000

# Load Chrome Extension
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click Load unpacked → select tracebug-extension/ folder
```

## Installation in Any Project

### From npm
```bash
npm install tracebug-sdk
```

### From GitHub
```bash
npm install github:prashantsinghmangat/tracebug-ai
```

### From .tgz (offline sharing)
```bash
cd tracebug-ai && npm pack
# Share tracebug-sdk-1.1.0.tgz
npm install ./tracebug-sdk-1.1.0.tgz
```

### Usage (2 lines of code)
```typescript
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "my-app" });
```

### Programmatic API
```typescript
import TraceBug, { getAllSessions, clearAllSessions, deleteSession } from "tracebug-sdk";

// Pause/resume recording
TraceBug.pauseRecording();
TraceBug.resumeRecording();
TraceBug.isRecording(); // boolean
TraceBug.getSessionId(); // current session ID

// Screenshots
const screenshot = await TraceBug.takeScreenshot();
const allScreenshots = TraceBug.getScreenshots();

// Tester notes
TraceBug.addNote({ text: "...", expected: "...", actual: "...", severity: "critical" });

// Reports
const report = TraceBug.generateReport();
const title = TraceBug.getBugTitle();
const markdown = TraceBug.getGitHubIssue();
const ticket = TraceBug.getJiraTicket();
TraceBug.downloadPdf();
const env = TraceBug.getEnvironment();

// Data access
const sessions = getAllSessions();
clearAllSessions();
deleteSession("session-id");

// Tear down completely
TraceBug.destroy();
```

### Configuration
```typescript
TraceBug.init({
  projectId: "my-app",        // Required: identifies your app
  maxEvents: 200,             // Max events per session (default 200)
  maxSessions: 50,            // Max sessions in localStorage (default 50)
  enableDashboard: true,      // Show the floating bug button (default true)
  enabled: "auto",            // "auto" | "development" | "staging" | "all" | "off" | string[]
});
```

## Key Patterns & Rules
- **example-app/tracebug-init.tsx**: Uses dynamic `import("tracebug-sdk")` — NOT an inlined SDK copy. Requires the built SDK to be installed.
- **No runtime deps**: SDK has zero runtime dependencies. Only devDeps are `typescript` and `tsup`.
- **Privacy**: Sensitive fields (password, credit card, SSN, tokens) are auto-redacted as `[REDACTED]`.
- **Build tool**: `tsup` (not raw `tsc`) — configured in `tsup.config.ts` with two build targets.
- **Prepare script**: `npm pack` and `npm install` from GitHub both trigger `tsup` build automatically.
- **Extension SDK**: `tracebug-extension/tracebug-sdk.js` is auto-built by tsup. Do not edit it manually.
- **Screenshots in memory**: Screenshots are stored in memory (not localStorage) to avoid quota issues.

## Uninstall
```bash
npm uninstall tracebug-sdk
```
Then remove the `TraceBug.init()` call from your app's entry file.

## Testing the Example Bug
1. Go to /vendor
2. Click "Edit"
3. Change Status to "Inactive"
4. Click "Update" → triggers TypeError
5. Click bug button to see report with reproduction steps
