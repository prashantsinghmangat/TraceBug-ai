// ── Pre-recording flow ────────────────────────────────────────────────────
// The moment BEFORE a recording starts is where privacy happens: blur the
// sensitive areas first, then count down, then roll. Orchestrates the
// existing blur tool (real backdrop blur — redacted pixels are what the
// recording captures) into a pick-first flow, plus a 3-2-1 countdown.

import { activateBlurMode, deactivateBlurMode, isBlurModeActive, removeAllBlurBoxes, undoLastBlur } from "./blur-tool";
import { setInnerHTML, createStyleTag } from "./helpers";

const COUNTDOWN_ID = "tracebug-record-countdown";
const ARM_BAR_ID = "tracebug-record-armbar";
const PICKER_HINT_ID = "tracebug-picker-hint";
const STYLE_ID = "tracebug-pre-record-styles";

// All of this used to be setInlineStyle() / el.style.x = y calls — a page
// with a strict CSP (style-src with a nonce, no 'unsafe-inline') blocks an
// inline style attribute or a direct .style mutation outright, with no
// nonce/hash escape for either (that's spec'd, not a gap to work around).
// Confirmed on a real page: these elements got appended with none of this
// applied, so the picker hint / countdown / blur arm-bar were never visible.
// createStyleTag() already attaches the page's own nonce to the <style> tag
// itself, which CSS rules inside it are free to use no matter how specific.
function _ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = createStyleTag(STYLE_ID);
  style.textContent = `
    #${PICKER_HINT_ID} {
      position: fixed !important; top: 18px !important; left: 50% !important; transform: translateX(-50%) !important;
      z-index: 2147483647 !important; max-width: min(560px, calc(100vw - 32px)) !important;
      background: #1b1d24 !important; color: #e9eaee !important; border: 1px solid rgba(255,255,255,0.08) !important;
      border-radius: 12px !important; padding: 11px 16px !important; box-sizing: border-box !important;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif !important; font-size: 13px !important;
      font-weight: 500 !important; line-height: 1.45 !important; text-align: center !important;
      box-shadow: 0 12px 40px rgba(0,0,0,0.55) !important; pointer-events: none !important;
    }
    #${COUNTDOWN_ID} {
      position: fixed; inset: 0; z-index: 2147483646;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
      background: rgba(11,11,16,0.55); pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    #${COUNTDOWN_ID} .tb-countdown-num {
      font-size: 120px; font-weight: 800; color: #fff; text-shadow: 0 8px 40px rgba(0,0,0,0.6);
      transform: scale(1); opacity: 0.75;
      transition: transform 0.25s ease, opacity 0.25s ease;
    }
    #${COUNTDOWN_ID} .tb-countdown-num.tb-countdown-pulse { transform: scale(1.25); opacity: 1; }
    #${COUNTDOWN_ID} .tb-countdown-hint { font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.75); text-shadow: 0 2px 12px rgba(0,0,0,0.5); }
    #${COUNTDOWN_ID} .tb-countdown-mic {
      pointer-events: auto;
      display: flex; align-items: center; gap: 8px;
      background: #1b1d24; color: #e9eaee; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 999px; padding: 8px 16px 8px 10px; font-size: 13px; font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    }
    #${COUNTDOWN_ID} .tb-countdown-mic button {
      width: 28px; height: 28px; border-radius: 50%; border: 0; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.12); color: #e9eaee; flex-shrink: 0;
    }
    #${COUNTDOWN_ID} .tb-countdown-mic[data-tb-mic="off"] button { background: rgba(239,68,68,0.22); color: #f87171; }
    #${ARM_BAR_ID} {
      position: fixed; left: 50%; top: 18px; transform: translateX(-50%); z-index: 2147483647;
      display: flex; align-items: center; gap: 10px;
      background: #0B0B10; color: #EAECF3; border: 1px solid #26262E; border-radius: 999px;
      padding: 8px 10px 8px 18px; font: 13px -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    }
    #${ARM_BAR_ID} button { font: 600 12px inherit; cursor: pointer; border-radius: 999px; }
    #${ARM_BAR_ID} [data-tb-arm="undo"], #${ARM_BAR_ID} [data-tb-arm="cancel"] {
      background: transparent; color: #A1A1AA; border: 1px solid #26262E; padding: 7px 12px;
    }
    #${ARM_BAR_ID} [data-tb-arm="start"] { background: #ef4444; color: #fff; border: 0; padding: 7px 16px; font-size: 13px; }
  `;
  document.head.appendChild(style);
}

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
 * Mounted on document.body with !important styles, like the HUD: a host
 * page's CSS must not be able to hide or restyle it.
 */
export function showPickerHint(surfaceMode?: "tab" | "desktop"): void {
  try {
    hidePickerHint();
    _ensureStyles();
    const el = document.createElement("div");
    el.id = PICKER_HINT_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
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

const MIC_ON_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
const MIC_OFF_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>`;

// Set when a countdown with a mic toggle mounts; read by prepareRecording()
// right after the countdown resolves. Deliberately NOT part of
// runRecordCountdown's return value — that's documented public SDK API
// (docs/api-reference.md) resolving a plain boolean, and this is additive,
// not a breaking change to it.
let _countdownMicChoice: boolean | null = null;

/** The mic toggle's final state from the most recent countdown that had one,
 *  or null if the last countdown had no mic toggle at all. */
export function getCountdownMicChoice(): boolean | null {
  return _countdownMicChoice;
}

/** Fullscreen 3-2-1 countdown. Resolves `true` at zero, `false` if the user
 *  cancels with Esc. The countdown exists for privacy prep ("wrong tab",
 *  "sensitive data on screen") — being locked in for up to 10 seconds was
 *  the opposite of the control it's meant to give.
 *
 *  `opts.withMicrophone`, when passed, adds a mic on/off toggle to the
 *  overlay showing its starting state — the one chance to catch "forgot to
 *  turn the mic on/off" before the recording actually starts. Read the final
 *  choice via getCountdownMicChoice() once this promise resolves `true`. */
export function runRecordCountdown(seconds: number, opts?: { withMicrophone?: boolean }): Promise<boolean> {
  const total = Math.max(1, Math.min(10, Math.round(seconds)));
  const hasMicToggle = opts?.withMicrophone !== undefined;
  _countdownMicChoice = hasMicToggle ? !!opts!.withMicrophone : null;
  return new Promise((resolve) => {
    _ensureStyles();
    document.getElementById(COUNTDOWN_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = COUNTDOWN_ID;
    const num = document.createElement("div");
    num.className = "tb-countdown-num";
    const hint = document.createElement("div");
    hint.className = "tb-countdown-hint";
    hint.textContent = "Press Esc to cancel";
    overlay.appendChild(num);
    if (hasMicToggle) {
      const mic = document.createElement("div");
      mic.className = "tb-countdown-mic";
      const renderMic = () => {
        mic.dataset.tbMic = _countdownMicChoice ? "on" : "off";
        setInnerHTML(mic, `
          <button type="button" aria-label="${_countdownMicChoice ? "Turn microphone off" : "Turn microphone on"}">${_countdownMicChoice ? MIC_ON_ICON : MIC_OFF_ICON}</button>
          <span>Mic is ${_countdownMicChoice ? "on" : "off"}</span>
        `);
        mic.querySelector("button")!.addEventListener("click", () => {
          _countdownMicChoice = !_countdownMicChoice;
          renderMic();
        });
      };
      renderMic();
      overlay.appendChild(mic);
    }
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
      num.classList.add("tb-countdown-pulse");
      setTimeout(() => { num.classList.remove("tb-countdown-pulse"); }, 200);
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
  _ensureStyles();

  const root = document.getElementById("tracebug-root") || document.body;
  activateBlurMode(root as HTMLElement);

  const bar = document.createElement("div");
  bar.id = ARM_BAR_ID;
  setInnerHTML(bar, `
    <span>🫥 Click elements to blur/unblur — the blur is captured into the recording</span>
    <button data-tb-arm="undo">Undo</button>
    <button data-tb-arm="start">● Start recording</button>
    <button data-tb-arm="cancel">Cancel</button>
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
