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
├── types.ts               # All TypeScript interfaces
├── collectors.ts          # Event collectors with self-filtering + console capture
├── storage.ts             # localStorage persistence with batched writes
├── repro-generator.ts     # Generates human-readable reproduction steps
├── dashboard.ts           # In-browser panel UI (vanilla DOM, tabbed layout)
├── compact-toolbar.ts     # Configurable toolbar (position, drag, mobile FAB)
├── element-annotate.ts    # Element-level annotation mode
├── draw-mode.ts           # Rectangle/ellipse drawing on live page
├── annotation-store.ts    # In-memory annotation store with export
├── theme.ts               # CSS custom property design tokens (dark/light/auto)
├── onboarding.ts          # First-run tooltip tour + help button replay
├── plugin-system.ts       # Plugin API + event hook system
├── environment.ts         # Browser/OS/viewport detection
├── screenshot.ts          # html2canvas capture + auto-naming
├── voice-recorder.ts      # Web Speech API speech-to-text
├── title-generator.ts     # Auto bug title + flow summary
├── timeline-builder.ts    # Event timeline with elapsed timestamps
├── report-builder.ts      # BugReport assembly from all data sources
├── github-issue.ts        # GitHub issue markdown generator
├── jira-issue.ts          # Jira ticket generator
└── pdf-generator.ts       # Print-optimized HTML report
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

## Storage Design

### localStorage (persistent)

| Key | Description |
|-----|-------------|
| `tracebug_sessions` | JSON array of `StoredSession` objects |
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
