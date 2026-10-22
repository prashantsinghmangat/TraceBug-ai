# Product-flow walkthrough — raw evidence

Captured 2026-10-21 against the packaged 1.11.1 Chrome build (`tracebug-extension/dist/chrome`,
built fresh via `npm run build:ext` before this run) and `website/public/try.html` served locally.
Viewport 1440x900, deviceScaleFactor 2, light theme, unless noted. Screenshots live next to this
file in `docs/audit/product-flow/`.

**Harness note that applies to every flow below:** Playwright cannot click a real browser toolbar
icon, so the extension's popup was driven by opening `chrome-extension://<id>/popup.html` as a
plain tab and stubbing `chrome.tabs.query({active:true,currentWindow:true})` to resolve to the real
sandbox tab (the same technique `e2e/marketing-screenshots.mjs` uses). Because of that, `activeTab`
— which in real use is granted by the genuine click on the toolbar icon — is never actually granted
to the sandbox tab in these runs. Flows 1, 2, 3, 4 and 5 therefore ran against a **copy** of the
packaged build with `<all_urls>` pre-declared in `host_permissions` (`e2e/ext-host-access.mjs`'s
`withGrantedHostAccess`, the same fixture the existing e2e suite uses), standing in for "a user who
already granted site access." The plain, as-shipped build (no granted host access) was used
specifically for the edge states in Flow 6 where that distinction is the point.

---

# Flow 1: Main flow end to end (packaged Chrome build)

Build/setup notes: `npm run build:ext` run fresh first. HUD root id confirmed by inspecting the live
DOM: `#tracebug-recording-hud` (not guessed — read from `src/ui/recording-hud.ts`). Ticket modal root:
`#tracebug-quick-bug-modal`.

Steps:
1. Screen: try.html loaded, TraceBug's own in-page demo widget visible (vertical icon rail, bottom
   right — this ships baked into try.html itself, separate from the extension). | Screenshot:
   `01-try-page.png` | User sees: "Acme Checkout" demo card, a banner explaining the two seeded bugs,
   and "Reproduce the bugs" instructions. | Decision: none yet. | Action: none (page load).
2. Screen: extension popup, freshly opened on this tab. | Screenshot: `02-popup-default.png` | User
   sees: hostname row ("localhost /try.html"), primary **Capture Bug** button ("Console, network &
   replay · stop when done"), secondary buttons (Record options, Screenshot only, View tickets,
   Inspect element, Redaction rules), a **Keep capturing across sites** row already **On** in this
   run (because the test fixture pre-granted `<all_urls>`), a "Having trouble?" row, and a footer hint
   "Nothing is tracked until you pick an action above. Tip: Alt+B captures a bug on this tab." |
   Decision: which of 4 capture modes to start (full capture / screenshot-only / view tickets /
   inspect element). | Action: click `#btnCaptureBug`.
3. Screen: popup still open for ~150ms showing a busy/starting state before it self-closes.
   | Screenshot: `03-popup-starting-toast.png` | User sees: the popup mid-transition (busy state,
   buttons disabled). | Decision: none. | Action: none (observed only).
4. Screen: popup closed itself (programmatic `window.close()` ~350ms after the message succeeds);
   focus returns to the page, which now shows the on-page recording HUD, mounted top-center.
   | Screenshot: `04-hud-active.png` | User sees: a dark pill bar reading a red ● dot, timer "00:01",
   "Capturing", "REPLAY, NOT VIDEO", a live "0 events · 1 request" tally, and icon buttons
   (screenshot, region-screenshot, video, inspect?, blur, checklist, ✕). | Decision: none — this is
   purely a status readout, which is itself a UX point worth noting (see Observations). | Action:
   none yet.
5. Screen: still the try.html page, HUD running. | Screenshot: `05-after-repro.png` | User sees: the
   coupon field now holds "SAVE20", an inline "Order failed: 404 — /api/orders" error banner, and a
   red toast bottom-right reading "Uncaught TypeError: Cannot read properties of undefined (reading
   'discount')" with its own **Capture Bug** / **Dismiss** buttons (a *second*, independent
   "Capture Bug" entry point that this flow did not use). HUD tally now reads "4 events · 2
   requests." | Decision: none (reproducing the two documented demo bugs). | Action: fill
   `#coupon` with "SAVE20" (6 keystrokes), click `#applyBtn`, wait, click `#orderBtn`, wait.
6. Screen: ticket modal opens over the page after clicking Stop. | Screenshot: `06-ticket-modal.png`
   | User sees: title bar "Bug Ticket — Review & Export", auto-filled **Title**: `Try.html Page:
   "Place order" Action Fails — TypeError`, "No screenshots — add one only if you want to", an
   auto-written **Description** starting with `🔍 Possible Cause (high confidence): API POST
   /api/orders failed with 404 after clicking 'Place order'` followed by a **Summary** line that
   reads `API /favicon.ico failed with 404 when clicking 'Place order' button on /try.html` — this
   summary names the wrong request (see Observations) — and an **Error** line with the real
   TypeError. Right panel: Info/Actions(2)/Console(1)/Network(2)/AI tabs, plus URL, timestamp,
   browser, viewport, severity (auto: Critical), etc. Footer: Save Ticket / Copy GitHub Issue /
   Fix with AI / Export replay (.html) · 387 KB / Export HAR / More ▾, with a tip "Ctrl+Shift+B to
   quick-capture anytime" and "Enough info to reproduce? 👍 👎 · Draft auto-saved". | Decision: is
   the auto-written title/description/evidence enough, or does it need editing before export? |
   Action: click `[data-tb-hud="stop"]` (HUD Stop button).
7. Screen: ticket modal, More ▾ menu open. | Screenshot: `07-ticket-modal-more-menu.png` | User sees:
   Download .zip (attach to GitHub) / Download failing test (.spec.ts) / Download report (.md) / AI
   report (.html) — for chat / Linear / Slack / Copy for Jira / Configure integrations… / Export
   footer: on / Issue credit: on — seven export formats plus settings, all in one dropdown.
   | Decision: which of 7 export/send options to use. | Action: click
   `[data-action="more-toggle"]`.
8. Screen: after clicking "Export replay (.html)", a second, unrequested modal appears on top of the
   ticket modal. | Screenshot: `08-after-export.png` | User sees: "✨ Debug this export with your
   coding agent" with a one-time MCP setup command (`claude mcp add tracebug --npx -y tracebug-mcp`),
   a ready-to-paste prompt addressed to an AI coding agent, destination chips ("a developer" / "an AI
   coding agent" / "a GitHub issue" / "just testing"), and a small "✓ Replay exported · 0.4 MB" toast
   at the very bottom. | Decision: which destination chip describes what happens next (changes the
   copied prompt's wording), or dismiss. | Action: click `[data-action="export-replay"]` (this
   screen is what appeared next, unprompted).

Totals: **8 explicit clicks** (popup icon, Capture Bug, Apply coupon, Place order, Stop, More ▾,
Export replay, — not counting dismissing the post-export modal), **6 keystrokes** ("SAVE20"),
**~4 decision points** (which capture mode to start; whether the auto-written ticket is good enough
as-is; which of 7 export/send formats to use; what to do with the unprompted "Debug this export"
screen). From extension-icon-click to a completed .html export: **8 clicks, 6 keystrokes.**

Observations:
- The auto-generated ticket's **Summary** line is factually wrong: it says `API /favicon.ico failed
  with 404 when clicking 'Place order' button` — the favicon 404 is incidental page noise, not the
  bug the user reproduced (`POST /api/orders` 404). The **Possible Cause** line one paragraph above it
  gets this right. A developer skimming only the Summary would be misled about which network call
  actually failed.
- The HUD's own copy says "REPLAY, NOT VIDEO" — a correction/clarification baked permanently into the
  UI, which reads as compensating for a known point of past user confusion (confirmed by
  `docs/audit/capture-architecture.md` §2.5) rather than a UI that is self-evidently clear.
  "Capturing" + a red dot + a running timer still visually resembles a screen-recording indicator at
  a glance.
  - There are **two independent "Capture Bug" entry points** live on the page at once once a capture
  has started: the HUD's own icons, and a separate floating error toast with its own "Capture Bug"
  button that appears whenever an uncaught error fires. Both exist concurrently; a user mid-capture
  could click either.
  - Clicking "Export replay (.html)" does not simply download a file — it opens a second modal
  promoting the MCP/coding-agent workflow before the user can do anything else with the exported
  file. For a user who just wants to attach the file somewhere, this is one more unprompted screen
  and decision in the main path.
- The More ▾ menu packs 7 distinct outputs (zip / spec.ts / md / AI html / Linear / Slack / Jira) plus
  "Configure integrations…" and two toggles, with no grouping — a first-time user has to read all 9
  rows to find the one they want.

---

# Flow 2: Keyboard-shortcut capture

Build/setup notes: bound shortcut read live from `chrome.commands.getAll()` rather than assumed —
came back as **Alt+B** (`tb-quick-capture`) in this environment, not the Ctrl+Shift+B used in some
internal comments/tests. `_execute_action` (the toolbar-icon shortcut) has no binding at all here.

Steps:
1. Screen: popup opened once, before ever using the shortcut. | Screenshot: `09-popup-hint-row.png`
   (same render as `02-popup-default.png`) | User sees: the footer hint row — the **only** place in
   the product that mentions the shortcut before first use: "Nothing is tracked until you pick an
   action above. Tip: Alt+B captures a bug on this tab." It is the last row in the popup, easy to
   miss if the user never scrolls past the primary buttons. | Decision: none. | Action: open popup,
   read hint, close.
2. Screen: try.html, popup closed. | Screenshot: `10-hud-via-shortcut.png` | User sees: **no change**
   — the HUD did not mount. | Decision: none. | Action: attempted `page.keyboard.press("Alt+B")`.

Totals: 1 click (open popup to check the hint), 0 keystrokes beyond the attempted shortcut itself,
1 decision point (did the user ever learn the shortcut exists — yes, via the hint row, but only
after opening the popup once).

Observations: **Could not fully reproduce this flow.** `chrome.commands` shortcuts are dispatched by
the browser's own native key-listening layer outside any page's DOM, and Playwright's
`page.keyboard.press` only sends a key event to the currently focused *page*, not to the browser
chrome. There is no way to simulate a genuine OS-level key chord through this harness, so the HUD
never appeared after the press — this is a tooling limitation, not a product finding. What *is*
verified and real: the shortcut is correctly bound to **Alt+B**, and the only place a first-time user
is told it exists is a single small text line at the very bottom of the popup, which a user who only
looks at the big purple "Capture Bug" button at the top is likely to never read.

---

# Flow 3: Screenshot-only bug

Build/setup notes: none extra.

Steps:
1. Screen: popup opened, click `#btnScreenshot`. | Screenshot: `11-region-select-state.png` | User
   sees: **directly the ticket modal** — see Observations; no separate "drag to select a region"
   state was ever on screen in this run. | Decision: none observed. | Action: click `#btnScreenshot`.
2. Screen: ticket modal, screenshot attached. | Screenshot: `12-screenshot-only-ticket-modal.png` |
   User sees: Title auto-filled to **"Empty Session — No User Interactions"**, "1 screenshot
   attached · 0 events", a screenshot thumbnail showing the page with **black bars down both the
   left and right thirds of the preview image** (see Observations), tabs Info/Actions/Console/
   Network(1)/AI (no Actions or Console badges — nothing was interacted with). | Decision: whether
   to retitle a ticket that currently says "No User Interactions" even though the point was to
   screenshot something specific. | Action: none further in this run.

Totals: 1 click (Screenshot only), 0 keystrokes, 1 implicit decision (retitle or not).

Observations:
- **No region-select / "drag to select an area" intermediate screen ever appeared** in this run —
  clicking "Screenshot only" went straight from the popup to a fully-formed ticket modal with a
  screenshot already attached. (The drag-to-select interaction the marketing screenshots script
  exercises is reached through the *ticket modal's own* "Add screenshot" button, not the popup's
  "Screenshot only" button — these are two different capture paths that both end up attaching a
  screenshot, worth noting as a source of naming overlap.)
- The attached screenshot preview shows **black pillarboxing on both sides** of the actual page
  content, inside the modal's screenshot thumbnail — worth a developer's attention regardless of
  whether the pixels in the underlying file are truly blacked out or the modal's preview frame is
  simply the wrong aspect ratio for a 1440×900 capture.
- The ticket this path produces is titled "Empty Session — No User Interactions," which is accurate
  (no events were captured, only a static shot) but could read as alarming/wrong to a user who
  deliberately chose a screenshot-only bug report and did not expect the word "Empty."

---

# Flow 4: Sending to a tracker, first time + after setup

Build/setup notes: "Configure integrations…" lives in the ticket modal's **More ▾** menu (not the
main popup). `options.html` is reached from there through a `tracebug-open-settings` CustomEvent that
`content-script.js` relays into `chrome.runtime.sendMessage({type:"TB_OPEN_OPTIONS"})`, which the
background worker turns into a new tab.

Steps:
1. Screen: ticket modal → More ▾ → **Configure integrations…**, nothing configured yet.
   | Screenshot: `13-settings-pointer-modal.png` | User sees: **not** the extension-mode "your tokens
   live in the extension, go to settings" pointer the source code is written to show in extension
   mode — instead, the **in-page, page-mode token-entry form** itself (GitHub token field, repo
   field, labels; Linear key/team; Slack webhook; Save/Remove all), i.e. the form meant only for the
   npm-SDK (non-extension) integration. See Observations — **this is a real, reproducible defect**,
   not a harness artifact (independently reproduced in `flow4-verify.mjs` on the simplest possible
   case: GitHub pre-configured in `chrome.storage.local` *before* the capture even starts). |
   Decision: fill in a token here (the website would then hold it — exactly the security model 1.11
   was built to avoid) or find Options another way. | Action: click
   `[data-action="integrations-configure"]`.
2. Screen: `options.html`, opened directly (the in-page pointer button this flow expected was absent,
   so Options was reached by navigating to it directly for the rest of this flow).
   | Screenshot: `14-options-page-empty.png` | User sees: AI Debugger / GitHub / Linear / Slack / cards,
   each tagged "NOT CONFIGURED", plus Microphone and "Sites allowed to run AI analysis" sections, and
   a note about upgrading from pre-1.11 token storage. | Decision: which provider to configure.
   | Action: none yet (navigation only).
3. Screen: options page, GitHub token + repo filled and saved. | Screenshot:
   `15-options-page-github-configured.png` | User sees: GitHub's pill switches to "CONFIGURED"
   (green) and a "Saved." confirmation under the card. | Decision: none. | Action: fill `#ghToken`
   = "ghp_FAKE_AUDIT_TOKEN", fill `#ghRepo` = "acme/widgets", click `#ghSave`.
4. Screen: back on the ticket modal (same session as before, not reloaded). | Screenshot:
   `16-ticket-modal-after-config.png` | User sees: the primary button **still reads "Copy GitHub
   Issue"**, not "Open in GitHub" — i.e. the UI does not recognize that GitHub is now configured. |
   Decision: none — the UI gave no indication anything changed. | Action: none (observed only).
5. Screen/behavior continuation, documented via `flow4-verify.mjs` (a clean rerun with GitHub
   pre-configured from the very start of the session, to rule out a stale-state artifact):
   | Screenshot: `19-verify-ticket-modal-preconfigured.png`,
   `20-verify-configure-integrations-click.png` | User sees: with GitHub configured *before* the
   capture even starts, the primary button is still "Copy GitHub Issue" (confirmed via
   `data-tb-caps` on the page, which correctly reports `"github":true`), and "Configure
   integrations…" still shows the in-page token form, not the extension-mode pointer. | Decision:
   n/a — this is the defect itself. | Action: n/a.
6. Because the ticket modal's own "Copy GitHub Issue" button never takes the real tracker-send path
   in this build, the `confirm-send.html` window itself was reached the same way
   `e2e/ext-provider-confirm.e2e.mjs` does — dispatching the underlying
   `tracebug-provider-request` bridge event directly, to document what that screen looks like.
   Screen: first send request. | Screenshot: `17-confirm-send-first.png` | User sees: "Send this
   report?", "Requested by http://localhost:4715", Destination `acme/widgets`, Via `GitHub`, the
   title and body shown verbatim, "Cancels automatically in 120s", Cancel / Send. | Decision: Send or
   Cancel. | Action: cancelled (to avoid a real network call to api.github.com).
7. Screen: second send request, same configured destination, no reconfiguration. | Screenshot:
   `18-confirm-send-second.png` | User sees: an **identical** window (destination, via, 120s
   countdown) with only the title/body text differing — no extra "first time" step, no fewer fields.
   | Decision: Send or Cancel. | Action: cancelled.

Totals: in the organic path, **3 clicks** before the defect became visible (Configure integrations…,
fill+Save on the options page = 1 click, back to ticket = 0 clicks since it's the same tab) + 2
keystrokes worth of fields filled via `fill()`. The real send/confirm screen was only reachable by
bypassing the broken UI path.

Observations — **this is the most significant finding across all flows audited:**
- **Configuring GitHub (or Linear/Slack) through `options.html` has no effect on the ticket modal's
  send behavior in this build.** The primary "Copy GitHub Issue" button never switches to "Open in
  GitHub," and clicking it always falls back to copy-to-clipboard — even when
  `chrome.storage.local.tb_integrations_v1.github` genuinely holds a token and repo, and even when
  that config was set *before* the capture started (ruling out "stale snapshot from an older
  capture" as the explanation).
- **"Configure integrations…" shows the wrong form.** In extension mode this should show a pointer
  modal ("your tokens are stored by the extension, not this website — open TraceBug settings") per
  `src/ui/quick-bug.ts`'s own `showSettingsPointerModal`/`isExtensionMode()` gate. Instead it renders
  the in-page, page-mode token-entry form — the exact form the 1.11 security work was written to
  retire, because a page-mode form puts secrets into the host page's own DOM. This reproduced
  consistently across three separate attempts (organic flow, a second fresh capture after
  configuring, and the from-scratch `flow4-verify.mjs` check).
  - Taken together: **a first-time user who configures GitHub and tries to send a real issue from the
  extension's ticket modal cannot do so through the UI** — the button always copies markdown to the
  clipboard instead, with no error, no explanation, and no visible sign that anything is
  misconfigured. The underlying send pipeline (confirm-send.html, the 120-second timeout, the
  text-only rendering of the title/body) works correctly when driven directly — the break is
  specifically in how the ticket-modal UI decides whether it's running inside the extension and
  whether an integration is configured.
- The two confirm-send windows (first vs. "after setup") are identical in structure — no extra
  friction returns on a second send, which is the intended, good behavior for this part of the flow.

---

# Flow 5: Finding and reopening an old ticket

Build/setup notes: "View tickets" opens a **popover** (`[data-tracebug="offline-tickets-pop"]` from
`src/compact-toolbar.ts`), not the larger `src/dashboard.ts` panel that the task brief guessed at —
that dashboard component exists in the codebase but this popup button does not route to it.
One real gotcha: closing the ticket modal via a raw DOM `element.remove()` (rather than clicking its
own close button) leaves the module's internal "is a modal already open" guard set, which then
silently blocks "Open" from reopening anything. Closing it by clicking its actual close control avoids
this — recorded here because it cost real debugging time and would confuse anyone re-running this
script, even though it is not something an actual user would ever trigger (a user only ever closes the
real UI, never deletes its DOM node directly).

Steps:
1. Screen: a ticket is saved via **Save Ticket** in the modal (not shown again here — same modal as
   Flow 1). | Decision: none. | Action: click `[data-action="save-ticket"]`, close modal via its own
   close control.
2. Screen: popup → **View tickets**. | Screenshot: `21-ticket-list.png` | User sees: a small
   "Saved Tickets (1)" popover, top-right, listing a thumbnail, auto-title `"Place order" Action —
   ...`, timestamp, "4 events · 5 KB", and three per-card buttons: **Open / Export / Delete**. Footer
   text: "~0.0 MB used · ~5.0 MB free · room for ≈950 more tickets" and "Saved in this browser
   only — tickets stay until you delete them. Clearing site data removes them." | Decision: which
   saved ticket to reopen (only one exists here). | Action: click `#btnViewTickets`.
3. Screen: ticket reopened. | Screenshot: `22-ticket-detail-reopened.png` | User sees: the same ticket
   modal, title `"Place order" Action — API POST Returns 404`, footer button now reads **"✓ Saved"**
   (green, disabled-looking) instead of "Save Ticket", everything else (description, tabs, evidence)
   intact from when it was saved. | Decision: none — purely a review/re-export step. | Action: click
   the card's **Open** button.

Totals: 2 clicks to reopen an existing ticket from the popup (View tickets, Open), 0 keystrokes,
1 decision point (which saved ticket, when more than one exists).

Observations:
- This flow worked cleanly and is a strong point of the product: the saved-ticket list surfaces
  useful at-a-glance information (event count, size, a thumbnail) and storage headroom, and
  reopening restores the exact modal state, including the description text, with no data loss.
- The same "Description" auto-summary defect from Flow 1 persists into the reopened ticket (still
  describes `/favicon.ico`, not `/api/orders`) — it is baked into the saved session, not
  regenerated.

---

# Flow 6: Edge states

Build/setup notes: 6a/6b used the **plain, as-shipped** `tracebug-extension/dist/chrome` (no
`<all_urls>` granted) — the realistic fresh-install state. 6c reused the exact pattern from
`e2e/ext-cross-site-capture.e2e.mjs` (two different-origin local servers, `localhost` vs
`127.0.0.1`), driving `TB_START_RECORDING` directly via `chrome.tabs.sendMessage` rather than the
popup, since the cross-origin mechanics are the point, not the popup click. 6d needed a fixture with
a `<canvas>` covering >25% of the viewport; neither `try.html` nor anything else under
`website/public` has one, so a minimal throwaway page was built for this run only (a single
1200×700 `<canvas>` filled with solid color + text) and is not part of the repo.

### 6a — a restricted page (chrome://extensions)

Steps:
1. Screen: popup opened on a `chrome://extensions` tab. | Screenshot:
   `23-popup-restricted-page.png` | User sees: a page card reading "Chrome settings /
   chrome://extensions", a 🚫 icon, **"TraceBug can't run on this page"**, subtext "Browsers block
   extensions on their own pages and the extension store.", and a single action button **"Try it on
   the bug playground"**. | Decision: none — correctly explained, with one clear next step.
   | Action: open popup on a restricted tab.

Observations: this is the single cleanest, best-explained state encountered in the whole audit — a
specific reason, specific wording, and one actionable next step (a link to try.html), with no dead
end.

### 6b — site access not yet granted

Steps:
1. Screen: popup on a normal `http://localhost` page, `<all_urls>` never granted.
   | Screenshot: `24-popup-no-host-access.png` | User sees: the normal popup, but the **"Keep
   capturing across sites"** row now reads **Off** with explanatory text: "TraceBug only loads on the
   site you start it from. Turn this on and it follows you to other sites, ready to capture there
   too — your browser will ask to allow it." Everything else (Capture Bug, Screenshot only, etc.)
   renders exactly as in the granted-access case. | Decision: whether to turn on cross-site capture
   (and accept the browser's permission dialog) or proceed without it. | Action: open popup; then
   click `#btnCaptureBug` without granting site access.
2. Screen/result: **could not be reliably verified.** | Screenshot:
   `25-capture-without-host-access.png` | User sees: in this screenshot, no HUD and no visible
   change on the page. | Decision: n/a. | Action: n/a.

Observations: **inconclusive, and flagged as a harness limitation rather than a product finding.**
`popup.js`'s own code comments state plainly that `activeTab` (granted by a genuine click on the
browser's toolbar icon) is deliberately enough to start a capture with no permission prompt at all —
this harness cannot produce a real toolbar-icon click (see the harness note at the top of this
journal), so `activeTab` was never actually granted to the tab in this run regardless of what the
popup's own UI believed. The screenshot showing no HUD is therefore most likely this harness
failing to grant a permission a real click would grant, not a real "declined access" product
behavior — this specific sub-case needs a human manually clicking the real toolbar icon
without first granting `<all_urls>` to verify for real (tracked as unverified, not as a defect).

### 6c — leaving the site mid-capture

Steps:
1. Screen: capture running on site A (`http://localhost:4718`). | Screenshot:
   `28-cross-site-hud-on-A.png` | User sees: the HUD, timer running. | Decision: none.
   | Action: `TB_START_RECORDING` sent directly to site A's tab; click the page's own button to
   generate a console error.
2. Screen: navigated to a different-origin site B (`http://127.0.0.1:4719`) mid-capture.
   | Screenshot: `29-cross-site-ended-notice-on-B.png` | User sees: **no HUD**, and instead a
   dismissible red-bordered notice bottom-right: **"Capture ended when you left localhost:4718 —
   captures can't follow you across sites yet. What you captured there was kept: go back to
   localhost:4718 to open its ticket."** with an ✕ to dismiss. | Decision: go back to site A to
   retrieve the ticket, or dismiss and lose easy access to it. | Action: `page.goto` to site B,
   re-inject.

Observations: this works exactly as `docs/audit/capture-architecture.md` §2.1 describes it having
been fixed in 1.11.1 — a real, specific, actionable message instead of a silent data loss. Good,
confirmed-working safety net.

### 6d — a canvas warning

Steps:
1. Screen: capture started on a page whose content is almost entirely one large `<canvas>`.
   | Screenshot: `30-canvas-warning-toast.png` | User sees: the HUD (00:01, "Capturing", "Replay, not
   video", "0 events") plus an immediate action-toast, bottom-right: **"Most of this page is drawn in
   a canvas, which the replay can't record — it will show an empty space. Console, network and your
   clicks are still captured. For a visual record here, take screenshots as you go — screen recording
   returns in 1.11.2."** with a **Stop** button and a ✕. | Decision: keep capturing anyway (console/
   network/clicks still work) or stop. | Action: `TB_START_RECORDING` sent directly to the canvas
   fixture page.

Observations: this is told to the user **immediately when the capture starts**, while they can still
act on it — matches the stated design intent in `capture-architecture.md` exactly, and is clear,
specific, and non-blocking.

### 6e — the "What's New" card

Steps:
1. Screen: popup opened with `tb_whats_new` forced to the current manifest version (1.11.1), which
   does have copy in `popup.js`'s `WHATS_NEW` table. | Screenshot: `26-popup-whats-new.png` | User
   sees: a purple-tinted card at the very top of the popup, **"NEW IN 1.11.1"**, five checkmarked
   bullets describing the capture fixes (deduped network, contenteditable capture, the cross-site
   notice from 6c, the honest HUD tally, the canvas/iframe warning), a pink-tinted note "Screen
   recording is still paused and now returns in 1.11.2 — your setting is kept," and a "Got it" link.
   | Decision: dismiss, or read and act on any of the five items. | Action: force
   `chrome.storage.local.tb_whats_new` to the current version; open popup.

Observations: accurate, specific, and tied to real changes (matches the capture-architecture.md
findings nearly line for line) — a well-executed changelog surface.

### 6f — the review/milestone-ask card

Steps:
1. Screen: 5 saved tickets seeded, then a 6th real capture saved via **Save Ticket**.
   | Screenshot: `27-milestone-ask-card.png` | User sees: a card bottom-right, overlapping the still-open
   ticket modal: **"🎉 That's your 5th saved ticket"**, "Want release updates from the solo dev who
   builds TraceBug? A few emails a year, nothing else.", an email field + **Keep me posted** button,
   and **"No thanks — never ask again"** / "Optional — TraceBug works fully without this, forever."
   | Decision: provide an email, or dismiss (✕, "No thanks", or just ignore it). | Action: seed 5
   sessions via `localStorage`; perform one more real track → stop → Save Ticket cycle.

Observations: correctly framed as optional and low-pressure, with the "never ask again" option
equally prominent to the email field — no dark pattern here. The card overlaps the right edge of the
still-open ticket modal (see screenshot) rather than waiting for it to close, which is a minor visual
collision but does not block either surface from being used.

---

# Flow 7: Firefox

Attempted within a time-boxed effort before falling back, per instructions.

What was tried:
1. **`firefox.launchPersistentContext` with a sideloaded unpacked extension** — wrote the packaged
   Firefox build's path into a profile "proxy file" at
   `<profile>/extensions/tracebug@prashantsinghmangat` (the id read from
   `tracebug-extension/dist/firefox/manifest.json`'s `browser_specific_settings.gecko.id`), plus a
   `user.js` setting `xpinstall.signatures.required=false`, `extensions.autoDisableScopes=0`,
   `extensions.enabledScopes=15`, `extensions.startupScanScopes=15`. Playwright's bundled Firefox
   **did launch** and loaded `try.html` successfully (screenshot `31-firefox-try-page-no-extension.png`
   confirms try.html's own baked-in demo widget renders fine in Firefox regardless of the extension).
   To confirm whether the sideloaded extension actually loaded, the next step navigated to
   `about:debugging#/runtime/this-firefox` to read the installed-extensions list — **this navigation
   timed out after 15s** (`page.goto: Timeout 15000ms exceeded`) and never resolved. This matches a
   known limitation of Playwright's Firefox automation (the Juggler/CDP-equivalent protocol it uses):
   privileged `about:` pages are frequently inaccessible or hang under remote-debugging automation,
   independent of whatever the sideload itself did.
2. **`npm run ext:firefox` (`web-ext run`)** was considered but not run standalone, per the task's own
   note that it blocks until the browser closes and cannot simply be shelled out to and waited on in
   this harness; combining it with Playwright attach was the path above, which hit the `about:
   debugging` hang before reaching the point of attaching a second automation layer to it.

Verdict: **could not confirm whether the extension actually loaded in Firefox**, and therefore could
not reproduce Flow 1 there. What is independently confirmed: `try.html`'s own bundled (non-extension)
demo widget renders correctly in real Firefox (screenshot `31-firefox-try-page-no-extension.png`),
and the Firefox build itself exists and has the expected files
(`tracebug-extension/dist/firefox/manifest.json`, `background.js`, `popup.html`, etc., all present
from `npm run build:ext`'s Firefox output). This is recorded as an unresolved tooling blocker, not as
a product finding — no claim is made here about whether TraceBug itself works correctly in Firefox.

---

# Summary of screenshots produced

`01` through `30` cover Flows 1–6 as described above; `31` is the Firefox baseline (no working
extension verification). `flow1-exported-report.html` is the one real `.html` export produced during
Flow 1, kept alongside the screenshots as supporting evidence (not a screenshot).
