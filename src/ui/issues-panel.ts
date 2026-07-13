// ── Issues Panel ──────────────────────────────────────────────────────────
// Modal that lists scanner findings grouped by severity. Each row offers
// "Locate" (flash the offending element on the page) and "File ticket"
// (open the Quick Bug modal pre-filled with the issue's context).
//
// Styles are injected in <head> with !important so host-page CSS resets
// (Tailwind preflight, Bootstrap, etc.) can't squish the layout.

import { Issue } from "../types";
import { dismissIssue, getIssues, scan } from "../scanner";
import { escapeHtml } from "./helpers";

const PANEL_ID = "tracebug-issues-panel";
const STYLE_ID = "tracebug-issues-panel-styles";

let _isOpen = false;
let _root: HTMLElement | null = null;

const SEVERITY_COLORS: Record<Issue["severity"], { bg: string; fg: string; border: string }> = {
  critical: { bg: "#7f1d1d", fg: "#fee2e2", border: "#dc2626" },
  serious: { bg: "#7c2d12", fg: "#fed7aa", border: "#ea580c" },
  moderate: { bg: "#713f12", fg: "#fde68a", border: "#ca8a04" },
  minor: { bg: "#1e3a8a", fg: "#bfdbfe", border: "#2563eb" },
};

const DETECTOR_LABELS: Record<Issue["detector"], string> = {
  "axe-a11y": "A11y",
  "broken-image": "Broken image",
  "mixed-content": "Mixed content",
  "console-error": "JS error",
  "slow-api": "Slow API",
  "failed-request": "Failed request",
  "frustration-rage": "Rage clicks",
  "frustration-dead": "Dead click",
  "frustration-abandon": "Form abandoned",
  "frustration-error-correlated": "Click → error",
};

export function isIssuesPanelOpen(): boolean {
  return _isOpen;
}

/**
 * Run a scan (or use cached results) and open the panel. The scan promise
 * resolves before we render so the panel never flashes empty.
 */
export async function showIssuesPanel(
  root: HTMLElement,
  options?: { rescan?: boolean }
): Promise<void> {
  if (_isOpen) return;
  _root = root;
  _injectStyles();

  // Render shell with a loading state so the user gets immediate feedback.
  _open(root, { issues: [], loading: true });
  try {
    if (options?.rescan ?? true) {
      await scan();
    }
  } catch (err) {
    console.warn("[TraceBug] Scan failed:", err);
  }
  _renderBody(getIssues());
}

function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes tracebug-issue-locate-flash {
      0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.0); outline: 2px solid transparent; }
      30% { box-shadow: 0 0 0 6px rgba(99,102,241,0.5); outline: 2px solid #6366F1; }
    }
    #${PANEL_ID}-overlay {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      background: rgba(0,0,0,0.75) !important;
      backdrop-filter: blur(6px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 20px !important;
      pointer-events: auto !important;
      box-sizing: border-box !important;
    }
    #${PANEL_ID} {
      background: var(--tb-bg-secondary, #1a1a2e) !important;
      border: 1px solid var(--tb-border-hover, #3a3a5e) !important;
      border-radius: var(--tb-radius-lg, 12px) !important;
      width: 100% !important;
      max-width: 720px !important;
      max-height: 90vh !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      box-sizing: border-box !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5) !important;
    }
    #${PANEL_ID} *, #${PANEL_ID} *::before, #${PANEL_ID} *::after { box-sizing: border-box !important; }
    #${PANEL_ID} button { font-family: inherit !important; cursor: pointer !important; }
    #${PANEL_ID} .tb-issue-row {
      padding: 12px 14px;
      border-top: 1px solid var(--tb-border, #2a2a3e);
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    #${PANEL_ID} .tb-issue-row:hover { background: var(--tb-bg-primary, #0f0f1a); }
    #${PANEL_ID} .tb-sev-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 3px 7px;
      border-radius: 4px;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      flex-shrink: 0;
      border: 1px solid;
    }
    #${PANEL_ID} .tb-detector-tag {
      font-size: 10px;
      color: var(--tb-text-muted, #888);
      background: var(--tb-bg-primary, #0f0f1a);
      border: 1px solid var(--tb-border, #2a2a3e);
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    #${PANEL_ID} .tb-issue-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    #${PANEL_ID} .tb-issue-actions button {
      background: transparent;
      color: var(--tb-text-secondary, #aaa);
      border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 11px;
      transition: all 0.15s;
    }
    #${PANEL_ID} .tb-issue-actions button:hover {
      background: var(--tb-btn-hover, #ffffff15);
      color: var(--tb-text-primary, #fff);
    }
    #${PANEL_ID} .tb-issue-actions button[data-action="file"] {
      background: var(--tb-accent, #6366F1);
      color: #fff;
      border-color: transparent;
    }
    #${PANEL_ID} .tb-issue-actions button[data-action="file"]:hover { opacity: 0.9; }
  `;
  document.head.appendChild(style);
}

function _open(root: HTMLElement, state: { issues: Issue[]; loading: boolean }): void {
  _isOpen = true;
  // Remove any prior overlay (defensive — should not happen).
  document.getElementById(`${PANEL_ID}-overlay`)?.remove();

  const overlay = document.createElement("div");
  overlay.id = `${PANEL_ID}-overlay`;
  overlay.dataset.tracebug = "issues-panel-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Page issues");

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.dataset.tracebug = "issues-panel";

  panel.innerHTML = _shellHtml(state);

  overlay.appendChild(panel);
  root.appendChild(overlay);

  _wireShellHandlers(overlay, panel);
}

function _shellHtml(state: { issues: Issue[]; loading: boolean }): string {
  return `
    <div data-tb-issues="header" style="padding:16px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--tb-border, #2a2a3e)">
      <span style="font-size:20px">🔍</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:700;color:var(--tb-text-primary, #fff)">Page Issues</div>
        <div data-tb-issues="subtitle" style="font-size:11px;color:var(--tb-text-muted, #888);margin-top:2px">${state.loading ? "Scanning…" : "No scan yet"}</div>
      </div>
      <button data-tb-issues="rescan" style="background:transparent;color:var(--tb-text-secondary, #aaa);border:1px solid var(--tb-border, #2a2a3e);border-radius:6px;padding:6px 12px;font-size:12px;display:flex;align-items:center;gap:6px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
        Rescan
      </button>
      <button data-tb-issues="close" aria-label="Close" style="background:none;border:none;color:var(--tb-text-muted, #888);font-size:20px;padding:4px 8px;border-radius:6px">&times;</button>
    </div>
    <div data-tb-issues="body" style="flex:1;overflow-y:auto;min-height:200px">
      ${state.loading ? _loadingHtml() : ""}
    </div>
  `;
}

function _loadingHtml(): string {
  return `
    <div style="padding:48px 20px;text-align:center;color:var(--tb-text-muted, #888);font-size:13px">
      <div style="font-size:24px;margin-bottom:8px">🔍</div>
      Scanning page for issues…
      <div style="font-size:11px;margin-top:6px;opacity:0.7">Loading axe-core, checking images, network calls, JS errors…</div>
    </div>
  `;
}

function _wireShellHandlers(overlay: HTMLElement, panel: HTMLElement): void {
  const close = () => {
    _isOpen = false;
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
  };
  panel.querySelector('[data-tb-issues="close"]')!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  panel.querySelector('[data-tb-issues="rescan"]')!.addEventListener("click", async () => {
    const body = panel.querySelector('[data-tb-issues="body"]') as HTMLElement;
    body.innerHTML = _loadingHtml();
    const sub = panel.querySelector('[data-tb-issues="subtitle"]') as HTMLElement;
    sub.textContent = "Scanning…";
    await scan();
    _renderBody(getIssues());
  });

  const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escHandler);
}

function _renderBody(issues: Issue[]): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const body = panel.querySelector('[data-tb-issues="body"]') as HTMLElement;
  const subtitle = panel.querySelector('[data-tb-issues="subtitle"]') as HTMLElement;

  if (issues.length === 0) {
    subtitle.textContent = "No issues found";
    body.innerHTML = `
      <div style="padding:48px 20px;text-align:center;color:var(--tb-text-muted, #888);font-size:13px">
        <div style="font-size:32px;margin-bottom:8px">✓</div>
        Clean scan — no issues detected on this page.
        <div style="font-size:11px;margin-top:6px;opacity:0.7">Includes a11y · broken images · mixed content · JS errors · failed/slow API calls</div>
      </div>
    `;
    return;
  }

  // Severity counts in subtitle
  const counts: Record<string, number> = {};
  for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
  const summary = ["critical", "serious", "moderate", "minor"]
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${s}`)
    .join(" · ");
  subtitle.textContent = `${issues.length} issue${issues.length === 1 ? "" : "s"} · ${summary}`;

  body.innerHTML = issues.map(issue => _issueRowHtml(issue)).join("");

  // Wire row actions
  body.querySelectorAll<HTMLElement>("[data-tb-issue-id]").forEach(row => {
    const id = row.dataset.tbIssueId!;
    const issue = issues.find(i => i.id === id);
    if (!issue) return;

    row.querySelector('[data-action="locate"]')?.addEventListener("click", () => _locate(issue));
    row.querySelector('[data-action="dismiss"]')?.addEventListener("click", () => {
      dismissIssue(id);
      _renderBody(getIssues());
    });
    row.querySelector('[data-action="file"]')?.addEventListener("click", () => _fileAsBug(issue));
  });
}

function _issueRowHtml(issue: Issue): string {
  const colors = SEVERITY_COLORS[issue.severity];
  const detectorLabel = DETECTOR_LABELS[issue.detector];
  const desc = issue.description.length > 240
    ? issue.description.slice(0, 237) + "…"
    : issue.description;

  // Fingerprint dedup: when occurrences > 1 show a collapsible <details>
  // listing each occurrence with its preceding action.
  const repeats = (issue.occurrences || 1) > 1;
  const samplesHtml = repeats && issue.contextSamples && issue.contextSamples.length > 0
    ? `<details style="margin-top:6px;font-size:11px">
         <summary style="cursor:pointer;color:var(--tb-text-muted, #888)">
           View all ${issue.occurrences} contexts
         </summary>
         <ol style="margin:6px 0 0 20px;padding:0;color:var(--tb-text-secondary, #aaa);line-height:1.5">
           ${issue.contextSamples.map(s => `
             <li>${new Date(s.timestamp).toLocaleTimeString()}${s.precedingAction ? ` · ${escapeHtml(s.precedingAction)}` : ""}</li>
           `).join("")}
         </ol>
       </details>`
    : "";

  return `
    <div class="tb-issue-row" data-tb-issue-id="${issue.id}">
      <span class="tb-sev-badge" style="background:${colors.bg};color:${colors.fg};border-color:${colors.border}">${issue.severity}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span class="tb-detector-tag">${detectorLabel}</span>
          <span style="font-size:13px;color:var(--tb-text-primary, #e0e0e0);font-weight:500">${escapeHtml(issue.title)}</span>
        </div>
        <div style="font-size:11px;color:var(--tb-text-muted, #888);line-height:1.5;white-space:pre-wrap">${escapeHtml(desc)}</div>
        ${issue.helpUrl ? `<a href="${issue.helpUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--tb-accent, #6366F1);margin-top:4px;display:inline-block">Learn more →</a>` : ""}
        ${samplesHtml}
      </div>
      <div class="tb-issue-actions">
        ${issue.selector ? `<button data-action="locate" title="Highlight on page">📍 Locate</button>` : ""}
        <button data-action="file" title="File as bug ticket">File ticket</button>
        <button data-action="dismiss" title="Dismiss for this session">Dismiss</button>
      </div>
    </div>
  `;
}

/**
 * Briefly outline the offending element. Closes the panel so the page is
 * visible. Restores after 2.4s — non-destructive flash.
 */
function _locate(issue: Issue): void {
  if (!issue.selector) return;
  let el: Element | null = null;
  try {
    el = document.querySelector(issue.selector);
  } catch {
    el = null;
  }
  if (!el) return;

  // Close the panel so the user can see the page.
  document.getElementById(`${PANEL_ID}-overlay`)?.remove();
  _isOpen = false;

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const htmlEl = el as HTMLElement;
  const prevOutline = htmlEl.style.outline;
  const prevTransition = htmlEl.style.transition;
  htmlEl.style.transition = "outline 0.2s, box-shadow 0.2s";
  htmlEl.style.outline = "3px solid #6366F1";
  htmlEl.style.boxShadow = "0 0 0 6px rgba(99,102,241,0.35)";
  setTimeout(() => {
    htmlEl.style.outline = prevOutline;
    htmlEl.style.boxShadow = "";
    htmlEl.style.transition = prevTransition;
  }, 2400);
}

/**
 * Pre-fill the Quick Bug modal with the issue's title + description as the
 * starting point for a ticket. Reuses the existing ticket-export pipeline.
 */
function _fileAsBug(issue: Issue): void {
  const root = _root || document.getElementById("tracebug-root");
  if (!root) return;
  // Close the issues panel.
  document.getElementById(`${PANEL_ID}-overlay`)?.remove();
  _isOpen = false;

  import("./quick-bug").then(m => {
    m.showQuickBugCapture(root, {
      prefilledTitle: issue.title,
      prefilledDescription: _bugDescriptionFromIssue(issue),
    }).catch(() => {});
  });
}

function _bugDescriptionFromIssue(issue: Issue): string {
  const lines: string[] = [];
  lines.push(`> Detected by TraceBug auto-scanner: **${DETECTOR_LABELS[issue.detector]}** (${issue.severity})`);
  lines.push("");
  lines.push(issue.description);
  if (issue.selector) lines.push(`\n**Selector:** \`${issue.selector}\``);
  if (issue.url) lines.push(`**URL:** \`${issue.url}\``);
  if (issue.helpUrl) lines.push(`**Reference:** ${issue.helpUrl}`);
  return lines.join("\n");
}
