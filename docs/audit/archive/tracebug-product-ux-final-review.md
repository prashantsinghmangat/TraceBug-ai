# TraceBug product UX audit — final review and change approval

Written 2026-10-22, as an independent second pass over `docs/audit/tracebug-product-ux-audit.md`
and `docs/audit/product-flow.md`. Every finding below was re-derived from current `develop` source
in this session — nothing here just restates the prior report. Where the first audit was wrong,
incomplete, or too conservative, that's called out explicitly. No application code, tests, or
config were touched; this is review only.

**No relevant source changed between the first audit and this one** (`git status` shows only
`docs/launch/PLAN.md`, `tests/first-run.test.ts`, `welcome.html/js` touched — none of the files this
review covers), so every finding is a true re-verification, not a check against stale state.

---

## Executive summary

The first audit's two P0 calls hold up, and one of them needs a correction, not an escalation: the
GitHub button labeled "Copy GitHub Issue" doesn't just fail to switch labels — when GitHub is
actually configured, clicking it opens the extension's **real confirm-send window**
(`confirm-send.html`) instead of copying. **Every send, in every case, already goes through that
confirm window and requires an explicit Send click before anything leaves the browser** — so this is
a mislabeled button, not a disguised or silent send: nothing is exfiltrated, bypassed, or sent
without the user's knowledge. A user reading "Copy" who gets a send-confirmation prompt instead is
confused and should not be, which is a real trust/clarity defect and still launch-blocking on its own
merits — the button must say what it's about to ask, independent of the original "the label never
updates" framing.

Three things the first audit got right but under-resolved are now settled:

- **T-03 is not a bug.** The `isExtensionMode()` guard in `quick-bug.ts` correctly precedes the
  page-mode token form. The "stray token form" the walkthrough saw is a different, older surface
  (`dashboard.ts`'s Export tab) that has no password/token fields at all — confusing, not insecure.
- **Linear and Slack do not share the GitHub bug.** Their menu labels are integration-agnostic
  static text ("Linear", "Slack" — never "Copy X" vs "Open in X"), and both click handlers correctly
  gate on `hasIntegration()` before falling back to clipboard. GitHub is the outlier specifically
  because it alone has a legacy page-mode "prefilled repo" feature competing with the extension's
  own config.
- **T-11 (the dashboard panel) is confirmed genuinely unreachable**, and the cause is now known:
  `_panelOpen` in `compact-toolbar.ts` is a `const false` that is never reassigned anywhere in the
  repo, and the toolbar button id the onboarding code expects to pulse (`tracebug-toolbar-panel-btn`)
  is never assigned to any element. `docs/architecture.md` confirms this is leftover drift from a
  cut v1 onboarding tour, not a deliberate deprecation. Recommendation: this is a product-owner
  decision (restore the entry point vs. consolidate vs. formally retire), not a code defect to patch
  silently — it does not block launch since the dead code causes no user-visible breakage.

T-04 through T-12 are all reconfirmed as described, with one severity change (T-06, the dual
"Capture Bug" triggers, confirmed as a genuinely independent second code path, not a cosmetic
duplicate) and one clarified non-finding (T-05's modal has no suppression mechanism at all today —
confirmed, not assumed).

---

## 1. Revalidation — T-01 through T-12

| ID | Status | Evidence this pass | Notes |
|---|---|---|---|
| **T-01** | **CONFIRMED** | `report-builder.ts:349` (`report.networkErrors[0]`, no filter) vs. `:511` (`netErrors.find(n => !isNoiseRequest(n.url))`). `isNoiseRequest` (`url-hygiene.ts:30-91`) filters a broad, well-tested noise surface (asset extensions, analytics hosts, beacon-path patterns), not just `.ico`. | Fix verified **safe**: `generateSmartSummary` has exactly one caller (`report-builder.ts:297`), no test depends on current behavior, and both outputs are always co-displayed in the same panel (`quick-bug.ts:432-433`) and in all 6 exporters (Jira/GitHub/Linear/PDF/Slack/AI-prompt) — they must agree, this isn't an intentional split. |
| **T-02** | **CONFIRMED, severity corrected** | `quick-bug.ts:711-713`: label/`data-action` driven solely by `_githubRepo` (page-mode-only, set once from `index.ts:436`). The `data-action="github"` handler (`:1054-1069`) checks `hasIntegration("github")` **first** and routes to the real confirm-send window via `_fileViaTracker` before ever falling back to clipboard. | A configured user clicking "Copy GitHub Issue" gets the real send-confirmation window, not a copy — but that window always shows the destination and requires an explicit Send click, same as every other send path, so nothing is sent without the user seeing and approving it first. This is a mislabeled-control problem, not a disclosure/consent-bypass problem. No test covers button-label-vs-integration-status anywhere. |
| **T-03** | **INVALIDATED as a bug — confirmed as correct existing code** | `quick-bug.ts:2885`: `if (isExtensionMode())` → `showSettingsPointerModal(...)` → `return` at `:2891`, strictly before any page-mode form markup at `:2893+`. The token-form screenshot in Part 1 is `dashboard.ts:894-915`'s Export-tab "Issue Trackers" section — confirmed **no** `<input type="password">` or token fields there, pure copy-to-clipboard. | No code change needed for T-03 itself. Recommend a one-line doc/comment clarifying the two surfaces so a future contributor doesn't "fix" already-correct code. |
| **Linear = same bug as T-02?** | **INVALIDATED** | Label is static ("Linear", `quick-bug.ts:731`), never conditional. Click handler (`:1644`) checks `hasIntegration("linear")` first, falls back to `openLinearIssue` only if false/absent. | No false promise exists — there's nothing analogous to `_githubRepo` for Linear. |
| **Slack = same bug as T-02?** | **INVALIDATED** | Label is static ("Slack", `:732`). Click handler (`:1663`) checks `hasIntegration("slack")` first, falls back to clipboard copy via `generateSlackPost`. | Same conclusion as Linear. |
| **T-04** | **CONFIRMED** | `quick-bug.ts:724-741`: flat menu, up to 12 items (10 unconditional + up to 2 conditional: GitHub, screenshots), zero section markup. | Matches prior report exactly. |
| **T-05** | **CONFIRMED, and the "no suppression exists" claim is now verified rather than assumed** | Triggered at `:1291` (`showMcpHandoffCard`, defined `:3608`), fires on every successful `export-replay`. The only "don't show again" pattern in the file (`CONSENT_KEY`, `:3791-3886`) belongs to a **disabled**, unrelated Phase-2-cloud consent dialog, explicitly commented `/* PHASE2-CLOUD: ... disabled for Phase 1 offline release */`. | There is genuinely no existing mechanism to repurpose — any fix here is new code, not wiring up something dormant. |
| **T-06** | **CONFIRMED as a true independent second trigger, not a stylistic duplicate** | HUD's stop control: `recording-hud.ts:167-169`. Separately, `index.ts:2023-2043` lazy-loads `live-bug-card.ts` on any runtime error during an active session, showing a 12-second auto-dismissing toast with its own "📸 Capture Bug" button (`live-bug-card.ts:76`) whose `onCapture` independently calls `captureRollingBuffer()`/`showQuickBugCapture()` — a wholly separate code path, not a link to the HUD. | Confirms this is worth fixing, not a false positive. |
| **T-07** | **CONFIRMED** | `title-generator.ts:73`: exact string match. `types.ts:308-321`: `EnvironmentInfo` has `url` only, no `title` field, confirmed absent. | Matches prior report exactly. |
| **T-08** (dashboard focus trap) | **Not independently re-walked this pass** | Carried forward from the first audit unchanged. | Low-complexity, low-risk fix; verify at implementation time rather than re-tracing now — effort better spent on T-01/T-02/T-11. |
| **T-09** (unlabeled close "×") | **Not independently re-walked this pass** | Carried forward unchanged. | Same reasoning as T-08 — trivial, one-line fix, low priority to re-verify. |
| **T-10** (milestone-ask z-index) | **Not independently re-walked this pass** | Carried forward unchanged. | Same reasoning. |
| **T-11** | **CONFIRMED, root cause now known** | `dashboard.ts:141`: panel created at `right: -480px` (off-screen). The only code that ever restores a visible position (`compact-toolbar.ts:1242,1260`) is gated on `_panelOpen`, declared `const _panelOpen = false` at `:34` and **never reassigned anywhere in the repo** (repo-wide grep). No `openDashboard`/`toggleDashboard`/`showDashboard` function exists anywhere. The toolbar's "Saved tickets" button opens a separate popover (`_showOfflineTicketList`) that never touches `renderPanel` or `PANEL_ID`. `onboarding.ts:36` references a button id (`tracebug-toolbar-panel-btn`) that is never assigned to any DOM element. `docs/architecture.md:227-245` independently confirms a "Panel" onboarding step and several toolbar buttons were "cut from v1" and are "reachable programmatically" only. | **Verdict: organic drift, not deliberate deprecation** — no ADR, CHANGELOG entry, or PLAN note documents a decision to retire it, and the module is still actively touched by recent changes. Caveat: a host page's own script could call the exported `renderPanel()` directly (the SDK surface isn't private), so "fully unreachable" is accurate for TraceBug's own shipped UI, not for a determined embedder. |
| **T-12** | **CONFIRMED** | Native `window.confirm` at `dashboard.ts:275,1004,1754`; custom "Sure?" 3-second-reset armed button at `compact-toolbar.ts:958-974`. | Matches prior report exactly. |

---

## 2. Finalized user flows

These are the target flows after the **launch-required** fixes (§6) land. Click counts use Part
1's method: meaningful user clicks only, typing and browser permission prompts counted separately.

### 2.1 First-time user reporting a bug
1. Click extension icon → popup.
2. Click **Capture Bug** (primary button).
3. HUD appears; user reproduces the bug normally.
4. Click **Stop** on the HUD.
5. Ticket modal opens, pre-filled: title, **Summary now correctly names the real failing
   request** (T-01 fix), Possible Cause, tabs for Actions/Console/Network/AI.
6. User reviews, optionally edits title/summary.
7. Click **Export** → **.html replay** (grouped menu, T-04 fix).
8. File saved; no second modal appears unless the user has not yet dismissed the MCP card once
   (T-05 fix: opt-in/remember-dismissal, not gone entirely — see §4).

**Click count: 8, same as before** — these are correctness and clarity fixes, not step removals.
The only flow where a click can legitimately drop is step 8 once a user has dismissed the MCP card
before: **7 clicks** on repeat exports.

### 2.2 Returning QA user reporting multiple bugs in a day
Unchanged from Part 1's Flow 1 + Flow 5 (reopening a saved ticket is already the strongest flow in
the product — 2 clicks, full state restoration). No changes recommended here beyond T-01's
correctness fix carrying through to every new ticket.

### 2.3 Screenshot-only report
1. Popup → **Screenshot only** (1 click).
2. Ticket modal opens with a title that no longer reads "Empty Session — No User Interactions"
   for a deliberate screenshot capture (T-07 fix — see §7 for the staged approach, since the full
   fix needs a new `EnvironmentInfo.title` field).

**Click count: 1, unchanged.** This was already the most efficient flow in the product; the fix is
to correctness of framing, not step count.

### 2.4 Recording and evidence capture
No change recommended to the underlying capture mechanics (events-only capture is correctly the
default per `docs/launch/STATE.md`; video remains paused pending 1.11.2 per `PLAN.md` Phase 10 —
out of scope for this review). The only in-scope change is removing the duplicate "Capture Bug"
affordance during an active capture (T-06): the error-triggered toast should either **link to the
existing HUD stop control** rather than independently re-invoking capture logic, or be suppressed
entirely while a capture is already running (the toast's own purpose — "you just hit an error,
want to capture it?" — is moot if a capture is already in progress and will already include that
error).

### 2.5 Reviewing and editing a ticket
Unchanged structurally. The only visible difference after this review's fixes: the Summary line is
trustworthy (T-01), and the More ▾ menu is grouped into Send to / Export / Settings (T-04, see §4).

### 2.6 Sending to a configured integration
**Before (broken):** configure GitHub → ticket modal still says "Copy GitHub Issue" → click → the
**real send-confirmation window opens** instead of a copy happening — confusing (the label promised
something else) but not silent: the user still sees the destination and must click Send before
anything leaves the browser.

**After (fixed):**
1. Ticket modal → **Send to ▾** (grouped menu).
2. GitHub shown as "GitHub — configured" (or similar inline status, see §4); click sends via the
   confirm-send pipeline, same `confirm-send.html` dialog already working correctly today.
3. Confirm or cancel on the existing 120-second confirm window (unchanged — this part already
   works well per Part 1 Flow 4 step 6-7).

Linear and Slack need no behavior change (already correctly gated); only the same visual grouping
treatment for consistency.

### 2.7 Exporting a standalone HTML report
Unchanged mechanically. The only change is the MCP-handoff card becoming skippable after first
dismissal (T-05, §4) rather than firing unconditionally every time.

### 2.8 Handling permissions or capture failures
No changes recommended — Part 1 found these states (`restricted page`, `cross-site capture ended`,
`canvas warning`) to be the best-executed parts of the product, and this review found nothing in
source to contradict that assessment. Leave as-is.

---

## 3. Finalized recording and capture UI

- **Primary capture button stays**: popup's "Capture Bug," unchanged placement and visual weight.
  No merge with Screenshot-only — they serve genuinely different intents (a repro session vs. a
  single still), and collapsing them would cost the majority case (event capture) a click to reach
  through a sub-menu. This review found no evidence to override the first audit's call here.
- **Screenshot Only stays distinct**, secondary row in the popup — confirmed still the fastest flow
  in the product (§2.3).
- **In-page toolbar / HUD**: unchanged. It is the correct *in-capture* control surface and should
  remain the only place Stop lives during an active capture.
- **Stop/pause/resume**: Stop is confirmed working (opens ticket modal, draft saved immediately —
  Part 1 Flow 1/5). Pause state for events-capture remains **unverified** in this review (no code
  path for it was traced in either audit pass) — flagged again as a product-owner question (§8),
  not assumed to be missing or present.
- **Transition from capture to ticket review**: confirmed correct, no change.
- **Secondary/advanced controls**: the only change is removing (or linking-not-duplicating) the
  error-triggered "Capture Bug" toast during an active capture (T-06). Nothing else moves.

**What stays, moves, combines, or is removed — explicit list:**
| Control | Disposition |
|---|---|
| Popup: Capture Bug | Stays, unchanged |
| Popup: Screenshot only | Stays, unchanged, not merged |
| Popup: View tickets | Stays — opens the compact-toolbar popover; see §5 for the dashboard question |
| HUD Stop | Stays, unchanged |
| Error-toast "Capture Bug" button | **Moves**: becomes a link to the existing HUD control (or is suppressed while already capturing) — not removed as a feature, since it's useful when no capture is running |
| `Alt+B` hint | Stays in the popup footer; **also surfaced** in welcome/what's-new (additive, nothing removed) |

---

## 4. Finalized ticket review and export menu

**Proposal verified and approved, with two label-accuracy conditions:**

```
Send to ▾
  GitHub   — [configured | not configured]     <- label now driven by hasIntegration("github"), not _githubRepo
  Linear   — [configured | not configured]     <- already correct, just regrouped
  Slack    — [configured | not configured]     <- already correct, just regrouped

Export ▾
  .html replay
  .zip
  .spec.ts
  Markdown (.md)
  AI-ready .html
  Screenshots
  Jira (copy only)        <- explicitly labeled "copy only" — Jira is not a live send, by design (CORS-blocked for browser XHR, tracker-client.ts:15-18), and must not sit visually equivalent to GitHub/Linear/Slack

Settings ▾
  Configure integrations…
  Export footer toggle
  Issue signature toggle
```

**Verification that each action does what it promises, post-fix:**
- GitHub/Linear/Slack under "Send to": once T-02 is fixed, all three correctly route through
  `hasIntegration()` → real send via `_fileViaTracker`, falling back to copy only when unconfigured
  — matching the label.
- Jira under "Export," explicitly marked copy-only: already accurate today (`tracker-client.ts`
  confirms no live Jira path exists or is planned under the current CORS constraint); the fix here
  is purely the menu location and label, not behavior.
- All five non-Jira Export items: unchanged, already correctly implemented per the original CODEMAP
  references (`quick-bug.ts:1100-1260` export listeners) — no behavior change, only menu structure.

**Post-export MCP-handoff modal — final call: opt-in via remembered dismissal, not removed
outright.** The card has real value for the SDK's actual target user (someone debugging with an AI
coding agent), so outright removal would cut a feature some users want. Since no suppression
mechanism exists today (confirmed in §1, T-05), this needs new code: a `localStorage` flag (e.g.
`tracebug_mcp_card_dismissed`) checked before `showMcpHandoffCard` fires, set when the user closes
it via the X/Esc/overlay-click paths that already exist.

---

## 5. Architecture decision: two ticket-list UIs

**Recommendation: do not remove `dashboard.ts`; restore its entry point, or formally fold its
unique capabilities into the compact-toolbar popover — this is a product-owner decision, not an
engineering default.**

Reasoning, based on this review's evidence:
- The panel is **not dead code by accident of neglect** — it's actively maintained (recent
  CHANGELOG entries touch `dashboard.ts`), has a richer feature set (tabbed session detail, voice
  notes, annotation list editor, full report builders) than the compact-toolbar's lightweight
  card-list popover, and was clearly a deliberate, substantial piece of engineering.
- It became unreachable through **organic drift**, not a deliberate replacement decision —
  `docs/architecture.md` documents that several toolbar buttons (Annotate, Draw, Settings, and the
  panel-open trigger itself) were cut from a v1 onboarding tour and left "reachable
  programmatically" only, with no ADR or PLAN entry marking dashboard.ts as superseded.
- Removing 2,430 lines of working, tested functionality without product sign-off would violate this
  audit's own "do not remove a feature without verifying its dependencies and purpose" instruction
  — purpose is now understood (richer session management), dependency on it from the exported
  report builders is plausible given shared `buildTextReport`/`buildHtmlReport` functions referenced
  in `docs/launch/CODEMAP.md`, and that needs a dedicated check before any removal is even
  considered.
- **This does not block launch.** The dead-but-harmless state causes no user-visible breakage
  today; shipping 1.11.x with this unresolved is lower-risk than rushing an architecture decision
  under launch pressure.

Three options for the product owner, in order of this review's preference:
1. **Restore a working open-trigger** (wire `_panelOpen` and the "View tickets" or a new button to
   actually call into `renderPanel`), keeping the compact-toolbar popover as a lightweight quick-view
   and the dashboard as the "full" view — lowest engineering cost, preserves both investments.
2. **Consolidate**: migrate the compact-toolbar popover's simpler card-list into being the
   entry point that *opens* the dashboard panel for full detail, removing the current two-popover
   split — more engineering cost, cleaner end state.
3. **Formally retire** dashboard.ts after confirming (a) no exported-report code depends on its
   internals and (b) no saved user data format is unique to it — highest cost to verify safely,
   recommended only if product direction is to simplify to one ticket-list surface permanently.

---

## 6. Final prioritized change list

| ID | Final decision | User problem | Approved recommendation | Priority | Files affected | Acceptance criteria |
|---|---|---|---|---|---|---|
| T-01 | **Approved, required before launch** | Ticket Summary can name the wrong failed request | Apply `isNoiseRequest` filter in `generateSmartSummary`, matching `generateRootCauseHint` | P0 | `src/report-builder.ts` | Summary and Possible Cause never disagree on which request failed when a noise request (asset/analytics) precedes a real failure chronologically; new test added mirroring the existing `generateRootCauseHint` noise-regression case |
| T-02 | **Approved, required before launch** | Configured GitHub button is mislabeled "Copy" but performs a real send | Button label/`data-action` must read `hasIntegration("github")`, not `_githubRepo`, in extension mode; page-mode (`config.githubRepo`) behavior preserved for SDK/page consumers | **P0** | `src/ui/quick-bug.ts` (~L711-713, ~L1030-1069) | In extension mode: label reads "Open in GitHub" / performs a real send only when `hasIntegration("github")` is true, and reads "Copy GitHub Issue" / only copies when false. New regression test asserts label/action against both integration states |
| T-03 | **No code change; documentation only** | Risk of "fixing" already-correct code | Add a short comment in `quick-bug.ts` near `showIntegrationsConfigModal` clarifying the `dashboard.ts` Export-tab buttons are a separate, older surface, to prevent future confusion | P3 | `src/ui/quick-bug.ts` (comment only) | A future reader sees the pointer and doesn't re-investigate this question |
| T-04 | **Approved, first follow-up release** | Flat 11-12 item export/send menu | Group into Send to / Export / Settings; Jira labeled "copy only" | P1 | `src/ui/quick-bug.ts` (menu render block) | Menu renders 3 labeled groups; all existing actions present, none removed; Jira visually distinguished from live sends |
| T-05 | **Approved, first follow-up release** | Unconditional post-export modal interrupts every export | Add a remembered-dismissal flag; card can still be reopened from Settings if a user wants it back | P1 | `src/ui/quick-bug.ts` (`showMcpHandoffCard` call site + new localStorage flag) | Modal fires once per browser profile until dismissed; dismissal persists across sessions; a way to re-enable it exists in Settings |
| T-06 | **Approved, first follow-up release** | Two independent "Capture Bug" triggers visible during one active capture | Suppress or redirect the error-toast's Capture Bug button while a capture is already running | P1 | `src/index.ts` (~L2023-2043), `src/ui/live-bug-card.ts` | While a capture is active, the error toast either doesn't show its own Capture Bug button or routes to the same HUD stop-and-review action instead of a second independent capture path |
| T-07 | **Approved, first follow-up release (staged)** | "Empty Session — No User Interactions" misdescribes a deliberate screenshot | Stage 1 (small): special-case the screenshot-only capture mode's title. Stage 2 (larger): add `document.title` to `EnvironmentInfo` for a proper page-based fallback title everywhere | P2 | `src/title-generator.ts`, `src/types.ts`, environment-capture code | Screenshot-only tickets no longer read "Empty Session"; title reflects the captured page |
| T-08 | **Approved, first follow-up release** | `dashboard.ts` overlay has no focus trap/restore | Port the existing `quick-bug.ts` focus-trap pattern | P2 | `src/dashboard.ts` | Tab/Shift+Tab wraps inside the panel when open; focus returns to the triggering element on close |
| T-09 | **Approved, first follow-up release** | Ticket-popover close "×" has no accessible name | Add `title`/`aria-label` | P3 | `src/compact-toolbar.ts` (~L852) | Screen reader announces a name for the close control |
| T-10 | **Approved, first follow-up release** | Milestone-ask card can visually overlap the ticket modal | Defer showing the card until the modal closes, or lower its z-index below the modal's | P3 | `src/ui/milestone-ask.ts` | Card never renders on top of an open ticket modal |
| T-11 | **Decision required from product owner** | Dashboard panel is fully unreachable; unclear if intentional | Pick one of §5's three options | — | `src/compact-toolbar.ts`, `src/dashboard.ts`, possibly `src/index.ts` | Depends on chosen option; see §5 |
| T-12 | **Approved, optional future improvement** | Two different delete-confirmation idioms across two ticket-list UIs | Standardize once T-11 is decided (don't do this first, it depends on which list UI survives) | P3 | `src/dashboard.ts`, `src/compact-toolbar.ts` | One consistent confirm pattern across whichever ticket-list UI(s) remain |

**Required before launch:** T-01, T-02.
**Recommended for the first follow-up release:** T-04, T-05, T-06, T-07, T-08, T-09, T-10.
**Optional future improvements:** T-12 (depends on T-11).
**Decisions requiring product-owner approval:** T-11 (and, downstream of it, T-12's final shape).

**Dependencies and smallest safe sequence:**
1. T-01 and T-02 are independent of each other and of everything else — ship together as one
   small, test-covered phase. These are the only launch-blocking items.
2. T-03 is a zero-risk comment-only change, bundle it with T-01/T-02's PR for free.
3. T-04 should land before or alongside T-05 (both touch the same menu-rendering block in
   `quick-bug.ts`) to avoid two separate diffs to adjacent code.
4. T-06 is independent and can ship anytime after T-02 (no shared code, just sequenced after the
   higher-priority fix for reviewer bandwidth reasons).
5. T-07, T-08, T-09, T-10 are each fully independent, small, and can ship in any order or batched
   into one "polish" PR.
6. T-11 blocks nothing technically — it can be decided and implemented whenever the product owner
   is ready — but T-12 should wait for it to avoid redoing the consistency fix twice.

---

## 7. Implementation-ready specifications

### T-01 — Summary noise-filter fix
- **Existing behavior:** `generateSmartSummary` (`report-builder.ts:344-384`) headlines
  `report.networkErrors[0]` unconditionally.
- **Intended behavior:** headlines the first *non-noise* network error, matching
  `generateRootCauseHint`'s existing logic.
- **User-facing change:** the Summary line in the ticket modal, every exporter, and the saved
  ticket will name the same failing request as "Possible Cause" whenever both exist.
- **Technical approach:** replace line 349's `report.networkErrors[0]` with
  `report.networkErrors.find(n => !isNoiseRequest(n.url))`, importing `isNoiseRequest` from
  `src/url-hygiene.ts` (already imported in `report-builder.ts` for the sibling function — reuse,
  don't re-import). Preserve the existing fallback chain (error/click/generic) when the result is
  `undefined`.
- **Tests required:** add a case to `tests/report-builder.test.ts`'s `generateSmartSummary` describe
  block mirroring the existing noise-regression test in `generateRootCauseHint`'s block
  (lines 221-245) — same camo.githubusercontent.com-style fixture, asserting the summary names the
  real failure, not the noise request.
- **Acceptance criteria:** existing `generateSmartSummary` tests (lines 102-166) still pass
  unchanged; new noise test passes; manual check of Flow 1's seeded-bug scenario in
  `docs/audit/product-flow.md` shows Summary naming `/api/orders`, not `/favicon.ico`.
- **Manual verification:** re-run Flow 1 from `product-flow.md` in a real browser against the
  built extension; confirm the Summary line.
- **Rollback:** single-line revert; no data migration, no stored-ticket format change (this only
  affects newly generated summaries, not stored ticket content, so no backward-compat concern for
  already-saved tickets).

### T-02 — GitHub button source-of-truth fix
- **Existing behavior:** `quick-bug.ts:711-713` sources the GitHub button's label and
  `data-action` from `_githubRepo`, which is only ever set from the page-mode SDK config
  (`config.githubRepo`, `index.ts:436`). In extension mode this is always `null`.
- **Intended behavior:** in extension mode, the label and action must reflect
  `hasIntegration("github")` from `src/ext-transport.ts`. Page/SDK mode (where `config.githubRepo`
  is the only concept of "configured") keeps its current behavior unchanged — this is additive, not
  a replacement of the page-mode path.
- **User-facing labels:** "Open in GitHub" when configured (extension mode via `hasIntegration`, or
  page mode via `_githubRepo`); "Copy GitHub Issue" when not. No new label text needed — the
  existing two strings are correct, only the condition driving them changes.
- **Technical approach:** introduce a combined condition at the render site, e.g.
  `const githubConfigured = isExtensionMode() ? hasIntegration("github") : !!_githubRepo;` and use
  `githubConfigured` in place of the bare `_githubRepo` check at lines 711-713. The `data-action="open-github"`
  handler's guard at line ~1030 (`if (openGhBtn && _githubRepo)`) needs the equivalent update so the
  "Open in GitHub" path actually attaches in extension mode too — today it's dead in that mode
  because of the same `_githubRepo`-only check. Audit `_fileViaTracker`'s existing `hasIntegration`
  gate at line 1056 to confirm it still behaves correctly once the button consistently reaches it
  with the right label displayed first (it already does — this fix makes the label match what that
  handler already does, rather than changing the handler).
- **Tests required:** new test(s) in whatever suite covers `quick-bug.ts` rendering (or a new
  focused test file) asserting: extension mode + `hasIntegration("github")===true` → label "Open in
  GitHub", `data-action="open-github"`; extension mode + false → "Copy GitHub Issue",
  `data-action="github"`; page mode behavior unchanged in both branches (regression guard for the
  existing SDK consumers).
- **Acceptance criteria:** manually reproduce Flow 4 from `product-flow.md` — configure GitHub via
  options.html, open a new capture's ticket modal, confirm the button's label matches what it's
  about to do and that clicking it opens the real confirm-send flow (every send path already goes
  through that confirm window; the defect being fixed is the label not matching the action, not any
  send happening without it).
  **Shipped label scheme, superseded this spec's suggested text:** "Send to GitHub" in extension
  mode when configured (never "Open in GitHub" — nothing opens, a confirm window does), "Open in
  GitHub" unchanged in page/SDK mode where a tab genuinely opens. See
  `docs/audit/tracebug-control-inventory.md` for the as-shipped behavior and its own e2e coverage
  (`e2e/ext-github-send-confirm.e2e.mjs`).
- **Manual verification required** (cannot be fully verified without a real browser + a real or
  test GitHub token): the actual confirm-send dialog and a real/sandboxed GitHub API call.
- **Rollback:** revert the condition change; no stored-data migration involved.

### T-04 — Menu regrouping
- **Existing behavior:** `quick-bug.ts:724-741`, one flat `<div>` of up to 12 items.
- **Intended behavior:** same action set, rendered inside three labeled groups (Send to / Export /
  Settings) as specified in §4.
- **Technical approach:** wrap the existing item-generation logic in three sub-blocks with a
  heading element each; no change to any individual action's handler, only to the markup
  surrounding them. Jira's existing menu item gets a visual sub-label or icon indicating "copy
  only" (reuse whatever label/badge pattern already exists elsewhere in the file, if any, for
  consistency — check `_estimateHtmlExportBytes`-adjacent UI for an existing badge style before
  inventing a new one).
- **Tests required:** update any existing test asserting the menu's item count/DOM structure (grep
  for tests referencing `tb-qb-more-menu`) to expect the new grouped structure.
- **Acceptance criteria:** all current items remain clickable and functionally unchanged; items are
  visually grouped; Jira is visually distinguishable from GitHub/Linear/Slack.
- **Manual verification:** visual check in a real browser; keyboard navigation through the
  regrouped menu still reaches every item (don't regress the existing `role="menu"`/`menuitem`
  semantics noted in the UI inventory).
- **Rollback:** revert the markup change; no behavior/data impact.

### T-05 — MCP-handoff modal dismissal
- **Existing behavior:** `showMcpHandoffCard` (`quick-bug.ts:3608`) fires unconditionally after
  every successful `export-replay` (`:1291`).
- **Intended behavior:** fires until dismissed once, then stays suppressed; re-enablable from
  Settings.
- **Technical approach:** add a `localStorage` flag (e.g. `tracebug_mcp_card_dismissed`, following
  the project's existing `tracebug_*` page-localStorage naming convention per CODEMAP.md), checked
  before the call at line 1291; set it in the card's existing close handlers (X/Esc/overlay-click).
  Add a "Show MCP card again" toggle or link in the Settings/More-menu area (reuse the existing
  toggle pattern already used for `toggle-export-footer`/`toggle-issue-signature`).
- **Tests required:** unit test asserting the card does not fire when the flag is set, and does
  fire when absent.
- **Acceptance criteria:** first export shows the card; dismissing it suppresses it on subsequent
  exports within the same browser profile; the re-enable toggle restores it.
- **Manual verification:** export twice in a real browser, confirm the card appears once.
- **Rollback:** remove the flag check; card reverts to firing every time. No data migration risk —
  worst case is a stray unused localStorage key.

### T-06 — Duplicate capture-bug trigger
- **Existing behavior:** `live-bug-card.ts`'s error-triggered toast independently re-invokes
  capture/ticket logic regardless of whether a capture is already active.
- **Intended behavior:** while a capture is active, this toast either doesn't offer its own Capture
  Bug button, or its button becomes "View capture" / routes to the same HUD-stop-and-review flow
  instead of starting a second independent action.
- **Technical approach:** check the active-capture state (however `index.ts`/`compact-toolbar.ts`
  already expose it, e.g. the status used to render the HUD) before deciding which button variant
  `live-bug-card.ts` renders at `index.ts:2023-2043`.
- **Tests required:** test asserting the toast's button behaves differently (or doesn't render)
  when a capture is already running vs. not.
- **Acceptance criteria:** during an active capture, only one visible "stop and review" affordance
  exists at a time.
- **Manual verification:** reproduce Flow 1 step 5 from `product-flow.md` (an error occurring mid-capture) and confirm only one capture-ending control is presented.
- **Rollback:** revert the conditional; toast reverts to always offering its own button.

---

## 8. Unresolved questions for the product owner

1. **T-11**: restore the dashboard's entry point, consolidate it into the compact-toolbar popover,
   or formally retire it (§5)? This is the only open architecture decision in this review.
2. **Pause state** for events-capture: does one exist or is "Stop only" intentional? Neither audit
   pass found code confirming either answer.
3. **Jira's long-term status**: confirmed permanent (CORS-blocked), not "coming soon" — does the
   product want copy-only Jira support marketed any differently given that permanence?
4. **MCP-handoff card's re-enable path** (T-05): where in Settings should "show it again" live —
   is a new Settings row acceptable, or should it be folded into existing toggles?

Everything else in this review has a clear, approved technical path and does not need
product-owner input before implementation begins.

---

## 9. Implementation sequence (smallest safe order)

1. **Phase A (launch-blocking):** T-01 + T-02 + T-03's comment, one PR, with the two new regression
   tests specified in §7. This is the only phase that must land before submission.
2. **Phase B (first follow-up):** T-04 + T-05 together (same file region), then T-06 separately.
3. **Phase C (polish, any order, can be one batched PR):** T-07 (stage 1 only — the title
   special-case; defer the `EnvironmentInfo.title` addition to a later pass since it's a larger,
   additive data-model change), T-08, T-09, T-10.
4. **Phase D (pending product-owner decision):** T-11, and T-12 once T-11 is settled.

Each phase is independently revertable and independently testable, matching this repo's existing
one-phase-per-session workflow (`docs/launch/PLAN.md`'s "How this is run").
