// ── Recording HUD ─────────────────────────────────────────────────────────
// Floating pill that appears only while a video recording is in progress.
// Shows a pulsing red dot, elapsed timer, an "Add comment" inline input,
// and a Stop button. Comments are timestamped against the video.

import { addVideoComment, getVideoElapsedMs, isVideoRecording } from "../video-recorder";

const HUD_ID = "tracebug-recording-hud";

let _root: HTMLElement | null = null;
let _hud: HTMLElement | null = null;
let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _onStopRequested: (() => void) | null = null;
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
    onCommentSaved?: (text: string, offsetMs: number) => void;
  }
): void {
  if (_hud) return;
  if (!isVideoRecording()) return;

  _root = root;
  _onStopRequested = options.onStop;
  _onCommentSaved = options.onCommentSaved || null;

  const hud = document.createElement("div");
  hud.id = HUD_ID;
  hud.dataset.tracebug = "recording-hud";
  hud.setAttribute("role", "status");
  hud.setAttribute("aria-live", "polite");
  hud.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-error, #ef4444);
    border-radius: 999px;
    padding: 8px 8px 8px 14px;
    display: flex; align-items: center; gap: 10px;
    color: var(--tb-text-primary, #e0e0e0);
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 2147483647;
    pointer-events: auto;
    animation: tracebug-hud-in 0.2s ease;
  `;

  if (!document.getElementById("tracebug-hud-anim")) {
    const style = document.createElement("style");
    style.id = "tracebug-hud-anim";
    style.textContent = `
      @keyframes tracebug-hud-in { from { opacity:0; transform:translate(-50%, -8px); } to { opacity:1; transform:translate(-50%, 0); } }
      @keyframes tracebug-hud-pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
    `;
    document.head.appendChild(style);
  }

  hud.innerHTML = `
    <span data-tb-hud="dot" style="width:8px;height:8px;border-radius:50%;background:var(--tb-error, #ef4444);animation:tracebug-hud-pulse 1.2s infinite;flex-shrink:0"></span>
    <span data-tb-hud="timer" style="font-variant-numeric:tabular-nums;font-weight:600;min-width:38px">00:00</span>
    <span style="width:1px;height:14px;background:var(--tb-border, #2a2a3e);margin:0 2px"></span>
    <input
      data-tb-hud="comment"
      type="text"
      placeholder="Add comment at this moment..."
      maxlength="240"
      aria-label="Add a timestamped comment"
      style="background:transparent;border:none;outline:none;color:var(--tb-text-primary, #e0e0e0);font-size:12px;font-family:inherit;width:220px;padding:4px 6px"
    />
    <button
      data-tb-hud="add"
      title="Save comment (Enter)"
      aria-label="Save comment"
      style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:999px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
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
  const commentInput = hud.querySelector('[data-tb-hud="comment"]') as HTMLInputElement;
  const addBtn = hud.querySelector('[data-tb-hud="add"]') as HTMLButtonElement;
  const stopBtn = hud.querySelector('[data-tb-hud="stop"]') as HTMLButtonElement;

  // Timer tick — runs every 500ms (visual only, no need for 60fps).
  _timerInterval = setInterval(() => {
    if (!isVideoRecording()) return;
    timerEl.textContent = _formatElapsed(getVideoElapsedMs());
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

  stopBtn.addEventListener("click", () => {
    _onStopRequested?.();
  });
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
