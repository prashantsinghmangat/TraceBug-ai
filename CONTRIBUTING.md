# Contributing to TraceBug

Thanks for your interest in contributing! TraceBug is a zero-backend, browser-only QA tool, and every contribution helps make bug reporting better for developers everywhere.

## Quick Start

1. Fork and clone the repo
2. `npm install`
3. `npm run dev` (watch mode — auto-rebuilds on changes)
4. Open the example app: `cd example-app && npm install && npm run dev`
5. Visit `http://localhost:3000` to test your changes live

## Project Structure

```
tracebug-ai/
├── src/                     # SDK source (TypeScript, vanilla DOM)
├── website/                 # Next.js marketing site
├── tracebug-extension/      # Chrome Extension (Manifest V3)
├── example-app/             # Next.js demo app for testing
├── docs/                    # Documentation markdown files
└── dist/                    # Built output (auto-generated)
```

## Architecture Rules

These are non-negotiable. PRs that break these will be rejected:

- **Zero backend** — all data stays in the browser (localStorage + in-memory)
- **Self-filtering** — all UI must be inside `#tracebug-root` with `data-tracebug` attributes
- **Z-index max** — all UI at `z-index: 2147483647`, appended to `<html>` not `<body>`
- **Error boundary** — every collector handler wrapped in try/catch. Never break the host app.
- **Minimal runtime dependencies** — `html2canvas`, `axe-core`, and `rrweb`, all **lazy-loaded** so the core bundle stays small. Justify any addition.
- **CSP-safe** — no string-based script injection. Use `createElement` and event listeners.
- **Theme variables** — use `var(--tb-*)` CSS custom properties for all colors
- **Framework agnostic** — vanilla DOM only for SDK UI (no React/Vue/Angular)
- **Privacy** — sensitive fields auto-redacted. New features must respect this.

## Development

### Build

```bash
npm run build        # Build ESM + CJS + IIFE + DTS
npm run dev          # Watch mode
npm run build:example  # Build + update example app
```

### Test Your Changes

1. Make changes in `src/`
2. The dev watcher auto-rebuilds
3. Refresh the example app to see changes
4. Verify: `npm run build` must succeed with 0 errors

### Type Checking

```bash
npx tsc --noEmit     # Type check without emitting
```

## Pull Requests

- **One feature per PR** — keep PRs focused and reviewable
- **Include screenshots** for UI changes (before/after)
- **Run `npm run build`** before submitting — all 4 outputs must build
- **Update docs** if you add/change public API or config options
- **No new runtime dependencies** without prior discussion

## Commit Messages

Conventional-commits style, matching the existing history:

```
<type>(<optional scope>): <imperative summary>
```

- Types in use: `feat`, `fix`, `chore`, `docs`, `release`. Scopes when they
  add clarity: `feat(export):`, `fix(extension):`, `feat(site):`.
- The summary states the user-visible change; the body (optional) states
  the *why* — constraints and trade-offs, not a diff narration.
- No AI co-author trailers; release commits reference the CHANGELOG entry.

## Code Style

- TypeScript strict mode
- Inline styles (no external CSS files) — theme variables for colors
- Small, focused functions
- Self-documenting code over comments
- `data-tracebug` attribute on every TraceBug DOM element

## Coding Standards

Beyond the architecture rules above:

- **Tests accompany behavior.** New sanitizers, exporters, parsers, and MCP
  tools ship with unit tests (`tests/`); user-visible flows get a Playwright
  e2e in `e2e/` (see `blur-tracking.e2e.mjs` for the pattern). `npm test`,
  `npm run typecheck`, and `npm run lint` must all pass — the bar is zero
  warnings, no `eslint-disable`, no `as any`.
- **Comments explain constraints, not narration** — why a guard exists, what
  breaks without it. The codebase's header comments are the convention.
- **Fail soft in collectors**: capture code must never throw into the host
  app; degrade (skip the event) instead.
- **Naming**: modules are kebab-case, exported helpers are verbs
  (`buildReport`, `captureStyleEvidence`), private module state is
  `_underscored`.

## API Stability & Versioning

The public SDK API (everything exported from `src/index.ts` and documented
in [docs/api-reference.md](docs/api-reference.md)) follows **semver**:

- **Patch/minor** releases never break the public API. Behavior changes are
  called out in [docs/migrating.md](docs/migrating.md) and the CHANGELOG.
- Renames keep a compatibility alias for at least one minor (e.g.
  `removeAllBlurBoxes` survived the blur rewrite).
- The exported `.html` report format is **forward-readable**: newer
  viewers/MCP servers must handle older payloads; new payload fields must
  be optional.
- Internal modules (not exported from `src/index.ts`) may change freely.

## Project Health

How to check the project is alive and healthy:

- **CI**: `.github/workflows/ci.yml` runs tests/typecheck/lint on every
  push — the badge on the README reflects `main`.
- **Releases**: versioned tags + [CHANGELOG.md](CHANGELOG.md) with dated
  entries; npm (`tracebug-sdk`, `tracebug`) and the Chrome Web Store ship
  from the same tagged commit.
- **Benchmarks**: `node e2e/benchmark.mjs` reproduces the numbers in
  [docs/performance.md](docs/performance.md).
- **Issue response target**: first response within 72 hours on weekdays;
  security reports via [SECURITY.md](SECURITY.md) get priority.

## Issue Templates

- **Bug reports**: Use TraceBug itself to generate the report!
- **Feature requests**: Describe the use case, not just the solution.

## Questions?

Open a [GitHub Discussion](https://github.com/prashantsinghmangat/tracebug-ai/discussions) or file an issue.
