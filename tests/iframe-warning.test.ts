// An app whose real UI is in an iframe produces a near-empty ticket: the
// collectors are injected into the top frame only, so clicks, typing, console
// and network inside the frame are invisible (docs/audit/
// capture-architecture.md §2.2). That stays true in 1.11.x on purpose —
// `allFrames: true` would put input capture inside Stripe and Auth0 frames and
// record card numbers.
//
// So the fix for now is to SAY SO, before the capture is spent, on the same
// pattern as the canvas warning.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findHeavyFrame, framesCaptureWarning } from "../src/replay-fidelity";

/** An iframe rendered at a given size. jsdom has no layout, so
 *  getBoundingClientRect is stubbed — the same trick the canvas tests use. */
function frame(w: number, h: number, attrs: Record<string, string> = {}): HTMLIFrameElement {
  const f = document.createElement("iframe");
  for (const [k, v] of Object.entries(attrs)) f.setAttribute(k, v);
  f.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(f);
  return f;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.innerWidth = 1280;
  window.innerHeight = 800;   // viewport = 1,024,000
});
afterEach(() => { document.body.innerHTML = ""; });

describe("a frame-heavy page is warned about before the capture is wasted", () => {
  it("says nothing on a page with no frames", () => {
    expect(findHeavyFrame(document)).toBeNull();
    expect(framesCaptureWarning(document)).toBeNull();
  });

  it("ignores badges, ad slots and tracking pixels", () => {
    frame(120, 60);
    frame(1, 1);
    expect(findHeavyFrame(document)).toBeNull();
  });

  it("warns when one frame covers a quarter of the viewport", () => {
    frame(900, 600); // 540,000 = 53% of the viewport
    expect(findHeavyFrame(document)).not.toBeNull();
    const w = framesCaptureWarning(document);
    expect(w?.kind).toBe("iframe");
    expect(w?.message).toMatch(/embedded frame/i);
  });

  it("sums frames — three panels hide as much as one big one", () => {
    // None of these would trip a per-element threshold on its own.
    frame(400, 260); // 104,000 = 10%
    frame(400, 260);
    frame(400, 260); // 312,000 total = 30%
    expect(findHeavyFrame(document)).not.toBeNull();
  });

  it("ignores a frame that renders nothing — display:none or offscreen", () => {
    frame(0, 0);
    frame(900, 0);
    expect(findHeavyFrame(document)).toBeNull();
  });

  it("never counts TraceBug's own player iframe as the page's content", () => {
    const root = document.createElement("div");
    root.id = "tracebug-root";
    document.body.appendChild(root);
    const ours = document.createElement("iframe");
    ours.getBoundingClientRect = () => ({ width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    root.appendChild(ours);
    expect(findHeavyFrame(document)).toBeNull();
  });

  it("tells the user what IS still captured, not just what isn't", () => {
    frame(900, 600);
    const msg = framesCaptureWarning(document)?.message || "";
    expect(msg).toMatch(/rest of the page is/i);
    expect(msg).toMatch(/screenshots/i);
    // No jargon: a tester does not know what an iframe or a content script is.
    expect(msg).not.toMatch(/allFrames|content script|iframe>/);
  });

  it("covers <frame> in an old frameset too", () => {
    const f = document.createElement("frame");
    f.getBoundingClientRect = () => ({ width: 1000, height: 700, top: 0, left: 0, right: 1000, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(f);
    expect(findHeavyFrame(document)).not.toBeNull();
  });
});
