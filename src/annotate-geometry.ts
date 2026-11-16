// ── Live annotation: pure geometry + keyboard rules ──────────────────────
// No DOM. Shared by src/ui/annotate-toolbar.ts and unit-tested in
// tests/annotate-geometry.test.ts.

/** "move" is internal only (no button): the pen is down and the page takes
 *  clicks — used by Esc and while the HUD's blur tool needs the page. */
export type AnnotTool = "pen" | "rect" | "ellipse" | "arrow" | "line" | "text" | "highlight" | "erase" | "move";

/** Toolbar order; the number key for a tool is its index + 1. */
export const TOOL_ORDER: readonly AnnotTool[] = ["pen", "rect", "ellipse", "arrow", "line", "text", "highlight", "erase"];

export interface Pt { x: number; y: number }

/** Drop points closer than `minDist` to the last kept one. Sub-pixel jitter
 *  adds bytes and wobble, not detail. Returns true when the point was kept. */
export function appendPoint(points: Pt[], p: Pt, minDist = 1.5): boolean {
  const last = points[points.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDist) return false;
  points.push(p);
  return true;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Smoothed SVG path: quadratic curves through segment midpoints. */
export function smoothPathData(points: Pt[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${r1(points[0].x)} ${r1(points[0].y)} l 0.01 0`;
  let d = `M ${r1(points[0].x)} ${r1(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${r1(points[i].x)} ${r1(points[i].y)} ${r1(mx)} ${r1(my)}`;
  }
  const last = points[points.length - 1];
  return d + ` L ${r1(last.x)} ${r1(last.y)}`;
}

/** Normalised box between two corners. */
export function boxFrom(a: Pt, b: Pt): { x: number; y: number; w: number; h: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Shift-constrain the end point: 45° steps for lines and arrows, a square
 *  (or circle) for boxes. */
export function constrainEnd(tool: AnnotTool, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (tool === "line" || tool === "arrow") {
    const len = Math.hypot(dx, dy);
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
  }
  if (tool === "rect" || tool === "ellipse") {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
  }
  return b;
}

/** Arrow as a shaft (stroked) and a filled triangular head. The shaft stops
 *  inside the head so the round line cap never pokes out of the tip. */
export function arrowGeometry(a: Pt, b: Pt, strokeWidth: number): { shaft: string; head: string } {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = len ? (b.x - a.x) / len : 1, uy = len ? (b.y - a.y) / len : 0;
  const headLen = Math.min(Math.max(12, strokeWidth * 4.5), len * 0.6);
  const halfW = headLen * 0.55;
  const bx = b.x - ux * headLen, by = b.y - uy * headLen;
  const sx = b.x - ux * headLen * 0.6, sy = b.y - uy * headLen * 0.6;
  const shaft = `M ${r1(a.x)} ${r1(a.y)} L ${r1(sx)} ${r1(sy)}`;
  const head = `M ${r1(b.x)} ${r1(b.y)} L ${r1(bx - uy * halfW)} ${r1(by + ux * halfW)} L ${r1(bx + uy * halfW)} ${r1(by - ux * halfW)} Z`;
  return { shaft, head };
}

/** True when the drag is too small to be a deliberate shape (a stray click). */
export function isTinyDrag(tool: AnnotTool, a: Pt, b: Pt, points?: Pt[]): boolean {
  if (tool === "pen" || tool === "highlight") {
    const pts = points || [];
    if (pts.length < 2) return true;
    let span = 0;
    for (const p of pts) span = Math.max(span, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
    return span < 3;
  }
  return Math.hypot(b.x - a.x, b.y - a.y) < 4;
}

// ── Keyboard ──────────────────────────────────────────────────────────────

interface EditableLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (n: string) => string | null;
}

const NON_TEXT_INPUTS = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"]);

/** Is this node somewhere the user types? Inputs, textareas, selects and
 *  contenteditable — shortcuts must never steal those keystrokes. */
export function isEditableNode(n: unknown): boolean {
  const el = n as EditableLike | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has(String(el.type || "text").toLowerCase());
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

export type AnnotShortcut =
  | { kind: "tool"; tool: AnnotTool }
  | { kind: "undo" } | { kind: "redo" } | { kind: "escape" };

/** Map a keydown to an annotation action. `path` is the event's composed
 *  path (shadow DOM included); a key typed into an editable field is never
 *  a shortcut. */
export function shortcutFor(
  e: { key: string; code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean; repeat?: boolean },
  path: readonly unknown[],
): AnnotShortcut | null {
  if (e.isComposing) return null;
  if (path.some(isEditableNode)) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "z") return e.shiftKey ? { kind: "redo" } : { kind: "undo" };
    if (k === "y" && !e.shiftKey) return { kind: "redo" };
    return null;
  }
  if (e.key === "Escape") return { kind: "escape" };
  if (mod || e.altKey || e.repeat) return null;
  // e.code is layout-independent (AZERTY puts digits on Shift); fall back to e.key.
  const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code || "") || (!e.shiftKey ? /^([1-8])$/.exec(e.key) : null);
  if (!m) return null;
  return { kind: "tool", tool: TOOL_ORDER[Number(m[1]) - 1] };
}
