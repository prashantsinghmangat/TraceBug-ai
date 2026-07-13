// ── rrweb DOM recorder (lazy-loaded) ──────────────────────────────────────
// Captures a DOM session-replay stream alongside the screen recording. The
// stream is embedded in the exported .html in place of the multi-MB base64
// WebM: rrweb events are typically tens–hundreds of KB and are inspectable,
// not opaque pixels.
//
// Lazy-loaded exactly like html2canvas (src/screenshot.ts): the `rrweb` import
// only resolves when a recording actually starts, so the core SDK stays
// framework/peer-dep-free, and the module is stubbed out of the Chrome-extension
// IIFE bundle (tsup.config.ts) — the extension records DOM in the page context
// in a later phase.
//
// Privacy posture mirrors the rest of TraceBug: all inputs are masked
// (`maskAllInputs`), and elements the host app tags with `.tb-block` /
// `.tb-mask` are blocked or text-masked. Visual data (screenshots/video) is
// still the tester's responsibility, but DOM text defaults to "don't leak."

/** One rrweb event. Kept as a loose record so the public type surface (and the
 *  emitted .d.ts) never has to depend on rrweb's types. */
export type RrwebEvent = Record<string, unknown>;

type RecordFn = (options: Record<string, unknown>) => (() => void) | undefined;

// undefined = not yet attempted · null = attempted and unavailable (or stubbed)
let _recordFn: RecordFn | null | undefined;
let _loadPromise: Promise<RecordFn | null> | null = null;

let _events: RrwebEvent[] = [];
let _stopFn: (() => void) | null = null;
let _recording = false;

function loadRrweb(): Promise<RecordFn | null> {
  if (_recordFn !== undefined) return Promise.resolve(_recordFn);
  if (!_loadPromise) {
    _loadPromise = import("rrweb")
      .then((mod: unknown) => {
        const m = mod as { record?: unknown; default?: { record?: unknown } };
        const record = m.record ?? m.default?.record ?? null;
        _recordFn = typeof record === "function" ? (record as RecordFn) : null;
        return _recordFn;
      })
      .catch(() => {
        _recordFn = null;
        return null;
      });
  }
  return _loadPromise;
}

/**
 * Begin DOM recording. Resolves true when rrweb loaded and recording started,
 * false if rrweb is unavailable (stubbed in the extension, or import failed) —
 * callers treat false as "no DOM replay for this session" and fall back to the
 * screen recording. Idempotent: a second call while active is a no-op.
 */
export async function startDomRecording(): Promise<boolean> {
  if (_recording) return true;
  const record = await loadRrweb();
  if (!record) return false;
  _events = [];
  try {
    const stop = record({
      emit: (event: RrwebEvent) => { _events.push(event); },
      maskAllInputs: true,
      recordCanvas: false,
      collectFonts: false,
      // Inline <img> sources as data URLs so the exported .html replays fully
      // offline (file://) with no requests back to the original site — that
      // network round-trip would also be a privacy beacon. Costs bytes, but the
      // stream is gzip-compressed in the export. (CSS url() backgrounds/fonts
      // aren't covered by rrweb — a residual, minor offline gap.)
      inlineImages: true,
      blockClass: "tb-block",
      // Keep TraceBug's OWN injected UI out of the replay — the widget root
      // (toolbar, HUD, modals) and the blank draw canvas. Without this they get
      // recorded and render on top of the user's page in the exported replay.
      // The draw *SVG* overlay (data-tracebug="draw-svg") is deliberately NOT
      // matched here, so freehand pen/shape annotations still replay. With the
      // core Replayer, blocked nodes render as empty/transparent (no placeholder).
      blockSelector: "#tracebug-root, #tracebug-draw-canvas",
      maskTextClass: "tb-mask",
    });
    _stopFn = typeof stop === "function" ? stop : null;
    _recording = true;
    return true;
  } catch {
    _recording = false;
    _stopFn = null;
    return false;
  }
}

/**
 * Stop DOM recording and return the captured event stream (transferring
 * ownership — the internal buffer is reset). Safe to call when not recording;
 * returns an empty array. Idempotent, so stop paths can call it defensively.
 */
export function stopDomRecording(): RrwebEvent[] {
  if (_stopFn) {
    try { _stopFn(); } catch { /* rrweb teardown best-effort */ }
  }
  _stopFn = null;
  _recording = false;
  const events = _events;
  _events = [];
  return events;
}

/** Snapshot the current event buffer without stopping (used by rolling capture). */
export function snapshotDomEvents(): RrwebEvent[] {
  return _events.slice();
}

export function isDomRecording(): boolean {
  return _recording;
}

/** Approximate serialized size of an rrweb event stream, in bytes. */
export function domEventsSizeBytes(events: RrwebEvent[] | undefined): number {
  if (!events || events.length === 0) return 0;
  try {
    return new Blob([JSON.stringify(events)]).size;
  } catch {
    return JSON.stringify(events).length;
  }
}
