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

### CLI (auto-detects your framework)

```bash
npx tracebug init
```

### Offline (.tgz)

```bash
cd tracebug-ai && npm pack
# Share the file: tracebug-sdk-1.3.0.tgz
npm install ./tracebug-sdk-1.3.0.tgz
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
| ⚡ | **Quick Bug Capture** — screenshot + auto-filled report + 1-click copy | `Ctrl+Shift+B` |
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

### ⚡ Quick Bug Capture (2 clicks, under 5 seconds)

The fastest way to report a bug. Use it 10 times a day:

1. **Press `Ctrl+Shift+B`** (or click the ⚡ button on the toolbar)
2. A modal opens with:
   - Auto-filled **title** (based on the session / error)
   - Auto-filled **description** with steps to reproduce + environment
   - **Screenshot preview** (with annotations if you have them)
3. Edit the title/description inline if needed
4. Click one of the four copy buttons:
   - **🐙 Copy as GitHub Issue** — Markdown formatted
   - **🎫 Copy as Jira Ticket** — Jira markup
   - **📋 Copy as Plain Text** — for Slack/Teams
   - **⬇ Download Screenshot** — just the PNG
5. Paste into your tool. Screenshot auto-downloads alongside.

The modal also auto-saves your draft as you type, so you never lose work if you accidentally close it.

Programmatic API:
```typescript
await TraceBug.quickCapture();
```

### Full Workflow (manual)

For more control:

1. Use the app normally — TraceBug records everything silently
2. Find a bug
3. Click **Camera** to take a screenshot — it auto-downloads to your system and opens the annotation editor
4. Open the **session panel** (logo button) to see the full timeline
5. Click **GitHub Issue** or **Jira Ticket** to copy a complete bug report

### Saving annotations as a screenshot

1. Annotate elements or draw regions on the page
2. Open the **Annotation List** (list icon in toolbar)
3. Click the green **"Save"** button — captures a screenshot with all annotation badges visible and downloads it

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

## User Identification

Track which user encountered a bug:

```typescript
TraceBug.setUser({ id: "user_123", email: "dev@example.com", name: "Jane" });
```

The user is persisted across page loads and attached to all sessions.

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
- [Chrome Extension](chrome-extension.md) — [Install from Chrome Web Store](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj) or use on any website without code
- [Architecture](architecture.md) — How TraceBug works internally

## Uninstall

```bash
npm uninstall tracebug-sdk
```

Then remove the `TraceBug.init()` call from your app.
