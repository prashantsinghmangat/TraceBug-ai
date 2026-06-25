// ── Recording HUD ─────────────────────────────────────────────────────────
// Compact pill that appears while a video recording is in progress. Layout:
//
//   [● stop]  [‖ pause]  00:08  [🎤 mic]  |  [✎ annotate]  [✕ close]
//
// Stop and Close both end the recording — Close is just visually paired with
// the rest of the controls. Pause / mic toggles state on the underlying
// MediaRecorder so the user can briefly mask sensitive UI without losing
// the recording context.

import {
  getVideoElapsedMs,
  isVideoRecording,
  pauseVideoRecording,
  resumeVideoRecording,
  isVideoPaused,
  setMicrophoneMuted,
  isMicrophoneMuted,
  hasMicrophoneTrack,
} from "../video-recorder";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "../draw-mode";
import { activateBlurMode, deactivateBlurMode, isBlurModeActive, removeAllBlurBoxes } from "./blur-tool";
import { captureScreenshot } from "../screenshot";

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

/** Mount the recording HUD inside the TraceBug root. No-op if already mounted
 *  or if no recording is in progress. */
export function showRecordingHUD(
  root: HTMLElement,
  options: { onStop: () => void }
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

  if (!document.getElementById("tracebug-hud-anim")) {
    const style = document.createElement("style");
    style.id = "tracebug-hud-anim";
    style.textContent = `
      @keyframes tracebug-hud-in { from { opacity:0; transform:translate(-50%, -8px); } to { opacity:1; transform:translate(-50%, 0); } }
      /* Docked top-center: Chrome pins its un-movable "… is sharing your screen /
         Stop sharing" bar to the BOTTOM-center, so anchoring the HUD there hid our
         controls behind it. Top-center keeps them clear (and is what Loom/Jam do).
         Still fully draggable via the grip. */
      #${HUD_ID} {
        position: fixed !important;
        top: 18px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        width: max-content !important;
        max-width: calc(100vw - 32px) !important;
        background: #1b1d24 !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
        border-radius: 999px !important;
        padding: 6px 10px 6px 6px !important;
        display: flex !important;
        align-items: center !important;
        flex-wrap: nowrap !important;
        gap: 4px !important;
        color: #e9eaee !important;
        font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
        font-size: 13px !important;
        line-height: 1 !important;
        box-shadow: 0 12px 40px rgba(0,0,0,0.55) !important;
        z-index: 2147483647 !important;
        pointer-events: auto !important;
        animation: tracebug-hud-in 0.2s ease !important;
        box-sizing: border-box !important;
        user-select: none !important;
      }
      #${HUD_ID} > * { flex-shrink: 0 !important; box-sizing: border-box !important; }
      #${HUD_ID}[data-tb-dragging="1"] { cursor: grabbing !important; }
      #${HUD_ID} [data-tb-hud="grip"] { cursor: grab !important; padding: 0 2px !important; color: rgba(255,255,255,0.35) !important; display: inline-flex !important; align-items: center !important; }
      #${HUD_ID} [data-tb-hud="grip"]:active { cursor: grabbing !important; }
      #${HUD_ID} button { font-family: inherit !important; }
      #${HUD_ID} .tb-hud-btn {
        width: 30px !important; height: 30px !important;
        background: transparent !important;
        color: rgba(255,255,255,0.85) !important;
        border: none !important; border-radius: 999px !important;
        padding: 0 !important; cursor: pointer !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        transition: background 0.12s ease !important;
      }
      #${HUD_ID} .tb-hud-btn:hover { background: rgba(255,255,255,0.08) !important; }
      #${HUD_ID} .tb-hud-btn[data-active="1"] { background: rgba(124,92,255,0.22) !important; color: #c5b8ff !important; }
      #${HUD_ID} .tb-hud-btn[data-muted="1"] { color: rgba(239,68,68,0.95) !important; }
      #${HUD_ID} .tb-hud-stop {
        background: #ef4444 !important; color: #fff !important;
        width: 30px !important; height: 30px !important;
        border: none !important; border-radius: 999px !important;
        padding: 0 !important; cursor: pointer !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
      }
      #${HUD_ID} .tb-hud-stop:hover { background: #f87171 !important; }
      #${HUD_ID} .tb-hud-sep { width: 1px !important; height: 18px !important; background: rgba(255,255,255,0.1) !important; margin: 0 2px !important; }
      #${HUD_ID} .tb-hud-timer { font-variant-numeric: tabular-nums !important; font-weight: 600 !important; min-width: 44px !important; text-align: center !important; padding: 0 4px !important; font-size: 13px !important; }
    `;
    document.head.appendChild(style);
  }

  const micAvailable = hasMicrophoneTrack();

  hud.innerHTML = `
    <span data-tb-hud="grip" title="Drag to move" aria-label="Drag to move">
      <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="3" r="1.2"/><circle cx="6" cy="3" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="11" r="1.2"/><circle cx="6" cy="11" r="1.2"/></svg>
    </span>
    <button class="tb-hud-stop" data-tb-hud="stop" title="Stop recording" aria-label="Stop recording">
      <span style="width:10px;height:10px;background:#fff;border-radius:2px;display:inline-block"></span>
    </button>
    <button class="tb-hud-btn" data-tb-hud="pause" title="Pause" aria-label="Pause recording">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
    </button>
    <span class="tb-hud-timer" data-tb-hud="timer">00:00</span>
    <button class="tb-hud-btn" data-tb-hud="mic"
      title="${micAvailable ? "Mute / unmute microphone" : "No microphone in this recording"}"
      aria-label="Toggle microphone"
      ${micAvailable ? "" : "disabled"}
      style="${micAvailable ? "" : "opacity:0.35;cursor:not-allowed"}"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
    </button>
    <span class="tb-hud-sep"></span>
    <button class="tb-hud-btn" data-tb-hud="shot" title="Take a screenshot now (adds to the ticket)" aria-label="Take a screenshot">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
    </button>
    <button class="tb-hud-btn" data-tb-hud="annotate" title="Draw on the page" aria-label="Draw on the page">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
    </button>
    <button class="tb-hud-btn" data-tb-hud="blur" title="Blur sensitive areas — drag to redact (captured in the recording)" aria-label="Blur sensitive areas">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="2" y1="2" x2="22" y2="22" opacity="0.45"/></svg>
    </button>
  `;

  root.appendChild(hud);
  _hud = hud;

  const timerEl = hud.querySelector('[data-tb-hud="timer"]') as HTMLElement;
  const gripEl = hud.querySelector('[data-tb-hud="grip"]') as HTMLElement | null;
  const pauseBtn = hud.querySelector('[data-tb-hud="pause"]') as HTMLButtonElement | null;
  const micBtn = hud.querySelector('[data-tb-hud="mic"]') as HTMLButtonElement | null;
  const annotateBtn = hud.querySelector('[data-tb-hud="annotate"]') as HTMLButtonElement | null;
  const blurBtn = hud.querySelector('[data-tb-hud="blur"]') as HTMLButtonElement | null;
  const shotBtn = hud.querySelector('[data-tb-hud="shot"]') as HTMLButtonElement | null;
  const stopBtn = hud.querySelector('[data-tb-hud="stop"]') as HTMLButtonElement;

  _timerInterval = setInterval(() => {
    if (!isVideoRecording()) return;
    if (!isVideoPaused()) timerEl.textContent = _formatElapsed(getVideoElapsedMs());
  }, 500);

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
      hud.style.setProperty("bottom", "auto", "important");
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

  pauseBtn?.addEventListener("click", () => {
    if (isVideoPaused()) {
      resumeVideoRecording();
      pauseBtn.dataset.active = "";
      pauseBtn.title = "Pause";
      pauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
    } else {
      pauseVideoRecording();
      pauseBtn.dataset.active = "1";
      pauseBtn.title = "Resume";
      pauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 7 20 19 12 7 4"/></svg>`;
    }
  });

  micBtn?.addEventListener("click", () => {
    if (!hasMicrophoneTrack()) return;
    const nextMuted = !isMicrophoneMuted();
    setMicrophoneMuted(nextMuted);
    micBtn.dataset.muted = nextMuted ? "1" : "";
    micBtn.title = nextMuted ? "Microphone muted — click to unmute" : "Mute microphone";
    micBtn.innerHTML = nextMuted
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
  });

  annotateBtn?.addEventListener("click", () => {
    const drawRoot = _root;
    if (!drawRoot) return;
    if (isDrawModeActive()) {
      deactivateDrawMode();
      annotateBtn.dataset.active = "";
      return;
    }
    if (isBlurModeActive()) { deactivateBlurMode(); if (blurBtn) blurBtn.dataset.active = ""; }
    activateDrawMode(drawRoot, undefined, undefined, { ephemeralMs: 3000 });
    annotateBtn.dataset.active = "1";
  });

  shotBtn?.addEventListener("click", async () => {
    if (shotBtn.dataset.busy === "1") return;
    shotBtn.dataset.busy = "1";
    try {
      await captureScreenshot(null);
      flashRecordingHUD();
    } catch {}
    shotBtn.dataset.busy = "";
  });

  blurBtn?.addEventListener("click", () => {
    if (isBlurModeActive()) {
      deactivateBlurMode();
      blurBtn.dataset.active = "";
      return;
    }
    // Blur and draw are mutually exclusive — only one capture overlay at a time.
    if (isDrawModeActive()) { try { deactivateDrawMode(); } catch {} if (annotateBtn) annotateBtn.dataset.active = ""; }
    activateBlurMode(_root || document.body, () => { blurBtn.dataset.active = ""; });
    blurBtn.dataset.active = "1";
  });

  const triggerStop = () => {
    if (isDrawModeActive()) { try { deactivateDrawMode(); } catch {} }
    _onStopRequested?.();
  };
  stopBtn.addEventListener("click", triggerStop);
}

/** Briefly flash the HUD to confirm a capture was taken. */
export function flashRecordingHUD(): void {
  if (!_hud) return;
  const prev = _hud.style.boxShadow;
  _hud.style.transition = "box-shadow 0.3s";
  _hud.style.boxShadow = "0 0 0 4px var(--tb-accent, #7C5CFF)66, 0 12px 40px rgba(0,0,0,0.55)";
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
  // Recording is done — the video already captured any blur boxes, so take them
  // off the live page (keep the timestamped events for the timeline/report).
  if (isBlurModeActive()) { try { deactivateBlurMode(); } catch {} }
  removeAllBlurBoxes();
  _hud?.remove();
  _hud = null;
  _root = null;
  _onStopRequested = null;
}

export function isRecordingHUDVisible(): boolean {
  return _hud !== null;
}
