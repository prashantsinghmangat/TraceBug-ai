// ── GitHub issue template generator ───────────────────────────────────────
// Generates GitHub-flavored markdown for bug issues.
// Crisp, developer-ready — only essential debugging info, no noise.

import { BugReport } from "./types";
import { formatTimelineText } from "./timeline-builder";
import { formatRootCauseLine } from "./report-builder";

// GitHub URL prefill has a ~8KB practical limit (some browsers/proxies cap at 6-8KB)
const GITHUB_URL_BODY_LIMIT = 6000;

/**
 * Generate a prefilled GitHub Issue URL that opens in a new tab with title +
 * body already populated. No API key, no auth — uses GitHub's standard
 * `/issues/new?title=...&body=...` query params.
 *
 * Body is auto-truncated if it exceeds GitHub's URL limit (~6KB safe).
 *
 * @param repo  - "owner/repo" (e.g., "facebook/react")
 * @param report - BugReport from buildReport()
 * @param labels - optional GitHub labels (comma-separated)
 */
export function generateGitHubIssueUrl(
  repo: string,
  report: BugReport,
  labels?: string[]
): string {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
  }

  const title = report.title || "Bug report";
  let body = generateGitHubIssue(report);

  // Strip the leading "## title" since GitHub already shows the title separately
  body = body.replace(/^##\s+[^\n]+\n+/, "");

  // Truncate body if too long for URL
  if (body.length > GITHUB_URL_BODY_LIMIT) {
    body = body.slice(0, GITHUB_URL_BODY_LIMIT) + "\n\n_(Report truncated due to URL length limit. Use \"Copy as GitHub Issue\" for the full version.)_";
  }

  const params = new URLSearchParams();
  params.set("title", title);
  params.set("body", body);
  if (labels && labels.length > 0) {
    params.set("labels", labels.join(","));
  }

  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/**
 * Open the generated GitHub Issue URL in a new tab.
 * Returns false if the URL exceeds GitHub's request limit (rare).
 */
export function openGitHubIssue(repo: string, report: BugReport, labels?: string[]): boolean {
  try {
    const url = generateGitHubIssueUrl(repo, report, labels);
    if (url.length > 8000) {
      console.warn("[TraceBug] GitHub URL exceeds 8KB — issue may not load. Use copy-to-clipboard instead.");
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch (err) {
    console.warn("[TraceBug] openGitHubIssue failed:", err);
    return false;
  }
}

export function generateGitHubIssue(report: BugReport): string {
  const env = report.environment;

  let md = `## ${report.title}\n\n`;

  // Root-cause hint — what a dev should check first
  const rc = formatRootCauseLine(report.rootCause);
  if (rc) {
    md += `> ${rc}\n\n`;
  }

  // Smart one-line summary — tells a dev what went wrong at a glance
  if (report.summary) {
    md += `> **TL;DR:** ${report.summary}\n\n`;
  }

  // Compact environment line
  md += `**Environment:** ${env.browser} ${env.browserVersion} · ${env.os} · ${env.viewport} · ${env.deviceType}\n`;
  md += `**URL:** ${env.url}\n\n`;

  // What the user did — derived from last clicked element
  if (report.clickedElement) {
    const ce = report.clickedElement;
    const label = ce.text || ce.ariaLabel || ce.id || ce.tag;
    md += `**User clicked:** \`<${ce.tag}>\` "${label}"`;
    if (ce.selector) md += ` — \`${ce.selector}\``;
    md += `\n\n`;
  }

  // Recent user actions — plain-English, at-a-glance flow
  if (report.sessionSteps && report.sessionSteps.length > 0) {
    md += `### Recent Actions\n\n`;
    for (const step of report.sessionSteps) {
      md += `1. ${step}\n`;
    }
    md += `\n`;
  }

  // Steps to Reproduce
  md += `### Steps to Reproduce\n\n`;
  if (report.steps) {
    md += `${report.steps}\n\n`;
  } else {
    md += `_No steps recorded_\n\n`;
  }

  // Tester Notes (only if present)
  if (report.annotations.length > 0) {
    md += `### Tester Notes\n\n`;
    for (const note of report.annotations) {
      md += `- **[${note.severity.toUpperCase()}]** ${note.text}\n`;
      if (note.expected) md += `  - **Expected:** ${note.expected}\n`;
      if (note.actual) md += `  - **Actual:** ${note.actual}\n`;
    }
    md += `\n`;
  }

  // Actual Result (only if no tester note already covers it)
  const hasTesterResult = report.annotations.some(a => a.actual);
  if (!hasTesterResult && report.consoleErrors.length > 0) {
    md += `### Error\n\n`;
    md += `\`${report.consoleErrors[0].message}\`\n\n`;
  }

  // Console Errors (deduplicated, max 3)
  if (report.consoleErrors.length > 0) {
    md += `### Console Errors\n\n`;
    md += `\`\`\`\n`;
    for (const err of report.consoleErrors.slice(0, 3)) {
      md += `${err.message}\n`;
      if (err.stack) {
        // Only first 3 meaningful stack lines
        const stackLines = err.stack.split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 3);
        if (stackLines.length > 0) md += `${stackLines.join("\n")}\n`;
      }
    }
    md += `\`\`\`\n\n`;
  }

  // Failed Network Requests (only failures, no successful ones)
  if (report.networkErrors.length > 0) {
    md += `### Failed Requests\n\n`;
    md += `| Method | URL | Status | Duration |\n`;
    md += `|--------|-----|--------|----------|\n`;
    for (const req of report.networkErrors) {
      const status = req.status === 0 ? "Network Error" : `${req.status}`;
      const url = req.url.length > 60 ? req.url.slice(0, 57) + "..." : req.url;
      md += `| ${req.method} | \`${url}\` | ${status} | ${req.duration}ms |\n`;
    }
    md += `\n`;

    // Response snippets — first 200 chars of body for failed requests
    const withBody = report.networkErrors.filter(r => r.response && r.response.length > 0);
    if (withBody.length > 0) {
      md += `<details>\n<summary>Response snippets</summary>\n\n`;
      for (const req of withBody) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        md += `**${req.method} ${req.url.slice(0, 80)} → ${status}**\n\n`;
        md += `\`\`\`\n${(req.response || "").replace(/```/g, "` ` `")}\n\`\`\`\n\n`;
      }
      md += `</details>\n\n`;
    }
  }

  // Voice Description (if any)
  if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
    md += `### Bug Description (Voice)\n\n`;
    for (const vt of report.voiceTranscripts) {
      md += `> ${vt.text}\n\n`;
    }
  }

  // Screen recording — file is auto-downloaded on export so the dev can attach it.
  if (report.video) {
    const v = report.video;
    const ext = v.mimeType.includes("mp4") ? "mp4" : "webm";
    const stamp = new Date(v.startedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `tracebug-recording-${stamp}.${ext}`;
    md += `### Screen Recording\n\n`;
    md += `> Drag and drop the downloaded recording: \`${filename}\` (${formatVideoMeta(v)})\n\n`;
    if (v.comments.length > 0) {
      md += `**Timestamped comments:**\n\n`;
      for (const c of v.comments) {
        md += `- \`${formatOffset(c.offsetMs)}\` — ${c.text}\n`;
      }
      md += `\n`;
    }
  }

  // Screenshots — filenames listed, auto-downloaded for drag-and-drop
  if (report.screenshots.length > 0) {
    md += `### Screenshots\n\n`;
    md += `> Drag and drop the downloaded screenshot files below:\n\n`;
    for (const ss of report.screenshots) {
      md += `- \`${ss.filename}\`\n`;
    }
    md += `\n`;
  }

  // Session Timeline — only user actions + errors (skip successful API calls)
  const significantTimeline = report.timeline.filter(e =>
    e.type !== "api_request" || e.isError
  );
  if (significantTimeline.length > 0) {
    md += `<details>\n<summary>Session Timeline (${significantTimeline.length} events)</summary>\n\n`;
    md += `\`\`\`\n`;
    md += formatTimelineText(significantTimeline);
    md += `\n\`\`\`\n\n`;
    md += `</details>\n\n`;
  }

  // Footer
  md += `---\n`;
  md += `_[TraceBug SDK](https://www.npmjs.com/package/tracebug-sdk) · Session: \`${report.session.sessionId.slice(0, 8)}\`_\n`;

  return md;
}

function formatVideoMeta(v: { durationMs: number; sizeBytes: number }): string {
  const sec = Math.max(0, Math.floor(v.durationMs / 1000));
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  const sizeMb = (v.sizeBytes / (1024 * 1024)).toFixed(1);
  return `${m}:${s} · ${sizeMb} MB`;
}

function formatOffset(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
