// ── Pre-recording flow ────────────────────────────────────────────────────
// The moment BEFORE a recording starts is where privacy happens: blur the
// sensitive areas first, then count down, then roll. Orchestrates the
// existing blur tool (real backdrop blur — redacted pixels are what the
// recording captures) into a pick-first flow, plus a 3-2-1 countdown.

import { activateBlurMode, deactivateBlurMode, isBlurModeActive, removeAllBlurBoxes, undoLastBlur } from "./blur-tool";
import { setInnerHTML, setInlineStyle } from "./helpers";

const COUNTDOWN_ID = "tracebug-record-countdown";
const ARM_BAR_ID = "tracebug-record-armbar";
const PICKER_HINT_ID = "tracebug-picker-hint";

/**
 * One line, shown in the instant before the browser's "Choose what to share"
 * dialog opens.
 *
 * Why it needs to exist: the dialog is the browser's, not ours, and it offers
 * three surfaces with no indication of which one a bug report wants. A tester
 * who picks "Entire screen" gets a recording of their desktop — including
 * whatever else is on it — and a tester who picks the wrong tab gets a
 * recording of the wrong page. Neither is recoverable after the fact.
 *
 * The copy differs by mode because the dialog itself does: with "Current tab"
 * chosen in Record options we pass `preferCurrentTab`, which collapses it to a
 * one-click confirm, so telling that user to "pick this tab from the list"
 * would describe a list they are not looking at.
 *
 * Mounted on document.body with inline !important styles, like the HUD: a host
 * page's CSS must not be able to hide or restyle it.
 */
export function showPickerHint(surfaceMode?: "tab" | "desktop"): void {
  try {
    hidePickerHint();
    const el = document.createElement("div");
    el.id = PICKER_HINT_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    setInlineStyle(el, "position:fixed!important;top:18px!important;left:50%!important;transform:translateX(-50%)!important;" +
        "z-index:2147483647!important;max-width:min(560px,calc(100vw - 32px))!important;" +
        "background:#1b1d24!important;color:#e9eaee!important;border:1px solid rgba(255,255,255,0.08)!important;" +
        "border-radius:12px!important;padding:11px 16px!important;box-sizing:border-box!important;" +
        "font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif!important;font-size:13px!important;" +
        "font-weight:500!important;line-height:1.45!important;text-align:center!important;" +
        "box-shadow:0 12px 40px rgba(0,0,0,0.55)!important;pointer-events:none!important;"
    );
    // textContent, never innerHTML — nothing here is user data, but this
    // mounts into a hostile page and the habit is the point.
    el.textContent =
      surfaceMode === "tab"
        ? "Your browser will ask what to share. It's already set to this tab — choose Share."
        : "Your browser will ask what to share. Pick this tab, unless you need a window or the whole screen.";
    document.body.appendChild(el);
  } catch {}
}

/** Remove the picker hint. Safe to call when none is showing. */
export function hidePickerHint(): void {
  try { document.getElementById(PICKER_HINT_ID)?.remove(); } catch {}
}

/** Fullscreen 3-2-1 countdown. Resolves `true` at zero, `false` if the user
 *  cancels with Esc. The countdown exists for privacy prep ("wrong tab",
 *  "sensitive data on screen") — being locked in for up to 10 seconds was
 *  the opposite of the control it's meant to give. */
export function runRecordCountdown(seconds: number): Promise<boolean> {
  const total = Math.max(1, Math.min(10, Math.round(seconds)));
  return new Promise((resolve) => {
    document.getElementById(COUNTDOWN_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = COUNTDOWN_ID;
    setInlineStyle(overlay, "position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;" +
        "background:rgba(11,11,16,0.55);pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"
    );
    const num = document.createElement("div");
    setInlineStyle(num, "font-size:120px;font-weight:800;color:#fff;text-shadow:0 8px 40px rgba(0,0,0,0.6);" +
        "transition:transform 0.25s ease, opacity 0.25s ease;"
    );
    const hint = document.createElement("div");
    hint.textContent = "Press Esc to cancel";
    setInlineStyle(hint, "font-size:14px;font-weight:500;color:rgba(255,255,255,0.75);text-shadow:0 2px 12px rgba(0,0,0,0.5);");
    overlay.appendChild(num);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (completed: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(completed);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancelled = true;
      clearTimeout(timer);
      finish(false);
    };
    // Capture-phase so the host page can't swallow the cancel key.
    document.addEventListener("keydown", onKey, true);

    let n = total;
    const tick = () => {
      if (cancelled) return;
      if (n <= 0) {
        finish(true);
        return;
      }
      num.textContent = String(n);
      num.style.transform = "scale(1.25)";
      num.style.opacity = "1";
      setTimeout(() => { num.style.transform = "scale(1)"; num.style.opacity = "0.75"; }, 200);
      n--;
      timer = setTimeout(tick, 1000);
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
  setInlineStyle(bar, "position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:10px;" +
      "background:#0B0B10;color:#EAECF3;border:1px solid #26262E;border-radius:999px;padding:8px 10px 8px 18px;" +
      "font:13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.45);"
  );
  setInnerHTML(bar, `
    <span>🫥 Click elements to blur/unblur — the blur is captured into the recording</span>
    <button data-tb-arm="undo" style="background:transparent;color:#A1A1AA;border:1px solid #26262E;border-radius:999px;padding:7px 12px;font:600 12px inherit;cursor:pointer">Undo</button>
    <button data-tb-arm="start" style="background:#ef4444;color:#fff;border:0;border-radius:999px;padding:7px 16px;font:600 13px inherit;cursor:pointer">● Start recording</button>
    <button data-tb-arm="cancel" style="background:transparent;color:#A1A1AA;border:1px solid #26262E;border-radius:999px;padding:7px 12px;font:600 12px inherit;cursor:pointer">Cancel</button>
  `);
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
