# Release checklist — manual rows

Things that cannot be automated here, collected as they are found so they are not lost between
phases. **Phase 8 owns this file** (see `docs/launch/PLAN.md`, "Smoke-test harness and release
checklist") and should extend it rather than replace it.

Each row says what to set up, what to do, and what counts as a pass. A row that needs a second
machine or a second OS says so.

## Upgrade: the video setting survives, and the default splits by reason

> **Rewritten for 1.11, where screen recording is paused.** The **Record video too** checkbox is
> not in the popup (`VIDEO_ENABLED_IN_EXTENSION` in `src/video-recorder.ts`), so these rows can no
> longer be read off the UI. What they verify instead is the thing 1.11.1 depends on: the stored
> preference is **kept and not acted on**. A capture must stay events-only *whatever* the blob says,
> and the blob must still be there when the feature comes back.
>
> **Restore the original UI-based steps in 1.11.1** — tick the checkbox, confirm it is still ticked
> after the upgrade — together with the popup's `optVideo` row. The pre-1.11 wording is in
> `git log -p docs/RELEASE_CHECKLIST.md`.

**Why these exist.** 1.11 moves the Record-options blob from the popup's own `localStorage` to
`chrome.storage.local` (`tb_record_opts`), and `runtime.onInstalled` seeds the video default
differently per reason: **off** on install, **on** on update. `tests/record-opts.test.ts` covers the
worker's seed against the real `background.js`, and slices the real `loadRecordOpts` /
`saveRecordOpts` out of `popup.js` to cover the precedence rules — but `popup.js` is one
`DOMContentLoaded` closure over the whole popup DOM, so **nothing here tests the popup actually
opening**. These rows are that gap. Both failure modes are silent: the user just finds their
setting changed — or, in 1.11, finds it gone when 1.11.1 arrives.

Read `tb_record_opts` from the **extension's** devtools console (the service worker, or the popup
with it open), not the page's:
`chrome.storage.local.get("tb_record_opts").then(console.log)`.

### 1. An explicit "video on" survives the upgrade, and is ignored

1. Install the **previous** released build (1.10.x) unpacked.
2. Open the popup → **Record options** → tick **Record video too**. Close the popup.
3. Confirm the old blob exists: in the popup's devtools console,
   `localStorage.getItem("tracebug_record_opts")` → includes `"video":true`.
4. Load this build over it (Reload on the unpacked extension, or install the new `.zip` over the
   same profile — *not* a fresh profile, which would be an install, not an update).
5. Open the popup, then click **Capture Bug** on any ordinary page.

**Pass:** two things at once.
- `chrome.storage.local.get("tb_record_opts")` → `{ video: true, videoSetBy: "user" }`, and
  `localStorage.getItem("tracebug_record_opts")` → `null` (migrated and cleaned up). The choice is
  preserved for 1.11.1.
- **No screen-share dialog opens**, and the capture is events-only: the HUD has no Mic button and
  the finished ticket has no video. The popup shows no **Record video too** row at all.

**Fail (blob lost or `video` gone)** means the migration dropped the choice — this user has to
re-choose in 1.11.1, which is exactly what leaving the key in place was meant to avoid.

**Fail (a picker opens)** means something still reads the preference as permission to record. That
is the transport guarantee breaking, not a copy bug — stop and check `isVideoOffered()`.

### 2. A pre-option profile gets `video: true` seeded, not false

1. Install a build from **before** the Record-video option existed (pre-Phase-4 1.11 dev build, or
   1.10.x without ever touching Record options).
2. Optionally set a surface or a delay in Record options, so the legacy blob exists but carries no
   `video` field. Verify: `localStorage.getItem("tracebug_record_opts")` has no `"video"` key.
3. Load this build over the same profile.
4. Open the popup, then read `tb_record_opts`.

**Pass:** `{ video: true, videoSetBy: "default" }`, with any surface/delay preserved — and the
capture is still events-only. This user recorded video on every capture before 1.11, so when the
feature returns it must come back on for them without their having to find the setting.

**Fail (`videoSetBy: "user"`)** means something stamped a choice the user never made — a future
default change would then never reach them.

**Fail (`video: false` or absent)** means either the update seed did not run or the popup's
migration overwrote it with a literal `false`. Both have regressed before.

### 3. A fresh install gets `video: false`, and stays false

1. Install this build on a **clean** profile.
2. Open the popup and read `tb_record_opts`.
3. Reload the unpacked extension once (this fires `onInstalled` with reason `update`).
4. Open the popup and read it again.

**Pass:** `video: false` both times, and no screen-share dialog on a capture either time. Step 3 is
the guard: the update default must not re-apply to someone this build already defaulted, or every
new installer would get video switched on by their first update — in 1.11.1, the release where that
would suddenly become visible.

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

### 9. The oversize-export notice and the canvas warning

**Oversize export — SKIPPED IN 1.11, VIDEO PAUSED.** The notice only fires on the branch where a
video is embedded and there is no DOM replay, which the extension cannot produce while screen
recording is off. There is nothing to drive it with, and `_oversizeExportNotice` is unchanged.
**Restore this row in 1.12 (video moved there — see PLAN Phase 10)**, in full: capture with **Record video too** on, record past the
20 MB estimate on the **Export replay (.html)** button (roughly 2-3 minutes of tab video), then open
the ticket modal. Pass: an amber notice above the export row names the size and GitHub's 25 MB cap,
offering **Export without video** and **Download .webm separately**; the first produces a far
smaller file that still has the console, network, actions and screenshots. With a DOM-replay
capture the notice must not appear at all, however long the capture.

*(The npm SDK still records video, so this path can be exercised there if you want coverage before
1.11.2 — but it is the SDK's exporter you would be testing, not the extension's.)*

**Canvas warning — RUN THIS.** Start a capture on a page whose content is a large canvas - a
charting page, Google Maps, any WebGL demo. **Pass:** a toast appears naming the canvas, saying
console/network/clicks are still captured, and - because video is paused - pointing at
**screenshots** and naming 1.11.3, **not** "Record video too". It offers **Stop** and disappears on
its own after about 12 seconds. It must NOT appear on an ordinary page, nor on a dashboard of small
sparkline charts. (In 1.11.3 the advice reverts to **Record video too** on its own: the copy
branches on `isVideoOffered()`.)

### 10a. A capture ends when you leave the site, and does not come back (1.11.1)

> **1.11.2 (T-13):** the popup's **Keep capturing across sites** row is gone — granting `<all_urls>`
> bought only cosmetic toolbar-visibility, not a capability worth a broad permission prompt, since a
> capture ends on cross-origin navigation either way. Run this row with `<all_urls>` **ungranted**
> (the only state a 1.11.2 install can be in without carrying it over from an earlier version).

Start a capture on one site, click something, then navigate to a **different site** (a different
host, not another page). **Pass:** the capture bar is gone, and a notice on the new site reads
*"Capture ended when you left `<host>` … go back to `<host>` to open its ticket"* - naming the host
you actually left. Nothing is capturing here: open TraceBug and there is no Stop control.

Now go **back** to the first site. **Pass:** no capture bar reappears, no timer is counting, and
TraceBug's saved tickets still contain what you captured there. A bar that returns with a running
timer is the 1.11.0 bug and is a **stop-ship**.

Finally, same-site navigation must still work: start a capture and click a link **within** the same
site. **Pass:** the bar comes back and the timer keeps counting from the original start, not 00:00.
(`e2e/ext-cross-site-capture.e2e.mjs` covers all three plus a service-worker restart, but these are
rendered surfaces - read the sentence on screen.)

### 10b. The capture bar says what it is, and what it has (1.11.1)

Start a capture on any ordinary page. **Pass:** beside the dot it reads **"Replay, not video"**, and
the tally starts at **"0 events"** in amber. Click a few things and type into a field. **Pass:** the
tally rises - `N events · M requests` - and loses the amber once something lands. Stop, and check the
ticket's own header: **the request count must match what the bar last showed** (they run the same
de-duplication; a mismatch means the bar is counting rows the ticket throws away).

### 10c. The embedded-frame warning (1.11.1)

Start a capture on a page whose main content is in an `<iframe>` covering a good part of the window
(a CodePen/JSFiddle result pane, an embedded editor, a page with a large embedded map). **Pass:** a
toast says a large part of the page is inside an embedded frame, that clicks/typing/console/network
inside it are not captured and the rest of the page is, and suggests screenshots. It must NOT appear
on an ordinary page, nor for small embedded widgets (a YouTube thumbnail, a chat bubble).

Then click **inside the frame** several times while the capture runs. **Pass:** the HUD tally stays
at 0 - which is the warning being true, and is exactly what a tester needs to see before spending a
capture. Everything you do outside the frame still counts.

### 10d. A sensitive editor is masked in the replay (1.11.1)

Find or build a page with a `contenteditable` editor whose label, id or `aria-label` contains
"password", "secret", "token", "ssn" or "credit" (a note field named "Password hint" is enough), plus
a normal editor beside it. Put text in BOTH **before** starting the capture, start it, then type more
into each. Export the replay and open the `.html`.

**Pass:** in the replayed page the sensitive editor shows `*` characters - both the text that was
there before the capture and what was typed during it - while the normal editor's text is readable.
The ticket's Actions tab shows `[REDACTED]` for the sensitive one. **Fail (stop-ship):** the
sensitive text is legible anywhere in the exported file - search the `.html` for it.

If you have **Mask patterns** configured in the popup, repeat with text matching one of them in an
ordinary paragraph: it must be masked in the replay too.

### 10e. An `<all_urls>` grant from before 1.11.2 can still be removed (1.11.2, T-13)

Load a profile with `<all_urls>` already granted (`chrome.permissions.contains({origins:["<all_urls>"]})`
→ `true` in the service-worker console — see `docs/testing/upgrade-host-permission.md` for how to get
one). Open the options page. **Pass:** an "Access to all sites" card is visible, reading **Granted**,
with a **Remove** button. Click it. **Pass:** the card disappears, and
`chrome.permissions.contains({origins:["<all_urls>"]})` now returns `false`. On a profile where
`<all_urls>` was never granted, the card must not appear at all — and the popup has no
"Keep capturing across sites" row on either profile.

### 10f. The welcome page (1.11.2)

Install the packaged build into a clean profile. **Pass:** the welcome tab opens on its own, shows the
real version, three steps, your actual capture shortcut as key caps (`⌥` instead of `Alt` on a Mac),
and **Copy** next to `npx tracebug mcp` puts that text on the clipboard (or selects it and says so).
In Firefox, step 1's pinning sentence is the Firefox one (puzzle piece → TraceBug's menu → Pin to
Toolbar). Check both light and dark mode, and a narrow window (cards stack below ~760px).
`node e2e/welcome-screenshots.mjs` shoots all four for you.

### 10g. After export, and errors during a capture (1.11.2, T-05/T-06)

Export a replay. **Pass:** no hand-off dialog opens on its own; the toast reads "✓ Replay exported ·
N MB" with an **Open in your AI agent →** link, and clicking it opens the MCP card. Then, during a
capture, trigger a page error (`setTimeout(() => { throw new Error("x") })` in the console). **Pass:**
the error card shows, with **no** Capture Bug button — only Dismiss (and Open in editor where it
applies). Outside a capture, the same error card still offers Capture Bug.

### 10h. A site that runs its own TraceBug (1.11.2, Bug 0)

Serve a local page that loads `website/public/tracebug-sdk.js` and calls
`TraceBug.init({ projectId: "x", enabled: "all" })` (its toolbar shows — the same page as
`FIXTURE_WITH_UI` in `e2e/ext-sdk-isolation.e2e.mjs`). Click the extension icon. **Pass:** the popup says *"This site runs its own TraceBug"* and does not start a
capture; `Alt+B` shows the same sentence on the page. Exactly one TraceBug toolbar is ever visible.
`e2e/ext-sdk-isolation.e2e.mjs` covers the logic; this row is the rendered sentence.

### 10. Diagnostics

Open the popup, expand **Having trouble?**. **Pass:** the summary says "no errors" on a clean session.
Click **Copy diagnostics** and paste it somewhere: it must name TraceBug's version, your browser and
OS, the granted permissions, and end with "No URLs, page content or stored values are included".

Then force an error - open the popup on a `chrome://` page, or reload the extension mid-capture - and
copy again. **Pass:** the error appears with a TraceBug file name and line number, and **no URL,
hostname, file path or page text anywhere in the output**. Read it properly; this is the text users
will paste into public issues.

Finally click **Report a TraceBug bug**. **Pass:** GitHub's new-issue form opens with the diagnostics
in a collapsed block, nothing is submitted, and the URL is not so long the browser truncates it.

