# TraceBug product/UX audit — Part 1: flow walkthrough

Goal this is judged against: **a first-time user should install TraceBug and file a useful bug
ticket without help or confusion, in as few clicks as possible.**

Method: every flow below was driven in a real, bundled Chromium browser against the packaged
1.11.1 build (`tracebug-extension/dist/chrome`, built fresh via `npm run build:ext`) and
`website/public/try.html` served locally, plus one small throwaway canvas-heavy fixture page for
the canvas-warning edge case. A Firefox attempt is included at the end. Screenshots referenced
below live in `docs/audit/product-flow/` next to this file; the full click-by-click raw journal is
`docs/audit/product-flow/JOURNAL.md`.

**A methodology caveat that applies to most flows below:** headless browser automation cannot
click a real browser toolbar icon, so most flows ran against a copy of the extension with
`<all_urls>` pre-granted, standing in for "a user who already granted site access." This is called
out again wherever it matters (Flow 2, Flow 6b). Everything else — what renders, what's
pre-filled, what a button does — reflects the real, shipped UI.

---

## Flow 1 — main flow, end to end

popup → Capture Bug → reproduce the page's two seeded bugs → Stop → ticket modal → More ▾ → export

| # | Screen | User sees | Decision | Action |
|---|---|---|---|---|
| 1 | try.html loaded | `01-try-page.png` — Acme Checkout demo card, instructions for two seeded bugs | none | — |
| 2 | popup opens | `02-popup-default.png` — one primary **Capture Bug** button, four secondary rows, a footer hint about Alt+B | which of 4 modes to start | click **Capture Bug** |
| 3 | popup closing | `03-popup-starting-toast.png` — brief busy state, ~150ms | none | — |
| 4 | HUD mounts | `04-hud-active.png` — dark pill, red ● dot, timer, "Capturing", "REPLAY, NOT VIDEO", live "N events · M requests" tally, icon row | none (status only) | — |
| 5 | reproduce the bugs | `05-after-repro.png` — coupon field filled, inline 404 error banner, and a **second**, independent floating error toast with its own "Capture Bug" button | none | fill `SAVE20` (6 keystrokes), click Apply coupon, click Place order |
| 6 | Stop clicked | `06-ticket-modal.png` — "Bug Ticket — Review & Export", auto-filled title, auto-written description (Possible Cause + Summary + Bug on), Info/Actions/Console/Network/AI tabs, 5 footer actions + More ▾ | is the auto-written content good enough as-is? | click HUD **Stop** |
| 7 | More ▾ opened | `07-ticket-modal-more-menu.png` — 7 export/send items (zip, .spec.ts, .md, AI html, Linear, Slack, Jira) + Configure integrations + 2 toggles, no grouping | which of 7+ items | click **More ▾** |
| 8 | after export | `08-after-export.png` — an unprompted second modal: "Debug this export with your coding agent", an MCP setup command, a ready prompt, destination chips, plus a small "✓ Replay exported" toast | which destination chip, or dismiss | click **Export replay (.html)** |

**Totals: 8 clicks, 6 keystrokes, ~4 decision points**, extension-icon-click to a completed `.html`
export.

Observations:
- **[Finding 2 — confirmed, root cause found, independent of Finding 1]** The auto-written
  **Summary** line is factually wrong: it blames `/favicon.ico` for the 404, while the correct line
  (`POST /api/orders` failed with 404) is one line above it in **Possible Cause**. Root cause:
  `generateRootCauseHint()` (`src/report-builder.ts` ~L511) correctly filters out noise requests
  (`isNoiseRequest()`, `src/url-hygiene.ts` — static-asset extensions including `.ico`) before
  picking a network error to blame. `generateSmartSummary()` (`src/report-builder.ts` ~L349), which
  writes the Summary line, does **not** apply that filter — it uses `report.networkErrors[0]`
  unfiltered, so whichever failed request happened first in the session wins, noise or not. **This
  is non-deterministic, not constant**: re-running the identical repro twice, it showed the wrong
  (`/favicon.ico`) summary once and the correct (`/api/orders`) summary once, depending only on
  whether the favicon's 404 happened to be recorded before `/api/orders`'s. Fix: apply the same
  `isNoiseRequest` preference in `generateSmartSummary` that `generateRootCauseHint` already uses,
  and prefer the network failure closest to the user's last click when more than one real failure
  is present. This is unrelated to the double-SDK bug (Finding 1) — reproduces identically on the
  clean, fixed try.html.
- Two independent "Capture Bug" entry points exist on screen at once once a capture is running:
  the HUD's own icon row, and a separate floating error toast that appears on every uncaught error
  with its own "Capture Bug" button. Confirmed unaffected by Finding 1 — still true on the clean,
  fixed try.html.
- "Export replay (.html)" doesn't just download a file — it opens a second, unrequested modal
  promoting an MCP/coding-agent workflow before the user can do anything else with the file just
  exported. Confirmed unaffected by Finding 1.
- The More ▾ menu packs 7 distinct output formats plus settings and two toggles into one
  undifferentiated list — a first-time user reads all 9 rows to find the one they want. Confirmed
  unaffected by Finding 1 (10 rows counted programmatically on the clean page, consistent with the
  manual count here).
- **[New, 1.11.2 quick win]** The primary tracker button's **label** and its **action** are governed
  by two different checks. The action correctly uses `hasIntegration("github")`
  (`src/integrations/tracker-client.ts`) to decide whether to attempt a real send. The label
  ("Copy GitHub Issue" vs. "Open in GitHub") is governed by a *different*, npm-SDK-only field,
  `_githubRepo` (`src/ui/quick-bug.ts` ~L54-55, set only via `init({githubRepo})` — something the
  extension's `tracebug-init.js` never passes). So in extension mode the button **always** reads
  "Copy GitHub Issue," even once a real integration is configured and clicking it actually opens a
  send confirmation window — the label never reflects what the click is about to do. Fix: the
  label should follow the same check as the action (`hasIntegration`): "Send to GitHub / Linear /
  Slack" when configured, "Copy …" when not.

## Flow 2 — keyboard-shortcut capture

**Status: unaffected by Finding 1** — this flow doesn't touch `window.TraceBug` init at all, so the
double-SDK bug and its website-side fix are both irrelevant here.

Could only be **partially** verified: `chrome.commands` shortcuts are handled by the browser's own
key-listening layer outside any page, which headless automation cannot simulate. What *was*
verified directly from `chrome.commands.getAll()`: the shortcut is bound to **Alt+B** in this
environment (not the Ctrl+Shift+B some internal comments mention — that one collides with the
bookmarks bar and Chrome leaves it unbound). The only place a first-time user is told the shortcut
exists before using it is one small text line at the very bottom of the popup (`09-popup-hint-row.png`,
same render as `02-popup-default.png`): *"Nothing is tracked until you pick an action above. Tip:
Alt+B captures a bug on this tab."* — below four buttons and three collapsible sections, easy to
scroll past.

## Flow 3 — screenshot-only bug

**Status: unaffected by Finding 1** — re-run against the clean, fixed try.html; title still renders
"Empty Session — No User Interactions" identically.

| # | Screen | User sees | Decision | Action |
|---|---|---|---|---|
| 1 | popup → Screenshot only | goes **directly** to a filled ticket modal — no region-select step appeared | none observed | click **Screenshot only** |
| 2 | ticket modal | `12-screenshot-only-ticket-modal.png` — title auto-set to "Empty Session — No User Interactions", screenshot thumbnail with black bars down both sides, no Actions/Console badges | retitle a ticket that says "Empty"/"No User Interactions" even though a screenshot was deliberately taken? | — |

**Totals: 1 click, 0 keystrokes, 1 implicit decision.**

Observations:
- The popup's "Screenshot only" and the ticket modal's own "Add screenshot" / "Take screenshot"
  button are two different capture paths that both end up attaching a screenshot — a naming/mental-model
  overlap worth resolving.
- The attached screenshot's preview shows black pillarboxing on both sides inside the modal's
  thumbnail frame.
- "Empty Session — No User Interactions" is technically accurate but reads as alarming for a user
  who intentionally chose a screenshot-only report.

## Flow 4 — sending to a tracker, first time + after setup

**Status: root cause confirmed, and it was never an options-page bug.** The original framing below
("configuring GitHub has no effect") was the *symptom* as observed on `tracebug.dev/try.html`. The
actual cause: try.html loaded and started its own copy of the SDK in page mode on page load,
*before* the extension injected its own copy — and because both are the same bundle sharing one
`window.TraceBug` global, the extension's `init({transport:"extension"})` call was silently dropped
("Already initialized," `src/index.ts`), so `isExtensionMode()` stayed `false` for the rest of the
page's life regardless of what was configured. Confirmed with a controlled single-variable test (an
identical fixture page, once with the embedded-SDK snippet and once without): **the send/pointer
behavior is correct with no embedded SDK, and breaks the instant the embedded SDK is added back** —
see `docs/launch/sdk-isolation-1.11.2.md` for the full mechanism. `website/public/try.html` is now
fixed (it no longer self-starts; `fix(try):` commit) and re-verified correct on the live site build.
**This will still recur on any real third-party app that embeds the npm SDK and whose user later
installs the extension** — that's tracked as Bug 0 in `docs/launch/PLAN.md` Phase 10, not closed by
the website fix alone. The walkthrough below is left as originally observed (the symptom on the
buggy try.html) since it's still accurate as a description of what breaks when the collision
happens, which is the scenario third-party integrators will still hit until Bug 0 ships.

| # | Screen | User sees | Decision | Action |
|---|---|---|---|---|
| 1 | ticket modal → More ▾ → Configure integrations… (nothing configured) | `13-settings-pointer-modal.png` — a page-mode "bring your own token" form (GitHub token + repo, Linear key + team, Slack webhook, Save/Remove all) | fill a token in here, which would store it in the *website's* localStorage — the exact model 1.11 was built to avoid | click **Configure integrations…** |
| 2 | `options.html`, opened directly since no in-extension pointer appeared | `14-options-page-empty.png` — AI Debugger/GitHub/Linear/Slack cards, each "NOT CONFIGURED" | which provider | — |
| 3 | GitHub configured on the options page | `15-options-page-github-configured.png` — card flips to "CONFIGURED", "Saved." | none | fill token + repo, click **Save** |
| 4 | back on the (same) ticket modal | `16-ticket-modal-after-config.png` — primary button **still reads "Copy GitHub Issue"**, not "Open in GitHub" | none — nothing told the user anything changed | — |
| 5 | re-verified from a clean start (GitHub pre-configured *before* capturing) | `19-verify-ticket-modal-preconfigured.png`, `20-verify-configure-integrations-click.png` — same result: still "Copy GitHub Issue"; `data-tb-caps` on the page correctly reports `"github":true`; Configure integrations… still shows the page-mode form | — | — |
| 6 | the real send pipeline, reached by bypassing the ticket-modal UI (same technique as `e2e/ext-provider-confirm.e2e.mjs`) | `17-confirm-send-first.png` — "Send this report?", requester origin, destination `acme/widgets`, via GitHub, title/body shown verbatim, 120s auto-cancel, Cancel/Send | Send or Cancel | cancelled |
| 7 | a second send, same stored destination | `18-confirm-send-second.png` — identical window, no extra setup friction | Send or Cancel | cancelled |

Totals: 3 clicks get a user to the point where the defect becomes visible (Configure
integrations…, fill + Save on the options page); the real confirm/send screen was only reachable
by going around the ticket-modal UI entirely.

Observations:
- **Configuring GitHub (or Linear/Slack) through the options page has no effect on the ticket
  modal's primary button.** It never switches from "Copy GitHub Issue" to "Open in GitHub," and
  clicking it always falls back to copy-to-clipboard — reproduced three independent ways,
  including with GitHub configured *before* the capture even started (ruling out a stale-session
  explanation).
- **"Configure integrations…" shows the wrong form.** The code (`src/ui/quick-bug.ts`,
  `showSettingsPointerModal` / `isExtensionMode()`) is written to show a pointer ("your tokens live
  in the extension — open TraceBug settings") when running inside the extension. Instead it renders
  the in-page, page-mode token-entry form — the form the 1.11 security work exists to retire,
  because that form would put a real token into the host page's own localStorage.
- **Net effect: a first-time user who configures GitHub and tries to send a real issue from the
  extension's ticket modal cannot do so through the UI**, with no error and no visible sign
  anything is wrong. The underlying send pipeline (`confirm-send.html`, the 120-second timeout,
  text-only rendering of title/body) is confirmed correct when driven directly — the break is
  specifically in how the ticket modal decides whether it's running in extension mode / whether an
  integration is configured.
- The two confirm-send windows (first send vs. after setup) are identical in structure — this part
  genuinely has no extra friction on repeat sends, which is the right behavior.

**Tag: Finding 1, root cause confirmed — the double-SDK collision described above. Fixed on
`tracebug.dev/try.html` (`fix(try):` commit); the underlying extension-side bug (Bug 0,
`docs/launch/PLAN.md` Phase 10 / `docs/launch/sdk-isolation-1.11.2.md`) is still open for any other
page that embeds its own copy of the SDK.** Re-verified on the clean, fixed try.html: the real send
pipeline fires and "Configure integrations…" shows the correct settings pointer — see the
screenshots in `e2e/output/flow4-verify/` (not committed; gitignored run artefacts). The
button-label mismatch noted at the end of Flow 1's observations is a separate, still-open issue
even once Bug 0 ships.

## Flow 5 — finding and reopening an old ticket

"View tickets" opens a popover (`src/compact-toolbar.ts`), not the larger in-page dashboard panel
that also exists in the codebase — that dashboard isn't reached from this button.

**Status: unaffected by Finding 1** — re-run on the clean, fixed try.html: the save/reopen mechanics
are identical. The Summary-line defect (Finding 2, see Flow 1) reproduced in one of two reopened-ticket
re-runs here and not the other, consistent with Finding 2 being non-deterministic rather than caused
by, or cured by, the double-SDK fix.

| # | Screen | User sees | Decision | Action |
|---|---|---|---|---|
| 1 | popup → View tickets | `21-ticket-list.png` — "Saved Tickets (1)" popover: thumbnail, auto-title, timestamp, "4 events · 5 KB", Open/Export/Delete per card, storage headroom footer | which saved ticket (only one here) | click **View tickets** |
| 2 | ticket reopened | `22-ticket-detail-reopened.png` — same modal, footer button now reads "✓ Saved" (disabled-looking), description/evidence intact | none — review/re-export only | click **Open** |

**Totals: 2 clicks, 0 keystrokes, 1 decision point.**

Observations:
- This flow works cleanly and is a genuine strong point: useful at-a-glance info (event count,
  size, thumbnail, storage headroom), and reopening restores exact modal state with no data loss.

## Flow 6 — edge states

**Status: unaffected by Finding 1** — none of 6a-6f render try.html's embedded SDK at all (6c/6d
drove `TB_START_RECORDING` directly on separate fixture pages, the rest don't load any page-mode
SDK), so none of these states interact with the double-SDK collision either way.

**6a — a restricted page** (`chrome://extensions`): `23-popup-restricted-page.png` — page card,
🚫 icon, **"TraceBug can't run on this page"**, subtext explaining why, one action button ("Try it
on the bug playground"). No decision needed — this is the single cleanest, best-explained state
found anywhere in the audit: a specific reason, specific wording, one actionable next step.

**6b — site access not yet granted**: `24-popup-no-host-access.png` — popup renders normally,
"Keep capturing across sites" reads Off with an explanation that it'll prompt the browser if
turned on. **Inconclusive beyond this** (`25-capture-without-host-access.png`): headless automation
cannot produce a genuine toolbar-icon click, which is what grants `activeTab` in real use, so this
sub-case needs a human manually clicking the real toolbar icon to verify for real — flagged as
unverified, not as a defect.

**6c — leaving the site mid-capture**: capture running on site A
(`28-cross-site-hud-on-A.png`) → navigate to a different-origin site B
(`29-cross-site-ended-notice-on-B.png`) — HUD disappears, replaced by a dismissible notice:
*"Capture ended when you left localhost:4718 — captures can't follow you across sites yet. What
you captured there was kept: go back to localhost:4718 to open its ticket."* Works exactly as
`docs/audit/capture-architecture.md` §2.1 describes — a specific, actionable message instead of
silent data loss.

**6d — a canvas warning**: capturing on a page that's almost entirely one large `<canvas>`
produces, immediately (`30-canvas-warning-toast.png`): *"Most of this page is drawn in a canvas,
which the replay can't record — it will show an empty space. Console, network and your clicks are
still captured. For a visual record here, take screenshots as you go — screen recording returns in
1.11.2."* with Stop / ✕. Surfaced while the user can still act on it — matches the stated design
intent.

**6e — the "What's New" card**: `26-popup-whats-new.png` — purple card at the top of the popup,
"NEW IN 1.11.1", five checkmarked bullets describing the real 1.11.1 capture fixes, a note that
video is still paused, "Got it". Accurate and specific — a well-executed changelog surface.

**6f — the review/milestone-ask card**: after a 5th saved ticket, `27-milestone-ask-card.png` — a
card overlapping the still-open ticket modal's right edge: "🎉 That's your 5th saved ticket", an
email field + "Keep me posted", and an equally prominent "No thanks — never ask again" /
"Optional — TraceBug works fully without this, forever." Correctly low-pressure, no dark pattern.
Minor: it visually overlaps the ticket modal rather than waiting for it to close.

## Flow 7 — Firefox

**Status: unaffected by Finding 1** — try.html's own embedded SDK is what collided with the
extension in Chromium; this flow never got far enough to load any SDK at all (Chromium or
Firefox), so nothing here bears on Finding 1 either way.

Could not be reliably reproduced. Playwright's bundled Firefox launched and loaded `try.html`
correctly (`31-firefox-try-page-no-extension.png` — this just confirms try.html's own baked-in demo
widget, unrelated to the extension, renders fine in Firefox). A sideload of the unpacked Firefox
build was attempted via a profile proxy file plus the usual `xpinstall.signatures.required=false`
preferences, but confirming whether it actually loaded required opening
`about:debugging#/runtime/this-firefox`, which hung and timed out under Playwright's Firefox
automation — a known limitation of that protocol with privileged pages, independent of whether the
sideload itself worked. This is recorded as an **unresolved tooling blocker**: no claim is made
here, positive or negative, about how TraceBug behaves in real Firefox. It needs a manual pass
(`npm run ext:firefox`, watched by a person) to actually verify.

---

## Status summary (2026-10-21 update)

| Flow | Status re: Finding 1 (double-SDK) |
|---|---|
| 1 — main flow | Unaffected itself; its Observations carry Finding 2 (Summary line, independent root cause found) and the new button-label quick win |
| 2 — keyboard shortcut | Unaffected |
| 3 — screenshot-only | Unaffected, re-verified on the clean page |
| 4 — tracker send | **Was** Finding 1 in full. Root cause confirmed (website embedded its own SDK), fixed on `try.html`; extension-side fix (Bug 0) still open — see `docs/launch/sdk-isolation-1.11.2.md` |
| 5 — reopen a ticket | Unaffected, re-verified on the clean page |
| 6 — edge states (a-f) | Unaffected |
| 7 — Firefox | Unaffected (never reached SDK load either way) |

Finding 2 (the Summary-line defect) is confirmed independent of Finding 1 — its own root cause is
in `src/report-builder.ts`'s `generateSmartSummary`, detailed in Flow 1's Observations above.

## What to check before Part 2

- Flow 6b (declined site access) and Flow 7 (Firefox) are both flagged unverified rather than
  pass/fail — worth a manual check if either matters for the recommendations.
- Everything else above was directly observed and screenshotted; the raw step list with every
  selector and exact action is in `docs/audit/product-flow/JOURNAL.md` if you want to see more
  detail than this summary carries.
