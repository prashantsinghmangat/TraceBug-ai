// ── Blur / Redact Tool ────────────────────────────────────────────────────
// Drag rectangles over sensitive content to redact it. The boxes use a REAL
// backdrop blur (with a frosted fill fallback) so that SCREEN RECORDINGS and
// screenshots capture the redacted pixels — the underlying text never appears
// in any artifact. Used live during a recording (via the HUD "Blur" button)
// and persists on the page until the recording ends or the user clears it.
//
// Each placed box records a timestamped BlurEvent so the replay timeline can
// show a "blur added" marker (parity with jam.dev's redaction markers).

export interface BlurEvent {
  id: string;
  timestamp: number;
}

const BOX_LAYER_ID = "tracebug-blur-layer";
const DRAW_OVERLAY_ID = "tracebug-blur-draw";
const STYLE_ID = "tracebug-blur-styles";

let _active = false;
let _onExit: (() => void) | null = null;
const _events: BlurEvent[] = [];

export function isBlurModeActive(): boolean {
  return _active;
}

/** Timestamped log of every blur the user added (for the timeline). */
export function getBlurEvents(): BlurEvent[] {
  return [..._events];
}

/** Reset the event log (call when a ticket/session is cleared). Also removes
 *  any visible boxes. */
export function clearBlurEvents(): void {
  _events.length = 0;
  removeAllBlurBoxes();
}

/** Remove the visible blur boxes from the page but keep the event log (used
 *  when a recording stops — the video already captured them). */
export function removeAllBlurBoxes(): void {
  document.getElementById(BOX_LAYER_ID)?.remove();
}

function _ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const supportsBackdrop =
    typeof CSS !== "undefined" &&
    (CSS.supports?.("backdrop-filter", "blur(8px)") || CSS.supports?.("-webkit-backdrop-filter", "blur(8px)"));
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    #${BOX_LAYER_ID} { position: fixed !important; inset: 0 !important; z-index: 2147483646 !important; pointer-events: none !important; }
    #${BOX_LAYER_ID} .tb-blur-box {
      position: fixed !important;
      ${supportsBackdrop
        ? "backdrop-filter: blur(12px) saturate(0.6) !important; -webkit-backdrop-filter: blur(12px) saturate(0.6) !important; background: rgba(20,20,28,0.18) !important;"
        : "background: rgba(28,28,38,0.96) !important;"}
      border: 1px solid rgba(255,255,255,0.35) !important;
      border-radius: 4px !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.25) !important;
      pointer-events: none !important;
      overflow: visible !important;
    }
    #${BOX_LAYER_ID} .tb-blur-x {
      position: absolute !important; top: -9px !important; right: -9px !important;
      width: 18px !important; height: 18px !important; border-radius: 50% !important;
      background: #1b1d24 !important; color: #fff !important; border: 1px solid rgba(255,255,255,0.4) !important;
      font: 700 11px/1 system-ui, sans-serif !important; cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      pointer-events: auto !important; padding: 0 !important;
    }
    #${DRAW_OVERLAY_ID} {
      position: fixed !important; inset: 0 !important; z-index: 2147483646 !important;
      cursor: crosshair !important; background: rgba(10,12,18,0.12) !important;
      user-select: none !important; touch-action: none !important;
    }
    #${DRAW_OVERLAY_ID} .tb-blur-hint {
      position: fixed !important; top: 64px !important; left: 50% !important; transform: translateX(-50%) !important;
      background: #1b1d24 !important; color: #e9eaee !important; border: 1px solid rgba(255,255,255,0.12) !important;
      padding: 7px 14px !important; border-radius: 999px !important; font: 600 12px/1 system-ui, sans-serif !important;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5) !important; pointer-events: none !important; white-space: nowrap !important;
    }
    #${DRAW_OVERLAY_ID} .tb-blur-rubber {
      position: fixed !important; border: 1.5px dashed #7C5CFF !important;
      background: rgba(124,92,255,0.12) !important; border-radius: 4px !important; pointer-events: none !important;
    }
  `;
  document.head.appendChild(s);
}

function _boxLayer(): HTMLElement {
  let layer = document.getElementById(BOX_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = BOX_LAYER_ID;
    layer.dataset.tracebug = "blur-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function _addBox(x: number, y: number, w: number, h: number): void {
  if (w < 6 || h < 6) return; // ignore stray clicks
  const layer = _boxLayer();
  const box = document.createElement("div");
  box.className = "tb-blur-box";
  box.style.setProperty("left", x + "px", "important");
  box.style.setProperty("top", y + "px", "important");
  box.style.setProperty("width", w + "px", "important");
  box.style.setProperty("height", h + "px", "important");
  const evtId = `blur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const del = document.createElement("button");
  del.className = "tb-blur-x";
  del.type = "button";
  del.textContent = "✕";
  del.title = "Remove this blur";
  del.addEventListener("click", (e) => {
    e.stopPropagation();
    box.remove();
    // Drop its timeline event too, so removed blurs don't leave phantom
    // "Blur added" chips on the replay scrubber.
    const i = _events.findIndex((ev) => ev.id === evtId);
    if (i >= 0) _events.splice(i, 1);
  });
  box.appendChild(del);
  layer.appendChild(box);
  _events.push({ id: evtId, timestamp: Date.now() });
}

/**
 * Enter blur-draw mode. The user drags rectangles to redact regions; each one
 * persists on the page. Press Esc (or call deactivate) to finish.
 */
export function activateBlurMode(_root: HTMLElement, onExit?: () => void): void {
  if (_active) return;
  _active = true;
  _onExit = onExit || null;
  _ensureStyles();
  _boxLayer(); // ensure layer exists below the draw overlay

  const overlay = document.createElement("div");
  overlay.id = DRAW_OVERLAY_ID;
  overlay.dataset.tracebug = "blur-draw";
  const hint = document.createElement("div");
  hint.className = "tb-blur-hint";
  hint.textContent = "Drag to blur sensitive areas · Esc to finish";
  overlay.appendChild(hint);
  document.body.appendChild(overlay);

  let startX = 0, startY = 0, drawing = false;
  let rubber: HTMLDivElement | null = null;

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).classList?.contains("tb-blur-x")) return;
    drawing = true;
    startX = e.clientX; startY = e.clientY;
    rubber = document.createElement("div");
    rubber.className = "tb-blur-rubber";
    overlay.appendChild(rubber);
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: PointerEvent) => {
    if (!drawing || !rubber) return;
    const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    rubber.style.setProperty("left", x + "px", "important");
    rubber.style.setProperty("top", y + "px", "important");
    rubber.style.setProperty("width", w + "px", "important");
    rubber.style.setProperty("height", h + "px", "important");
  };
  const onUp = (e: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    rubber?.remove(); rubber = null;
    try { overlay.releasePointerCapture(e.pointerId); } catch {}
    _addBox(x, y, w, h);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); deactivateBlurMode(); }
  };

  overlay.addEventListener("pointerdown", onDown);
  overlay.addEventListener("pointermove", onMove);
  overlay.addEventListener("pointerup", onUp);
  document.addEventListener("keydown", onKey, true);

  // Stash the key handler so deactivate can remove it.
  (overlay as any)._tbKey = onKey;
}

/** Exit blur-draw mode. Placed boxes stay on the page. */
export function deactivateBlurMode(): void {
  if (!_active) return;
  _active = false;
  const overlay = document.getElementById(DRAW_OVERLAY_ID);
  if (overlay) {
    const onKey = (overlay as any)._tbKey as ((e: KeyboardEvent) => void) | undefined;
    if (onKey) document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  }
  const cb = _onExit;
  _onExit = null;
  cb?.();
}
