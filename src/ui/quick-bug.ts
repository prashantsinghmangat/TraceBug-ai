// ── Quick Bug Capture ─────────────────────────────────────────────────────
// Zero-friction bug reporting: 1 keystroke → screenshot → auto-filled modal → 1-click copy.
// Total flow under 5 seconds. Replaces the 6-7 click manual workflow.

import { captureScreenshot, downloadScreenshot, getScreenshots } from "../screenshot";
import { isPremium } from "../plan";
import { showUpgradeModal } from "./upgrade-modal";
import { getAllSessions } from "../storage";
import { getLastVideoRecording, downloadVideoRecording } from "../video-recorder";
import type { VideoRecording } from "../video-recorder";
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
 * Main entry: open the ticket-review modal.
 * - If the session already has screenshots (taken via toolbar during recording),
 *   show them all as a gallery — no fresh capture.
 * - Otherwise capture one screenshot fresh (preserves the Ctrl+Shift+B one-shot flow).
 * Downloads happen on export, never on capture.
 */
export async function showQuickBugCapture(root: HTMLElement): Promise<void> {
  if (_isOpen) return;

  // Grab current session for auto-fill
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const currentSession = sessions[0] || null;
  const lastEvent = currentSession?.events[currentSession.events.length - 1] || null;

  // Use the screenshots already collected for the active ticket; fall back to
  // capturing one fresh if the user opened the modal without having taken any.
  let screenshots: ScreenshotData[] = getScreenshots();
  if (screenshots.length === 0) {
    try {
      await captureScreenshot(lastEvent, { includeAnnotations: true });
      screenshots = getScreenshots();
    } catch (err) {
      console.warn("[TraceBug] Quick capture screenshot failed:", err);
    }
  }

  // Auto-fill title + description from session context
  const draft = _loadDraft();
  const autoTitle = currentSession ? generateBugTitle(currentSession) : `Bug on ${window.location.pathname}`;
  const autoDesc = _buildDescription(currentSession);

  _openModal(root, {
    title: draft?.title || autoTitle,
    description: draft?.description || autoDesc,
    screenshots,
  });
}

/** Download every screenshot in the ticket, one PNG per file. */
function _downloadAllScreenshots(screenshots: ScreenshotData[]): void {
  // Stagger slightly so the browser doesn't drop concurrent downloads.
  screenshots.forEach((ss, i) => {
    setTimeout(() => downloadScreenshot(ss.dataUrl, ss.filename), i * 120);
  });
}

/** Download the active screen recording (if any) so the dev can attach it. */
function _downloadVideoIfPresent(): void {
  const v = getLastVideoRecording();
  if (!v) return;
  downloadVideoRecording(v, _videoFilename(v));
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
  data: { title: string; description: string; screenshots: ScreenshotData[] }
): void {
  _isOpen = true;
  // Primary screenshot used for inline preview / fallback markdown reference.
  const primary: ScreenshotData | null = data.screenshots[0] || null;
  const screenshots = data.screenshots;

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

  const ssCount = screenshots.length;
  const ssCountLabel = ssCount === 0 ? "No screenshots" : `${ssCount} screenshot${ssCount === 1 ? "" : "s"} attached`;

  // Optional screen recording from this session (in-memory blob URL).
  const video = getLastVideoRecording();
  const videoBlock = video ? _buildVideoBlock(video) : "";

  modal.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <span style="font-size:22px">\u26A1</span>
      <div style="flex:1">
        <div style="font-size:18px;font-weight:700;color:var(--tb-text-primary, #fff)">Bug Ticket \u2014 Review &amp; Export</div>
        <div style="font-size:12px;color:var(--tb-text-muted, #888);margin-top:2px">${ssCountLabel} \u00B7 download/copy includes all screenshots</div>
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

    ${primary ? `
      <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Screenshots (${ssCount})</label>
      <div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);overflow:hidden;margin-bottom:6px;background:var(--tb-bg-primary, #0f0f1a)">
        <img id="tb-qb-primary-img" src="${primary.dataUrl}" alt="Bug screenshot" style="display:block;max-width:100%;max-height:240px;width:auto;margin:0 auto" />
      </div>
      <div id="tb-qb-primary-meta" style="font-size:10px;color:var(--tb-text-muted, #555);margin-bottom:${ssCount > 1 ? "6" : "16"}px">${escapeHtml(primary.filename)} \u00B7 ${primary.width}x${primary.height}</div>
      ${ssCount > 1 ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          ${screenshots.map((ss, i) => `
            <button data-thumb-index="${i}" title="${escapeHtml(ss.filename)}" style="position:relative;padding:0;border:1px solid var(--tb-border, #2a2a3e);border-radius:4px;overflow:hidden;cursor:pointer;background:var(--tb-bg-primary, #0f0f1a);width:64px;height:48px">
              <img src="${ss.dataUrl}" alt="Step ${i + 1}" style="width:100%;height:100%;object-fit:cover;display:block" />
              <span style="position:absolute;top:1px;left:2px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.8);background:rgba(0,0,0,0.5);border-radius:3px;padding:0 4px">${i + 1}</span>
            </button>
          `).join("")}
        </div>
      ` : ""}
    ` : `<div style="font-size:11px;color:var(--tb-text-muted, #666);margin-bottom:16px;padding:10px;background:var(--tb-bg-primary, #0f0f1a);border:1px dashed var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);text-align:center">No screenshots attached \u2014 take one from the toolbar to add to this ticket</div>`}

    ${videoBlock}

    ${_githubRepo ? `
      <button data-action="open-github" style="width:100%;background:#24292e;color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:14px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;margin-bottom:8px;transition:opacity 0.15s;display:flex;align-items:center;justify-content:center;gap:8px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        Open in GitHub (${escapeHtml(_githubRepo)})
      </button>
    ` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button data-action="github" style="background:var(--tb-accent, #7B61FF);color:#fff;border:none;border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">\uD83D\uDC19 Copy as GitHub Issue</button>
      <button data-action="jira" style="background:${isPremium() ? "#2684FF" : "var(--tb-bg-primary, #0f0f1a)"};color:${isPremium() ? "#fff" : "var(--tb-text-muted, #888)"};border:${isPremium() ? "none" : "1px solid var(--tb-border, #2a2a3e)"};border-radius:var(--tb-radius-md, 6px);padding:12px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:opacity 0.15s">${isPremium() ? "\uD83C\uDFAB Copy as Jira Ticket" : "\uD83D\uDD12 Jira Ticket (Premium)"}</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <button data-action="text" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s">\uD83D\uDCCB Copy as Plain Text</button>
      <button data-action="download" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);padding:10px;cursor:pointer;font-size:12px;font-family:inherit;transition:all 0.15s" ${ssCount > 0 ? "" : "disabled"}>\u2B07 Download ${ssCount > 1 ? `All ${ssCount} Screenshots` : "Screenshot"}</button>
    </div>

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--tb-border, #2a2a3e);display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--tb-text-muted, #555)">
      <span>Tip: <kbd style="background:var(--tb-bg-primary, #0f0f1a);padding:2px 6px;border-radius:3px;border:1px solid var(--tb-border, #2a2a3e);font-family:monospace">Ctrl+Shift+B</kbd> to quick-capture anytime</span>
      <span style="display:flex;align-items:center;gap:8px"><span>Draft auto-saved</span><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;${isPremium() ? "background:var(--tb-accent, #7B61FF);color:#fff" : "background:var(--tb-border, #2a2a3e);color:var(--tb-text-secondary, #aaa)"}">${isPremium() ? "✨ Premium" : "Free"}</span></span>
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
        const tail = screenshots.length ? ` \u00b7 ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"} downloading` : "";
        showToast(`\u2713 GitHub issue page opened${tail}`, root);
        if (screenshots.length) _downloadAllScreenshots(screenshots);
        _downloadVideoIfPresent();
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
    const markdown = _buildGitHubMarkdown(title, description, primary);
    const ok = await _copyToClipboard(markdown);
    const tail = ok && screenshots.length ? ` \u00b7 downloading ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}` : "";
    showToast(ok ? `\u2713 Copied as GitHub Issue${tail}` : "Copy failed", root);
    if (ok && screenshots.length) _downloadAllScreenshots(screenshots);
    if (ok) _downloadVideoIfPresent();
    _clearDraft();
    setTimeout(close, 300);
  });

  modal.querySelector('[data-action="jira"]')!.addEventListener("click", async () => {
    if (!isPremium()) {
      showUpgradeModal({
        feature: "Jira ticket export",
        message: "Generate Jira-formatted tickets with priority + labels in one click. Upgrade to unlock.",
      }, root);
      return;
    }
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
    const jiraTail = ok && screenshots.length ? ` \u00b7 downloading ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}` : "";
    showToast(ok ? `\u2713 Copied as Jira Ticket${jiraTail}` : "Copy failed", root);
    if (ok && screenshots.length) _downloadAllScreenshots(screenshots);
    if (ok) _downloadVideoIfPresent();
    _clearDraft();
    setTimeout(close, 300);
  });

  modal.querySelector('[data-action="text"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const plain = `${title}\n\n${description}`;
    const ok = await _copyToClipboard(plain);
    const textTail = ok && screenshots.length ? ` \u00b7 downloading ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}` : "";
    showToast(ok ? `\u2713 Copied as plain text${textTail}` : "Copy failed", root);
    if (ok && screenshots.length) _downloadAllScreenshots(screenshots);
    if (ok) _downloadVideoIfPresent();
    _clearDraft();
    setTimeout(close, 300);
  });

  const downloadBtn = modal.querySelector('[data-action="download"]') as HTMLButtonElement;
  if (downloadBtn && screenshots.length) {
    downloadBtn.addEventListener("click", () => {
      _downloadAllScreenshots(screenshots);
      showToast(`\u2713 Downloading ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}`, root);
    });
  }

  // Thumbnail strip: clicking a thumbnail swaps the primary preview.
  modal.querySelectorAll<HTMLButtonElement>("[data-thumb-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.thumbIndex);
      const target = screenshots[idx];
      if (!target) return;
      const img = modal.querySelector<HTMLImageElement>("#tb-qb-primary-img");
      const meta = modal.querySelector<HTMLDivElement>("#tb-qb-primary-meta");
      if (img) img.src = target.dataUrl;
      if (meta) meta.textContent = `${target.filename} \u00b7 ${target.width}x${target.height}`;
    });
  });

  // Video controls: download button + jump-to-comment chips.
  const videoEl = modal.querySelector<HTMLVideoElement>("#tb-qb-video");
  const videoDownloadBtn = modal.querySelector<HTMLButtonElement>('[data-action="download-video"]');
  if (videoDownloadBtn && video) {
    videoDownloadBtn.addEventListener("click", () => {
      downloadVideoRecording(video, _videoFilename(video));
      showToast("\u2713 Downloading recording", root);
    });
  }
  if (videoEl) {
    modal.querySelectorAll<HTMLButtonElement>("[data-video-seek]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const seconds = Number(btn.dataset.videoSeek);
        if (!Number.isFinite(seconds)) return;
        videoEl.currentTime = seconds;
        videoEl.play().catch(() => {});
      });
    });
  }
}

// \u2500\u2500 Video block \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function _formatVideoTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function _formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function _videoFilename(video: VideoRecording): string {
  const ext = video.mimeType.includes("mp4") ? "mp4" : "webm";
  const stamp = new Date(video.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-recording-${stamp}.${ext}`;
}

function _buildVideoBlock(video: VideoRecording): string {
  const duration = _formatVideoTime(video.durationMs);
  const size = _formatBytes(video.sizeBytes);
  const commentCount = video.comments.length;
  const commentLabel = commentCount === 0
    ? "No timestamped comments"
    : `${commentCount} timestamped comment${commentCount === 1 ? "" : "s"}`;

  const commentsList = commentCount > 0
    ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:120px;overflow-y:auto;padding-right:4px">
        ${video.comments.map((c) => {
          const seconds = Math.floor(c.offsetMs / 1000);
          return `<button data-video-seek="${seconds}" style="display:flex;align-items:flex-start;gap:8px;background:var(--tb-bg-primary, #0f0f1a);border:1px solid var(--tb-border, #2a2a3e);border-radius:6px;padding:6px 8px;color:var(--tb-text-primary, #e0e0e0);font-family:inherit;font-size:11px;text-align:left;cursor:pointer;line-height:1.4">
            <span style="font-variant-numeric:tabular-nums;font-weight:600;color:var(--tb-accent, #7B61FF);min-width:38px">${_formatVideoTime(c.offsetMs)}</span>
            <span style="flex:1">${escapeHtml(c.text)}</span>
          </button>`;
        }).join("")}
      </div>`
    : "";

  return `
    <label style="font-size:11px;color:var(--tb-text-muted, #888);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Screen Recording</label>
    <div style="border:1px solid var(--tb-border, #2a2a3e);border-radius:var(--tb-radius-md, 6px);overflow:hidden;margin-bottom:6px;background:var(--tb-bg-primary, #0f0f1a)">
      <video id="tb-qb-video" controls preload="metadata" src="${video.url}" style="display:block;width:100%;max-height:280px;background:#000"></video>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:var(--tb-text-muted, #555);margin-bottom:8px">
      <span>${duration} \u00b7 ${size} \u00b7 ${commentLabel}</span>
      <button data-action="download-video" style="background:transparent;color:var(--tb-text-primary, #e0e0e0);border:1px solid var(--tb-border, #2a2a3e);border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit">\u2b07 Download .${video.mimeType.includes("mp4") ? "mp4" : "webm"}</button>
    </div>
    ${commentsList}
    <div style="height:14px"></div>
  `;
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
