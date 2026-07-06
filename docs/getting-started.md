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
# Share the file: tracebug-sdk-1.4.0.tgz
npm install ./tracebug-sdk-1.4.0.tgz
```

## Setup (2 lines of code)

Add this to your app's entry file (e.g., `main.ts`, `App.tsx`, `layout.tsx`):

```typescript
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "my-app" });
```

That's it. A compact toolbar appears on the right edge of the screen. TraceBug starts recording automatically.

## What You'll See

After initialization, a **compact toolbar rail** appears on the right edge of your page:

| Icon | Action | Shortcut |
|------|--------|----------|
| 📷 Camera | **Take screenshot** — added to the current ticket | `Ctrl+Shift+S` |
| ⛶ Region | **Region screenshot** — drag to select an area | — |
| ▶ Record | **Record** video + session — a quick preflight lets you pick *this tab* or *screen / window* and whether to include the microphone | — |
| 📈 Track | **Track session** — events only, no video. Click to start capturing clicks / inputs / navigations / network / console; click again (■) to stop and open the ticket. Screenshots taken while tracking join the same ticket. Tickets file fine with events alone — no media required | — |

Press **`Ctrl+Shift+B`** anywhere to open the **Quick Bug** ticket modal — auto-filled title, editable description, screenshots, the interactive replay scrubber, and one-click export (Open in GitHub · Export .html · plus Linear / Slack / Jira / AI under **More**). A cloud **Share link** button is coming in a future release.

While recording, a floating HUD (top-center) gives you **Stop · Pause · Mic · Screenshot · Pen · Blur**.

> **Annotate & Draw** modes ship in the SDK but aren't on the toolbar — call them programmatically (`TraceBug.activateAnnotateMode()` / `activateDrawMode()`); Draw is also on the recording HUD's ✎ button. See [annotate-and-draw.md](annotate-and-draw.md).

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
2. Find a bug, then press **`Ctrl+Shift+B`** (or click 📷 Screenshot / ▶ Record on the toolbar)
3. Review the auto-filled ticket — title, editable description, screenshots, and the interactive replay
4. Click **Open in GitHub** (or **Export .html**, or pick Jira / Linear / Slack / Fix-with-AI under **More**)

### Annotations in reports

Element annotations and draw regions (added via the API or the recording HUD's ✎ **Pen**) are captured into screenshots and baked into the exported report and the replay timeline automatically — there's no separate "save" step. To grab a clean annotated frame, take a screenshot while the badges are visible.

### Annotating UI issues (programmatic)

These modes ship in the SDK but are no longer on the toolbar — activate them from your own code (see [annotate-and-draw.md](annotate-and-draw.md)).

1. Call `TraceBug.activateAnnotateMode()` to enter **Annotate mode**
2. Click any element — a feedback form appears
3. Choose intent (Bug Fix / Redesign / Remove / Question), priority, and describe the issue
4. Save — a numbered badge appears on the element
5. Press `Esc` or call `TraceBug.deactivateAnnotateMode()` to leave

### Drawing layout regions

1. Call `TraceBug.activateDrawMode()` — or click the ✎ **Pen** on the recording HUD while recording
2. Drag to draw rectangles or ellipses marking spacing/layout issues
3. Add a comment for each region
4. Press `Esc` to exit

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
- [Ticket Flow](ticket-flow.md) — Start → capture → stop → review → export, with all options
- [Freemium Plan](freemium.md) — What's free vs premium, gates, dev toggle
- [Annotate & Draw](annotate-and-draw.md) — UI annotation features
- [Chrome Extension](chrome-extension.md) — [Install from Chrome Web Store](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj) or use on any website without code
- [Architecture](architecture.md) — How TraceBug works internally

## Uninstall

```bash
npm uninstall tracebug-sdk
```

Then remove the `TraceBug.init()` call from your app.
