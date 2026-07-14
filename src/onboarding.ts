// ── First-Run Attention Pulse ────────────────────────────────────────────
// A brief glow on the toolbar logo the first time TraceBug loads, so new
// users notice the widget. The original 4-step tooltip tour was cut from v1
// (see compact-toolbar.ts) — this module keeps only what the product uses.

const STORAGE_KEY = "tracebug_onboarding_complete";
const STYLE_ID = "tracebug-onboarding-styles";

/** Check if the first-run pulse was already shown */
function isComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Inject the pulse keyframe once (self-contained — no separate init call) */
function ensurePulseStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes tracebug-onboard-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
      50% { box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.4); }
    }
  `;
  document.head.appendChild(style);
}

/** Pulse the logo button ~9s on first run, then mark done */
export function addLogoPulse(): void {
  if (isComplete()) return;

  const logo = document.getElementById("tracebug-toolbar-panel-btn");
  if (!logo) return;

  ensurePulseStyles();
  logo.style.animation = "tracebug-onboard-pulse 1.5s ease-in-out 6";

  setTimeout(() => {
    if (logo) logo.style.animation = "";
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {}
  }, 10000);
}

/** Remove any onboarding UI/styles (called on SDK teardown) */
export function cleanupOnboarding(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}
