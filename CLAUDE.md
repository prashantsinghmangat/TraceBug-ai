# TraceBug AI - Project Context

## What is this?
Zero-backend, browser-only SDK that records user sessions and auto-generates bug reproduction steps. All data stays in localStorage. No servers, no API keys, no external dependencies.

Works with **any frontend framework**: React, Angular, Vue, Next.js, Nuxt, Vite, Svelte, Remix, Astro, plain HTML — anything that runs in a browser.

## How It Works
1. User interacts with the app (clicks, types, navigates, triggers API calls)
2. SDK silently captures all events into localStorage (grouped by session)
3. Each page load creates a new session automatically
4. When an error occurs, reproduction steps are generated instantly in-browser
5. Developer clicks the floating bug button to view the full session report
6. Reports can be downloaded as JSON, text, or standalone HTML files

## Project Structure
```
tracebug-ai/
├── src/                       # SDK source (published as "tracebug-sdk")
│   ├── index.ts               # Entry point — TraceBug.init(), pause/resume, destroy
│   ├── types.ts               # TypeScript interfaces (TraceBugConfig, TraceBugEvent, StoredSession, EventType)
│   ├── collectors.ts          # Event collectors with SDK self-filtering (isTraceBugElement)
│   ├── storage.ts             # localStorage persistence — new session per page load
│   ├── repro-generator.ts     # Generates human-readable reproduction steps from events
│   └── dashboard.ts           # In-browser slide-out panel (vanilla DOM, !important CSS, appended to <html>)
├── example-app/               # Demo Next.js 14 app with deliberate bug
│   └── app/
│       ├── tracebug-init.tsx   # Inlined SDK copy for self-contained demo (MUST stay in sync with src/)
│       ├── layout.tsx
│       ├── page.tsx            # Home page with links
│       └── vendor/page.tsx     # Demo page with intentional TypeError bug
├── package.json               # SDK config — dual CJS/ESM, conditional exports
├── tsconfig.json              # TypeScript config (target ES2018, module ES2020)
├── tsup.config.ts             # tsup bundler config — produces dist/index.js + dist/index.cjs + .d.ts
└── dist/                      # Built output (gitignored, auto-built via prepare script)
    ├── index.js               # ESM output (Vite, Next.js, modern bundlers)
    ├── index.cjs              # CJS output (Angular CLI, older webpack, Node require())
    ├── index.d.ts             # TypeScript declarations (ESM)
    └── index.d.cts            # TypeScript declarations (CJS)
```

## Key Architecture Decisions

### Dual CJS/ESM Output
- Built with `tsup` (not raw `tsc`) to produce both `index.js` (ESM) and `index.cjs` (CJS)
- `package.json` uses conditional `exports` field so bundlers pick the right format automatically
- `"type": "module"` in package.json, `main` points to CJS, `module` points to ESM

### Dashboard Z-Index Strategy
- Dashboard button and panel use `z-index: 2147483647 !important` (max 32-bit int)
- All styles injected via a `<style>` tag with `!important` rules — cannot be overridden by app CSS
- Root container `#tracebug-root` appended to `document.documentElement` (`<html>`) not `<body>` — escapes all body stacking contexts
- `isolation: isolate` on root creates its own stacking context
- `pointer-events: none` on root with `pointer-events: auto` on children — doesn't block page interaction
- When panel opens, bug button slides left (`right: 484px`) to stay visible outside the panel

### Session Management
- New session ID generated on **every page load** (no sessionStorage caching)
- Sessions stored in localStorage under key `tracebug_sessions`
- Sessions capped at 50, events at 200 per session
- Old sessions auto-pruned when limit exceeded

### SDK Self-Filtering
- All collectors check `isTraceBugElement()` before emitting events
- Clicks/inputs on `#tracebug-dashboard-btn`, `#tracebug-dashboard-panel`, or any child are ignored
- SDK's own dashboard interactions never appear in the event timeline

## Event Types Captured

| Type | What it captures |
|------|-----------------|
| `click` | tag, text, id, className, aria-label, role, data-testid, href (links), button type, form context |
| `input` | field name, type, actual value (sensitive fields auto-redacted), placeholder, checked state (checkbox/radio) |
| `select_change` | selected option text + value, all available options, field name |
| `form_submit` | form id, action, method, all field names + values (passwords redacted) |
| `route_change` | from path → to path |
| `api_request` | URL, method, status code, duration in ms |
| `error` | message, stack trace, source file, line, column |
| `console_error` | console.error() arguments joined |
| `unhandled_rejection` | promise rejection reason + stack |

## Dashboard Features
- **Session list** with red/green dot indicators (error/healthy) and "Repro Ready" badges
- **Recording toggle** — pause/resume button with live green/red indicator dot
- **Session detail view**:
  - Session Overview card (duration, events, pages, API calls, error status)
  - Problems Detected panel (critical/warning/info severity with counts)
  - Error Details with type classification (TypeError, ReferenceError, etc.) and stack trace parsing
  - Performance insights (avg/slowest response time, success %, per-API breakdown with bars)
  - Rich event timeline with time gap indicators, color-coded icons, inline values
  - Reproduction Steps section with copy button
- **Download reports**: JSON (raw data), Text (human-readable), HTML (standalone visual report)
- **Copy Full Report** to clipboard
- Event types color-coded: clicks (blue), inputs (purple), selects (green), forms (orange), navigation (cyan), API (yellow), errors (red)

## Build & Run
```bash
# Build SDK (produces both CJS + ESM)
cd tracebug-ai && npm install && npm run build

# Run example app
cd example-app && npm install && npm run dev
# Open http://localhost:3000
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
# Share tracebug-sdk-1.0.0.tgz
npm install ./tracebug-sdk-1.0.0.tgz
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

// Access session data
const sessions = getAllSessions();
const bugs = sessions.filter(s => s.errorMessage);
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
- **Dual code**: `src/dashboard.ts` and `example-app/app/tracebug-init.tsx` contain duplicate dashboard logic. Changes to the dashboard must be applied to BOTH files.
- **No runtime deps**: SDK has zero runtime dependencies. Only devDeps are `typescript` and `tsup`.
- **Privacy**: Sensitive fields (password, credit card, SSN, tokens) are auto-redacted as `[REDACTED]`.
- **Build tool**: `tsup` (not raw `tsc`) — configured in `tsup.config.ts`.
- **Prepare script**: `npm pack` and `npm install` from GitHub both trigger `tsup` build automatically.

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
