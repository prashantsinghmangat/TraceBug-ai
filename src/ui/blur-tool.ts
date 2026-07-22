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

import { isTraceBugUiElement } from "../dom-helpers";

export interface BlurEvent {
  id: string;
  timestamp: number;
}

const HINT_ID = "tracebug-blur-hint";
const OUTLINE_ID = "tracebug-blur-outline";
const BLUR_FILTER = "blur(12px)";

let _active = false;
let _onExit: (() => void) | null = null;
const _events: BlurEvent[] = [];

interface BlurredEl {
  el: HTMLElement;
  prevFilter: string;
  prevPriority: string;
  evtId: string;
}
let _blurred: BlurredEl[] = [];

export function isBlurModeActive(): boolean {
  return _active;
}

/** Timestamped log of every blur the user added (for the timeline). */
export function getBlurEvents(): BlurEvent[] {
  return [..._events];
}

/** Number of currently-blurred elements (arming-bar badge). */
export function getBlurredCount(): number {
  return _blurred.length;
}

/** Reset the event log and unblur everything. */
export function clearBlurEvents(): void {
  _events.length = 0;
  removeAllBlurBoxes();
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
  const prevFilter = el.style.getPropertyValue("filter");
  const prevPriority = el.style.getPropertyPriority("filter");
  el.style.setProperty("filter", BLUR_FILTER, "important");
  // Mask the text in the rrweb DOM replay too — the visual blur only covers
  // pixels; tb-mask covers the recorded DOM.
  el.classList.add("tb-mask");
  el.setAttribute("data-tb-blurred", "1");
  const evtId = `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  _blurred.push({ el, prevFilter, prevPriority, evtId });
  _events.push({ id: evtId, timestamp: Date.now() });
}

function _unblur(entry: BlurredEl): void {
  const { el, prevFilter, prevPriority, evtId } = entry;
  try {
    if (prevFilter) el.style.setProperty("filter", prevFilter, prevPriority);
    else el.style.removeProperty("filter");
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

  const outline = document.createElement("div");
  outline.id = OUTLINE_ID;
  outline.setAttribute(
    "style",
    "position:fixed;display:none;pointer-events:none;z-index:2147483646;" +
      "outline:2px solid #6366F1;outline-offset:1px;border-radius:4px;background:rgba(99,102,241,0.08);"
  );
  document.body.appendChild(outline);

  const hint = document.createElement("div");
  hint.id = HINT_ID;
  hint.setAttribute(
    "style",
    "position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "background:#1b1d24;color:#e9eaee;border:1px solid rgba(255,255,255,0.12);" +
      "padding:7px 14px;border-radius:999px;font:600 12px/1 system-ui,sans-serif;" +
      "box-shadow:0 8px 30px rgba(0,0,0,0.5);pointer-events:none;white-space:nowrap;"
  );
  hint.textContent = "Click elements to blur · click again to unblur · Esc to finish";
  document.body.appendChild(hint);
  document.body.style.cursor = "crosshair";

  _onMove = (e: MouseEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement || _isOurNode(el)) {
      outline.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    outline.style.display = "block";
    outline.style.left = r.left + "px";
    outline.style.top = r.top + "px";
    outline.style.width = r.width + "px";
    outline.style.height = r.height + "px";
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
  document.body.style.cursor = "";
  const cb = _onExit;
  _onExit = null;
  cb?.();
}
