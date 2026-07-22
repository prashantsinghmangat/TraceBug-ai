# tracebug

The TraceBug CLI — a **local MCP server** that lets AI coding agents debug [TraceBug](https://github.com/prashantsinghmangat/tracebug-ai) bug-report exports, plus one-command framework setup.

Zero dependencies. ~24 KB. Node ≥ 18.

**See it work first:** [tracebug.dev/proof](https://tracebug.dev/proof) — an unedited transcript of Claude going from crash to root cause in five tool calls, reading a real export through this server.

## MCP server

Connect Claude Code, Cursor, Windsurf, or VS Code to the `.html` bug reports the [TraceBug Chrome extension](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj) exports:

```bash
claude mcp add tracebug -- npx -y tracebug mcp --dir ./bug-reports
```

The agent gets nine read tools and a `/tracebug:debug_bug_report` prompt:

- `list_bug_reports` — scan a folder and summarize every export
- `get_bug_report` — report overview plus a prioritized investigation guide
- `get_console_errors` — captured console output with stack traces
- `get_network_activity` — captured requests, failed ones first, with response snippets
- `get_repro_steps` — plain-English steps, user actions, full session timeline
- `get_screenshot` — screenshots as real image content
- `get_playwright_test` — a generated failing Playwright spec that replays the session and asserts the failure is gone; red until fixed, green after
- `resolve_stack` — maps minified stack frames to original source via `.map` files found in the repo the server runs from
- `get_fix_context` — one-call fix starter: failing request, triggering user action, source-map-resolved stack, failing-test availability

The last three close the fix loop: pull the failing test, patch, re-run until green.

**Everything stays on your machine.** The server binds to stdio only, opens zero network connections, and reads the report files from your disk. No account, no cloud, no upload.

Full guide: [tracebug.dev/docs/mcp](https://tracebug.dev/docs/mcp)

## Project setup

```bash
npx tracebug init
```

Detects your framework (React, Next.js, Vue, Angular, Svelte, Nuxt, vanilla) and prints the setup snippet for the [`tracebug-sdk`](https://www.npmjs.com/package/tracebug-sdk) — the embeddable capture SDK.

## Related packages

| Package | What it is |
|---|---|
| [`tracebug`](https://www.npmjs.com/package/tracebug) (this one) | CLI: MCP server + `init`. For developers *receiving* bug reports. |
| [`tracebug-sdk`](https://www.npmjs.com/package/tracebug-sdk) | The full SDK for embedding capture in your app. Includes this CLI too. |
| [Chrome extension](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj) | Zero-code capture for QA/testers on any website. |

MIT © Prashant Singh Mangat
