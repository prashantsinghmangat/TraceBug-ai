# Getting Started

TraceBug is a zero-backend, browser-only QA tool that records user sessions and auto-generates developer-ready bug reports. No servers, no API keys — just install and go.

## Install

### npm

```bash
npm install tracebug-sdk
```

### GitHub (latest)

```bash
npm install github:prashantsinghmangat/tracebug-ai
```

### Offline (.tgz)

```bash
cd tracebug-ai && npm pack
# Share the file: tracebug-sdk-1.1.1.tgz
npm install ./tracebug-sdk-1.1.1.tgz
```

## Setup (2 lines of code)

Add this to your app's entry file (e.g., `main.ts`, `App.tsx`, `layout.tsx`):

```typescript
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "my-app" });
```

That's it. A compact toolbar appears on the right edge of the screen. TraceBug starts recording automatically.

## What You'll See

After initialization, a **vertical toolbar rail** appears on the right edge of your page with these buttons (top to bottom):

| Icon | Action | Shortcut |
|------|--------|----------|
| Logo | Open session panel (bug reports, timeline, export) | — |
| Crosshair | Annotate mode — click elements to attach feedback | `Ctrl+Shift+A` |
| Grid | Draw mode — drag rectangles/ellipses on the page | `Ctrl+Shift+D` |
| Camera | Take screenshot | `Ctrl+Shift+S` |
| List | View all annotations | — |
| Gear | Settings (pause recording, clear data) | — |
| ? | Help — replay the onboarding tour | — |

**First-run tour:** On first use, a 4-step tooltip sequence walks you through the toolbar. Click "?" to replay it anytime.

**Toolbar position:** The toolbar defaults to the right edge, but you can change it:

```typescript
TraceBug.init({ projectId: "my-app", toolbarPosition: "left" });
```

You can also **drag** the toolbar anywhere on screen — the position is remembered.

**Themes:** TraceBug supports dark (default), light, and auto (follows system preference):

```typescript
TraceBug.init({ projectId: "my-app", theme: "auto" });
```

**Mobile:** On viewports < 768px, the toolbar collapses to a single floating button. Tap to expand. The session panel becomes a full-width bottom sheet.

## Quick Workflow

### Finding and reporting a bug

1. Use the app normally — TraceBug records everything silently
2. Find a bug
3. Click **Camera** to take a screenshot (annotation editor opens)
4. Open the **session panel** (logo button) to see the full timeline
5. Click **GitHub Issue** or **Jira Ticket** to copy a complete bug report

### Annotating UI issues

1. Press `Ctrl+Shift+A` to enter **Annotate mode**
2. Click any element — a feedback form appears
3. Choose intent (Bug Fix / Redesign / Remove / Question), priority, and describe the issue
4. Save — a numbered badge appears on the element
5. Press `Esc` or click **Exit** to leave annotate mode

### Drawing layout regions

1. Press `Ctrl+Shift+D` to enter **Draw mode**
2. Drag to draw rectangles or ellipses marking spacing/layout issues
3. Add a comment for each region
4. Click **Done** or press `Esc` to exit

## Framework Compatibility

TraceBug works with any frontend framework that runs in a browser:

- React / Next.js / Remix
- Vue / Nuxt
- Angular
- Svelte / SvelteKit
- Astro
- Vite (any framework)
- Plain HTML/JS

## Plugins

Extend TraceBug without forking:

```typescript
TraceBug.use({
  name: "slack-webhook",
  onReport: (report) => {
    fetch("https://hooks.slack.com/...", {
      method: "POST",
      body: JSON.stringify({ text: report.title }),
    });
    return report;
  },
});
```

## Hooks

Subscribe to lifecycle events:

```typescript
TraceBug.on("error:captured", (error) => {
  console.log("Bug found:", error.data.error.message);
});
```

## CI/CD Integration

Use TraceBug in headless mode for automated testing:

```typescript
TraceBug.init({ projectId: "my-app", enableDashboard: false, enabled: "all" });

// After test:
expect(TraceBug.getErrorCount()).toBe(0);

// Upload session data as artifact on failure:
const json = TraceBug.exportSessionJSON();
```

## Next Steps

- [Configuration](configuration.md) — All config options (theme, position, console capture)
- [API Reference](api-reference.md) — Full programmatic API (plugins, hooks, CI helpers)
- [Bug Reporting](bug-reporting.md) — Screenshots, notes, voice, export
- [Annotate & Draw](annotate-and-draw.md) — UI annotation features
- [Chrome Extension](chrome-extension.md) — Use on any website without code
- [Architecture](architecture.md) — How TraceBug works internally

## Uninstall

```bash
npm uninstall tracebug-sdk
```

Then remove the `TraceBug.init()` call from your app.
