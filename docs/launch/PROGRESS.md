# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## Doc and copy pass for the video pause (2026-10-14)

- **Two user-visible strings still told people to use a control 1.11 removed.** The canvas toast
  said "stop and turn on Record video too"; the `WHATS_NEW` 1.11.0 card said "turn it off to try"
  capture-without-sharing. Both are fixed. The toast branches on the existing `isVideoOffered()`, so
  the npm SDK keeps the correct advice and 1.11.1 reverts it with no edit; the card now says video is
  paused, when it returns, and that the setting is kept. **Both were pinned by tests asserting the
  stale copy** - `tests/{whats-new,phase6-edges}.test.ts` now pin the new intent, and phase6 gained
  an extension-branch case (jsdom defaults to the SDK path, so the old test would have passed over
  the bug). Also `docs/launch/screens.md` screen 4, the design source for that card.
- `docs/chrome-extension.md`: Capture Bug is events-only, the mic line and the capture-surface option
  are gone, "Nothing leaves the browser" is now the privacy page's wording, the file tree matches the
  shipped files, and the architecture block no longer presents the offscreen document as live.
  **The permissions table was rebuilt from `manifest.base.json` - it was wrong in five ways** (listed
  `tabs`, `offscreen`, `tabCapture` and a required `<all_urls>`; omitted `alarms`), which made the
  extension read as far more invasive than it is. Optional host permissions are now a table of their
  own with what triggers each. Same sweep removed the three stale "Current tab / macOS" lines from
  `quickstart.md`, scoped the macOS paragraph, and fixed `README.md`'s Record-options sentence.
  `docs/api-reference.md`'s `surfaceMode` stays - it is the SDK's, and it works.
- `RELEASE_CHECKLIST.md` rows 1-3 rewritten: the checkbox they read off is gone, so they now verify
  `tb_record_opts` keeps `video: true` across the upgrade **while the capture stays events-only** -
  the pair 1.11.1 depends on. Row 9's oversize half marked skipped (its branch cannot be produced
  without video); the canvas half stays and now expects the new copy. Both carry restore notes, as
  does `video-1.11.1.md` step 5b.
- The growth plan: Oct 14 is a Wednesday - week 1 redated (submission stays **Fri Oct 16**, Showoff
  Saturday is **Sat Oct 17**). Show HN is no longer a fixed Oct 27 but the first Tuesday after 1.11.1
  is *approved*; if review slips it slips to Nov 3. `store-submission-pack.md`: `unlimitedStorage`
  justified without mentioning video, intro line and §5 removed.
- Verified: `node scripts/check.mjs --full` green - **818 passing / 48 files**, ext:lint 0 errors /
  69 warnings, versions 1.11.0. That one number now appears in STATE, the growth plan and
  video-1.11.1.md,
  which disagreed (796/47 and "817 unit tests"). Fixed STATE's `zip:ext` path, which had been
  corrupted to a literal tab: it is `C:\Windows\System32\tar.exe`.
- Trimmed: STATE.md 127 -> 60 lines, PROGRESS.md 285 -> 2 entries (9 moved to the archive), PLAN.md
  291 -> 215 with Phases 4-7 as one line each and their full text in `PLAN-archive.md`.
- **The growth plan stays out of the repo.** The reconciled plan went into
  `docs-internal/GROWTH-PLAN-30DAY.md`, replacing the Oct 11 copy, and the tracked
  `docs/launch/GROWTH.md` was deleted (it was never staged, so there was nothing to `git rm`).
  `docs-internal/` is still ignored via `.gitignore:34` and holds no tracked files. Four sections of
  the original were preserved rather than dropped - the Verdict and its scenario table, Store
  listing and conversion, the no-telemetry feedback signals, and Sources - and its stale
  "tokens are readable by the host page" premise is annotated, not silently deleted. Its test plan
  now points at `docs/RELEASE_CHECKLIST.md` and its Site Audit roadmap at `PLAN.md` § Phase 11.
- **The privacy page no longer justifies `offscreen`**, which 1.11 does not request
  (`website/app/privacy/page.tsx`); `unlimitedStorage` there and in the submission pack is justified
  by the replay alone. Restoring all of it is step 5b / the `offscreen` block in `video-1.11.1.md`.
- Open: the AMO slug contradiction (`docs/compatibility.md` publishes a URL `src/links.ts` refuses
  to hold) - left alone deliberately, pending confirmation of the real slug. **CLOSED 2026-10-15:
  the published URL was a 404; the real slug is `tracebug-bug-reports-for-ai`.**
## Offscreen files, the AMO slug, and a git rule (2026-10-15)

- **`offscreen.{html,js}` no longer ship while video is paused.** They were inert - no permission,
  and no `tb:rec:*` is sent when `isVideoOffered()` is false - but a document the manifest cannot
  open is an oddity in a reviewed package. `build-ext.mjs` parses `VIDEO_ENABLED_IN_EXTENSION` out
  of `src/video-recorder.ts` rather than carrying a second flag, and throws if it is renamed.
  Archives 30 -> 28 files, both targets, `PK` confirmed; `ext-shipping-path` 16/16 with them absent.
- **The AMO link we published was a 404.** `/addon/tracebug/` does not exist. Resolved by GUID, not
  by name: AMO's API for `tracebug@prashantsinghmangat` returns slug `tracebug-bug-reports-for-ai`,
  public, 1.10.1. Now in `src/links.ts`; the guard test was INVERTED (it asserted no Firefox link
  could be declared - the risk is now declaring the wrong one) and cross-checks `compatibility.md`.
- **Privacy page stopped justifying `offscreen`**, which 1.11 does not request; restore notes for
  all four permission surfaces are in `video-1.11.1.md`.
- **Git: `--only <paths>` is now a rule** (`CLAUDE.md`), plus `Bash(git push:*)` in the settings
  deny list. A bare `git add` had swept 19 files into a commit meant for 7.
- Verified: `check.mjs --full` green - **819 passing / 48 files**, ext:lint 0 errors / 69 warnings.
  Five commits on `develop`. Open: nothing blocking; the remaining items need a person.
