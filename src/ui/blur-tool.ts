// ── Blur / Redact Tool ────────────────────────────────────────────────────
// ELEMENT-LEVEL blur: click an element to blur it, click again to unblur.
// The blur is a CSS filter applied to the element ITSELF, so it renders in
// the same paint as the content — it physically cannot lag behind scrolling
// (the old overlay-box approach repositioned via rAF and flashed the
// underlying text during fast scrolls). Screen recordings and screenshots
// capture the blurred pixels; the `tb-mask` class additionally masks the
// element's text in the rrweb DOM replay.
//
// Each blur records a timestamped BlurEvent so the replay timeline can show
// a "blur added" marker. Blurs persist after the picker mode exits (that's
// the point — they redact the recording) until removeAllBlurBoxes().
//
// Everything here that touches .style (the blur filter itself, the hover
// outline, the hint label, document.body's cursor) used to go through
// el.style.setProperty()/el.style.x = y. A page with a strict CSP (style-src
// with a nonce, no 'unsafe-inline') blocks that outright — confirmed on a
// real page, not assumed — with no nonce/hash escape for a style mutation
// (that's spec'd). createStyleTag() attaches the page's own nonce to a real
// <style> element, and CSS rules inside THAT element are free to use no
// matter how specific or how often its text is rewritten — so every style
// below goes through one nonce-carrying stylesheet instead.

import { isTraceBugUiElement } from "../dom-helpers";
import { createStyleTag } from "./helpers";

export interface BlurEvent {
  id: string;
  timestamp: number;
}

const HINT_ID = "tracebug-blur-hint";
const OUTLINE_ID = "tracebug-blur-outline";
const STATIC_STYLE_ID = "tracebug-blur-static-styles";
const OUTLINE_POS_STYLE_ID = "tracebug-blur-outline-pos";
const CURSOR_CLASS = "tb-blur-cursor-active";
const BLURRED_CLASS = "tb-blurred-el";

let _active = false;
let _onExit: (() => void) | null = null;
const _events: BlurEvent[] = [];

interface BlurredEl {
  el: HTMLElement;
  evtId: string;
}
let _blurred: BlurredEl[] = [];

/** The hint label, the hover outline's fixed chrome, and the crosshair
 *  cursor — everything here is the SAME every time, so one static <style>
 *  tag covers all of it. Only the outline's position/size varies per
 *  mousemove, which gets its own, separately-rewritten tag below. */
function _ensureStaticStyles(): void {
  if (document.getElementById(STATIC_STYLE_ID)) return;
  const style = createStyleTag(STATIC_STYLE_ID);
  style.textContent = `
    .${BLURRED_CLASS} { filter: blur(12px) !important; }
    body.${CURSOR_CLASS} { cursor: crosshair !important; }
    #${OUTLINE_ID} {
      position: fixed; display: none; pointer-events: none; z-index: 2147483646;
      outline: 2px solid #6366F1; outline-offset: 1px; border-radius: 4px;
      background: rgba(99,102,241,0.08);
    }
    #${HINT_ID} {
      position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #1b1d24; color: #e9eaee; border: 1px solid rgba(255,255,255,0.12);
      padding: 7px 14px; border-radius: 999px; font: 600 12px/1 system-ui, sans-serif;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5); pointer-events: none; white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

/** The one thing that's genuinely different every mousemove: where the
 *  hover outline sits. Rewriting a nonce-carrying <style> tag's own text is
 *  CSP-safe no matter how often it happens — unlike mutating an element's
 *  style attribute, nothing here touches outline.style at all. */
function _setOutlineRect(rect: { left: number; top: number; width: number; height: number } | null): void {
  let style = document.getElementById(OUTLINE_POS_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = createStyleTag(OUTLINE_POS_STYLE_ID);
    document.head.appendChild(style);
  }
  style.textContent = rect
    ? `#${OUTLINE_ID} { display: block; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; }`
    : `#${OUTLINE_ID} { display: none; }`;
}

export function isBlurModeActive(): boolean {
  return _active;
}

/** Timestamped log of every blur the user added (for the timeline). */
export function getBlurEvents(): BlurEvent[] {
  return [..._events];
}

/** Unblur every element (used when a recording stops — the video already
 *  captured them blurred). Name kept from the box era for API stability. */
export function removeAllBlurBoxes(): void {
  while (_blurred.length) _unblur(_blurred[_blurred.length - 1]);
}

/** Unblur the most recently blurred element. Returns the remaining count. */
export function undoLastBlur(): number {
  const last = _blurred[_blurred.length - 1];
  if (last) _unblur(last);
  return _blurred.length;
}

function _isOurNode(el: Element | null): boolean {
  return isTraceBugUiElement(el);
}

function _findBlurred(el: Element): BlurredEl | undefined {
  return _blurred.find((b) => b.el === el);
}

function _blur(el: HTMLElement): void {
  _ensureStaticStyles();
  // A shared class + !important wins over whatever filter the host page's
  // own CSS set, the same way the old !important inline style did — and
  // removing the class on unblur lets that original CSS reassert itself, so
  // there's nothing to save/restore here any more.
  el.classList.add(BLURRED_CLASS);
  // Mask the text in the rrweb DOM replay too — the visual blur only covers
  // pixels; tb-mask covers the recorded DOM.
  el.classList.add("tb-mask");
  el.setAttribute("data-tb-blurred", "1");
  const evtId = `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  _blurred.push({ el, evtId });
  _events.push({ id: evtId, timestamp: Date.now() });
}

function _unblur(entry: BlurredEl): void {
  const { el, evtId } = entry;
  try {
    el.classList.remove(BLURRED_CLASS);
    el.classList.remove("tb-mask");
    el.removeAttribute("data-tb-blurred");
  } catch {}
  _blurred = _blurred.filter((b) => b !== entry);
  const i = _events.findIndex((ev) => ev.id === evtId);
  if (i >= 0) _events.splice(i, 1);
}

// ── Picker mode ───────────────────────────────────────────────────────────

let _onMove: ((e: MouseEvent) => void) | null = null;
let _onClick: ((e: MouseEvent) => void) | null = null;
let _onKey: ((e: KeyboardEvent) => void) | null = null;

/**
 * Enter blur-picker mode: hover highlights an element, click toggles its
 * blur. Esc (or deactivate) exits — placed blurs persist on the page.
 */
export function activateBlurMode(_root: HTMLElement, onExit?: () => void): void {
  if (_active) return;
  _active = true;
  _onExit = onExit || null;
  _ensureStaticStyles();

  const outline = document.createElement("div");
  outline.id = OUTLINE_ID;
  document.body.appendChild(outline);

  const hint = document.createElement("div");
  hint.id = HINT_ID;
  hint.textContent = "Click elements to blur · click again to unblur · Esc to finish";
  document.body.appendChild(hint);
  document.body.classList.add(CURSOR_CLASS);

  _onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement || _isOurNode(el)) {
      _setOutlineRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    _setOutlineRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  };
  _onClick = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement || _isOurNode(el)) return;
    e.preventDefault();
    e.stopPropagation();
    (e as Event).stopImmediatePropagation?.();
    const existing = _findBlurred(el);
    if (existing) _unblur(existing);
    else _blur(el);
  };
  _onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); deactivateBlurMode(); }
  };

  document.addEventListener("mousemove", _onMove, true);
  document.addEventListener("click", _onClick, true);
  document.addEventListener("keydown", _onKey, true);
}

/** Exit blur-picker mode. Blurred elements STAY blurred. */
export function deactivateBlurMode(): void {
  if (!_active) return;
  _active = false;
  if (_onMove) document.removeEventListener("mousemove", _onMove, true);
  if (_onClick) document.removeEventListener("click", _onClick, true);
  if (_onKey) document.removeEventListener("keydown", _onKey, true);
  _onMove = _onClick = _onKey = null;
  document.getElementById(OUTLINE_ID)?.remove();
  document.getElementById(HINT_ID)?.remove();
  document.getElementById(OUTLINE_POS_STYLE_ID)?.remove();
  document.body.classList.remove(CURSOR_CLASS);
  const cb = _onExit;
  _onExit = null;
  cb?.();
}
