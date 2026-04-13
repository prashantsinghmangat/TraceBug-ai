// ── First-Run Onboarding ─────────────────────────────────────────────────
// 4-step tooltip sequence shown ONCE on first use.
// Stores completion in localStorage. Lightweight, no library.

const STORAGE_KEY = "tracebug_onboarding_complete";
const TOOLTIP_ID = "tracebug-onboarding-tooltip";

interface TooltipStep {
  targetId: string;
  text: string;
  icon: string;
}

const STEPS: TooltipStep[] = [
  {
    targetId: "tracebug-toolbar-panel-btn",
    text: "TraceBug is recording \u2014 find bugs, we\u2019ll write the report",
    icon: "\uD83D\uDC4B",
  },
  {
    targetId: "tracebug-toolbar-screenshot-btn",
    text: "Screenshot anything suspicious",
    icon: "\uD83D\uDCF7",
  },
  {
    targetId: "tracebug-toolbar-annotate-btn",
    text: "Click elements to annotate feedback",
    icon: "\uD83C\uDFAF",
  },
  {
    targetId: "tracebug-toolbar-panel-btn",
    text: "Open here to see sessions & export reports",
    icon: "\uD83D\uDCCB",
  },
];

let _currentStep = 0;
let _cleanup: (() => void) | null = null;

/** Check if onboarding was already completed */
function isComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/** Mark onboarding as complete */
function markComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {}
}

/** Start the onboarding tour (only if not already completed) */
export function startOnboarding(root: HTMLElement): void {
  if (isComplete()) return;

  // Delay slightly so toolbar is rendered
  setTimeout(() => {
    _currentStep = 0;
    _showStep(root);
  }, 800);
}

/** Replay the tour (called from help button) */
export function replayOnboarding(root: HTMLElement): void {
  _removeTooltip();
  _currentStep = 0;
  _showStep(root);
}

/** Add pulse animation to logo button for first 10 seconds */
export function addLogoPulse(): void {
  if (isComplete()) return;

  const logo = document.getElementById("tracebug-toolbar-panel-btn");
  if (!logo) return;

  logo.style.animation = "tracebug-onboard-pulse 1.5s ease-in-out 6";

  setTimeout(() => {
    if (logo) logo.style.animation = "";
  }, 10000);
}

/** Clean up onboarding UI */
export function cleanupOnboarding(): void {
  _removeTooltip();
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}

function _showStep(root: HTMLElement): void {
  _removeTooltip();

  if (_currentStep >= STEPS.length) {
    markComplete();
    return;
  }

  const step = STEPS[_currentStep];
  const target = document.getElementById(step.targetId);
  if (!target) {
    _currentStep++;
    _showStep(root);
    return;
  }

  const tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.dataset.tracebug = "onboarding-tooltip";

  const rect = target.getBoundingClientRect();

  tooltip.style.cssText = `
    position: fixed; z-index: 2147483647;
    right: ${window.innerWidth - rect.left + 12}px;
    top: ${rect.top + rect.height / 2 - 24}px;
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-accent, #7B61FF);
    border-radius: var(--tb-radius-lg, 12px);
    padding: 12px 16px;
    max-width: 260px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 13px;
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 4px 24px rgba(123, 97, 255, 0.25);
    animation: tracebug-tooltip-in 0.2s ease;
    pointer-events: auto;
  `;

  // Arrow pointing right toward the toolbar
  const arrow = `
    <div style="
      position: absolute; right: -6px; top: 18px;
      width: 10px; height: 10px;
      background: var(--tb-bg-secondary, #1a1a2e);
      border-right: 1px solid var(--tb-accent, #7B61FF);
      border-top: 1px solid var(--tb-accent, #7B61FF);
      transform: rotate(45deg);
    "></div>
  `;

  const stepNum = `<span style="color:var(--tb-text-muted, #666);font-size:11px">${_currentStep + 1}/${STEPS.length}</span>`;
  const isLast = _currentStep === STEPS.length - 1;

  // Safe: the tooltip content is built from the static STEPS array defined in
  // this file (no user data flows in). innerHTML usage has been reviewed.
  tooltip.innerHTML = `
    ${arrow}
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:20px;flex-shrink:0;line-height:1.2">${step.icon}</span>
      <div>
        <div style="margin-bottom:8px;line-height:1.4">${step.text}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          ${stepNum}
          <div style="display:flex;gap:6px">
            <button data-action="skip" style="
              background:transparent;border:none;color:var(--tb-text-muted, #888);
              cursor:pointer;font-size:11px;padding:4px 8px;font-family:inherit
            ">Skip</button>
            <button data-action="next" style="
              background:var(--tb-accent, #7B61FF);border:none;color:#fff;
              border-radius:var(--tb-radius-sm, 4px);cursor:pointer;font-size:11px;
              padding:4px 12px;font-family:inherit;font-weight:600
            ">${isLast ? "Done" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  root.appendChild(tooltip);

  // Highlight the target button
  target.style.boxShadow = "0 0 0 2px var(--tb-accent, #7B61FF), 0 0 12px rgba(123,97,255,0.4)";
  target.style.borderRadius = "var(--tb-radius-md, 8px)";

  tooltip.querySelector('[data-action="next"]')!.addEventListener("click", () => {
    target.style.boxShadow = "";
    _currentStep++;
    _showStep(root);
  });

  tooltip.querySelector('[data-action="skip"]')!.addEventListener("click", () => {
    target.style.boxShadow = "";
    _removeTooltip();
    markComplete();
  });
}

function _removeTooltip(): void {
  const el = document.getElementById(TOOLTIP_ID);
  if (el) el.remove();

  // Remove any lingering highlights
  STEPS.forEach(s => {
    const btn = document.getElementById(s.targetId);
    if (btn) btn.style.boxShadow = "";
  });
}

/** CSS keyframes for onboarding animations — inject once */
export function injectOnboardingStyles(): void {
  if (document.getElementById("tracebug-onboarding-styles")) return;

  const style = document.createElement("style");
  style.id = "tracebug-onboarding-styles";
  style.textContent = `
    @keyframes tracebug-tooltip-in {
      from { opacity: 0; transform: translateX(8px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes tracebug-onboard-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(123, 97, 255, 0); }
      50% { box-shadow: 0 0 0 4px rgba(123, 97, 255, 0.4); }
    }
  `;
  document.head.appendChild(style);
}
