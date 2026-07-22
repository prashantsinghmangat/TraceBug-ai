# Roadmap

Where TraceBug is heading, honestly labeled. The roadmap is driven by user
feedback — most shipped items trace to a specific request (Product Hunt
comments, GitHub issues). Suggest items via
[issues](https://github.com/prashantsinghmangat/tracebug-ai/issues) or the
[feedback page](https://tracebug.dev/feedback).

## ✅ Shipped

- **1.8.0 — launch-feedback release** (2026-07): visible redaction summary
  (`🛡 N sensitive values auto-masked`), configurable `redact` rules,
  `console.info` capture + warn/info in the repro timeline, `.zip` export
  for GitHub attachments, issue actions inside the exported report.
- **1.7.0**: rrweb DOM replay export (KB not MB), BYO-token GitHub/Linear/
  Slack filing, Slate Indigo rebrand, live sandbox.
- **1.5–1.6**: local MCP server, Playwright reporter, BYO-key AI debugger,
  HAR export.

## 🔄 In progress (built & verified, releasing as 1.9)

The **fix-loop release** — the report stops being evidence an agent reads
and becomes something it iterates against:

- Generated **failing Playwright test** embedded in every export (red until
  the bug is fixed) + `get_playwright_test` MCP tool
- **Source-map stack resolution** (`resolve_stack`) — minified frames →
  original source, dependency-free
- **`get_fix_context`** — one-call fix starter for agents
- **Inspect mode** — click an element to attach computed-style evidence
  (typography, colors, box model, WCAG contrast) for design-QA bugs
- **Pre-recording options** — tab/desktop surface, countdown, and
  blur-before-recording with element-level click-to-blur
- Extension popup UI for redaction rules

## 🗓 Planned (next few releases)

- **JSON-path precision redaction** (`user.email` vs every `email` key) —
  gated on user feedback confirming substring matching isn't enough
- **Chrome Web Store listing refresh** with current-build screenshots
- **Bundle-size + Lighthouse checks in CI** — budgets enforced per PR
- **Firefox extension** — port is paused with the shared build in place
  (`dist/firefox` builds today); the remaining work is recording parity
  without Chrome's offscreen API. Prioritized when demand shows up.

## 🔭 Long-term direction

The north-star question we ask users: *what would the report need for your
agent to FIX the bug, not just diagnose it?* Candidate answers being
weighed:

- Git-blame / recent-commit context linked from resolved stack frames
- Richer fix verification (run the generated test in CI on the PR)
- Design-token diffing for style evidence (captured vs. tokens in the repo)
- Deeper framework awareness (component names in replays and stacks)

Explicitly **not** planned: any required backend, hosted MCP, or cloud
storage of session data — local-first is the product
([ADR 001](docs/adr/001-local-first-no-backend.md)).
