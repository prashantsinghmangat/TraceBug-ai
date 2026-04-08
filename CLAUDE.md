# TraceBug AI - Project Context

## What is TraceBug?
TraceBug is a **one-stop QA testing tool** that records user sessions and auto-generates developer-ready bug reports. It solves the #1 problem in software teams: **testers finding bugs but developers not being able to reproduce them**.

Zero-backend, browser-only. All data stays in localStorage. No servers, no API keys, no external dependencies.

Available as:
- **npm package** (`tracebug-sdk`) — for developers to embed in their apps
- **Chrome Extension** — for non-developers (QA testers, PMs, clients) to use on ANY website

Works with **any frontend framework**: React, Angular, Vue, Next.js, Nuxt, Vite, Svelte, Remix, Astro, plain HTML — anything that runs in a browser.

## The Problem It Solves

```
BEFORE TraceBug:
  Tester: "The page is broken"
  Developer: "What did you click? What browser? Can you reproduce it?"
  Tester: "I don't remember exactly..."
  → 3 days of back-and-forth

AFTER TraceBug:
  Tester finds bug → clicks 🐛 button → gets complete report:
    - Auto-generated reproduction steps
    - Screenshots with annotations
    - Console errors + stack traces
    - Network failures
    - Browser/OS/viewport info
    - Session timeline
    - Voice description of the bug
  → Pastes into Jira/GitHub → Developer has everything. Zero back-and-forth.
```

## How It Works
1. User interacts with the app (clicks, types, navigates, triggers API calls)
2. SDK silently captures all events into localStorage (grouped by session)
3. Each page load creates a new session automatically
4. When an error occurs, reproduction steps are generated instantly in-browser
5. Tester can capture screenshots, add voice descriptions, annotate with notes
6. One-click export to GitHub Issue, Jira Ticket, or PDF report
7. Developer gets a complete, developer-ready bug report with zero effort from the tester

## Feature Overview

### Core Recording
- **Click tracking** — tag, text, id, className, aria-label, role, data-testid, href, button type
- **Input tracking** — field name, type, actual value (sensitive fields auto-redacted), placeholder
- **Select/dropdown tracking** — selected option, all available options, field name
- **Form submission tracking** — form id, action, method, all field values (passwords redacted)
- **Route/navigation tracking** — from path to path
- **API request tracking** — fetch + XMLHttpRequest, URL, method, status, duration
- **Error tracking** — message, stack trace, source file, line, column
- **Console error tracking** — console.error() arguments
- **Unhandled rejection tracking** — promise rejection reason + stack

### QA Tools (Dashboard Toolbar)
- **Screenshots** — capture via html2canvas with smart auto-naming from event context
- **Screenshot Annotation** — draw rectangles, arrows, text overlays on screenshots with color picker
- **Add Note** — tester annotations with Expected/Actual/Severity fields
- **Voice Note** — speech-to-text bug description using Web Speech API (free, no API keys)
- **GitHub Issue** — one-click generates markdown, copies to clipboard, auto-downloads screenshots
- **Jira Ticket** — one-click generates Jira markup, copies to clipboard
- **PDF Report** — print-optimized HTML report, opens browser print dialog

### UI Annotation Tools
- **Element Annotate Mode** — click any element to select it, attach structured feedback (intent, severity, comment). Shift+click for multi-select. Page scroll freezes during annotation. Persistent numbered badges on annotated elements. `Ctrl+Shift+A`
- **Draw Mode** — drag rectangles or ellipses directly on the live page to mark layout/spacing/alignment regions. Each region gets a comment. Full toolbar with shape/color pickers. `Ctrl+Shift+D`
- **Compact Toolbar** — minimal vertical rail on the right edge of the screen (replaced old floating bug button). Contains: logo (session panel), annotate, draw, screenshot, annotation list, settings (pop-out card).
- **Annotation List Panel** — view all element annotations and draw regions in the slide-out panel. Export as Markdown or JSON. Copy to clipboard. Delete individual annotations.
- **Annotation Export** — JSON and Markdown export formats for all annotations

### Smart Features
- **Auto bug title generation** — heuristic-based, e.g. "Vendor Update Fails — TypeError"
- **Auto flow summary** — e.g. "Click 'Edit' → Select 'Inactive' → Click 'Update'"
- **Session timeline** — elapsed timestamps, color-coded event types
- **Environment auto-capture** — browser, OS, viewport, device type, connection type
- **Framework noise filtering** — auto-filters Next.js/Webpack/Vite internal requests
- **Error deduplication** — consecutive identical errors collapsed
- **Privacy** — passwords, credit cards, SSNs, tokens auto-redacted as `[REDACTED]`
- **SDK self-filtering** — TraceBug's own UI interactions never appear in the timeline

### Voice-to-Bug-Report
- Uses **Web Speech API** (SpeechRecognition) — completely free, no paid APIs
- Real-time transcript display with interim results
- Auto-punctuation cleanup (capitalize, add periods, spoken "period"/"comma" converted)
- Continuous mode with auto-restart on browser timeout
- Saved as tester annotation, included in GitHub/Jira/PDF reports
- Works in Chrome, Edge, Brave, Opera (all Chromium browsers)

## Project Structure
```
tracebug-ai/
├── src/                       # SDK source (published as "tracebug-sdk")
│   ├── index.ts               # Entry point — TraceBug class with all public methods
│   ├── types.ts               # TypeScript interfaces (all shared types)
│   ├── collectors.ts          # Event collectors with self-filtering + framework noise filtering
│   ├── storage.ts             # localStorage persistence — sessions, annotations, environment
│   ├── repro-generator.ts     # Generates human-readable reproduction steps from events
│   ├── dashboard.ts           # In-browser slide-out panel with QA toolbar (vanilla DOM)
│   ├── compact-toolbar.ts     # Minimal vertical rail toolbar (replaces old floating button)
│   ├── element-annotate.ts    # Element-level annotation mode with multi-select
│   ├── draw-mode.ts           # Rectangle/ellipse drawing on live page
│   ├── annotation-store.ts    # In-memory annotation store with JSON/Markdown export
│   ├── environment.ts         # Auto-captures browser, OS, viewport, device, connection
│   ├── screenshot.ts          # Screenshot capture with html2canvas + smart auto-naming
│   ├── voice-recorder.ts      # Web Speech API voice-to-text for bug descriptions
│   ├── title-generator.ts     # Auto-generates bug titles and flow summaries
│   ├── timeline-builder.ts    # Builds debug timeline with elapsed timestamps
│   ├── report-builder.ts      # Assembles complete BugReport from all data sources
│   ├── github-issue.ts        # GitHub issue markdown generator
│   ├── jira-issue.ts          # Jira ticket template generator (Jira markup format)
│   └── pdf-generator.ts       # Print-optimized HTML report (save as PDF from browser)
├── tracebug-extension/        # Chrome Extension (Manifest V3)
│   ├── manifest.json          # Extension config — permissions, content scripts
│   ├── background.js          # Service worker — site enable/disable, SDK injection via chrome.scripting API
│   ├── content-script.js      # Bridge between popup/background and page-context SDK
│   ├── tracebug-init.js       # Page-context initializer — SDK init + extension action handlers
│   ├── tracebug-sdk.js        # Auto-built IIFE bundle (from tsup, ~160KB) — DO NOT EDIT MANUALLY
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
├── docs/                      # Documentation
│   ├── getting-started.md     # Install, setup, first use
│   ├── api-reference.md       # Full programmatic API reference
│   ├── configuration.md       # All config options explained
│   ├── bug-reporting.md       # Screenshots, notes, voice, export
│   ├── annotate-and-draw.md   # Element annotation & draw mode
│   ├── chrome-extension.md    # Extension install & usage
│   └── architecture.md        # How TraceBug works internally
└── dist/                      # Built output (gitignored, auto-built via prepare script)
    ├── index.js               # ESM output (~151KB)
    ├── index.cjs              # CJS output (~153KB)
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
- Single `npm run build` command builds ALL outputs (npm + extension)

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
- Checks `#tracebug-root` container, then walks up DOM looking for `id="tracebug-*"`, `id="bt-*"`, `class="tracebug-*"`, `class="bt-ann*"`, `class="bt-voice*"`, or `data-tracebug` attributes
- Annotation canvas has `data-tracebug="annotation-canvas"` attribute
- Voice dialog has `data-tracebug="voice-dialog"` attribute
- SDK's own interactions never appear in the event timeline

### Framework Noise Filtering
- Internal dev-server URLs are auto-filtered from API tracking:
  - Next.js: `__nextjs_original-stack-frame`, `_next/static/webpack`, `_next/webpack-hmr`
  - Webpack: `__webpack_hmr`, `.hot-update.`, `webpack-dev-server`
  - Vite: `__vite_ping`, `@vite/client`, `@react-refresh`
  - General: `sockjs-node`, `turbopack-hmr`

### Voice Recording
- Uses Web Speech API (SpeechRecognition / webkitSpeechRecognition)
- Zero cost — uses browser's built-in speech recognition
- No audio stored — only text transcripts saved in memory
- Auto-restarts on browser timeout (continuous mode)
- Transcript cleaned up: capitalized, punctuated, spoken punctuation converted

## Dashboard Features
- **Session list** with red/green dot indicators (error/healthy) and "Repro Ready" badges
- **Recording toggle** — pause/resume button with live green/red indicator dot
- **QA Toolbar**: Screenshot, Add Note, Voice Note, GitHub Issue, Jira Ticket, PDF Report
- **Session detail view**:
  - Session Overview card (duration, events, pages, API calls, error status)
  - Problems Detected panel (critical/warning/info severity with counts)
  - Error Details with type classification (TypeError, ReferenceError, etc.) and stack trace parsing
  - Performance insights (avg/slowest response time, success %, per-API breakdown with bars)
  - Rich event timeline with time gap indicators, color-coded icons, inline values
  - Reproduction Steps section with copy button
  - Tester Notes display (annotations with severity badges, including voice notes)
  - Screenshots gallery (inline images with filenames)
  - Environment Info grid (browser, OS, viewport, device)
- **Download reports**: JSON, Text, HTML, PDF
- **Copy to clipboard**: Full Report, GitHub Issue, Jira Ticket
- **Screenshot annotation editor**: rectangle highlights, arrows, text overlays, color picker, undo
- Event types color-coded: clicks (blue), inputs (purple), selects (green), forms (orange), navigation (cyan), API (yellow), errors (red)

## Build & Run
```bash
# Build SDK (produces CJS + ESM + IIFE for extension — single command does everything)
cd tracebug-ai && npm install && npm run build

# Run example app
cd example-app && npm install && npm run dev
# Open http://localhost:3000

# Build + update example app in one command
npm run build:example

# Load Chrome Extension
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click Load unpacked → select tracebug-extension/ folder
# 4. After code changes: npm run build → refresh extension in chrome://extensions/
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

// Voice recording
TraceBug.isVoiceSupported();     // boolean — check browser support
TraceBug.startVoiceRecording({   // start speech-to-text
  onUpdate: (text, interim) => console.log(text),
  onStatus: (status, msg) => console.log(status, msg),
});
TraceBug.stopVoiceRecording();   // returns VoiceTranscript
TraceBug.isVoiceRecording();     // boolean
TraceBug.getVoiceTranscripts();  // VoiceTranscript[]

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

// Element Annotate Mode
TraceBug.activateAnnotateMode();
TraceBug.deactivateAnnotateMode();
TraceBug.isAnnotateModeActive();

// Draw Mode
TraceBug.activateDrawMode();
TraceBug.deactivateDrawMode();
TraceBug.isDrawModeActive();

// UI Annotations export
const report = TraceBug.getAnnotationReport();
TraceBug.exportAnnotationsJSON();
TraceBug.exportAnnotationsMarkdown();
await TraceBug.copyAnnotationsToClipboard("markdown");
TraceBug.clearAnnotations();

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
- **No runtime deps**: SDK has one runtime dep (html2canvas). DevDeps are `typescript` and `tsup`.
- **Privacy**: Sensitive fields (password, credit card, SSN, tokens) are auto-redacted as `[REDACTED]`.
- **Build tool**: `tsup` (not raw `tsc`) — configured in `tsup.config.ts` with two build targets.
- **Prepare script**: `npm pack` and `npm install` from GitHub both trigger `tsup` build automatically.
- **Extension SDK**: `tracebug-extension/tracebug-sdk.js` is auto-built by tsup. Do not edit it manually.
- **Screenshots in memory**: Screenshots are stored in memory (not localStorage) to avoid quota issues.
- **Voice transcripts in memory**: Voice transcripts stored in memory, included in reports when generated.
- **Element annotations in memory**: Element annotations and draw regions stored in memory via annotation-store.ts.
- **Compact toolbar replaces old button**: The old 48px floating bug button is replaced by a vertical rail toolbar.
- **Mode banners**: Annotate and Draw modes show a purple gradient banner at the top of the page with instructions and exit controls.
- **Escape key exits modes**: Both annotate and draw modes can be exited with the Escape key.

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
