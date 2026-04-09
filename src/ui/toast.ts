// ── Toast Notification ────────────────────────────────────────────────────
// Lightweight toast system inside #tracebug-root.

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
