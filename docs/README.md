# TraceBug Documentation

Index of the docs in this folder. All docs are kept in sync with the code in
`src/` — see the root [ARCHITECTURE.md](../ARCHITECTURE.md) for the system
overview and [CHANGELOG.md](../CHANGELOG.md) for what changed.

## Getting started & usage

| Doc | What it covers |
| --- | --- |
| [quickstart.md](quickstart.md) | **Report your first bug in 2 minutes** — the fastest path for QA and developers. |
| [getting-started.md](getting-started.md) | Install, initialize, and the in-page toolbar. |
| [configuration.md](configuration.md) | Every `TraceBug.init()` option and defaults; session behavior. |
| [bug-reporting.md](bug-reporting.md) | The Quick Bug modal and Saved Tickets. |
| [ticket-flow.md](ticket-flow.md) | Capture → review → export, step by step (incl. all export formats). |
| [annotate-and-draw.md](annotate-and-draw.md) | Inspect mode (style evidence), element annotation, draw mode, and click-to-blur redaction. |
| [chrome-extension.md](chrome-extension.md) | Using TraceBug as a browser extension. |

## Exports, agents & integrations

| Doc | What it covers |
| --- | --- |
| [mcp.md](mcp.md) | The local MCP server — let a coding agent read exported `.html` reports. |
| [ai-debugger.md](ai-debugger.md) | BYO-key LLM root-cause analysis (Anthropic / OpenAI / Ollama). |
| [integrations.md](integrations.md) | File real GitHub / Linear / Slack / Jira issues from a report. |
| [har-export.md](har-export.md) | Export captured network activity as a standard `.har`. |
| [playwright.md](playwright.md) | Playwright reporter — failing tests become TraceBug reports (and every report embeds a failing spec). |

## Reference

| Doc | What it covers |
| --- | --- |
| [api-reference.md](api-reference.md) | Public SDK API — methods, types, exports. |
| [architecture.md](architecture.md) | File-by-file internals (recording pipeline, storage, exporters). |

> The self-contained offline **HTML replay export** (rrweb DOM replay + gzip),
> the lean **Export for AI (.html)**, and **event capture surviving navigation**
> are covered in [ticket-flow.md](ticket-flow.md) and the
> [architecture](../ARCHITECTURE.md) docs.
