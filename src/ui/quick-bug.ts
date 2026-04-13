// ── Quick Bug Capture ─────────────────────────────────────────────────────
// Zero-friction bug reporting: 1 keystroke → screenshot → auto-filled modal → 1-click copy.
// Total flow under 5 seconds. Replaces the 6-7 click manual workflow.

import { captureScreenshot, downloadScreenshot } from "../screenshot";
import { getAllSessions } from "../storage";
import { buildReport, formatRootCauseLine } from "../report-builder";
import { generateGitHubIssue, openGitHubIssue } from "../github-issue";
import { generateJiraTicket } from "../jira-issue";
import { generateBugTitle, generateFlowSummary } from "../title-generator";
import { captureEnvironment } from "../environment";
import { ScreenshotData, StoredSession } from "../types";
import { showToast } from "./toast";
import { escapeHtml } from "./helpers";

// Caller can set this from the SDK init so the modal knows which repo to target
let _githubRepo: string | null = null;
export function setGithubRepo(repo: string | null): void { _githubRepo = repo; }

const MODAL_ID = "tracebug-quick-bug-modal";
const DRAFT_KEY = "tracebug_last_bug_draft";

interface Draft {
  title: string;
  description: string;
  timestamp: number;
}

let _isOpen = false;

/** Check if quick bug modal is currently open */
export function isQuickBugOpen(): boolean {
  return _isOpen;
}

/**
 * Main entry: Capture screenshot + open quick bug modal.
 * Called from keyboard shortcut, toolbar button, or programmatic API.
 */
export async function showQuickBugCapture(root: HTMLElement): Promise<void> {
  if (_isOpen) return;

  // Grab current session for auto-fill
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const currentSession = sessions[0] || null;
  const lastEvent = currentSession?.events[currentSession.events.length - 1] || null;

  // Capture screenshot with annotations visible (if any)
  let screenshot: ScreenshotData | null = null;
  try {
    screenshot = await captureScreenshot(lastEvent, { includeAnnotations: true });
  } catch (err) {
    console.warn("[TraceBug] Quick capture screenshot failed:", err);
  }

  // Auto-fill title + description from session context
  const draft = _loadDraft();
  const autoTitle = currentSession ? generateBugTitle(currentSession) : `Bug on ${window.location.pathname}`;
  const autoDesc = _buildDescription(currentSession);

  _openModal(root, {
    title: draft?.title || autoTitle,
    description: draft?.description || autoDesc,
    screenshot,
  });
}

function _buildDescription(session: StoredSession | null): string {
  const env = session?.environment || captureEnvironment();
  const flow = session ? generateFlowSummary(session.events) : "";
  const errorMsg = session?.errorMessage || "";

  // Smart summary — pulled from a full BugReport build so all signals
  // (network, click, error, page) are considered.
  let summary = "";
  let rootCauseLine = "";
  let networkLines: string[] = [];
  let recentSteps: string[] = [];
  try {
    if (session) {
      const report = buildReport(session);
      summary = report.summary;
      rootCauseLine = formatRootCauseLine(report.rootCause);
      recentSteps = report.sessionSteps || [];
      networkLines = (report.networkErrors || [])
        .slice(0, 3)
        .map((n) => {
          const status = n.status === 0 ? "Network Error" : String(n.status);
          const snippet = n.response ? ` — ${n.response.replace(/\s+/g, " ").slice(0, 80)}` : "";
          return `- ${n.method} ${n.url.slice(0, 60)} → ${status}${snippet}`;
        });
    }
  } catch {}

  const lines: string[] = [];
  if (rootCauseLine) { lines.push(`> ${rootCauseLine}`, ""); }
  if (summary) { lines.push(`**Summary:** ${summary}`, ""); }
  lines.push(errorMsg ? `**Error:** ${errorMsg}` : `**Bug on:** ${window.location.pathname}`, "");

  if (recentSteps.length > 0) {
    lines.push("**Recent actions:**");
    recentSteps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }

  lines.push(
    "**Steps to reproduce:**",
    session?.reproSteps || flow || "_(describe what you were doing)_",
    "",
  );

  if (networkLines.length > 0) {
    lines.push("**Failed requests:**", ...networkLines, "");
  }

  lines.push(
    "**Expected:** _(what should happen)_",
    "",
    "**Actual:** _(what actually happened)_",
    "",
    `**Environment:** ${env.browser} ${env.browserVersion} on ${env.os} · ${env.viewport}`,
  );

  return lines.join("\n");
}

function _openModal(
  root: HTMLElement,
  data: { title: string; description: string; screenshot: ScreenshotData | null }
): void {
  _isOpen = true;

  // Remove any existing modal
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = MODAL_ID;
  overlay.dataset.tracebug = "quick-bug-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Quick bug capture");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; pointer-events: auto;
    animation: tracebug-qb-fade-in 0.15s ease;
  `;

  const modal = document.createElement("div");
  modal.dataset.tracebug = "quick-bug-inner";
  modal.style.cssText = `
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    width: 100%; max-width: 640px; max-height: 90vh;
    overflow-y: auto; padding: 24px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: tracebug-qb-slide-up 0.2s ease;
  `;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">\u26A1</span>
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;color:var(--tb-text-primary, #fff)">Quick Bug Capture</div>
        <div style="font-size:12px;color:var(--tb-text-muted, #888);margin-top:2px">Review \u2192 Copy \u2192 Paste into Jira/GitHub</div>
      </div>
      <button data-action="close" aria-label="Close" style="background:none;border:none;color:var(--tb-text-muted, #888);cursor:pointer;font-size:20px;padding:4px 8px;border-radius:6px">\u2715</button>
    </div>

    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Title</label>
    <input
      id="tb-qb-title"
      type="text"
      value="${escapeHtml(data.title)}"
      style="width:100%;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:10px 12px;font-size:13px;font-family:inherit;margin-bottom:14px;outline:none"
    />

    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Description</label>
    <textarea
      id="tb-qb-desc"
      style="width:100%;height:160px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);color:var(--tb-text-primary, #e0e0e0);padding:10px 12px;font-size:12px;font-family:var(--tb-font-mono, monospace);margin-bottom:14px;resize:vertical;outline:none;line-height:1.5"
    >${escapeHtml(data.description)}</textarea>

    ${data.screenshot ? `
      <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Screenshot</label>
      <div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);overflow:hidden;margin-bottom:6px;background:var(--tb-bg-primary, #0f0f1a)">
        <img src="${data.screenshot.dataUrl}" alt="Bug screenshot" style="display:block;max-width:100%;max-height:240px;width:auto;margin:0 auto" />
      </div>
      <div style="font-size:10px;color:var(--tb-text-muted, #555);margin-bottom:16px">${escapeHtml(data.screenshot.filename)} \u00B7 ${data.screenshot.width}x${data.screenshot.height}</div>
    ` : `<div style="font-size:11px;color:var(--tb-text-muted, #666);margin-bottom:16px;padding:10px;background:var(--tb-bg-primary, #0f0f1a);border:1px dashed var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);text-align:center">Screenshot unavailable</div>`}

    ${_githubRepo ? `
      <button data-action="open-github" style="width:100%;background:#24292e;color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:14px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-bottom:8px;transition:opacity 0.15s;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Open in GitHub (${escapeHtml(_githubRepo)})
      </button>
    ` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button data-action="github" style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">\uD83D\uDC19 Copy as GitHub Issue</button>
      <button data-action="jira" style="background:#2684FF;color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">\uD83C\uDFAB Copy as Jira Ticket</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button data-action="text" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s">\uD83D\uDCCB Copy as Plain Text</button>
      <button data-action="download" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s" ${data.screenshot ? "" : "disabled"}>\u2B07 Download Screenshot</button>
    </div>

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--tb-border, #2a2a3e);display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--tb-text-muted, #555)">
      <span>Tip: <kbd style="background:var(--tb-bg-primary, #0f0f1a);padding:2px 6px;border-radius:3px;border:1px solid var(--tb-border, #2a2a3e);font-family:monospace">Ctrl+Shift+B</kbd> to quick-capture anytime</span>
      <span>Draft auto-saved</span>
    </div>
  `;

  overlay.appendChild(modal);
  root.appendChild(overlay);

  _injectStyles();

  // Focus the title input for immediate editing
  setTimeout(() => {
    const titleInput = modal.querySelector("#tb-qb-title") as HTMLInputElement;
    if (titleInput) titleInput.focus();
  }, 50);

  // ── Wire up actions ────────────────────────────────────────────────
  const getDraft = (): { title: string; description: string } => {
    const titleEl = modal.querySelector("#tb-qb-title") as HTMLInputElement;
    const descEl = modal.querySelector("#tb-qb-desc") as HTMLTextAreaElement;
    return { title: titleEl?.value || "", description: descEl?.value || "" };
  };

  const saveDraft = () => {
    const { title, description } = getDraft();
    _saveDraft({ title, description, timestamp: Date.now() });
  };

  // Auto-save draft on input (debounced)
  let saveTimer: any;
  modal.querySelector("#tb-qb-title")!.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  });
  modal.querySelector("#tb-qb-desc")!.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  });

  const close = () => {
    _isOpen = false;
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
  };

  modal.querySelector('[data-action="close"]')!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", escHandler);

  // Open in GitHub — prefilled URL, opens new tab (no API key needed)
  const openGhBtn = modal.querySelector('[data-action="open-github"]');
  if (openGhBtn && _githubRepo) {
    openGhBtn.addEventListener("click", () => {
      const { title, description } = getDraft();
      const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
      const session = sessions[0];
      const report = session ? buildReport(session) : null;
      if (!report) { showToast("No session data yet", root); return; }
      report.title = title;
      // Inject user's description above the auto-generated body
      const repo = _githubRepo!; // checked in outer if
      const ok = openGitHubIssue(repo, { ...report, steps: `${description}\n\n---\n\n${report.steps}` });
      if (ok) {
        showToast("\u2713 GitHub issue page opened", root);
        if (data.screenshot) downloadScreenshot(data.screenshot.dataUrl, data.screenshot.filename);
        _clearDraft();
        setTimeout(close, 300);
      } else {
        showToast("Failed to open GitHub \u2014 use Copy instead", root);
      }
    });
  }

  // Copy actions
  modal.querySelector('[data-action="github"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const markdown = _buildGitHubMarkdown(title, description, data.screenshot);
    const ok = await _copyToClipboard(markdown);
    showToast(ok ? "\u2713 Copied as GitHub Issue \u2014 paste into your repo" : "Copy failed", root);
    if (ok && data.screenshot) downloadScreenshot(data.screenshot.dataUrl, data.screenshot.filename);
    _clearDraft();
    setTimeout(close, 300);
  });

  modal.querySelector('[data-action="jira"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
    const session = sessions[0];
    let text = `Summary: ${title}\n\nDescription:\n${description}`;
    if (session) {
      const report = buildReport(session);
      report.title = title;
      const ticket = generateJiraTicket(report);
      text = `Summary: ${ticket.summary}\nPriority: ${ticket.priority}\nLabels: ${ticket.labels.join(", ")}\n\n${ticket.description}\n\n---\n${description}`;
    }
    const ok = await _copyToClipboard(text);
    showToast(ok ? "\u2713 Copied as Jira Ticket \u2014 paste into your board" : "Copy failed", root);
    if (ok && data.screenshot) downloadScreenshot(data.screenshot.dataUrl, data.screenshot.filename);
    _clearDraft();
    setTimeout(close, 300);
  });

  modal.querySelector('[data-action="text"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const plain = `${title}\n\n${description}`;
    const ok = await _copyToClipboard(plain);
    showToast(ok ? "\u2713 Copied as plain text" : "Copy failed", root);
    if (ok && data.screenshot) downloadScreenshot(data.screenshot.dataUrl, data.screenshot.filename);
    _clearDraft();
    setTimeout(close, 300);
  });

  const downloadBtn = modal.querySelector('[data-action="download"]') as HTMLButtonElement;
  if (downloadBtn && data.screenshot) {
    downloadBtn.addEventListener("click", () => {
      downloadScreenshot(data.screenshot!.dataUrl, data.screenshot!.filename);
      showToast(`\u2713 Downloaded: ${data.screenshot!.filename}`, root);
    });
  }
}

function _buildGitHubMarkdown(title: string, description: string, screenshot: ScreenshotData | null): string {
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const session = sessions[0];
  if (session) {
    const report = buildReport(session);
    report.title = title;
    // Inject custom description into the report
    const md = generateGitHubIssue(report);
    // Prefix the user's description above the auto-generated body
    return `# ${title}\n\n${description}\n\n---\n\n${md.replace(/^#[^\n]*\n/, "")}`;
  }
  return `# ${title}\n\n${description}${screenshot ? `\n\n_Screenshot attached: ${screenshot.filename}_` : ""}`;
}

async function _copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback: textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function _loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    // Discard drafts older than 1 hour
    if (Date.now() - draft.timestamp > 3600000) return null;
    return draft;
  } catch { return null; }
}

function _saveDraft(draft: Draft): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

function _clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function _injectStyles(): void {
  if (document.getElementById("tracebug-qb-styles")) return;
  const style = document.createElement("style");
  style.id = "tracebug-qb-styles";
  style.textContent = `
    @keyframes tracebug-qb-fade-in {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes tracebug-qb-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #${MODAL_ID} button:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    #${MODAL_ID} button:disabled { opacity: 0.4; cursor: not-allowed; }
    #${MODAL_ID} input:focus, #${MODAL_ID} textarea:focus {
      border-color: var(--tb-accent, #7B61FF) !important;
      box-shadow: 0 0 0 2px var(--tb-accent, #7B61FF)33;
    }
  `;
  document.head.appendChild(style);
}
