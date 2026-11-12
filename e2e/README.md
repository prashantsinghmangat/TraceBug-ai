# e2e/ — Playwright-driven checks & tooling

Everything here drives a real Chromium via Playwright (`npx playwright
install chromium` once, then `node e2e/<file>`). Two kinds of files live
here — don't confuse them:

## End-to-end checks (`*.e2e.mjs`)

Assert real behavior in a live browser; exit non-zero on failure. Run the
relevant one after touching its feature:

| Script | Verifies |
| --- | --- |
| `blur-tracking.e2e.mjs` | Element-level blur: click-to-blur/unblur, zero scroll lag, `tb-mask`, Undo, cancel cleanup. |
| `pre-record.e2e.mjs` | Blur-first arming bar, cancel path, 3-2-1 countdown. |
| `inspect-mode.e2e.mjs` | Inspect mode overlay + style-evidence capture. |
| `ext-player-csp.e2e.mjs` | Extension player iframe on a strict-CSP page (loads the real extension). |
| `ext-shipping-path.e2e.mjs` | The 1.11 shipping path as an UPDATER sees it: seeds `tb_record_opts.video: true`, then asserts the capture is events-only, no video/mic control renders, no offscreen document is created, the ticket carries replay + console + network, and the stored preference survives for 1.11.1. |
| `ext-no-secrets-in-page.e2e.mjs` | The Phase 2a guarantee in a real DOM: four seeded secrets must not appear in `outerHTML`, any `input`/`textarea` **`.value`**, any open shadow root, or page storage. |
| `site-audit.e2e.mjs` | **The Site Audit engine** (in `check.mjs --full` as `e2e:audit`). An in-file page with planted accessibility, layout, performance (a ~700 KB render-blocking script) and SEO defects, audited with the script-tag SDK (bundles axe) in real Chromium: every planted defect found, nothing from TraceBug's own UI, no page token in the run, stable fingerprints across runs, and `compareAudits` on a fixed variant reports the fixes as fixed and one new defect as a regression; `exportAudit()` downloads a file carrying `payload.audit` that opens on its Audit tab. Needs `npm run build` first. |
| `audit-agent-loop.mjs` | **Manual, not a gate.** The audit acceptance test: `setup <dir>` writes a small app (two planted a11y defects + a planted prompt injection), audits and exports it; hand the export to a coding agent; `verify <dir>` re-audits and runs `compare_audits` through the built CLI (exit 0 = something fixed, nothing regressed, injection ignored). Needs `npm run build`. |
| `mcp-call.mjs` | **Helper.** `node e2e/mcp-call.mjs <tool> '<json>' --dir <dir>` calls one tool on the built MCP server (`dist/bin.mjs`) over stdio, for trying unreleased tools without registering a dev server. |
| `ext-site-audit.e2e.mjs` | **The Audit action through the packaged extension** (in `check.mjs --full` as `e2e:audit-ext`). Loads `dist/chrome` and runs the worker's real `handleComboAction("TB_RUN_AUDIT")`: axe absent before and injected on demand from `vendor/axe.min.js`, accessibility actually runs in the extension, the panel lists every category and the planted findings, "Re-run audit" reports what was fixed, "Export report" downloads the run, Esc closes it, manifest permissions unchanged. Needs `npm run build:ext` first. |
| `report-quality.e2e.mjs` | **The report-quality benchmark** (1.12 release gate, in `check.mjs --full` as `e2e:quality`). Five bug scenarios on an in-file shop, captured with the real extension, each report checked against an answer key: right title/action, real failures only (no favicon, status-0 or aborted rows), response body kept, error order, "No errors captured" with no invented cause, typing collapsed, no dead clicks, evidence block, AI prompt size, and no URL token / cookie value / hidden-field value anywhere in the report, prompt, `.html` or DOM replay. |
| `ext-redaction.e2e.mjs` | Popup redaction rules → storage → page bridge → `[REDACTED]` capture (real extension). |

These are **not** in `npm test` (they need a browser binary and are slower);
unit tests live in `tests/` and run with vitest.

## Reporter demo (`*.spec.ts`)

`demo-failure.spec.ts` + `fixtures.ts` are a real Playwright test that
intentionally fails, demonstrating the [TraceBug reporter](../docs/playwright.md)
turning a failure into a report (written to `bug-reports/`, not committed).
Run with `npx playwright test e2e/demo-failure.spec.ts`.

## Utilities (plain `.mjs`)

| Script | Produces |
| --- | --- |
| `benchmark.mjs` | The measured numbers in [docs/performance.md](../docs/performance.md) — prints a markdown table. |
| `marketing-screenshots.mjs` | Current-build product screenshots + a fresh sample export → `assets/screenshots/product/`. |

Conventions: each script serves `website/public` on its own port (no shared
state), and every path is derived from `e2e/paths.mjs` rather than hardcoded -
these scripts used to only run on one laptop.

Output: quiet while passing. Each script prints one totals line
(`ALL CHECKS PASSED - 22/22 checks passed`); the first failure flushes the whole
run so a failing check is readable next to the ones that got there. `--verbose`
prints everything from the start.

Headless by default, including the extension suites: Chromium's NEW headless
mode loads unpacked extensions (the OLD one ignored them, which is where
"extension tests must be headful" came from). Pass `--headful`, or set
`TB_E2E_HEADFUL=1`, to watch a run. Always bundled Chromium, never
`channel: "chrome"` - branded Chrome 137+ silently ignores `--load-extension`,
so an extension test against it passes by testing nothing.
