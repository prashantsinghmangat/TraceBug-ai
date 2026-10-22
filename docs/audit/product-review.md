# TraceBug product review — install to filed ticket

Merged 2026-10-22 from four prior passes (`product-flow.md`, `tracebug-product-ux-audit.md`,
`tracebug-product-ux-final-review.md`, `tracebug-control-inventory.md`), now archived under
`docs/audit/archive/` — read this document, not those, for current status; the archived copies keep
the full raw evidence (every screenshot, every e2e output) if you need more detail than fits here.
Screenshots referenced below are in `docs/audit/archive/product-flow/`.

Judged against one goal throughout: **a first-time user should install TraceBug and file a useful
bug ticket without help or confusion, in as few clicks as possible.**

---

## One-page summary

**The core loop works.** A first-time user gets from "click the extension icon" to a completed
`.html` export in **8 clicks, 6 keystrokes, ~4 decisions**, with no dead ends. Two of the five
problems below are already fixed and committed; the rest are scoped, sequenced, and none require a
redesign.

### The 5 biggest problems found

1. **A host page that embeds its own copy of the SDK can silently block the extension from ever
   reaching extension mode** ("Bug 0" — a double-`window.TraceBug` collision). This is what made
   GitHub/Linear/Slack integration look completely broken on `tracebug.dev/try.html`: the real bug
   was never in the options page or the send pipeline, both of which worked correctly the whole
   time. **Fixed on the website** (`try.html` no longer self-starts an SDK); **the extension-side
   isolation fix is still open** — any third-party app using the npm SDK can still trigger this for
   its users once they install the extension. Spec: `sdk-isolation-1.11.2.md`.
2. **The ticket's auto-written Summary line could name the wrong failed request** — e.g. blame
   `/favicon.ico` for a 404 when the real failure was `POST /api/orders`, one line below it in
   Possible Cause, which filtered noise correctly while Summary didn't. **Fixed and committed.**
3. **The GitHub/Linear/Slack buttons didn't say what they were about to do.** The GitHub button said
   "Copy GitHub Issue" even when configured and about to open a real send-confirmation window — not a
   silent or disguised send (every send path already requires an explicit Send click in that window
   before anything leaves the browser), but a genuinely mislabeled control. **Fixed and committed**,
   with a real e2e proving zero `github.com` tabs open in extension mode and the confirm window opens
   correctly.
4. **The ticket modal's More ▾ menu is a flat 11-12 item list** mixing live sends, copy-only exports,
   and settings with no grouping — a first-time user reads every row to find the one they want.
   **Open**, proposed fix below (declutter release).
5. **A 2,430-line session-management panel (`dashboard.ts`) ships mounted on every page but has no
   reachable entry point anywhere in the shipped UI** — confirmed by source (`_panelOpen` is a dead
   constant) and now also confirmed harmless by a real e2e (Tabbing through an active capture never
   reaches it or anything off-screen). **A product-owner decision, not a bug** — restore an entry
   point, consolidate it into the existing ticket popover, or formally retire it.

### The proposed flow, with its click count

No structural change to the main flow — it was already efficient. Fixes 1-3 are correctness, not
step removal: **Flow 1 stays 8 clicks** end to end. One real reduction is available once the
MCP-handoff card's dismissal is remembered (T-05, below): **repeat exports drop to 7 clicks.** The
other concrete improvement is Flow 4 (sending to a configured tracker) going from **effectively
unreachable through the UI** (the mislabeled button + Bug 0 together meant a configured user could
not complete a real send without bypassing the UI entirely) to **2 clicks** from an open ticket modal
to a sent issue (Send to GitHub → Send in the confirm window) — the single largest real-world
improvement in this review, achieved with zero added steps.

### Top 10 changes

| # | ID | Change | Status |
|---|---|---|---|
| 1 | Bug 0 | Give the extension's injected SDK its own global; never adopt a page-defined `window.TraceBug` | Spec written, not built |
| 2 | T-01 | Filter noise requests in the Summary line the same way Possible Cause already does | **Shipped** |
| 3 | T-02 | Tracker button labels/actions reflect real integration state (`hasIntegration`), not a page-mode-only field | **Shipped** |
| 4 | T-03 | Comment clarifying the two "Configure integrations" surfaces so no one re-"fixes" correct code | **Shipped** |
| 5 | T-04 | Regroup the More ▾ menu into Send to / Export / Settings | Open |
| 6 | T-05 | Make the post-export MCP hand-off card skippable after first dismissal | Open |
| 7 | T-06 | Remove the second, independent "Capture Bug" trigger that coexists with the HUD during an active capture | Open |
| 8 | T-07 | Fix "Empty Session — No User Interactions" on a deliberate screenshot-only ticket | Open |
| 9 | T-08 | Add a focus trap/restore to `dashboard.ts`'s overlay (moot while T-11 is undecided) | Open |
| 10 | T-09 | Add an accessible name to the ticket-popover "×" close control | Open |

T-10 (milestone-ask z-index) and T-12 (delete-confirmation consistency, depends on T-11) are real but
lower-priority — see the full change list in Part 4.

---

## Part 1 — flow walkthrough (condensed)

Full method, every screenshot, and the raw click-by-click journal: `docs/audit/archive/product-flow.md`
and `docs/audit/archive/product-flow/JOURNAL.md`. Summary of what each flow found and its current
status:

| Flow | What it covers | Clicks | Status |
|---|---|---|---|
| 1 — main flow | Popup → Capture Bug → reproduce → Stop → ticket modal → More ▾ → export | 8 clicks, 6 keystrokes, ~4 decisions | Works; Summary-line defect (now fixed) was the only correctness issue found |
| 2 — keyboard shortcut | `Alt+B` from anywhere | — | Works (bound correctly); only taught in one small popup footer line |
| 3 — screenshot-only | Popup → Screenshot only | 1 click | Works; title says "Empty Session" (T-07) |
| 4 — sending to a tracker | Configure → capture → send | Was effectively unreachable (Bug 0); now 2 clicks once configured | **Root cause was Bug 0, not the options page or the send pipeline** — both always worked correctly |
| 5 — reopen a saved ticket | Popup → View tickets → Open | 2 clicks, 0 keystrokes | The strongest flow in the product — full state restoration, no data loss |
| 6 — edge states (a-f) | Restricted page, declined site access, cross-site capture end, canvas warning, What's New, milestone-ask | — | 6a (restricted page) is the best-executed state in the product; 6c/6d (cross-site, canvas) both correct and specific; 6b (declined access) unverified — needs a human clicking a real toolbar icon |
| 7 — Firefox | Flow 1 in real Firefox | — | Unresolved tooling blocker (Playwright's Firefox automation hangs on `about:debugging`); needs a manual pass, `npm run ext:firefox` |

---

## Part 2 — control inventory (condensed)

Full per-control tables (every button, toggle, menu item across the popup, HUD, ticket modal, More ▾
menu, MCP hand-off card, saved-ticket list/dashboard, welcome surface): `docs/audit/archive/tracebug-control-inventory.md`.

**What's confirmed working as designed, no change needed:**
- Popup's four-action hierarchy (Capture Bug primary, Screenshot/View tickets/Inspect secondary)
- The HUD's Stop control and live tally
- Linear and Slack's send-or-fallback logic (never had T-02's bug — their labels just didn't reflect
  state, now fixed alongside GitHub)
- The confirm-send pipeline itself (`confirm-send.html`, the 120-second timeout, text-only rendering)
- Restricted-page, cross-site-ended, and canvas-warning edge states
- Jira's copy-only behavior (by design — CORS-blocked, not a bug)
- The 👍/👎 "Enough info to reproduce?" links — traced exactly: plain `<a target="_blank">` links to
  `tracebug.dev/feedback?type=...&area=...&msg=...`, a static canned message only, no report/session
  data, no background fetch. Confirmed gated correctly by the export-footer toggle in the exported
  `.html` (new test, `tests/review-ask.test.ts`). Separately verified the live
  `tracebug.dev/feedback` page: returns 200, has a real Netlify form, and `msg` prefills correctly —
  but **`type` and `area` are silently dropped by the live page** (no field for either), a website-side
  gap outside this review's scope to fix.

**What's confirmed broken and fixed:**
- T-01 (Summary line), T-02 (tracker button labels/actions), T-03 (comment-only clarification) — all
  shipped and committed, with passing unit and e2e coverage.

**What's confirmed broken and still open:** T-04 through T-10, T-12 (see Part 4's change list).

**What's a product decision, not a bug:** T-11 — `dashboard.ts`'s panel is unreachable by any shipped
control. Confirmed this session that the situation is **harmless as it stands**: `mountDashboard()`
is the same call that mounts the compact-toolbar (the real, used UI) — it isn't independently
toggleable from the panel, so no code change was made. Instead, a real e2e
(`e2e/ext-no-offscreen-focus.e2e.mjs`, 6/6 passing) starts a capture on the clean, fixed `try.html`
and Tabs through all 14 focusable elements on the page: none land inside the empty off-screen panel
container, none land off-screen anywhere. The container stays exactly as-is until T-11 is decided.

---

## Part 3 — issue list

Every item, current status, and where its full technical spec lives.

| ID | Problem | Status | Spec |
|---|---|---|---|
| Bug 0 | Extension's injected SDK can adopt a page-defined `window.TraceBug`, staying in page mode forever | **Open** — website symptom fixed, extension isolation not built | `sdk-isolation-1.11.2.md` |
| T-01 | Summary line can headline noise (e.g. `/favicon.ico`) instead of the real failure | **Shipped** | `report-builder.ts` (`generateSmartSummary`), commit `2109479` |
| T-02 | Tracker button label/action driven by a page-mode-only field instead of real integration status | **Shipped** | `quick-bug.ts` (`_githubConfigured`/`_githubButtonLabel`/`_linearButtonLabel`/`_slackButtonLabel`), commits `2109479`, `ebbfe05` |
| T-03 | Risk of "fixing" the already-correct `showIntegrationsConfigModal` extension-mode guard | **Shipped** (comment only) | `quick-bug.ts` near `showIntegrationsConfigModal` |
| T-04 | Flat 11-12 item More ▾ menu, no grouping | Open | Regroup into Send to / Export / Settings |
| T-05 | Post-export MCP hand-off card has no suppression mechanism, fires every time | Open | New `localStorage` dismissal flag + Settings re-enable |
| T-06 | Two independent "Capture Bug" triggers visible during one active capture (HUD + error toast) | Open | Suppress/redirect the toast's button while capturing |
| T-07 | "Empty Session — No User Interactions" misdescribes a deliberate screenshot-only ticket | Open | Stage 1: special-case the title. Stage 2: add `document.title` to `EnvironmentInfo` |
| T-08 | `dashboard.ts` overlay has no focus trap/restore | Open, moot pending T-11 | Port `quick-bug.ts`'s existing pattern |
| T-09 | Ticket-popover "×" has no accessible name | Open | One-line `aria-label` fix |
| T-10 | Milestone-ask card can visually overlap the open ticket modal | Open | Defer display, or lower z-index |
| T-11 | `dashboard.ts`'s panel has no reachable entry point | **Confirmed harmless as-is** (this session's e2e); decision still open | Product-owner call — restore, consolidate, or retire |
| T-12 | Two different delete-confirmation idioms across the two ticket-list UIs | Open, depends on T-11 | Standardize once T-11 settles |

---

## Part 4 — recommendations

### Current vs. proposed flow (Flow 1 — main)

**Current (8 clicks, 6 keystrokes, ~4 decisions):**
1. Click the extension icon → popup opens
2. Click **Capture Bug**
3. Reproduce the bug (type `SAVE20`, click Apply coupon, click Place order)
4. Click **Stop** on the HUD → ticket modal opens, auto-filled
5. Click **More ▾**
6. Click **Export replay (.html)**
7. (unprompted) MCP hand-off card appears — dismiss it
8. *(implicit: review/edit the auto-filled title+description before exporting)*

**Proposed (same 8 clicks on first export; 7 on repeat exports once T-05 ships):**
1. Click the extension icon → popup opens
2. Click **Capture Bug**
3. Reproduce the bug
4. Click **Stop** → ticket modal opens, **Summary now always agrees with Possible Cause** (T-01,
   shipped)
5. Click **Export ▾** (regrouped, T-04) → **.html replay**
6. MCP hand-off card appears **only if not previously dismissed** (T-05) — repeat exports skip
   straight to the file
7. *(same implicit review step)*

Target from the original brief was 3 clicks or fewer from Stop to a filed ticket, and under 60
seconds install-to-first-ticket. **Not realistic here without cutting a real step**, and this review
doesn't recommend cutting one: the auto-filled title/description genuinely needs a glance before
export (that's 1 of the 8 clicks' worth of time, not a wasted click), and More ▾ → a specific export
format is inherent to offering 7 distinct output formats — collapsing it to fewer clicks would mean
guessing which format the user wants, which is worse. The real win available is Flow 4's, below.

### Current vs. proposed flow (Flow 4 — sending to a configured tracker)

**Current, as the bug made it behave:** configure GitHub (3 clicks: Configure integrations… → fill
token+repo → Save) → open a ticket → click the button labeled "Copy GitHub Issue" → **a real send
attempt occurs, disguised by the label** (now understood to be because the SDK never reached
extension mode at all on the buggy `try.html` — see Bug 0). **Effectively unreachable through the UI
as intended** for a user who trusted the label.

**Proposed (now shipped, except Bug 0's extension-side half):** configure GitHub (same 3 clicks) →
open a ticket → click **Send to GitHub** (label now correctly reflects what's about to happen) →
confirm window opens, naming the real destination → click **Send**. **2 clicks from an open ticket
modal to a sent issue**, with the confirm window as the one deliberate pause (it's supposed to be
there — approving a real external API call). This works today on any page that doesn't trigger Bug 0;
closing Bug 0 makes it work everywhere.

### Rough wireframes (text, for discussion — not a design)

**Popup — unchanged.** Both audit passes recommend keeping the current hierarchy: Capture Bug stays
the one visually dominant action, Screenshot-only and View tickets stay secondary. Collapsing
Capture-Bug and Screenshot-only into one button with a sub-menu would cost the majority case (event
capture) a click to reach through a menu, for no real gain.

```
┌─────────────────────────────┐
│ TraceBug               [☾]  │
├─────────────────────────────┤
│ localhost /try.html         │
│                              │
│ ┌─────────────────────────┐ │
│ │ ⚡ Capture Bug            │ │  <- primary, unchanged
│ │ Console, network & replay │ │
│ └─────────────────────────┘ │
│ ⚙ Record options        ▾   │
│ [📷 Screenshot only][☰ View tickets] │
│ [⊞ Inspect element]          │
│ 🛡 Redaction rules        ▾  │
│ ☐ Keep capturing across sites│
│ 🩺 Having trouble?        ▾  │
├─────────────────────────────┤
│ ● Tip: Alt+B captures a bug  │  <- same copy; ALSO echoed
│   on this tab                │     in welcome/what's-new (T-04-adjacent, no change here)
└─────────────────────────────┘
```

**HUD — structurally unchanged; one behavior fix (T-06).**

```
[●] 00:12  Capturing   REPLAY, NOT VIDEO   4 events · 2 requests   [📷][⬚][🔴][🩻][🖌][✓][✕ Stop]
```

The only change: an uncaught error during an active capture no longer offers a second, independent
"Capture Bug" button. Either nothing shows (a capture is already running — there's nothing new to
decide), or the toast points at the existing Stop control instead of starting a second capture path.

**Ticket modal footer — the one structural change (T-04), with the now-accurate labels (T-02,
shipped):**

```
┌────────────────────────────────────────────────────────────────┐
│ Bug Ticket — Review & Export                             [✕]   │
│ TITLE   "Place order" Action — API POST Returns 404             │
│ DESCRIPTION  Possible Cause: API POST /api/orders failed …       │
│              Summary: API POST /api/orders failed with 404 …     │
│              (T-01: Summary always agrees with Possible Cause)   │
│ [Info] [Actions] [Console] [Network] [AI]                        │
├────────────────────────────────────────────────────────────────┤
│ [💾 Save Ticket]                                                  │
│                                                                    │
│  Send to ▾                                                        │
│    GitHub   Send to GitHub        (✓ configured)                  │
│    Linear   Open in Linear        (not configured)                │
│    Slack    Copy Slack Message    (not configured)                │
│                                                                    │
│  Export ▾                                                          │
│    .html replay · .zip · .spec.ts (.md) · AI html · Screenshots    │
│    Jira (copy only)                                                 │
│                                                                      │
│  Settings ▾                                                          │
│    Configure integrations… · Export footer: on · Issue credit: on    │
└────────────────────────────────────────────────────────────────────┘
```

Every current action stays; none are removed. Jira moves into Export and is explicitly labeled
"copy only" so it stops looking equivalent to the three live-send providers above it.

### Change list

Sorted by impact on the first-ticket / send flow. Effort: S (hours), M (a day or so), L (needs a
design/product decision first).

| Change | Type | Why | Effort | Risk | Release |
|---|---|---|---|---|---|
| Bug 0: extension SDK isolation | fix | Blocks the send flow on any page embedding its own SDK (Flow 4) | M | Low — isolated change, e2e spec already written (`sdk-isolation-1.11.2.md`) | **1.11.2** |
| T-01: Summary noise filter | fix | Misleads on every affected ticket (Flow 1) | S | Low | **1.11.2 — shipped** |
| T-02: tracker button label/action | fix | Blocked the send flow, confusing label (Flow 4) | M | Low — shipped, tested | **1.11.2 — shipped** |
| T-03: clarifying comment | docs | Prevents "fixing" correct code | S | None | **1.11.2 — shipped** |
| T-04: regroup More ▾ menu | regroup | 11-12 flat items (Flow 1 step 7) | M | Low-medium — touches `quick-bug.ts`'s largest render block | **1.12** |
| T-05: MCP card dismissal | new | Interrupts every export (Flow 1 step 8) | S | Low | **1.12** |
| T-06: duplicate capture-bug trigger | merge | Two live controls during one capture (Flow 1 step 5) | S | Low | **1.12** |
| T-07: "Empty Session" title | rename / new field | Misdescribes a deliberate screenshot (Flow 3) | S (stage 1) / M (stage 2) | Low | **1.12** |
| T-08: dashboard focus trap | fix | Keyboard/SR users lose focus context | S | Low, moot pending T-11 | **1.12** |
| T-09: close-button aria-label | fix | No accessible name | S | None | **1.12** |
| T-10: milestone-ask z-index | reorder | Visual overlap with the ticket modal | S | None | **1.12** |
| T-11: dashboard.ts panel fate | decision | 2,430 lines, no entry point | — | — | Whenever decided |
| T-12: delete-confirmation consistency | standardize | Two idioms across two ticket-list UIs | S | None, depends on T-11 | **1.12**, after T-11 |

### Release mapping

Per this review's instruction: **1.11.2 = correctness** (Bug 0, and T-01/T-02/T-03, already shipped),
**1.11.3 = video** (the Phase 10 work currently documented in `docs/launch/PLAN.md` as "1.11.2" —
**this review's mapping renumbers it to 1.11.3**; `PLAN.md`'s phase numbering has not been changed to
match and should be reconciled separately, not silently, since that's a bigger structural edit than
this document), **1.12 = declutter** (T-04 through T-10, T-12).

---

## Open product-owner decisions

1. **T-11 — which ticket-list UI is canonical?** Restore `dashboard.ts`'s entry point (lowest
   engineering cost, keeps both surfaces), consolidate the compact-toolbar popover into opening it
   (cleaner end state, more cost), or formally retire `dashboard.ts` after confirming no
   exported-report code depends on its internals (highest cost to verify safely). Confirmed this
   session: leaving it undecided is **not urgent** — the unreachable panel is confirmed harmless
   (unreachable by keyboard, off-screen, mounted alongside the toolbar it can't be split from without
   extra engineering work).
2. **Is there a paused state in events-capture, or is "Stop only" intentional?** No code path for
   either answer was found in any pass.
3. **Jira's long-term presentation** — confirmed permanent copy-only (CORS-blocked). Market it any
   differently now that permanence is confirmed, beyond the T-04 menu move?
4. **MCP hand-off card's re-enable path (T-05)** — a new Settings row, or fold into an existing
   toggle area? Adding a new always-visible setting also sits in tension with "prefer defaults and
   progressive disclosure over adding settings" — worth deciding deliberately, not by default.
5. **`tracebug.dev/feedback`'s dropped `type`/`area` params** — the live page ignores two of the
   three URL params the 👍/👎 links send (confirmed this session, page returns 200, `msg` works,
   `type`/`area` have no corresponding field). Out of this review's scope to fix (website, not
   extension/SDK) but worth someone's attention — right now every 👍/👎 click loses its
   bug-vs-idea and extension-vs-SDK classification.
6. **Firefox verification (Flow 7)** remains an unresolved tooling blocker, unrelated to any finding
   here, still outstanding before a Firefox-inclusive launch claim.
7. **PLAN.md's phase numbering vs. this review's release mapping** — `PLAN.md` Phase 10 is currently
   labeled "1.11.2: video," which this review's mapping (1.11.2 = correctness, 1.11.3 = video) now
   contradicts. Needs a deliberate PLAN.md update, not an incidental one.
