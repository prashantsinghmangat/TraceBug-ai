// ── Upgrade modal ─────────────────────────────────────────────────────────
// Minimal centered modal shown when a free-plan user touches a gated feature.
// No payment integration — the CTA is a placeholder ("Coming Soon"). The
// modal also exposes a dev-mode toggle to flip the local plan flag for
// testing without redeploying.

import { setPlan, isPremium } from "../plan";

const MODAL_ID = "tracebug-upgrade-modal";

export interface UpgradeOptions {
  /** Short feature label, e.g. "PDF export" or "Unlimited screenshots". */
  feature: string;
  /** One-line explainer shown in the body. */
  message: string;
}

/**
 * Show the upgrade modal. If a TraceBug root element is mounted, the modal
 * attaches there (so it inherits theme variables); otherwise it falls back
 * to document.body.
 */
export function showUpgradeModal(options: UpgradeOptions, root?: HTMLElement | null): void {
  // De-dupe: if already open, just update the contents
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();

  const host = root || document.getElementById("tracebug-root") || document.body;

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.dataset.tracebug = "upgrade-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  `;

  const card = document.createElement("div");
  card.dataset.tracebug = "upgrade-modal-card";
  card.style.cssText = `
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    width: 100%; max-width: 380px; padding: 22px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  `;

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-size:22px">✨</span>
      <div style="font-size:16px;font-weight:700;color:var(--tb-text-primary, #fff)">Upgrade to Premium</div>
    </div>
    <div style="font-size:13px;color:var(--tb-text-secondary, #ccc);line-height:1.5;margin-bottom:6px">
      <strong>${escape(options.feature)}</strong> is a premium feature.
    </div>
    <div style="font-size:12px;color:var(--tb-text-muted, #888);line-height:1.5;margin-bottom:18px">
      ${escape(options.message)}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button data-action="upgrade" style="flex:1;background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">Upgrade (Coming Soon)</button>
      <button data-action="close" style="background:transparent;color:var(--tb-text-muted, #888);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px 14px;cursor:pointer;font-size:12px;font-family:inherit">Not now</button>
    </div>

    <div style="border-top:1px solid var(--tb-border, #2a2a3e);padding-top:10px;margin-top:6px">
      <button data-action="dev-toggle" style="width:100%;background:transparent;color:var(--tb-text-muted, #888);border:1px dashed var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:6px;cursor:pointer;font-size:10px;font-family:monospace">${isPremium() ? "Dev: switch to Free" : "Dev: enable Premium (test only)"}</button>
    </div>
  `;

  overlay.appendChild(card);
  host.appendChild(overlay);

  const close = () => { overlay.remove(); };

  card.querySelector('[data-action="close"]')!.addEventListener("click", close);
  card.querySelector('[data-action="upgrade"]')!.addEventListener("click", () => {
    // Placeholder for a future upgrade flow — for now, just close.
    close();
  });
  card.querySelector('[data-action="dev-toggle"]')!.addEventListener("click", async () => {
    await setPlan(isPremium() ? "free" : "premium");
    close();
    // Emit a window event so other UI surfaces (toolbar badge) can refresh.
    try { window.dispatchEvent(new CustomEvent("tracebug-plan-changed")); } catch {}
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
