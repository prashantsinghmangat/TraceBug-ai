// ── Pre-recording flow ────────────────────────────────────────────────────
// The moment BEFORE a recording starts is where privacy happens: blur the
// sensitive areas first, then count down, then roll. Orchestrates the
// existing blur tool (real backdrop blur — redacted pixels are what the
// recording captures) into a pick-first flow, plus a 3-2-1 countdown.

import { activateBlurMode, deactivateBlurMode, isBlurModeActive, removeAllBlurBoxes, undoLastBlur } from "./blur-tool";

const COUNTDOWN_ID = "tracebug-record-countdown";
const ARM_BAR_ID = "tracebug-record-armbar";

/** Fullscreen 3-2-1 countdown. Resolves when it hits zero. */
export function runRecordCountdown(seconds: number): Promise<void> {
  const total = Math.max(1, Math.min(10, Math.round(seconds)));
  return new Promise((resolve) => {
    document.getElementById(COUNTDOWN_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = COUNTDOWN_ID;
    overlay.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;" +
        "background:rgba(11,11,16,0.55);pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"
    );
    const num = document.createElement("div");
    num.setAttribute(
      "style",
      "font-size:120px;font-weight:800;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,0.6);" +
        "transition:transform 0.25s ease, opacity 0.25s ease;"
    );
    overlay.appendChild(num);
    document.body.appendChild(overlay);

    let n = total;
    const tick = () => {
      if (n <= 0) {
        overlay.remove();
        resolve();
        return;
      }
      num.textContent = String(n);
      num.style.transform = "scale(1.25)";
      num.style.opacity = "1";
      setTimeout(() => { num.style.transform = "scale(1)"; num.style.opacity = "0.75"; }, 200);
      n--;
      setTimeout(tick, 1000);
    };
    tick();
  });
}

/**
 * Blur-first arming: activates the blur tool so the user can drag boxes over
 * sensitive areas, with a floating bar to start the recording (or cancel).
 * The blur boxes persist into the recording — that's the whole point.
 */
export function startBlurThenRecord(opts: { onStart: () => void; onCancel?: () => void }): void {
  document.getElementById(ARM_BAR_ID)?.remove();

  const root = document.getElementById("tracebug-root") || document.body;
  activateBlurMode(root as HTMLElement);

  const bar = document.createElement("div");
  bar.id = ARM_BAR_ID;
  bar.setAttribute(
    "style",
    "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;" +
      "background:#0B0B10;color:#EAECF3;border:1px solid #26262E;border-radius:999px;padding:8px 10px 8px 18px;" +
      "font:13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.45);"
  );
  bar.innerHTML = `
    <span>🫥 Click elements to blur/unblur — the blur is captured into the recording</span>
    <button data-tb-arm="undo" style="background:transparent;color:#A1A1AA;border:1px solid #26262E;border-radius:999px;padding:7px 12px;font:600 12px inherit;cursor:pointer">Undo</button>
    <button data-tb-arm="start" style="background:#ef4444;color:#fff;border:0;border-radius:999px;padding:7px 16px;font:600 13px inherit;cursor:pointer">● Start recording</button>
    <button data-tb-arm="cancel" style="background:transparent;color:#A1A1AA;border:1px solid #26262E;border-radius:999px;padding:7px 12px;font:600 12px inherit;cursor:pointer">Cancel</button>
  `;
  document.body.appendChild(bar);
  bar.querySelector('[data-tb-arm="undo"]')!.addEventListener("click", () => { undoLastBlur(); });

  const cleanup = () => {
    bar.remove();
    if (isBlurModeActive()) { try { deactivateBlurMode(); } catch {} }
  };
  bar.querySelector('[data-tb-arm="start"]')!.addEventListener("click", () => {
    // Exit DRAW mode but keep the placed boxes — they redact the recording.
    cleanup();
    opts.onStart();
  });
  bar.querySelector('[data-tb-arm="cancel"]')!.addEventListener("click", () => {
    cleanup();
    removeAllBlurBoxes(); // no recording → the boxes have no job to do
    if (opts.onCancel) opts.onCancel();
  });
}
