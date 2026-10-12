# Release checklist — manual rows

Things that cannot be automated here, collected as they are found so they are not lost between
phases. **Phase 8 owns this file** (see `docs/launch/PLAN.md`, "Smoke-test harness and release
checklist") and should extend it rather than replace it.

Each row says what to set up, what to do, and what counts as a pass. A row that needs a second
machine or a second OS says so.

## Upgrade: the video setting survives, and the default splits by reason

**Why these exist.** 1.11 moves the Record-options blob from the popup's own `localStorage` to
`chrome.storage.local` (`tb_record_opts`), and `runtime.onInstalled` seeds the video default
differently per reason: **off** on install, **on** on update. `tests/record-opts.test.ts` covers the
worker's seed against the real `background.js`, and slices the real `loadRecordOpts` /
`saveRecordOpts` out of `popup.js` to cover the precedence rules — but `popup.js` is one
`DOMContentLoaded` closure over the whole popup DOM, so **nothing here tests the popup actually
opening**. These two rows are that gap. Both failure modes are silent: the user just finds their
setting changed.

### 1. An explicit "video on" survives the upgrade

1. Install the **previous** released build (1.10.x) unpacked.
2. Open the popup → **Record options** → tick **Record video too**. Close the popup.
3. Confirm the old blob exists: in the popup's devtools console,
   `localStorage.getItem("tracebug_record_opts")` → includes `"video":true`.
4. Load this build over it (Reload on the unpacked extension, or install the new `.zip` over the
   same profile — *not* a fresh profile, which would be an install, not an update).
5. Open the popup → **Record options**.

**Pass:** **Record video too** is still ticked. In the console,
`chrome.storage.local.get("tb_record_opts")` → `{ video: true, videoSetBy: "user" }`, and
`localStorage.getItem("tracebug_record_opts")` → `null` (migrated and cleaned up).

**Fail** means the migration lost the choice — the seed won where the user should have.

### 2. A pre-option profile gets video ON, not off

1. Install a build from **before** the Record-video option existed (pre-Phase-4 1.11 dev build, or
   1.10.x without ever touching Record options).
2. Optionally set a surface or a delay in Record options, so the legacy blob exists but carries no
   `video` field. Verify: `localStorage.getItem("tracebug_record_opts")` has no `"video"` key.
3. Load this build over the same profile.
4. Open the popup → **Record options**.

**Pass:** **Record video too** is **ticked**, and `chrome.storage.local.get("tb_record_opts")` →
`{ video: true, videoSetBy: "default" }`, with any surface/delay preserved. This user recorded video
on every capture before, so the upgrade must not take it away.

**Fail (ticked but `videoSetBy: "user"`)** means something stamped a choice the user never made —
a future default change would then never reach them.

**Fail (cleared)** means either the update seed did not run or the popup's migration overwrote it
with a literal `false`. Both have regressed before.

### 3. A fresh install still gets video OFF, and stays off

1. Install this build on a **clean** profile.
2. Open the popup → **Record options**.
3. Reload the unpacked extension once (this fires `onInstalled` with reason `update`).
4. Open the popup → **Record options** again.

**Pass:** unticked both times. Step 3 is the guard: the update default must not re-apply to someone
this build already defaulted, or every new installer gets video switched on by their first update.

## Phase 4 first-run and uninstall surfaces (never rendered in CI)

Their tests assert source and logic, not layout. Each of these needs eyes once, on Chrome and Firefox.

### 4. The welcome page

Install unpacked on a clean profile. A tab should open to `welcome.html`. **Pass:** three step cards,
and step 3 shows either real key caps (`Alt` `B` by default) or "No shortcut set" with a working
button. "Change shortcut" must open the browser's shortcuts page, or print text steps - never do
nothing. The privacy box shows three chips. There is no "Rolling this out to a team?" card.

### 5. The "What's new" card

**Requires the version bump to 1.11.0** - the copy table is keyed `1.11.0`, so nothing shows until
then. Install a 1.11.0 build over an older profile, open the popup. **Pass:** indigo card above the
actions, four check lines, the amber token-rotation line, "Got it" dismisses it and it never returns.

### 6. The "can't run here" states

Open the popup on `chrome://extensions`, on a `file://` page with file access off, and on a tab left
open across an extension reload. **Pass:** each shows its own icon and sentence, the host/path card
names the page, and the button does what it says. On a normal page with site access **declined**, the
card should be ABSENT, not blank.

### 7. The uninstall survey

Uninstall the extension. **Pass:** `tracebug.dev/bye?v=<version>` opens, the version appears in the
fine print, Skip reaches the thank-you state. Then submit the form once for real and confirm the
submission appears in Netlify Forms under `uninstall` - a field-name mismatch is accepted and
silently discarded, so this cannot be verified any other way.

### 8. The review ask, and the export footer

**Review ask.** In the popup's devtools console on the page under test, set
`localStorage.tracebug_export_count = "2"` and
`localStorage.tracebug_review_first_session = "old"`, then export a report. **Pass:** about two
seconds after the export toast, a card appears bottom-right: "Did TraceBug save you time?", a **Rate
TraceBug** button and **Not now**. It must not cover the ticket modal's own buttons. Esc, ✕ and
**Not now** all close it, and it does not come back on the next export. **Rate TraceBug** must open
the listing's reviews tab - click it once for real and check the URL.

**Export footer.** Export a report and open it. **Pass:** the foot of the page reads "Captured with
TraceBug - free & local." with "Capture your own" linking to the store listing with
`utm_source=report&utm_medium=export`. Then set **Export footer: off** in the **More ▾** menu, export
again, and confirm the bar is gone from the new file and the old one still has it.

