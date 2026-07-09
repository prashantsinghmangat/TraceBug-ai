// ── Quick Bug Capture ─────────────────────────────────────────────────────
// Zero-friction bug reporting: 1 keystroke → screenshot → auto-filled modal → 1-click copy.
// Total flow under 5 seconds. Replaces the 6-7 click manual workflow.

import { captureScreenshot, downloadScreenshot, getScreenshots, removeScreenshot, updateScreenshot, pushScreenshot } from "../screenshot";
import { captureRegionScreenshot } from "../region-screenshot";
import { showAnnotationEditor } from "../dashboard";
import { isPremium } from "../plan";
import { showUpgradeModal } from "./upgrade-modal";
import { getAllSessions, getCachedSessions, setSessionPriority, markSessionSaved } from "../storage";
import { getLastVideoRecording, downloadVideoRecording, restoreLastRecordingFromOffscreen } from "../video-recorder";
import type { VideoRecording } from "../video-recorder";
/*  */import { buildReport, getSessionVideo, formatRootCauseLine, severityBadge, priorityLabel } from "../report-builder";
import { generateGitHubIssue, openGitHubIssue } from "../github-issue";
import { generateJiraTicket } from "../jira-issue";
import { generateBugTitle, generateFlowSummary } from "../title-generator";
import { captureEnvironment } from "../environment";
import { ScreenshotData, StoredSession, BugReport } from "../types";
import { showToast } from "./toast";
import { escapeHtml } from "./helpers";
import { mountReplayScrubber } from "./replay-scrubber";
import { getBlurEvents } from "./blur-tool";
import { exportSessionAsHtml } from "../exporters/html-replay";
import { exportSessionAsHar } from "../exporters/har-export";
// PHASE2-CLOUD: import { shareSessionAsLink, MAX_SCREENSHOTS_PER_SHARE } from "../exporters/share-link";
import { resolveCloudEndpoint, DEFAULT_CLOUD_ENDPOINT } from "../cloud-endpoint";
import { generateAIPrompt, generateMcpPrompt, openInClaude, openInChatGPT } from "../exporters/ai-prompt";
import {
  runLLMAnalysis, getAIConfig, setAIConfig, clearAIConfig,
  PROVIDER_LABELS, DEFAULT_MODELS, ANTHROPIC_MODEL_CHOICES,
  type AIProvider, type AIConfig,
} from "../ai/llm-client";
// PHASE2-CLOUD: import { getBridge } from "../auth/iframe-bridge";
import { showScreenshotTrimModal } from "./screenshot-trim-modal";
import { injectTheme, getResolvedTheme, type ThemeMode } from "../theme";
import { getElementAnnotations, getDrawRegions } from "../annotation-store";
import { openLinearIssue } from "../linear-issue";
import { generateSlackPost } from "../slack-export";
import {
  createTrackerIssue, hasIntegration,
  getIntegrationsConfig, setIntegrationsConfig, clearIntegrationsConfig,
  TRACKER_LABELS, type TrackerProvider, type IntegrationsConfig,
} from "../integrations/tracker-client";

// Caller can set this from the SDK init so the modal knows which repo to target
let _githubRepo: string | null = null;
export function setGithubRepo(repo: string | null): void { _githubRepo = repo; }

// Cloud endpoint for the Share link flow. Defaults to production; can be
// overridden at init time via TraceBug.init({ cloudEndpoint: ... }).
let _cloudEndpoint: string = DEFAULT_CLOUD_ENDPOINT;
export function setCloudEndpoint(endpoint: string | null | undefined): void {
  _cloudEndpoint = resolveCloudEndpoint(endpoint);
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

/** Force the modal to re-render with fresh state. Used after a screenshot
 *  is added / deleted / annotated so the user sees the change immediately.
 *  No-op when the modal isn't already open. */
export async function refreshQuickBugCapture(root: HTMLElement): Promise<void> {
  if (!_isOpen) return;
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    // Detach the document keydown listeners this overlay registered before we
    // drop it — close() isn't called on the refresh path, so they'd leak.
    const k = (existing as any).__tbModalKey;
    const esc = (existing as any).__tbEscKey;
    if (k) document.removeEventListener("keydown", k);
    if (esc) document.removeEventListener("keydown", esc);
    existing.remove();
  }
  _isOpen = false;
  await showQuickBugCapture(root);
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
  const sessions = getCachedSessions().slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const currentSession = options?.sessionId
    ? (sessions.find(s => s.sessionId === options.sessionId) || sessions[0] || null)
    : (sessions[0] || null);
  // _rawVideo is always the LAST recording. If we're opening an older session,
  // suppress video so a newer session's recording doesn't bleed in.
  const isHistoricalSession = !!(
    options?.sessionId && sessions.length > 1 && sessions[0].sessionId !== currentSession?.sessionId
  );
  // For old sessions opened via "View tickets", use their stored screenshots;
  // for the live session, use the current in-memory ones.
  const screenshots: ScreenshotData[] = options?.sessionId && currentSession?.screenshots?.length
    ? [...currentSession.screenshots].reverse()
    : getScreenshots().slice().reverse();

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
  // Historical session: the global last-recording is a NEWER session's video.
  // buildReport's time gate can't catch that direction (newer video passes the
  // "started after session created" check), so strip it here — this report
  // feeds the tabs, AI prompt, and exports for this ticket.
  if (report && isHistoricalSession) report.video = undefined;
  const severity: import("../types").BugSeverity = report?.severity ?? "low";
  const timeline: import("../types").TimelineEntry[] = report?.timeline ?? [];

  _openModal(root, { title, description, screenshots, severity, timeline, currentSession, report, suppressVideo: isHistoricalSession });
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
    suppressVideo?: boolean;
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

  // Optional screen recording — only show if it belongs to this session
  // (getSessionVideo gates by startedAt vs session.createdAt, same rule the
  // exporters use via buildReport). Also suppressed for historical sessions
  // (data.suppressVideo) since the last recording is global and would bleed
  // into older tickets.
  const video = !data.suppressVideo ? getSessionVideo(data.currentSession) : null;

  // Severity badge \u2014 colors match SEVERITY_COLORS in issues-panel.
  // Priority is the tester's call \u2014 the dropdown starts as an unset
  // placeholder and only shows a value the user explicitly picked (persisted
  // on the session). The auto severity badge was removed from the header: it
  // sat next to the dropdown showing a system-guessed "MEDIUM" and read as a
  // duplicate/pre-made triage. Auto severity still lives in the Info tab.
  const userPriority = data.currentSession?.priority ?? null;

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
      <select data-action="set-priority" class="tb-qb-priority" aria-label="Priority" title="Priority — your triage call">
        <option value="" disabled hidden${userPriority ? "" : " selected"}>Priority</option>
        ${(["high", "medium", "low"] as const).map((p) => `<option value="${p}"${userPriority === p ? " selected" : ""}>${priorityLabel(p)}</option>`).join("")}
      </select>
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
            <video id="tb-qb-video" controls preload="auto" playsinline src="${video.url || video.dataUrl}" class="tb-qb-video"></video>
            <button data-action="grab-frame" class="tb-qb-grab-frame" title="Pause the video on the moment you want, then click to save that exact frame as a screenshot you can annotate &amp; attach">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Grab frame
            </button>
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
            <button data-action="annotate-primary" data-ss-id="${escapeHtml(primary.id)}" class="tb-qb-primary-edit" title="Annotate this screenshot" aria-label="Annotate screenshot">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Annotate</span>
            </button>
          </div>
          <div id="tb-qb-primary-meta" class="tb-qb-imgmeta">${escapeHtml(primary.filename)} \u00B7 ${primary.width}x${primary.height}</div>
        ` : !video && !primary ? `
          <div class="tb-qb-preview tb-qb-preview-empty">
            <span>No screenshots \u2014 add one only if you want to</span>
            <button data-action="add-screenshot" class="tb-qb-empty-shot" title="Capture a screenshot of the current page">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Take screenshot
            </button>
          </div>
        ` : ""}

        ${video && data.timeline.length > 0 ? `
          <div id="tb-qb-scrubber" class="tb-qb-scrubber-wrap"></div>
        ` : ""}

        ${ssCount > 0 ? `
          <div class="tb-qb-ss-header">
            <span class="tb-qb-ss-count">${ssCount} screenshot${ssCount === 1 ? "" : "s"}</span>
            <span class="tb-qb-ss-hint">Click any to annotate</span>
            <button data-action="add-screenshot" class="tb-qb-ss-add" title="${video ? "Capture a fresh screenshot of the current page (use “Grab frame” on the video for a video frame)" : "Capture a fresh screenshot of the current page"}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Add page shot
            </button>
          </div>
          <div class="tb-qb-thumbs">
            ${screenshots.map((ss, i) => `
              <div class="tb-qb-thumb-wrap">
                <button data-thumb-index="${i}" title="${escapeHtml(ss.filename)} — click to annotate" class="tb-qb-thumb">
                  <img src="${ss.dataUrl}" alt="Step ${i + 1}" />
                  <span class="tb-qb-thumb-num">${i + 1}</span>
                  <span class="tb-qb-thumb-edit">✎</span>
                </button>
                <button data-delete-screenshot="${escapeHtml(ss.id)}" class="tb-qb-thumb-del" title="Delete screenshot ${i + 1}" aria-label="Delete screenshot ${i + 1}">✕</button>
              </div>
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

        <details class="tb-qb-desc-wrap" open>
          <summary class="tb-qb-desc-summary">Description — editable, included in exports</summary>
          <textarea id="tb-qb-desc" class="tb-qb-textarea">${escapeHtml(data.description)}</textarea>
        </details>
      </div>

      <!-- RIGHT: tab strip + tab panels -->
      <div class="tb-qb-right">
        <div class="tb-qb-tabstrip" role="tablist">
          <button data-tab="info" class="tb-qb-tab tb-qb-tab-active" role="tab">Info</button>
          <button data-tab="actions" class="tb-qb-tab" role="tab">Actions${actionsCount ? `<span class="tb-qb-tab-badge">${actionsCount}</span>` : ""}</button>
          <button data-tab="console" class="tb-qb-tab" role="tab">Console${consoleCount ? `<span class="tb-qb-tab-badge">${consoleCount}</span><span class="tb-qb-tab-dot"></span>` : ""}</button>
          <button data-tab="network" class="tb-qb-tab" role="tab">Network${networkCount ? `<span class="tb-qb-tab-badge">${networkCount}</span><span class="tb-qb-tab-dot"></span>` : ""}</button>
          <button data-tab="ai" class="tb-qb-tab" role="tab">AI</button>
          ${/* NOTES-TAB: hidden for now — the annotations flow isn't wired into
               this modal yet, so the tab was always empty. Restore the button
               below (and its panel) when notes become actionable here. */ ""}
          ${annotationsCount ? `<button data-tab="annotations" class="tb-qb-tab" role="tab">Notes<span class="tb-qb-tab-badge">${annotationsCount}</span></button>` : ""}
        </div>
        <div class="tb-qb-tabpanels">
          <div data-panel="info" class="tb-qb-panel tb-qb-panel-active">${_buildInfoTab(data.report, data.currentSession)}</div>
          <div data-panel="console" class="tb-qb-panel" hidden>${_buildConsoleTab(data.report)}</div>
          <div data-panel="network" class="tb-qb-panel" hidden>${_buildNetworkTab(data.report)}</div>
          <div data-panel="actions" class="tb-qb-panel" hidden>${_buildActionsTab(data.report)}</div>
          <div data-panel="ai" class="tb-qb-panel" hidden>${_buildAITab(data.report)}</div>
          ${annotationsCount ? `<div data-panel="annotations" class="tb-qb-panel" hidden>${_buildAnnotationsTab(data.currentSession)}</div>` : ""}
        </div>
      </div>
    </div>

    <!-- Footer: export actions -->
    <div class="tb-qb-footer">
      <div class="tb-qb-actions">
        <button data-action="save-ticket" class="tb-qb-btn tb-qb-btn-save${data.currentSession?.saved ? " tb-qb-btn-saved" : ""}" title="Save this ticket to your Saved Tickets list">
          ${data.currentSession?.saved
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Ticket`}
        </button>
        <button data-action="${_githubRepo ? "open-github" : "github"}" class="tb-qb-btn tb-qb-btn-primary" title="${_githubRepo ? `Open a prefilled GitHub issue (${escapeHtml(_githubRepo)})` : "Copy a ready-to-paste GitHub issue"}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          ${_githubRepo ? "Open in GitHub" : "Copy GitHub Issue"}
        </button>
        <button data-action="ai-prompt" class="tb-qb-btn tb-qb-btn-ai" title="Turn this bug into a structured AI prompt and open it in Claude / ChatGPT to get a fix">${_ic("sparkles")} Fix with AI</button>
        <button data-action="export-replay" class="tb-qb-btn" title="Bundle the whole session into one offline .html you can share">${_ic("fileCode")} Export .html</button>
        <button data-action="export-har" class="tb-qb-btn" title="Export captured network activity as a standard .har file (opens in DevTools, Charles, Postman)">${_ic("network")} Export HAR</button>
        <!-- PHASE2-CLOUD: share link button disabled for Phase 1 offline release
        <button data-action="share-link" class="tb-qb-btn" title="Upload and copy a shareable link (sign-in required)">🔗 Share link</button>
        PHASE2-CLOUD -->
        <div class="tb-qb-more">
          <button data-action="more-toggle" class="tb-qb-btn tb-qb-more-btn" aria-haspopup="true" aria-expanded="false" title="More export options">More ▾</button>
          <div class="tb-qb-more-menu" data-open="false" role="menu">
            ${_githubRepo ? `<button data-action="github" class="tb-qb-more-item" role="menuitem">${_ic("copy")} Copy GitHub markdown</button>` : ""}
            <button data-action="linear" class="tb-qb-more-item" role="menuitem">${_ic("triangle")} Linear</button>
            <button data-action="slack" class="tb-qb-more-item" role="menuitem">${_ic("message")} Slack</button>
            <button data-action="jira" class="tb-qb-more-item" role="menuitem">${_ic("ticket")} Jira</button>
            <button data-action="integrations-configure" class="tb-qb-more-item" role="menuitem">${_ic("settings")} Configure integrations…</button>
          </div>
        </div>
      </div>
      <div class="tb-qb-tip">
        <span>Tip: <kbd>Ctrl+Shift+B</kbd> to quick-capture anytime</span>
        <span class="tb-qb-tip-right"><span>Draft auto-saved</span></span>
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

  // Remember what had focus so we can restore it when the modal closes
  // (WCAG 2.4.3 focus order). Guard against our own root element.
  const _prevFocus = document.activeElement as HTMLElement | null;

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
    // Chip markers above the track: annotations/markings + blurs. Screenshots
    // are added automatically by the scrubber from `screenshots`.
    const extraMarkers: { timestamp: number; kind: "screenshot" | "note" | "annotation" | "blur"; label: string }[] = [];
    try {
      for (const a of getElementAnnotations()) extraMarkers.push({ timestamp: a.timestamp, kind: "annotation", label: a.comment ? `Note: ${a.comment.slice(0, 40)}` : "Annotation added" });
      for (const d of getDrawRegions()) extraMarkers.push({ timestamp: d.timestamp, kind: d.shape === "redact" ? "blur" : "annotation", label: d.shape === "redact" ? "Redaction added" : "Marking added" });
      for (const b of getBlurEvents()) extraMarkers.push({ timestamp: b.timestamp, kind: "blur", label: "Blur added" });
    } catch {}
    _scrubberCtl = mountReplayScrubber(scrubberHost, {
      timeline: data.timeline,
      screenshots: ssForScrub,
      videoEl,
      extraMarkers,
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
    // Tear down the scrubber first — it owns a setTimeout playback chain that
    // would otherwise keep firing against the detached modal DOM.
    try { _scrubberCtl?.destroy(); } catch {}
    _scrubberCtl = null;
    // Cancel the pending draft-autosave debounce so it can't fire post-close.
    clearTimeout(saveTimer);
    overlay.remove();
    document.removeEventListener("keydown", escHandler);
    const k = (overlay as any).__tbModalKey;
    if (k) document.removeEventListener("keydown", k);
    // Restore focus to the element that opened the modal (WCAG 2.4.3).
    try { if (_prevFocus && _prevFocus.isConnected) _prevFocus.focus(); } catch {}
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

  // ── Priority selector — persist the tester's triage call + refresh Info ──
  modal.querySelector('[data-action="set-priority"]')?.addEventListener("change", (e) => {
    const val = (e.target as HTMLSelectElement).value as import("../types").BugPriority;
    const sid = data.currentSession?.sessionId;
    if (sid) setSessionPriority(sid, val);
    if (data.report) data.report.priority = val;
    const infoPanel = modal.querySelector('[data-panel="info"]');
    if (infoPanel) infoPanel.innerHTML = _buildInfoTab(data.report, data.currentSession ?? null);
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
  const TAB_ORDER = ["info", "actions", "console", "network", "ai", "annotations"];
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
  // Stash so a refresh (which removes the DOM without calling close()) can also
  // detach it — otherwise every screenshot refresh leaked two document keydown
  // listeners pointing at the discarded overlay.
  (overlay as any).__tbEscKey = escHandler;

  // Open in GitHub — prefilled URL, opens new tab (no API key needed)
  const openGhBtn = modal.querySelector('[data-action="open-github"]');
  if (openGhBtn && _githubRepo) {
    openGhBtn.addEventListener("click", async () => {
      const { title, description } = getDraft();
      const report = _reportFromDraft(title, description);
      if (!report) { showToast("No session data yet", root); return; }
      // Real API (BYO-token) when configured; otherwise the prefilled-URL flow.
      if (hasIntegration("github") && await _fileViaTracker("github", report, root, screenshots, close)) return;
      const repo = _githubRepo!; // checked in outer if
      const ok = openGitHubIssue(repo, report);
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
    if (hasIntegration("github")) {
      const report = _reportFromDraft(title, description);
      if (report && await _fileViaTracker("github", report, root, screenshots, close)) return;
    }
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

  // Save Ticket \u2014 marks this session as explicitly saved so it appears in the
  // Saved Tickets list. Without saving, the list stays empty.
  const saveTicketBtn = modal.querySelector<HTMLButtonElement>('[data-action="save-ticket"]');
  if (saveTicketBtn) {
    saveTicketBtn.addEventListener("click", () => {
      const sid = data.currentSession?.sessionId;
      if (!sid) return;
      // Persist this ticket's screenshots onto the session record NOW.
      // Without this they were only stashed when the NEXT session started,
      // so a saved ticket lost its thumbnails if the SDK was torn down first
      // (extension ✕ → destroy). Live sessions only — a historical ticket
      // opened from the saved list must not inherit the current global shots.
      if (!data.suppressVideo && data.currentSession) {
        const liveShots = getScreenshots();
        if (liveShots.length > 0) data.currentSession.screenshots = liveShots.slice(0, 5);
      }
      markSessionSaved(sid);
      saveTicketBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Saved`;
      saveTicketBtn.classList.add("tb-qb-btn-saved");
      saveTicketBtn.disabled = true;
      showToast("\u2713 Ticket saved \u2014 find it in the toolbar list", root);
    });
  }

  // Plain Text + Download Screenshots buttons were cut from v1 \u2014 devs paste
  // GitHub markdown anywhere; explicit screenshot downloads happen as part
  // of the GitHub/Jira export flow.

  // "More \u25be" export menu \u2014 toggle open/closed; close on outside click or after
  // an option is picked (each option keeps its own data-action handler).
  const moreBtn = modal.querySelector<HTMLButtonElement>('[data-action="more-toggle"]');
  const moreMenu = modal.querySelector<HTMLElement>(".tb-qb-more-menu");
  if (moreBtn && moreMenu) {
    const setMoreOpen = (open: boolean) => {
      moreMenu.dataset.open = open ? "true" : "false";
      moreBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setMoreOpen(moreMenu.dataset.open !== "true");
    });
    moreMenu.addEventListener("click", () => setMoreOpen(false));
    modal.addEventListener("click", (e) => {
      if (moreMenu.dataset.open === "true" && !moreMenu.contains(e.target as Node) && e.target !== moreBtn) setMoreOpen(false);
    });
  }

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
      // Historical ticket: the restored recording belongs to a newer session.
      if (data.suppressVideo) report.video = undefined;
      // Carry what the user actually typed into the export — buildReport only
      // knows the auto-generated title/steps, not the edited ticket fields.
      const draft = getDraft();
      if (draft.title.trim()) report.title = draft.title.trim();
      const userDesc = draft.description.trim();
      const result = await exportSessionAsHtml(data.currentSession, report, {
        descriptionOverride: userDesc
          ? (report.steps ? `${userDesc}\n\n${report.steps}` : userDesc)
          : undefined,
      });
      const sizeMb = (result.sizeBytes / (1024 * 1024)).toFixed(1);
      showToast(`\u2713 Replay exported \u00b7 ${sizeMb} MB`, root);
      // Offer the agent hand-off: the export is exactly what the MCP server
      // reads, so the natural next step is pasting this prompt into Claude
      // Code / Cursor next to the codebase that owns the bug.
      showMcpHandoffCard(result.filename);
    } catch (err) {
      console.warn("[TraceBug] HTML replay export failed:", err);
      showToast("Replay export failed", root);
    }
  });

  // Export HAR — standard HTTP Archive of the captured network activity.
  modal.querySelector('[data-action="export-har"]')?.addEventListener("click", () => {
    if (!data.currentSession) {
      showToast("No session to export yet", root);
      return;
    }
    try {
      const report = buildReport(data.currentSession);
      const requests = report.networkRequests?.length || report.networkErrors?.length || 0;
      if (requests === 0) {
        showToast("No network activity captured to export", root);
        return;
      }
      const result = exportSessionAsHar(report);
      showToast(`✓ HAR exported · ${result.entryCount} request${result.entryCount === 1 ? "" : "s"}`, root);
    } catch (err) {
      console.warn("[TraceBug] HAR export failed:", err);
      showToast("HAR export failed", root);
    }
  });

  /* PHASE2-CLOUD: share link handler disabled for Phase 1 offline release
  const shareBtn = modal.querySelector<HTMLButtonElement>('[data-action="share-link"]');
  shareBtn?.addEventListener("click", async () => {
    if (!data.currentSession) {
      showToast("No session to share yet", root);
      return;
    }
    if (shareBtn?.dataset.busy === "1") return;
    const consentOk = await _confirmShareConsent(root);
    if (!consentOk) return;
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
      setBtnState("Bundling\u2026");
      showToast("Bundling report\u2026", root);
      const report = buildReport(data.currentSession);
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
      setBtnState("Uploading\u2026");
      showToast("Uploading to cloud\u2026", root);
      const result = await shareSessionAsLink(data.currentSession, report, { cloudEndpoint: _cloudEndpoint });
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
  PHASE2-CLOUD */

  // Fix with AI — generate a structured debug prompt, copy to clipboard,
  // and show a tiny popover with "Open in Claude / ChatGPT". No backend,
  // no API key — purely client-side prompt generation.
  modal.querySelector('[data-action="ai-prompt"]')?.addEventListener("click", (e) => {
    if (!data.currentSession) {
      showToast("No session to share yet", root);
      return;
    }
    try {
      const report = buildReport(data.currentSession);
      const prompt = generateAIPrompt(report);
      let copied = false;
      try {
        navigator.clipboard.writeText(prompt);
        copied = true;
      } catch {}
      // Fire a toast immediately so the user has loud, unmissable feedback
      // even if they don't notice the popover.
      const sizeKb = (prompt.length / 1024).toFixed(1);
      showToast(
        copied
          ? `✓ AI prompt copied · ${sizeKb} KB · pick an AI ↓`
          : `AI prompt ready · pick an AI ↓`,
        root,
      );
      showAIPromptPopover(e.currentTarget as HTMLElement, prompt, root);
    } catch (err) {
      console.warn("[TraceBug] AI prompt generation failed:", err);
      showToast("AI prompt failed — check console", root);
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
  modal.querySelector('[data-action="linear"]')!.addEventListener("click", async () => {
    const { title, description } = getDraft();
    const r = _reportFromDraft(title, description);
    if (!r) { showToast("No session data yet", root); return; }
    if (hasIntegration("linear") && await _fileViaTracker("linear", r, root, screenshots, close)) return;
    const ok = openLinearIssue(r);
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
    const r = _reportFromDraft(title, description);
    if (!r) { showToast("No session data yet", root); return; }
    if (hasIntegration("slack") && await _fileViaTracker("slack", r, root, screenshots, close)) return;
    const text = generateSlackPost(r, description);
    const ok = await _copyToClipboard(text);
    showToast(ok ? "\u2713 Slack-formatted summary copied" : "Copy failed", root);
    if (ok && screenshots.length) _downloadAllScreenshots(screenshots);
    _clearDraft();
    setTimeout(close, 300);
  });

  // AI tab — Configure (BYO-key modal) + Generate (run analysis). Delegated so
  // the handlers survive the AI panel re-rendering after a config save.
  modal.addEventListener("click", (e) => {
    const action = (e.target as HTMLElement).closest?.("[data-action]")?.getAttribute("data-action");
    if (action === "ai-configure") {
      showAIConfigModal(root, () => _rerenderAITab(modal, data));
    } else if (action === "ai-generate") {
      void _runAIAnalysis(root, modal, data);
    } else if (action === "integrations-configure") {
      showIntegrationsConfigModal(root, () => {});
    }
  });

  // Thumbnail strip: click \u2192 open the annotation editor on that screenshot.
  // Saved edits are merged back via updateScreenshot() and the modal
  // re-renders so the new annotated version replaces the thumb in place.
  modal.querySelectorAll<HTMLButtonElement>("[data-thumb-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.thumbIndex);
      const target = screenshots[idx];
      if (!target) return;
      try {
        showAnnotationEditor(target, root, (patch) => {
          updateScreenshot(target.id, patch);
          // Re-render the modal so the new dataUrl flows through.
          refreshQuickBugCapture(root).catch(() => {});
        });
      } catch (err) {
        console.warn("[TraceBug] Annotation editor failed:", err);
        showToast("Couldn't open annotation editor", root);
      }
    });
  });

  // Annotate button overlaid on the primary screenshot preview.
  modal.querySelector('[data-action="annotate-primary"]')?.addEventListener("click", () => {
    const ssId = (modal.querySelector('[data-action="annotate-primary"]') as HTMLElement)?.dataset?.ssId;
    const target = screenshots.find((s) => s.id === ssId) || screenshots[0];
    if (!target) return;
    try {
      showAnnotationEditor(target, root, (patch) => {
        updateScreenshot(target.id, patch);
        refreshQuickBugCapture(root).catch(() => {});
      });
    } catch (err) {
      console.warn("[TraceBug] Annotation editor failed:", err);
      showToast("Couldn't open annotation editor", root);
    }
  });

  // Delete-screenshot buttons on each thumb.
  modal.querySelectorAll<HTMLButtonElement>("[data-delete-screenshot]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteScreenshot;
      if (!id) return;
      removeScreenshot(id);
      const remaining = getScreenshots().length;
      showToast(
        remaining === 0
          ? "Last screenshot removed"
          : `Screenshot removed \u00b7 ${remaining} left`,
        root,
      );
      refreshQuickBugCapture(root).catch(() => {});
    });
  });

  // "+ Add" button in the screenshots header \u2014 captures another shot and
  // refreshes the modal in place. Saves the close-reopen dance.
  modal.querySelector('[data-action="add-screenshot"]')?.addEventListener("click", async () => {
    // Region drag-select. Hide the modal first so the user can see and select
    // the page underneath, capture the chosen area, then restore + refresh.
    const prevModal = modal.style.display;
    const prevOverlay = overlay.style.display;
    modal.style.display = "none";
    overlay.style.display = "none";
    showToast("Drag to select a region \u2014 Esc to cancel", root);
    let captured: ScreenshotData | null = null;
    try {
      captured = await captureRegionScreenshot();
    } catch {
      // treated as cancel below
    } finally {
      modal.style.display = prevModal;
      overlay.style.display = prevOverlay;
    }
    if (captured) {
      showToast(`\u2713 Screenshot ${getScreenshots().length} added`, root);
      refreshQuickBugCapture(root).catch(() => {});
    } else {
      showToast("Screenshot cancelled", root);
    }
  });

  // "Grab frame" — captures the CURRENT video frame (pausing first so the saved
  // image matches exactly what the reviewer sees) and adds it as a screenshot.
  // This is the useful capture while reviewing a recording; the page-shot button
  // above just snaps the live page.
  modal.querySelector('[data-action="grab-frame"]')?.addEventListener("click", () => {
    const v = modal.querySelector<HTMLVideoElement>("#tb-qb-video");
    if (!v) return;
    if (!v.paused) { try { v.pause(); } catch {} }
    if (!v.videoWidth || !v.videoHeight) {
      showToast("Video still loading — try again in a moment", root);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const t = Math.floor(v.currentTime || 0);
      const mm = String(Math.floor(t / 60)).padStart(2, "0");
      const ss2 = String(t % 60).padStart(2, "0");
      const n = getScreenshots().length + 1;
      pushScreenshot({
        id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        dataUrl,
        filename: `${String(n).padStart(2, "0")}_frame_${mm}-${ss2}.png`,
        eventContext: `Video frame at ${mm}:${ss2}`,
        page: window.location.pathname,
        width: canvas.width,
        height: canvas.height,
      });
      showToast(`✓ Frame at ${mm}:${ss2} added`, root);
      refreshQuickBugCapture(root).catch(() => {});
    } catch {
      showToast("Couldn't grab that frame", root);
    }
  });

  // Video controls: download button + jump-to-comment chips.
  const videoEl = modal.querySelector<HTMLVideoElement>("#tb-qb-video");
  // Chrome MediaRecorder quirk: a streamed WebM has no duration header, so the
  // <video> element reports Infinity (or just the first cluster's length) and
  // the native controls cap playback/seeking there — a 1-min recording "ends"
  // after a few seconds. Seeking far past the end forces Chrome to scan the
  // whole file and emit the real duration, then we snap back to 0. The .webm
  // download and the .html export are unaffected (players parse the full
  // stream / the export scrubber uses the recorded durationMs).
  if (videoEl && video) {
    const expectedS = (video.durationMs || 0) / 1000;
    // Paint the first frame so the preview isn't a black rectangle at rest.
    // A raw MediaRecorder WebM shows nothing until it's decoded to a specific
    // position — and seeking to EXACTLY 0 often doesn't trigger a repaint, so
    // we nudge to a tiny non-zero time. `_painted` guards against re-nudging
    // once the user starts scrubbing/playing.
    let _painted = false;
    const paintFirstFrame = () => {
      if (_painted) return;
      _painted = true;
      try { videoEl.currentTime = 0.05; } catch {}
    };
    const handleMeta = () => {
      const d = videoEl.duration;
      const broken = d === Infinity || Number.isNaN(d) || (expectedS > 1 && d < expectedS - 1.5);
      if (!broken) { paintFirstFrame(); return; }
      const snapBack = () => {
        videoEl.removeEventListener("seeked", snapBack);
        _painted = true;
        try { videoEl.currentTime = 0.05; } catch {}
      };
      videoEl.addEventListener("seeked", snapBack);
      try { videoEl.currentTime = 1e7; } catch { videoEl.removeEventListener("seeked", snapBack); paintFirstFrame(); }
    };
    // The <video> src is set in the initial HTML, so a blob URL can reach
    // HAVE_METADATA / HAVE_CURRENT_DATA BEFORE these listeners attach. Act on
    // the current readyState immediately, subscribe for what's pending.
    if (videoEl.readyState >= 1) handleMeta();
    else videoEl.addEventListener("loadedmetadata", handleMeta, { once: true });
    if (videoEl.readyState >= 2) paintFirstFrame();
    else videoEl.addEventListener("loadeddata", paintFirstFrame, { once: true });

    // ── CSP fallback ────────────────────────────────────────────────────
    // On strict host pages (corporate sites, etc.) the page's CSP media-src
    // blocks blob:/data: video, so an INJECTED <video> renders controls but
    // no picture. The blob itself is fine — Download .webm and Export .html
    // (a standalone file with no CSP) both play it. Detect the block and
    // replace the black box with a clear explanation instead of a mystery.
    const preview = videoEl.closest(".tb-qb-preview") as HTMLElement | null;
    let _blockedShown = false;
    const showBlockedNotice = () => {
      if (_blockedShown || !preview) return;
      // networkState 3 = NETWORK_NO_SOURCE; a valid-but-slow local blob reaches
      // readyState>=1 well within the timeout, so this only trips on a real block.
      _blockedShown = true;
      preview.style.background = "var(--tb-bg-secondary)";
      preview.innerHTML = `
        <div style="padding:26px 18px;text-align:center;color:var(--tb-text-secondary,#9aa0aa);font-size:12px;line-height:1.65">
          <div style="font-size:24px;margin-bottom:8px">🎬</div>
          <div style="color:var(--tb-text-primary,#e0e0e0);font-weight:600;margin-bottom:6px">Inline preview blocked by this page</div>
          This site's security policy (CSP) blocks embedded video. Your ${_formatVideoTime(video.durationMs)} recording is fine —
          use <strong>Download .webm</strong> below or <strong>Export .html</strong> to watch it.
        </div>`;
    };
    videoEl.addEventListener("error", showBlockedNotice);
    setTimeout(() => {
      if (!_blockedShown && videoEl.readyState === 0) showBlockedNotice();
    }, 2500);
  }
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

// Build a report from the latest session for an export action: newest session,
// user's title, and their description prepended to the auto-generated steps.
function _reportFromDraft(title: string, description: string): BugReport | null {
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const session = sessions[0];
  if (!session) return null;
  const report = buildReport(session);
  report.title = title;
  report.steps = `${description}\n\n---\n\n${report.steps}`;
  return report;
}

// File the report via a configured real integration (GitHub/Linear/Slack API).
// Returns true if it ran the full success flow; false on error so the caller
// can fall back to the URL-prefill / copy path.
async function _fileViaTracker(
  provider: TrackerProvider,
  report: BugReport,
  root: HTMLElement,
  screenshots: ScreenshotData[],
  close: () => void,
): Promise<boolean> {
  showToast(`Creating ${TRACKER_LABELS[provider]}…`, root);
  try {
    const result = await createTrackerIssue(provider, report);
    const ref = result.ref ? ` ${result.ref}` : "";
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      showToast(`✓ ${TRACKER_LABELS[provider]} issue created${ref}`, root);
    } else {
      showToast(`✓ Sent to ${TRACKER_LABELS[provider]}`, root);
    }
    if (screenshots.length) _downloadAllScreenshots(screenshots);
    _downloadVideoIfPresent();
    _clearDraft();
    setTimeout(close, 300);
    return true;
  } catch (err) {
    showToast(`${TRACKER_LABELS[provider]} failed: ${(err as Error)?.message || "error"}`, root);
    return false;
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

// \u2500\u2500 Tab content builders \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// One function per tab. Each receives whatever subset of report/session it
// needs and returns HTML for the right-pane panel.

function _getElementAnnotationCount(): number {
  try { return getElementAnnotations().length + getDrawRegions().length; } catch { return 0; }
}

function _kvRow(label: string, value: string, icon?: string): string {
  // No value → no row. Unknown env fields (connection, device…) previously
  // rendered as empty label-only rows.
  if (!value || !value.trim()) return "";
  const iconHtml = icon ? `<span class="tb-qb-kv-icon">${icon}</span>` : "";
  return `<div class="tb-qb-kv"><span class="tb-qb-kv-k">${escapeHtml(label)}</span><span class="tb-qb-kv-v">${iconHtml}${escapeHtml(value)}</span></div>`;
}

// Lucide icons (inline SVG, currentColor) — keeps the widget/export
// self-contained (no external assets) with a clean, consistent icon set.
const _LU: Record<string, string> = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  chrome: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" x2="12" y1="8" y2="8"/><line x1="3.95" x2="8.54" y1="6.06" y2="14"/><line x1="10.88" x2="15.46" y1="21.94" y2="14"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  fileCode: '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  triangle: '<path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
};
function _ic(name: keyof typeof _LU | string): string {
  const paths = _LU[name] || _LU.globe;
  return `<svg class="tb-lu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Map browser/OS/device/connection to a clean Lucide glyph. Lucide dropped
// brand icons, so browsers/OSes use neutral shapes — the name is shown as
// text beside the icon anyway.
function _browserIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("chrome") || n.includes("edge") || n.includes("brave")) return _ic("chrome");
  return _ic("globe");
}
function _osIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("ios") || n.includes("iphone") || n.includes("ipad") || n.includes("android")) return _ic("smartphone");
  return _ic("monitor");
}
function _deviceIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n === "tablet" || n === "mobile") return _ic("smartphone");
  return _ic("monitor");
}
function _connectionIcon(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("wifi")) return _ic("wifi");
  if (n.includes("ethernet")) return _ic("plug");
  if (n.includes("5g") || n.includes("4g") || n.includes("3g") || n.includes("cellular")) return _ic("signal");
  return _ic("globe");
}

function _buildInfoTab(report: import("../types").BugReport | null, session: StoredSession | null): string {
  const env = report?.environment || session?.environment || captureEnvironment();
  const ctx = report?.context || {};
  const sevLabel = severityBadge(report?.severity || "low");
  const rows: string[] = [];
  rows.push(_kvRow("URL", env.url || window.location.href, _ic("link")));
  rows.push(_kvRow("Timestamp", new Date(env.timestamp || Date.now()).toLocaleString(), _ic("clock")));
  rows.push(_kvRow("OS", env.os || "", _osIcon(env.os)));
  rows.push(_kvRow("Browser", `${env.browser || ""} ${env.browserVersion || ""}`.trim(), _browserIcon(env.browser)));
  rows.push(_kvRow("Viewport", env.viewport || "", _ic("ruler")));
  rows.push(_kvRow("Screen", env.screenResolution || "", _ic("monitor")));
  rows.push(_kvRow("Device", env.deviceType || "", _deviceIcon(env.deviceType)));
  rows.push(_kvRow("Language", env.language || "", _ic("languages")));
  rows.push(_kvRow("Timezone", env.timezone || "", _ic("globe")));
  rows.push(_kvRow("Connection", env.connectionType || "", _connectionIcon(env.connectionType)));
  rows.push(_kvRow("Session", (session?.sessionId || "").slice(0, 12), _ic("hash")));
  rows.push(_kvRow("Severity", sevLabel));
  // Priority appears only when the tester explicitly picked one — the
  // report-level fallback (derived from severity) is not their triage call.
  if (session?.priority) rows.push(_kvRow("Priority", priorityLabel(session.priority), _ic("flag")));
  const ctxKeys = Object.keys(ctx);
  if (ctxKeys.length > 0) {
    rows.push(`<div class="tb-qb-sec-head">Custom context</div>`);
    for (const k of ctxKeys) {
      rows.push(_kvRow(k, String(ctx[k])));
    }
  }
  // Web Storage snapshot (sensitive values already redacted at capture).
  const storage = report?.storage;
  if (storage) {
    const renderArea = (label: string, entries: import("../types").StorageEntry[] | undefined, dropped?: number) => {
      if (!entries || entries.length === 0) return;
      rows.push(`<div class="tb-qb-sec-head">${label} (${entries.length}${dropped ? `, +${dropped} not captured` : ""})</div>`);
      const shown = entries.slice(0, 20);
      for (const e of shown) {
        rows.push(_kvRow(e.key, e.redacted ? `🔒 ${e.value}` : e.value));
      }
      if (entries.length > shown.length) {
        rows.push(_kvRow("…", `+${entries.length - shown.length} more`));
      }
    };
    renderArea("localStorage", storage.local, storage.localTruncated);
    renderArea("sessionStorage", storage.session, storage.sessionTruncated);
    renderArea("Cookies", storage.cookies, storage.cookiesTruncated);
    // Say so explicitly when the page had nothing — an absent section reads
    // as "capture broken", not "storage empty".
    const total = (storage.local?.length || 0) + (storage.session?.length || 0) + (storage.cookies?.length || 0);
    if (total === 0) {
      rows.push(`<div class="tb-qb-sec-head">Web storage — empty on this page</div>`);
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
      <input id="tb-qb-con-search" type="search" placeholder="Filter" aria-label="Filter console feed" class="tb-qb-net-search" />
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
      <input id="tb-qb-net-search" type="search" placeholder="Filter requests" aria-label="Filter network requests" class="tb-qb-net-search" />
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
  const aiConfig = getAIConfig();
  const hasKey = !!aiConfig && (aiConfig.provider === "ollama" || !!aiConfig.apiKey);
  const deterministic = rootCause ? `
    <div class="tb-qb-ai-card">
      <div class="tb-qb-ai-card-head">Pattern-based hint <span class="tb-qb-ai-conf tb-qb-ai-conf-${rootCause.confidence}">${rootCause.confidence}</span></div>
      <div class="tb-qb-ai-card-body">${escapeHtml(rootCause.hint)}</div>
    </div>
  ` : "";
  const providerLine = hasKey
    ? `${escapeHtml(PROVIDER_LABELS[aiConfig!.provider])} \u00B7 ${escapeHtml(aiConfig!.model)}`
    : "";
  const llmBlock = hasKey ? `
    <div class="tb-qb-ai-card" data-ai-llm-card>
      <div class="tb-qb-ai-card-head">AI Debugger <span class="tb-qb-ai-provider">${providerLine}</span></div>
      <div class="tb-qb-ai-card-body" data-ai-output><em>Runs on your own key \u2014 the report is scrubbed of secret shapes, then sent directly to ${escapeHtml(PROVIDER_LABELS[aiConfig!.provider])}. TraceBug never sees it.</em></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="tb-qb-btn tb-qb-btn-accent" data-action="ai-generate">\u2728 Generate AI analysis</button>
        <button class="tb-qb-btn tb-qb-btn-ghost" data-action="ai-configure">Change key</button>
      </div>
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

// ── BYO-key LLM analysis wiring ────────────────────────────────────────────

type _AITabData = { report: import("../types").BugReport | null };

function _rerenderAITab(modal: HTMLElement, data: _AITabData): void {
  const panel = modal.querySelector('[data-panel="ai"]');
  if (panel) panel.innerHTML = _buildAITab(data.report);
}

async function _runAIAnalysis(root: HTMLElement, modal: HTMLElement, data: _AITabData): Promise<void> {
  const report = data.report;
  if (!report) { showToast("No report to analyze yet", root); return; }
  const card = modal.querySelector('[data-ai-llm-card]');
  const out = card?.querySelector<HTMLElement>('[data-ai-output]');
  const genBtn = card?.querySelector<HTMLButtonElement>('[data-action="ai-generate"]');
  if (!out) return;

  if (genBtn) { genBtn.disabled = true; genBtn.textContent = "Analyzing…"; }
  out.innerHTML = '<div class="tb-qb-ai-loading">🤖 Running analysis on your key… this stays between your browser and the provider.</div>';

  try {
    const result = await runLLMAnalysis(report);
    const meta = result.usage?.outputTokens
      ? `<div class="tb-qb-ai-meta">${escapeHtml(result.model)} · ${result.usage.inputTokens ?? "?"}→${result.usage.outputTokens} tokens</div>`
      : `<div class="tb-qb-ai-meta">${escapeHtml(result.model)}</div>`;
    out.innerHTML = `<div class="tb-qb-ai-md">${_renderMarkdownLite(result.text)}</div>${meta}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    out.innerHTML = `<div class="tb-qb-ai-error">⚠️ ${escapeHtml(msg)}</div>`;
  } finally {
    if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = "✨ Regenerate"; }
  }
}

// Minimal, safe markdown → HTML: headings, bold, inline code, fenced code,
// and bullet lists. Everything is escaped first, so model output can't inject.
function _renderMarkdownLite(md: string): string {
  const esc = (s: string) => escapeHtml(s);
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false, inCode = false;
  const codeBuf: string[] = [];
  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) { html.push(`<pre class="tb-qb-ai-code">${esc(codeBuf.join("\n"))}</pre>`); codeBuf.length = 0; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = Math.min(6, h[1].length + 2); // ## -> h4-ish sizing
      html.push(`<div class="tb-qb-ai-h tb-qb-ai-h${level}">${_inlineMd(h[2])}</div>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { html.push('<ul class="tb-qb-ai-ul">'); inList = true; }
      html.push(`<li>${_inlineMd(li[1])}</li>`);
      continue;
    }
    if (line.trim() === "") { closeList(); continue; }
    closeList();
    html.push(`<p>${_inlineMd(line)}</p>`);
  }
  if (inCode && codeBuf.length) html.push(`<pre class="tb-qb-ai-code">${esc(codeBuf.join("\n"))}</pre>`);
  closeList();
  return html.join("");
}

function _inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// ── BYO-key config modal ──────────────────────────────────────────────────

function showAIConfigModal(root: HTMLElement, onSaved: () => void): void {
  document.getElementById("tb-ai-config")?.remove();
  const existing = getAIConfig();
  const provider: AIProvider = existing?.provider || "anthropic";

  const overlay = document.createElement("div");
  overlay.id = "tb-ai-config";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(5,7,12,0.65);backdrop-filter:blur(4px);" +
    "display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif";

  overlay.innerHTML = `
    <div style="width:100%;max-width:460px;background:#14161E;border:1px solid rgba(124,92,255,0.28);border-radius:14px;box-shadow:0 24px 72px rgba(0,0,0,0.6);color:#E6EDF3;overflow:hidden">
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">🤖 AI Debugger — bring your own key</div>
        <div style="font-size:12px;color:#94A3B8;line-height:1.45">Your key is stored only in this browser's localStorage. The report is scrubbed of secret shapes, then sent straight from your browser to the provider — TraceBug never sees it.</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:12px">
        <label style="font-size:12px;color:#94A3B8">Provider
          <select data-ai-provider style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:#0B0D12;color:#E6EDF3;font:inherit;font-size:13px">
            ${(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => `<option value="${p}" ${p === provider ? "selected" : ""}>${escapeHtml(PROVIDER_LABELS[p])}</option>`).join("")}
          </select>
        </label>
        <label data-ai-key-wrap style="font-size:12px;color:#94A3B8">API key
          <input data-ai-key type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" value="${escapeHtml(existing?.apiKey || "")}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:#0B0D12;color:#E6EDF3;font:inherit;font-size:13px" />
        </label>
        <label style="font-size:12px;color:#94A3B8">Model
          <input data-ai-model type="text" spellcheck="false" value="${escapeHtml(existing?.model || DEFAULT_MODELS[provider])}" style="width:100%;margin-top:4px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:#0B0D12;color:#E6EDF3;font:inherit;font-size:13px;font-family:ui-monospace,monospace" />
          <span data-ai-model-hint style="display:block;margin-top:5px;font-size:11px;color:#64748B"></span>
        </label>
      </div>
      <div style="padding:12px 14px;display:flex;gap:8px;align-items:center;background:#14161E;border-top:1px solid rgba(255,255,255,0.06)">
        <button data-ai-save style="flex:1;padding:10px 14px;border:0;border-radius:8px;cursor:pointer;background:#7C5CFF;color:#fff;font:600 13px system-ui,-apple-system,sans-serif">Save</button>
        <button data-ai-clear style="padding:10px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;background:transparent;color:#94A3B8;font:600 13px system-ui,-apple-system,sans-serif">Remove key</button>
        <button data-ai-close aria-label="Close" style="padding:10px 0;width:38px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;background:transparent;color:#94A3B8;font:600 14px system-ui,-apple-system,sans-serif">✕</button>
      </div>
    </div>`;

  const host = document.getElementById(MODAL_ID) || document.body;
  host.appendChild(overlay);

  const providerEl = overlay.querySelector<HTMLSelectElement>("[data-ai-provider]")!;
  const keyEl = overlay.querySelector<HTMLInputElement>("[data-ai-key]")!;
  const keyWrap = overlay.querySelector<HTMLElement>("[data-ai-key-wrap]")!;
  const modelEl = overlay.querySelector<HTMLInputElement>("[data-ai-model]")!;
  const hintEl = overlay.querySelector<HTMLElement>("[data-ai-model-hint]")!;

  function syncProviderUI() {
    const p = providerEl.value as AIProvider;
    keyWrap.style.display = p === "ollama" ? "none" : "";
    if (p === "anthropic") {
      hintEl.textContent = "Tiers: " + ANTHROPIC_MODEL_CHOICES.map((c) => c.id).join(" / ");
    } else if (p === "openai") {
      hintEl.textContent = "e.g. gpt-4o, gpt-4o-mini";
    } else {
      hintEl.textContent = "Local model tag, e.g. llama3.1 (Ollama must be running with CORS allowed).";
    }
  }
  providerEl.addEventListener("change", () => {
    modelEl.value = DEFAULT_MODELS[providerEl.value as AIProvider];
    syncProviderUI();
  });
  syncProviderUI();

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-ai-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-ai-clear]")?.addEventListener("click", () => {
    clearAIConfig();
    showToast("AI key removed", root);
    close();
    onSaved();
  });
  overlay.querySelector("[data-ai-save]")?.addEventListener("click", () => {
    const p = providerEl.value as AIProvider;
    const cfg: AIConfig = { provider: p, apiKey: keyEl.value.trim(), model: modelEl.value.trim() || DEFAULT_MODELS[p] };
    if (p !== "ollama" && !cfg.apiKey) { showToast("Enter an API key", root); keyEl.focus(); return; }
    setAIConfig(cfg);
    showToast("✓ AI provider saved", root);
    close();
    onSaved();
  });
}

function showIntegrationsConfigModal(root: HTMLElement, onSaved: () => void): void {
  document.getElementById("tb-int-config")?.remove();
  const cfg = getIntegrationsConfig();

  const overlay = document.createElement("div");
  overlay.id = "tb-int-config";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(5,7,12,0.65);backdrop-filter:blur(4px);" +
    "display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif";

  const fld = "width:100%;margin-top:4px;padding:8px 10px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;background:#0B0D12;color:#E6EDF3;font:inherit;font-size:13px";
  const lbl = "font-size:12px;color:#94A3B8";

  overlay.innerHTML = `
    <div style="width:100%;max-width:480px;max-height:88vh;overflow:auto;background:#14161E;border:1px solid rgba(124,92,255,0.28);border-radius:14px;box-shadow:0 24px 72px rgba(0,0,0,0.6);color:#E6EDF3">
      <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">🔗 Integrations — bring your own token</div>
        <div style="font-size:12px;color:#94A3B8;line-height:1.45">Tokens are stored only in this browser's localStorage. Issues are created by calling the provider directly from your browser — TraceBug has no backend in the path. Fill in only the providers you use.</div>
      </div>
      <div style="padding:16px 18px;display:flex;flex-direction:column;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:600;color:#E6EDF3;margin-bottom:6px">🐙 GitHub</div>
          <label style="${lbl}">Personal access token (repo scope)
            <input data-int-gh-token type="password" autocomplete="off" spellcheck="false" placeholder="ghp_…" value="${escapeHtml(cfg.github?.token || "")}" style="${fld}" /></label>
          <label style="${lbl};display:block;margin-top:8px">Repository (owner/repo)
            <input data-int-gh-repo type="text" spellcheck="false" placeholder="acme/app" value="${escapeHtml(cfg.github?.repo || "")}" style="${fld}" /></label>
          <label style="${lbl};display:block;margin-top:8px">Labels (comma-separated, optional)
            <input data-int-gh-labels type="text" spellcheck="false" placeholder="bug, tracebug" value="${escapeHtml((cfg.github?.labels || []).join(", "))}" style="${fld}" /></label>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#E6EDF3;margin-bottom:6px">△ Linear</div>
          <label style="${lbl}">Personal API key
            <input data-int-ln-key type="password" autocomplete="off" spellcheck="false" placeholder="lin_api_…" value="${escapeHtml(cfg.linear?.apiKey || "")}" style="${fld}" /></label>
          <label style="${lbl};display:block;margin-top:8px">Team ID
            <input data-int-ln-team type="text" spellcheck="false" placeholder="team UUID" value="${escapeHtml(cfg.linear?.teamId || "")}" style="${fld}" /></label>
        </div>
        <div>
          <div style="font-size:12px;font-weight:600;color:#E6EDF3;margin-bottom:6px">💬 Slack</div>
          <label style="${lbl}">Incoming webhook URL
            <input data-int-sl-hook type="password" autocomplete="off" spellcheck="false" placeholder="https://hooks.slack.com/services/…" value="${escapeHtml(cfg.slack?.webhookUrl || "")}" style="${fld}" /></label>
        </div>
      </div>
      <div style="padding:12px 14px;display:flex;gap:8px;align-items:center;background:#14161E;border-top:1px solid rgba(255,255,255,0.06)">
        <button data-int-save style="flex:1;padding:10px 14px;border:0;border-radius:8px;cursor:pointer;background:#7C5CFF;color:#fff;font:600 13px system-ui,-apple-system,sans-serif">Save</button>
        <button data-int-clear style="padding:10px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;background:transparent;color:#94A3B8;font:600 13px system-ui,-apple-system,sans-serif">Remove all</button>
        <button data-int-close aria-label="Close" style="padding:10px 0;width:38px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;background:transparent;color:#94A3B8;font:600 14px system-ui,-apple-system,sans-serif">✕</button>
      </div>
    </div>`;

  const host = document.getElementById(MODAL_ID) || document.body;
  host.appendChild(overlay);

  const val = (sel: string) => overlay.querySelector<HTMLInputElement>(sel)?.value.trim() || "";
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-int-close]")?.addEventListener("click", close);
  overlay.querySelector("[data-int-clear]")?.addEventListener("click", () => {
    clearIntegrationsConfig();
    showToast("Integrations removed", root);
    close();
    onSaved();
  });
  overlay.querySelector("[data-int-save]")?.addEventListener("click", () => {
    const next: IntegrationsConfig = {};
    const ghToken = val("[data-int-gh-token]"), ghRepo = val("[data-int-gh-repo]");
    if (ghToken && ghRepo) {
      const labels = val("[data-int-gh-labels]").split(",").map((s) => s.trim()).filter(Boolean);
      next.github = { token: ghToken, repo: ghRepo, labels: labels.length ? labels : undefined };
    }
    const lnKey = val("[data-int-ln-key]"), lnTeam = val("[data-int-ln-team]");
    if (lnKey && lnTeam) next.linear = { apiKey: lnKey, teamId: lnTeam };
    const slHook = val("[data-int-sl-hook]");
    if (slHook) next.slack = { webhookUrl: slHook };
    setIntegrationsConfig(next);
    showToast("✓ Integrations saved", root);
    close();
    onSaved();
  });
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
    /* Honor reduced-motion: disable the entrance + spinner animations (WCAG 2.3.3). */
    @media (prefers-reduced-motion: reduce) {
      #${MODAL_ID}, #${MODAL_ID} * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }

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
    #${MODAL_ID} .tb-qb-priority { font-size:11px; font-weight:600; padding:5px 8px; border-radius:8px; background:var(--tb-btn-hover); color:var(--tb-text-primary); border:1px solid var(--tb-border); cursor:pointer; }
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
    #${MODAL_ID} .tb-qb-preview { position:relative; border:1px solid var(--tb-border); border-radius:var(--tb-radius-md); overflow:hidden; margin-bottom:8px; background:#000; display:flex; align-items:center; justify-content:center; }
    #${MODAL_ID} .tb-qb-primary-edit { position:absolute; top:10px; right:10px; display:inline-flex; align-items:center; gap:6px; background:rgba(124,92,255,0.85); color:#fff; border:1px solid rgba(255,255,255,0.18); border-radius:var(--tb-radius-sm); padding:6px 11px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; backdrop-filter:blur(6px); transition:filter 0.15s, transform 0.1s; box-shadow:0 4px 14px rgba(0,0,0,0.35); }
    #${MODAL_ID} .tb-qb-primary-edit:hover { filter:brightness(1.1); transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-primary-edit svg { flex-shrink:0; }
    #${MODAL_ID} .tb-qb-preview-empty { flex-direction:column; gap:12px; padding:30px 16px; font-size:12px; color:var(--tb-text-muted); background:var(--tb-bg-secondary); border-style:dashed; }
    #${MODAL_ID} .tb-qb-empty-shot { display:inline-flex; align-items:center; gap:7px; background:var(--tb-accent); color:#fff; border:none; border-radius:var(--tb-radius-sm); padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit; transition:filter 0.15s; }
    #${MODAL_ID} .tb-qb-empty-shot:hover { filter:brightness(1.1); }
    #${MODAL_ID} .tb-qb-empty-shot svg { flex-shrink:0; }
    #${MODAL_ID} .tb-qb-grab-frame { position:absolute; top:10px; right:10px; z-index:2; display:inline-flex; align-items:center; gap:6px; background:rgba(11,11,15,0.74); color:#fff; border:1px solid rgba(255,255,255,0.2); border-radius:var(--tb-radius-sm); padding:6px 11px; font-size:12px; font-weight:600; cursor:pointer; font-family:inherit; backdrop-filter:blur(6px); transition:filter 0.15s, transform 0.1s; box-shadow:0 4px 14px rgba(0,0,0,0.4); }
    #${MODAL_ID} .tb-qb-grab-frame:hover { filter:brightness(1.25); transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-grab-frame svg { flex-shrink:0; }
    #${MODAL_ID} .tb-qb-video { display:block; width:100%; max-height:380px; background:#000; }
    #${MODAL_ID} .tb-qb-img { display:block; max-width:100%; max-height:380px; width:auto; margin:0 auto; }
    #${MODAL_ID} .tb-qb-vidmeta { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; color:var(--tb-text-muted); margin-bottom:12px; }
    #${MODAL_ID} .tb-qb-imgmeta { font-size:11px; color:var(--tb-text-muted); margin-bottom:12px; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-btn-sm { background:transparent; color:var(--tb-text-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); padding:5px 10px; cursor:pointer; font-size:11px; font-weight:500; font-family:inherit; transition:all 0.15s; }
    #${MODAL_ID} .tb-qb-btn-sm:hover { background:var(--tb-btn-hover); color:var(--tb-text-primary); border-color:var(--tb-border-hover); }
    #${MODAL_ID} .tb-qb-btn-dl { background:var(--tb-accent); color:#fff; border:1px solid var(--tb-accent); border-radius:var(--tb-radius-sm); padding:5px 10px; cursor:pointer; font-size:11px; font-weight:600; font-family:inherit; transition:filter 0.15s; display:inline-flex; align-items:center; gap:5px; }
    #${MODAL_ID} .tb-qb-btn-dl:hover { filter:brightness(1.1); }
    #${MODAL_ID} .tb-qb-scrubber-wrap { margin-bottom:14px; }
    /* Screenshot strip — count header + thumbs with delete + annotate */
    #${MODAL_ID} .tb-qb-ss-header { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:11px; color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-qb-ss-count { font-weight:600; color:var(--tb-text-primary); letter-spacing:-0.01em; }
    #${MODAL_ID} .tb-qb-ss-hint { color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-qb-ss-add { margin-left:auto; display:inline-flex; align-items:center; gap:5px; background:var(--tb-accent-soft, rgba(124,92,255,0.15)); color:var(--tb-accent); border:1px solid var(--tb-accent); border-radius:var(--tb-radius-sm); padding:4px 10px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit; transition:filter 0.15s; }
    #${MODAL_ID} .tb-qb-ss-add svg { flex-shrink:0; }
    #${MODAL_ID} .tb-qb-ss-add:hover { filter:brightness(1.15); }
    #${MODAL_ID} .tb-qb-thumbs { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    #${MODAL_ID} .tb-qb-thumb-wrap { position:relative; }
    #${MODAL_ID} .tb-qb-thumb-wrap:hover .tb-qb-thumb-del { opacity:1; transform:scale(1); }
    #${MODAL_ID} .tb-qb-thumb-wrap:hover .tb-qb-thumb-edit { opacity:1; }
    #${MODAL_ID} .tb-qb-thumb { position:relative; padding:0; border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); overflow:hidden; cursor:pointer; background:var(--tb-bg-secondary); width:84px; height:60px; transition:border-color 0.15s, transform 0.1s; display:block; }
    #${MODAL_ID} .tb-qb-thumb:hover { border-color:var(--tb-accent); transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
    #${MODAL_ID} .tb-qb-thumb-num { position:absolute; top:3px; left:3px; font-size:9px; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.7); background:rgba(0,0,0,0.6); border-radius:3px; padding:1px 5px; }
    #${MODAL_ID} .tb-qb-thumb-edit { position:absolute; bottom:3px; right:4px; font-size:11px; color:#fff; background:rgba(0,0,0,0.6); border-radius:3px; padding:0 4px; opacity:0; transition:opacity 0.15s; line-height:1.4; }
    #${MODAL_ID} .tb-qb-thumb-del { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:var(--tb-error, #ef4444); color:#fff; border:2px solid var(--tb-bg, #14161E); cursor:pointer; font-size:10px; font-weight:700; line-height:1; padding:0; display:flex; align-items:center; justify-content:center; opacity:0; transform:scale(0.85); transition:opacity 0.15s, transform 0.15s, filter 0.15s; font-family:inherit; }
    #${MODAL_ID} .tb-qb-thumb-del:hover { filter:brightness(1.1); }
    #${MODAL_ID} .tb-qb-thumb-del:focus-visible { opacity:1; transform:scale(1); outline:2px solid var(--tb-accent); outline-offset:2px; }
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
    #${MODAL_ID} .tb-qb-kv-icon { display:inline-flex; align-items:center; flex-shrink:0; color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-lu { width:14px; height:14px; display:inline-block; vertical-align:middle; flex-shrink:0; }
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
    #${MODAL_ID} .tb-qb-ai-provider { font-size:10px; padding:2px 8px; border-radius:999px; font-weight:700; letter-spacing:0.3px; text-transform:none; background:var(--tb-accent-soft); color:var(--tb-accent); }
    #${MODAL_ID} .tb-qb-ai-loading { font-size:12px; color:var(--tb-text-muted); }
    #${MODAL_ID} .tb-qb-ai-error { font-size:12.5px; color:var(--tb-error); background:var(--tb-error-bg); border:1px solid var(--tb-error); border-radius:var(--tb-radius-sm); padding:10px 12px; line-height:1.5; }
    #${MODAL_ID} .tb-qb-ai-meta { font-size:10.5px; color:var(--tb-text-muted); margin-top:8px; font-family:var(--tb-font-mono); }
    #${MODAL_ID} .tb-qb-ai-md { font-size:13px; line-height:1.6; color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-ai-md p { margin:0 0 8px; }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-h { font-weight:700; margin:12px 0 5px; color:var(--tb-text-primary); }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-h4 { font-size:13px; }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-h5, #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-h6 { font-size:12px; }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-ul { margin:0 0 8px; padding-left:20px; }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-ul li { margin-bottom:3px; }
    #${MODAL_ID} .tb-qb-ai-md code { font-family:var(--tb-font-mono); font-size:11.5px; background:var(--tb-bg-secondary); padding:1px 5px; border-radius:4px; }
    #${MODAL_ID} .tb-qb-ai-md .tb-qb-ai-code { font-family:var(--tb-font-mono); font-size:11.5px; background:var(--tb-bg-secondary); border:1px solid var(--tb-border); border-radius:var(--tb-radius-sm); padding:10px 12px; overflow:auto; white-space:pre-wrap; word-break:break-word; margin:0 0 8px; }
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
    /* "Fix with AI" — the highlight action. Gradient accent so it stands out. */
    #${MODAL_ID} .tb-qb-btn-ai { background:linear-gradient(135deg,#7C5CFF,#A855F7); color:#fff; border-color:transparent; font-weight:600; white-space:nowrap; flex-shrink:0; box-shadow:0 2px 10px rgba(124,92,255,0.35); }
    /* Must re-state the gradient: the generic .tb-qb-btn:hover (same id+class+pseudo
       specificity, matches on hover) would otherwise repaint the background with
       --tb-bg-elevated — white-on-white text in the light theme. */
    #${MODAL_ID} .tb-qb-btn-ai:hover { background:linear-gradient(135deg,#7C5CFF,#A855F7); color:#fff; filter:brightness(1.08); border-color:transparent; transform:translateY(-1px); }
    /* Save Ticket — prominent green CTA */
    #${MODAL_ID} .tb-qb-btn-save { background:#16a34a; color:#fff; border-color:transparent; padding:10px 16px; font-weight:600; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 10px rgba(34,197,94,0.35); flex-shrink:0; }
    #${MODAL_ID} .tb-qb-btn-save:hover { background:#15803d; border-color:transparent; transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-btn-save.tb-qb-btn-saved { background:transparent; color:#22c55e; border:1px solid #22c55e44; box-shadow:none; opacity:0.8; cursor:default; }
    /* Clean footer: one accent primary + a tidy "More" popover for the rest */
    #${MODAL_ID} .tb-qb-btn-primary { background:var(--tb-accent); color:#fff; border-color:transparent; padding:10px 16px; }
    #${MODAL_ID} .tb-qb-btn-primary:hover { background:var(--tb-accent-hover); border-color:transparent; transform:translateY(-1px); }
    #${MODAL_ID} .tb-qb-more { position:relative; display:inline-flex; }
    #${MODAL_ID} .tb-qb-more-menu { position:absolute; bottom:calc(100% + 6px); right:0; min-width:200px; background:var(--tb-bg-elevated); border:1px solid var(--tb-border-hover); border-radius:var(--tb-radius-md); box-shadow:var(--tb-shadow-lg); padding:6px; display:none; flex-direction:column; gap:2px; z-index:6; }
    #${MODAL_ID} .tb-qb-more-menu[data-open="true"] { display:flex; }
    #${MODAL_ID} .tb-qb-more-item { background:transparent; color:var(--tb-text-primary); border:none; border-radius:var(--tb-radius-sm); padding:9px 12px; cursor:pointer; font-size:12.5px; font-weight:500; font-family:inherit; text-align:left; display:flex; align-items:center; gap:9px; transition:background 0.12s; }
    #${MODAL_ID} .tb-qb-more-item:hover { background:var(--tb-accent-subtle); }
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

// ── AI prompt popover ───────────────────────────────────────────────────
// Shown after "Fix with AI" copies the prompt. Centered modal-style sheet so
// it's impossible to miss — earlier version was a tiny popover anchored
// above the button which got lost on busy pages.
function showAIPromptPopover(_anchor: HTMLElement, prompt: string, _root: HTMLElement): void {
  document.getElementById("tb-ai-popover")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "tb-ai-popover";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(5, 7, 12, 0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
    animation: tb-ai-pop-in 0.16s ease;
  `;

  if (!document.getElementById("tb-ai-pop-anim")) {
    const s = document.createElement("style");
    s.id = "tb-ai-pop-anim";
    s.textContent = `@keyframes tb-ai-pop-in { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }`;
    document.head.appendChild(s);
  }

  const sizeKb = (prompt.length / 1024).toFixed(1);
  const approxTokens = Math.round(prompt.length / 4);

  // Show a real, scrollable preview of the prompt so the user can SEE what
  // got copied. This was the missing affordance — they thought nothing happened.
  const escaped = prompt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const card = document.createElement("div");
  card.style.cssText = `
    width: 100%; max-width: 560px; max-height: 80vh;
    background: #14161E;
    border: 1px solid rgba(124,92,255,0.28);
    border-radius: 14px;
    box-shadow: 0 24px 72px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    color: #E6EDF3;
    overflow: hidden;
  `;
  card.innerHTML = `
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:16px;line-height:1">🤖</span>
        <div style="font-size:14px;font-weight:600;letter-spacing:-0.01em">AI debugging prompt is ready</div>
      </div>
      <div style="font-size:12px;color:#94A3B8;line-height:1.45">
        ✓ Copied to clipboard · ${sizeKb} KB · ~${approxTokens} tokens · pick an AI below or paste anywhere.
      </div>
    </div>

    <pre style="
      margin:0;padding:14px 18px;
      flex:1;overflow:auto;
      background:#0B0D12;
      font-family:ui-monospace,'SF Mono','JetBrains Mono',Consolas,monospace;
      font-size:11.5px;line-height:1.55;
      color:#CBD2DA;
      white-space:pre-wrap;word-break:break-word;
      border-bottom:1px solid rgba(255,255,255,0.06);
    ">${escaped}</pre>

    <div style="padding:12px 14px;display:flex;gap:8px;flex-wrap:wrap;background:#14161E">
      <button data-ai-action="claude" style="
        flex:1 1 140px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
        padding:10px 14px;border:0;border-radius:8px;cursor:pointer;
        background:#CC785C;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;
      ">
        <span style="width:18px;height:18px;border-radius:4px;background:rgba(255,255,255,0.18);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">C</span>
        Open in Claude
      </button>
      <button data-ai-action="chatgpt" style="
        flex:1 1 140px;display:inline-flex;align-items:center;justify-content:center;gap:8px;
        padding:10px 14px;border:0;border-radius:8px;cursor:pointer;
        background:#10A37F;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;
      ">
        <span style="width:18px;height:18px;border-radius:50%;background:rgba(255,255,255,0.18);display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700">AI</span>
        Open in ChatGPT
      </button>
      <button data-ai-action="copy" style="
        display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:10px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;
        background:transparent;color:#E6EDF3;font:600 13px system-ui,-apple-system,sans-serif;
      ">📋 Copy again</button>
      <button data-ai-action="close" aria-label="Close" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:38px;padding:10px 0;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;
        background:transparent;color:#94A3B8;font:600 14px system-ui,-apple-system,sans-serif;
      ">✕</button>
    </div>
  `;
  overlay.appendChild(card);
  // Append INSIDE the open ticket modal so it shares the same stacking context
  // and paints on top. Appending to document.body left it behind the modal —
  // both used the max z-index, so DOM order decided and the modal won.
  const host = document.getElementById(MODAL_ID) || document.body;
  host.appendChild(overlay);

  card.querySelectorAll<HTMLButtonElement>("button[data-ai-action]").forEach((b) => {
    b.addEventListener("mouseenter", () => { b.style.filter = "brightness(1.1)"; });
    b.addEventListener("mouseleave", () => { b.style.filter = ""; });
  });

  overlay.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest("[data-ai-action]")?.getAttribute("data-ai-action");
    if (action === "claude") { openInClaude(prompt); close(); }
    else if (action === "chatgpt") { openInChatGPT(prompt); close(); }
    else if (action === "copy") {
      try { navigator.clipboard.writeText(prompt); } catch {}
      // tiny visual feedback — pulse the button
      const btn = target.closest("button");
      if (btn) {
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.innerHTML = "📋 Copy again"; }, 1100);
      }
    }
    else if (action === "close" || target === overlay) close();
  });

  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  document.addEventListener("keydown", onKey);
}

// ── MCP hand-off card ───────────────────────────────────────────────────
// Shown after a successful .html export. The exported file is exactly what
// the TraceBug MCP server reads, so this closes the loop: copy one prompt,
// paste it into Claude Code / Cursor sitting in the codebase, and the agent
// debugs from the report. Mirrors Jam's "copy AI prompt" hand-off — but the
// data stays on disk instead of a vendor cloud.
function showMcpHandoffCard(filename: string): void {
  document.getElementById("tb-mcp-handoff")?.remove();
  const prompt = generateMcpPrompt(filename);
  try { navigator.clipboard.writeText(prompt); } catch {}

  const escaped = prompt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const overlay = document.createElement("div");
  overlay.id = "tb-mcp-handoff";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(5, 7, 12, 0.65);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    width: 100%; max-width: 560px; max-height: 80vh;
    background: #14161E;
    border: 1px solid rgba(124,92,255,0.28);
    border-radius: 14px;
    box-shadow: 0 24px 72px rgba(0,0,0,0.6);
    display: flex; flex-direction: column;
    color: #E6EDF3;
    overflow: hidden;
  `;
  card.innerHTML = `
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:16px;line-height:1">🤖</span>
        <div style="font-size:14px;font-weight:600;letter-spacing:-0.01em">Debug this export with your coding agent</div>
      </div>
      <div style="font-size:12px;color:#94A3B8;line-height:1.45">
        ✓ Prompt copied · paste it into <strong>Claude Code</strong> or <strong>Cursor</strong> opened in the codebase that owns the bug.
        The agent reads the .html via TraceBug's local MCP server — nothing is uploaded.
      </div>
    </div>
    <pre style="
      margin:0;padding:14px 18px;
      flex:1;overflow:auto;
      background:#0B0D12;
      font-family:ui-monospace,'SF Mono','JetBrains Mono',Consolas,monospace;
      font-size:11.5px;line-height:1.55;
      color:#CBD2DA;
      white-space:pre-wrap;word-break:break-word;
      border-bottom:1px solid rgba(255,255,255,0.06);
    ">${escaped}</pre>
    <div style="padding:12px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#14161E">
      <button data-mcp-action="copy" style="
        flex:1 1 140px;display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:10px 14px;border:0;border-radius:8px;cursor:pointer;
        background:#7C5CFF;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;
      ">📋 Copy prompt again</button>
      <a href="https://tracebug.netlify.app/docs/mcp" target="_blank" rel="noopener" style="
        display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:10px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:8px;
        color:#E6EDF3;font:600 13px system-ui,-apple-system,sans-serif;text-decoration:none;
      ">MCP setup guide ↗</a>
      <button data-mcp-action="close" aria-label="Close" style="
        display:inline-flex;align-items:center;justify-content:center;
        width:38px;padding:10px 0;border:1px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;
        background:transparent;color:#94A3B8;font:600 14px system-ui,-apple-system,sans-serif;
      ">✕</button>
    </div>
  `;
  overlay.appendChild(card);
  const host = document.getElementById(MODAL_ID) || document.body;
  host.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest("[data-mcp-action]")?.getAttribute("data-mcp-action");
    if (action === "copy") {
      try { navigator.clipboard.writeText(prompt); } catch {}
      const btn = target.closest("button");
      if (btn) {
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.innerHTML = "📋 Copy prompt again"; }, 1100);
      }
    } else if (action === "close" || target === overlay) close();
  });
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  }
  document.addEventListener("keydown", onKey);
}

// ── Share consent dialog ──────────────────────────────────────────────────
// Shown ONCE before the user's first cloud share. Privacy promise vs reality:
// the sanitizer scrubs code-side content (token shapes in logs, URLs, network
// responses) but cannot scrub pixels inside screenshots or video frames. The
// user has to know that before they upload.
//
// "Don't show again" is honored via localStorage. Resolving false aborts
// the share; true proceeds.
const CONSENT_KEY = "tracebug_share_consent_v1";

/**
 * Mount a popup/dialog ABOVE the open ticket modal. The modal and these popups
 * all use the max z-index, so a popup appended to document.body can lose to
 * #tracebug-root's stacking context and render BEHIND the ticket. Appending it
 * inside the modal overlay (last child, same stacking context) guarantees it
 * paints on top. Falls back to body when no ticket is open.
 */
function _mountAboveModal(overlay: HTMLElement): void {
  (document.getElementById(MODAL_ID) || document.body).appendChild(overlay);
}

function _confirmShareConsent(root: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (localStorage.getItem(CONSENT_KEY) === "ack") return resolve(true);
    } catch {}

    document.getElementById("tb-share-consent")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "tb-share-consent";
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(5, 7, 12, 0.72);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      animation: tb-share-consent-in 0.16s ease;
    `;

    if (!document.getElementById("tb-share-consent-anim")) {
      const s = document.createElement("style");
      s.id = "tb-share-consent-anim";
      s.textContent = "@keyframes tb-share-consent-in { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }";
      document.head.appendChild(s);
    }

    const card = document.createElement("div");
    card.style.cssText = `
      width: 100%; max-width: 460px;
      background: #14161E; color: #E6EDF3;
      border: 1px solid rgba(124,92,255,0.32);
      border-radius: 14px;
      box-shadow: 0 24px 72px rgba(0,0,0,0.6);
      padding: 22px 24px;
    `;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:18px;line-height:1">☁️</span>
        <div style="font-size:15px;font-weight:600;letter-spacing:-0.01em">Before you share</div>
      </div>
      <div style="font-size:13px;color:#B9C2CC;line-height:1.55;margin-bottom:14px">
        TraceBug auto-scrubs token shapes (JWTs, Bearer tokens, API keys, etc.)
        from <strong style="color:#E6EDF3">console logs</strong>, <strong style="color:#E6EDF3">URLs</strong>, and
        <strong style="color:#E6EDF3">network responses</strong> before upload.
      </div>
      <div style="font-size:13px;color:#B9C2CC;line-height:1.55;margin-bottom:18px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px">
        <strong style="color:#F59E0B">Screenshots and video are uploaded as captured.</strong>
        If any frame shows sensitive UI (passwords, tokens, PII), redact or
        delete it before sharing. Use ✎ Annotate to draw over sensitive areas.
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;font-size:12px;color:#94A3B8">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="tb-consent-dont-show" style="margin:0;cursor:pointer" />
          Don't show this again
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-act="cancel" style="
          padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.14);
          background:transparent;color:#E6EDF3;font:600 13px system-ui,-apple-system,sans-serif;cursor:pointer;
        ">Cancel</button>
        <button data-act="continue" style="
          padding:8px 18px;border-radius:8px;border:0;
          background:#7C5CFF;color:#fff;font:600 13px system-ui,-apple-system,sans-serif;cursor:pointer;
        ">I understand — continue</button>
      </div>
    `;
    overlay.appendChild(card);
    _mountAboveModal(overlay);

    const finish = (ok: boolean) => {
      if (ok) {
        const dontShow = (card.querySelector<HTMLInputElement>("#tb-consent-dont-show"))?.checked;
        if (dontShow) {
          try { localStorage.setItem(CONSENT_KEY, "ack"); } catch {}
        }
      }
      overlay.remove();
      document.removeEventListener("keydown", onKey);
      resolve(ok);
    };

    card.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "continue") finish(true);
      else if (act === "cancel") finish(false);
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(false); });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(false); };
    document.addEventListener("keydown", onKey);

    // Touch the unused root param so TS doesn't gripe when we plug a more
    // theme-aware mount target in later.
    void root;
  });
}
