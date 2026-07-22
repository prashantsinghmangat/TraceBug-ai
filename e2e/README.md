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
| `ext-player-csp.e2e.mjs` | Extension player iframe on a strict-CSP page (headful, loads the real extension). |
| `ext-redaction.e2e.mjs` | Popup redaction rules → storage → page bridge → `[REDACTED]` capture (headful, real extension). |

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
| `marketing-screenshots.mjs` | Current-build product screenshots + a fresh sample export → `D:/tmp/tracebug-shots/`. |

Conventions: each script serves `website/public` on its own port (no shared
state), checks print `PASS`/`FAIL` lines, and headful mode is only used
where extensions require it.
