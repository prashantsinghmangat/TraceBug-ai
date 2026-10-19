# ADR 008 — The extension owns the capture session

**Status:** Draft — targeted at v2.0 (PLAN.md Phase 12). The first slice
(capture ownership) shipped in 1.11.1; the rest is not built.

## Context

A capture's state and every byte it collects live in the **host page's
`localStorage`** (`src/storage.ts`: `tracebug_sessions`,
`tracebug_active_session`, `tracebug_events_capture_started`). The SDK runs in
the page's MAIN world, so that store is per-origin, per-document, and readable
by the page.

The thing being captured is a **tab**. A tab spans origins, navigations and
frames. That mismatch is not a collection of bugs; it is one decision
surfacing repeatedly, and `docs/audit/capture-architecture.md` measured each
one in a real browser:

- **Cross-origin navigation killed a capture in silence** (§2.1). The HUD
  vanished with no Stop control, nothing said why, and returning to the first
  site resurrected it — the start flag was still in that origin's storage, so
  a capture that had been over for minutes came back with its timer counting.
- **Nothing inside an iframe is captured** (§2.2) — clicks, console, network.
  Fixing that by injecting into every frame would put input capture inside
  payment and identity frames, so it cannot be done until every frame's input
  passes through the redaction rules. A frame is a sibling, not a child, and
  has no shared place to write to.
- **The page can read the capture** (§3). First-party storage is readable by
  any script on the page, which in practice means third-party scripts —
  analytics, tag managers, ad SDKs — can read captured URLs and typed text.
- A capture cannot outlive the document, so every navigation is a teardown and
  a restore, and `_restoreVideoSessionOnInit` exists only to paper over it.

1.11.1 moved **one** question out of the page: *is a capture running?* The
service worker answers it (`captureTabs`, `tb:capture:status`), because it is
the only part of TraceBug that spans origins. That removed the zombie and let
TraceBug say "Capture ended when you left `<host>`". The data still lives in
the page.

## Decision

Move the session — its lifecycle **and** its events — into the extension.

1. **The service worker is the event sink.** Collectors post
   `{frameId, url, type, data, ts}`; the worker appends to an in-memory buffer
   mirrored into `chrome.storage.session`, the pattern `tb_sw_state_v1`
   already uses (including the `_hydrated` discipline). A navigation, a
   cross-origin jump, an SPA route change and a worker restart all stop being
   events the capture has to survive.
2. **Collectors become stateless producers.** `src/collectors.ts` keeps its
   shape; only the `emit` destination changes from `appendEvent()` to a port
   message. They are then injected with `allFrames: true`, each frame tagged
   by id and URL — safe only because the redaction rules run over every
   frame's input on the way into the worker.
3. **The page's `localStorage` stops holding sessions.** The host site, and
   anything running on it, can no longer read a capture.
4. **The ticket modal reads from the worker.** It can stay an in-page modal;
   moving it to a sidepanel later becomes a UI change, not a data change.
5. **rrweb stays per-frame**, merged at stop, each stream tagged with its
   frame (cross-origin frames need `recordCrossOriginIframes`).

`src/storage.ts` grows a second engine behind the interface the invariants in
`docs/ticket-flow.md` are written against — `localStorage` for the npm SDK,
worker port for the extension — so those tests keep their meaning and the npm
SDK is untouched.

## Consequences

- Cross-site captures become possible for the first time, and the iframe gap
  becomes fixable rather than permanent. The 1.11.x iframe warning
  (`src/replay-fidelity.ts`) can be deleted.
- Captures survive navigation without a restore path; `_restoreVideoSessionOnInit`
  and the per-origin start flags go away.
- A capture is no longer readable by the page it was taken on.
- **Cost:** every event becomes a message. Batching is not optional at
  50–200 mutations/s, and the worker's buffer needs the same bounds rrweb's
  already has (`trimEventBuffer`).
- **Cost:** the worker is killed after ~30s idle. `chrome.storage.session` is
  the mirror, but the write cadence has to be chosen so a kill loses at most a
  batch.
- **Risk:** this is the storage seam the IndexedDB migration also opens. Doing
  them together is the point — opening it twice is the thing to avoid.
- MV3-only, as ADR 004 already commits; the Firefox event-page background
  needs the same treatment verified separately.
- ADR 001 (local-first, no backend) is untouched: this is local-*er*.

## Alternatives rejected

- **Relay frames to the top frame via `postMessage`.** Re-implements, badly,
  the message bus the extension already has, and still cannot cross origins.
- **Keep per-origin storage and merge exports at stop.** The data on the
  origin being left is unreachable from the one being entered; merging needs a
  place that spans both, which is the worker — i.e. this ADR, with extra steps.
- **Declare cross-site capture out of scope and say so.** What 1.11.1 does,
  deliberately, as a stopgap. It makes the product honest, not capable.
