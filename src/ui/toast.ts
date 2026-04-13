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
    <button data-tb-action="capture" style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">${actionLabel.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</button>
    <button data-tb-action="dismiss" aria-label="Dismiss" style="background:none;border:none;color:var(--tb-text-muted, #888);cursor:pointer;font-size:16px;padding:2px 6px;border-radius:4px">\u2715</button>
  `;

  root.appendChild(toast);

  const liveRegion = document.getElementById("tracebug-live");
  if (liveRegion) liveRegion.textContent = message;

  const dismiss = () => {
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
  setTimeout(dismiss, 8000);
}

export function showToast(message: string, root: HTMLElement): void {
  const existing = root.querySelector(".bt-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "bt-toast";
  toast.dataset.tracebug = "toast";
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--tb-bg-secondary, #1a1a2e)ee;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border-hover, #3a3a5e);
    border-radius:10px;padding:10px 20px;font-size:13px;
    font-family:system-ui,-apple-system,sans-serif;z-index:2147483647;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);pointer-events:auto;
    max-width:420px;text-align:center;line-height:1.4;
    animation:tracebug-toast-in 0.2s ease;
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
  }, 2000);
}
