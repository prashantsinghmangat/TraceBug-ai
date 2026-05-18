// ── Quick Bug Capture ─────────────────────────────────────────────────────
// Zero-friction bug reporting: 1 keystroke → screenshot → auto-filled modal → 1-click copy.
// Total flow under 5 seconds. Replaces the 6-7 click manual workflow.

import { captureScreenshot, downloadScreenshot, getScreenshots } from "../screenshot";
import { isPremium } from "../plan";
import { showUpgradeModal } from "./upgrade-modal";
import { getAllSessions } from "../storage";
import { getLastVideoRecording, downloadVideoRecording, restoreLastRecordingFromOffscreen } from "../video-recorder";
import type { VideoRecording } from "../video-recorder";
import { buildReport, formatRootCauseLine, severityBadge } from "../report-builder";
import { generateGitHubIssue, openGitHubIssue } from "../github-issue";
import { generateJiraTicket } from "../jira-issue";
import { generateBugTitle, generateFlowSummary } from "../title-generator";
import { captureEnvironment } from "../environment";
import { ScreenshotData, StoredSession } from "../types";
import { showToast } from "./toast";
import { escapeHtml } from "./helpers";
import { mountReplayScrubber } from "./replay-scrubber";
import { exportSessionAsHtml } from "../exporters/html-replay";
import { shareSessionAsLink, DEFAULT_CLOUD_ENDPOINT, MAX_SCREENSHOTS_PER_SHARE } from "../exporters/share-link";
import { getBridge } from "../auth/iframe-bridge";
import { showScreenshotTrimModal } from "./screenshot-trim-modal";
import { injectTheme, getResolvedTheme, type ThemeMode } from "../theme";
import { getElementAnnotations, getDrawRegions } from "../annotation-store";
import { openLinearIssue } from "../linear-issue";
import { generateSlackPost } from "../slack-export";

// Caller can set this from the SDK init so the modal knows which repo to target
let _githubRepo: string | null = null;
export function setGithubRepo(repo: string | null): void { _githubRepo = repo; }

// Cloud endpoint for the Share link flow. Defaults to production; can be
// overridden at init time via TraceBug.init({ cloudEndpoint: ... }).
let _cloudEndpoint: string = DEFAULT_CLOUD_ENDPOINT;
export function setCloudEndpoint(endpoint: string | null | undefined): void {
  _cloudEndpoint = (endpoint && endpoint.trim()) || DEFAULT_CLOUD_ENDPOINT;
}

const MODAL_ID = "tracebug-quick-bug-modal";
const DRAFT_KEY = "tracebug_last_bug_draft";
const THEME_PREF_KEY = "tracebug_theme_pref";

// ── Theme toggle helpers ───────────────────────────────────────────────────
// Cycles light → dark → auto. The choice persists across sessions in
// localStorage so the user doesn't have to re-pick on every page load.

function _loadThemePref(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_PREF_KEY);
    if (v === "light" || v === "dark" || v === "auto") return v;
  } catch {}
  return "auto";
}

function _saveThemePref(mode: ThemeMode): void {
  try { localStorage.setItem(THEME_PREF_KEY, mode); } catch {}
}

function _themeIcon(): string {
  // Sun = light, moon = dark, half-moon = auto (adapts to system).
  const pref = _loadThemePref();
  if (pref === "auto") return "🌗";
  return pref === "dark" ? "🌙" : "☀";
}

function _cycleTheme(): ThemeMode {
  const current = _loadThemePref();
  const next: ThemeMode = current === "auto" ? "light" : current === "light" ? "dark" : "auto";
  _saveThemePref(next);
  injectTheme(next);
  return next;
}

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
 *
 * `prefilledTitle` / `prefilledDescription` override the auto-fill. Used by
 * the auto-scanner's "File ticket" action so the modal lands on the issue's
 * details instead of generic session data.
 */
export async function showQuickBugCapture(
  root: HTMLElement,
  options?: { prefilledTitle?: string; prefilledDescription?: string; sessionId?: string }
): Promise<void> {
  if (_isOpen) return;

  // Recovery path: if the page-side _lastRecording is null (lost to a page
  // reload between Stop and modal mount), pull the last-finalized recording
  // from the offscreen document. Static import so the bundler always
  // includes the recovery code — earlier dynamic imports sometimes resolved
  // to a separate chunk that wasn't loaded in time.
  try {
    if (!getLastVideoRecording()) {
      await restoreLastRecordingFromOffscreen();
    }
  } catch {}

  // Grab session for auto-fill. If a specific sessionId is requested (e.g. user
  // clicked "View ticket" on an older session), pick that one; otherwise fall
  // back to the most recently updated session.
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const currentSession = options?.sessionId
    ? (sessions.find(s => s.sessionId === options.sessionId) || sessions[0] || null)
    : (sessions[0] || null);
  const lastEvent = currentSession?.events[currentSession.events.length - 1] || null;

  // Use the screenshots already collected for the active ticket; fall back to
  // capturing one fresh if the user opened the modal without having taken any.
  let screenshots: ScreenshotData[] = getScreenshots();
  if (screenshots.length === 0) {
    try {
      // Smart-screenshot: highlight the clicked element so the dev sees the
      // exact button/element that triggered the bug.
      await captureScreenshot(lastEvent, { includeAnnotations: true, highlightClicked: true });
      screenshots = getScreenshots();
    } catch (err) {
      console.warn("[TraceBug] Quick capture screenshot failed:", err);
    }
  }

  // Auto-fill title + description from session context
  const draft = _loadDraft();
  const autoTitle = currentSession ? generateBugTitle(currentSession) : `Bug on ${window.location.pathname}`;
  const autoDesc = _buildDescription(currentSession);

  // Caller-provided values (e.g. from the auto-scanner) override the draft.
  // If the caller prefilled, ignore the saved draft so a stale draft doesn't
  // overwrite the issue context.
  const title = options?.prefilledTitle ?? (draft?.title || autoTitle);
  const description = options?.prefilledDescription ?? (draft?.description || autoDesc);

  // Build the full report once so every tab (Info/Console/Network/Actions/AI)
  // can read from it without re-running buildReport per tab.
  let report: import("../types").BugReport | null = null;
  if (currentSession) {
    try { report = buildReport(currentSession); } catch {}
  }
  const severity: import("../types").BugSeverity = report?.severity ?? "low";
  const timeline: import("../types").TimelineEntry[] = report?.timeline ?? [];

  _openModal(root, { title, description, screenshots, severity, timeline, currentSession, report });
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
  data: {
    title: string;
    description: string;
    screenshots: ScreenshotData[];
    severity: import("../types").BugSeverity;
    timeline: import("../types").TimelineEntry[];
    currentSession: StoredSession | null;
    report: import("../types").BugReport | null;
  }
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
    width: 100%; max-width: 1180px; max-height: 92vh;
    display: flex; flex-direction: column;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: tracebug-qb-slide-up 0.2s ease;
    overflow: hidden;
  `;

  const ssCount = screenshots.length;
  const ssCountLabel = ssCount === 0 ? "No screenshots" : `${ssCount} screenshot${ssCount === 1 ? "" : "s"} attached`;

  // Optional screen recording from this session (in-memory blob URL).
  // Now rendered inline as the primary preview when present; the old
  // `_buildVideoBlock` helper is dead but kept for reference.
  const video = getLastVideoRecording();

  // Severity badge \u2014 colors match SEVERITY_COLORS in issues-panel.
  const sevColors: Record<string, { bg: string; fg: string; border: string }> = {
    critical: { bg: "#7f1d1d", fg: "#fee2e2", border: "#dc2626" },
    high: { bg: "#7c2d12", fg: "#fed7aa", border: "#ea580c" },
    medium: { bg: "#713f12", fg: "#fde68a", border: "#ca8a04" },
    low: { bg: "#14532d", fg: "#bbf7d0", border: "#16a34a" },
  };
  const sevC = sevColors[data.severity] || sevColors.low;
  const sevLabel = severityBadge(data.severity); // e.g. "\uD83D\uDD34 Critical"

  // Tab badge counts
  const consoleCount = data.report?.consoleErrors?.length ?? 0;
  const networkCount = (data.report?.networkRequests?.length ?? data.report?.networkErrors?.length) ?? 0;
  const actionsCount = data.report?.sessionSteps?.length ?? 0;
  const annotationsCount =
    (data.currentSession?.annotations?.length ?? 0) +
    _getElementAnnotationCount();

  modal.innerHTML = `
    <!-- Header -->
    <div class="tb-qb-header">
      <span class="tb-qb-logo">\u26A1</span>
      <div class="tb-qb-titleblock">
        <div class="tb-qb-titletext">Bug Ticket \u2014 Review &amp; Export</div>
        <div class="tb-qb-sub">${ssCountLabel} \u00B7 ${data.timeline.length} event${data.timeline.length === 1 ? "" : "s"}</div>
      </div>
      <span class="tb-qb-sev" style="background:${sevC.bg};color:${sevC.fg};border:1px solid ${sevC.border}">${sevLabel}</span>
      <button data-action="theme-toggle" class="tb-qb-theme-toggle" aria-label="Toggle theme" title="Toggle theme (light / dark / auto)">${_themeIcon()}</button>
      <button data-action="help-toggle" class="tb-qb-theme-toggle" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button>
      <button data-action="close" class="tb-qb-close" aria-label="Close">\u2715</button>
    </div>

    <!-- Two-pane body -->
    <div class="tb-qb-body">

      <!-- LEFT: title + replay preview + scrubber + thumbs + description -->
      <div class="tb-qb-left">

        <label class="tb-qb-lbl">Title</label>
        <input id="tb-qb-title" type="text" value="${escapeHtml(data.title)}" class="tb-qb-input" />

        ${video ? `
          <div class="tb-qb-preview">
            <video id="tb-qb-video" controls preload="metadata" src="${video.url}" class="tb-qb-video"></video>
          </div>
          <div class="tb-qb-vidmeta">
            <span>${_formatVideoTime(video.durationMs)} · ${_formatBytes(video.sizeBytes)} · ${video.comments.length} timestamped comment${video.comments.length === 1 ? "" : "s"}</span>
            <button data-action="download-video" class="tb-qb-btn-dl" title="Download recording — drag into Jira / GitHub / Slack to attach">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M5 13l7 7 7-7M4 21h16"/></svg>
              Download .${video.mimeType.includes("mp4") ? "mp4" : "webm"}
            </button>
          </div>
        ` : ""}

        ${!video && primary ? `
          <div class="tb-qb-preview">
            <img id="tb-qb-primary-img" src="${primary.dataUrl}" alt="Bug screenshot" class="tb-qb-img" />
          </div>
          <div id="tb-qb-primary-meta" class="tb-qb-imgmeta">${escapeHtml(primary.filename)} \u00B7 ${primary.width}x${primary.height}</div>
        ` : !video && !primary ? `
          <div class="tb-qb-preview tb-qb-preview-empty">No screenshots attached \u2014 take one from the toolbar to add to this ticket</div>
        ` : ""}

        ${data.timeline.length > 0 ? `
          <div id="tb-qb-scrubber" class="tb-qb-scrubber-wrap"></div>
        ` : ""}

        ${ssCount > 1 ? `
          <div class="tb-qb-thumbs">
            ${screenshots.map((ss, i) => `
              <button data-thumb-index="${i}" title="${escapeHtml(ss.filename)}" class="tb-qb-thumb">
                <img src="${ss.dataUrl}" alt="Step ${i + 1}" />
                <span class="tb-qb-thumb-num">${i + 1}</span>
              </button>
            `).join("")}
          </div>
        ` : ""}

        ${video && video.comments.length > 0 ? `
          <div class="tb-qb-comments">
            ${video.comments.map((c) => {
              const seconds = Math.floor(c.offsetMs / 1000);
              return `<button data-video-seek="${seconds}" class="tb-qb-comment">
                <span class="tb-qb-comment-ts">${_formatVideoTime(c.offsetMs)}</span>
                <span class="tb-qb-comment-tx">${escapeHtml(c.text)}</span>
              </button>`;
            }).join("")}
          </div>
        ` : ""}

        <details class="tb-qb-desc-wrap">
          <summary class="tb-qb-desc-summary">Description — editable, included in exports</summary>
          <textarea id="tb-qb-desc" class="tb-qb-textarea">${escapeHtml(data.description)}</textarea>
        </details>
      </div>

      <!-- RIGHT: tab strip + tab panels -->
      <div class="tb-qb-right">
        <div class="tb-qb-tabstrip" role="tablist">
          <button data-tab="info" class="tb-qb-tab tb-qb-tab-active" role="tab">Info</button>
          <button data-tab="console" class="tb-qb-tab" role="tab">Console${consoleCount ? `<span class="tb-qb-tab-badge">${consoleCount}</span><span class="tb-qb-tab-dot"></span>` : ""}</button>
          <button data-tab="network" class="tb-qb-tab" role="tab">Network${networkCount ? `<span class="tb-qb-tab-badge">${networkCount}</span><span class="tb-qb-tab-dot"></span>` : ""}</button>
          <button data-tab="actions" class="tb-qb-tab" role="tab">Actions${actionsCount ? `<span class="tb-qb-tab-badge">${actionsCount}</span>` : ""}</button>
          <button data-tab="ai" class="tb-qb-tab" role="tab">AI</button>
          <button data-tab="annotations" class="tb-qb-tab" role="tab">Notes${annotationsCount ? `<span class="tb-qb-tab-badge">${annotationsCount}</span>` : ""}</button>
        </div>
        <div class="tb-qb-tabpanels">
          <div data-panel="info" class="tb-qb-panel tb-qb-panel-active">${_buildInfoTab(data.report, data.currentSession)}</div>
          <div data-panel="console" class="tb-qb-panel" hidden>${_buildConsoleTab(data.report)}</div>
          <div data-panel="network" class="tb-qb-panel" hidden>${_buildNetworkTab(data.report)}</div>
          <div data-panel="actions" class="tb-qb-panel" hidden>${_buildActionsTab(data.report)}</div>
          <div data-panel="ai" class="tb-qb-panel" hidden>${_buildAITab(data.report)}</div>
          <div data-panel="annotations" class="tb-qb-panel" hidden>${_buildAnnotationsTab(data.currentSession)}</div>
        </div>
      </div>
    </div>

    <!-- Footer: export actions -->
    <div class="tb-qb-footer">
      <div class="tb-qb-actions">
        ${_githubRepo ? `
          <button data-action="open-github" class="tb-qb-btn tb-qb-btn-gh-primary" title="Open GitHub new-issue page with title + body prefilled">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Open in GitHub (${escapeHtml(_githubRepo)})
          </button>
        ` : ""}
        <button data-action="github" class="tb-qb-btn tb-qb-btn-accent">\uD83D\uDC19 GitHub</button>
        <button data-action="linear" class="tb-qb-btn tb-qb-btn-linear" title="Open Linear new-issue page with prefilled title + description">\u25B3 Linear</button>
        <button data-action="slack" class="tb-qb-btn tb-qb-btn-slack" title="Copy a Slack-formatted bug summary to the clipboard">\uD83D\uDCAC Slack</button>
        <button data-action="jira" class="tb-qb-btn ${isPremium() ? "tb-qb-btn-jira" : "tb-qb-btn-locked"}">${isPremium() ? "\uD83C\uDFAB Jira" : "\uD83D\uDD12 Jira (Premium)"}</button>
        <button data-action="export-replay" class="tb-qb-btn tb-qb-btn-ghost" title="Bundle the entire session into a single .html file you can share or open offline">\uD83D\uDCE6 Export .html</button>
        <button data-action="share-link" class="tb-qb-btn tb-qb-btn-accent" title="Upload to TraceBug cloud and copy a shareable URL (sign-in required)">\uD83D\uDD17 Share link</button>
      </div>
      <div class="tb-qb-tip">
        <span>Tip: <kbd>Ctrl+Shift+B</kbd> to quick-capture anytime</span>
        <span class="tb-qb-tip-right"><span>Draft auto-saved</span><span class="${isPremium() ? "tb-qb-plan-premium" : "tb-qb-plan-free"}">${isPremium() ? "✨ Premium" : "Free"}</span></span>
      </div>
    </div>

    <!-- Help overlay (keyboard cheat sheet) -->
    <div class="tb-qb-help" id="tb-qb-help" style="display:none">
      <div class="tb-qb-help-card">
        <div class="tb-qb-help-title">Keyboard shortcuts</div>
        <div class="tb-qb-help-row"><kbd>Space</kbd><span>Play / pause replay</span></div>
        <div class="tb-qb-help-row"><kbd>←</kbd> <kbd>→</kbd><span>Step previous / next event</span></div>
        <div class="tb-qb-help-row"><kbd>↑</kbd> <kbd>↓</kbd><span>Jump previous / next error</span></div>
        <div class="tb-qb-help-row"><kbd>1</kbd>–<kbd>6</kbd><span>Switch tabs</span></div>
        <div class="tb-qb-help-row"><kbd>T</kbd><span>Cycle theme</span></div>
        <div class="tb-qb-help-row"><kbd>?</kbd> <kbd>Esc</kbd><span>Toggle / close help</span></div>
        <button class="tb-qb-help-close" data-action="help-close">Close</button>
      </div>
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

  // ── Mount replay scrubber ──────────────────────────────────────────
  // Drives the screenshot preview swap and (if present) the video seek.
  // The Console feed also subscribes to onSeek for live highlight + scroll,
  // and emits seek calls back when the user clicks a Console row.
  const scrubberHost = modal.querySelector<HTMLElement>("#tb-qb-scrubber");
  let _scrubberCtl: { seek: (ts: number) => void; destroy: () => void } | null = null;
  if (scrubberHost && data.timeline.length > 0) {
    const ssForScrub = data.screenshots.map(s => ({ timestamp: s.timestamp, dataUrl: s.dataUrl }));
    const videoEl = modal.querySelector<HTMLVideoElement>("video");
    if (videoEl && video) {
      videoEl.dataset.tbStartTs = String(video.startedAt);
    }
    _scrubberCtl = mountReplayScrubber(scrubberHost, {
      timeline: data.timeline,
      screenshots: ssForScrub,
      videoEl,
      onSeek: (ts) => {
        // Swap primary screenshot to whichever is closest to the scrubber.
        const img = modal.querySelector<HTMLImageElement>("#tb-qb-primary-img");
        const meta = modal.querySelector<HTMLDivElement>("#tb-qb-primary-meta");
        if (img && data.screenshots.length > 0) {
          let best = data.screenshots[0];
          let bestDelta = Math.abs(best.timestamp - ts);
          for (const s of data.screenshots) {
            const d = Math.abs(s.timestamp - ts);
            if (d < bestDelta) { best = s; bestDelta = d; }
          }
          img.src = best.dataUrl;
          if (meta) meta.textContent = `${best.filename} · ${best.width}x${best.height}`;
        }
        // Highlight + scroll the matching Console feed row.
        _syncConsoleFeedToTimestamp(modal, ts);
      },
    });
  }

  // Console feed click → scrubber.seek (lets devs jump straight from a
  // suspicious log line to that moment in the video).
  const conPanelForClicks = modal.querySelector<HTMLElement>('[data-panel="console"]');
  conPanelForClicks?.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(".tb-qb-feed-row");
    if (!row || !_scrubberCtl) return;
    const ts = Number(row.dataset.ts);
    if (!Number.isFinite(ts)) return;
    _scrubberCtl.seek(ts);
  });

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
    const k = (overlay as any).__tbModalKey;
    if (k) document.removeEventListener("keydown", k);
  };

  modal.querySelector('[data-action="close"]')!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // Theme toggle: cycle light → dark → auto and refresh the icon.
  modal.querySelector('[data-action="theme-toggle"]')?.addEventListener("click", () => {
    _cycleTheme();
    const btn = modal.querySelector<HTMLButtonElement>('[data-action="theme-toggle"]');
    if (btn) btn.innerHTML = _themeIcon();
  });

  // ── Help overlay + global keyboard shortcuts ─────────────────────────
  const helpEl = modal.querySelector<HTMLElement>("#tb-qb-help");
  const toggleHelp = (force?: boolean) => {
    if (!helpEl) return;
    const open = force !== undefined ? force : helpEl.style.display === "none";
    helpEl.style.display = open ? "flex" : "none";
  };
  modal.querySelector('[data-action="help-toggle"]')?.addEventListener("click", () => toggleHelp());
  modal.querySelector('[data-action="help-close"]')?.addEventListener("click", () => toggleHelp(false));
  helpEl?.addEventListener("click", (e) => {
    if (e.target === helpEl) toggleHelp(false);
  });

  const isTypingTarget = (t: EventTarget | null): boolean => {
    if (!t || !(t as HTMLElement).tagName) return false;
    const tag = (t as HTMLElement).tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || (t as HTMLElement).isContentEditable;
  };
  const switchTab = (which: string) => {
    const btn = modal.querySelector<HTMLButtonElement>(`[data-tab="${which}"]`);
    if (btn) btn.click();
  };
  const TAB_ORDER = ["info", "console", "network", "actions", "ai", "annotations"];
  const modalKeyHandler = (e: KeyboardEvent) => {
    // Help open: only Esc / ? close it.
    if (helpEl && helpEl.style.display !== "none") {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); toggleHelp(false); }
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); toggleHelp(true); return; }
    if (e.key === "t" || e.key === "T") {
      e.preventDefault();
      _cycleTheme();
      const btn = modal.querySelector<HTMLButtonElement>('[data-action="theme-toggle"]');
      if (btn) btn.innerHTML = _themeIcon();
      return;
    }
    const n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= TAB_ORDER.length) {
      e.preventDefault();
      switchTab(TAB_ORDER[n - 1]);
      return;
    }
    // Space / ←→ / ↑↓ are claimed by the scrubber when it has focus.
    // If the scrubber doesn't have focus we forward by simulating a focus.
    if (e.key === " " || e.code === "Space" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      const scrubberRoot = modal.querySelector<HTMLElement>(".tb-rs-root");
      if (scrubberRoot && document.activeElement !== scrubberRoot) {
        scrubberRoot.focus();
        // Re-dispatch the same key to the scrubber.
        const cloned = new KeyboardEvent("keydown", { key: e.key, code: e.code, bubbles: true });
        scrubberRoot.dispatchEvent(cloned);
        e.preventDefault();
      }
    }
  };
  document.addEventListener("keydown", modalKeyHandler);
  // Detach when modal closes — added to the existing close path below.
  (overlay as any).__tbModalKey = modalKeyHandler;

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

  // Plain Text + Download Screenshots buttons were cut from v1 \u2014 devs paste
  // GitHub markdown anywhere; explicit screenshot downloads happen as part
  // of the GitHub/Jira export flow.

  // Export Replay (.html) \u2014 bundles the entire session into a single
  // self-contained HTML file. Recipient opens offline \u2192 full interactive replay.
  modal.querySelector('[data-action="export-replay"]')?.addEventListener("click", async () => {
    if (!data.currentSession) {
      showToast("No session to export yet", root);
      return;
    }
    showToast("Bundling replay\u2026", root);
    try {
      // Pull the latest recording from the offscreen one more time right
      // before export. _lastRecording may have been null when the modal
      // first opened (recovery raced the modal mount). Without this, the
      // export silently drops the video.
      try { await restoreLastRecordingFromOffscreen(); } catch {}
      const report = buildReport(data.currentSession);
      const result = await exportSessionAsHtml(data.currentSession, report);
      const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      showToast(`\u2713 Replay exported \u00b7 ${sizeMb} MB`, root);
    } catch (err) {
      console.warn("[TraceBug] HTML replay export failed:", err);
      showToast("Replay export failed", root);
    }
  });

  // Share link \u2014 upload to cloud + copy URL + open viewer in new tab.
  // Prompts magic-link sign-in via hidden iframe bridge when needed.
  // Local capture is unaffected.
  const shareBtn = modal.querySelector<HTMLButtonElement>('[data-action="share-link"]');
  shareBtn?.addEventListener("click", async () => {
    if (!data.currentSession) {
      showToast("No session to share yet", root);
      return;
    }
    if (shareBtn?.dataset.busy === "1") return; // ignore double-clicks

    // Inline spinner + label swap so the user sees progress on the button
    // itself, not just the bottom toast which can be missed.
    const originalHtml = shareBtn ? shareBtn.innerHTML : "";
    const setBtnState = (label: string) => {
      if (!shareBtn) return;
      shareBtn.dataset.busy = "1";
      shareBtn.disabled = true;
      shareBtn.style.opacity = "0.85";
      shareBtn.innerHTML =
        '<span class="tb-qb-spin" style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:tb-qb-spin 0.7s linear infinite;margin-right:6px;vertical-align:-2px"></span>' +
        label;
    };
    const resetBtn = () => {
      if (!shareBtn) return;
      shareBtn.dataset.busy = "";
      shareBtn.disabled = false;
      shareBtn.style.opacity = "";
      shareBtn.innerHTML = originalHtml;
    };
    // One-time keyframes injection.
    if (!document.getElementById("tb-qb-spin-style")) {
      const s = document.createElement("style");
      s.id = "tb-qb-spin-style";
      s.textContent = "@keyframes tb-qb-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }

    try {
      try { await restoreLastRecordingFromOffscreen(); } catch {}

      const bridge = getBridge(_cloudEndpoint);
      const auth = await bridge.checkAuth();
      if (!auth.authed) {
        setBtnState("Signing in\u2026");
        showToast("Opening sign-in window\u2026", root);
        await bridge.signIn();
      }

      // Step 1: bundle locally
      setBtnState("Bundling\u2026");
      showToast("Bundling report\u2026", root);
      const report = buildReport(data.currentSession);

      // Step 1b: if too many screenshots, let the user pick which to keep.
      // Pause the busy state while they decide so the spinner doesn't
      // look frozen during what could be tens of seconds of deliberation.
      if (report.screenshots && report.screenshots.length > MAX_SCREENSHOTS_PER_SHARE) {
        resetBtn();
        const chosenIds = await showScreenshotTrimModal(report.screenshots, MAX_SCREENSHOTS_PER_SHARE, root);
        if (!chosenIds) {
          showToast("Share cancelled", root);
          return;
        }
        const chosenSet = new Set(chosenIds);
        report.screenshots = report.screenshots.filter((s) => chosenSet.has(s.id));
        setBtnState("Uploading\u2026");
      }

      // Step 2: hand off to share flow (sanitize + uploadInit + PUT + complete)
      setBtnState("Uploading\u2026");
      showToast("Uploading to cloud\u2026", root);
      const result = await shareSessionAsLink(
        data.currentSession,
        report,
        { cloudEndpoint: _cloudEndpoint },
      );

      // Step 3: copy + open in new tab
      try { await navigator.clipboard.writeText(result.shareUrl); } catch {}
      const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      showToast(`\u2713 Link copied \u00b7 ${sizeMb} MB \u00b7 Opening\u2026`, root);
      resetBtn();
      try { window.open(result.shareUrl, "_blank", "noopener,noreferrer"); } catch {}
      return;
    } catch (err: any) {
      resetBtn();
      const code = err?.code || err?.message || "share_failed";
      console.warn("[TraceBug] Share failed:", err);
      if (code === "too_many_screenshots") {
        showToast(`Too many screenshots (max ${err.limit}). Remove some and try again.`, root);
      } else if (code === "video_too_long") {
        showToast(`Video too long (max ${err.limitS}s). Re-record shorter.`, root);
      } else if (code === "size_too_large") {
        showToast(`Report too large (${(err.sizeBytes / 1024 / 1024).toFixed(1)} MB). Limit is 50 MB.`, root);
      } else if (String(err?.body?.error || "").includes("quota_reached")) {
        showToast("Quota reached. Delete an old share in your dashboard.", root);
      } else {
        showToast(`Share failed: ${err?.message || code}`, root);
      }
    }
  });

  // Tab switching — show one panel at a time. role=tabpanel via [hidden].
  const tabButtons = modal.querySelectorAll<HTMLButtonElement>("[data-tab]");
  const tabPanels = modal.querySelectorAll<HTMLElement>("[data-panel]");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.tab!;
      tabButtons.forEach((b) => b.classList.toggle("tb-qb-tab-active", b === btn));
      tabPanels.forEach((p) => {
        const active = p.dataset.panel === which;
        p.classList.toggle("tb-qb-panel-active", active);
        if (active) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
      });
      // Clear the new-content dot once a tab is opened.
      btn.querySelector(".tb-qb-tab-dot")?.remove();
    });
  });

  // ── Network tab filters ───────────────────────────────────────────────
  const netPanel = modal.querySelector<HTMLElement>('[data-panel="network"]');
  if (netPanel) {
    const searchEl = netPanel.querySelector<HTMLInputElement>("#tb-qb-net-search");
    const errorsOnlyEl = netPanel.querySelector<HTMLInputElement>("#tb-qb-net-errors-only");
    const pills = netPanel.querySelectorAll<HTMLButtonElement>(".tb-qb-net-pill");
    let activeType = "all";
    const applyNetFilter = () => {
      const q = (searchEl?.value || "").trim().toLowerCase();
      const errOnly = !!errorsOnlyEl?.checked;
      netPanel.querySelectorAll<HTMLElement>(".tb-qb-net-row").forEach((row) => {
        if (row.classList.contains("tb-qb-net-head")) return; // header always visible
        const t = row.dataset.type || "";
        const isErr = row.dataset.err === "1";
        const hay = row.dataset.search || "";
        const typeMatch = activeType === "all" || t === activeType;
        const errMatch = !errOnly || isErr;
        const searchMatch = q.length === 0 || hay.indexOf(q) !== -1;
        const show = typeMatch && errMatch && searchMatch;
        (row as HTMLElement).style.display = show ? "" : "none";
      });
    };
    searchEl?.addEventListener("input", applyNetFilter);
    errorsOnlyEl?.addEventListener("change", applyNetFilter);
    pills.forEach((p) => {
      p.addEventListener("click", () => {
        activeType = p.dataset.type || "all";
        pills.forEach((q) => q.classList.toggle("tb-qb-net-pill-active", q === p));
        applyNetFilter();
      });
    });
  }

  // ── Console tab filters (unified feed) ────────────────────────────────
  const conPanel = modal.querySelector<HTMLElement>('[data-panel="console"]');
  if (conPanel) {
    const conSearch = conPanel.querySelector<HTMLInputElement>("#tb-qb-con-search");
    const conErrOnly = conPanel.querySelector<HTMLInputElement>("#tb-qb-con-errors-only");
    const pills = conPanel.querySelectorAll<HTMLButtonElement>(".tb-qb-feed-pill");
    let activeCat = "all";
    const applyFeedFilter = () => {
      const q = (conSearch?.value || "").trim().toLowerCase();
      const errOnly = !!conErrOnly?.checked;
      conPanel.querySelectorAll<HTMLElement>(".tb-qb-feed-row").forEach((row) => {
        const cat = row.dataset.cat || "";
        const hay = row.dataset.search || "";
        const isErr = row.dataset.err === "1";
        const catMatch = activeCat === "all" || cat === activeCat;
        const searchMatch = q.length === 0 || hay.indexOf(q) !== -1;
        const errMatch = !errOnly || isErr;
        row.style.display = (catMatch && searchMatch && errMatch) ? "" : "none";
      });
    };
    conSearch?.addEventListener("input", applyFeedFilter);
    conErrOnly?.addEventListener("change", applyFeedFilter);
    pills.forEach((p) => {
      p.addEventListener("click", () => {
        activeCat = p.dataset.cat || "all";
        pills.forEach((q) => q.classList.toggle("tb-qb-feed-pill-active", q === p));
        applyFeedFilter();
      });
    });
  }

  // Linear — open prefilled new-issue URL in a new tab (no API key needed).
  modal.querySelector('[data-action="linear"]')!.addEventListener("click", () => {
    const { title, description } = getDraft();
    const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
    const session = sessions[0];
    const r = session ? buildReport(session) : null;
    if (!r) { showToast("No session data yet", root); return; }
    r.title = title;
    const ok = openLinearIssue({ ...r, steps: `${description}\n\n---\n\n${r.steps}` });
    if (ok) {
      const tail = screenshots.length ? ` \u00b7 ${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"} downloading` : "";
      showToast(`\u2713 Linear new-issue page opened${tail}`, root);
      if (screenshots.length) _downloadAllScreenshots(screenshots);
      _downloadVideoIfPresent();
      _clearDraft();
      setTimeout(close, 300);
    } else {
      showToast("Failed to open Linear", root);
    }
  });

  // Slack — copy Slack-formatted bug summary to clipboard.
  modal.querySelector('[data-action="slack"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
    const session = sessions[0];
    const r = session ? buildReport(session) : null;
    if (!r) { showToast("No session data yet", root); return; }
    r.title = title;
    const text = generateSlackPost(r, description);
    const ok = await _copyToClipboard(text);
    showToast(ok ? "\u2713 Slack-formatted summary copied" : "Copy failed", root);
    if (ok && screenshots.length) _downloadAllScreenshots(screenshots);
    _clearDraft();
    setTimeout(close, 300);
  });

  // AI tab — wire the Configure button + Generate button if present.
  modal.querySelector('[data-action="ai-configure"]')?.addEventListener("click", () => {
    showToast("AI configuration UI coming soon \u2014 set tracebug_ai_key in localStorage to enable", root);
  });

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

// \u2500\u2500 Tab content builders \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// One function per tab. Each receives whatever subset of report/session it
// needs and returns HTML for the right-pane panel.

function _getElementAnnotationCount(): number {
  try { return getElementAnnotations().length + getDrawRegions().length; } catch { return 0; }
}

function _kvRow(label: string, value: string, icon?: string): string {
  const iconHtml = icon ? `<span class="tb-qb-kv-icon">${icon}</span>` : "";
  return `<div class="tb-qb-kv"><span class="tb-qb-kv-k">${escapeHtml(label)}</span><span class="tb-qb-kv-v">${iconHtml}${escapeHtml(value)}</span></div>`;
}

// Map browser/OS names to recognizable glyphs. Emoji rendering varies by
// platform but reads as an icon on all of them; keeps the export
// self-contained (no external SVG assets).
function _browserIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("chrome")) return "🔵";
  if (n.includes("edge")) return "🔷";
  if (n.includes("firefox")) return "🦊";
  if (n.includes("safari")) return "🧭";
  if (n.includes("opera")) return "🎭";
  if (n.includes("brave")) return "🦁";
  return "🌐";
}
function _osIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("mac") || n.includes("darwin")) return "🍎";
  if (n.includes("windows") || n.includes("win")) return "🪟";
  if (n.includes("linux")) return "🐧";
  if (n.includes("ios") || n.includes("iphone") || n.includes("ipad")) return "📱";
  if (n.includes("android")) return "🤖";
  if (n.includes("chrome os")) return "🔵";
  return "💻";
}
function _deviceIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n === "tablet") return "📱";
  if (n === "mobile") return "📱";
  return "🖥";
}
function _connectionIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("wifi")) return "📶";
  if (n.includes("ethernet")) return "🔌";
  if (n.includes("5g") || n.includes("4g") || n.includes("3g") || n.includes("cellular")) return "📡";
  return "🌐";
}

function _buildInfoTab(report: import("../types").BugReport | null, session: StoredSession | null): string {
  const env = report?.environment || session?.environment || captureEnvironment();
  const ctx = report?.context || {};
  const sevLabel = severityBadge(report?.severity || "low");
  const rows: string[] = [];
  rows.push(_kvRow("URL", env.url || window.location.href, "🔗"));
  rows.push(_kvRow("Timestamp", new Date(env.timestamp || Date.now()).toLocaleString(), "🕒"));
  rows.push(_kvRow("OS", env.os || "", _osIcon(env.os)));
  rows.push(_kvRow("Browser", `${env.browser || ""} ${env.browserVersion || ""}`.trim(), _browserIcon(env.browser)));
  rows.push(_kvRow("Viewport", env.viewport || "", "📐"));
  rows.push(_kvRow("Screen", env.screenResolution || "", "🖼"));
  rows.push(_kvRow("Device", env.deviceType || "", _deviceIcon(env.deviceType)));
  rows.push(_kvRow("Language", env.language || "", "🗣"));
  rows.push(_kvRow("Timezone", env.timezone || "", "🌍"));
  rows.push(_kvRow("Connection", env.connectionType || "", _connectionIcon(env.connectionType)));
  rows.push(_kvRow("Session", (session?.sessionId || "").slice(0, 12), "🆔"));
  rows.push(_kvRow("Severity", sevLabel));
  const ctxKeys = Object.keys(ctx);
  if (ctxKeys.length > 0) {
    rows.push(`<div class="tb-qb-sec-head">Custom context</div>`);
    for (const k of ctxKeys) {
      rows.push(_kvRow(k, String(ctx[k])));
    }
  }
  return `<div class="tb-qb-info">${rows.join("")}</div>`;
}

// ── Unified Console feed (Jam-style) ────────────────────────────────────
// Merges timeline events + console logs + video markers into a single
// chronological feed, then lets the user filter by category.

interface ConsoleFeedEntry {
  timestamp: number;
  elapsedMs: number;
  cat: "console" | "navigation" | "network-error" | "user-activity" | "video";
  level: "error" | "warn" | "log" | "info" | ""; // level only for console items
  icon: string;        // svg or unicode glyph
  message: string;
  detail?: string;     // optional secondary text (e.g. URL)
  stack?: string;      // optional stack for console errors
}

const CON_ICONS = {
  videoStart: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  videoStop:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`,
  click:      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2l1 2.4M2.2 7.2l2.4 1M4.6 4.6l1.8 1.8"/></svg>`,
  nav:        `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`,
  netErr:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M4 12l4-4M4 12l4 4"/></svg>`,
  console:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
};

function _formatFeedElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Highlight + auto-scroll the Console feed row closest to the given
 * timestamp. Throttled internally — DOM writes only happen when the
 * active row actually changes, so the hot timeupdate path stays cheap.
 */
let _lastActiveFeedTs = -1;
function _syncConsoleFeedToTimestamp(modal: HTMLElement, ts: number): void {
  const panel = modal.querySelector<HTMLElement>('[data-panel="console"]');
  if (!panel) return;
  const rows = panel.querySelectorAll<HTMLElement>(".tb-qb-feed-row");
  if (rows.length === 0) return;
  // Pick the row with the largest timestamp <= ts (i.e., the most recent
  // entry up to "now"). Linear scan is fine — feeds rarely exceed a few
  // hundred rows.
  let activeRow: HTMLElement | null = null;
  let activeTs = -Infinity;
  rows.forEach((row) => {
    const rt = Number(row.dataset.ts);
    if (!Number.isFinite(rt)) return;
    if (rt <= ts && rt > activeTs) { activeTs = rt; activeRow = row; }
  });
  if (!activeRow || activeTs === _lastActiveFeedTs) return;
  _lastActiveFeedTs = activeTs;
  rows.forEach((row) => row.classList.toggle("tb-qb-feed-row-active", row === activeRow));
  // Scroll the active row into view only if it's off-screen — never
  // hijack the user's scroll position while they're reading.
  const row = activeRow as HTMLElement;
  const panelRect = panel.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  if (rowRect.top < panelRect.top || rowRect.bottom > panelRect.bottom) {
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function _buildConsoleFeed(report: import("../types").BugReport | null): ConsoleFeedEntry[] {
  if (!report) return [];
  const session = report.session;
  const events = session?.events || [];
  const startTs = events[0]?.timestamp || report.consoleLogs?.[0]?.timestamp || Date.now();
  const feed: ConsoleFeedEntry[] = [];

  // Timeline entries → category mapping
  for (const t of report.timeline || []) {
    const elapsedMs = t.timestamp - startTs;
    if (t.type === "route_change") {
      feed.push({
        timestamp: t.timestamp, elapsedMs, cat: "navigation", level: "",
        icon: CON_ICONS.nav, message: `Navigated to ${t.description.split("→").pop()?.trim() || t.description}`,
      });
    } else if (t.type === "api_request" && t.isError) {
      feed.push({
        timestamp: t.timestamp, elapsedMs, cat: "network-error", level: "",
        icon: CON_ICONS.netErr, message: t.description,
      });
    } else if (t.type === "click") {
      feed.push({
        timestamp: t.timestamp, elapsedMs, cat: "user-activity", level: "",
        icon: CON_ICONS.click, message: t.description.replace(/^click /, "Clicked "),
      });
    } else if (t.type === "input" || t.type === "select_change" || t.type === "form_submit") {
      feed.push({
        timestamp: t.timestamp, elapsedMs, cat: "user-activity", level: "",
        icon: CON_ICONS.click, message: t.description,
      });
    }
  }

  // Console logs → console category (all levels)
  for (const l of report.consoleLogs || []) {
    feed.push({
      timestamp: l.timestamp,
      elapsedMs: l.timestamp - startTs,
      cat: "console",
      level: l.level,
      icon: CON_ICONS.console,
      message: l.message,
      stack: l.stack,
    });
  }
  // Fallback for older reports without consoleLogs but with consoleErrors.
  if (!report.consoleLogs?.length && report.consoleErrors?.length) {
    for (const e of report.consoleErrors) {
      feed.push({
        timestamp: e.timestamp, elapsedMs: e.timestamp - startTs,
        cat: "console", level: "error", icon: CON_ICONS.console,
        message: e.message, stack: e.stack,
      });
    }
  }

  // Video markers — start at recording start, stop at start + duration.
  if (report.video) {
    const vs = report.video.startedAt;
    feed.push({
      timestamp: vs, elapsedMs: vs - startTs, cat: "video", level: "",
      icon: CON_ICONS.videoStart, message: "Video started",
    });
    const ve = vs + report.video.durationMs;
    feed.push({
      timestamp: ve, elapsedMs: ve - startTs, cat: "video", level: "",
      icon: CON_ICONS.videoStop, message: "Video stopped",
    });
  }

  feed.sort((a, b) => a.timestamp - b.timestamp);
  return feed;
}

function _buildConsoleTab(report: import("../types").BugReport | null): string {
  const feed = _buildConsoleFeed(report);
  if (feed.length === 0) {
    return `<div class="tb-qb-empty">No console output recorded this session</div>`;
  }

  // Pill counts so the user sees what's available before clicking.
  const counts = { all: feed.length, console: 0, navigation: 0, "network-error": 0, "user-activity": 0, video: 0 };
  for (const e of feed) counts[e.cat] = (counts[e.cat] || 0) + 1;

  const pill = (key: string, label: string) => {
    const c = (counts as any)[key] || 0;
    if (key !== "all" && c === 0) return "";
    return `<button class="tb-qb-feed-pill${key === "all" ? " tb-qb-feed-pill-active" : ""}" data-cat="${key}">${label}${c > 0 ? `<span class="tb-qb-feed-pill-n">${c}</span>` : ""}</button>`;
  };

  const rows = feed.map((e) => {
    const hay = `${e.message} ${e.detail || ""} ${e.stack || ""}`.toLowerCase();
    const isErr = e.cat === "network-error" || e.level === "error";
    const stackHtml = e.stack ? `<pre class="tb-qb-feed-stack">${escapeHtml(e.stack.split("\n").slice(0, 5).join("\n"))}</pre>` : "";
    return `<div class="tb-qb-feed-row tb-qb-feed-${e.cat}${isErr ? " tb-qb-feed-err" : ""}${e.level ? " tb-qb-feed-lvl-" + e.level : ""}" data-cat="${e.cat}" data-level="${e.level}" data-err="${isErr ? "1" : "0"}" data-ts="${e.timestamp}" data-search="${escapeHtml(hay)}" tabindex="0" role="button" title="Click to seek video to this moment">
      <span class="tb-qb-feed-time">${_formatFeedElapsed(e.elapsedMs)}</span>
      <span class="tb-qb-feed-icon" aria-hidden="true">${e.icon}</span>
      <span class="tb-qb-feed-body">
        <span class="tb-qb-feed-msg">${escapeHtml(e.message)}</span>
        ${stackHtml}
      </span>
    </div>`;
  }).join("");

  return `
    <div class="tb-qb-feed-toolbar">
      <input id="tb-qb-con-search" type="search" placeholder="Filter" class="tb-qb-net-search" />
      <label class="tb-qb-net-err-toggle"><input id="tb-qb-con-errors-only" type="checkbox" /> Errors only</label>
    </div>
    <div class="tb-qb-feed-pills">
      ${pill("all", "All")}
      ${pill("console", "Console")}
      ${pill("navigation", "Page navigations")}
      ${pill("network-error", "Network errors")}
      ${pill("user-activity", "User activity")}
      ${pill("video", "Video")}
    </div>
    <div class="tb-qb-feed-list">${rows}</div>
  `;
}

// ── Network classification helpers ──────────────────────────────────────
// These also have inline copies in the HTML export's runtime. Keep them in
// sync — same heuristics give the same Type filters everywhere.

function _classifyRequest(url: string): "fetch" | "ws" | "js" | "css" | "media" | "font" | "doc" | "other" {
  if (!url) return "other";
  if (url.startsWith("ws://") || url.startsWith("wss://")) return "ws";
  let pathname = url;
  try { pathname = new URL(url, "http://_").pathname; } catch {}
  const ext = (pathname.toLowerCase().split(".").pop() || "").split("?")[0];
  if (["js", "mjs", "cjs"].includes(ext)) return "js";
  if (["css", "scss"].includes(ext)) return "css";
  if (["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "svg", "mp4", "webm", "mp3", "wav", "ogg", "m4a", "mov"].includes(ext)) return "media";
  if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) return "font";
  if (["html", "htm"].includes(ext)) return "doc";
  // Anything left is most likely an API call (we only capture via fetch/XHR
  // wrappers, so the bulk of entries land here).
  return "fetch";
}

function _extractDomain(url: string): string {
  try { return new URL(url, "http://_").hostname; } catch {}
  return "";
}

function _shortName(url: string): string {
  try {
    const u = new URL(url, "http://_");
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || u.hostname;
  } catch {
    return url.split("/").filter(Boolean).pop() || url;
  }
}

function _buildNetworkTab(report: import("../types").BugReport | null): string {
  const reqs = report?.networkRequests || report?.networkErrors || [];
  if (reqs.length === 0) {
    return `<div class="tb-qb-empty">No network requests recorded this session</div>`;
  }

  // Waterfall scale — span across the earliest start to the latest end.
  const minTs = Math.min(...reqs.map(r => r.timestamp));
  const maxEnd = Math.max(...reqs.map(r => r.timestamp + (r.duration || 0)));
  const span = Math.max(1, maxEnd - minTs);

  // Count requests by type so the pill labels can show numbers like
  // DevTools (e.g., "Fetch/XHR · 12").
  const typeCounts: Record<string, number> = { all: reqs.length, fetch: 0, ws: 0, js: 0, css: 0, media: 0, font: 0, doc: 0, other: 0 };
  const classified = reqs.map((n) => {
    const t = _classifyRequest(n.url);
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    return { ...n, _t: t, _dom: _extractDomain(n.url), _name: _shortName(n.url) };
  });

  const pill = (key: string, label: string) => {
    const c = typeCounts[key] || 0;
    if (key !== "all" && c === 0) return ""; // hide pills with no data
    return `<button class="tb-qb-net-pill${key === "all" ? " tb-qb-net-pill-active" : ""}" data-type="${key}">${label}${c > 0 ? `<span class="tb-qb-net-pill-n">${c}</span>` : ""}</button>`;
  };

  const rows = classified.map((n, i) => {
    const status = n.status === 0 ? "ERR" : String(n.status);
    const statusClass =
      n.status === 0 ? "tb-qb-net-err" :
      n.status >= 500 ? "tb-qb-net-5xx" :
      n.status >= 400 ? "tb-qb-net-4xx" :
      n.status >= 300 ? "tb-qb-net-3xx" :
      n.status >= 200 ? "tb-qb-net-2xx" : "";
    const isErr = n.status === 0 || n.status >= 400;
    const leftPct = ((n.timestamp - minTs) / span) * 100;
    const widthPct = Math.max(0.5, ((n.duration || 0) / span) * 100);
    const haystack = `${n.method} ${n.url} ${status} ${n._dom}`.toLowerCase();
    const snippet = n.response ? `<div class="tb-qb-net-snippet"><pre>${escapeHtml(n.response.slice(0, 240))}</pre></div>` : "";
    return `<details class="tb-qb-net-row" data-type="${n._t}" data-err="${isErr ? "1" : "0"}" data-search="${escapeHtml(haystack)}">
      <summary class="tb-qb-net-summary">
        <span class="tb-qb-net-c-n">${i + 1}</span>
        <span class="tb-qb-net-c-name" title="${escapeHtml(n.url)}">${escapeHtml(n._name)}</span>
        <span class="tb-qb-net-c-meth">${escapeHtml(n.method)}</span>
        <span class="tb-qb-net-c-stat ${statusClass}">${status}</span>
        <span class="tb-qb-net-c-dom" title="${escapeHtml(n._dom)}">${escapeHtml(n._dom)}</span>
        <span class="tb-qb-net-c-type">${n._t}</span>
        <span class="tb-qb-net-c-time">${n.duration || 0} ms</span>
        <span class="tb-qb-net-c-wf"><span class="tb-qb-net-wf-bar ${statusClass}" style="left:${leftPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%"></span></span>
      </summary>
      <div class="tb-qb-net-detail">
        <div class="tb-qb-net-detail-url">${escapeHtml(n.url)}</div>
        ${snippet}
      </div>
    </details>`;
  }).join("");

  return `
    <div class="tb-qb-net-toolbar">
      <input id="tb-qb-net-search" type="search" placeholder="Filter requests" class="tb-qb-net-search" />
      <label class="tb-qb-net-err-toggle"><input id="tb-qb-net-errors-only" type="checkbox" /> Errors only</label>
    </div>
    <div class="tb-qb-net-pills">
      ${pill("all", "All")}
      ${pill("fetch", "Fetch/XHR")}
      ${pill("ws", "WS")}
      ${pill("js", "JS")}
      ${pill("css", "CSS")}
      ${pill("media", "Media")}
      ${pill("font", "Font")}
      ${pill("doc", "Doc")}
      ${pill("other", "Other")}
    </div>
    <div class="tb-qb-net-table">
      <div class="tb-qb-net-row tb-qb-net-head">
        <span class="tb-qb-net-c-n">#</span>
        <span class="tb-qb-net-c-name">Name</span>
        <span class="tb-qb-net-c-meth">Method</span>
        <span class="tb-qb-net-c-stat">Status</span>
        <span class="tb-qb-net-c-dom">Domain</span>
        <span class="tb-qb-net-c-type">Type</span>
        <span class="tb-qb-net-c-time">Time</span>
        <span class="tb-qb-net-c-wf">Waterfall</span>
      </div>
      ${rows}
    </div>
  `;
}

function _buildActionsTab(report: import("../types").BugReport | null): string {
  const chips = report?.actionChips || [];
  // Prefer chips (with HTML element previews). Fall back to plain
  // sessionSteps for older reports built before actionChips was added.
  if (chips.length === 0) {
    const steps = report?.sessionSteps || [];
    if (steps.length === 0) {
      return `<div class="tb-qb-empty">No actions recorded yet \u2014 click around the app to populate this</div>`;
    }
    return `<ol class="tb-qb-steps">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
  }
  return `<div class="tb-qb-chips">${chips.map(_renderActionChip).join("")}</div>`;
}

function _renderActionChip(chip: import("../types").ActionChip): string {
  const elPreview = chip.element ? _renderElementPreview(chip.element) : "";
  const detail = chip.detail
    ? `<span class="tb-qb-chip-detail${chip.isError ? " tb-qb-chip-detail-err" : ""}">${escapeHtml(chip.detail)}</span>`
    : "";
  // Human-readable target: "Checkout" button / "Email" field / etc.
  const target = chip.target
    ? `<span class="tb-qb-chip-target"><span class="tb-qb-chip-target-name">${escapeHtml(`“${chip.target}”`)}</span>${chip.nounLabel ? ` <span class="tb-qb-chip-target-noun">${escapeHtml(chip.nounLabel)}</span>` : ""}</span>`
    : "";
  // Frustration glyph prefix when a heuristic fired on this action.
  const frust = chip.frustration
    ? `<span class="tb-qb-chip-frust tb-qb-chip-frust-${chip.frustration}" title="${chip.frustration === "rage" ? "Rage click — multiple rapid clicks on the same element" : chip.frustration === "dead" ? "Dead click — no visible response within 1.5s" : "Form abandoned — filled but never submitted"}">${chip.frustration === "rage" ? "⚡" : chip.frustration === "dead" ? "✕" : "↩"}</span>`
    : "";
  const errClass = chip.isError || chip.frustration ? "tb-qb-chip-err" : "";
  return `<div class="tb-qb-chip ${errClass}">
    ${frust}
    <span class="tb-qb-chip-verb tb-qb-chip-verb-${chip.kind}">${escapeHtml(chip.verb)}</span>
    <span class="tb-qb-chip-body">${target}${elPreview}${detail}</span>
  </div>`;
}

function _renderElementPreview(el: { tag: string; attrs: import("../types").ActionChipAttr[]; moreCount: number }): string {
  const attrsHtml = el.attrs.map((a) => {
    if (a.value === "") return `<span class="tb-qb-el-attr-name">${escapeHtml(a.name)}</span>`;
    return `<span class="tb-qb-el-attr-name">${escapeHtml(a.name)}</span>=<span class="tb-qb-el-attr-val">"${escapeHtml(a.value)}"</span>`;
  }).join(" ");
  const more = el.moreCount > 0
    ? ` <span class="tb-qb-el-more">+${el.moreCount} more</span>`
    : "";
  return `<span class="tb-qb-el">&lt;<span class="tb-qb-el-tag">${escapeHtml(el.tag)}</span>${attrsHtml ? " " : ""}${attrsHtml}${more}&gt;</span>`;
}

function _buildAITab(report: import("../types").BugReport | null): string {
  const rootCause = report?.rootCause;
  const hasKey = (() => { try { return !!localStorage.getItem("tracebug_ai_key"); } catch { return false; } })();
  const deterministic = rootCause ? `
    <div class="tb-qb-ai-card">
      <div class="tb-qb-ai-card-head">Pattern-based hint <span class="tb-qb-ai-conf tb-qb-ai-conf-${rootCause.confidence}">${rootCause.confidence}</span></div>
      <div class="tb-qb-ai-card-body">${escapeHtml(rootCause.hint)}</div>
    </div>
  ` : "";
  const llmBlock = hasKey ? `
    <div class="tb-qb-ai-card">
      <div class="tb-qb-ai-card-head">LLM analysis</div>
      <div class="tb-qb-ai-card-body"><em>Click \u201CGenerate\u201D below to run the LLM analysis (BYO API key).</em></div>
      <button class="tb-qb-btn tb-qb-btn-accent" data-action="ai-generate" style="margin-top:10px">\u2728 Generate AI analysis</button>
    </div>
  ` : `
    <div class="tb-qb-ai-card tb-qb-ai-empty">
      <div class="tb-qb-ai-card-head">AI Debugger \u2014 BYO API key</div>
      <div class="tb-qb-ai-card-body">
        <p>Add an Anthropic, OpenAI, or local Ollama API key to enable AI-powered root cause analysis. Keys stay in localStorage \u2014 never leave your machine.</p>
        <button class="tb-qb-btn tb-qb-btn-ghost" data-action="ai-configure">Configure API key</button>
      </div>
    </div>
  `;
  return deterministic + llmBlock;
}

function _buildAnnotationsTab(session: StoredSession | null): string {
  const sessAnn = session?.annotations || [];
  let els: import("../types").ElementAnnotation[] = [];
  let regions: import("../types").DrawRegion[] = [];
  try { els = getElementAnnotations(); } catch {}
  try { regions = getDrawRegions(); } catch {}
  if (sessAnn.length === 0 && els.length === 0 && regions.length === 0) {
    return `<div class="tb-qb-empty">No notes yet \u2014 use the toolbar to add annotations, comments, or draw markup</div>`;
  }
  const sessHtml = sessAnn.length > 0 ? `
    <div class="tb-qb-sec-head">Comments (${sessAnn.length})</div>
    ${sessAnn.map((a) => `
      <div class="tb-qb-note tb-qb-note-${a.severity}">
        <div class="tb-qb-note-sev">${escapeHtml(a.severity)}</div>
        <div class="tb-qb-note-text">${escapeHtml(a.text || "")}</div>
        ${a.expected ? `<div class="tb-qb-note-line"><strong>Expected:</strong> ${escapeHtml(a.expected)}</div>` : ""}
        ${a.actual ? `<div class="tb-qb-note-line"><strong>Actual:</strong> ${escapeHtml(a.actual)}</div>` : ""}
      </div>
    `).join("")}
  ` : "";
  const elHtml = els.length > 0 ? `
    <div class="tb-qb-sec-head">Element markup (${els.length})</div>
    ${els.map((e) => `
      <div class="tb-qb-note tb-qb-note-${e.severity}">
        <div class="tb-qb-note-sev">${escapeHtml(e.intent)} \u00b7 ${escapeHtml(e.severity)}</div>
        <div class="tb-qb-note-text">${escapeHtml(e.comment || "")}</div>
        <div class="tb-qb-note-line"><code>${escapeHtml(e.selector)}</code> \u2014 ${escapeHtml((e.innerText || "").slice(0, 60))}</div>
      </div>
    `).join("")}
  ` : "";
  const regionHtml = regions.length > 0 ? `
    <div class="tb-qb-sec-head">Draw regions (${regions.length})</div>
    ${regions.map((r) => `
      <div class="tb-qb-note">
        <div class="tb-qb-note-sev">${escapeHtml(r.shape)}</div>
        <div class="tb-qb-note-text">${escapeHtml(r.comment || "")}</div>
      </div>
    `).join("")}
  ` : "";
  return sessHtml + elHtml + regionHtml;
}

function _injectStyles(): void {
  if (document.getElementById("tracebug-qb-styles")) return;
  const style = document.createElement("style");
  style.id = "tracebug-qb-styles";
  style.textContent = `
    @keyframes tracebug-qb-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes tracebug-qb-slide-up { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

    /* ── Modal shell ─────────────────────────────────── */
    #${MODAL_ID} { font-family: var(--tb-font-family); -webkit-font-smoothing: antialiased; }
    #${MODAL_ID} * { box-sizing: border-box; }

    /* ── Header ─────────────────────────────────────── */
    #${MODAL_ID} .tb-qb-header { display:flex; align-items:center; gap:12px; padding:16px 22px; border-bottom:1px solid var(--tb-border); flex-shrink:0; background:var(--tb-bg-primary); }
    #${MODAL_ID} .tb-qb-logo { font-size:20px; line-height:1; }
    #${MODAL_ID} .tb-qb-titleblock { flex:1; min-width:0; }
    #${MODAL_ID} .tb-qb-titletext { font-size:15px; font-weight:600; color:var(--tb-text-primary); letter-spacing:-0.01em; }
    #${MODAL_ID} .tb-qb-sub { font-size:11px; color:var(--tb-text-muted); margin-top:3px; font-weight:500; }
    #${MODAL_ID} .tb-qb-sev { font-size:10px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; padding:5px 10px; border-radius:999px; white-space:nowrap; }
    #${MODAL_ID} .tb-qb-close { background:transparent; border:none; color:var(--tb-text-muted); cursor:pointer; font-size:16px; width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; transition:background 0.15s, color 0.15s; }
    #${MODAL_ID} .tb-qb-close:hover { background:var(--tb-btn-hover); color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-theme-toggle { background:transparent; border:1px solid var(--tb-border); color:var(--tb-text-muted); cursor:pointer; font-size:13px; width:30px; height:30px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; transition:all 0.15s; }
    #${MODAL_ID} .tb-qb-theme-toggle:hover { background:var(--tb-btn-hover); color:var(--tb-text-primary); border-color:var(--tb-border-hover); }

    /* ── Two-pane body ────────────────────────────── */
    #${MODAL_ID} .tb-qb-body { flex:1; display:grid; grid-template-columns:minmax(0, 1.55fr) minmax(340px, 1fr); gap:0; overflow:hidden; min-height:0; background:var(--tb-bg-primary); }
    @media (max-width: 920px) { #${MODAL_ID} .tb-qb-body { grid-template-columns:1fr; } }
    #${MODAL_ID} .tb-qb-left { padding:20px 22px; overflow-y:auto; min-width:0; border-right:1px solid var(--tb-border); }
    #${MODAL_ID} .tb-qb-right { display:flex; flex-direction:column; min-width:0; overflow:hidden; background:var(--tb-bg-secondary); }

    /* ── Left pane ──────────────────────────────────── */
    #${MODAL_ID} .tb-qb-lbl { font-size:10px; color:var(--tb-text-muted); display:block; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.6px; font-weight:700; }
    #${MODAL_ID} .tb-qb-input { width:100%; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); color:var(--tb-text-primary); padding:10px 14px; font-size:14px; font-weight:500; font-family:inherit; margin-bottom:14px; outline:none; transition:border-color 0.15s, box-shadow 0.15s; }
    #${MODAL_ID} .tb-qb-input:hover { border-color:var(--tb-border-hover); }
    #${MODAL_ID} .tb-qb-preview { border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); overflow:hidden; margin-bottom:8px; background:#000; display:flex; align-items:center; justify-content:center; }
    #${MODAL_ID} .tb-qb-preview-empty { padding:32px 16px; font-size:12px; color:var(--tb-text-muted); background:var(--tb-bg-secondary); border-style:dashed; }
    #${MODAL_ID} .tb-qb-video { display:block; width:100%; max-height:380px; background:#000; }
    #${MODAL_ID} .tb-qb-img { display:block; max-width:100%; max-height:380px; width:auto; margin:0 auto; }
    #${MODAL_ID} .tb-qb-vidmeta { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; color:var(--tb-text-muted); margin-bottom:12px; }
    #${MODAL_ID} .tb-qb-imgmeta { font-size:11px; color:var(--tb-text-muted); margin-bottom:12px; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-btn-sm { background:transparent; color:var(--tb-text-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); padding:5px 10px; cursor:pointer; font-size:11px; font-weight:500; font-family:inherit; transition:all 0.15s; }
    #${MODAL_ID} .tb-qb-btn-sm:hover { background:var(--tb-btn-hover); color:var(--tb-text-primary); border-color:var(--tb-border-hover); }
    #${MODAL_ID} .tb-qb-btn-dl { background:var(--tb-accent); color:#fff; border:1px solid var(--tb-accent); border-radius:var(--tb-radius-sm); padding:5px 10px; cursor:pointer; font-size:11px; font-weight:600; font-family:inherit; transition:filter 0.15s; display:inline-flex; align-items:center; gap:5px; }
    #${MODAL_ID} .tb-qb-btn-dl:hover { filter:brightness(1.1); }
    #${MODAL_ID} .tb-qb-scrubber-wrap { margin-bottom:14px; }
    #${MODAL_ID} .tb-qb-thumbs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px; }
    #${MODAL_ID} .tb-qb-thumb { position:relative; padding:0; border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); overflow:hidden; cursor:pointer; background:var(--tb-bg-secondary); width:68px; height:52px; transition:border-color 0.15s, transform 0.1s; }
    #${MODAL_ID} .tb-qb-thumb:hover { border-color:var(--tb-accent); transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    #${MODAL_ID} .tb-qb-thumb-num { position:absolute; top:2px; left:3px; font-size:9px; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.7); background:rgba(0,0,0,0.55); border-radius:3px; padding:1px 5px; }
    #${MODAL_ID} .tb-qb-comments { display:flex; flex-direction:column; gap:4px; margin-bottom:14px; max-height:160px; overflow-y:auto; padding-right:4px; }
    #${MODAL_ID} .tb-qb-comment { display:flex; align-items:flex-start; gap:10px; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); padding:8px 10px; color:var(--tb-text-primary); font-family:inherit; font-size:12px; text-align:left; cursor:pointer; line-height:1.4; transition:border-color 0.15s, background 0.15s; }
    #${MODAL_ID} .tb-qb-comment:hover { background:var(--tb-bg-elevated); border-color:var(--tb-border-hover); }
    #${MODAL_ID} .tb-qb-comment-ts { font-variant-numeric:tabular-nums; font-weight:600; color:var(--tb-accent); min-width:42px; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-comment-tx { flex:1; }
    #${MODAL_ID} .tb-qb-desc-wrap { margin-top:8px; border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); background:var(--tb-bg-secondary); }
    #${MODAL_ID} .tb-qb-desc-wrap[open] { background:var(--tb-bg-primary); }
    #${MODAL_ID} .tb-qb-desc-summary { padding:10px 14px; font-size:11px; color:var(--tb-text-muted); cursor:pointer; text-transform:uppercase; letter-spacing:0.6px; font-weight:700; user-select:none; transition:color 0.15s; }
    #${MODAL_ID} .tb-qb-desc-summary:hover { color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-textarea { width:100%; min-height:160px; background:var(--tb-bg-primary); border:none; border-top:1px solid var(--tb-border); border-radius:0 0 var(--tb-radius-md) var(--tb-radius-md); color:var(--tb-text-primary); padding:12px 14px; font-size:13px; font-family:var(--tb-font-mono); resize:vertical; outline:none; line-height:1.6; }

    /* ── Right pane: tabs ────────────────────────────── */
    #${MODAL_ID} .tb-qb-tabstrip { display:flex; flex-direction:row; gap:0; padding:0 12px; background:var(--tb-bg-secondary); border-bottom:1px solid var(--tb-border); overflow-x:auto; flex-shrink:0; }
    #${MODAL_ID} .tb-qb-tab { display:inline-flex; align-items:center; gap:7px; padding:14px 14px 12px; border:none; background:transparent; color:var(--tb-text-muted); cursor:pointer; font-size:13px; font-weight:600; font-family:inherit; border-bottom:2px solid transparent; white-space:nowrap; transition:color 0.15s, border-color 0.15s; letter-spacing:-0.01em; margin-bottom:-1px; }
    #${MODAL_ID} .tb-qb-tab:hover { color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-tab-active { color:var(--tb-text-primary); border-bottom-color:var(--tb-accent); }
    #${MODAL_ID} .tb-qb-tab-badge { font-size:10px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--tb-accent-subtle); color:var(--tb-accent); line-height:1.4; min-width:18px; text-align:center; }
    #${MODAL_ID} .tb-qb-tab-active .tb-qb-tab-badge { background:var(--tb-accent); color:#fff; }
    #${MODAL_ID} .tb-qb-tabpanels { flex:1; overflow-y:auto; padding:18px 20px; min-height:0; }
    #${MODAL_ID} .tb-qb-panel { display:none; animation:tracebug-qb-fade-in 0.18s ease; }
    #${MODAL_ID} .tb-qb-panel-active { display:block; }

    /* ── Tab content ─────────────────────────────────── */
    #${MODAL_ID} .tb-qb-empty { font-size:13px; color:var(--tb-text-muted); padding:32px 16px; text-align:center; border:1px dashed var(--tb-border); border-radius:var(--tb-radius-md); }
    #${MODAL_ID} .tb-qb-sec-head { font-size:10px; color:var(--tb-text-muted); text-transform:uppercase; letter-spacing:0.6px; font-weight:700; margin:18px 0 8px; }
    #${MODAL_ID} .tb-qb-sec-head:first-child { margin-top:0; }
    #${MODAL_ID} .tb-qb-info { display:flex; flex-direction:column; gap:5px; }
    #${MODAL_ID} .tb-qb-kv { display:flex; gap:12px; padding:8px 12px; background:var(--tb-bg-primary); border:1px solid var(--tb-border-subtle); border-radius:var(--tb-radius-sm); transition:border-color 0.15s; }
    #${MODAL_ID} .tb-qb-kv:hover { border-color:var(--tb-border); }
    #${MODAL_ID} .tb-qb-kv-k { font-size:11px; color:var(--tb-text-muted); min-width:98px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700; flex-shrink:0; }
    #${MODAL_ID} .tb-qb-kv-v { font-size:12px; color:var(--tb-text-primary); word-break:break-word; min-width:0; flex:1; font-family:var(--tb-font-mono); display:flex; align-items:center; gap:6px; }
    #${MODAL_ID} .tb-qb-kv-icon { font-size:13px; line-height:1; flex-shrink:0; }
    #${MODAL_ID} .tb-qb-log { padding:10px 12px; margin-bottom:8px; background:var(--tb-bg-primary); border:1px solid var(--tb-border); border-left:3px solid var(--tb-border-hover); border-radius:var(--tb-radius-sm); }
    #${MODAL_ID} .tb-qb-log-error { border-left-color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-log-warn { border-left-color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-log-log { border-left-color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-log-info { border-left-color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-log-head { display:flex; align-items:flex-start; gap:8px; }
    #${MODAL_ID} .tb-qb-log-lvl { font-size:9px; font-weight:700; padding:2px 7px; border-radius:var(--tb-radius-sm); text-transform:uppercase; letter-spacing:0.4px; flex-shrink:0; line-height:1.35; }
    #${MODAL_ID} .tb-qb-log-lvl-error { background:var(--tb-error-bg); color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-log-lvl-warn { background:var(--tb-warning-bg); color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-log-lvl-log,
    #${MODAL_ID} .tb-qb-log-lvl-info { background:var(--tb-info-bg); color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-log-msg { font-size:12px; color:var(--tb-text-primary); font-family:var(--tb-font-mono); word-break:break-word; line-height:1.5; flex:1; min-width:0; }
    #${MODAL_ID} .tb-qb-log-error .tb-qb-log-msg { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-log-stack { font-size:10px; color:var(--tb-text-muted); font-family:var(--tb-font-mono); margin:8px 0 0; padding:8px 10px; background:var(--tb-code-bg); border-radius:var(--tb-radius-sm); max-height:140px; overflow:auto; white-space:pre-wrap; }
    #${MODAL_ID} .tb-qb-log-ts { font-size:10px; color:var(--tb-text-muted); margin-top:6px; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-net { padding:10px 12px; margin-bottom:6px; background:var(--tb-bg-primary); border-radius:var(--tb-radius-sm); border:1px solid var(--tb-border); transition:border-color 0.15s; }
    #${MODAL_ID} .tb-qb-net:hover { border-color:var(--tb-border-hover); }
    #${MODAL_ID} .tb-qb-net-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    #${MODAL_ID} .tb-qb-net-method { font-size:10px; font-weight:700; padding:3px 7px; border-radius:var(--tb-radius-sm); background:var(--tb-bg-elevated); color:var(--tb-text-primary); font-family:var(--tb-font-mono); letter-spacing:0.5px; }
    #${MODAL_ID} .tb-qb-net-status { font-size:10px; font-weight:700; padding:3px 7px; border-radius:var(--tb-radius-sm); color:#fff; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-net-status.tb-qb-net-2xx { background:#16a34a; }
    #${MODAL_ID} .tb-qb-net-status.tb-qb-net-3xx { background:#0891b2; }
    #${MODAL_ID} .tb-qb-net-status.tb-qb-net-4xx { background:#d97706; }
    #${MODAL_ID} .tb-qb-net-status.tb-qb-net-5xx { background:#dc2626; }
    #${MODAL_ID} .tb-qb-net-status.tb-qb-net-err { background:#7f1d1d; }
    /* ── Network DevTools-style refactor ───────────────────────── */
    #${MODAL_ID} .tb-qb-net-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    #${MODAL_ID} .tb-qb-net-search { flex:1; min-width:0; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); color:var(--tb-text-primary); padding:6px 10px; font-size:12px; font-family:inherit; outline:none; transition:border-color .15s; }
    #${MODAL_ID} .tb-qb-net-search:focus { border-color:var(--tb-accent); box-shadow:0 0 0 3px var(--tb-accent-subtle); }
    #${MODAL_ID} .tb-qb-net-err-toggle { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--tb-text-secondary); cursor:pointer; white-space:nowrap; }
    #${MODAL_ID} .tb-qb-net-err-toggle input { accent-color:var(--tb-accent); cursor:pointer; }
    #${MODAL_ID} .tb-qb-con-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    #${MODAL_ID} .tb-qb-con-count { font-size:10px; color:var(--tb-text-muted); white-space:nowrap; text-transform:uppercase; letter-spacing:0.4px; font-weight:600; }

    /* Unified Console feed — Jam-style timeline of events */
    #${MODAL_ID} .tb-qb-feed-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    #${MODAL_ID} .tb-qb-feed-pills { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
    #${MODAL_ID} .tb-qb-feed-pill { background:var(--tb-bg-secondary); border:1px solid var(--tb-border); color:var(--tb-text-secondary); padding:5px 12px; font-size:11px; font-weight:600; border-radius:999px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; transition:all .15s; }
    #${MODAL_ID} .tb-qb-feed-pill:hover { border-color:var(--tb-border-hover); color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-feed-pill-active { background:var(--tb-text-primary); color:var(--tb-bg-primary); border-color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-feed-pill-n { background:rgba(0,0,0,0.15); padding:1px 6px; border-radius:999px; font-size:9px; font-weight:700; min-width:14px; text-align:center; }
    #${MODAL_ID} .tb-qb-feed-pill-active .tb-qb-feed-pill-n { background:rgba(255,255,255,0.22); }
    #${MODAL_ID} .tb-qb-feed-list { display:flex; flex-direction:column; }
    #${MODAL_ID} .tb-qb-feed-row { display:grid; grid-template-columns:48px 24px 1fr; align-items:flex-start; gap:10px; padding:8px 10px; border-bottom:1px solid var(--tb-border-subtle); transition:background .12s; cursor:pointer; }
    #${MODAL_ID} .tb-qb-feed-row:hover { background:var(--tb-bg-secondary); }
    #${MODAL_ID} .tb-qb-feed-row-active { background:var(--tb-accent-subtle) !important; box-shadow:inset 3px 0 0 var(--tb-accent); }
    #${MODAL_ID} .tb-qb-feed-row:focus { outline:2px solid var(--tb-accent); outline-offset:-2px; }
    #${MODAL_ID} .tb-qb-feed-time { font-family:var(--tb-font-mono); font-size:11px; font-variant-numeric:tabular-nums; color:var(--tb-text-muted); padding-top:3px; }
    #${MODAL_ID} .tb-qb-feed-icon { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; color:var(--tb-text-secondary); border-radius:var(--tb-radius-sm); flex-shrink:0; }
    #${MODAL_ID} .tb-qb-feed-body { min-width:0; }
    #${MODAL_ID} .tb-qb-feed-msg { font-family:var(--tb-font-mono); font-size:12px; color:var(--tb-text-primary); word-break:break-word; line-height:1.5; }
    #${MODAL_ID} .tb-qb-feed-stack { font-family:var(--tb-font-mono); font-size:10px; color:var(--tb-text-muted); margin:6px 0 0; padding:6px 8px; background:var(--tb-code-bg); border-radius:var(--tb-radius-sm); max-height:120px; overflow:auto; white-space:pre-wrap; }
    /* Category accents */
    #${MODAL_ID} .tb-qb-feed-navigation { background:var(--tb-info-bg); }
    #${MODAL_ID} .tb-qb-feed-navigation:hover { background:var(--tb-info-bg); filter:brightness(0.97); }
    #${MODAL_ID} .tb-qb-feed-navigation .tb-qb-feed-icon { color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-feed-network-error { background:var(--tb-error-bg); }
    #${MODAL_ID} .tb-qb-feed-network-error .tb-qb-feed-icon { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-feed-network-error .tb-qb-feed-msg { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-feed-user-activity .tb-qb-feed-icon { color:var(--tb-text-secondary); }
    #${MODAL_ID} .tb-qb-feed-video .tb-qb-feed-icon { color:var(--tb-accent); }
    #${MODAL_ID} .tb-qb-feed-lvl-error .tb-qb-feed-icon { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-feed-lvl-error .tb-qb-feed-msg { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-feed-lvl-warn .tb-qb-feed-icon { color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-feed-lvl-warn .tb-qb-feed-msg { color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-net-pills { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:10px; }
    #${MODAL_ID} .tb-qb-net-pill { background:var(--tb-bg-secondary); border:1px solid var(--tb-border); color:var(--tb-text-secondary); padding:4px 11px; font-size:11px; font-weight:600; border-radius:999px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; transition:all .15s; }
    #${MODAL_ID} .tb-qb-net-pill:hover { border-color:var(--tb-border-hover); color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-net-pill-active { background:var(--tb-text-primary); color:var(--tb-bg-primary); border-color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-net-pill-n { background:rgba(0,0,0,0.15); padding:1px 6px; border-radius:999px; font-size:9px; font-weight:700; }
    #${MODAL_ID} .tb-qb-net-pill-active .tb-qb-net-pill-n { background:rgba(255,255,255,0.2); }
    #${MODAL_ID} .tb-qb-net-table { font-family:var(--tb-font-mono); font-size:11px; }
    #${MODAL_ID} .tb-qb-net-row { display:grid; grid-template-columns:28px 1.4fr 56px 50px 1.1fr 60px 56px 2fr; align-items:center; gap:8px; padding:0; background:transparent; border:none; }
    #${MODAL_ID} .tb-qb-net-row.tb-qb-net-head { padding:6px 8px 8px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--tb-text-muted); border-bottom:1px solid var(--tb-border); }
    #${MODAL_ID} details.tb-qb-net-row { display:block; border-bottom:1px solid var(--tb-border-subtle); }
    #${MODAL_ID} details.tb-qb-net-row:hover { background:var(--tb-bg-secondary); }
    #${MODAL_ID} .tb-qb-net-summary { display:grid; grid-template-columns:28px 1.4fr 56px 50px 1.1fr 60px 56px 2fr; align-items:center; gap:8px; padding:6px 8px; cursor:pointer; list-style:none; min-height:24px; }
    #${MODAL_ID} .tb-qb-net-summary::-webkit-details-marker { display:none; }
    #${MODAL_ID} .tb-qb-net-c-n { color:var(--tb-text-muted); text-align:right; }
    #${MODAL_ID} .tb-qb-net-c-name { color:var(--tb-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #${MODAL_ID} .tb-qb-net-c-meth { color:var(--tb-text-secondary); font-weight:600; font-size:10px; letter-spacing:0.4px; }
    #${MODAL_ID} .tb-qb-net-c-stat { font-size:10px; font-weight:700; padding:1px 6px; border-radius:var(--tb-radius-sm); color:#fff; text-align:center; }
    #${MODAL_ID} .tb-qb-net-c-stat.tb-qb-net-2xx { background:#16a34a; }
    #${MODAL_ID} .tb-qb-net-c-stat.tb-qb-net-3xx { background:#0891b2; }
    #${MODAL_ID} .tb-qb-net-c-stat.tb-qb-net-4xx { background:#d97706; }
    #${MODAL_ID} .tb-qb-net-c-stat.tb-qb-net-5xx { background:#dc2626; }
    #${MODAL_ID} .tb-qb-net-c-stat.tb-qb-net-err { background:#7f1d1d; }
    #${MODAL_ID} .tb-qb-net-c-dom { color:var(--tb-text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #${MODAL_ID} .tb-qb-net-c-type { color:var(--tb-text-muted); font-size:10px; }
    #${MODAL_ID} .tb-qb-net-c-time { color:var(--tb-text-secondary); text-align:right; font-size:10px; }
    #${MODAL_ID} .tb-qb-net-c-wf { position:relative; height:14px; background:var(--tb-bg-secondary); border-radius:3px; overflow:hidden; }
    #${MODAL_ID} .tb-qb-net-wf-bar { position:absolute; top:3px; height:8px; border-radius:2px; background:var(--tb-accent); }
    #${MODAL_ID} .tb-qb-net-wf-bar.tb-qb-net-4xx { background:#d97706; }
    #${MODAL_ID} .tb-qb-net-wf-bar.tb-qb-net-5xx { background:#dc2626; }
    #${MODAL_ID} .tb-qb-net-wf-bar.tb-qb-net-err { background:#7f1d1d; }
    #${MODAL_ID} .tb-qb-net-detail { padding:0 8px 10px 36px; }
    #${MODAL_ID} .tb-qb-net-detail-url { font-size:11px; color:var(--tb-text-secondary); word-break:break-all; padding-bottom:6px; }
    #${MODAL_ID} .tb-qb-net-snippet pre { margin:0; padding:8px; background:var(--tb-code-bg); border-radius:var(--tb-radius-sm); font-size:10px; color:var(--tb-code-text); max-height:120px; overflow:auto; white-space:pre-wrap; }
    /* Tab notification dots */
    #${MODAL_ID} .tb-qb-tab-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--tb-accent); margin-left:4px; vertical-align:middle; }
    #${MODAL_ID} .tb-qb-net-time { font-size:11px; color:var(--tb-text-muted); margin-left:auto; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-net-url { font-size:12px; color:var(--tb-text-secondary); font-family:var(--tb-font-mono); word-break:break-all; line-height:1.5; }
    #${MODAL_ID} .tb-qb-net-snippet { font-size:10px; color:var(--tb-text-muted); font-family:var(--tb-font-mono); margin:8px 0 0; padding:8px 10px; background:var(--tb-code-bg); border-radius:var(--tb-radius-sm); max-height:96px; overflow:auto; white-space:pre-wrap; }
    #${MODAL_ID} .tb-qb-steps { margin:0; padding-left:26px; font-size:13px; color:var(--tb-text-primary); line-height:1.7; }
    #${MODAL_ID} .tb-qb-steps li { margin-bottom:5px; }
    #${MODAL_ID} .tb-qb-ai-card { padding:14px; background:var(--tb-bg-primary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); margin-bottom:10px; }
    #${MODAL_ID} .tb-qb-ai-card-head { font-size:11px; color:var(--tb-text-muted); text-transform:uppercase; letter-spacing:0.6px; font-weight:700; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
    #${MODAL_ID} .tb-qb-ai-conf { font-size:9px; padding:2px 8px; border-radius:999px; font-weight:700; letter-spacing:0.4px; text-transform:uppercase; }
    #${MODAL_ID} .tb-qb-ai-conf-high { background:var(--tb-success-bg); color:var(--tb-success); }
    #${MODAL_ID} .tb-qb-ai-conf-medium { background:var(--tb-warning-bg); color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-ai-conf-low { background:var(--tb-info-bg); color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-ai-card-body { font-size:13px; color:var(--tb-text-primary); line-height:1.6; }
    #${MODAL_ID} .tb-qb-ai-card-body p { margin:0 0 10px; }
    #${MODAL_ID} .tb-qb-ai-empty .tb-qb-ai-card-body { color:var(--tb-text-secondary); }

    /* Actions tab — chips with HTML-element preview */
    #${MODAL_ID} .tb-qb-chips { display:flex; flex-direction:column; gap:5px; }
    #${MODAL_ID} .tb-qb-chip { display:flex; align-items:flex-start; gap:12px; padding:9px 12px; background:var(--tb-bg-primary); border:1px solid var(--tb-border-subtle); border-radius:var(--tb-radius-sm); border-left:3px solid transparent; font-size:12px; line-height:1.5; transition:border-color 0.15s; }
    #${MODAL_ID} .tb-qb-chip:hover { border-color:var(--tb-border); }
    #${MODAL_ID} .tb-qb-chip-err { border-left-color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-chip-verb { font-size:10px; font-weight:700; color:var(--tb-text-muted); text-transform:uppercase; letter-spacing:0.5px; min-width:66px; flex-shrink:0; padding-top:2px; }
    #${MODAL_ID} .tb-qb-chip-verb-click { color:var(--tb-accent); }
    #${MODAL_ID} .tb-qb-chip-verb-input { color:var(--tb-success); }
    #${MODAL_ID} .tb-qb-chip-verb-select { color:#0891b2; }
    #${MODAL_ID} .tb-qb-chip-verb-submit { color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-chip-verb-navigate { color:#a855f7; }
    #${MODAL_ID} .tb-qb-chip-verb-api { color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-chip-verb-error { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-chip-verb-mark { color:#ea580c; }
    #${MODAL_ID} .tb-qb-chip-body { flex:1; min-width:0; word-break:break-word; }
    #${MODAL_ID} .tb-qb-chip-detail { display:inline-block; margin-left:6px; color:var(--tb-text-primary); font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-chip-detail-err { color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-el { font-family:var(--tb-font-mono); font-size:12px; color:var(--tb-code-text); }
    #${MODAL_ID} .tb-qb-el-tag { color:var(--tb-code-tag); }
    #${MODAL_ID} .tb-qb-el-attr-name { color:var(--tb-code-attr-name); }
    #${MODAL_ID} .tb-qb-el-attr-val { color:var(--tb-code-attr-val); }
    #${MODAL_ID} .tb-qb-el-more { color:var(--tb-text-muted); font-style:italic; font-size:10px; }
    /* Human-readable target + frustration glyph */
    #${MODAL_ID} .tb-qb-chip-target { display:inline-block; margin-right:8px; font-size:12px; color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-chip-target-name { font-weight:600; }
    #${MODAL_ID} .tb-qb-chip-target-noun { color:var(--tb-text-secondary); font-weight:500; }
    #${MODAL_ID} .tb-qb-chip-frust { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; font-size:10px; font-weight:700; flex-shrink:0; margin-top:1px; }
    #${MODAL_ID} .tb-qb-chip-frust-rage { background:rgba(239,68,68,0.18); color:#ef4444; }
    #${MODAL_ID} .tb-qb-chip-frust-dead { background:rgba(245,158,11,0.18); color:#f59e0b; }
    #${MODAL_ID} .tb-qb-chip-frust-abandon { background:rgba(59,130,246,0.18); color:#3b82f6; }

    /* Notes tab */
    #${MODAL_ID} .tb-qb-note { padding:10px 12px; margin-bottom:8px; background:var(--tb-bg-primary); border-radius:var(--tb-radius-sm); border:1px solid var(--tb-border-subtle); border-left:3px solid var(--tb-border); }
    #${MODAL_ID} .tb-qb-note-critical { border-left-color:var(--tb-error); }
    #${MODAL_ID} .tb-qb-note-major { border-left-color:var(--tb-warning); }
    #${MODAL_ID} .tb-qb-note-minor { border-left-color:#ca8a04; }
    #${MODAL_ID} .tb-qb-note-info { border-left-color:var(--tb-info); }
    #${MODAL_ID} .tb-qb-note-sev { font-size:10px; text-transform:uppercase; letter-spacing:0.5px; font-weight:700; color:var(--tb-text-muted); margin-bottom:5px; }
    #${MODAL_ID} .tb-qb-note-text { font-size:13px; color:var(--tb-text-primary); line-height:1.5; }
    #${MODAL_ID} .tb-qb-note-line { font-size:11px; color:var(--tb-text-secondary); margin-top:5px; line-height:1.4; }
    #${MODAL_ID} .tb-qb-note-line code { background:var(--tb-code-bg); padding:2px 6px; border-radius:var(--tb-radius-sm); font-family:var(--tb-font-mono); color:var(--tb-code-text); }

    /* ── Footer ──────────────────────────────────────── */
    #${MODAL_ID} .tb-qb-footer { padding:14px 22px; border-top:1px solid var(--tb-border); background:var(--tb-bg-primary); flex-shrink:0; }
    #${MODAL_ID} .tb-qb-actions { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:12px; }
    #${MODAL_ID} .tb-qb-btn { background:var(--tb-bg-secondary); color:var(--tb-text-primary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); padding:9px 14px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; display:inline-flex; align-items:center; gap:7px; transition:all 0.15s; letter-spacing:-0.01em; }
    #${MODAL_ID} .tb-qb-btn:hover { background:var(--tb-bg-elevated); border-color:var(--tb-border-hover); transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-btn-accent { background:var(--tb-accent); color:#fff; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-accent:hover { background:var(--tb-accent-hover); border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-linear { background:#5E6AD2; color:#fff; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-linear:hover { background:#4d5ac4; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-slack { background:#4A154B; color:#fff; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-slack:hover { background:#3a0f3b; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-jira { background:#2684FF; color:#fff; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-jira:hover { background:#1d6fdb; border-color:transparent; }
    #${MODAL_ID} .tb-qb-btn-locked { background:var(--tb-bg-secondary); color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-qb-btn-ghost { background:transparent; color:var(--tb-text-secondary); border:1px dashed var(--tb-accent); }
    #${MODAL_ID} .tb-qb-btn-ghost:hover { background:var(--tb-accent-subtle); color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-btn-gh-primary { background:#24292e; color:#fff; border-color:transparent; flex:1 0 100%; justify-content:center; padding:11px; font-size:13px; }
    #${MODAL_ID} .tb-qb-btn-gh-primary:hover { background:#1a1e22; border-color:transparent; }
    #${MODAL_ID} .tb-qb-tip { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-qb-tip kbd { background:var(--tb-bg-secondary); padding:2px 7px; border-radius:var(--tb-radius-sm); border:1px solid var(--tb-border); font-family:var(--tb-font-mono); font-size:10px; color:var(--tb-text-secondary); }
    #${MODAL_ID} .tb-qb-tip-right { display:flex; align-items:center; gap:10px; }
    #${MODAL_ID} .tb-qb-plan-premium { font-size:9px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--tb-accent); color:#fff; letter-spacing:0.4px; }
    #${MODAL_ID} .tb-qb-plan-free { font-size:9px; font-weight:700; padding:2px 8px; border-radius:999px; background:var(--tb-bg-secondary); color:var(--tb-text-muted); border:1px solid var(--tb-border); letter-spacing:0.4px; }

    /* ── Focus + disabled states ──────────────────── */
    #${MODAL_ID} button:disabled { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
    #${MODAL_ID} input:focus, #${MODAL_ID} textarea:focus { border-color:var(--tb-accent) !important; box-shadow: 0 0 0 3px var(--tb-accent-subtle); }
    #${MODAL_ID} button:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }

    /* ── Help overlay (keyboard cheat sheet) ──────── */
    #${MODAL_ID} .tb-qb-help { position:absolute; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10; padding:24px; }
    #${MODAL_ID} .tb-qb-help-card { background:var(--tb-bg-primary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); padding:24px 28px; max-width:420px; width:100%; box-shadow:var(--tb-shadow-md); }
    #${MODAL_ID} .tb-qb-help-title { font-size:14px; font-weight:600; margin-bottom:16px; color:var(--tb-text-primary); letter-spacing:-0.01em; }
    #${MODAL_ID} .tb-qb-help-row { display:flex; align-items:center; gap:12px; padding:7px 0; font-size:13px; color:var(--tb-text-primary); border-bottom:1px solid var(--tb-border-subtle); }
    #${MODAL_ID} .tb-qb-help-row:last-of-type { border-bottom:none; }
    #${MODAL_ID} .tb-qb-help-row span { color:var(--tb-text-secondary); flex:1; }
    #${MODAL_ID} .tb-qb-help-row kbd { background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); padding:2px 8px; font-family:var(--tb-font-mono); font-size:11px; color:var(--tb-text-primary); margin-right:4px; }
    #${MODAL_ID} .tb-qb-help-close { margin-top:14px; width:100%; padding:9px; background:var(--tb-accent); color:#fff; border:none; border-radius:var(--tb-radius-sm); cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; transition:background 0.15s; }
    #${MODAL_ID} .tb-qb-help-close:hover { background:var(--tb-accent-hover); }

    /* ── Scrollbar polish ─────────────────────────── */
    #${MODAL_ID} *::-webkit-scrollbar { width: 8px; height: 8px; }
    #${MODAL_ID} *::-webkit-scrollbar-track { background: transparent; }
    #${MODAL_ID} *::-webkit-scrollbar-thumb { background: var(--tb-border); border-radius: 4px; }
    #${MODAL_ID} *::-webkit-scrollbar-thumb:hover { background: var(--tb-border-hover); }
  `;
  document.head.appendChild(style);
}
