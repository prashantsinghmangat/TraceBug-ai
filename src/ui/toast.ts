// ── Toast Notification ────────────────────────────────────────────────────
// Lightweight toast system inside #tracebug-root.

import { setInnerHTML, createStyleTag } from "./helpers";

// Structural/positioning CSS used to live in setInlineStyle() calls (inline
// style attribute mutations) — a page with a strict CSP (style-src with a
// nonce but no 'unsafe-inline') blocks those outright, with no nonce/hash
// escape for style attributes (that's spec'd, not a gap to work around).
// Confirmed on a real page: the toast silently got appended with none of
// this applied, so it was never visible at all. Moved into one shared
// nonce-carrying <style> tag instead — createStyleTag() already attaches the
// page's own nonce to it, which a <style> element's content CAN use.
function _ensureToastStyles(): void {
  if (document.getElementById("tracebug-toast-anim")) return;
  const style = createStyleTag("tracebug-toast-anim");
  style.textContent = `
    @keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    .bt-toast {
      position: fixed !important;
      bottom: 32px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      background: #0E1117 !important;
      color: #FFFFFF !important;
      border: 1px solid #6366F1 !important;
      border-radius: 10px !important;
      padding: 14px 22px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      letter-spacing: -0.005em !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      z-index: 2147483647 !important;
      box-shadow: 0 14px 44px rgba(0,0,0,0.7), 0 0 0 4px rgba(99,102,241,0.12) !important;
      pointer-events: auto !important;
      max-width: 460px !important;
      text-align: center !important;
      line-height: 1.4 !important;
      animation: tracebug-toast-in 0.2s ease !important;
    }
    .bt-toast.bt-toast-action {
      background: var(--tb-bg-secondary, #1a1a2e); color: var(--tb-text-primary, #e0e0e0);
      border: 1px solid var(--tb-error, #ef4444); border-left: 4px solid var(--tb-error, #ef4444);
      border-radius: 10px; padding: 12px 14px 12px 16px; font-size: 13px; font-weight: 400;
      letter-spacing: normal; text-align: left;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      max-width: 480px; line-height: 1.4;
      display: flex; align-items: center; gap: 12px;
    }
    .bt-toast-dismissing { opacity: 0 !important; transform: translateX(-50%) translateY(8px) !important; transition: all 0.3s ease !important; }
    .bt-toast-action .bt-toast-msg { flex: 1; }
    .bt-toast-action .bt-toast-action-btn {
      background: var(--tb-accent, #6366F1); color: #fff; border: none; border-radius: 6px;
      padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap;
    }
    .bt-toast-action .bt-toast-dismiss-btn {
      background: none; border: none; color: var(--tb-text-muted, #888); cursor: pointer;
      font-size: 16px; padding: 2px 6px; border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Interactive toast with an action button. Used for error-detected prompts.
 * Auto-dismisses after 8s if no action taken, unless `autoDismissMs` says
 * otherwise — pass `null` to keep it up until the user dismisses it or takes
 * the action. A message that carries a multi-step instruction cannot be on a
 * timer; 8 seconds is not long enough to read one and act on it.
 */
export function showActionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  root: HTMLElement,
  options?: { autoDismissMs?: number | null }
): void {
  const existing = root.querySelector(".bt-toast");
  if (existing) existing.remove();

  _ensureToastStyles();

  const toast = document.createElement("div");
  toast.className = "bt-toast bt-toast-action";
  toast.dataset.tracebug = "toast";
  toast.setAttribute("role", "alert");

  setInnerHTML(toast, `
    <span class="bt-toast-msg">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
    <button data-tb-action="capture" class="bt-toast-action-btn">${actionLabel.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</button>
    <button data-tb-action="dismiss" aria-label="Dismiss" class="bt-toast-dismiss-btn">✕</button>
  `);

  root.appendChild(toast);

  const liveRegion = document.getElementById("tracebug-live");
  if (liveRegion) liveRegion.textContent = message;

  let _dismissed = false;
  const dismiss = () => {
    if (_dismissed) return; // idempotent — manual click + auto-timer can't double-fire
    _dismissed = true;
    clearTimeout(autoTimer);
    toast.classList.add("bt-toast-dismissing");
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('[data-tb-action="capture"]')!.addEventListener("click", () => {
    dismiss();
    onAction();
  });
  toast.querySelector('[data-tb-action="dismiss"]')!.addEventListener("click", dismiss);

  // Auto-dismiss after 8s by default; `null` means it stays until dismissed.
  const dwell = options?.autoDismissMs === undefined ? 8000 : options.autoDismissMs;
  const autoTimer = dwell === null ? undefined : setTimeout(dismiss, dwell);
}

/**
 * The capture could not start because the OPERATING SYSTEM refused — on macOS,
 * a browser missing from System Settings → Privacy & Security → Screen
 * Recording. Shown as a sticky notice rather than a toast for two reasons: the
 * instruction has four steps and ends in "restart your browser", and the fix
 * is somewhere TraceBug cannot take you.
 *
 * The button is the point. Before Phase 4 there was no fallback to offer, so
 * this failure was terminal; now the user can have the capture they came for
 * without the video, in one click, and deal with the permission later.
 */
export function showCaptureBlockedNotice(
  message: string,
  root: HTMLElement,
  onCaptureWithoutVideo?: () => void
): void {
  if (!onCaptureWithoutVideo) {
    // No fallback wired by this caller: the message still has to be readable,
    // so keep it sticky and make the only button a dismiss.
    showActionToast(message, "OK", () => {}, root, { autoDismissMs: null });
    return;
  }
  showActionToast(message, "Capture without video", onCaptureWithoutVideo, root, {
    autoDismissMs: null,
  });
}

export function showToast(message: string, root: HTMLElement): void {
  const existing = root.querySelector(".bt-toast");
  // Action toasts (storage warnings etc.) carry a recovery path and an 8s
  // window — a routine "✓ done" transient must NOT evict one. Drop the
  // transient instead; the warning is the message that must survive.
  if (existing?.classList.contains("bt-toast-action")) return;
  if (existing) existing.remove();

  _ensureToastStyles();

  const toast = document.createElement("div");
  // High-contrast against ANY host theme. Pure white text on a solid dark
  // base with a violet accent border. !important on the readable bits so
  // host-page CSS resets can't mute them — see .bt-toast in _ensureToastStyles.
  toast.className = "bt-toast";
  toast.dataset.tracebug = "toast";

  toast.textContent = message;
  toast.setAttribute("role", "status");
  root.appendChild(toast);

  // Announce to screen readers
  const liveRegion = document.getElementById("tracebug-live");
  if (liveRegion) liveRegion.textContent = message;

  setTimeout(() => {
    toast.classList.add("bt-toast-dismissing");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}
