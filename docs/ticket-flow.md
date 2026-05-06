# Bug Ticket Flow

TraceBug treats a recording cycle as a single **bug ticket**. Screenshots, voice notes, screen recording, and captured events accumulate in the ticket; nothing is downloaded until the user explicitly exports.

This document explains the full step-by-step flow, what each surface does, and the options available at each step.

> **v1.0 update — Sentry Mode is the recommended flow.** The traditional one-shot `startRecording → stopRecording` flow still works, but for QA who need to file multiple bugs in one session, **arm Sentry mode once at the start and use 📸 Capture instead of stopping between bugs.** See [Sentry Mode](#sentry-mode-rolling-video-buffer) below.

---

## The classic flow (one bug per session)

```
startRecording()
   ↓
user reproduces the bug
  • clicks, inputs, navigation, network, errors  → captured automatically
  • toolbar Camera button                        → screenshot added to ticket
  • toolbar Region button                        → drag-to-crop, added to ticket
   ↓
stopRecording()  ──auto-opens──>  Ticket-Review Modal
                                     ↓
                            review title + description
                            review numbered screenshot gallery
                                     ↓
                            click an export action (GitHub / Jira)
                                     ↓
              clipboard payload  +  every screenshot downloads (PNG, staggered 120ms)
```

---

## Sentry Mode (rolling video buffer)

The new default for video recording. Click **🔴 Record** once, file as many bug tickets as you want from the same screen-share. Inspired by NVIDIA Shadowplay / OBS replay buffer.

```
TraceBug.startVideoRecording()  →  OS screen-picker  →  HUD pill appears
   ↓
user reproduces bug A
  • types comments in HUD          → timestamped to recording time
  • toolbar Camera / Region        → screenshots added to ticket
   ↓
clicks 📸 Capture in HUD  ──or──  JS error fires + toast → "Capture with video"
   ↓
captureRollingBuffer()  ──opens──>  Ticket-Review Modal (with embedded video)
   ↓
export → screenshots + .webm download, ticket markdown copied
   ↓
recording is STILL RUNNING — comments reset for the next bug
   ↓
[ user finds bug B → 📸 Capture again → another ticket ]
   ↓
clicks ⏹ Stop  →  if any captures were taken, ends silently
                 if none, opens the modal with the full recording
```

### What's in the HUD

| Element | Behavior |
|---|---|
| Pulsing red dot + timer | Visual proof recording is active |
| `N captured` chip | Increments on each `📸 Capture`. Hidden in `mode: "standard"` |
| Comment input | Type → press Enter → saved with current `offsetMs` to the active recording |
| 📸 Capture button | Snapshots into a `VideoRecording`, opens ticket modal, recording continues |
| ⏹ Stop button | Ends the screen-share. Smart modal-open behavior (see above) |

### Auto-capture on error

When an unhandled JS error fires *and* a rolling session is armed, the existing error-detected toast switches its action label from `Capture bug` → `Capture with video`. Clicking calls `captureRollingBuffer()` automatically — no need to spot the bug yourself.

### What gets attached to the ticket

- The captured `.webm` (Blob URL, in-memory)
- Comments (each: `{ offsetMs, text }`) cleared after each capture so each ticket gets its own
- All screenshots taken since the modal was last closed
- Auto-generated title, smart summary, root-cause hint, environment, console errors, network failures — same as classic flow

The exporters (GitHub markdown / Jira / PDF) all gained a "Screen Recording" section listing the auto-downloaded `.webm` filename, duration, file size, and timestamped comments. The blob auto-downloads alongside screenshots on every export action.

> **API:** `TraceBug.startVideoRecording({ mode: "rolling" })`, `TraceBug.captureRollingBuffer()`, `TraceBug.stopVideoRecording()`. Full reference: [api-reference.md → Sentry Mode](api-reference.md#sentry-mode-rolling-video-buffer).

---

## Auto-Scanner (parallel detector path)

Independent of the recording flow. Click **🔍 Scan** to run six detectors and surface issues you might not have noticed:

```
TraceBug.scanPage()
   ↓
runs in parallel: a11y (axe-core), broken images, mixed content,
                  console errors, failed requests, slow APIs
   ↓
issues panel opens with severity buckets (critical / serious / moderate / minor)
   ↓
per-issue actions:
  📍 Locate     →  scroll into view + 2.4s purple flash on the element
  File ticket   →  pre-fills Quick Bug modal with issue title + description
  Dismiss       →  hide for this session (in-memory only)
```

> **API:** [api-reference.md → Auto-Scanner](api-reference.md#auto-scanner). Issues live in memory only; reload = fresh scan.

---

## Step 1 — Start

```js
TraceBug.startRecording();   // alias for resumeRecording()
```

By default, recording is on after `TraceBug.init()`, so most users never need to call this. Use it after a `stopRecording()` to begin a new ticket.

The session continues using the same `sessionId` — the "ticket" boundary is the recording window, not a new session.

---

## Step 2 — Capture

While recording, the floating toolbar on the right edge of the page surfaces two screenshot actions:

| Button | Tooltip | Behavior |
|--------|---------|----------|
| **Camera** | "Screenshot (Ctrl+Shift+S) — added to ticket" | Captures full viewport (uses `chrome.tabs.captureVisibleTab` in extension context, html2canvas otherwise). Adds to ticket. |
| **Corner-square** | "Region Screenshot — drag to select, added to ticket" | Shows a fullscreen overlay; user drags a rectangle; cropped PNG (DPR-aware) is added to ticket. `Esc` cancels. |

Toast confirms the addition:

> Added to ticket · 3 screenshots

The screenshots live in an in-memory ring buffer (cap: 50) accessible via `TraceBug.getScreenshots()`. **Nothing is written to disk at this stage.**

Other capture surfaces during the same window:
- **Click / input / navigation** → tracked automatically by the SDK collectors
- **Voice notes** → `TraceBug.startVoiceRecording(...)` (Web Speech API, transcript only)
- **Element annotations / draw mode** → toolbar buttons; live alongside screenshots in the ticket

---

## Step 3 — Stop & review

```js
TraceBug.stopRecording();
```

This pauses event capture **and** auto-opens the ticket-review modal. (Equivalent to clicking the recording toggle in the toolbar.)

The modal — header **"Bug Ticket — Review & Export"** — shows:

| Region | Content |
|--------|---------|
| **Title** | Auto-generated from session context (`generateBugTitle`); editable |
| **Description** | Auto-generated: root cause hint, summary, recent steps, error, failed network requests, environment; editable |
| **Primary preview** | The first screenshot in the ticket, full-width |
| **Thumbnail strip** | Numbered (1, 2, 3, …) thumbnails of every other screenshot. Click a thumbnail to swap it into the primary preview. |
| **Header count** | "N screenshots attached · download/copy includes all screenshots" |

Drafts auto-save to `localStorage` under `tracebug_last_bug_draft`; if you accidentally close the modal, the next open recovers the title + description.

---

## Step 4 — Export

The modal exposes **five** export actions. Every one of them downloads **all** screenshots in the ticket alongside the clipboard / URL payload.

| Action | Output | Screenshots |
|--------|--------|-------------|
| **Open in GitHub** _(only if `githubRepo` is configured)_ | Opens `github.com/{repo}/issues/new?title=...&body=...` in a new tab | All downloaded, staggered 120ms |
| **Copy as GitHub Issue** | Markdown → clipboard | All downloaded, staggered 120ms |
| **Copy as Jira Ticket** | Jira-formatted text → clipboard (with priority + labels) | All downloaded, staggered 120ms |
| **Copy as Plain Text** | `title\n\ndescription` → clipboard | All downloaded, staggered 120ms |
| **Download Screenshots** | No clipboard payload | All, staggered 120ms |

The 120ms stagger prevents Chrome's "this site is trying to download multiple files" warning that fires on rapid concurrent downloads.

Toast shows the count:

> ✓ Copied as GitHub Issue · downloading 3 screenshots

After a successful export, the modal closes after 300ms and the draft is cleared.

---

## Equivalents & shortcuts

| Goal | Trigger |
|------|---------|
| Open the ticket-review modal anytime | `Ctrl+Shift+B`, the ⚡ toolbar button, or `TraceBug.quickCapture()` |
| Stop recording without opening the modal | `TraceBug.pauseRecording()` (the silent variant) |
| Resume recording without UI | `TraceBug.resumeRecording()` |
| Get the screenshot list programmatically | `TraceBug.getScreenshots()` |
| Clear all screenshots | "Clear All Data" in the toolbar settings, or `clearScreenshots()` |

---

## Programmatic API

```ts
import TraceBug, { captureRegionScreenshot, getScreenshots } from "tracebug-sdk";

TraceBug.init({ projectId: "demo", githubRepo: "owner/repo" });

TraceBug.startRecording();

// during the bug repro:
await TraceBug.takeScreenshot();          // full-viewport, added to ticket
await TraceBug.takeRegionScreenshot();    // snipping-tool, added to ticket
TraceBug.addNote({ text: "form spinner stuck", severity: "major" });

// review + export:
TraceBug.stopRecording();   // opens the modal
// ...user clicks "Copy as GitHub Issue"; markdown copied + 2 PNGs downloaded
```

If you want a fully headless export (no modal), use the existing report API:

```ts
const report = TraceBug.generateReport();
const md = TraceBug.getGitHubIssue();
TraceBug.downloadPdf();
```

The headless API does not bulk-download screenshots — that's a modal behavior. For headless bulk download:

```ts
import { downloadAllScreenshots } from "tracebug-sdk";
downloadAllScreenshots();
```

---

## Why this flow?

The previous behavior (instant download per screenshot) created two problems:

1. **Disk spam** — taking 5 screenshots in a repro flow dumped 5 files into Downloads before the user knew which ones mattered.
2. **No review window** — the user could not see the full set of captures before deciding which to attach to a ticket.

The ticket flow keeps screenshots in memory until the user has reviewed them, then bundles the export. The cost is one extra click ("Stop") at the end of the repro; the win is a tidy Downloads folder and a single coherent ticket payload.
