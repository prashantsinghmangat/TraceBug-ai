# Capture architecture audit — why tickets come back empty

Written 2026-10-19 against `develop` @ 1.11.0, after a user test on Chrome 155 produced a ticket
reading **"1 screenshot attached · 0 events"**. Every claim below was reproduced in a real browser
with the unpacked extension loaded — the harnesses are described per finding so they can be re-run.
Nothing here is inferred from reading code alone.

The question this answers: *is the capture pipeline sound, and what is the smallest architecture
that makes it reliable?*

---

## 1. The pipeline as it exists today

```
popup.js  ── TB_START_RECORDING ──►  background.js (service worker)
                                       │  ensureAlive(tabId) / injectSDK(tabId)
                                       │     ├─ ISOLATED world: secret-migration.js, content-script.js
                                       │     └─ MAIN world:     tracebug-sdk.js, tracebug-init.js
                                       ▼
                         content-script.js  ── CustomEvent ──►  page MAIN world
                                                                   │
                                        TraceBug.prepareRecording() → startEventsCapture()
                                                                   │
            ┌──────────────────────────────────────────────────────┼─────────────────────────┐
            ▼                             ▼                        ▼                         ▼
   collectors.ts listeners        rrweb record()          HUD (Stop control)        console wrappers
   (click/input/fetch/XHR/perf)   (DOM stream, memory)     #tracebug-root           (lazy, per session)
            │                             │
            └──────────── appendEvent() ──┴──►  window.localStorage["tracebug_sessions"]
                                                        (THE HOST PAGE'S OWN ORIGIN)
                                                                   │
                                                 quick-bug modal → report-builder → .html export
```

**The load-bearing design decision is the last box:** every captured byte lives in the *host page's*
`localStorage`, in the *top frame* of *one origin*. Every defect below is a consequence of that one
choice. The service worker holds no capture data at all — it is only an injector and a relay.

---

## 2. Verified defects, worst first

| # | Defect | Severity | Reproduced | Status |
|---|---|---|---|---|
| 1 | A cross-origin navigation silently kills the capture; returning resurrects a zombie | **Critical** | yes | **fixed 1.11.1** — worker owns it; `e2e/ext-cross-site-capture` |
| 2 | Nothing inside any iframe is captured — clicks, console, network | **Critical** | yes | **warned 1.11.1**, fixed in v2.0 (Phase 12) — no `allFrames` before redaction covers frames |
| 3 | Every fetch/XHR is recorded twice, the duplicate carrying a wrong method | **High** | yes, incl. in the user's own export | **fixed 1.11.1** — `src/network-dedupe.ts` |
| 4 | Typing into `contenteditable` is never recorded | **High** | yes | **fixed 1.11.1**, and the replay now masks sensitive editors |
| 5 | "Capturing" HUD promises more than the capture delivers | **Medium** | by inspection | **fixed 1.11.1** — "Replay, not video" + live tally |
| 6 | "Add page shot" button stranded mid-row | **Low** | yes | **fixed** |

Two more found while fixing these, both now closed: the page-load backfill marked every entry "seen"
while recording was off, so a capture contained no page-load network at all; and the user's **Mask
patterns never reached replay text**, which the popup described as "masked anywhere in captured text".

### 2.1 — Cross-origin navigation kills the capture, and the HUD lies about it

The popup's **"Keep capturing across sites"** toggle says: *"Right now a capture stops at the first
move to another site. Turn this on to follow along."* Granting `<all_urls>` does **not** deliver
that. It only buys re-injection on the next site; the capture state cannot travel with it.

Harness: capture armed on `http://localhost:4190`, click, navigate to `http://127.0.0.1:4191`
(different origin), click, navigate back.

```
site B state:  { sdkPresent: true, toolbar: true, keys: [] }      ← SDK is there; no TraceBug state at all
hudCameBackOnSiteB: false                                          ← no Stop control, no indication
back on site A: { hud: true, timer: "00:07",
                  keys: [tracebug_events_capture_started, tracebug_active_session,
                         tracebug_sessions, tracebug_active_capture_mode] }   ← zombie capture resumes
```

So the user's sequence is:

1. Arms the capture on site A. Events land in A's `localStorage`.
2. Navigates to site B. The toolbar reappears (permission granted, injection works) **but the HUD is
   gone, the capture is over, and nothing says so.** Everything done on site B is recorded nowhere.
3. Goes back to A later and finds a capture still "running" at 00:07 — because
   `tracebug_events_capture_started` was never cleared on A's origin.

This is the first thing the tester did, and it is exactly the flow the toggle advertises.
`src/storage.ts` is `localStorage`-backed per origin; `src/index.ts:_restoreVideoSessionOnInit`
resumes from that same per-origin flag. The toggle and the storage model contradict each other.

### 2.2 — Iframes are invisible to the capture

`background.js:injectBridge/injectPageWorld/injectSDK` all call `chrome.scripting.executeScript`
with `target: { tabId }` and **never** `allFrames: true` — the string `allFrames` appears nowhere in
the repo. Collectors are therefore attached only to the top document.

Harness: a top-frame button, a same-origin iframe button, and a cross-origin iframe button, each
firing a `console.error` and a failing `fetch`. All three clicked during one capture:

```
actions: 1                                  ← only the top-frame click
consoleErrors: ["top frame error"]          ← the two iframe errors are gone
network: ["/api/top 500", ...]              ← /api/child never appears
```

rrweb still *draws* the same-origin iframe in the replay, which makes this worse, not better: the
report shows the user a frame they appear to have interacted with, with none of the interaction,
console or network behind it. Any app that puts its real UI in an iframe — preview panes, embedded
editors, payment fields, canvas sandboxes — produces a near-empty ticket. **This is the most likely
explanation for the tester's 0-event ticket**, which was taken on a page whose main content renders
in an iframe; the authenticated page could not be reproduced here, so that attribution is probable,
not proven.

**This does NOT mean "inject into every frame".** `allFrames: true` would put TraceBug's collectors
inside payment and identity frames — Stripe, Auth0, 3-D Secure — and start recording card numbers
and passwords, and each cross-origin frame would need site access for its own origin on top of
that. Capturing frames is only safe once every frame's input goes through the redaction rules,
which is v2.0 work (§5, Option B). For 1.11.x the fix is to **tell the user**, the way the canvas
warning does: when frames cover a large share of the viewport, say that frame content is not
captured yet. A warned empty ticket is a disappointment; an unwarned one is a lost bug report, and
a capture inside a card field is a breach.

### 2.3 — Every network request is captured twice, and half of them lie

`collectApiRequests` / `collectXhrRequests` (the fetch/XHR wrappers) and `collectPerformanceNetwork`
(the Resource Timing backfill) both emit the same request. `_emitPerfEntry` dedupes only *within*
the Resource Timing source (`_perfSeen`); there is no cross-source dedupe.

In the tester's own export: **112 network rows, 75 distinct paths, 26 paths duplicated.** The
duplicate is actively wrong, not merely redundant (IDs elided, path shape kept):

```json
{ "method": "POST", "url": "/api/organizations/…/sessions",          "status": 200, "duration": 882 }
{ "method": "GET",  "url": "https://<host>/api/organizations/…/sessions", "status": 200, "duration": 865 }
```

Resource Timing does not expose the HTTP method, so `_emitPerfEntry` hardcodes `GET`. A developer
reading the report sees a POST and a phantom GET to the same endpoint. For a tool whose whole value
is "the network panel, preserved", shipping a fabricated row is the worst kind of bug — and it
inflates export size on every ticket.

Note the shape of that pair, because it decides how the fix has to work: **the wrapper row carries
the URL as the app wrote it (relative), the timing row carries the resolved absolute one.** A
dedupe that compares the two strings as they stand would match almost nothing. Both sides have to
be resolved against the page origin before comparison, paired on start time within a small window,
and the **wrapper row must win** — it is the one with the true method and status. Timing rows that
no wrapper row explains (images, scripts, CSS, beacons, service-worker traffic) are the backfill
doing its job and must survive.

### 2.4 — `contenteditable` typing is dropped

`collectInputs` guards with `if (!t || !("value" in t))`, so only `<input>`/`<textarea>` are
recorded. Confirmed: typing into a `contenteditable` div produced a click event and no input event;
the same typing into a plain `<input>` produced one. Every modern rich-text surface — ProseMirror,
Slate, Quill, Lexical, TipTap, the Claude composer, Notion, Linear's editor — is `contenteditable`.
On those apps "what the user typed" never reaches the repro steps.

Shadow DOM is fine (clicks retarget to the host and are captured) — only iframes and
`contenteditable` are blind spots.

### 2.5 — The HUD overstates what is running

A red dot plus "Capturing" plus a running timer reads as *video is recording*, which is what the
tester concluded. In 1.11 `VIDEO_ENABLED_IN_EXTENSION = false`, so there is no video by design — the
replay is the DOM stream. The explanation currently lives only in a `title` tooltip
(`src/ui/recording-hud.ts:163`), which nobody reads. Combined with 2.1–2.4, a user who interacts
only inside an iframe sees a confident recording indicator and receives an empty ticket. The
indicator should reflect what has actually been captured, not merely that a timer is running.

### 2.6 — "Add page shot" alignment (fixed here)

`.tb-qb-ss-add { margin-left:auto }` is applied to both trailing buttons in the screenshot header,
so the free space splits between them and "Add page shot" is stranded in the middle of the row.
Fixed in `src/ui/quick-bug.ts` with `.tb-qb-ss-add + .tb-qb-ss-add { margin-left:0 }` — both buttons
now sit together at the right edge.

---

## 3. Root cause, stated once

> Capture state and capture data live in the host page's `localStorage`, in the top frame, scoped to
> one origin — while the thing being captured is a *tab*, which spans frames, origins and
> navigations.

Everything in §2.1–2.4 is that mismatch surfacing. No amount of patching inside the page SDK fixes
it, because the page SDK is destroyed and recreated on every navigation and exists once per frame
with no way to talk to its siblings.

There is a second cost, and it is worth stating precisely rather than dramatically. `CLAUDE.md`
already notes that in extension mode the SDK runs in the page's MAIN world, so the capture sits in
that origin's `localStorage` — readable by any script running on that page. A site can therefore
read what was captured **on that same site**, which is mostly a record of its own activity. The
sharp edge is not the first-party site; it is **third-party scripts running on it** — analytics,
tag managers, session-replay vendors, ad SDKs — which can read captured URLs and typed text that
they would otherwise never see. That is a real reason to move the buffer into the extension in
v2.0. It is not grounds for saying "any site can read your whole capture", and it should not be
described that way outside this document.

---

## 4. What tools in this class do instead

Jam, Replay.io, BugHerd, Marker.io and similar MV3 recorders converge on the same shape, and it is
*simpler* than what TraceBug does today, not more complex:

1. **The extension owns the session, not the page.** The service worker (or an extension page) holds
   the buffer; `chrome.storage.session` / IndexedDB in the extension origin persists it. A
   navigation, a cross-origin jump, an SPA route change, even a worker restart are then all the same
   non-event.
2. **Instrumentation is injected into every frame** (`allFrames: true`); each frame is a dumb
   producer that posts events to the worker, tagged with its frame id and URL. Frames never own
   state. This is only safe once redaction runs over every frame's input — which is why it belongs
   here and not in a 1.11.x patch (§2.2).
3. **The UI is a sidepanel or extension page**, not a widget inside the host DOM — so it cannot be
   styled, blocked or read by the host page, and it survives navigation without re-mounting.
4. **One recording surface, not two.** Either DOM replay or video, decided once; the HUD states
   plainly which one is running and shows a live count of what it has captured.

TraceBug already has the hard parts of this: a reliable injector with health checks and repair, an
rrweb pipeline, an excellent exporter, a ticket modal that beats most of the field. What it is
missing is the *ownership* flip in point 1 — and points 2–4 become cheap once that lands.

---

## 5. Two ways forward

### Option A — 1.11.1, patch in place (no architecture change)

Fixes what is visibly wrong and warns about the rest. The cross-origin hole gets a real fix (the
worker becomes the authority on whether a capture is running); the iframe hole gets a warning, not
an injection.

| Fix | Where |
|---|---|
| Cross-source network dedupe: resolve both URLs to absolute, pair on start time within ~50 ms, **the fetch/XHR row wins**; keep timing rows for images, scripts and CSS | `src/collectors.ts` |
| Record `contenteditable` input — through the **same redaction rules as normal inputs**, with a length cap (rich editors hold messages, documents and prompts) | `src/collectors.ts` |
| Kill the zombie capture: the page asks the worker whether a capture is still running before resuming, and clears the flag if not. On a move to another site mid-capture, end it and say *"Capture ended when you left `<host>`"* on the next page | `src/index.ts`, `background.js` |
| Cross-site toggle copy that matches what it does | `popup.html` |
| Honest HUD: live "N events · M requests", and "Replay, not video" next to the dot | `src/ui/recording-hud.ts` |
| Iframe warning on the canvas pattern: frames over ~25% of the viewport → "content inside embedded frames isn't captured yet". **No `allFrames`** | `src/replay-fidelity.ts` |
| e2e: the A → B → A cross-origin harness from §2.1, as a permanent spec | `e2e/` |

The zombie fix is also the first step toward Option B: it makes the worker — not per-origin page
storage — the thing that decides whether a capture is running.

### Option B — move the session into the extension (recommended, ~1–2 weeks)

The one structural change, after which A's first four rows are free rather than earned:

1. **Event sink in the service worker.** Frames post `{frameId, url, type, data, ts}`; the worker
   appends to an in-memory buffer mirrored into `chrome.storage.session` (the pattern
   `tb_sw_state_v1` already uses — including the `_hydrated` discipline).
2. **Collectors become stateless producers.** `src/collectors.ts` keeps its current shape; only the
   `emit` destination changes from `appendEvent()` to a port message. Injected with
   `allFrames: true`.
3. **The page's `localStorage` stops holding sessions.** The host site can no longer read captures;
   `ADR 001` (local-first, no backend) is untouched — this is local-*er*.
4. **The ticket modal reads from the worker.** It can stay an in-page modal at first; moving it to a
   sidepanel later becomes a UI change, not a data change.
5. **rrweb stays per-frame** and is merged at stop, each stream tagged with its frame. (Cross-origin
   frames need `recordCrossOriginIframes` — a later step, not a blocker.)

What this costs: `src/storage.ts` gains a second engine (`localStorage` for the npm SDK, worker port
for the extension) behind the interface the invariants in `docs/ticket-flow.md` are written against,
so those tests keep their meaning. The npm SDK path is unchanged. It needs a real ADR, since
"sessions live in page `localStorage`" is implicit across the codebase.

**Decided: Option B is v2.0** — `PLAN.md` Phase 12, with `ADR 008` (the extension owns the session)
drafted alongside it. It lands with the IndexedDB migration already planned for v2.0, since both
open the same storage seam and it should only be opened once.

**1.11.1 is Option A, capture fixes first and video second.** Every user gets events-only capture by
default, so a "0 events" ticket hurts far more people than a missing video does; if the week runs
short, video moves to 1.11.2. Show HN waits for these fixes — that audience will try TraceBug on
apps with iframes and rich-text editors on day one. 1.11.0 can stay in store review as it is:
nothing here makes it worse than 1.10.

---

## 6. What was NOT audited

- The export/replay viewer. Both of the tester's `.html` files were opened in a real browser: the
  DOM replay mounts (21ms and 95ms), renders, and seeks. That half is sound.
- `report-builder.ts` severity/summary heuristics; the MCP CLI; the npm SDK path.
- Firefox. Every reproduction above was Chromium; the injection and storage model is shared, so
  §2.1–2.4 are expected to hold there, unverified.
- The authenticated page the tester hit the 0-event ticket on — see the caveat in §2.2.
