# TraceBug AI

Zero-backend bug reproduction tool. Install as a dependency, runs entirely in the browser, stores everything in `localStorage`. When an error occurs, it auto-generates human-readable reproduction steps.

No servers. No databases. No API keys. Just `npm install` and go.

**Works with any frontend framework**: React, Angular, Vue, Next.js, Nuxt, Vite, Svelte, SvelteKit, Remix, Astro, or plain HTML.

## How It Works

```
User interacts with your app
  ↓
SDK captures: clicks, inputs, dropdowns, form submits, navigation, API calls, errors
  ↓
Events stored in localStorage (new session per page load)
  ↓
Error occurs → repro steps generated instantly in-browser
  ↓
Developer clicks 🐛 → sees full bug report + timeline
  ↓
Download report as JSON, text, or standalone HTML
```

## Quick Start (2 lines)

```bash
npm install tracebug-sdk
```

```typescript
import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "my-app" });
```

That's it. The SDK will:
- Capture all user interactions automatically
- Store events in `localStorage` (nothing leaves the browser)
- Show a floating 🐛 button in the bottom-right corner
- When an error occurs, generate reproduction steps instantly
- Let developers view the full session timeline in the slide-out panel
- Provide downloadable reports (JSON / text / HTML)

## Installation

### From a .tgz file (offline sharing)

```bash
# The person sharing runs:
npm pack

# The person installing runs:
npm install ./tracebug-sdk-1.0.0.tgz
```

### From GitHub

```bash
npm install github:YOUR_USERNAME/tracebug-ai
```

### From npm (coming soon)

```bash
npm install tracebug-sdk
```

## Configuration

```typescript
TraceBug.init({
  projectId: "my-app",        // Required: identifies your app
  maxEvents: 200,             // Max events per session (default 200)
  maxSessions: 50,            // Max sessions in localStorage (default 50)
  enableDashboard: true,      // Show the 🐛 button (default true)
});
```

## Programmatic API

```typescript
import TraceBug, { getAllSessions, clearAllSessions, deleteSession } from "tracebug-sdk";

// Pause / resume recording
TraceBug.pauseRecording();
TraceBug.resumeRecording();
TraceBug.isRecording();       // → true/false

// Access session data
const sessions = getAllSessions();
const bugs = sessions.filter(s => s.errorMessage);

// Cleanup
clearAllSessions();
deleteSession("session-id");
TraceBug.destroy();            // Removes all listeners + dashboard
```

## What Gets Captured

| Event Type | Details |
|------------|---------|
| **Clicks** | Element tag, text, id, className, aria-label, role, data-testid, href (links), button type |
| **Inputs** | Field name, type, actual value (sensitive fields auto-redacted as `[REDACTED]`), placeholder |
| **Dropdowns** | Selected option text + value, all available options listed |
| **Form Submits** | Form id, action, method, all field values (passwords redacted) |
| **Checkbox/Radio** | Checked/unchecked state |
| **Navigation** | Route from → to |
| **API Requests** | URL, method, status code, response time in ms |
| **Errors** | Message, stack trace, source file, line, column |
| **Console Errors** | `console.error()` calls |
| **Unhandled Rejections** | Promise rejection reason + stack |

### Privacy

Sensitive fields are automatically detected and redacted:
- Password fields (`type="password"`)
- Fields with names containing: `password`, `secret`, `token`, `ssn`, `credit`
- Redacted as `[REDACTED]` — the actual value is never stored

### Self-Filtering

The SDK **never captures its own events**. Clicks on the 🐛 button, interactions inside the dashboard panel — none of these appear in the timeline.

## Dashboard Features

- **Session list** with error/healthy indicators and "Repro Ready" badges
- **Recording toggle** — pause/resume with live indicator
- **Session detail view**:
  - Session Overview (duration, events, pages visited, API calls)
  - Problems Detected panel (critical / warning / info severity)
  - Error Details with type classification (TypeError, ReferenceError, etc.) + stack trace
  - Performance insights (avg/slowest response, success rate, per-API breakdown)
  - Rich event timeline with time gaps, color-coded icons, inline values
  - Auto-generated Reproduction Steps
- **Download reports**:
  - **JSON** — raw session data for developers
  - **Text** — human-readable report with problems, repro steps, timeline
  - **HTML** — standalone visual report (dark theme, opens in any browser)
- **Copy Full Report** to clipboard
- **Always on top** — dashboard uses max z-index with `!important` CSS, cannot be overlapped by app UI
- **Close button** slides outside panel when open, always accessible

## Framework Compatibility

The SDK ships dual format (CJS + ESM) with conditional exports:

| Format | File | Works with |
|--------|------|------------|
| ESM (`import`) | `dist/index.js` | Vite, Next.js, Nuxt, SvelteKit, modern webpack |
| CJS (`require`) | `dist/index.cjs` | Angular CLI, older webpack, Node.js |
| TypeScript | `dist/index.d.ts` | Full type support in both modes |

Bundlers automatically pick the right format via the `exports` field in `package.json`.

## Try the Example App

```bash
cd example-app
npm install
npm run dev
```

Open http://localhost:3000 and:

1. Click **"Go to Vendor Page"**
2. Click **"Edit"**
3. Change Status to **Inactive**
4. Click **"Update"** → triggers TypeError
5. Click the **🐛** button in the bottom-right corner
6. See the auto-generated reproduction steps + event timeline
7. Download the report as JSON, text, or HTML

## Building the SDK

```bash
npm install
npm run build
```

Output goes to `dist/` (both `index.js` and `index.cjs`). The `prepare` script auto-builds when installed from GitHub.

### Local development

```bash
cd tracebug-ai
npm link

cd your-app
npm link tracebug-sdk
```

### Creating a shareable .tgz

```bash
npm pack
# Share tracebug-sdk-1.0.0.tgz with your team
```

## Uninstall

```bash
npm uninstall tracebug-sdk
```

Then remove the `TraceBug.init()` call from your app's entry file.

## Author

Created and coded by **Prashant Singh Mangat**
- GitHub: [github.com/prashantsinghmangat](https://github.com/prashantsinghmangat)
- Repo: [github.com/prashantsinghmangat/TraceBug-ai](https://github.com/prashantsinghmangat/TraceBug-ai)

## License

MIT
