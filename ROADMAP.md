# Roadmap

Where TraceBug is heading, honestly labeled. The roadmap is driven by user
feedback — most shipped items trace to a specific request (Product Hunt
comments, GitHub issues). Suggest items via
[issues](https://github.com/prashantsinghmangat/tracebug-ai/issues) or the
[feedback page](https://tracebug.dev/feedback).

_Current release: **1.10.1** (2026-07-29) — live on the Chrome Web Store and
on addons.mozilla.org (since 2026-08-01), npm (`tracebug-sdk`, `tracebug`),
and GitHub Releases._

## ✅ Shipped

- **1.10.1 — store-readiness release** (2026-07): permission minimization
  (dropped the unused `tabs` permission), an allowlisted page↔extension
  bridge, and four extension-lifecycle fixes (service-worker hydration race,
  Firefox recorder-window id across event-page restarts, recorder host
  teardown, `minimum_chrome_version: 116`).
- **1.10.0 — the Firefox release** (2026-07): the extension builds for
  Firefox 128+ from the same source as Chrome, with honest handling of every
  platform difference (gesture-gated screen picker, opt-in site access, no
  tab audio). Also made **saved tickets eviction-proof** — saved tickets live
  until explicitly deleted, with a storage meter, per-ticket sizes, one-click
  export, and a ~90% usage warning.
- **1.9.0 — the fix-loop release** (2026-07): generated failing Playwright
  spec embedded in every export + `get_playwright_test`, source-map stack
  resolution (`resolve_stack`), `get_fix_context`, inspect mode (computed-style
  evidence), pre-recording options (surface/countdown/blur-before-recording
  with click-to-blur), and the redaction-rules popup UI.
- **1.8.0 — launch-feedback release** (2026-07): visible redaction summary
  (`🛡 N sensitive values auto-masked`), configurable `redact` rules,
  `console.info` capture + warn/info in the repro timeline, `.zip` export
  for GitHub attachments, issue actions inside the exported report.
- **1.7.0**: rrweb DOM replay export (KB not MB), BYO-token GitHub/Linear/
  Slack filing, Slate Indigo rebrand, live sandbox.
- **1.5–1.6**: local MCP server, Playwright reporter, BYO-key AI debugger,
  HAR export.

## 🔄 Now

Engineering is paused on purpose. 1.10.1 is live on both stores, so the work
is **distribution and evidence** — finding out what real users hit before
building more. Feature work resumes when user evidence points at something
specific. Progress is tracked in [METRICS.md](METRICS.md).

## 🗓 Next milestone — 2.0

- **IndexedDB storage migration** — the one engineering item already decided.
  The gate is real: saved tickets live in `localStorage` today, and
  storage-pressure incidents are counted locally
  (`TraceBug.getStorageStats()`, never transmitted) to say when the migration
  is actually needed.
- **JSON-path precision redaction** (`user.email` vs every `email` key) —
  gated on user feedback confirming substring matching isn't enough.
- **Bundle-size + Lighthouse checks in CI** — budgets enforced per PR.

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
