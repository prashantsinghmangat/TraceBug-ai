// ── Recording HUD ─────────────────────────────────────────────────────────
// Floating pill that appears only while a video recording is in progress.
// Shows a pulsing red dot, elapsed timer, an "Add comment" inline input,
// and a Stop button. Comments are timestamped against the video.

import { addVideoComment, getCaptureCount, getVideoElapsedMs, isRollingMode, isVideoRecording } from "../video-recorder";

const HUD_ID = "tracebug-recording-hud";

let _root: HTMLElement | null = null;
let _hud: HTMLElement | null = null;
let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _onStopRequested: (() => void) | null = null;
let _onCaptureRequested: (() => void) | null = null;
let _onCommentSaved: ((text: string, offsetMs: number) => void) | null = null;

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
    onCapture?: () => void;
    onCommentSaved?: (text: string, offsetMs: number) => void;
  }
): void {
  if (_hud) return;
  if (!isVideoRecording()) return;

  _root = root;
  _onStopRequested = options.onStop;
  _onCaptureRequested = options.onCapture || null;
  _onCommentSaved = options.onCommentSaved || null;

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
      @keyframes tracebug-hud-in { from { opacity:0; transform:translate(-50%, -8px); } to { opacity:1; transform:translate(-50%, 0); } }
      @keyframes tracebug-hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
      #${HUD_ID} {
        position: fixed !important;
        top: 16px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: max-content !important;
        max-width: calc(100vw - 32px) !important;
        background: var(--tb-bg-secondary, #1a1a2e) !important;
        border: 1px solid var(--tb-error, #ef4444) !important;
        border-radius: 999px !important;
        padding: 8px 8px 8px 14px !important;
        display: flex !important;
        align-items: center !important;
        flex-wrap: nowrap !important;
        gap: 10px !important;
        color: var(--tb-text-primary, #e0e0e0) !important;
        font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
        font-size: 12px !important;
        line-height: 1 !important;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        animation: tracebug-hud-in 0.2s ease !important;
        box-sizing: border-box !important;
      }
      #${HUD_ID} > * { flex-shrink: 0 !important; box-sizing: border-box !important; }
      #${HUD_ID} input[data-tb-hud="comment"] {
        background: transparent !important;
        border: none !important;
        outline: none !important;
        color: var(--tb-text-primary, #e0e0e0) !important;
        font-size: 12px !important;
        font-family: inherit !important;
        width: 180px !important;
        max-width: 180px !important;
        padding: 4px 6px !important;
        box-shadow: none !important;
        margin: 0 !important;
      }
      #${HUD_ID} input[data-tb-hud="comment"]::placeholder { color: var(--tb-text-muted, #888) !important; }
      #${HUD_ID} button { font-family: inherit !important; }
    `;
    document.head.appendChild(style);
  }

  const showCapture = isRollingMode();
  hud.innerHTML = `
    <span data-tb-hud="dot" style="width:8px;height:8px;border-radius:50%;background:var(--tb-error, #ef4444);animation:tracebug-hud-pulse 1.2s infinite;flex-shrink:0"></span>
    <span data-tb-hud="timer" style="font-variant-numeric:tabular-nums;font-weight:600;min-width:38px">00:00</span>
    <span data-tb-hud="captures" style="font-size:10px;color:var(--tb-text-muted, #888);min-width:0;display:${showCapture ? "inline" : "none"}">0 captured</span>
    <span style="width:1px;height:14px;background:var(--tb-border, #2a2a3e);margin:0 2px"></span>
    <input
      data-tb-hud="comment"
      type="text"
      placeholder="Add comment at this moment..."
      maxlength="240"
      aria-label="Add a timestamped comment"
      style="background:transparent;border:none;outline:none;color:var(--tb-text-primary, #e0e0e0);font-size:12px;font-family:inherit;width:200px;padding:4px 6px"
    />
    <button
      data-tb-hud="add"
      title="Save comment (Enter)"
      aria-label="Save comment"
      style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:999px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    ${showCapture ? `
      <button
        data-tb-hud="capture"
        title="Capture this moment as a bug ticket — recording continues"
        aria-label="Capture moment as bug ticket"
        style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:999px;padding:6px 10px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;flex-shrink:0;display:flex;align-items:center;gap:5px"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        Capture
      </button>
    ` : ""}
    <button
      data-tb-hud="stop"
      title="Stop recording"
      aria-label="Stop recording"
      style="background:var(--tb-error, #ef4444);color:#fff;border:none;border-radius:999px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;font-family:inherit;flex-shrink:0;display:flex;align-items:center;gap:5px"
    >
      <span style="width:8px;height:8px;background:#fff;border-radius:1px;display:inline-block"></span>
      Stop
    </button>
  `;

  root.appendChild(hud);
  _hud = hud;

  const timerEl = hud.querySelector('[data-tb-hud="timer"]') as HTMLElement;
  const capturesEl = hud.querySelector('[data-tb-hud="captures"]') as HTMLElement | null;
  const commentInput = hud.querySelector('[data-tb-hud="comment"]') as HTMLInputElement;
  const addBtn = hud.querySelector('[data-tb-hud="add"]') as HTMLButtonElement;
  const captureBtn = hud.querySelector('[data-tb-hud="capture"]') as HTMLButtonElement | null;
  const stopBtn = hud.querySelector('[data-tb-hud="stop"]') as HTMLButtonElement;

  // Timer tick — runs every 500ms (visual only, no need for 60fps).
  _timerInterval = setInterval(() => {
    if (!isVideoRecording()) return;
    timerEl.textContent = _formatElapsed(getVideoElapsedMs());
    if (capturesEl) {
      const n = getCaptureCount();
      capturesEl.textContent = n === 1 ? "1 captured" : `${n} captured`;
    }
  }, 500);

  const saveComment = () => {
    const text = commentInput.value.trim();
    if (!text) return;
    const c = addVideoComment(text);
    if (c) {
      _onCommentSaved?.(c.text, c.offsetMs);
      // Flash confirmation: turn the input green for a beat, clear it.
      commentInput.value = "";
      commentInput.style.transition = "background 0.3s";
      commentInput.style.background = "var(--tb-success, #22c55e)33";
      setTimeout(() => { commentInput.style.background = "transparent"; }, 400);
    }
  };

  addBtn.addEventListener("click", saveComment);
  commentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveComment();
    }
  });

  if (captureBtn) {
    captureBtn.addEventListener("click", () => {
      _onCaptureRequested?.();
    });
  }

  stopBtn.addEventListener("click", () => {
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
  _hud?.remove();
  _hud = null;
  _root = null;
  _onStopRequested = null;
  _onCommentSaved = null;
}

export function isRecordingHUDVisible(): boolean {
  return _hud !== null;
}
