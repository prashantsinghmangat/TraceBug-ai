---
name: finish
description: Finish a TraceBug change in one pass — build, run every gate, update the docs, report. Use when asked to "build, run everything and update docs", "wrap up", "finish this", or at the end of any change before suggesting a commit.
---

One pass, in this order. Each step has a cheap way and an expensive way; use the cheap one.

1. **Build once.** `npm run build` (rewrites `tracebug-extension/tracebug-sdk-ext.js` and
   `website/public/tracebug-sdk.js`, never edited by hand). Print nothing on success:
   `npm run build >/dev/null 2>&1 && echo built`. If it fails, re-run it plainly to see why.

2. **All gates, in the background.** `node scripts/check.mjs --full 2>&1 | grep -E "^(PASS|FAIL)|gate"`
   with `run_in_background`. `--full` already runs build:ext, ext:lint, versions and the e2e suites that
   are wired in (see the `gates` skill). Don't poll the output file; you're told when it ends. While it
   runs, do step 3.

3. **Docs — only what this change made untrue.**
   - User docs: the one page for the feature you touched (`docs/annotate-and-draw.md`,
     `docs/bug-reporting.md`, `docs/ticket-flow.md`, …). Find it with `rg -l "<feature word>" docs`.
   - `docs/launch/CODEMAP.md`: one line for a new file or a moved/renamed symbol. No essays.
   - `docs/launch/STATE.md`: **rewrite** the bullet for this area (replace, never append); keep the file
     under ~80 lines; update the Gates line with the new counts from step 2.
   - `docs/launch/PROGRESS.md`: append ≤5 lines (what changed, files, how verified, what's open). Never
     read it whole — `tail -5` it.
   - `CHANGELOG.md` only when users would notice.

4. **Related e2e not in `--full`.** Run only the suites for what you touched, e.g.
   `node e2e/ext-video-recording.e2e.mjs 2>&1 | tail -1`. Report the totals line. `ext-feature-matrix`
   and `ext-shipping-path` flake under load: re-run alone before believing a failure.

5. **Report, short.** Summary lines from step 2 verbatim, e2e totals lines, what was NOT verified
   (always: `npm run ext:firefox` by hand), and a ≤8-line suggested commit message. Never commit or
   push (CLAUDE.md git rules).

## Token savers learned the hard way

- Edit with the Edit tool, or a Python script written to the scratchpad with the Write tool and run with
  `python <path>`. Bash heredocs that contain backticks or `${…}` break the shell.
- `e2e/output/` is read-denied for tools: send screenshots to the scratchpad (`--shots=<scratchpad>`).
  Look at a screenshot only when the change is visual.
- Don't re-read a file you just edited; don't `cat` big files — `rg -n` the symbol, then read a range.
- One failing check → re-run that one suite (or `npx vitest run <file> --reporter=dot`), not everything.
- Probing a browser quirk? Write ONE probe that prints every stage, not five that each print one line.
- Known environment limits (don't rediscover them): Playwright's bundled Chromium can't MediaRecorder-encode
  from a normal page (0 bytes / tab crash) — test video encoding in Firefox + installed Chrome/Edge
  (`e2e/video-cut.e2e.mjs`); Firefox refuses port 4190; Playwright's Firefox can't decode Chrome's VP9.
