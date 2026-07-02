// ── Linear issue export ─────────────────────────────────────────────────────
// Generates Linear-flavored markdown + opens Linear's new-issue page with the
// title + description prefilled. No API key needed — uses Linear's public
// `/new?title=...&description=...` URL pattern that works for any workspace
// the user is signed into.

import { BugReport } from "./types";
import { formatRootCauseLine, severityTitlePrefix } from "./report-builder";

// Linear's URL prefill — title and description params work on the new-issue
// route. Cap body size so the URL stays under most proxies' 8KB limit.
const LINEAR_URL_BODY_LIMIT = 6000;

export function generateLinearIssueUrl(report: BugReport): string {
  const rawTitle = report.title || "Bug report";
  const title = rawTitle.match(/^[🔴🟠🟡🟢]/u)
    ? rawTitle
    : `${severityTitlePrefix(report.severity)}${rawTitle}`;
  let body = generateLinearIssue(report);
  body = body.replace(/^##\s+[^\n]+\n+/, ""); // strip the leading title line

  if (body.length > LINEAR_URL_BODY_LIMIT) {
    body = body.slice(0, LINEAR_URL_BODY_LIMIT) + "\n\n_(Truncated due to URL length limit. Use \"Copy as Markdown\" for the full version.)_";
  }

  const params = new URLSearchParams();
  params.set("title", title);
  params.set("description", body);
  return `https://linear.app/new?${params.toString()}`;
}

/**
 * Open Linear's new-issue page in a new tab. Returns false on failure.
 *
 * Linear shows a workspace picker on first open if the user isn't signed in,
 * then routes to the active workspace's new-issue form with title +
 * description prefilled.
 */
export function openLinearIssue(report: BugReport): boolean {
  try {
    const url = generateLinearIssueUrl(report);
    if (url.length > 8000) {
      console.warn("[TraceBug] Linear URL exceeds 8KB — prefill may not load. Use copy instead.");
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch (err) {
    console.warn("[TraceBug] openLinearIssue failed:", err);
    return false;
  }
}

/**
 * Generate Linear-flavored markdown for a bug report. Linear supports the
 * same markdown subset as GitHub, so the output is structurally identical to
 * GitHub but compact enough to fit Linear's URL prefill.
 */
export function generateLinearIssue(report: BugReport): string {
  const env = report.environment;

  const titleWithSeverity = report.title.match(/^[🔴🟠🟡🟢]/u)
    ? report.title
    : `${severityTitlePrefix(report.severity)}${report.title}`;
  let md = `## ${titleWithSeverity}\n\n`;

  const rc = formatRootCauseLine(report.rootCause);
  if (rc) md += `> ${rc}\n\n`;

  if (report.summary) md += `> **TL;DR:** ${report.summary}\n\n`;

  md += `**Environment:** ${env.browser} ${env.browserVersion} · ${env.os} · ${env.viewport} · ${env.deviceType}\n`;
  md += `**URL:** ${env.url}\n\n`;

  if (report.clickedElement) {
    const ce = report.clickedElement;
    const label = ce.text || ce.ariaLabel || ce.id || ce.tag;
    md += `**User clicked:** \`<${ce.tag}>\` "${label}"`;
    if (ce.selector) md += ` — \`${ce.selector}\``;
    md += `\n\n`;
  }

  if (report.sessionSteps && report.sessionSteps.length > 0) {
    md += `### Recent Actions\n\n`;
    for (const step of report.sessionSteps) md += `1. ${step}\n`;
    md += `\n`;
  }

  const ctxKeys = report.context ? Object.keys(report.context) : [];
  if (ctxKeys.length > 0) {
    md += `### Context\n\n`;
    for (const k of ctxKeys) md += `- **${k}**: \`${String(report.context[k])}\`\n`;
    md += `\n`;
  }

  md += `### Steps to Reproduce\n\n`;
  md += report.steps ? `${report.steps}\n\n` : `_No steps recorded_\n\n`;

  if (report.consoleErrors.length > 0) {
    md += `### Console Errors\n\n\`\`\`\n`;
    for (const err of report.consoleErrors.slice(0, 3)) {
      md += `${err.message}\n`;
      if (err.stack) {
        const lines = err.stack.split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 3);
        if (lines.length > 0) md += `${lines.join("\n")}\n`;
      }
    }
    md += `\`\`\`\n\n`;
  }

  if (report.networkErrors.length > 0) {
    md += `### Failed Requests\n\n| Method | URL | Status | Duration |\n|--------|-----|--------|----------|\n`;
    for (const req of report.networkErrors) {
      const status = req.status === 0 ? "Network Error" : `${req.status}`;
      const url = req.url.length > 60 ? req.url.slice(0, 57) + "..." : req.url;
      md += `| ${req.method} | \`${url}\` | ${status} | ${req.duration}ms |\n`;
    }
    md += `\n`;
  }

  md += `\n---\n_Reported via [TraceBug](https://github.com/prashantsinghmangat/tracebug-ai)_`;
  return md;
}
