# MCP Server — Let AI Agents Debug Your Bug Reports

TraceBug ships a local [Model Context Protocol](https://modelcontextprotocol.io) server. It exposes your exported bug reports to AI coding agents — **Claude Code, Cursor, Windsurf, VS Code**, or any MCP client — so the agent can read the console errors, network failures, repro steps, and screenshots, find the offending code in your repo, and propose the fix.

```bash
npx tracebug mcp --dir ./bug-reports
```

**Everything stays on your machine.** The server reads the same self-contained `.html` files TraceBug already exports — no account, no cloud, no upload. This is the difference from every other bug-reporting tool's MCP server: theirs are hosted services that require your bug data to live in their cloud first. TraceBug's runs locally over stdio and reads from your disk.

## The workflow

1. A tester captures a bug and exports the report (**Quick Bug → Export HTML**). That one `.html` file contains everything: replay, console, network, user actions, screenshots, root-cause hint.
2. The tester hands the file to a developer (Slack, email, ticket attachment — it's just a file).
3. The developer drops it in a folder (e.g. `bug-reports/` in the repo) and asks their coding agent:

   > *"Use the tracebug tools to list my bug reports and debug the first one."*

4. The agent reads the report, correlates the stack trace with the failed request, finds the actual source file, and proposes a fix — with full context a pasted screenshot could never carry.

## Setup

### Claude Code

One-liner (global — works in every project):

```bash
claude mcp add tracebug -- npx tracebug mcp --dir ./bug-reports
```

Or per-project via `.mcp.json` in the repo root (committed, so the whole team gets it):

```json
{
  "mcpServers": {
    "tracebug": {
      "command": "npx",
      "args": ["tracebug", "mcp", "--dir", "bug-reports"]
    }
  }
}
```

### Cursor

Settings → MCP → **Add new MCP server**:

- **Command:** `npx`
- **Args:** `tracebug mcp --dir ./bug-reports`

Or add the same `mcpServers` block to `.cursor/mcp.json`.

### VS Code (GitHub Copilot agent mode)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "tracebug": {
      "type": "stdio",
      "command": "npx",
      "args": ["tracebug", "mcp", "--dir", "bug-reports"]
    }
  }
}
```

### Any other MCP client

The server speaks standard MCP over stdio. Point the client at:

```bash
npx tracebug mcp [--dir <path>]
```

`--dir` sets where bug reports live (default: the current working directory). The scanner searches up to 3 levels deep and skips `node_modules`, `.git`, build output, and dot-directories.

## Tools

| Tool | What it returns |
|---|---|
| `list_bug_reports` | Every TraceBug export under the directory: title, summary, severity, priority, root-cause hint, and counts of captured data. **Agents start here.** |
| `get_bug_report` | Overview of one report: environment, tester annotations, description, what data is available. |
| `get_console_errors` | Full console capture (errors / warnings / logs) with stack traces. |
| `get_network_activity` | Failed requests with response-body snippets by default; pass `failuresOnly: false` for every captured request. |
| `get_repro_steps` | Plain-English reproduction steps, structured user actions (including rage-click / dead-click frustration signals), and the full session timeline. |
| `get_screenshot` | A screenshot as real image content the agent can see. Screenshots are auto-named from the triggering action (`01_click_save.png`). |

Screenshots and video are deliberately excluded from the text tools (they're token-heavy); `get_screenshot` delivers images on demand.

## What files does it read?

Any TraceBug export:

- **`.html` replay exports** (the primary artifact) — the report JSON is embedded in the file, so the exact file a tester shares is what the agent reads. The file still opens as a full interactive replay in any browser.
- **`.json` report payloads** with the same structure.

Files that aren't TraceBug exports are ignored — you can point `--dir` at your Downloads folder and it will only pick up real reports.

## Try it right now

The repo ships a demo report:

```bash
git clone https://github.com/prashantsinghmangat/tracebug-ai
cd tracebug-ai && npm install && npm run build
npx @modelcontextprotocol/inspector node dist/bin.mjs mcp --dir demo-bug-reports
```

The Inspector opens a browser UI where you can call each tool against [`demo-bug-reports/sample-report.html`](../demo-bug-reports/sample-report.html) — a critical vendor-save bug with a 500 response, client-side TypeError, and a rage-click signal. Or open the repo in Claude Code (the included [`.mcp.json`](../.mcp.json) registers the server automatically) and ask it to debug the report.

## Privacy

- The server binds to **stdio only** — it opens no network ports and makes no network requests.
- It reads files from the directory you point it at, nothing else.
- What the agent sees is exactly what's in the export — which already went through TraceBug's capture-time redaction (sensitive storage keys, URL params, and token shapes are scrubbed before the report is built; see [Privacy in the README](../README.md#privacy)).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `list_bug_reports` returns `count: 0` | Check `--dir` points at the folder with the `.html` exports; the scanner only goes 3 levels deep. |
| Client says the server won't start | Requires Node ≥ 18. Test manually: `npx tracebug mcp --dir .` should print `TraceBug MCP server — reading bug reports from …` to stderr and then wait for input. |
| Report file not recognized | Only files exported by TraceBug (containing the embedded report payload) are picked up — a screenshot or PDF export is not readable by the MCP server; use **Export HTML**. |
