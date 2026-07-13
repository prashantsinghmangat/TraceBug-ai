// ── Toast Notification ────────────────────────────────────────────────────
// Lightweight toast system inside #tracebug-root.

/**
 * Interactive toast with an action button. Used for error-detected prompts.
 * Auto-dismisses after 8s if no action taken.
 */
export function showActionToast(
  message: string,
  actionLabel: string,
  onAction: () => void,
  root: HTMLElement
): void {
  const existing = root.querySelector(".bt-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "bt-toast bt-toast-action";
  toast.dataset.tracebug = "toast";
  toast.setAttribute("role", "alert");
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--tb-bg-secondary, #1a1a2e);color:var(--tb-text-primary, #e0e0e0);
    border:1px solid var(--tb-error, #ef4444);border-left:4px solid var(--tb-error, #ef4444);
    border-radius:10px;padding:12px 14px 12px 16px;font-size:13px;
    font-family:system-ui,-apple-system,sans-serif;z-index:2147483647;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto;
    max-width:480px;line-height:1.4;
    display:flex;align-items:center;gap:12px;
    animation:tracebug-toast-in 0.2s ease;
  `;

  if (!document.getElementById("tracebug-toast-anim")) {
    const style = document.createElement("style");
    style.id = "tracebug-toast-anim";
    style.textContent = `@keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
    document.head.appendChild(style);
  }

  toast.innerHTML = `
    <span style="flex:1">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>
    <button data-tb-action="capture" style="background:var(--tb-accent, #6366F1);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">${actionLabel.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</button>
    <button data-tb-action="dismiss" aria-label="Dismiss" style="background:none;border:none;color:var(--tb-text-muted, #888);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px">\u2715</button>
  `;

  root.appendChild(toast);

  const liveRegion = document.getElementById("tracebug-live");
  if (liveRegion) liveRegion.textContent = message;

  let _dismissed = false;
  const dismiss = () => {
    if (_dismissed) return; // idempotent — manual click + auto-timer can't double-fire
    _dismissed = true;
    clearTimeout(autoTimer);
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(8px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  };

  toast.querySelector('[data-tb-action="capture"]')!.addEventListener("click", () => {
    dismiss();
    onAction();
  });
  toast.querySelector('[data-tb-action="dismiss"]')!.addEventListener("click", dismiss);

  // Auto-dismiss after 8s
  const autoTimer = setTimeout(dismiss, 8000);
}

export function showToast(message: string, root: HTMLElement): void {
  const existing = root.querySelector(".bt-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "bt-toast";
  toast.dataset.tracebug = "toast";
  // High-contrast against ANY host theme. Pure white text on a solid dark
  // base with a violet accent border. !important on the readable bits so
  // host-page CSS resets can't mute them.
  toast.style.cssText = `
    position:fixed !important;
    bottom:32px !important;
    left:50% !important;
    transform:translateX(-50%) !important;
    background:#0E1117 !important;
    color:#FFFFFF !important;
    border:1px solid #6366F1 !important;
    border-radius:10px !important;
    padding:14px 22px !important;
    font-size:14px !important;
    font-weight:600 !important;
    letter-spacing:-0.005em !important;
    font-family:system-ui,-apple-system,sans-serif !important;
    z-index:2147483647 !important;
    box-shadow:0 14px 44px rgba(0,0,0,0.7), 0 0 0 4px rgba(99,102,241,0.12) !important;
    pointer-events:auto !important;
    max-width:460px !important;
    text-align:center !important;
    line-height:1.4 !important;
    animation:tracebug-toast-in 0.2s ease !important;
  `;

  if (!document.getElementById("tracebug-toast-anim")) {
    const style = document.createElement("style");
    style.id = "tracebug-toast-anim";
    style.textContent = `@keyframes tracebug-toast-in { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`;
    document.head.appendChild(style);
  }

  toast.textContent = message;
  toast.setAttribute("role", "status");
  root.appendChild(toast);

  // Announce to screen readers
  const liveRegion = document.getElementById("tracebug-live");
  if (liveRegion) liveRegion.textContent = message;

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(8px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}
