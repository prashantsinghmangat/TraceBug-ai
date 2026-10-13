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
| `ext-no-secrets-in-page.e2e.mjs` | The Phase 2a guarantee in a real DOM: four seeded secrets must not appear in `outerHTML`, any `input`/`textarea` **`.value`**, any open shadow root, or page storage. |
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
| `marketing-screenshots.mjs` | Current-build product screenshots + a fresh sample export → `D:/tmp/tracebug-shots/`. |

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
