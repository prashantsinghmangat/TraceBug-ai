---
name: gates
description: Verify TraceBug changes. Use whenever tests, typecheck, lint, builds or extension checks need to run.
---

Always go through `node scripts/check.mjs`. Never run the npm gates one at a time, and never paste
their full output — a passing `ext:lint` alone is 751 lines that have been byte-identical for phases.

- Code only: `node scripts/check.mjs`  (typecheck, lint, test, build)
- Extension files touched: `node scripts/check.mjs --full`  (adds build:ext, ext:lint, check:versions)
- **Firefox is NOT a gate.** `npm run ext:firefox` is `web-ext run`: it opens Firefox and stays
  running until the browser is closed, so it returns no verdict and cannot be wrapped. check.mjs
  refuses it. At the end of a phase that touched the extension, run `npm run ext:firefox` directly
  and LOOK at the result — then report what you saw, or say you could not check it.
- One gate: `node scripts/check.mjs test`
- `--verbose` prints full output even when a gate passes. Rarely what you want.

Report the summary lines it prints, verbatim. They already carry the counts
(`658 passed, 40 files` · `errors 0, warnings 69` · `all surfaces on 1.10.1`).

## When a gate fails

- check.mjs prints the last 40 lines of that gate's output. Read those first.
- One failing test: `npx vitest run <file> --reporter=dot`. Don't re-run the suite to see one failure.
- `ext:lint` reporting **NEW: baseline is N** means this change added a web-ext warning. Fix it. Only
  update `scripts/check-baseline.json` when the user approves a new baseline.
- `ext:lint` saying **below the N baseline** is good news: a warning went away. Lower the baseline in
  the same step, or it stops catching the next regression.
- `check:versions` failing means a release surface drifted from `package.json`. It names the file. It
  checks ten surfaces, so fix them all rather than the one you were thinking about.
- A gate failing with *"could not read the Validation Summary"* means web-ext's output format moved,
  not that the extension is clean. Look at the output before believing anything.

## e2e

Not part of check.mjs — they launch real browsers and take minutes. Run only the suite related to the
change: `node e2e/<name>.e2e.mjs`.

- They are quiet while passing and print one totals line (`ALL CHECKS PASSED — 22/22 checks passed`).
  Report that line.
- A failure flushes the whole run automatically, so you get the passing checks for context. Don't
  re-run with `--verbose` to get it.
- `e2e/output/` is gitignored run artefacts. If a suite dirties a tracked file, that is a bug in the
  suite, not something to commit.
- `e2e/ext-player-csp.e2e.mjs` has no pass/fail checks — it prints diagnostics only. Read its output.
