// ── Annotate toolbar (draw on the page while recording) ──────────────────
//
//   pen · rect · ellipse · arrow · line · text · highlight · eraser | ● ● ● ● ● ● | undo · redo · clear | fade · ✕
//
// A dark pill that hangs under the recording HUD as its second tier, in the
// HUD's own colours; the active tool is a filled coral circle. Keys 1–8 pick
// the tools in that order (named in each tooltip, not printed on the buttons).
//
// Opened from the recording HUD's pen button. Everything drawn is plain SVG:
//
// - The committed layer (#tracebug-annot-layer) is a 1×1 <svg> pinned to the
//   document origin with overflow:visible. Shapes are stored in document
//   coordinates, so they scroll with the page for free, stay sharp at any
//   devicePixelRatio, never resize, and never grow the page's scroll area
//   (painted overflow is ink overflow, not layout). Being DOM, they appear in
//   the screen recording, in captureVisibleTab screenshots and in the rrweb
//   DOM replay.
// - The in-progress shape lives in a twin layer (#tracebug-annot-live) that
//   rrweb blocks (rrweb-recorder.ts blockSelector), so a drag does not record
//   hundreds of attribute mutations; on pointer-up the element is MOVED to the
//   committed layer — one DOM add in the replay.
// - A transparent fixed surface inside #tracebug-root takes the pointer while
//   a drawing tool is on. Esc puts the pen down (no tool lit) so the page is
//   clickable again; drawings stay.
// - The eraser (8) removes the one drawing under the pointer (click it, or
//   drag across several); Clear removes them all. Both can be undone.
//
// Why this replaced the canvas in draw-mode.ts for recording: that canvas was
// document-sized (up to 32767px, no DPR scaling → blurry), it was cleared and
// fully repainted on every preview move and every fade frame, freehand
// segments were painted one by one at 0.85 alpha (dark dots where they
// overlap), and committed shapes were filled at 85% opacity — the "blob over
// the text" users saw.

import {
  AnnotTool,
  Pt,
  TOOL_ORDER,
  appendPoint,
  arrowGeometry,
  boxFrom,
  constrainEnd,
  isTinyDrag,
  shortcutFor,
  smoothPathData,
} from "../annotate-geometry";
import { setInnerHTML, createStyleTag, setInlineStyle } from "./helpers";
import { mark } from "../dev-api";

export const ANNOT_TOOLBAR_ID = "tracebug-annot-toolbar";
export const ANNOT_SURFACE_ID = "tracebug-annot-surface";
export const ANNOT_LAYER_ID = "tracebug-annot-layer";
export const ANNOT_LIVE_ID = "tracebug-annot-live";
const STYLE_ID = "tracebug-annot-styles";
const SVG_NS = "http://www.w3.org/2000/svg";
const FADE_MS = 3000;
const STROKE = 3;
const HIGHLIGHT_STROKE = 18;
const TEXT_SIZE = 20;

export const ANNOT_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#a855f7", label: "Purple" },
  { value: "#ffffff", label: "White" },
];

const svgIcon = (body: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const TOOL_META: Record<AnnotTool, { label: string; icon: string }> = {
  pen: { label: "Pen", icon: svgIcon(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`) },
  rect: { label: "Rectangle", icon: svgIcon(`<rect x="4" y="5" width="16" height="14" rx="1.5"/>`) },
  ellipse: { label: "Ellipse", icon: svgIcon(`<ellipse cx="12" cy="12" rx="9" ry="7"/>`) },
  arrow: { label: "Arrow", icon: svgIcon(`<path d="M5 19 19 5"/><path d="M9 5h10v10"/>`) },
  line: { label: "Line", icon: svgIcon(`<path d="M6 18 18 6"/><circle cx="5" cy="19" r="1.6"/><circle cx="19" cy="5" r="1.6"/>`) },
  text: { label: "Text", icon: svgIcon(`<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>`) },
  highlight: { label: "Highlighter", icon: svgIcon(`<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>`) },
  erase: { label: "Eraser — click a drawing to remove it", icon: svgIcon(`<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>`) },
  move: { label: "Pen down", icon: "" },
};

const ICON_UNDO = svgIcon(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`);
const ICON_REDO = svgIcon(`<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`);
const ICON_CLEAR = svgIcon(`<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>`);
const ICON_FADE = svgIcon(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`);
const ICON_CLOSE = svgIcon(`<path d="M6 6l12 12M18 6 6 18"/>`);

type Op =
  | { kind: "add"; el: SVGElement }
  | { kind: "clear"; els: SVGElement[] }
  | { kind: "erase"; items: Array<{ el: SVGElement; next: Node | null }> };

interface Erase {
  pointerId: number;
  /** Fat-stroked, invisible copies in the rrweb-blocked live layer, used only
   *  for hit-testing — a 3 px line is otherwise too thin to hit by hand. */
  hits: Array<{ clone: SVGElement; orig: SVGElement }>;
  removed: Array<{ el: SVGElement; next: Node | null }>;
}

interface Drag {
  tool: AnnotTool;
  pointerId: number;
  start: Pt;
  end: Pt;
  points: Pt[];
  shift: boolean;
  el: SVGElement;
  lastClient: Pt;
}

interface State {
  root: HTMLElement;
  toolbar: HTMLElement;
  surface: HTMLElement;
  layer: SVGSVGElement;
  live: SVGSVGElement;
  tool: AnnotTool;
  history: Op[];
  redo: Op[];
  drag: Drag | null;
  erase: Erase | null;
  raf: number;
  off: Pt;
  text: { input: HTMLInputElement; at: Pt } | null;
  timers: Set<ReturnType<typeof setTimeout>>;
  onClose: (() => void) | null;
  onToolChange: ((tool: AnnotTool) => void) | null;
  dispose: Array<() => void>;
}

let _s: State | null = null;
// Remembered for the page's lifetime, so reopening keeps your tool and colour.
let _tool: AnnotTool = "pen";
let _color = ANNOT_COLORS[0].value;
let _fade = false;

export function isAnnotateToolbarOpen(): boolean {
  return _s !== null;
}

export function getAnnotateTool(): AnnotTool | null {
  return _s ? _s.tool : null;
}

/** Open the toolbar. `below` is an element (the recording HUD) the toolbar
 *  should sit under instead of covering it. */
export function openAnnotateToolbar(
  root: HTMLElement,
  opts: { below?: HTMLElement | null; onClose?: () => void; onToolChange?: (tool: AnnotTool) => void } = {},
): void {
  if (_s) return;
  _injectStyles();

  const layer = _makeLayer(ANNOT_LAYER_ID, "annot-layer");
  const live = _makeLayer(ANNOT_LIVE_ID, "annot-live");

  const surface = document.createElement("div");
  surface.id = ANNOT_SURFACE_ID;
  surface.dataset.tracebug = "annot-surface";
  root.appendChild(surface);

  const toolbar = _buildToolbar();
  const anchor = opts.below?.getBoundingClientRect();
  const top = anchor && anchor.height > 0 ? Math.round(anchor.bottom + 10) : 14;
  toolbar.style.setProperty("top", `${top}px`, "important");
  root.appendChild(toolbar);

  _s = {
    root, toolbar, surface, layer, live,
    tool: _tool, history: [], redo: [], drag: null, erase: null, raf: 0, off: { x: 0, y: 0 }, text: null,
    timers: new Set(), onClose: opts.onClose || null, onToolChange: opts.onToolChange || null, dispose: [],
  };
  _wire(_s);
  setAnnotateTool(_tool);
}

/** Close the toolbar and remove every drawing from the page. */
export function closeAnnotateToolbar(): void {
  const s = _s;
  if (!s) return;
  _s = null;
  if (s.raf) cancelAnimationFrame(s.raf);
  s.timers.forEach((t) => clearTimeout(t));
  for (const d of s.dispose) { try { d(); } catch {} }
  s.text?.input.remove();
  s.toolbar.remove();
  s.surface.remove();
  s.layer.remove();
  s.live.remove();
  const cb = s.onClose;
  if (cb) { try { cb(); } catch {} }
}

/** Switch tool. "move" (no button) puts the pen down so the page is clickable. */
export function setAnnotateTool(tool: AnnotTool): void {
  const s = _s;
  if (!s) return;
  _commitText(s);
  if (s.drag) _finishDrag(s, false);
  if (s.erase) _finishErase(s);
  s.tool = tool;
  _tool = tool;
  s.surface.dataset.mode = tool;
  s.toolbar.dataset.drawing = tool === "move" ? "0" : "1";
  s.toolbar.querySelectorAll<HTMLButtonElement>("[data-tb-annot-tool]").forEach((b) => {
    b.setAttribute("aria-pressed", b.dataset.tbAnnotTool === tool ? "true" : "false");
  });
  if (s.onToolChange) { try { s.onToolChange(tool); } catch {} }
}

// ── Build ────────────────────────────────────────────────────────────────

function _makeLayer(id: string, tag: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.id = id;
  svg.setAttribute("data-tracebug", tag);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "1");
  svg.setAttribute("height", "1");
  setInlineStyle(svg, `
    position: absolute !important; top: 0 !important; left: 0 !important;
    width: 1px !important; height: 1px !important; max-width: none !important;
    overflow: visible !important; pointer-events: none !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important;
    display: block !important; z-index: 2147483645 !important;
  `);
  document.body.appendChild(svg);
  return svg;
}

function _btn(attrs: Record<string, string>, html: string, tip: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tb-an-btn";
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.setAttribute("data-tip", tip);
  b.setAttribute("aria-label", tip);
  setInnerHTML(b, html);
  return b;
}

function _sep(): HTMLElement {
  const d = document.createElement("span");
  d.className = "tb-an-sep";
  return d;
}

function _buildToolbar(): HTMLElement {
  const bar = document.createElement("div");
  bar.id = ANNOT_TOOLBAR_ID;
  bar.dataset.tracebug = "annot-toolbar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Draw on the page");

  TOOL_ORDER.forEach((tool, i) => {
    const meta = TOOL_META[tool];
    bar.appendChild(_btn(
      { "data-tb-annot-tool": tool, "aria-pressed": "false" },
      meta.icon,
      `${meta.label} · ${i + 1}`,
    ));
  });

  bar.appendChild(_sep());
  const swatches = document.createElement("div");
  swatches.className = "tb-an-swatches";
  swatches.setAttribute("role", "group");
  swatches.setAttribute("aria-label", "Colour");
  for (const c of ANNOT_COLORS) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "tb-an-swatch";
    sw.dataset.tbAnnotColor = c.value;
    sw.setAttribute("data-tip", c.label);
    sw.setAttribute("aria-label", c.label);
    sw.setAttribute("aria-pressed", c.value === _color ? "true" : "false");
    sw.style.setProperty("--tb-an-sw", c.value);
    swatches.appendChild(sw);
  }
  bar.appendChild(swatches);

  bar.appendChild(_sep());
  bar.appendChild(_btn({ "data-tb-annot": "undo" }, ICON_UNDO, "Undo · Ctrl+Z"));
  bar.appendChild(_btn({ "data-tb-annot": "redo" }, ICON_REDO, "Redo · Ctrl+Shift+Z"));
  bar.appendChild(_btn({ "data-tb-annot": "clear" }, ICON_CLEAR, "Clear all drawings"));
  bar.appendChild(_sep());
  bar.appendChild(_btn({ "data-tb-annot": "fade", "aria-pressed": _fade ? "true" : "false" }, ICON_FADE,
    "Fade drawings after 3 seconds"));
  bar.appendChild(_btn({ "data-tb-annot": "close" }, ICON_CLOSE, "Stop drawing and clear (drawings are already in the recording)"));
  return bar;
}

// ── Wiring ───────────────────────────────────────────────────────────────

function _wire(s: State): void {
  const { toolbar, surface } = s;

  toolbar.addEventListener("pointerdown", (e) => e.stopPropagation());
  toolbar.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest("button") as HTMLButtonElement | null;
    if (!btn || !toolbar.contains(btn)) return;
    e.stopPropagation();
    if (btn.dataset.tbAnnotColor) {
      _color = btn.dataset.tbAnnotColor;
      toolbar.querySelectorAll<HTMLElement>(".tb-an-swatch").forEach((sw) =>
        sw.setAttribute("aria-pressed", sw.dataset.tbAnnotColor === _color ? "true" : "false"));
      // Picking a colour means you want to draw with it.
      if (s.tool === "move" || s.tool === "erase") setAnnotateTool("pen");
      return;
    }
    const tool = btn.dataset.tbAnnotTool as AnnotTool | undefined;
    if (tool) { setAnnotateTool(tool); return; }
    switch (btn.dataset.tbAnnot) {
      case "undo": _undo(s); break;
      case "redo": _redo(s); break;
      case "clear": _clear(s); break;
      case "fade":
        _fade = !_fade;
        btn.setAttribute("aria-pressed", _fade ? "true" : "false");
        break;
      case "close": closeAnnotateToolbar(); break;
    }
  });

  const refreshOff = () => {
    const r = s.live.getBoundingClientRect();
    s.off = { x: r.left, y: r.top };
  };
  const toDoc = (cx: number, cy: number): Pt => ({ x: cx - s.off.x, y: cy - s.off.y });

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || s.tool === "move") return;
    e.preventDefault();
    _commitText(s);
    refreshOff();
    const p = toDoc(e.clientX, e.clientY);
    if (s.tool === "text") { _openText(s, e.clientX, e.clientY, p); return; }
    try { surface.setPointerCapture(e.pointerId); } catch {}
    if (s.tool === "erase") {
      s.erase = { pointerId: e.pointerId, hits: _buildHits(s), removed: [] };
      _eraseAt(s, p);
      return;
    }
    const el = _createShape(s.tool, _color);
    s.live.appendChild(el);
    s.drag = { tool: s.tool, pointerId: e.pointerId, start: p, end: p, points: [p], shift: e.shiftKey, el, lastClient: { x: e.clientX, y: e.clientY } };
    _schedule(s);
  };
  const onMove = (e: PointerEvent) => {
    if (s.erase && e.pointerId === s.erase.pointerId) {
      const batch = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      for (const pe of batch.length ? batch : [e]) _eraseAt(s, toDoc(pe.clientX, pe.clientY));
      return;
    }
    const d = s.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    // Firefox and Chrome both coalesce pointer moves to one per frame; the
    // coalesced list keeps every sample, so fast strokes stay round.
    const batch = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const pe of batch.length ? batch : [e]) {
      const p = toDoc(pe.clientX, pe.clientY);
      if (d.tool === "pen" || d.tool === "highlight") appendPoint(d.points, p);
      d.end = p;
    }
    d.shift = e.shiftKey;
    d.lastClient = { x: e.clientX, y: e.clientY };
    _schedule(s);
  };
  const onUp = (e: PointerEvent) => {
    if (s.erase && e.pointerId === s.erase.pointerId) {
      try { surface.releasePointerCapture(e.pointerId); } catch {}
      _finishErase(s);
      return;
    }
    if (!s.drag || e.pointerId !== s.drag.pointerId) return;
    try { surface.releasePointerCapture(e.pointerId); } catch {}
    _finishDrag(s, e.type === "pointerup");
  };
  // Wheel-scrolling mid-stroke: the pointer is still over the same screen
  // spot, which is now a different document spot — extend the stroke there.
  const onScroll = () => {
    if (s.text) { _commitText(s); return; }
    const d = s.drag;
    if (!d) return;
    refreshOff();
    const p = toDoc(d.lastClient.x, d.lastClient.y);
    if (d.tool === "pen" || d.tool === "highlight") appendPoint(d.points, p);
    d.end = p;
    _schedule(s);
  };
  const onKey = (e: KeyboardEvent) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    const sc = shortcutFor(e, path);
    if (!sc) return;
    e.preventDefault();
    e.stopPropagation();
    if (sc.kind === "tool") setAnnotateTool(sc.tool);
    else if (sc.kind === "undo") _undo(s);
    else if (sc.kind === "redo") _redo(s);
    else if (s.drag) _finishDrag(s, false);
    else if (s.erase) _finishErase(s);
    else setAnnotateTool("move");
  };

  surface.addEventListener("pointerdown", onDown);
  surface.addEventListener("pointermove", onMove);
  surface.addEventListener("pointerup", onUp);
  surface.addEventListener("pointercancel", onUp);
  window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  document.addEventListener("keydown", onKey, { capture: true });
  s.dispose.push(
    () => window.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions),
    () => document.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions),
  );
  _syncButtons(s);
}

// ── Drawing ──────────────────────────────────────────────────────────────

function _createShape(tool: AnnotTool, color: string): SVGElement {
  const stroke = (el: SVGElement, width = STROKE) => {
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", String(width));
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    return el;
  };
  let el: SVGElement;
  switch (tool) {
    case "rect": el = stroke(document.createElementNS(SVG_NS, "rect") as SVGElement); el.setAttribute("rx", "2"); break;
    case "ellipse": el = stroke(document.createElementNS(SVG_NS, "ellipse") as SVGElement); break;
    case "arrow": {
      el = document.createElementNS(SVG_NS, "g") as SVGElement;
      el.appendChild(stroke(document.createElementNS(SVG_NS, "path") as SVGElement));
      const head = document.createElementNS(SVG_NS, "path") as SVGElement;
      head.setAttribute("fill", color);
      head.setAttribute("stroke", color);
      head.setAttribute("stroke-width", "1.5");
      head.setAttribute("stroke-linejoin", "round");
      el.appendChild(head);
      break;
    }
    case "highlight":
      el = stroke(document.createElementNS(SVG_NS, "path") as SVGElement, HIGHLIGHT_STROKE);
      // One path, one stroke: overlapping passes of the same stroke don't
      // darken, so the marker reads evenly over the text.
      el.setAttribute("stroke-opacity", "0.38");
      break;
    default: el = stroke(document.createElementNS(SVG_NS, "path") as SVGElement); break;
  }
  el.setAttribute("data-tb-annot-shape", tool);
  return el;
}

function _render(d: Drag): void {
  const end = d.shift ? constrainEnd(d.tool, d.start, d.end) : d.end;
  const el = d.el;
  switch (d.tool) {
    case "pen":
    case "highlight":
      el.setAttribute("d", smoothPathData(d.points));
      break;
    case "rect": {
      const b = boxFrom(d.start, end);
      el.setAttribute("x", String(b.x)); el.setAttribute("y", String(b.y));
      el.setAttribute("width", String(b.w)); el.setAttribute("height", String(b.h));
      break;
    }
    case "ellipse": {
      const b = boxFrom(d.start, end);
      el.setAttribute("cx", String(b.x + b.w / 2)); el.setAttribute("cy", String(b.y + b.h / 2));
      el.setAttribute("rx", String(b.w / 2)); el.setAttribute("ry", String(b.h / 2));
      break;
    }
    case "line":
      el.setAttribute("d", `M ${d.start.x} ${d.start.y} L ${end.x} ${end.y}`);
      break;
    case "arrow": {
      const g = arrowGeometry(d.start, end, STROKE);
      (el.childNodes[0] as SVGElement).setAttribute("d", g.shaft);
      (el.childNodes[1] as SVGElement).setAttribute("d", g.head);
      break;
    }
  }
}

function _schedule(s: State): void {
  if (s.raf) return;
  s.raf = requestAnimationFrame(() => {
    s.raf = 0;
    if (s.drag) _render(s.drag);
  });
}

function _finishDrag(s: State, commit: boolean): void {
  const d = s.drag;
  if (!d) return;
  s.drag = null;
  if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; }
  _render(d);
  if (!commit || isTinyDrag(d.tool, d.start, d.end, d.points)) { d.el.remove(); return; }
  _commit(s, d.el, d.tool);
}

function _commit(s: State, el: SVGElement, tool: AnnotTool): void {
  s.layer.appendChild(el);
  s.history.push({ kind: "add", el });
  s.redo = [];
  _syncButtons(s);
  try { mark(`Drew ${TOOL_META[tool].label.toLowerCase()}`, { tool, color: _color }); } catch {}
  if (_fade) {
    el.style.transition = "opacity 0.6s linear";
    const t1 = setTimeout(() => { s.timers.delete(t1); el.style.opacity = "0"; }, FADE_MS - 600);
    const t2 = setTimeout(() => {
      s.timers.delete(t2);
      el.remove();
      s.history = s.history.filter((op) => !(op.kind === "add" && op.el === el));
      s.redo = s.redo.filter((op) => !(op.kind === "add" && op.el === el));
      _syncButtons(s);
    }, FADE_MS);
    s.timers.add(t1); s.timers.add(t2);
  }
}

// ── Text ─────────────────────────────────────────────────────────────────

function _openText(s: State, cx: number, cy: number, at: Pt): void {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "tb-an-text";
  input.dataset.tracebug = "annot-text-input";
  input.placeholder = "Type, then Enter";
  input.setAttribute("aria-label", "Text label");
  input.maxLength = 200;
  input.style.setProperty("left", `${Math.round(cx)}px`, "important");
  input.style.setProperty("top", `${Math.round(cy - TEXT_SIZE * 0.8)}px`, "important");
  input.style.setProperty("color", _color, "important");
  s.root.appendChild(input);
  s.text = { input, at: { x: at.x, y: at.y - TEXT_SIZE * 0.8 } };
  input.addEventListener("keydown", (e) => {
    // Keep the page's own shortcuts out of it while typing a label.
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); _commitText(s); }
    else if (e.key === "Escape") { e.preventDefault(); _commitText(s, true); }
  });
  input.addEventListener("blur", () => _commitText(s));
  // Focus now, not next frame: a key typed straight after the click would
  // otherwise go to the page (seen as a lost first letter under load).
  const focus = () => { try { input.focus({ preventScroll: true }); } catch { input.focus(); } };
  focus();
  requestAnimationFrame(() => { if (s.text?.input === input && document.activeElement !== input) focus(); });
}

function _commitText(s: State, cancel = false): void {
  const t = s.text;
  if (!t) return;
  s.text = null;
  const value = t.input.value.trim();
  t.input.remove();
  if (cancel || !value) return;
  const el = document.createElementNS(SVG_NS, "text") as SVGElement;
  el.setAttribute("x", String(Math.round(t.at.x + 5)));
  // Input top + padding + ascent ≈ baseline; keeps the text where it was typed.
  el.setAttribute("y", String(Math.round(t.at.y + 4 + TEXT_SIZE)));
  el.setAttribute("fill", _color);
  el.setAttribute("font-size", String(TEXT_SIZE));
  el.setAttribute("font-weight", "600");
  el.setAttribute("font-family", "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
  // A thin halo keeps the label legible on any background.
  el.setAttribute("stroke", _color.toLowerCase() === "#ffffff" ? "#111827" : "#ffffff");
  el.setAttribute("stroke-width", "3");
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("paint-order", "stroke");
  el.setAttribute("data-tb-annot-shape", "text");
  el.textContent = value;
  _commit(s, el, "text");
}

// ── History ──────────────────────────────────────────────────────────────

function _undo(s: State): void {
  _commitText(s);
  const op = s.history.pop();
  if (!op) return;
  if (op.kind === "add") op.el.remove();
  else if (op.kind === "clear") op.els.forEach((el) => s.layer.appendChild(el));
  else _restore(s, op.items);
  s.redo.push(op);
  _syncButtons(s);
}

function _redo(s: State): void {
  const op = s.redo.pop();
  if (!op) return;
  if (op.kind === "add") s.layer.appendChild(op.el);
  else if (op.kind === "clear") op.els.forEach((el) => el.remove());
  else op.items.forEach((it) => it.el.remove());
  s.history.push(op);
  _syncButtons(s);
}

// ── Eraser ───────────────────────────────────────────────────────────────

const ERASE_HIT_WIDTH = 16;

function _buildHits(s: State): Erase["hits"] {
  const hits: Erase["hits"] = [];
  for (const orig of Array.from(s.layer.children) as SVGElement[]) {
    const clone = orig.cloneNode(true) as SVGElement;
    for (const el of [clone, ...(Array.from(clone.querySelectorAll("*")) as SVGElement[])]) {
      if (el.tagName.toLowerCase() === "g") continue;
      const w = Number(el.getAttribute("stroke-width")) || 0;
      el.setAttribute("stroke-width", String(Math.max(w, ERASE_HIT_WIDTH)));
      el.setAttribute("stroke-opacity", "0");
      el.setAttribute("fill-opacity", "0");
    }
    s.live.appendChild(clone);
    hits.push({ clone, orig });
  }
  return hits;
}

function _hitTest(clone: SVGElement, p: Pt): boolean {
  const parts = clone.tagName.toLowerCase() === "g" ? (Array.from(clone.children) as SVGElement[]) : [clone];
  for (const el of parts) {
    if (el.tagName.toLowerCase() === "text") {
      try {
        const b = (el as SVGGraphicsElement).getBBox();
        if (p.x >= b.x - 4 && p.x <= b.x + b.width + 4 && p.y >= b.y - 4 && p.y <= b.y + b.height + 4) return true;
      } catch {}
      continue;
    }
    const g = el as unknown as SVGGeometryElement;
    if (typeof g.isPointInStroke !== "function") continue;
    try {
      const pt = { x: p.x, y: p.y } as DOMPointInit;
      if (g.isPointInStroke(pt)) return true;
      const fill = el.getAttribute("fill");
      if (fill && fill !== "none" && g.isPointInFill(pt)) return true;
    } catch {}
  }
  return false;
}

function _eraseAt(s: State, p: Pt): void {
  const er = s.erase;
  if (!er) return;
  // Topmost first: the drawing you see on top is the one you mean.
  for (let i = er.hits.length - 1; i >= 0; i--) {
    const h = er.hits[i];
    if (!h.orig.isConnected || !_hitTest(h.clone, p)) continue;
    er.removed.push({ el: h.orig, next: h.orig.nextSibling });
    h.orig.remove();
    h.clone.remove();
    er.hits.splice(i, 1);
  }
}

function _finishErase(s: State): void {
  const er = s.erase;
  if (!er) return;
  s.erase = null;
  er.hits.forEach((h) => h.clone.remove());
  if (!er.removed.length) return;
  s.history.push({ kind: "erase", items: er.removed });
  s.redo = [];
  _syncButtons(s);
  try { mark(`Erased ${er.removed.length} drawing${er.removed.length === 1 ? "" : "s"}`, { tool: "erase" }); } catch {}
}

function _restore(s: State, items: Array<{ el: SVGElement; next: Node | null }>): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const { el, next } = items[i];
    s.layer.insertBefore(el, next && next.parentNode === s.layer ? next : null);
  }
}

function _clear(s: State): void {
  _commitText(s);
  const els = Array.from(s.layer.children) as SVGElement[];
  if (!els.length) return;
  els.forEach((el) => el.remove());
  s.history.push({ kind: "clear", els });
  s.redo = [];
  _syncButtons(s);
}

function _syncButtons(s: State): void {
  const set = (name: string, enabled: boolean) => {
    const b = s.toolbar.querySelector<HTMLButtonElement>(`[data-tb-annot="${name}"]`);
    if (b) b.disabled = !enabled;
  };
  set("undo", s.history.length > 0);
  set("redo", s.redo.length > 0);
  set("clear", s.layer.childElementCount > 0);
}

// ── Styles ───────────────────────────────────────────────────────────────

function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const T = `#${ANNOT_TOOLBAR_ID}`;
  const S = `#${ANNOT_SURFACE_ID}`;
  const style = createStyleTag(STYLE_ID);
  style.textContent = `
    @keyframes tb-an-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
    ${S} {
      position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
      z-index: 2147483646 !important; background: transparent !important;
      cursor: crosshair !important; touch-action: none !important; pointer-events: auto !important;
    }
    ${S}[data-mode="text"] { cursor: text !important; }
    ${S}[data-mode="erase"] { cursor: cell !important; }
    ${S}[data-mode="move"] { pointer-events: none !important; cursor: auto !important; }
    ${T} {
      position: fixed !important; left: 50% !important; transform: translateX(-50%) !important;
      z-index: 2147483647 !important; display: flex !important; align-items: center !important;
      flex-wrap: nowrap !important; gap: 2px !important; padding: 5px 8px !important; margin: 0 !important;
      width: max-content !important; max-width: calc(100vw - 16px) !important; box-sizing: border-box !important;
      background: #1b1d24 !important; color: #e9eaee !important;
      border: 1px solid rgba(255, 255, 255, 0.06) !important; border-radius: 999px !important;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45) !important;
      font-family: var(--tb-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif) !important;
      font-size: 12px !important; line-height: 1 !important; user-select: none !important;
      animation: tb-an-in 0.16s ease !important;
    }
    ${T} .tb-an-btn {
      position: relative !important; width: 32px !important; height: 32px !important; flex-shrink: 0 !important;
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      margin: 0 !important; padding: 0 !important; border: none !important; border-radius: 999px !important;
      background: transparent !important; color: rgba(255, 255, 255, 0.78) !important;
      cursor: pointer !important; font: inherit !important; box-shadow: none !important;
      transition: background 0.12s ease, color 0.12s ease !important;
    }
    ${T} .tb-an-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08) !important; color: #ffffff !important; }
    ${T} .tb-an-btn[aria-pressed="true"], ${T} .tb-an-btn[aria-pressed="true"]:hover {
      background: #FF5C6C !important; color: #14161c !important;
    }
    ${T} .tb-an-btn[data-tb-annot="fade"][aria-pressed="true"] { background: rgba(255, 92, 108, 0.22) !important; color: #FF8590 !important; }
    ${T} .tb-an-btn:disabled { opacity: 0.3 !important; cursor: default !important; }
    ${T} .tb-an-sep { width: 1px !important; height: 18px !important; margin: 0 5px !important; flex-shrink: 0 !important; background: rgba(255, 255, 255, 0.1) !important; }
    ${T} .tb-an-swatches { display: inline-flex !important; align-items: center !important; gap: 6px !important; padding: 0 4px !important; }
    ${T} .tb-an-swatch {
      position: relative !important; width: 16px !important; height: 16px !important; border-radius: 50% !important;
      padding: 0 !important; margin: 0 !important; border: none !important; cursor: pointer !important;
      background: var(--tb-an-sw) !important; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18) !important;
      transition: transform 0.1s ease !important;
    }
    ${T} .tb-an-swatch:hover { transform: scale(1.15) !important; }
    ${T} .tb-an-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px #1b1d24, 0 0 0 3.5px var(--tb-an-sw) !important; transform: scale(1.1) !important; }
    ${T} [data-tip]:hover::after, ${T} [data-tip]:focus-visible::after {
      content: attr(data-tip); position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%);
      white-space: nowrap; padding: 5px 8px; border-radius: 6px; pointer-events: none; z-index: 2;
      background: #ffffff; color: #14161c; font-size: 11px; font-weight: 500; line-height: 1.2;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    }
    #tracebug-root .tb-an-text {
      position: fixed !important; z-index: 2147483647 !important; min-width: 180px !important;
      margin: 0 !important; padding: 2px 4px !important; box-sizing: content-box !important;
      font: 600 ${TEXT_SIZE}px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important;
      background: rgba(255, 255, 255, 0.75) !important; border: 1.5px dashed currentColor !important;
      border-radius: 4px !important; outline: none !important; box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}
