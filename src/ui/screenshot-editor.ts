// ── Screenshot editor ─────────────────────────────────────────────────────
// Opened from the ticket (thumbnail or the Annotate button on the preview).
//
//   ┌──────────────── header: title · filename · ✕ ────────────────┐
//   │  select · pen · box · ellipse · arrow · line · text · marker  │  ← tools (letter keys)
//   │  step · pixelate · eraser │ ●●●●●● │ S M L │ undo redo clear  │
//   │                     [ the screenshot ]                        │
//   └───── Cancel ··················· Copy · Download · Save ───────┘
//
// Shapes are a small vector model in IMAGE pixels, drawn as SVG over the
// <img> while editing (crisp at any zoom, hit-testable, movable) and painted
// onto a canvas at the screenshot's full resolution on Save / Download / Copy
// — the old editor merged at the on-screen size, so every save shrank the
// image. Pixelate is the one tool that changes pixels: it shows (and saves)
// a mosaic of the region, for hiding emails, names and tokens.
//
// CSP: no inline handlers or inline <style> attributes are needed — one
// nonce-aware <style> tag (createStyleTag) and DOM listeners only. The
// pixelate preview is a <canvas>, so no data:/blob: image URLs are involved.

import { Pt, appendPoint, arrowGeometry, boxFrom, constrainEnd, isEditableNode, smoothPathData } from "../annotate-geometry";
import type { AnnotTool } from "../annotate-geometry";
import { setInnerHTML, createStyleTag } from "./helpers";

export type EditorTool = "select" | "pen" | "rect" | "ellipse" | "arrow" | "line" | "text" | "highlight" | "step" | "blur" | "erase";
type ShapeKind = Exclude<EditorTool, "select" | "erase">;

export interface EditorShape {
  id: string;
  kind: ShapeKind;
  color: string;
  /** Stroke width / font size / badge radius, in image pixels. */
  size: number;
  a: Pt;
  b: Pt;
  points?: Pt[];
  text?: string;
  n?: number;
}

export interface EditorResult { dataUrl: string; width: number; height: number }

export interface ScreenshotEditorOptions {
  root: HTMLElement;
  dataUrl: string;
  filename: string;
  onSave: (r: EditorResult) => void;
  toast?: (msg: string) => void;
}

const OVERLAY_ID = "tracebug-shot-editor";
const STYLE_ID = "tracebug-shot-editor-styles";
const SVG_NS = "http://www.w3.org/2000/svg";

export const EDITOR_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#111827", "#ffffff"];
const SIZES = { S: 2, M: 4, L: 7 } as const;
type SizeKey = keyof typeof SIZES;

const ico = (b: string) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;

/** Tool order, label, key, icon. Keys are letters, as in most editors. */
export const EDITOR_TOOLS: ReadonlyArray<{ tool: EditorTool; label: string; key: string; icon: string }> = [
  { tool: "select", label: "Select & move", key: "V", icon: ico(`<path d="M4 3l7 17 2.5-7.5L21 10z"/>`) },
  { tool: "pen", label: "Pen", key: "P", icon: ico(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>`) },
  { tool: "rect", label: "Box", key: "R", icon: ico(`<rect x="4" y="5" width="16" height="14" rx="1.5"/>`) },
  { tool: "ellipse", label: "Ellipse", key: "O", icon: ico(`<ellipse cx="12" cy="12" rx="9" ry="7"/>`) },
  { tool: "arrow", label: "Arrow", key: "A", icon: ico(`<path d="M5 19 19 5"/><path d="M9 5h10v10"/>`) },
  { tool: "line", label: "Line", key: "L", icon: ico(`<path d="M5 19 19 5"/>`) },
  { tool: "text", label: "Text", key: "T", icon: ico(`<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>`) },
  { tool: "highlight", label: "Highlighter", key: "H", icon: ico(`<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>`) },
  { tool: "step", label: "Numbered step", key: "N", icon: ico(`<circle cx="12" cy="12" r="9"/><path d="M10.5 9.5 12 8v8"/>`) },
  { tool: "blur", label: "Pixelate — hide private info", key: "B", icon: ico(`<rect x="3" y="3" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/>`) },
  { tool: "erase", label: "Eraser — click a mark to remove it", key: "E", icon: ico(`<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>`) },
];

let _open: (() => void) | null = null;

export function isScreenshotEditorOpen(): boolean { return _open !== null; }

/** Open the editor. Returns a function that closes it without saving. */
export function openScreenshotEditor(opts: ScreenshotEditorOptions): () => void {
  _open?.();
  _injectStyles();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.dataset.tracebug = "shot-editor";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Annotate screenshot");

  const toolBtns = EDITOR_TOOLS.map((t) =>
    `<button type="button" class="tb-se-btn" data-se-tool="${t.tool}" aria-pressed="false" data-tip="${t.label} · ${t.key}" aria-label="${t.label} (${t.key})">${t.icon}</button>`
    + (t.tool === "select" || t.tool === "highlight" ? `<span class="tb-se-sep"></span>` : "")).join("");
  const colorBtns = EDITOR_COLORS.map((c) =>
    `<button type="button" class="tb-se-swatch" data-se-color="${c}" style="background:${c}" aria-pressed="false" aria-label="Colour ${c}" data-tip="Colour"></button>`).join("");
  const sizeBtns = (Object.keys(SIZES) as SizeKey[]).map((k) =>
    `<button type="button" class="tb-se-size" data-se-size="${k}" aria-pressed="false" data-tip="Line ${k === "S" ? "thin" : k === "M" ? "medium" : "thick"}" aria-label="Size ${k}"><span style="height:${SIZES[k]}px"></span></button>`).join("");

  setInnerHTML(overlay, `
    <div class="tb-se-head">
      <div class="tb-se-title">Annotate screenshot <span class="tb-se-file" title="${_esc(opts.filename)}">${_esc(opts.filename)}</span></div>
      <button type="button" class="tb-se-btn" data-se="close" data-tip="Close · Esc" aria-label="Close">${ico(`<path d="M6 6l12 12M18 6 6 18"/>`)}</button>
    </div>
    <div class="tb-se-bar" role="toolbar" aria-label="Annotation tools">
      ${toolBtns}
      <span class="tb-se-sep"></span>
      <div class="tb-se-group" role="group" aria-label="Colour">${colorBtns}</div>
      <span class="tb-se-sep"></span>
      <div class="tb-se-group" role="group" aria-label="Size">${sizeBtns}</div>
      <span class="tb-se-sep"></span>
      <button type="button" class="tb-se-btn" data-se="undo" data-tip="Undo · Ctrl+Z" aria-label="Undo">${ico(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`)}</button>
      <button type="button" class="tb-se-btn" data-se="redo" data-tip="Redo · Ctrl+Shift+Z" aria-label="Redo">${ico(`<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`)}</button>
      <button type="button" class="tb-se-btn" data-se="clear" data-tip="Remove all marks" aria-label="Remove all marks">${ico(`<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>`)}</button>
    </div>
    <div class="tb-se-stage-wrap"><div class="tb-se-stage" data-se="stage"></div></div>
    <div class="tb-se-hint" data-se="hint"></div>
    <div class="tb-se-foot">
      <button type="button" class="tb-se-act" data-se="cancel">Cancel</button>
      <span class="tb-se-status" data-se="status" aria-live="polite"></span>
      <button type="button" class="tb-se-act" data-se="copy" data-tip="Copy the image to the clipboard">Copy</button>
      <button type="button" class="tb-se-act" data-se="download">Download</button>
      <button type="button" class="tb-se-act tb-se-primary" data-se="save" data-tip="Save to the ticket · Ctrl+Enter">Save</button>
    </div>
  `);
  opts.root.appendChild(overlay);

  const q = <T extends Element = HTMLElement>(sel: string) => overlay.querySelector(sel) as T;
  const stage = q("[data-se='stage']");
  const hintEl = q("[data-se='hint']");
  const statusEl = q("[data-se='status']");

  const img = new Image();
  img.className = "tb-se-img";
  img.alt = "";
  img.draggable = false;

  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.classList.add("tb-se-svg");
  const blurLayer = document.createElement("div");
  blurLayer.className = "tb-se-blurs";

  // ── State ──────────────────────────────────────────────────────────────
  let W = 1, H = 1;
  let shapes: EditorShape[] = [];
  const undo: EditorShape[][] = [];
  const redo: EditorShape[][] = [];
  let tool: EditorTool = "pen";
  let color = EDITOR_COLORS[0];
  let sizeKey: SizeKey = "M";
  let selected: string | null = null;
  let dirty = false;
  let pixelSrc: HTMLCanvasElement | null = null;
  let seq = 0;
  let textEdit: { input: HTMLInputElement; at: Pt; editing?: EditorShape } | null = null;
  let confirmingClose = false;

  const k = () => W / Math.max(1, stage.getBoundingClientRect().width || W);
  const snapshot = () => { undo.push(shapes.map((s) => ({ ...s, points: s.points?.slice() }))); if (undo.length > 100) undo.shift(); redo.length = 0; };
  const sizeFor = (kind: ShapeKind): number => {
    const base = SIZES[sizeKey];
    const kk = k();
    if (kind === "text") return Math.round((12 + base * 2.5) * kk);
    if (kind === "step") return Math.round((9 + base * 1.6) * kk);
    if (kind === "highlight") return Math.round((10 + base * 3) * kk);
    return Math.max(1, base * kk);
  };

  // ── Rendering ──────────────────────────────────────────────────────────
  const render = () => {
    setInnerHTML(svg, "");
    for (const c of Array.from(blurLayer.children)) c.remove();
    for (const sh of shapes) {
      if (sh.kind === "blur") blurLayer.appendChild(_blurCanvas(sh, pixelSrc, W, H));
      svg.appendChild(_shapeSvg(sh, sh.id === selected, k()));
    }
    _sync();
  };

  const _sync = () => {
    overlay.querySelectorAll<HTMLButtonElement>("[data-se-tool]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.seTool === tool ? "true" : "false"));
    overlay.querySelectorAll<HTMLButtonElement>("[data-se-color]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.seColor === color ? "true" : "false"));
    overlay.querySelectorAll<HTMLButtonElement>("[data-se-size]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.seSize === sizeKey ? "true" : "false"));
    (q<HTMLButtonElement>("[data-se='undo']")).disabled = undo.length === 0;
    (q<HTMLButtonElement>("[data-se='redo']")).disabled = redo.length === 0;
    (q<HTMLButtonElement>("[data-se='clear']")).disabled = shapes.length === 0;
    stage.dataset.tool = tool;
    svg.classList.toggle("tb-se-hitmode", tool === "select" || tool === "erase");
    hintEl.textContent = _hint(tool, selected !== null);
    statusEl.textContent = shapes.length ? `${shapes.length} mark${shapes.length === 1 ? "" : "s"}${dirty ? " · not saved" : ""}` : "";
  };

  const setTool = (t: EditorTool) => {
    commitText();
    tool = t;
    if (t !== "select") selected = null;
    render();
  };
  const setColor = (c: string) => {
    color = c;
    const sel = shapes.find((s) => s.id === selected);
    if (sel && sel.kind !== "blur") { snapshot(); sel.color = c; dirty = true; }
    render();
  };

  // ── Geometry helpers ───────────────────────────────────────────────────
  let stageRect: DOMRect | null = null;
  const toImg = (cx: number, cy: number): Pt => {
    const r = stageRect || stage.getBoundingClientRect();
    return { x: Math.max(0, Math.min(W, ((cx - r.left) / r.width) * W)), y: Math.max(0, Math.min(H, ((cy - r.top) / r.height) * H)) };
  };
  const nextStep = () => shapes.filter((s) => s.kind === "step").reduce((m, s) => Math.max(m, s.n || 0), 0) + 1;

  // ── Pointer ────────────────────────────────────────────────────────────
  let drag: { kind: "draw"; shape: EditorShape; pointerId: number } | { kind: "move"; id: string; from: Pt; orig: EditorShape; pointerId: number; moved: boolean } | { kind: "erase"; pointerId: number; count: number } | null = null;
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };

  const shapeAt = (e: PointerEvent): string | null => {
    const el = (e.target as Element | null)?.closest?.("[data-se-id]");
    if (el) return el.getAttribute("data-se-id");
    // Pixelate regions live in the HTML layer under the SVG.
    for (const c of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = (c as HTMLElement).dataset?.seId;
      if (id && stage.contains(c)) return id;
    }
    return null;
  };

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !W) return;
    if ((e.target as Element).closest(".tb-se-text")) return;
    e.preventDefault();
    if (textEdit) { commitText(); return; }
    stageRect = stage.getBoundingClientRect();
    const p = toImg(e.clientX, e.clientY);
    try { stage.setPointerCapture(e.pointerId); } catch {}

    if (tool === "erase") { snapshot(); drag = { kind: "erase", pointerId: e.pointerId, count: 0 }; eraseUnder(e); return; }
    if (tool === "select") {
      const id = shapeAt(e);
      selected = id;
      if (id) {
        const orig = shapes.find((s) => s.id === id)!;
        drag = { kind: "move", id, from: p, orig: { ...orig, points: orig.points?.slice() }, pointerId: e.pointerId, moved: false };
      }
      render();
      return;
    }
    if (tool === "text") { openText(e.clientX, e.clientY, p); return; }
    if (tool === "step") {
      snapshot();
      shapes.push({ id: `s${++seq}`, kind: "step", color, size: sizeFor("step"), a: p, b: p, n: nextStep() });
      dirty = true;
      render();
      return;
    }
    const sh: EditorShape = { id: `s${++seq}`, kind: tool as ShapeKind, color, size: sizeFor(tool as ShapeKind), a: p, b: p, points: tool === "pen" || tool === "highlight" ? [p] : undefined };
    drag = { kind: "draw", shape: sh, pointerId: e.pointerId };
    shapes.push(sh);
    schedule();
  });

  // One undo step per eraser stroke (the snapshot is taken on pointer-down).
  const eraseUnder = (e: PointerEvent) => {
    const id = shapeAt(e);
    if (!id || drag?.kind !== "erase") return;
    shapes = shapes.filter((s) => s.id !== id);
    drag.count++;
    dirty = true;
    render();
  };

  stage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) {
      if (tool === "erase" || tool === "select") stage.dataset.hover = shapeAt(e) ? "1" : "";
      return;
    }
    if (drag.kind === "erase") { eraseUnder(e); return; }
    const batch = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const last = batch.length ? batch[batch.length - 1] : e;
    if (drag.kind === "move") {
      const p = toImg(last.clientX, last.clientY);
      const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
      if (!drag.moved && Math.hypot(dx, dy) < 2 * k()) return;
      if (!drag.moved) { snapshot(); drag.moved = true; }
      const o = drag.orig;
      const id = drag.id;
      const sh = shapes.find((s) => s.id === id);
      if (sh) {
        sh.a = { x: o.a.x + dx, y: o.a.y + dy };
        sh.b = { x: o.b.x + dx, y: o.b.y + dy };
        if (o.points) sh.points = o.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
        dirty = true;
      }
      schedule();
      return;
    }
    const sh = drag.shape;
    for (const pe of batch.length ? batch : [e]) {
      const p = toImg(pe.clientX, pe.clientY);
      if (sh.points) appendPoint(sh.points, p, 1.5 * k()); else sh.b = p;
    }
    if (!sh.points && e.shiftKey) sh.b = constrainEnd((sh.kind === "blur" ? "rect" : sh.kind) as AnnotTool, sh.a, sh.b);
    schedule();
  });

  const endPointer = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    try { stage.releasePointerCapture(e.pointerId); } catch {}
    const d = drag;
    drag = null;
    stageRect = null;
    if (d.kind === "draw") {
      const sh = d.shape;
      const tiny = sh.points
        ? sh.points.length < 2 || Math.hypot(sh.points[sh.points.length - 1].x - sh.points[0].x, sh.points[sh.points.length - 1].y - sh.points[0].y) < 3 * k() && sh.points.length < 4
        : Math.hypot(sh.b.x - sh.a.x, sh.b.y - sh.a.y) < 4 * k();
      shapes = shapes.filter((s) => s !== sh);
      if (!tiny && e.type === "pointerup") {
        snapshot();
        shapes.push(sh);
        dirty = true;
      }
    } else if (d.kind === "erase" && d.count === 0) {
      undo.pop();
    }
    render();
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("dblclick", (e) => {
    const id = shapeAt(e as PointerEvent);
    const sh = shapes.find((s) => s.id === id);
    if (sh?.kind === "text") {
      const r = stage.getBoundingClientRect();
      const cx = r.left + (sh.a.x / W) * r.width, cy = r.top + (sh.a.y / H) * r.height;
      openText(cx, cy, sh.a, sh);
    }
  });

  // ── Text ───────────────────────────────────────────────────────────────
  function openText(cx: number, cy: number, at: Pt, editing?: EditorShape) {
    commitText();
    const r = stage.getBoundingClientRect();
    const fs = (editing?.size ?? sizeFor("text")) / k();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tb-se-text";
    input.placeholder = "Type, then Enter";
    input.setAttribute("aria-label", "Text label");
    input.maxLength = 300;
    input.value = editing?.text || "";
    input.style.left = `${cx - r.left}px`;
    input.style.top = `${cy - r.top - fs * 0.85}px`;
    input.style.fontSize = `${fs}px`;
    input.style.color = editing?.color || color;
    stage.appendChild(input);
    textEdit = { input, at, editing };
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commitText(); }
      else if (ev.key === "Escape") { ev.preventDefault(); commitText(true); }
    });
    input.addEventListener("blur", () => commitText());
    input.focus({ preventScroll: true });
    if (editing) input.select();
  }
  function commitText(cancel = false) {
    const t = textEdit;
    if (!t) return;
    textEdit = null;
    const value = t.input.value.trim();
    t.input.remove();
    if (cancel) return;
    if (t.editing) {
      if (value === t.editing.text) return;
      snapshot();
      if (value) t.editing.text = value; else shapes = shapes.filter((s) => s !== t.editing);
    } else {
      if (!value) return;
      snapshot();
      shapes.push({ id: `s${++seq}`, kind: "text", color, size: sizeFor("text"), a: t.at, b: t.at, text: value });
    }
    dirty = true;
    render();
  }

  // ── Toolbar ────────────────────────────────────────────────────────────
  overlay.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("button") as HTMLButtonElement | null;
    if (!b || !overlay.contains(b)) return;
    if (b.dataset.seTool) { setTool(b.dataset.seTool as EditorTool); return; }
    if (b.dataset.seColor) { setColor(b.dataset.seColor); return; }
    if (b.dataset.seSize) { sizeKey = b.dataset.seSize as SizeKey; render(); return; }
    switch (b.dataset.se) {
      case "undo": doUndo(); break;
      case "redo": doRedo(); break;
      case "clear": if (shapes.length) { snapshot(); shapes = []; selected = null; dirty = true; render(); } break;
      case "close": case "cancel": requestClose(); break;
      case "save": void save(); break;
      case "download": void download(); break;
      case "copy": void copy(); break;
      case "discard": close(); break;
      case "keep": confirmingClose = false; showFoot(); break;
    }
  });

  const doUndo = () => {
    commitText();
    const prev = undo.pop();
    if (!prev) return;
    redo.push(shapes);
    shapes = prev;
    selected = null;
    dirty = true;
    render();
  };
  const doRedo = () => {
    const next = redo.pop();
    if (!next) return;
    undo.push(shapes);
    shapes = next;
    dirty = true;
    render();
  };

  // ── Keyboard ───────────────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
    if (path.some(isEditableNode)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && key === "z") { if (e.shiftKey) doRedo(); else doUndo(); }
    else if (mod && key === "y") doRedo();
    else if (mod && key === "enter") void save();
    else if (e.key === "Escape") {
      if (confirmingClose) { confirmingClose = false; showFoot(); }
      else if (selected) { selected = null; render(); }
      else requestClose();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      snapshot(); shapes = shapes.filter((s) => s.id !== selected); selected = null; dirty = true; render();
    } else if (!mod && !e.altKey && !e.repeat) {
      const t = EDITOR_TOOLS.find((x) => x.key.toLowerCase() === key);
      if (t) setTool(t.tool);
      else if (key === "[" || key === "]") {
        const order: SizeKey[] = ["S", "M", "L"];
        const i = Math.max(0, Math.min(2, order.indexOf(sizeKey) + (key === "]" ? 1 : -1)));
        sizeKey = order[i]; render();
      } else handled = false;
    } else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };
  document.addEventListener("keydown", onKey, true);

  // ── Output ─────────────────────────────────────────────────────────────
  const flatten = async (): Promise<HTMLCanvasElement> => {
    commitText();
    if (!img.complete) await img.decode().catch(() => {});
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, W, H);
    for (const sh of shapes) _paint(ctx, sh, pixelSrc);
    return c;
  };
  const save = async () => {
    const c = await flatten();
    const dataUrl = c.toDataURL("image/png");
    try { opts.onSave({ dataUrl, width: W, height: H }); } catch {}
    dirty = false;
    opts.toast?.(shapes.length ? `✓ Saved ${shapes.length} mark${shapes.length === 1 ? "" : "s"} to ${opts.filename}` : `✓ Saved ${opts.filename}`);
    close();
  };
  const download = async () => {
    const c = await flatten();
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = opts.filename.replace(/\.(png|jpe?g|webp)$/i, "") + ".png";
    document.body.appendChild(a); a.click(); a.remove();
    opts.toast?.(`✓ Downloaded ${a.download}`);
  };
  const canCopy = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;
  const copyBtn = q<HTMLButtonElement>("[data-se='copy']");
  if (!canCopy) copyBtn.remove();
  const copy = async () => {
    try {
      const c = await flatten();
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      opts.toast?.("✓ Image copied — paste it into Slack, Jira or GitHub");
    } catch {
      opts.toast?.("Couldn't copy here — use Download instead");
    }
  };

  // ── Close (asks first when there are unsaved marks) ────────────────────
  const foot = q(".tb-se-foot");
  const footHtml = foot.innerHTML;
  const showFoot = () => { setInnerHTML(foot, footHtml); if (!canCopy) foot.querySelector("[data-se='copy']")?.remove(); _sync(); };
  const requestClose = () => {
    commitText();
    if (!dirty || shapes.length === 0) { close(); return; }
    confirmingClose = true;
    setInnerHTML(foot, `
      <span class="tb-se-status tb-se-warn">Discard ${shapes.length} unsaved mark${shapes.length === 1 ? "" : "s"}?</span>
      <button type="button" class="tb-se-act" data-se="keep">Keep editing</button>
      <button type="button" class="tb-se-act tb-se-danger" data-se="discard">Discard</button>
      <button type="button" class="tb-se-act tb-se-primary" data-se="save">Save</button>`);
    (foot.querySelector("[data-se='keep']") as HTMLButtonElement)?.focus();
  };
  const wrap = q(".tb-se-stage-wrap");
  const layout = () => {
    if (W <= 1) return;
    const r = wrap.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H, 1);
    stage.style.width = `${Math.max(1, Math.floor(W * scale))}px`;
    stage.style.height = `${Math.max(1, Math.floor(H * scale))}px`;
  };
  const onResize = () => { layout(); render(); };
  window.addEventListener("resize", onResize);
  function close() {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
    overlay.remove();
    if (_open === close) _open = null;
  }
  _open = close;

  // ── Load ───────────────────────────────────────────────────────────────
  img.onload = () => {
    W = img.naturalWidth || 1;
    H = img.naturalHeight || 1;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    stage.append(img, blurLayer, svg);
    pixelSrc = _pixelate(img, W, H);
    layout();
    render();
  };
  img.onerror = () => { hintEl.textContent = "Couldn't load this screenshot."; };
  img.src = opts.dataUrl;
  _sync();
  return close;
}

// ── Shape rendering (SVG while editing) ───────────────────────────────────

function _shapeSvg(sh: EditorShape, selected: boolean, k: number): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
  g.setAttribute("data-se-id", sh.id);
  g.setAttribute("data-se-kind", sh.kind);
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, String(v));
    g.appendChild(n);
    return n;
  };
  const strokeAttrs = { fill: "none", stroke: sh.color, "stroke-width": sh.size, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const hitW = Math.max(sh.size, 14 * k);
  const hit = (tag: string, attrs: Record<string, string | number>) => {
    const n = el(tag, { ...attrs, class: "tb-se-hit", stroke: "transparent", "stroke-width": hitW, fill: "none" });
    return n;
  };
  const d = _shapePath(sh);
  switch (sh.kind) {
    case "pen":
    case "line":
      el("path", { d, ...strokeAttrs }); hit("path", { d }); break;
    case "highlight":
      el("path", { d, ...strokeAttrs, "stroke-opacity": 0.4 }); hit("path", { d }); break;
    case "rect": {
      const b = boxFrom(sh.a, sh.b);
      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: sh.size, ...strokeAttrs });
      hit("rect", { x: b.x, y: b.y, width: b.w, height: b.h }); break;
    }
    case "ellipse": {
      const b = boxFrom(sh.a, sh.b);
      const attrs = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 };
      el("ellipse", { ...attrs, ...strokeAttrs }); hit("ellipse", attrs); break;
    }
    case "arrow": {
      const ag = arrowGeometry(sh.a, sh.b, sh.size);
      el("path", { d: ag.shaft, ...strokeAttrs });
      el("path", { d: ag.head, fill: sh.color, stroke: sh.color, "stroke-width": Math.max(1, sh.size / 2), "stroke-linejoin": "round" });
      hit("path", { d: `M ${sh.a.x} ${sh.a.y} L ${sh.b.x} ${sh.b.y}` }); break;
    }
    case "text": {
      const t = el("text", {
        x: sh.a.x, y: sh.a.y, fill: sh.color, "font-size": sh.size, "font-weight": 600,
        "font-family": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        stroke: _halo(sh.color), "stroke-width": Math.max(2, sh.size / 6), "stroke-linejoin": "round", "paint-order": "stroke",
      });
      t.textContent = sh.text || "";
      const w = (sh.text || "").length * sh.size * 0.58;
      el("rect", { x: sh.a.x - 4 * k, y: sh.a.y - sh.size, width: w + 8 * k, height: sh.size * 1.3, class: "tb-se-hit tb-se-hit-fill", fill: "transparent" });
      break;
    }
    case "step": {
      el("circle", { cx: sh.a.x, cy: sh.a.y, r: sh.size, fill: sh.color, stroke: "#ffffff", "stroke-width": Math.max(1.5, sh.size / 7) });
      const t = el("text", {
        x: sh.a.x, y: sh.a.y, fill: _onColor(sh.color), "font-size": sh.size * 1.15, "font-weight": 700, "text-anchor": "middle",
        "dominant-baseline": "central", "font-family": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      });
      t.textContent = String(sh.n || 1);
      el("circle", { cx: sh.a.x, cy: sh.a.y, r: sh.size, class: "tb-se-hit tb-se-hit-fill", fill: "transparent" });
      break;
    }
    case "blur": {
      const b = boxFrom(sh.a, sh.b);
      // The mosaic itself is the HTML canvas under the SVG; this is its edge
      // (editor only — not painted into the saved image) and its hit area.
      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, fill: "none", stroke: "rgba(255,255,255,0.7)", "stroke-width": 1.5 * k, "stroke-dasharray": `${5 * k} ${4 * k}`, class: "tb-se-edge" });
      el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, class: "tb-se-hit tb-se-hit-fill", fill: "transparent" });
      break;
    }
  }
  if (selected) {
    const box = _bounds(sh);
    const pad = 6 * k;
    el("rect", { x: box.x - pad, y: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, fill: "none", stroke: "#3b82f6", "stroke-width": 1.5 * k, "stroke-dasharray": `${4 * k} ${3 * k}`, class: "tb-se-sel" });
  }
  return g;
}

function _shapePath(sh: EditorShape): string {
  if (sh.points) return smoothPathData(sh.points);
  return `M ${sh.a.x} ${sh.a.y} L ${sh.b.x} ${sh.b.y}`;
}

function _bounds(sh: EditorShape): { x: number; y: number; w: number; h: number } {
  if (sh.kind === "step") return { x: sh.a.x - sh.size, y: sh.a.y - sh.size, w: sh.size * 2, h: sh.size * 2 };
  if (sh.kind === "text") return { x: sh.a.x, y: sh.a.y - sh.size, w: (sh.text || "").length * sh.size * 0.58, h: sh.size * 1.3 };
  if (sh.points && sh.points.length) {
    const xs = sh.points.map((p) => p.x), ys = sh.points.map((p) => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  return boxFrom(sh.a, sh.b);
}

const _halo = (c: string) => (_isLight(c) ? "#111827" : "#ffffff");
const _onColor = (c: string) => (_isLight(c) ? "#111827" : "#ffffff");
function _isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

// ── Pixelate ──────────────────────────────────────────────────────────────

/** A full-size mosaic of the image: drawn tiny, then scaled up unsmoothed. */
function _pixelate(img: HTMLImageElement, W: number, H: number): HTMLCanvasElement {
  const cell = Math.max(8, Math.round(Math.min(W, H) / 60));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.ceil(W / cell));
  small.height = Math.max(1, Math.ceil(H / cell));
  small.getContext("2d")!.drawImage(img, 0, 0, small.width, small.height);
  const big = document.createElement("canvas");
  big.width = W; big.height = H;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(small, 0, 0, W, H);
  return big;
}

function _blurCanvas(sh: EditorShape, src: HTMLCanvasElement | null, W: number, H: number): HTMLCanvasElement {
  const b = boxFrom(sh.a, sh.b);
  const c = document.createElement("canvas");
  c.dataset.seId = sh.id;
  c.className = "tb-se-blur";
  c.width = Math.max(1, Math.round(b.w));
  c.height = Math.max(1, Math.round(b.h));
  c.style.left = `${(b.x / W) * 100}%`;
  c.style.top = `${(b.y / H) * 100}%`;
  c.style.width = `${(b.w / W) * 100}%`;
  c.style.height = `${(b.h / H) * 100}%`;
  if (src && b.w >= 1 && b.h >= 1) c.getContext("2d")!.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  return c;
}

// ── Canvas painting (Save / Download / Copy) ─────────────────────────────

function _paint(ctx: CanvasRenderingContext2D, sh: EditorShape, pixelSrc: HTMLCanvasElement | null): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = sh.color;
  ctx.fillStyle = sh.color;
  ctx.lineWidth = sh.size;
  switch (sh.kind) {
    case "blur": {
      const b = boxFrom(sh.a, sh.b);
      if (pixelSrc && b.w >= 1 && b.h >= 1) ctx.drawImage(pixelSrc, b.x, b.y, b.w, b.h, b.x, b.y, b.w, b.h);
      break;
    }
    case "pen":
    case "line":
      ctx.stroke(new Path2D(_shapePath(sh)));
      break;
    case "highlight":
      ctx.globalAlpha = 0.4;
      ctx.stroke(new Path2D(_shapePath(sh)));
      break;
    case "rect": {
      const b = boxFrom(sh.a, sh.b);
      const r = Math.min(sh.size, b.w / 2, b.h / 2);
      const p = new Path2D();
      p.moveTo(b.x + r, b.y); p.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + b.h, r); p.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
      p.arcTo(b.x, b.y + b.h, b.x, b.y, r); p.arcTo(b.x, b.y, b.x + b.w, b.y, r); p.closePath();
      ctx.stroke(p);
      break;
    }
    case "ellipse": {
      const b = boxFrom(sh.a, sh.b);
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "arrow": {
      const ag = arrowGeometry(sh.a, sh.b, sh.size);
      ctx.stroke(new Path2D(ag.shaft));
      const head = new Path2D(ag.head);
      ctx.lineWidth = Math.max(1, sh.size / 2);
      ctx.fill(head);
      ctx.stroke(head);
      break;
    }
    case "text": {
      ctx.font = `600 ${sh.size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = Math.max(2, sh.size / 6);
      ctx.strokeStyle = _halo(sh.color);
      ctx.strokeText(sh.text || "", sh.a.x, sh.a.y);
      ctx.fillText(sh.text || "", sh.a.x, sh.a.y);
      break;
    }
    case "step": {
      ctx.beginPath();
      ctx.arc(sh.a.x, sh.a.y, sh.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, sh.size / 7);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = _onColor(sh.color);
      ctx.font = `700 ${sh.size * 1.15}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(sh.n || 1), sh.a.x, sh.a.y + sh.size * 0.05);
      break;
    }
  }
  ctx.restore();
}

function _hint(tool: EditorTool, hasSel: boolean): string {
  switch (tool) {
    case "select": return hasSel ? "Drag to move · Delete removes it · double-click text to edit" : "Click a mark to select it, then drag to move";
    case "text": return "Click where the label goes, type, press Enter";
    case "step": return "Click to drop numbered steps — 1, 2, 3 — in the order things happen";
    case "blur": return "Drag over emails, names or tokens to pixelate them in the saved image";
    case "erase": return "Click or drag across marks to remove them";
    default: return "Drag to draw · Shift keeps lines straight and boxes square · [ ] change size";
  }
}

function _esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Styles ────────────────────────────────────────────────────────────────

function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const O = `#${OVERLAY_ID}`;
  const st = createStyleTag(STYLE_ID);
  st.textContent = `
    ${O} { position:fixed; inset:0; z-index:2147483647; display:flex; flex-direction:column; align-items:center; gap:10px; padding:14px 16px 16px; box-sizing:border-box;
      background:rgba(9,10,15,0.94); font-family:var(--tb-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif); color:#e9eaee; pointer-events:auto; }
    ${O} *, ${O} *::before, ${O} *::after { box-sizing:border-box; }
    ${O} button { font-family:inherit; }
    ${O} .tb-se-head { width:100%; max-width:1200px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    ${O} .tb-se-title { font-size:14px; font-weight:600; display:flex; align-items:baseline; gap:10px; min-width:0; }
    ${O} .tb-se-file { font:400 11px var(--tb-font-mono, ui-monospace, monospace); color:rgba(255,255,255,0.45); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    ${O} .tb-se-bar { display:flex; align-items:center; flex-wrap:wrap; justify-content:center; gap:2px; padding:5px 8px; max-width:100%;
      background:#1b1d24; border:1px solid rgba(255,255,255,0.07); border-radius:999px; box-shadow:0 12px 40px rgba(0,0,0,0.45); }
    ${O} .tb-se-group { display:inline-flex; align-items:center; gap:5px; padding:0 3px; }
    ${O} .tb-se-sep { width:1px; height:18px; background:rgba(255,255,255,0.1); margin:0 5px; }
    ${O} .tb-se-btn { position:relative; width:32px; height:32px; border-radius:999px; border:none; padding:0; display:inline-flex; align-items:center; justify-content:center;
      background:transparent; color:rgba(255,255,255,0.78); cursor:pointer; transition:background .12s, color .12s; }
    ${O} .tb-se-btn:hover:not(:disabled) { background:rgba(255,255,255,0.08); color:#fff; }
    ${O} .tb-se-btn[aria-pressed="true"] { background:#FF5C6C; color:#14161c; }
    ${O} .tb-se-btn:disabled { opacity:.3; cursor:default; }
    ${O} .tb-se-swatch { width:16px; height:16px; border-radius:50%; border:none; padding:0; cursor:pointer; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.2); transition:transform .1s; }
    ${O} .tb-se-swatch:hover { transform:scale(1.15); }
    ${O} .tb-se-swatch[aria-pressed="true"] { transform:scale(1.1); box-shadow:0 0 0 2px #1b1d24, 0 0 0 3.5px #fff; }
    ${O} .tb-se-size { width:26px; height:26px; border:none; border-radius:8px; background:transparent; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; padding:0 5px; }
    ${O} .tb-se-size span { display:block; width:100%; border-radius:4px; background:rgba(255,255,255,0.7); }
    ${O} .tb-se-size:hover { background:rgba(255,255,255,0.08); }
    ${O} .tb-se-size[aria-pressed="true"] { background:rgba(255,92,108,0.2); }
    ${O} .tb-se-size[aria-pressed="true"] span { background:#FF8590; }
    ${O} [data-tip]:hover::after { content:attr(data-tip); position:absolute; top:calc(100% + 8px); left:50%; transform:translateX(-50%); white-space:nowrap;
      padding:5px 8px; border-radius:6px; background:#fff; color:#14161c; font-size:11px; font-weight:500; pointer-events:none; z-index:3; box-shadow:0 4px 14px rgba(0,0,0,0.3); }
    ${O} .tb-se-swatch[data-tip]:hover::after { content:none; }
    ${O} .tb-se-stage-wrap { flex:1; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; }
    ${O} .tb-se-stage { position:relative; flex-shrink:0; border-radius:8px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.6);
      touch-action:none; user-select:none; cursor:crosshair; background:#fff; }
    ${O} .tb-se-stage[data-tool="text"] { cursor:text; }
    ${O} .tb-se-stage[data-tool="step"] { cursor:copy; }
    ${O} .tb-se-stage[data-tool="select"] { cursor:default; }
    ${O} .tb-se-stage[data-tool="select"][data-hover="1"] { cursor:move; }
    ${O} .tb-se-stage[data-tool="erase"] { cursor:cell; }
    ${O} .tb-se-img { display:block; width:100%; height:100%; pointer-events:none; }
    ${O} .tb-se-blurs, ${O} .tb-se-svg { position:absolute; inset:0; width:100%; height:100%; }
    ${O} .tb-se-blurs { pointer-events:none; }
    ${O} .tb-se-blur { position:absolute; display:block; image-rendering:pixelated; }
    ${O} .tb-se-svg { overflow:visible; pointer-events:none; }
    ${O} .tb-se-hit { pointer-events:none; }
    ${O} .tb-se-svg.tb-se-hitmode .tb-se-hit { pointer-events:stroke; }
    ${O} .tb-se-svg.tb-se-hitmode .tb-se-hit-fill { pointer-events:all; }
    ${O} .tb-se-text { position:absolute; z-index:4; min-width:160px; margin:0; padding:1px 4px; border:1.5px dashed currentColor; border-radius:4px; outline:none;
      background:rgba(255,255,255,0.85); font-weight:600; font-family:system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height:1.2; }
    ${O} .tb-se-hint { min-height:16px; font-size:12px; color:rgba(255,255,255,0.6); text-align:center; }
    ${O} .tb-se-foot { width:100%; max-width:1200px; display:flex; align-items:center; gap:8px; }
    ${O} .tb-se-status { flex:1; font-size:12px; color:rgba(255,255,255,0.55); }
    ${O} .tb-se-warn { color:#fbbf24; font-weight:500; }
    ${O} .tb-se-act { position:relative; padding:8px 16px; border-radius:8px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.04); color:#e9eaee;
      font-size:13px; font-weight:500; cursor:pointer; }
    ${O} .tb-se-act:hover { background:rgba(255,255,255,0.1); }
    ${O} .tb-se-primary { background:#FF5C6C; border-color:#FF5C6C; color:#14161c; font-weight:600; }
    ${O} .tb-se-primary:hover { background:#ff7480; }
    ${O} .tb-se-danger { color:#fca5a5; border-color:rgba(248,113,113,0.4); }
    ${O} .tb-se-foot [data-tip]:hover::after { top:auto; bottom:calc(100% + 8px); }
  `;
  document.head.appendChild(st);
}
