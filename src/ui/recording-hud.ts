// ── Recording HUD ─────────────────────────────────────────────────────────
// Floating pill that appears only while a video recording is in progress.
// Shows a pulsing red dot, elapsed timer, an "Add comment" inline input,
// and a Stop button. Comments are timestamped against the video.

import { getVideoElapsedMs, isVideoRecording } from "../video-recorder";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "../draw-mode";

const HUD_ID = "tracebug-recording-hud";

let _root: HTMLElement | null = null;
let _hud: HTMLElement | null = null;
let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _onStopRequested: (() => void) | null = null;

function _formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Mount the recording HUD inside the TraceBug root. No-op if already mounted
 * or if no recording is in progress.
 */
export function showRecordingHUD(
  root: HTMLElement,
  options: {
    onStop: () => void;
  }
): void {
  if (_hud) return;
  if (!isVideoRecording()) return;

  _root = root;
  _onStopRequested = options.onStop;

  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.dataset.tracebug = "recording-hud";
  hud.setAttribute("role", "status");
  hud.setAttribute("aria-live", "polite");

  // CSS injected into <head> with !important so the host page's CSS resets
  // (Tailwind preflight, Bootstrap, etc.) can't squish the pill.
  if (!document.getElementById("tracebug-hud-anim")) {
    const style = document.createElement("style");
    style.id = "tracebug-hud-anim";
    style.textContent = `
      @keyframes tracebug-hud-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes tracebug-hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
      #${HUD_ID} {
        position: fixed !important;
        top: 16px !important;
        left: 16px !important;
        width: max-content !important;
        max-width: calc(100vw - 32px) !important;
        background: var(--tb-bg-secondary, #1a1a2e) !important;
        border: 1px solid var(--tb-error, #ef4444) !important;
        border-radius: 999px !important;
        padding: 5px 6px 5px 10px !important;
        display: flex !important;
        align-items: center !important;
        flex-wrap: nowrap !important;
        gap: 6px !important;
        color: var(--tb-text-primary, #e0e0e0) !important;
        font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
        font-size: 12px !important;
        line-height: 1 !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        animation: tracebug-hud-in 0.2s ease !important;
        box-sizing: border-box !important;
        user-select: none !important;
      }
      #${HUD_ID} > * { flex-shrink: 0 !important; box-sizing: border-box !important; }
      #${HUD_ID}[data-tb-dragging="1"] { cursor: grabbing !important; }
      #${HUD_ID} [data-tb-hud="grip"] { cursor: grab !important; padding: 0 4px !important; color: var(--tb-text-muted, #888) !important; display: inline-flex !important; align-items: center !important; }
      #${HUD_ID} [data-tb-hud="grip"]:active { cursor: grabbing !important; }
      #${HUD_ID} button { font-family: inherit !important; }
    `;
    document.head.appendChild(style);
  }

  hud.innerHTML = `
    <span data-tb-hud="grip" title="Drag to move" aria-label="Drag to move">
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="3" r="1.3"/><circle cx="8" cy="3" r="1.3"/><circle cx="2" cy="7" r="1.3"/><circle cx="8" cy="7" r="1.3"/><circle cx="2" cy="11" r="1.3"/><circle cx="8" cy="11" r="1.3"/></svg>
    </span>
    <span data-tb-hud="dot" style="width:8px;height:8px;border-radius:50%;background:var(--tb-error, #ef4444);animation:tracebug-hud-pulse 1.2s infinite;flex-shrink:0"></span>
    <span data-tb-hud="timer" style="font-variant-numeric:tabular-nums;font-weight:600;min-width:38px;font-size:12px">00:00</span>
    <button
      data-tb-hud="annotate"
      title="Draw on the page — pen / shapes / redact. Markings auto-fade after 3 s."
      aria-label="Draw on the page"
      style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:999px;width:28px;height:28px;padding:0;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
    </button>
    <button
      data-tb-hud="stop"
      title="Stop recording"
      aria-label="Stop recording"
      style="background:var(--tb-error, #ef4444);color:#fff;border:none;border-radius:999px;padding:5px 11px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;flex-shrink:0;display:flex;align-items:center;gap:5px"
    >
      <span style="width:7px;height:7px;background:#fff;border-radius:1px;display:inline-block"></span>
      Stop
    </button>
  `;

  root.appendChild(hud);
  _hud = hud;

  const timerEl = hud.querySelector('[data-tb-hud="timer"]') as HTMLElement;
  const gripEl = hud.querySelector('[data-tb-hud="grip"]') as HTMLElement | null;
  const annotateBtn = hud.querySelector('[data-tb-hud="annotate"]') as HTMLButtonElement | null;
  const stopBtn = hud.querySelector('[data-tb-hud="stop"]') as HTMLButtonElement;

  // Timer tick — runs every 500ms (visual only, no need for 60fps).
  _timerInterval = setInterval(() => {
    if (!isVideoRecording()) return;
    timerEl.textContent = _formatElapsed(getVideoElapsedMs());
  }, 500);

  // Drag-to-move on the grip handle. Position is stored in inline style so
  // it survives any subsequent CSS recompute. Constrained to the viewport.
  if (gripEl) {
    let startX = 0, startY = 0, hudX = 0, hudY = 0, dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      hud.setAttribute("data-tb-dragging", "1");
      gripEl.setPointerCapture(e.pointerId);
      const rect = hud.getBoundingClientRect();
      hudX = rect.left;
      hudY = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const nx = Math.max(4, Math.min(window.innerWidth - hud.offsetWidth - 4, hudX + (e.clientX - startX)));
      const ny = Math.max(4, Math.min(window.innerHeight - hud.offsetHeight - 4, hudY + (e.clientY - startY)));
      hud.style.setProperty("left", nx + "px", "important");
      hud.style.setProperty("top", ny + "px", "important");
      // Cancel any "centered" transform applied by older CSS.
      hud.style.setProperty("transform", "none", "important");
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      hud.removeAttribute("data-tb-dragging");
      try { gripEl.releasePointerCapture(e.pointerId); } catch {}
    };
    gripEl.addEventListener("pointerdown", onDown);
    gripEl.addEventListener("pointermove", onMove);
    gripEl.addEventListener("pointerup", onUp);
    gripEl.addEventListener("pointercancel", onUp);
  }

  if (annotateBtn) {
    annotateBtn.addEventListener("click", () => {
      const drawRoot = _root;
      if (!drawRoot) return;
      if (isDrawModeActive()) {
        deactivateDrawMode();
        return;
      }
      // Draw toolbar is a small centered pill — it doesn't overlap the
      // HUD's default top-left position. If the user drags the HUD into
      // the center, mild overlap is on them.
      // ephemeralMs = 3000 → drawings auto-fade after 3 seconds and skip
      // the comment-input prompt. The visible markup is recorded into the
      // video; the draw events flow into the timeline.
      activateDrawMode(drawRoot, undefined, undefined, { ephemeralMs: 3000 });
    });
  }

  stopBtn.addEventListener("click", () => {
    // Tear down draw mode first so the toolbar doesn't outlive the
    // recording (otherwise it sits there with no recording to annotate).
    if (isDrawModeActive()) {
      try { deactivateDrawMode(); } catch {}
    }
    _onStopRequested?.();
  });
}

/** Briefly flash the HUD to confirm a capture was taken. */
export function flashRecordingHUD(): void {
  if (!_hud) return;
  const prev = _hud.style.boxShadow;
  _hud.style.transition = "box-shadow 0.3s";
  _hud.style.boxShadow = "0 0 0 4px var(--tb-accent, #7B61FF)66, 0 8px 32px rgba(0,0,0,0.4)";
  setTimeout(() => {
    if (_hud) _hud.style.boxShadow = prev;
  }, 400);
}

/** Remove the HUD from the DOM and stop the timer. */
export function hideRecordingHUD(): void {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  if (isDrawModeActive()) {
    try { deactivateDrawMode(); } catch {}
  }
  _hud?.remove();
  _hud = null;
  _root = null;
  _onStopRequested = null;
}

export function isRecordingHUDVisible(): boolean {
  return _hud !== null;
}
