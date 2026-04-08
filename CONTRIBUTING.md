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
- **1 runtime dependency** — only `html2canvas`. Justify any addition.
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

## Code Style

- TypeScript strict mode
- Inline styles (no external CSS files) — theme variables for colors
- Small, focused functions
- Self-documenting code over comments
- `data-tracebug` attribute on every TraceBug DOM element

## Issue Templates

- **Bug reports**: Use TraceBug itself to generate the report!
- **Feature requests**: Describe the use case, not just the solution.

## Questions?

Open a [GitHub Discussion](https://github.com/prashantsinghmangat/tracebug-ai/discussions) or file an issue.
