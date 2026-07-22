# Migration Guide

TraceBug follows semver for the public SDK API. There have been **no
breaking API changes** through 1.x — upgrades are `npm install
tracebug-sdk@latest` plus awareness of the behavior changes below.

## 1.8 → 1.9 (upcoming)

No breaking changes. New surface you may want to adopt:

- `redact: { fields, patterns }` config (1.8) now has an extension-popup UI;
  rules apply live to a running page.
- **Blur changed interaction model:** drag-rectangles → click-to-blur
  elements. Anything you documented internally about "drag to blur" needs
  the wording update. API names are unchanged (`removeAllBlurBoxes` kept
  for compatibility; it now unblurs elements).
- New public APIs: `prepareRecording()`, `activateInspectMode()`,
  `generatePlaywrightTest()`, `exportSessionAsZip()`, style-evidence and
  redaction-summary helpers. Old exports untouched.
- Exports embed a generated failing Playwright spec; MCP grows
  `get_playwright_test`, `resolve_stack`, `get_fix_context` (old exports
  simply don't have the new payload fields — tools respond with a
  re-export hint).

## 1.7 → 1.8

No breaking changes.

- **`captureConsole` documentation corrected:** the effective default has
  been `"all"` since 1.7; docs previously claimed `"errors"`. If you relied
  on the *documented* default, set `captureConsole: "errors"` explicitly.
- `console.info` is now captured (in `"warnings"` and `"all"`); warn/info
  render in the repro timeline. Non-error levels cap at 50/session.
- Token-shape scrubbing now also runs at capture on console output and
  error stacks (previously cloud-path only) — reports may show more
  `[REDACTED]` than before. That's the fix working, not data loss.
- Exported reports gained issue actions (Open GitHub issue / Copy
  markdown) and a Privacy row — older reports open fine; they just lack
  the new buttons.

## 1.6 → 1.7

No breaking SDK API changes.

- **Export .html switched from base64 video to rrweb DOM replay** by
  default — files dropped ~3–4×. Pass `includeVideo: true` at export to
  force video alongside.
- Visual rebrand (Slate Indigo) — if you themed around `--tb-*` variables,
  values changed but the variable names did not.
- `npx tracebug init` output changed from "setup" claims to printed
  snippets with framework gotchas.

## Report-file compatibility

Exported `.html` reports are forward-readable: newer viewers/MCP servers
read older payloads (missing fields degrade gracefully). Older MCP servers
ignore fields added later. There is no migration step for stored reports.
