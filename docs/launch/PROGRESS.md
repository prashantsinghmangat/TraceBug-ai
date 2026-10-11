# v1.11 launch work - progress log

Append 3-5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom.

## Phase 0 - findings (2026-10-11)
- Read-only investigation of all 10 questions; no code changed. Report: `docs/launch/phase0-findings.md`.
- Verified against code: `build/manifest.base.json`, `build/build-ext.mjs`, `background.js`, `popup.js`,
  `content-script.js`, `src/integrations/tracker-client.ts`, `src/ai/llm-client.ts`, `src/storage.ts`,
  `src/ui/quick-bug.ts`, `playwright.config.ts`, `e2e/ext-*.e2e.mjs`.
- Headlines: audit #3/#4 (secrets + tickets in page localStorage) CONFIRMED and are the real work. #2 (tabCapture)
  already done; `tabs` was never in the manifest; Phase 1's permission request/decline flow already exists in
  `popup.js:295-339`. Phase 8's Chrome Beta nightly can't load an unpacked extension (Chrome 137+).
- Open issues: `tracebug-extension/manifest.json` (dev) duplicates `manifest.base.json` and must be edited in
  tandem; removing `<all_urls>` breaks `background.js:189` (`!tab.url` guard) until fixed.
