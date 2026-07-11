# Report your first bug in 2 minutes

TraceBug turns "the page is broken" into a single file your developer (or AI agent)
can open and see exactly what happened. Here's the fastest path — pick the one that
matches you.

---

## 🧪 QA / PM / client — use the extension (no code)

1. **Install** the extension from the
   [Chrome Web Store](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj)
   (works in Chrome, Edge, Brave, Opera).
2. Open the site with the bug and click the **TraceBug** icon → **Capture Bug**
   (or press `Ctrl+Shift+B`). Pick "this tab" when the share picker appears.
3. **Reproduce the bug** — click, type, navigate as you normally would. TraceBug
   records the DOM, console, network, and clicks. Clicking a link to another page
   keeps recording.
4. Click **Stop**. The **Quick Bug** modal opens with an auto-filled title,
   summary, root-cause hint, and an interactive replay.
5. Click **Export .html** and send the file (Slack/email/ticket). Your developer
   opens it offline and sees the replay, errors, and network — no back-and-forth.

> Pasting into an AI chat instead? Use **More ▾ → Export for AI (.html)** — a tiny
> text-only report that fits in a chat context.

---

## 👩‍💻 Developer — use the SDK

1. **Install:**
   ```bash
   npm install tracebug-sdk
   ```
2. **Initialize once** (e.g. in your app entry, dev builds only):
   ```ts
   import TraceBug from "tracebug-sdk";
   TraceBug.init({ projectId: "my-app" });
   ```
3. Run your app. A compact toolbar appears on the right edge. Click **⏺ Track
   session** (events-only) or **🔴 Record** (with video) to arm a session.
4. Reproduce the bug, then press `Ctrl+Shift+B` to open the **Quick Bug** modal.
5. **Export .html** to hand off, or **Export HAR** / file a real GitHub / Linear /
   Slack / Jira issue.

### Debug it with an AI agent

The exported `.html` is agent-ready. Point a coding agent (Claude Code, Cursor,
VS Code) at it via the local MCP server — fully offline, nothing uploaded:

```bash
npx -y tracebug mcp --dir <folder-with-the-report>
```

Then ask your agent to `get_bug_report(...)` and fix from the evidence. See
[mcp.md](mcp.md).

---

## What you get in every report

- Interactive **DOM replay** (or screen recording) + screenshots
- **Console** errors + stack traces, **network** requests with failed-response bodies
- Auto-generated **title, summary, reproduction steps, root-cause hint**
- **Environment** (browser, OS, viewport, device) and a redacted storage snapshot

It's one self-contained file. It works offline. Nothing leaves the machine unless
you share it.

**Next:** [getting-started.md](getting-started.md) · [configuration.md](configuration.md) · [ticket-flow.md](ticket-flow.md)
