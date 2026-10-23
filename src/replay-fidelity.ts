// ── Replay fidelity warnings ──────────────────────────────────────────────
// What an events-only capture CANNOT show, detected before the user has spent
// a capture finding out.
//
// There are two real gaps.
//
// The first is canvas. rrweb records with `recordCanvas: false`
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
// The second is iframes. Collectors are injected into the TOP FRAME ONLY, and
// deliberately stay that way in 1.11.x: `allFrames: true` would put input
// capture inside payment and identity frames (Stripe, Auth0, 3-D Secure) and
// record card numbers and passwords. So an app whose real UI is in a frame
// produces a near-empty ticket, and the honest move is to say so up front —
// see docs/audit/capture-architecture.md §2.2.
//
// Deliberately NOT a blocker and not a dialog: it is one line, and a capture
// without video is still worth having on these pages — console, network and
// actions are unaffected.

import { isVideoOffered } from "./video-recorder";

/** How much of the viewport a canvas must cover before it is "the content". */
const HEAVY_CANVAS_VIEWPORT_SHARE = 0.25;
/** Below this, a canvas is a sparkline or an icon — not worth a warning. */
const MIN_CANVAS_PX = 40_000; // ~200×200

/** Same share, same reasoning, for iframes: below this an iframe is a widget
 *  at the edge of the page, not the thing being tested. */
const HEAVY_FRAME_VIEWPORT_SHARE = 0.25;
/** Below this an iframe is a badge, a tracking pixel or an ad slot. */
const MIN_FRAME_PX = 40_000; // ~200×200

export interface FidelityWarning {
  kind: "canvas" | "iframe";
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
        : "For a visual record here, take screenshots as you go — screen recording is paused in this version."),
  };
}

/**
 * Does this page put its content inside an iframe the capture cannot see into?
 *
 * Collectors are injected into the TOP FRAME ONLY — `allFrames` appears
 * nowhere in the extension, deliberately. Injecting everywhere would put
 * TraceBug's input capture inside payment and identity frames (Stripe, Auth0,
 * 3-D Secure) and start recording card numbers and passwords, and every
 * cross-origin frame would need site access for its own origin. That is only
 * safe once every frame's input goes through the redaction rules, which is
 * v2.0 work (docs/audit/capture-architecture.md §2.2, ADR 008).
 *
 * Until then the honest move is to say so BEFORE the capture, not to hand
 * someone a confident-looking empty ticket afterwards. Measured the same way
 * as canvas: rendered area against the viewport, because one full-bleed editor
 * frame matters and twelve small widgets do not.
 */
export function findHeavyFrame(doc: Document = document): HTMLElement | null {
  let viewport = 0;
  try {
    viewport = (doc.defaultView?.innerWidth || 0) * (doc.defaultView?.innerHeight || 0);
  } catch { /* detached document */ }
  if (!viewport) return null;

  let frames: HTMLElement[] = [];
  try {
    frames = Array.from(doc.querySelectorAll("iframe, frame"));
  } catch { return null; }

  // Area is SUMMED, not maxed: an app split into three side-by-side frames
  // hides just as much as one big one, and no single frame would trip a
  // per-element threshold.
  let total = 0;
  let largest: HTMLElement | null = null;
  let largestArea = 0;
  for (const f of frames) {
    // TraceBug's own UI (the CSP-proof player iframe) is not the page.
    if (f.closest("#tracebug-root")) continue;
    let rect: DOMRect;
    try { rect = f.getBoundingClientRect(); } catch { continue; }
    // Offscreen and display:none frames render nothing and hide nothing.
    if (rect.width <= 0 || rect.height <= 0) continue;
    const area = rect.width * rect.height;
    if (area < MIN_FRAME_PX) continue;
    total += area;
    if (area > largestArea) { largestArea = area; largest = f; }
  }
  if (!largest) return null;
  return total / viewport >= HEAVY_FRAME_VIEWPORT_SHARE ? largest : null;
}

/**
 * The frame warning, or null. Separate from the canvas one so a page with both
 * does not produce a paragraph — the caller shows whichever it asks for.
 */
export function framesCaptureWarning(doc: Document = document): FidelityWarning | null {
  if (!findHeavyFrame(doc)) return null;
  return {
    kind: "iframe",
    // Names what is missing and what still works. No "iframe" jargon alone:
    // "embedded frames" is what the words on the page look like to a tester.
    message:
      "A large part of this page is inside an embedded frame. Clicks, typing, console and " +
      "network INSIDE that frame aren't captured yet — the rest of the page is. " +
      "If your bug is in there, add screenshots as you go.",
  };
}
