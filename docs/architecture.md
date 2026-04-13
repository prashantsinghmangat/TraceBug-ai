# Architecture

Technical overview of how TraceBug works internally.

## Build System

TraceBug uses [tsup](https://tsup.egoist.dev/) (powered by esbuild) to produce three outputs from a single build command:

```bash
npm run build
```

| Output | Format | Location | Purpose |
|--------|--------|----------|---------|
| ESM | `dist/index.js` | npm package (import) | Modern bundlers (Vite, webpack 5+) |
| CJS | `dist/index.cjs` | npm package (require) | Node.js, older bundlers |
| IIFE | `tracebug-extension/tracebug-sdk.js` | Chrome Extension | `window.TraceBug` global |
| CLI | `dist/bin.mjs` | `npx tracebug` | CLI tool for project setup |
| DTS | `dist/index.d.ts` / `dist/index.d.cts` | TypeScript types | IDE autocompletion |

The IIFE build includes a footer script that exposes `window.TraceBug` with a `__TRACEBUG_LOADED__` guard to prevent double loading.

### Build Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run build` | `tsup` | Build all outputs (npm + extension) |
| `npm run build:all` | `tsup` + status | Build + print output summary |
| `npm run build:example` | `tsup` + example install | Build + update example app |
| `npm run dev` | `tsup --watch` | Watch mode for development |
| `npm run prepare` | `tsup` | Auto-build on `npm install` / `npm pack` |

### Configuration

Build config is in `tsup.config.ts`:

```typescript
export default defineConfig([
  // npm package: CJS + ESM + TypeScript declarations
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
  },
  // CLI tool: ESM with shebang
  {
    entry: { bin: "cli/bin.ts" },
    format: ["esm"],
    platform: "node",
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
  },
  // Chrome Extension: IIFE bundle
  {
    entry: { "tracebug-sdk": "src/index.ts" },
    format: ["iife"],
    globalName: "TraceBugModule",
    outDir: "tracebug-extension",
  },
]);
```

## Source File Map

```
src/
├── index.ts               # Entry — TraceBugSDK class, public API, exports
├── types.ts               # All TypeScript interfaces (TraceBugConfig, TraceBugUser, etc.)
├── collectors.ts          # Event collectors with self-filtering + console capture
├── storage.ts             # localStorage persistence with batched writes
├── repro-generator.ts     # Generates human-readable reproduction steps
├── dashboard.ts           # In-browser panel UI orchestrator (imports from ui/)
├── compact-toolbar.ts     # Configurable toolbar (position, drag, mobile FAB)
├── element-annotate.ts    # Element-level annotation mode + clickable badge popovers
├── draw-mode.ts           # Rectangle/ellipse drawing on live page
├── annotation-store.ts    # In-memory annotation store with export
├── theme.ts               # CSS custom property design tokens (dark/light/auto)
├── onboarding.ts          # First-run tooltip tour + help button replay
├── plugin-system.ts       # Plugin API + event hook system
├── environment.ts         # Browser/OS/viewport detection
├── screenshot.ts          # html2canvas + extension captureVisibleTab + auto-download
├── voice-recorder.ts      # Web Speech API speech-to-text
├── title-generator.ts     # Auto bug title + flow summary
├── timeline-builder.ts    # Event timeline with elapsed timestamps
├── report-builder.ts      # BugReport assembly from all data sources
├── github-issue.ts        # GitHub issue markdown generator
├── jira-issue.ts          # Jira ticket generator
├── pdf-generator.ts       # Print-optimized HTML report
└── ui/                    # Extracted dashboard UI modules
    ├── index.ts           # Barrel export
    ├── helpers.ts         # Shared utilities (formatDuration, escapeHtml, etc.)
    └── toast.ts           # Toast notification system

cli/
└── bin.ts                 # CLI tool source (compiled to dist/bin.mjs)
```

## Data Flow

```
User interacts with page
  ↓
Event collectors (collectors.ts) capture clicks, inputs, API calls, errors, console
  ↓
Self-filtering: isTraceBugElement() checks → skip our own UI events
  ↓
Emit function creates TraceBugEvent objects
  ↓
Plugin system: runEventPlugins() — plugins can filter/transform events
  ↓
Batched writes to localStorage (storage.ts, 1s flush interval)
  ↓
Hook system: emitHook("error:captured", event) notifies subscribers
  ↓
On error: auto-generate reproduction steps (repro-generator.ts)
  ↓
Dashboard reads from localStorage to render session list/detail (tabbed view)
  ↓
User exports: GitHub Issue / Jira Ticket / PDF / JSON / Text
```

## Chrome Extension Architecture

```
Popup (popup.html/js)
  ↓ chrome.runtime.sendMessage
Background Service Worker (background.js)
  ↓ chrome.tabs.sendMessage
Content Script (content-script.js) — extension context on page
  ↓ CustomEvent dispatch
Page Context (tracebug-init.js + tracebug-sdk.js) — MAIN world
  ↓ TraceBug SDK methods
```

**CSP-Safe Injection:** Uses `chrome.scripting.executeScript({ world: "MAIN" })` — no `<script>` tags, no CSP violations.

**Injection Guard:** `injectedTabs` Set in background + `__TRACEBUG_INITIALIZED__` flag in page context prevents duplicate injection.

## Dashboard UI Architecture

### Theme System (theme.ts)

CSS custom property design tokens injected into `#tracebug-root`:
- 45+ design tokens (`--tb-bg-primary`, `--tb-accent`, `--tb-error`, etc.)
- Two built-in themes: dark (navy tones) and light
- Auto mode follows `prefers-color-scheme` with live `MediaQueryList` listener
- All components use `var(--tb-token, fallback)` pattern for backward compatibility

### Compact Toolbar (compact-toolbar.ts)

Configurable toolbar with 7 icon buttons:
- Logo (open session panel)
- Annotate mode toggle
- Draw mode toggle
- Screenshot capture
- Annotation list
- Settings pop-out card
- Help (replay onboarding tour)

**Position:** Configurable via `toolbarPosition` — right, left, bottom-right, bottom-left.

**Drag:** Users can drag the toolbar anywhere. Position persisted in `tracebug_toolbar_pos` localStorage key.

**Mobile (< 768px):** Collapses to a single FAB. Touch-drag supported.

### Onboarding (onboarding.ts)

4-step tooltip tour shown once on first use:
1. Welcome — "TraceBug is recording"
2. Screenshot — "Screenshot anything suspicious"
3. Annotate — "Click elements to annotate"
4. Panel — "Open here to see sessions"

Completion stored in `tracebug_onboarding_complete` localStorage key. Replayed via "?" button.

### Session Panel (dashboard.ts)

470px slide-out panel (full-width bottom sheet on mobile):
- **Session list view** — search bar + filter dropdown, auto-named session cards with preview
- **Session detail view** — tabbed layout:
  - **Overview** tab: QA toolbar, session overview card, problems, performance, repro steps, notes, screenshots, environment
  - **Timeline** tab: chronological events with time gaps, color-coded icons
  - **Errors** tab: error details, stack traces (only shown if errors exist)
  - **Export** tab: GitHub Issue, Jira Ticket, PDF, JSON, Text, Copy Report, Delete
- **Sticky header** with auto-generated bug title + severity badge
- Annotation list view
- Note dialog / Voice dialog overlays

### Plugin System (plugin-system.ts)

- Plugin registration with `onEvent`, `onReport`, `onExport`, `onInit`, `onDestroy` hooks
- Event hooks (`session:start`, `error:captured`, etc.) with subscribe/unsubscribe pattern
- Plugins run in registration order; `onEvent` returning `null` drops the event

### Z-Index Strategy

All TraceBug UI uses `z-index: 2147483647` (max 32-bit signed int):
- Root container on `<html>` (not `<body>`) to escape stacking contexts
- `isolation: isolate` creates its own stacking context
- `pointer-events: none` on root, `auto` on children
- All styles injected via `<style>` tag with `!important` rules

## Self-Filtering

TraceBug must never capture its own events. Three-tier detection:

1. **Direct ID checks:** `#tracebug-root`, `#tracebug-dashboard-panel`, `#tracebug-compact-toolbar`
2. **Attribute checks:** `data-tracebug`, class names containing `tracebug-` or `bt-`
3. **DOM ancestry walk:** If any ancestor is `#tracebug-root`, skip the event

Applied to all collectors: clicks, inputs, selects, form submits.

## Error Boundary

TraceBug must never crash the host application. Every entry point is wrapped in try/catch:

- **`init()` body** — wrapped entirely; on failure, logs warning and returns silently
- **`emit()` function** — each event emission wrapped; failures never propagate to the collector
- **All collector handlers** — clicks, inputs, selects, forms, route changes wrapped individually
- **Fetch/XHR wrappers** — tracking code in inner try/catch; the original `fetch()` or `XMLHttpRequest.send()` is **always** called even if tracking throws
- **Dashboard mount** — wrapped; if UI fails to render, the page still works
- **Theme injection** — wrapped independently

### Config Validation

`init()` performs runtime checks before proceeding:
- `projectId` must be a non-empty string
- `maxEvents` and `maxSessions` must be positive numbers (fallback to defaults if invalid)
- Missing config object or missing `projectId` triggers `console.warn` and early return

## Extension Screenshot

In the Chrome Extension context, `html2canvas` fails due to CORS restrictions on cross-origin resources. The SDK detects the extension context via `__TRACEBUG_INITIALIZED__` flag and uses a message bridge instead:

```
SDK toolbar click → detects extension context
  → dispatches "tracebug-request-screenshot" (page event)
  → content-script.js picks up the event
  → sends "CAPTURE_SCREENSHOT" to background.js
  → background calls chrome.tabs.captureVisibleTab()
  → result sent back via "tracebug-ext-screenshot-result" event
  → SDK receives real PNG dataUrl
```

## Storage Design

### localStorage (persistent)

| Key | Description |
|-----|-------------|
| `tracebug_sessions` | JSON array of `StoredSession` objects |
| `tracebug_user` | JSON object with user identification (`setUser()`) |
| `tracebug_onboarding_complete` | `"true"` when onboarding tour completed |
| `tracebug_toolbar_pos` | `{ x, y }` drag position (if user moved toolbar) |

- **Batched writes:** Events buffer for 1 second before flushing to localStorage
- **Quota handling:** If localStorage is full, oldest session is dropped and retry once
- **Flush on unload:** `beforeunload` event triggers immediate flush

### In-memory (session-scoped)

| Data | Module | Reason |
|------|--------|--------|
| Screenshots (base64) | screenshot.ts | Too large for localStorage quota |
| Voice transcripts | voice-recorder.ts | Transient, included in reports when generated |
| Element annotations | annotation-store.ts | Lightweight, fresh per session |
| Draw regions | annotation-store.ts | Lightweight, fresh per session |
| Network failure buffer (v1.3) | collectors.ts | Last 10 failed requests with response snippets (~2KB) |

### Cache Invalidation Pattern (v1.3)

`storage.ts` keeps a module-scoped cache `_cachedSessions` that absorbs high-frequency event writes and flushes to localStorage on a 1s timer. The cache creates a correctness hazard for destructive operations, so:

- `clearAllSessions()` and `deleteSession()` call `invalidateCache()` **before** writing. This cancels any pending flush and drops the cache, so a scheduled flush cannot resurrect just-cleared data.
- `updateSessionError()`, `addAnnotation()`, and `saveEnvironment()` now read through `getCachedSessions()` and call `scheduleFlush()` — the cache is authoritative for mutations so a pending flush can never overwrite a concurrent write.
- `TraceBug.destroy()` and the "Clear All Data" button in both the dashboard panel and compact toolbar wipe every in-memory store: screenshots, voice, annotations, badges, and the network-failure buffer.

## Debugging Assistant (v1.3)

The v1.3 release adds a deterministic layer on top of captured data that turns "what happened" into "why it likely happened."

### Root Cause Hint Engine

`generateRootCauseHint(report)` runs in `report-builder.ts` after the smart summary, in O(1) on report fields already computed — no event scan, no async.

Three-tier confidence ladder based on signal strength:

```
networkErrors[0]     → HIGH    "API POST /orders failed with 500 after clicking 'Place Order'"
consoleErrors[0]     → MEDIUM  "TypeError suggests undefined/null data — …"
clickedElement only  → LOW     "Click on 'Submit' did not trigger any observable effect"
(no signal)          → LOW     "Not enough signal captured to suggest a likely cause"
```

`suggestCauseFromError()` is an ordered dictionary mapping error message shapes to plain-English causes (`cannot read prop`, `is not a function`, `is not defined`, `maximum call stack`, `unexpected token`, `failed to fetch`, `cors`, `timeout`, `quota`, etc.). No AI APIs.

`formatRootCauseLine(rc)` renders the shared one-liner (`🔍 Possible Cause (X confidence): ...`) consumed by all four exporters so phrasing stays consistent.

### Network Failure Buffer

A FIFO ring buffer capped at 10 entries lives in `collectors.ts`. Exposed via `getNetworkFailures()`.

- **Fetch**: on failed responses (`status >= 400 || status === 0`), the response is `clone()`'d and `clone.text()` runs on a microtask tick. The caller receives the unmodified response immediately; the body is read and buffered afterward. Never awaited on the hot path.
- **XHR**: on `loadend`, `responseText` is read guarded (throws for binary `responseType`). On `error`, an entry with empty body is pushed.
- Snippet is truncated to 200 chars.
- `buildReport()` stitches buffer entries into `networkErrors` by `(method+url+status)` with a ±5s timestamp window, and only considers buffer entries with `timestamp >= session.createdAt` so a cleared session cannot inherit stale failures.

### Smart Summary + Session Steps + Clicked Element

All derived in `report-builder.ts` from existing event data — no extra capture overhead.

- `generateSmartSummary(report)` — priority ladder: `network + click` → `error + click` → `network` → `error` → `click` → fallback
- `generateSessionSteps(events)` — maps click/route/submit/select events to plain-English lines, FIFO capped at 10. Inputs skipped (too noisy).
- `extractClickedElement(events)` — walks the events backwards for the most recent click and returns `{ tag, text, selector, id, ariaLabel, testId, page }`.

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| `html2canvas` | Screenshot capture (bundled, no CDN) |

### Development

| Package | Purpose |
|---------|---------|
| `tsup` | Build tool (esbuild-based) |
| `typescript` | Type checking |

**Total runtime dependencies: 1** (html2canvas). Zero backend dependencies.
