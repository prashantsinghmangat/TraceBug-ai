// ── Inspect mode ──────────────────────────────────────────────────────────
// DevTools-style element inspection scoped to FILING A BUG, not browsing:
// hover shows a box-model highlight (margin/padding tint) plus a tooltip
// with the computed-style summary; click attaches the element + its full
// style evidence to the report as an "inspect" annotation. Esc exits.
//
// Deliberately not a site-explorer (palette/assets/responsive) — that's
// VisBug's job. This exists so design-QA bugs ship with the receipts.

import { captureStyleEvidence, formatStyleSummary } from "./style-evidence";
import { addElementAnnotation } from "./annotation-store";
import { computeElementSelector } from "./element-annotate";
import { isTraceBugUiElement } from "./dom-helpers";
import { ElementAnnotation } from "./types";

let _active = false;
let _root: HTMLElement | null = null;
let _raf = 0;
let _onChange: (() => void) | null = null;

const LAYER_ID = "tracebug-inspect-layer";

export function isInspectModeActive(): boolean {
  return _active;
}

/** `onChange` fires after each captured element (badge counts, toasts). */
export function activateInspectMode(onChange?: () => void): void {
  if (_active) return;
  _active = true;
  _onChange = onChange ?? null;

  const layer = document.createElement("div");
  layer.id = LAYER_ID;
  layer.setAttribute("style", "position:fixed;inset:0;pointer-events:none;z-index:2147483600;");
  layer.innerHTML = `
    <div data-tb-i="margin" style="position:fixed;background:rgba(246,178,107,0.25);pointer-events:none;display:none"></div>
    <div data-tb-i="padding" style="position:fixed;background:rgba(147,196,125,0.30);pointer-events:none;display:none"></div>
    <div data-tb-i="content" style="position:fixed;background:rgba(111,168,220,0.30);outline:1.5px solid #6366F1;pointer-events:none;display:none"></div>
    <div data-tb-i="tip" style="position:fixed;display:none;max-width:340px;background:#0B0B10;color:#EAECF3;border:1px solid #26262E;border-radius:8px;padding:8px 10px;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 8px 24px rgba(0,0,0,0.4);pointer-events:none;white-space:pre-wrap;word-break:break-word"></div>
    <div data-tb-i="hint" style="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#0B0B10;color:#EAECF3;border:1px solid #26262E;border-radius:999px;padding:7px 16px;font:12px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.4);pointer-events:none">🎯 Inspect — click an element to attach its style evidence · Esc to exit</div>
  `;
  document.body.appendChild(layer);
  _root = layer;
  document.body.style.cursor = "crosshair";

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
}

export function deactivateInspectMode(): void {
  if (!_active) return;
  _active = false;
  document.removeEventListener("mousemove", onMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKey, true);
  if (_raf) cancelAnimationFrame(_raf);
  _root?.remove();
  _root = null;
  document.body.style.cursor = "";
}

function isOurs(el: Element | null): boolean {
  return isTraceBugUiElement(el);
}

function box(name: string): HTMLElement | null {
  return _root?.querySelector(`[data-tb-i="${name}"]`) ?? null;
}

function hideAll(): void {
  for (const n of ["margin", "padding", "content", "tip"]) {
    const el = box(n);
    if (el) el.style.display = "none";
  }
}

function onMove(e: MouseEvent): void {
  if (!_active) return;
  if (_raf) cancelAnimationFrame(_raf);
  const { clientX, clientY } = e;
  _raf = requestAnimationFrame(() => paint(clientX, clientY));
}

function paint(x: number, y: number): void {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement || isOurs(el)) {
    hideAll();
    return;
  }

  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const m = {
    t: parseFloat(cs.marginTop) || 0, r: parseFloat(cs.marginRight) || 0,
    b: parseFloat(cs.marginBottom) || 0, l: parseFloat(cs.marginLeft) || 0,
  };
  const p = {
    t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0,
    b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0,
  };

  const place = (elBox: HTMLElement | null, left: number, top: number, w: number, h: number) => {
    if (!elBox) return;
    elBox.style.display = "block";
    elBox.style.left = `${left}px`;
    elBox.style.top = `${top}px`;
    elBox.style.width = `${Math.max(0, w)}px`;
    elBox.style.height = `${Math.max(0, h)}px`;
  };

  // DevTools-style nesting: margin (orange) around the rect, padding (green)
  // inside the border box, content (blue) inside the padding.
  place(box("margin"), r.left - m.l, r.top - m.t, r.width + m.l + m.r, r.height + m.t + m.b);
  place(box("padding"), r.left, r.top, r.width, r.height);
  place(box("content"), r.left + p.l, r.top + p.t, r.width - p.l - p.r, r.height - p.t - p.b);

  const tip = box("tip");
  if (tip) {
    let label = el.tagName.toLowerCase();
    if (el.id) label += `#${el.id}`;
    else if (typeof el.className === "string" && el.className.trim()) label += `.${el.className.trim().split(/\s+/)[0]}`;
    let summary = "";
    try { summary = formatStyleSummary(captureStyleEvidence(el)); } catch {}
    tip.textContent = `${label}\n${summary}`;
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = x + 14;
    let top = y + 14;
    if (left + tw > window.innerWidth - 8) left = x - tw - 14;
    if (top + th > window.innerHeight - 8) top = y - th - 14;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }
}

function onClick(e: MouseEvent): void {
  if (!_active) return;
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  if (!el || isOurs(el)) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const rect = el.getBoundingClientRect();
  const annotation: ElementAnnotation = {
    id: `ea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    selector: computeElementSelector(el),
    tagName: el.tagName.toLowerCase(),
    innerText: (el.innerText || "").slice(0, 100),
    boundingRect: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
    intent: "inspect",
    severity: "info",
    comment: "Style evidence captured via Inspect",
    page: window.location.pathname,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
  try { annotation.styles = captureStyleEvidence(el); } catch {}
  addElementAnnotation(annotation);

  flashConfirmation(el.tagName.toLowerCase());
  if (_onChange) { try { _onChange(); } catch {} }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    deactivateInspectMode();
  }
}

function flashConfirmation(tag: string): void {
  const hint = box("hint");
  if (!hint) return;
  const original = hint.textContent;
  hint.textContent = `✓ <${tag}> style evidence attached to the report`;
  hint.style.background = "#14532d";
  setTimeout(() => {
    if (!hint.isConnected) return;
    hint.textContent = original;
    hint.style.background = "#0B0B10";
  }, 1400);
}
