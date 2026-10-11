# Migration Guide

TraceBug follows semver for the public SDK API. There have been **no
breaking API changes** through 1.x — upgrades are `npm install
tracebug-sdk@latest` plus awareness of the behavior changes below.

## 1.9 → 1.10

No breaking changes.

- **Saved tickets are now permanent.** Tickets saved with **Save Ticket**
  survive storage-pressure eviction and session rotation — only unsaved
  sessions are ever reclaimed. A save is verified before "Saved" is shown; if
  the screenshot had to be dropped to fit, the ticket card says so. If you
  relied on saved tickets aging out on their own, delete them explicitly.
- A storage warning now fires at ~90% usage, and the Saved Tickets list is
  un-capped (scrollable) with per-ticket sizes, a storage meter, one-click
  **Export** (.html replay), and a two-click delete confirm.
- New public API: `TraceBug.getStorageStats()` — local-only counters
  (including storage-pressure incidents), never transmitted.
- **Extension users:** the extension ships for Firefox 128+ from the same
  source as Chrome. Firefox has no offscreen API, so the recorder runs in a
  small popup window and shows a **Share screen** button (its
  `getDisplayMedia` requires a gesture in that document); Chrome's invisible
  flow is unchanged. Firefox treats site access as opt-in, so the first
  capture requests host permission.
- **1.10.1 (extension only):** the `tabs` permission was removed — reinstalls
  no longer show the "Read your browsing history" warning — and
  `minimum_chrome_version: 116` is declared, so Chrome ≤108 no longer
  installs the extension and silently fails to record. No SDK API change.

## 1.8 → 1.9

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
