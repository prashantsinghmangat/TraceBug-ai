# TraceBug — Part 2: control inventory

**Update, later the same day:** T-01 and T-02 are now **committed** (`2109479`, `ebbfe05`), not
uncommitted as the body below says throughout — this was a snapshot at the moment this document was
written. T-02's severity framing below is also corrected: every send path, including the one behind
the mislabeled button, already goes through the real `confirm-send.html` window and requires an
explicit Send click before anything leaves the browser. It was always a **mislabeled-control defect**,
never a disguised or silent send — see the reworded T-02 rows below and
`tracebug-product-ux-final-review.md`'s own corrected executive summary. Linear and Slack have also
since gained matching "Send to …" labels (`ebbfe05`) — they never had T-02's bug, but their labels
were previously static regardless of configuration state.

Written 2026-10-22, resuming the product/UX audit using the clean-page results in
`docs/audit/product-flow.md` plus the deeper source tracing already done in
`docs/audit/tracebug-product-ux-audit.md` and `docs/audit/tracebug-product-ux-final-review.md`. This
document does not re-derive what those two already settled — it reformats and cross-references their
findings into a per-control inventory, adds the surfaces they didn't enumerate control-by-control
(welcome/onboarding, the MCP hand-off card), and records one new piece of evidence: **T-01 and T-02
are no longer proposed fixes — they are implemented in the working tree, uncommitted, and their new
regression tests pass** (verified this session: `npx vitest run tests/report-builder.test.ts
tests/github-button-state.test.ts` → 34/34 passed). Nothing in this document was implemented by this
task; the working-tree state was found, not created, here.

**Working tree at the start of this task** (`git status`): `docs/launch/PLAN.md`,
`src/report-builder.ts`, `src/ui/quick-bug.ts`, `tests/first-run.test.ts`,
`tests/report-builder.test.ts`, `tracebug-extension/tracebug-sdk.js`,
`tracebug-extension/welcome.html`, `tracebug-extension/welcome.js` modified; `docs/audit/*`,
`docs/launch/designs/tracebug_welcome_v2/`, `docs/launch/sdk-isolation-1.11.2.md`,
`e2e/welcome-screenshots.mjs`, `tests/github-button-state.test.ts` new/untracked. All of this is
**preserved as-is** — no file outside this new document was touched to produce it. The
welcome-redesign files (`welcome.html`, `welcome.js`, `tracebug_welcome_v2/`,
`e2e/welcome-screenshots.mjs`, the `tests/first-run.test.ts` changes) are someone else's in-progress
work and are inventoried below strictly as "current working-tree state," not as this audit's output.

---

## Executive summary

The core loop works and the two launch-blocking defects found in Part 1 (`product-flow.md` Finding 1
and Finding 2) both have confirmed root causes, confirmed fixes already written, and confirmed
passing tests, sitting uncommitted in the working tree:

- **T-01 (Summary-line noise filter)** — `src/report-builder.ts` now filters noise requests in
  `generateSmartSummary` the same way `generateRootCauseHint` already did. **Confirmed implemented,
  confirmed tested** (this session).
- **T-02 (GitHub button label/action mismatch)** — `src/ui/quick-bug.ts` now has a
  `_githubConfigured()` helper (`isExtensionMode() ? hasIntegration("github") : !!_githubRepo`) that
  drives both the label and the `data-action`, replacing the page-mode-only `_githubRepo` check.
  **Confirmed implemented, confirmed tested** (this session, `tests/github-button-state.test.ts`).
- **Bug 0 (double-SDK collision, `product-flow.md` Finding 1 / `docs/launch/sdk-isolation-1.11.2.md`)**
  is a **separate, still-open** issue from T-02: T-02 fixes the button's logic once the extension is
  correctly in extension mode; Bug 0 is about the extension *failing to reach* extension mode at all
  on a host page that embeds its own copy of the SDK. T-01/T-02 do not touch Bug 0, and Bug 0 does
  not block T-01/T-02 — they're independent, both now visible as tracked engineering work
  (`docs/launch/PLAN.md` Phase 10, Bug 0 first item).

Beyond those two, the deeper source audits (`tracebug-product-ux-audit.md`,
`tracebug-product-ux-final-review.md`) found and cross-verified ten more items (T-03 through T-12),
one confirmed **genuinely unreachable** 2,430-line surface (`src/dashboard.ts`, T-11 — a
product-owner decision, not a bug), and confirmed that **Linear and Slack do not share GitHub's
button-label bug** (their labels are static, both correctly gate on `hasIntegration()` first). This
inventory's own contribution: a full control-by-control table for every surface the brief named,
including two the prior reports didn't enumerate control-by-control (welcome/onboarding, the
post-export MCP hand-off card), and explicit confidence tagging (confirmed / source-derived / needs
manual verification) per control so implementation work can be sequenced without re-deriving
anything.

**Highest-value next steps, in order:** (1) commit T-01/T-02 — they're done and tested; (2) the
5-minute manual click-throughs for T-03/T-11 the prior reports already specified; (3) regroup the
More ▾ menu (T-04) — the single highest-leverage remaining click/confusion reduction; (4) make the
MCP hand-off card skippable (T-05); (5) get a product-owner decision on `dashboard.ts` (T-11).

---

## Control inventory by surface

Confidence key: **Confirmed** = read in current source + (for behavior claims) verified by a passing
test or a live repro this session or a prior session. **Source-derived** = read in current source,
behavior inferred from code logic, not independently exercised in a browser. **Needs manual
verification** = flagged in a prior report or here as unconfirmed by any source-read or test.

### Extension popup (`tracebug-extension/popup.html` / `.js`)

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **Capture Bug** (primary button) | Start an events-only capture | `#btnCaptureBug` → `TB_CAPTURE_NOW`/`record` → `background.js` → content script → SDK `startEventsCapture`/`prepareRecording` | Works | `popup.html:110-124`; `product-flow.md` Flow 1 step 2 | Confirmed | Keep — correct primary action, confirmed by both prior audits |
| **Record options** (delay, blur-first) | Configure pre-capture behavior | `#recordOptsBox` `<details>`, `#optDelay`, `#optBlurFirst` | Works | `popup.html:128-165` | Source-derived | Keep, in advanced disclosure (already collapsed by default) |
| **Screenshot only** | Attach one screenshot with no event capture | `#btnScreenshot` → `capture-now` action | Works, but skips the advertised "drag to select" step | `popup.html:178-181`; `product-flow.md` Flow 3 | Confirmed | Keep; clarify naming overlap with the modal's own "Add screenshot" (see Ticket modal section) |
| **View tickets** | Open the saved-ticket list | `#btnViewTickets` → `view-tickets` action → `compact-toolbar.ts`'s popover (`_showOfflineTicketList`), **not** `dashboard.ts`'s panel | Works, but opens the lighter of two list UIs that exist in the codebase | `popup.html:182-185`; `tracebug-product-ux-final-review.md` §1 T-11 row | Confirmed | Keep as-is pending T-11 product-owner decision |
| **Inspect element** | Hover to see computed styles, click to attach | `#btnInspect` → `inspect` action | Works | `popup.html:186-189` | Source-derived | Keep |
| **Redaction rules** (fields, patterns) | Configure app-specific PII masking | `#redactBox` `<details>`, `#redactFields`, `#redactPatterns`, `#redactSave` | Works | `popup.html:195-209` | Source-derived | Keep, advanced disclosure |
| **Keep capturing across sites** | Request `<all_urls>` to survive navigation | `#crossSiteRow` | Works | `popup.html:211-220`; `product-flow.md` Flow 6b (inconclusive beyond rendering — real grant needs a human click) | Confirmed render / **Needs manual verification** for the actual grant | Keep |
| **Having trouble? → Copy diagnostics / Report a bug** | Scrubbed diagnostics to clipboard, or open the GitHub issue page | `#diagBox`, `#diagCopy`, `#diagReport` | Works | `popup.html:226-236` | Source-derived | Keep |
| **Theme toggle** | Light/dark popup | `#themeToggle` | Works | `popup.html:28` | Source-derived | Keep |
| **`Alt+B` hint** | Teach the keyboard shortcut | `#hint`/`#hintText`/`#hintShortcut` text row, footer | Works, but easy to miss | `popup.html:241-253`; `product-flow.md` Flow 2 | Confirmed | **Relabel/move**: also surface in welcome/what's-new, per both prior audits — don't remove from the footer |
| **What's New card** | One-time changelog after an update | `#whatsNew`/`#whatsNewList`/`#whatsNewGot` | Works | `popup.html:59-64`; `product-flow.md` Flow 6e | Confirmed | Keep — "well-executed" per both audits |
| **Footer links** (Site/Feedback/npm/GitHub) | External navigation | plain `<a>` tags | Works | `popup.html:258-266` | Source-derived | Keep |

### Recording HUD / in-page toolbar (`src/compact-toolbar.ts`, `src/recording-hud.ts`)

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **Stop** | End capture, open ticket modal | `[data-tb-hud="stop"]` → `recording-hud.ts:167-169` | Works | `product-flow.md` Flow 1 step 6 | Confirmed | Keep |
| **Live event/request tally** | Show capture is active and how much is captured | HUD text, no click | Works | `product-flow.md` Flow 1 step 4 | Confirmed | Keep |
| **Screenshot / region-screenshot icons** | Attach evidence mid-capture | HUD icon row | Works | `product-flow.md` 04-hud-active.png | Source-derived | Keep |
| **Blur** | Mark an element to redact in replay | `[data-tb-hud="blur"]` | Works | Verified live in `e2e/marketing-screenshots.mjs`'s existing suite (pre-existing, not re-run this session) | Confirmed (pre-existing test coverage) | Keep |
| **Saved Tickets popover ("View tickets" from the toolbar)** | Quick-view recent tickets | `_showOfflineTicketList` in `compact-toolbar.ts` | Works | `product-flow.md` Flow 5 | Confirmed | Keep pending T-11 |
| **Ticket-card Open / Export / Delete** | Reopen, export, or remove a saved ticket | Card buttons inside the popover | Works | `product-flow.md` Flow 5, screenshots 21-22 | Confirmed | Keep |
| **Ticket-popover "×" close** | Close the popover | icon button, `compact-toolbar.ts` ~L852 | Works, but no accessible name | `tracebug-product-ux-audit.md` §8 (T-09) | Source-derived | **Relabel** (add `title`/`aria-label`) — one-line fix |
| **Error-triggered "Capture Bug" toast** | Offer a quick capture when an uncaught error fires | `live-bug-card.ts`'s independent toast, `onCapture` → `captureRollingBuffer()`/`showQuickBugCapture()` | Works, but is a **second, independent** trigger from the HUD's own Stop, both visible during an active capture | `tracebug-product-ux-final-review.md` §1 T-06 (confirmed as a true independent code path, not cosmetic); `product-flow.md` Flow 1 step 5 | Confirmed | **Connect/merge** — route to the existing HUD control, or suppress while a capture is already running, while a capture is NOT running it remains a useful standalone trigger |

### Bug capture / ticket-review modal (`src/ui/quick-bug.ts`)

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **Title field** | Editable, pre-filled from `generateBugTitle` | plain `<input>` | Works | `title-generator.ts:8-36` | Confirmed | Keep |
| **Take screenshot / Add screenshot** | Attach a screenshot from inside the modal | `[data-action="add-screenshot"]` | Works | `product-flow.md` Flow 1 (marketing-screenshots pattern) | Source-derived | Keep; naming overlaps with the popup's own "Screenshot only" (two distinct capture entry points producing the same result — see popup table) |
| **Description** (editable, auto-written) | Possible Cause + Summary + Error/Bug-on, editable before export | `_buildDescription`, `quick-bug.ts:403-434` | **Summary line was wrong; now fixed in the working tree (T-01)** | `report-builder.ts:349` now `report.networkErrors.find(n => !isNoiseRequest(n.url))`, matching `generateRootCauseHint`'s `:511` | **Confirmed implemented + tested** (this session) | Keep; commit |
| **Priority dropdown** | Override the auto-computed severity | `<select>` top-right of modal | Works | screenshot `06-ticket-modal.png` | Source-derived | Keep |
| **Info / Actions / Console / Network / AI tabs** | Evidence drill-down, progressive disclosure | tab click handlers | Works | `quick-bug.ts:681-690`; confirmed no-network-on-load (`tracebug-product-ux-audit.md` §6.4) | Confirmed | Keep |
| **Save Ticket** | Persist to the saved-ticket list | `[data-action="save-ticket"]` | Works | `product-flow.md` Flow 5 | Confirmed | Keep |
| **GitHub primary button (label + action)** | "Copy GitHub Issue" unconfigured; "Send to GitHub" (extension) / "Open in GitHub" (page/SDK) when configured | **Was**: `_githubRepo`-only condition (page-mode field, always null in extension mode) → label always "Copy," but `hasIntegration` gate inside the click handler already correctly routed a configured click to the real send-confirmation window — a mislabeled control, not a bypass of it (every send path requires an explicit Send click in `confirm-send.html` before anything leaves the browser) | **Fixed and committed** (`2109479`, `ebbfe05`): `_githubConfigured()` drives the `data-action`; `_githubButtonLabel()` now distinguishes "Send to GitHub" (extension, real BYO-token send) from "Open in GitHub" (page/SDK, genuinely opens a tab) | `quick-bug.ts` (`_githubConfigured`, `_githubButtonLabel`, render site, click handlers) | **Confirmed implemented + tested**: `tests/github-button-state.test.ts` (unit) + `e2e/ext-github-send-confirm.e2e.mjs` (9/9, real browser — confirms zero `github.com` tabs open in extension mode, a real tab does open in page/SDK mode) | Done |
| **Linear / Slack buttons** | "Send to Linear/Slack" when configured; "Open in Linear" / "Copy Slack Message" when not | Static labels ("Linear"/"Slack") regardless of configuration state — not the T-02 bug (both click handlers already correctly gated on `hasIntegration()` first), but still uninformative labels | **Fixed and committed** (`ebbfe05`): `_linearButtonLabel()`/`_slackButtonLabel()` added, matching each button's actual fallback behavior | `quick-bug.ts` (`_linearButtonLabel`, `_slackButtonLabel`, More ▾ menu render site) | Confirmed implemented (source-traced; not independently re-run as a dedicated e2e this session — the GitHub e2e doesn't exercise these two) | Done |
| **Fix with AI** | Build a structured prompt, open Claude/ChatGPT | `[data-action="ai-prompt"]` | Works | `quick-bug.ts:2626-2674` region | Source-derived | Keep |
| **Export replay (.html)** | Download the full offline report | `[data-action="export-replay"]` | Works, but **unconditionally** opens the MCP hand-off card afterward (see below) | `quick-bug.ts:1291` call site | Confirmed | Keep the export; fix the hand-off card's forcing behavior (T-05, below) |
| **Export HAR** | Download network trace | footer button | Works | screenshot `06-ticket-modal.png` | Source-derived | Keep |
| **More ▾ menu** | Access to zip/.spec.ts/.md/AI-html/Linear/Slack/Jira/Configure integrations/toggles | `[data-action="more-toggle"]`, flat list | Works, but **11-12 undifferentiated items** (live sends, copy-only exports, and settings mixed together) | `quick-bug.ts:724-741`; `product-flow.md` Flow 1 step 7 | Confirmed | **Regroup** into Send to / Export / Settings (T-04) |
| **Jira menu item** | Copy a Jira-formatted ticket | always copy-only | Works exactly as designed — Jira Cloud is CORS-blocked for browser XHR, documented in code | `tracker-client.ts:15-18` | Confirmed, by design, not a bug | **Relabel** only ("copy only") and move into the Export group so it stops looking equivalent to live GitHub/Linear/Slack sends |
| **Configure integrations…** | Extension mode: point to TraceBug settings. Page/SDK mode: show the BYO-token form | `showIntegrationsConfigModal`, `isExtensionMode()` gate at `:2882-2892` | **Works correctly — the "stray token form" Part 1 saw was a different surface** (`dashboard.ts`'s Export tab, pure copy-to-clipboard, no token fields) | `tracebug-product-ux-final-review.md` §1, T-03 row — invalidated as a bug | Confirmed (source-traced + a clarifying comment already added in the working tree at `quick-bug.ts` near `showIntegrationsConfigModal`) | **No code change** — comment-only clarification already present; optionally still worth one live click-through to be fully certain (see verification checklist) |
| **Export footer / Issue credit toggles** | Settings for exported artifacts | toggle rows in More ▾ | Works | screenshot `07-ticket-modal-more-menu.png` | Source-derived | Keep, move into "Settings" group under T-04 |
| **👍 / 👎 "Enough info to reproduce?"** | Feedback signal | footer icons | Works (renders) | screenshot `06-ticket-modal.png` | Source-derived (destination/effect of the click not traced) | **Needs manual verification** of what, if anything, the click does |

### Post-export MCP hand-off card (`src/ui/quick-bug.ts`, `showMcpHandoffCard`)

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **Tool tabs (Claude Code / Cursor / VS Code)** | Show the right one-time MCP setup command per tool | `MCP_SETUP` map, tab click swaps displayed command | Works | `quick-bug.ts:3667-3684` | Source-derived | Keep |
| **Copy (setup command)** | Copy the `claude mcp add …` / `.cursor/mcp.json` / `code --add-mcp` command | copy-to-clipboard button | Works | `quick-bug.ts` region around `:3647-3663` | Source-derived | Keep |
| **Destination chips** ("a developer" / "an AI coding agent" / "a GitHub issue" / "just testing") | Tailor the generated prompt's wording | `generateMcpPrompt` input | Works | `product-flow.md` 08-after-export.png | Source-derived | Keep |
| **Copy / Open in Claude / Open in ChatGPT** (the prompt itself) | Hand the prompt to an AI tool | `data-ai-action="copy"/"claude"/"chatgpt"` | Works | `quick-bug.ts:3608-3621` | Source-derived | Keep |
| **Close (×/Esc/overlay click)** | Dismiss the card | `data-ai-action="close"` / `Escape` key / overlay click | Works | `quick-bug.ts:3621-3629` | Source-derived | **Connect** to a new "don't show again" flag (T-05) — none exists today, confirmed by the final-review's dedicated check of the file's only dismissal-memory pattern (`CONSENT_KEY`), which belongs to an unrelated, disabled Phase-2-cloud dialog |
| **The card's appearance itself** | — | fires on every successful `export-replay`, unconditionally | **Confirmed defect**: no suppression mechanism exists anywhere in the file today | `tracebug-product-ux-final-review.md` §1 T-05 row | Confirmed | **New code required** (not wiring up something dormant) — add a `localStorage` dismissal flag + a re-enable toggle in Settings |

### Saved-ticket list and dashboard panel (`src/compact-toolbar.ts` popover vs. `src/dashboard.ts`)

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **compact-toolbar popover** (reached from popup "View tickets" and the HUD) | Lightweight recent-tickets list | `_showOfflineTicketList` | Works, this is the **only** reachable ticket-list UI in the shipped product today | `product-flow.md` Flow 5 | Confirmed | Keep as the reachable surface pending T-11 |
| **`dashboard.ts`'s full panel** (tabbed session detail, voice notes, annotation list, full report builders) | A richer ticket-management surface | `renderPanel`, never called from any shipped control | **Confirmed genuinely unreachable** from any shipped button — `_panelOpen` is a `const false`, never reassigned anywhere in the repo; the onboarding code's expected trigger id (`tracebug-toolbar-panel-btn`) is never assigned to any DOM element | `tracebug-product-ux-final-review.md` §1 T-11 row, §5 (root cause and three remediation options); `docs/architecture.md:227-245` independently confirms this is "cut from v1," not a deliberate removal | Confirmed | **Decision required from product owner** — restore an entry point, consolidate into the popover, or formally retire (do not silently remove 2,430 lines of working code without this decision) |
| **`dashboard.ts`'s panel *container*** (the empty, off-screen `#tracebug-dashboard-panel` div `renderPanel` would fill in) | — | Created unconditionally by `mountDashboard()` (`dashboard.ts:139-144`), `right: -480px`, no content until/unless `renderPanel()` is called | **Confirmed harmless.** `mountDashboard()` is not independently toggleable from the panel — it's the same function call that mounts the compact-toolbar (the real, used UI), so "stop mounting the panel by default" turned out to mean "stop mounting the toolbar too," which was never the intent (an earlier instruction to do exactly that was caught and reverted before any code changed — see `docs/launch/PLAN.md` / session history). What was actually checked instead: a real e2e (`e2e/ext-no-offscreen-focus.e2e.mjs`, 6/6 passing) starts a capture on the clean, fixed `try.html` and Tabs through all 14 focusable elements on the page — none land inside the panel container, and none are positioned off-screen. The container is confirmed present (so the test isn't vacuously passing) and confirmed unreachable by keyboard. | `e2e/ext-no-offscreen-focus.e2e.mjs` (this session) | **Confirmed** (real browser, real extension, real Tab-through) | **No code change.** The container stays exactly as-is until T-11 is decided (targeted for 1.12 per the release mapping) — it costs nothing today: no focus trap needed because nothing can reach it, no visual defect because it's off-screen, no bundle-size argument for removing it alone since `dashboard.ts`'s code ships regardless while the panel question is open. |
| **compact-toolbar card delete** | Remove a saved ticket | custom "Sure?" 3-second-reset armed button | Works | `compact-toolbar.ts:958-974` | Confirmed | Keep; **standardize** with dashboard's pattern once T-11 settles which surface(s) survive |
| **dashboard.ts delete confirmations** (×3: all data, one session, annotations) | Gate destructive actions | native `window.confirm` | Works (when the panel is reachable at all) | `dashboard.ts:275,1004,1754` | Confirmed | Keep the pattern; moot for now given T-11 |
| **dashboard.ts overlay close / focus handling** | Escape closes it | Escape handler, `dashboard.ts:2090` | Works, but **no focus trap or focus-restore**, unlike the ticket modal | `tracebug-product-ux-audit.md` §8; final-review §1 T-08 (carried forward, not re-walked) | Source-derived | **Fix** — port `quick-bug.ts`'s existing trap/restore pattern (`:176-212`/`:794`/`:909`), low effort, pending T-11's outcome on whether this surface ships at all |

### Screenshot-only capture (popup + modal)

Already covered above (popup's "Screenshot only" row; modal's "Add screenshot" row). The one
control-level finding specific to this flow: the resulting ticket's **title**
("Empty Session — No User Interactions") misdescribes a deliberate, successful screenshot capture.

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| Auto-generated title for a screenshot-only session | Describe what was captured | `title-generator.ts:73`, exact-string match on zero events | Works as coded, but misleading copy | `tracebug-product-ux-final-review.md` §1 T-07; `types.ts:308-321` confirms `EnvironmentInfo` has no `title` field to fall back to | Confirmed | **Relabel** in two stages: (1) small — special-case the screenshot-only title string now; (2) larger — add `document.title` to `EnvironmentInfo` for a real fallback everywhere |

### Welcome and onboarding surfaces (`tracebug-extension/welcome.html` / `.js`)

**Caveat:** this surface is a work-in-progress redesign in the current working tree
(`welcome.html`, `welcome.js`, `docs/launch/designs/tracebug_welcome_v2/` are all modified/new and
not part of this audit). The table below describes the **current on-disk state**, which may not be
final.

| Control | Intended outcome | Actual handler | Status | Evidence | Confidence | Recommended action |
|---|---|---|---|---|---|---|
| **Pin instructions** (step text) | Teach the puzzle-icon → pin flow | static copy, `#pinHow` | Works (renders) | `welcome.html:423` | Source-derived | Keep |
| **"Try it" / playground link** | Send the user to `try.html` | `#playground` anchor | Works; this is the link `welcome.js` builds with `?utm_source=welcome` — now correctly picked up by the fixed `try.html` banner logic (see `product-flow.md` step-3 update) | `welcome.html:459`; `welcome.js:13-14` | Confirmed | Keep |
| **Shortcut display / "Set a shortcut"** | Show the bound key, or offer to bind one if none is set | `#keysBound`/`#keysNone`/`#setShortcut` | Works | `welcome.html:473-476` | Source-derived | Keep — and per T-04-adjacent recommendation in the prior audits, this remains the right place to *also* surface the `Alt+B` hint, not a replacement for the popup's own hint row |
| **Copy MCP setup command** | One-time copy of `npx tracebug mcp` | `#copyMcp` | Works | `welcome.html:513-515` | Source-derived | Keep |
| **Footer GitHub / feedback links** | External navigation | plain `<a>` tags | Works | `welcome.html:529-530` | Source-derived | Keep |

---

## Confirmed issues and evidence (cross-referenced, not re-derived)

This table is a compact index into the two deeper audits plus this session's test verification —
full technical detail, line numbers, and acceptance criteria live in
`docs/audit/tracebug-product-ux-final-review.md` §6-7, which should be read alongside this inventory
before implementing anything, not duplicated here.

| ID | Problem | Status now | Confidence |
|---|---|---|---|
| **Bug 0** | Injected SDK can adopt a page-defined `window.TraceBug`, silently staying in page mode | **Open.** Website-side symptom fixed (`website/public/try.html`, committed `4a7511d`); extension-side isolation fix written up, not built (`docs/launch/sdk-isolation-1.11.2.md`, `PLAN.md` Phase 10 Bug 0) | Confirmed (live repro, this session's prior turn) |
| **T-01** | Summary line can headline a noise request (e.g. `/favicon.ico`) instead of the real failure | **Fixed and committed** (`2109479`). New test passes | **Confirmed** (code read + `npx vitest run tests/report-builder.test.ts` → pass, this session) |
| **T-02** | GitHub button's label always read "Copy" in extension mode regardless of configuration — the click handler underneath already correctly routed a configured click to the real confirm-send window, so this was a mislabeled control, not a silent/disguised send (every send path requires an explicit Send click in that window) | **Fixed and committed** (`2109479`, `ebbfe05`). Label now reads "Send to GitHub" (extension, configured) / "Open in GitHub" (page/SDK) / "Copy GitHub Issue" (unconfigured); Linear/Slack gained the same treatment | **Confirmed** (unit tests + `e2e/ext-github-send-confirm.e2e.mjs`, 9/9, real browser) |
| **T-03** | Risk that `showIntegrationsConfigModal`'s extension-mode guard was broken | **Invalidated as a bug.** Guard is correct; a clarifying comment is already present in the working tree | Confirmed (source-traced in final-review; comment visible in this session's `git diff`) |
| **Linear/Slack "same bug as T-02?"** | Checked for the same button-label pattern | **Invalidated.** Both are statically labeled and correctly gate on `hasIntegration()` | Confirmed (source-traced, final-review §1) |
| **T-04** | Flat 11-12 item More ▾ menu mixes live sends, copy-only exports, and settings | Open, approved recommendation (regroup into Send to / Export / Settings) | Confirmed (source-traced) |
| **T-05** | MCP hand-off card has no suppression mechanism, fires on every export | Open, approved recommendation (localStorage dismissal flag + Settings re-enable) | Confirmed (source-traced — confirmed no dormant mechanism exists to reuse) |
| **T-06** | Two independent "Capture Bug" triggers visible during one active capture | Open, approved recommendation (suppress/redirect the error-toast's button while capturing) | Confirmed (source-traced as a true independent code path, not styling) |
| **T-07** | "Empty Session — No User Interactions" misdescribes a deliberate screenshot | Open, staged recommendation (title special-case now; `EnvironmentInfo.title` later) | Confirmed |
| **T-08** | `dashboard.ts` overlay has no focus trap/restore | Open, approved, not re-walked in the final review (low risk, low priority to re-verify before fixing) | Source-derived |
| **T-09** | Ticket-popover "×" has no accessible name | Open, approved, one-line fix | Source-derived |
| **T-10** | Milestone-ask card can visually overlap the open ticket modal | Open, approved (defer display or lower z-index) | Source-derived (confirmed by `product-flow.md` Flow 6f screenshot) |
| **T-11** | `dashboard.ts`'s full panel has no reachable entry point anywhere in the shipped UI | **Confirmed unreachable**, root cause known (`_panelOpen` dead constant); **decision required from product owner**, not an engineering default. **No code change made** — `mountDashboard()` also mounts the real, used compact-toolbar, so it can't be disabled independently of the panel; confirmed instead, via a real e2e, that the empty off-screen panel container is unreachable by keyboard (`e2e/ext-no-offscreen-focus.e2e.mjs`, 6/6, Tab-through during an active capture never enters it or lands off-screen) — harmless as-is, container stays until T-11 is decided (targeted 1.12) | Confirmed (repo-wide grep in final-review, independently corroborated by `docs/architecture.md`; this session's e2e for the keyboard-safety claim specifically) |
| **T-12** | Two different delete-confirmation idioms across the two ticket-list UIs | Open, optional, depends on T-11's resolution | Confirmed |

---

## Manual verification checklist

Everything below needs a human in a real browser; none of it can be settled by more source reading.
Each line names exactly what to check and against which flow in `product-flow.md`.

1. **Flow 6b (declined site access)** — click the real toolbar icon on a page without first granting
   `<all_urls>`, confirm what actually happens when "Capture Bug" is clicked (headless automation
   could not grant a genuine `activeTab` to test this for real).
2. **Flow 7 (Firefox)** — run `npm run ext:firefox` and walk Flow 1, watched by a person; Playwright
   automation hit a hard blocker (`about:debugging` hangs under its Firefox protocol).
3. **T-03, 5 minutes** — in the real extension, open a ticket modal, click "Configure integrations…"
   from that modal's own More ▾ menu (not the dashboard panel's Export tab), confirm it shows the
   extension settings pointer and never a token field. (Already source-confirmed correct; this is
   belt-and-suspenders per the final review's own recommendation.)
4. ~~**T-02, with a real GitHub token**~~ — **done**, automated: `e2e/ext-github-send-confirm.e2e.mjs`
   (9/9 passing) configures GitHub, opens a fresh capture, and confirms the button reads "Send to
   GitHub" in extension mode (not "Open in GitHub" — nothing opens, the real `confirm-send.html`
   window does, naming the configured destination, with zero `github.com` tabs ever opening) and that
   page/SDK mode's "Open in GitHub" still genuinely opens a tab. Every send path already requires an
   explicit Send click in that window before anything leaves the browser — this was always a
   mislabeled-control defect, not a silent-send one; see the reworded severity in
   `tracebug-product-ux-final-review.md` §Executive Summary and §1.
5. **T-01, same repro as `product-flow.md` Flow 1** — reproduce the seeded `/api/orders` 404 and
   `/favicon.ico` 404 together, confirm the Summary line now names `/api/orders`, not the favicon.
6. **"👍/👎 Enough info to reproduce?"** — click each, determine what (if anything) happens; this
   control's destination was not traced in either source audit.
7. **Bug 0's extension-side fix, once implemented** — per `docs/launch/sdk-isolation-1.11.2.md`'s own
   e2e test definition: a page defining its own `window.TraceBug` in page mode must still get
   extension mode, the settings pointer, and the real confirm window from the extension's injected
   copy.
8. **Welcome-redesign surface** — once that in-progress work lands, re-walk Flow "install → welcome"
   from `product-flow.md` against the new `welcome.html`/`tracebug_welcome_v2` design; this
   inventory's welcome-surface table reflects today's on-disk state only.

---

## Recommended implementation order

This mirrors `tracebug-product-ux-final-review.md` §9 (already a considered, dependency-aware
sequence) with one addition at the front: commit what's already done.

1. **Commit T-01 + T-02 as-is.** Both are implemented, both have passing new tests
   (`tests/report-builder.test.ts`, `tests/github-button-state.test.ts`, 34/34 this session), and the
   final review's own acceptance criteria for both are a code review + the manual checklist items 4-5
   above — not more engineering.
2. **5-minute manual checks**: T-03 (checklist #3) and T-11's "is there really no button anywhere"
   claim — both are read-only verification, zero code-change risk, and should happen before any menu
   restructuring so T-04 isn't built against a wrong assumption about which ticket-list UI is primary.
3. **T-04 + T-05 together** (same region of `quick-bug.ts` — the More ▾ menu and its adjacent
   export-replay call site) — highest click/confusion reduction for the lowest implementation risk.
4. **T-06** (duplicate capture-bug trigger) — independent, can land anytime after T-02.
5. **T-07/T-08/T-09/T-10** — each independently small; batch into one polish pass.
6. **T-11 decision**, then **T-12** once T-11 is settled — the only item on this list requiring
   product-owner sign-off before engineering starts (see below).
7. **Bug 0's extension-side isolation fix** (`docs/launch/sdk-isolation-1.11.2.md`) — independent of
   all of the above; sequence it whenever Phase 10 engineering time is available, since nothing above
   depends on it and it doesn't depend on anything above.

---

## Open product-owner decisions

1. **T-11 — which ticket-list UI is canonical?** Restore `dashboard.ts`'s entry point (lowest
   engineering cost, keeps both surfaces), consolidate the compact-toolbar popover into opening it
   (cleaner end state, more engineering cost), or formally retire `dashboard.ts` after confirming no
   exported-report code depends on its internals (highest cost to verify safely). See
   `tracebug-product-ux-final-review.md` §5 for the full reasoning behind each option.
2. **Is there a paused state in events-capture, or is "Stop only" intentional?** Neither source audit
   found code confirming either answer.
3. **Jira's long-term presentation** — confirmed permanent copy-only (CORS-blocked), not "coming
   soon." Does the product want it marketed any differently now that permanence is confirmed, beyond
   the T-04 menu-grouping fix already planned?
4. **MCP hand-off card's re-enable path (T-05)** — does a new Settings row read as acceptable, or
   should "show it again" fold into an existing toggle area?
5. **Welcome-redesign scope** — once the in-progress `welcome.html`/`tracebug_welcome_v2` work lands,
   it should get its own pass against this inventory's welcome-surface table and against
   `product-flow.md`'s install→first-capture flow, since neither reflects the redesign yet.

---

## Files touched by this task

- **Added:** `docs/audit/tracebug-control-inventory.md` (this file).
- **Not touched:** everything else. `git status` before and after this task differs by exactly one
  new untracked file.
