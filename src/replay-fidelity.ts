// ── Replay fidelity warnings ──────────────────────────────────────────────
// What an events-only capture CANNOT show, detected before the user has spent
// a capture finding out.
//
// The one real gap is canvas. rrweb records with `recordCanvas: false`
// (src/rrweb-recorder.ts) — deliberately, because canvas recording is enormous
// and slow — so on a page whose content IS a canvas (a chart, a map, a game, a
// WebGL view) the DOM replay renders a correctly-sized empty box. Everything
// else in the report is still right; the replay just shows nothing where the
// bug is. Telling someone that afterwards is useless, so it is checked at
// capture start, where "turn on video" is still an option — in the npm SDK.
// In the extension it is NOT an option in 1.11 (VIDEO_ENABLED_IN_EXTENSION),
// so the advice branches on `isVideoOffered()`: telling a user to turn on a
// checkbox that is not in their popup is worse than saying nothing.
//
// Deliberately NOT a blocker and not a dialog: it is one line, and a capture
// without video is still worth having on these pages — console, network and
// actions are unaffected.

import { isVideoOffered } from "./video-recorder";

/** How much of the viewport a canvas must cover before it is "the content". */
const HEAVY_CANVAS_VIEWPORT_SHARE = 0.25;
/** Below this, a canvas is a sparkline or an icon — not worth a warning. */
const MIN_CANVAS_PX = 40_000; // ~200×200

export interface FidelityWarning {
  kind: "canvas";
  message: string;
}

/**
 * Does this page draw its content in a canvas the DOM replay will miss?
 *
 * Measures rendered area against the viewport rather than counting elements: a
 * page with twelve tiny sparklines replays fine, and one with a single
 * full-bleed WebGL view does not. `getBoundingClientRect` is used because a
 * canvas's attribute size and its CSS size often differ, and what matters is
 * what the user sees.
 */
export function findHeavyCanvas(doc: Document = document): HTMLCanvasElement | null {
  let viewport = 0;
  try {
    viewport = (doc.defaultView?.innerWidth || 0) * (doc.defaultView?.innerHeight || 0);
  } catch { /* detached document */ }
  if (!viewport) return null;

  let best: HTMLCanvasElement | null = null;
  let bestArea = 0;
  let canvases: HTMLCanvasElement[] = [];
  try {
    canvases = Array.from(doc.querySelectorAll("canvas"));
  } catch { return null; }

  for (const c of canvases) {
    // TraceBug's own draw canvas is not the page's content.
    if (c.id === "tracebug-draw-canvas" || c.closest("#tracebug-root")) continue;
    let rect: DOMRect;
    try { rect = c.getBoundingClientRect(); } catch { continue; }
    const area = rect.width * rect.height;
    if (area < MIN_CANVAS_PX) continue;
    if (area / viewport < HEAVY_CANVAS_VIEWPORT_SHARE) continue;
    if (area > bestArea) { best = c; bestArea = area; }
  }
  return best;
}

/**
 * The warning to show at the start of an events-only capture, or null.
 *
 * Only ever returned for an events-only capture: with video on, the canvas is
 * recorded as pixels and there is nothing to warn about.
 */
export function eventsCaptureFidelityWarning(doc: Document = document): FidelityWarning | null {
  const canvas = findHeavyCanvas(doc);
  if (!canvas) return null;
  return {
    kind: "canvas",
    // Says what is missing, why, and the one thing that fixes it. No jargon:
    // "rrweb" and "DOM replay" mean nothing to a tester.
    message:
      "Most of this page is drawn in a canvas, which the replay can't record — " +
      "it will show an empty space. Console, network and your clicks are still captured. " +
      (isVideoOffered()
        ? "For a visual record here, stop and turn on “Record video too”."
        : "For a visual record here, take screenshots as you go — screen recording returns in 1.11.1."),
  };
}
