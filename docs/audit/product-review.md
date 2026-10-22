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

**The core loop works.** Counting only clicks on TraceBug's own UI (not the bug-repro steps a tester
does on their own page — typing a coupon code, clicking "Apply," clicking "Place order"), a
first-time user gets from the extension icon to a completed `.html` export in **4 clicks + 1 forced
dismissal per export until T-05 (then 4)**: icon → Capture Bug → Stop → Export replay, then the
unprompted MCP hand-off card every single time. **From Stop, filing a ticket is 1 click; sending it to
a configured tracker is 2** (Send to GitHub → Send in the confirm window) — both already inside the
≤3-click target this review was judged against. Two of the five problems below are already fixed and
committed; the rest are scoped, sequenced, and none require a redesign.

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
5. **A 2,430-line session-management panel (`dashboard.ts`) has no reachable entry point anywhere in
   the shipped UI.** What's on every page by default is an empty, off-screen container for it
   (`#tracebug-dashboard-panel`, `right: -480px`) — created as a side effect of mounting the real,
   used compact-toolbar (the two aren't independently toggleable at that call site), with the
   panel's actual content never built until something calls `renderPanel()`, which nothing shipped
   does (`_panelOpen` is a dead constant). Confirmed keyboard-unreachable by a real e2e: Tabbing
   through an active capture never lands on anything inside that container or positioned off-screen.
   **A product-owner decision, not a bug** — restore an entry point, consolidate it into the existing
   ticket popover, or formally retire it.

### The proposed flow, with its click count

No structural change to the main flow — it was already efficient, and already meets the target.
TraceBug-only clicks, bug-repro steps excluded throughout:

- **Icon to filed ticket: 4 clicks + 1 forced dismissal per export until T-05 (then 4)** (icon →
  Capture Bug → Stop → Export replay — a direct footer button, `quick-bug.ts:757`, never routed
  through More ▾ — then the unprompted MCP hand-off card every time). **Stop → file = 1 click**
  (2 including the forced dismissal, until T-05).
- **Icon to a sent issue: 5 clicks** (the same 4, with the last swapped for Send to GitHub → Send in
  the confirm window; no export happens on this path, so no hand-off card). **Stop → sent = 2
  clicks.**

Both the file and send paths already meet the ≤3-clicks-from-Stop target this review was judged
against, counting only TraceBug's own required clicks. Fixes 1-3 are correctness, not step removal,
so neither count above moves for them — what changed is that Flow 4's 2-click send path went from
**effectively unreachable through the UI** (the mislabeled button + Bug 0 together meant a configured
user could not complete a real send without bypassing the UI entirely) to actually reachable. The MCP
hand-off card is counted as a forced click above, not a free one: it fires unconditionally after
every export with no way to turn it off today (T-05, below).

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
| 1 — main flow | Popup → Capture Bug → reproduce → Stop → ticket modal → export | 4 TraceBug clicks (icon, Capture Bug, Stop, Export replay — a direct footer button, not via More ▾); bug-repro clicks not counted | Works; Summary-line defect (now fixed) was the only correctness issue found |
| 2 — keyboard shortcut | `Alt+B` from anywhere | — | Works (bound correctly); only taught in one small popup footer line |
| 3 — screenshot-only | Popup → Screenshot only | 1 click | Works; title says "Empty Session" (T-07) |
| 4 — sending to a tracker | Configure (one-time) → capture → send | Was effectively unreachable through the UI (Bug 0); now Stop → sent = 2 TraceBug clicks once configured | **Root cause was Bug 0, not the options page or the send pipeline** — both always worked correctly |
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
  `.html` (new test, `tests/review-ask.test.ts`). The live `tracebug.dev/feedback` page: returns 200,
  has a real Netlify form, and all three params work correctly — `type`/`area` select pill buttons
  (`website/app/feedback/FeedbackForm.tsx`) rather than native `<select>`/`<input>` elements, so an
  earlier pass in this review that only queried `input,select,textarea` missed them and wrongly
  reported them as dropped. Corrected this session: a real local submission
  (`next dev`, intercepting the outgoing POST) confirms the exact body sent is
  `form-name=feedback&bot-field=&message=...&email=&type=bug&area=extension&version=v1.11.1` — every
  field present and correct, and `website/public/__forms.html` (the static Netlify form-detection
  twin) already declares `type`/`area` as recognized field names. **No website change needed.**

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
| Bug 0 | Extension's injected SDK can adopt a page-defined `window.TraceBug`, staying in page mode forever | **Shipped (1.11.2)** — own global (`window.__TraceBugExtension`) plus defer-to-host-toolbar; `e2e/ext-sdk-isolation.e2e.mjs` | `sdk-isolation-1.11.2.md`, commits `422361e`, `28f4414` |
| T-01 | Summary line can headline noise (e.g. `/favicon.ico`) instead of the real failure | **Shipped** | `report-builder.ts` (`generateSmartSummary`), commit `2109479` |
| T-02 | Tracker button label/action driven by a page-mode-only field instead of real integration status | **Shipped** | `quick-bug.ts` (`_githubConfigured`/`_githubButtonLabel`/`_linearButtonLabel`/`_slackButtonLabel`), commits `2109479`, `ebbfe05` |
| T-03 | Risk of "fixing" the already-correct `showIntegrationsConfigModal` extension-mode guard | **Shipped** (comment only) | `quick-bug.ts` near `showIntegrationsConfigModal` |
| T-04 | Flat 11-12 item More ▾ menu, no grouping | Open | Regroup into Send to / Export / Settings |
| T-05 | Post-export MCP hand-off card has no suppression mechanism, fires every time | **Shipped (1.11.2)** | Replaced by a one-line "Open in your AI agent →" link on the export toast (`quick-bug.ts`, `showActionToast`); no flag needed |
| T-06 | Two independent "Capture Bug" triggers visible during one active capture (HUD + error toast) | **Shipped (1.11.2)** | The live-bug card drops its Capture button while `isRecording()` (`index.ts`, `live-bug-card.ts`; `tests/live-bug-card.test.ts`) |
| T-07 | "Empty Session — No User Interactions" misdescribes a deliberate screenshot-only ticket | Open | Stage 1: special-case the title. Stage 2: add `document.title` to `EnvironmentInfo` |
| T-08 | `dashboard.ts` overlay has no focus trap/restore | Open, moot pending T-11 | Port `quick-bug.ts`'s existing pattern |
| T-09 | Ticket-popover "×" has no accessible name | Open | One-line `aria-label` fix |
| T-10 | Milestone-ask card can visually overlap the open ticket modal | Open | Defer display, or lower z-index |
| T-11 | `dashboard.ts`'s panel has no reachable entry point | **Confirmed harmless as-is** (this session's e2e); decision still open | Product-owner call — restore, consolidate, or retire |
| T-12 | Two different delete-confirmation idioms across the two ticket-list UIs | Open, depends on T-11 | Standardize once T-11 settles |
| T-13 | The "Keep capturing across sites" toggle requests a broad `<all_urls>` permission for very little — it doesn't let a capture survive leaving its site (that's unconditional, by design) and doesn't gate Capture Bug or `Alt+B` on a new site (both grant `activeTab` fresh regardless); its only effect is skipping one click to restore the toolbar's visibility on a tab's next site | **Shipped (1.11.2)** — popup row removed; options shows an existing grant with Remove. Manifest still declares `<all_urls>` optional (needed for custom Ollama hosts) | Hide the row entirely (popup and Options) until ADR 008 (v2.0) makes captures actually survive cross-origin navigation |

---

## Part 4 — recommendations

### Current vs. proposed flow (Flow 1 — main)

Counting only clicks on TraceBug's own UI — not the bug-repro steps a tester performs on their own
page, which are the same in every variant below and aren't TraceBug's to optimize.

**Current (4 clicks + 1 forced dismissal per export until T-05, then 4 — ~2 decisions; already meets
the target):**
1. Click the extension icon → popup opens
2. Click **Capture Bug**
   *(tester reproduces the bug on their own page — not a TraceBug click)*
3. Click **Stop** on the HUD → ticket modal opens, auto-filled, Summary line now always agrees with
   Possible Cause (T-01, shipped)
4. Click **Export replay (.html)** — a direct footer button (`quick-bug.ts:757`), never routed
   through More ▾
5. **Forced:** dismiss the unprompted MCP hand-off card — every export, no way to turn it off today

**Stop → file = 1 click, or 2 counting the forced dismissal** (steps 4-5). The 1-click figure already
meets the ≤3-clicks-from-Stop target this review was judged against, and did before any fix in this
review — the flow was never the problem. The forced dismissal is real friction this review doesn't
excuse by leaving it uncounted (T-05, Part 4's declutter proposal addresses this).

**Proposed, once T-05 ships:** the same 4 clicks, with step 5 gone entirely — the hand-off card only
appears on the first export per browser profile — repeat exports go straight to the file with no
extra dismissal.

The structural proposal for this flow (grouped menu, one primary button chosen by setup, the hand-off
card replaced with a one-line link) is in the declutter section below, not here — this section is the
click-count correction only.

### Current vs. proposed flow (Flow 4 — sending to a configured tracker)

Setup is one-time and separate from the per-ticket count: Configure integrations… (1 click) → fill
token + fill repo (2 fields, not clicks) → Save (1 click) = 2 TraceBug clicks, once, ever, per
provider.

**Current, as the bug made it behave:** ticket modal open → click the button labeled "Copy GitHub
Issue" → **the real confirm-send window opens instead of a copy happening** — confusing (the label
promised something else), but not silent: the window still names the destination and requires an
explicit Send click, same as every send path in the product, before anything leaves the browser. This
happened because the SDK never reached extension mode at all on the buggy `try.html` (see Bug 0).
**Effectively unreachable through the UI as intended** for a user who trusted the label and expected a
copy.

**Proposed (now shipped, except Bug 0's extension-side half):** ticket modal open → click **Send to
GitHub** (label now correctly reflects what's about to happen) → confirm window opens, naming the
real destination → click **Send**. **Stop → sent = 2 clicks**, with the confirm window as the one
deliberate pause (it's supposed to be there — approving a real external API call). Already meets the
≤3-click target. This works today on any page that doesn't trigger Bug 0; closing Bug 0 makes it work
everywhere.

### The declutter proposal (recommendation for 1.12)

This is the product owner's proposal, carried here as the recommendation — not this review's earlier,
more conservative draft. Every item stays in TraceBug; nothing listed here is removed from the
product, only relocated or collapsed. Where this review disagrees with a specific placement, that's
marked as a **Reviewer note** beside the item — the proposal itself is unchanged by that note.

#### Popup

**Proposal:** one primary **Capture Bug** with "or press Alt+B" beneath it; Screenshot and View
tickets secondary. Move Redaction rules and Having trouble? to the options page. Drop the theme
toggle (follow the system). Inspect becomes secondary, grouped with Screenshot and View tickets.

```
┌─────────────────────────────┐
│ TraceBug                    │   <- theme toggle dropped (follows system)
├─────────────────────────────┤
│ localhost /try.html         │
│                              │
│ ┌─────────────────────────┐ │
│ │ ⚡ Capture Bug            │ │  <- primary, unchanged
│ │ Console, network & replay │ │
│ │ or press Alt+B            │ │  <- NEW: shortcut now visible on the primary action itself
│ └─────────────────────────┘ │
│ [📷 Screenshot][☰ Tickets][⊞ Inspect] │  <- three secondary actions, one row
├─────────────────────────────┤
│ Options: Redaction rules · Having trouble?                │
└─────────────────────────────┘
```

**Click/decision count:** 0 change to the main capture path — Capture Bug is still 1 click, same
position. The shortcut hint moving onto the primary button (rather than a footer line the audit found
easy to miss) is a pure discoverability gain, not a click change.

**What this removes from the main path:** nothing — neither Redaction rules nor Having trouble? were
ever on the capture path; they were optional, collapsed `<details>` rows already. What it costs:
reaching either now takes popup → Options (a new tab) → the specific section, instead of expanding a
row in place — acceptable for both, since they're rare, setup-time or trouble-time actions.

**Recommendation — hide the cross-site toggle entirely until ADR 008 lands, don't move it to
Options.** Checked exactly what granting `<all_urls>` buys today, since a capture already ends the
moment you leave its site regardless (Flow 6c, working as designed): it does **not** let a capture
survive the navigation — that's unconditional, by design, independent of this permission. What it
actually does, traced through `background.js`'s `tabs.onUpdated` handler: if the user previously
turned the in-page toolbar on for a tab (`activeTabs.has(tabId)`), granting `<all_urls>` lets the
worker silently re-inject the toolbar on the next site that tab navigates to, instead of it
disappearing until the user clicks the extension icon again. That's the entire benefit — and it's
moot for the actual capture flow, since both a toolbar click and the `Alt+B` command already grant
`activeTab` fresh on any site with no permission needed (confirmed in the same file's own comment:
*"No new permission is involved. Invoking an extension command grants activeTab... the same way
clicking the toolbar icon does"*). So the honest answer is **very little**: one fewer click to get a
cosmetic toolbar back on a new site, in exchange for granting `<all_urls>` — a broad permission that
triggers the browser's own "read and change all your data on all websites" warning — while the
toggle's own label ("Keep capturing across sites") and copy ("ready to capture there too") imply a
capability it doesn't have. **Recommendation: remove this row from the popup (and Options) entirely
until ADR 008 (v2.0, the extension owning the session) actually makes captures survive cross-origin
navigation — then it will be asking for something real, worth a broad permission grant, instead of a
toolbar-visibility convenience dressed up as one.**

#### HUD

**Proposal:** Stop is the only end action; no error toast while capturing.

```
[●] 00:12  Capturing   REPLAY, NOT VIDEO   4 events · 2 requests   [📷][⬚][🔴][🩻][🖌][✓][✕ Stop]
```

Visually unchanged from today — the change is behavioral, not structural: while a capture is active,
an uncaught error no longer spawns its own independent "Capture Bug" button alongside the HUD.

**Click/decision count:** removes one confusing option from the screen (2 things that could plausibly
"end" the capture → 1), with no change to clicks on the path anyone actually uses — Stop was already
the control every flow in this review observed being used.

**What this removes from the main path:** nothing on the *main* path; it removes a second,
independent "Capture Bug" trigger that only appears on an uncaught error. **Safety/value reason to
keep part of it:** the error-triggered toast still has real value **when no capture is running** —
that's its original purpose, a quick one-click capture offered right at the moment something broke.
The proposal reads as "no error toast while capturing," which this review takes to mean suppressed or
redirected specifically during an active capture, not removed outright as a feature — confirming that
scope before implementation is worth a one-line check, not a disagreement.

#### Ticket modal

**Proposal:** one primary button chosen by setup — "Send to GitHub/Linear/Slack" if configured, else
"Export report (.html)." Everything else moves into the grouped menu.

```
┌────────────────────────────────────────────────────────────────┐
│ Bug Ticket — Review & Export                             [✕]   │
│ TITLE   "Place order" Action — API POST Returns 404             │
│ DESCRIPTION  Possible Cause: API POST /api/orders failed …       │
│              Summary: API POST /api/orders failed with 404 …     │
│              (T-01: Summary always agrees with Possible Cause)   │
│ [Info] [Actions] [Console] [Network] [AI]                        │
├────────────────────────────────────────────────────────────────┤
│  [ Send to GitHub ]                 <- the ONE primary button,  │
│                                         chosen by setup state    │
│  More ▾                                                           │
│    Send to ▾   Linear (not configured) · Slack (not configured)   │
│    Export ▾    .html replay · .zip · .spec.ts · .md · AI html ·   │
│                 Screenshots · Jira (copy only)                     │
│    Settings ▾  Configure integrations… · Export footer · Issue    │
│                 signature · 💾 Save Ticket                         │
└────────────────────────────────────────────────────────────────┘
```

**Click/decision count — the happy paths are unchanged:** no integration configured → the one
primary button is "Export report (.html)," **Stop → file = 1 click**, identical to today. A
configured integration → the one primary button is "Send to GitHub," **Stop → sent = 2 clicks**,
identical to today. The win isn't fewer clicks on either path (both already meet the target) — it's
dropping from ~5 visible footer buttons to 1, so there's exactly one decision at a glance instead of
five.

**Checked, as asked — is Save Ticket redundant given the draft auto-saves on Stop?** No. They're
different mechanisms doing different jobs. The draft auto-save (`tracebug_last_bug_draft`) is accident
recovery: if the modal closes unexpectedly, the next time it opens it recovers the title and
description — it does not add the session to the Saved Tickets list. Save Ticket is a separate,
explicit action that marks the session as saved so it appears in that list at all (confirmed in
source: *"Save Ticket — marks this session as explicitly saved so it appears in the Saved Tickets
list. Without saving, the list stays empty"*). **Flow 5 — reopening an old ticket, this review's
strongest flow in the product (2 clicks, full state restoration) — has nothing to reopen unless Save
Ticket was clicked first.** They are not redundant; removing Save Ticket would break Flow 5 entirely,
not just make it less convenient.

**Reviewer note — Save Ticket's placement:** given it's confirmed not redundant and is load-bearing
for the product's strongest flow, burying it inside the grouped menu adds a click (open menu → Save
Ticket, vs. today's single click) for a QA persona who saves every ticket as routine (Flow 5). Worth
keeping as a small, clearly-secondary control next to the one primary button — not promoted back to
equal visual weight, just not buried a menu-level deep — rather than filing it under Settings with
the toggles.

#### After export

**Proposal:** a one-line "Open in your AI agent →" link instead of the modal.

```
✓ Replay exported · 0.4 MB
Open in your AI agent →
```

**Click/decision count: this is the biggest win in the whole proposal.** It doesn't shrink the forced
dismissal — it deletes it. Today: **4 clicks + 1 forced dismissal per export, every time, with no way
to turn it off.** Under this proposal: **4 clicks, 0 forced**, full stop — the link is there if wanted,
ignorable if not, which is a cleaner result than this review's own earlier T-05 draft (a remembered
localStorage dismissal + a new Settings toggle to turn it back on). This proposal needs no new
setting at all, which also fits the original brief's own preference for defaults over added settings
better than this review's first pass did. **Recommend adopting this version over the earlier T-05
draft below**, not the other way around.

**What this removes from the main path:** the forced interruption, entirely — that's the point.
**Safety/value reason to keep something:** the current modal also carries the one-time MCP setup
command (`claude mcp add tracebug …`) and a ready-to-paste prompt, which a user who has never
connected the MCP server before needs *somewhere* discoverable, or "Open in your AI agent" does
nothing useful for them the first time they click it. Not a reason to keep the modal — a reason the
one-line link's destination (wherever it leads) needs to carry that setup information for a true
first-time click, even though the interrupting modal itself is gone.

### Change list

Sorted by impact on the first-ticket / send flow. Effort: S (hours), M (a day or so), L (needs a
design/product decision first).

| Change | Type | Why | Effort | Risk | Release |
|---|---|---|---|---|---|
| Bug 0: extension SDK isolation | fix | Blocks the send flow on any page embedding its own SDK (Flow 4) | M | Low — isolated change, e2e spec already written (`sdk-isolation-1.11.2.md`) | **1.11.2** |
| T-01: Summary noise filter | fix | Misleads on every affected ticket (Flow 1) | S | Low | **1.11.2 — shipped** |
| T-02: tracker button label/action | fix | Blocked the send flow, confusing label (Flow 4) | M | Low — shipped, tested | **1.11.2 — shipped** |
| T-03: clarifying comment | docs | Prevents "fixing" correct code | S | None | **1.11.2 — shipped** |
| T-04: ticket modal down to one primary button + grouped menu | regroup | ~5 footer buttons + flat 11-12 item More ▾ (Flow 1 step 7); supersedes this review's earlier "just regroup More ▾" draft with the product owner's fuller proposal | M | Low-medium — touches `quick-bug.ts`'s largest render block; keep Save Ticket one level shallower than the rest per the Reviewer note above | **1.12** |
| T-05: replace the MCP hand-off modal with a one-line link | new (simpler than first drafted) | Removes a forced click on every export (Flow 1 step 8/9), not just a remembered dismissal | S | Low — no new setting needed, simpler than the original localStorage-flag draft | **1.12** |
| T-06: duplicate capture-bug trigger | merge | Two live controls during one capture (Flow 1 step 5); proposal confirms this as "no error toast while capturing," toast itself stays for the no-capture-running case | S | Low | **1.12** |
| T-07: "Empty Session" title | rename / new field | Misdescribes a deliberate screenshot (Flow 3) | S (stage 1) / M (stage 2) | Low | **1.12** |
| T-08: dashboard focus trap | fix | Keyboard/SR users lose focus context | S | Low, moot pending T-11 | **1.12** |
| T-09: close-button aria-label | fix | No accessible name | S | None | **1.12** |
| T-10: milestone-ask z-index | reorder | Visual overlap with the ticket modal | S | None | **1.12** |
| T-11: dashboard.ts panel fate | decision | 2,430 lines, no entry point | — | — | Whenever decided |
| T-12: delete-confirmation consistency | standardize | Two idioms across two ticket-list UIs | S | None, depends on T-11 | **1.12**, after T-11 |
| T-13: hide the cross-site toggle | remove (UI only) | Requests a broad permission for a cosmetic toolbar-visibility convenience; its label overclaims what it does | S | None — `optional_host_permissions` stays, only the UI row is hidden; re-add the row (not the permission) once ADR 008 ships | **1.12**, until ADR 008 (v2.0) |

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
4. ~~MCP hand-off card's re-enable path (T-05)~~ — **resolved** by the one-line-link proposal in
   Part 4: no modal, no dismissal to remember, no new setting needed at all.
5. ~~`tracebug.dev/feedback`'s dropped `type`/`area` params~~ — **false alarm, corrected this
   session.** An earlier pass in this review tested the live page by querying
   `input,select,textarea` and found no `type`/`area` field, concluding they were dropped. They
   aren't: the page renders them as pill `<button>`s driving React state
   (`FeedbackForm.tsx`), not native form elements, so that query missed them. A real local
   submission, intercepting the outgoing POST, confirms both fields arrive correctly
   (`type=bug&area=extension` in the body alongside `message`/`email`/`version`), and the static
   Netlify form-detection twin (`__forms.html`) already declares both as recognized fields. No
   website change needed.
6. **Firefox verification (Flow 7)** remains an unresolved tooling blocker, unrelated to any finding
   here, still outstanding before a Firefox-inclusive launch claim.
7. **PLAN.md's phase numbering vs. this review's release mapping** — `PLAN.md` Phase 10 is currently
   labeled "1.11.2: video," which this review's mapping (1.11.2 = correctness, 1.11.3 = video) now
   contradicts. Needs a deliberate PLAN.md update, not an incidental one.
