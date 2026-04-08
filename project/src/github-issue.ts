// ── GitHub issue template generator ───────────────────────────────────────
// Generates GitHub-flavored markdown for bug issues.
// Crisp, developer-ready — only essential debugging info, no noise.

import { BugReport } from "./types";
import { formatTimelineText } from "./timeline-builder";

export function generateGitHubIssue(report: BugReport): string {
  const env = report.environment;

  let md = `## ${report.title}\n\n`;

  // Compact environment line
  md += `**Environment:** ${env.browser} ${env.browserVersion} · ${env.os} · ${env.viewport} · ${env.deviceType}\n`;
  md += `**URL:** ${env.url}\n\n`;

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
  }

  // Voice Description (if any)
  if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
    md += `### Bug Description (Voice)\n\n`;
    for (const vt of report.voiceTranscripts) {
      md += `> ${vt.text}\n\n`;
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
