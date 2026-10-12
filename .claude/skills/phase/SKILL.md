---
name: phase
description: Run one phase or step of the TraceBug launch plan. Use when asked to "do Phase N", "next step", or continue the launch plan.
---

1. **Read only these.** `docs/launch/STATE.md` (where things stand, ~1 page) and the named phase's live
   section in `docs/launch/PLAN.md`. Read `docs/launch/CODEMAP.md` before searching the large files.
   Do **not** open `PLAN-archive.md`, `PROGRESS-archive.md` or `phase0-findings-archive.md` — they are
   closed history and much of what they say is no longer true. If you do need one to answer *why* a
   finished decision went that way, say so first.

2. **Plan in <=10 bullets.** Show it and wait for approval unless the user said "go".

3. **Work in commit-sized steps.** After each step run the `gates` skill, then STOP and report in this
   shape, nothing longer:
   - **Changed:** files, one line each
   - **Verified:** check.mjs summary lines, plus any e2e totals line
   - **Needs a human:** bullets, or "nothing"
   - **Commit message:** <=8 lines

4. **Say what you could not verify.** Anything needing a real Mac, a second browser, a store upload or
   a fresh profile is a row for `docs/RELEASE_CHECKLIST.md`, not a claim. Never report a manual check
   as passing.

5. **Keep the map honest.** If a `CODEMAP.md` entry is more than ~50 lines off, or a mapped function
   moved or was renamed, update `CODEMAP.md` in the same step.

6. **After each step:** rewrite `docs/launch/STATE.md` (replace, don't append — it is current state,
   not a log) and add <=5 lines to `docs/launch/PROGRESS.md`. If `PROGRESS.md` passes ~150 lines, move
   its oldest entries to `PROGRESS-archive.md`. Update `CHANGELOG.md` under `1.11.0` when the change is
   user-visible — and fix any existing entry the change makes false, rather than only adding to it.

7. **Never** commit, push, or add a manifest permission. Leave the work uncommitted on `develop` and
   suggest a message. Removing a permission or making one optional is fine.

8. **If the plan is wrong, say so and keep going.** Finished phases often invalidate a later phase's
   text (Phase 3 made `Ctrl+Shift+B` the wrong shortcut to document, Phase 2b resolved a Phase 6
   item). Correct the instruction in `PLAN.md` as part of the step instead of following it, and note
   the correction in the report.
