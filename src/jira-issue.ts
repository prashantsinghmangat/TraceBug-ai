// ── Jira ticket template generator ────────────────────────────────────────
// Generates Jira-compatible ticket content.
// Crisp output — only essential debugging info, no noise.

import { BugReport } from "./types";
import { formatTimelineText } from "./timeline-builder";
import { formatRootCauseLine } from "./report-builder";

export interface JiraTicket {
  summary: string;
  description: string;
  environment: string;
  stepsToReproduce: string;
  priority: "Highest" | "High" | "Medium" | "Low" | "Lowest";
  labels: string[];
}

export function generateJiraTicket(report: BugReport): JiraTicket {
  const env = report.environment;
  const priority = determinePriority(report);

  // Labels based on error type
  const labels: string[] = ["tracebug", "bug"];
  if (report.consoleErrors.length > 0) labels.push("has-errors");
  if (report.networkErrors.length > 0) labels.push("api-failure");

  // Environment string
  const envStr = `${env.browser} ${env.browserVersion} / ${env.os} / ${env.viewport} / ${env.deviceType}`;

  // Description
  let desc = "";

  // Root-cause hint — first thing a dev should see
  const rc = formatRootCauseLine(report.rootCause);
  if (rc) {
    desc += `{panel:title=Possible Cause (${report.rootCause.confidence} confidence)|borderColor=#c1c7d0|titleBGColor=#deebff|bgColor=#f4f9ff}\n${report.rootCause.hint}\n{panel}\n\n`;
  }

  // Smart one-line summary at the top
  if (report.summary) {
    desc += `{panel:title=TL;DR|borderStyle=solid|borderColor=#ccc|titleBGColor=#f4f5f7|bgColor=#fafbfc}\n${report.summary}\n{panel}\n\n`;
  }

  // User clicked — derived from last click event
  if (report.clickedElement) {
    const ce = report.clickedElement;
    const label = ce.text || ce.ariaLabel || ce.id || ce.tag;
    desc += `*User clicked:* {{<${ce.tag}>}} "${label}"`;
    if (ce.selector) desc += ` — {{${ce.selector}}}`;
    desc += `\n\n`;
  }

  // Recent actions — plain-English flow
  if (report.sessionSteps && report.sessionSteps.length > 0) {
    desc += `h3. Recent Actions\n`;
    for (const step of report.sessionSteps) {
      desc += `# ${step}\n`;
    }
    desc += `\n`;
  }

  // Steps
  desc += `h3. Steps to Reproduce\n`;
  if (report.steps) {
    desc += `{noformat}\n${report.steps}\n{noformat}\n\n`;
  }

  // Tester notes
  if (report.annotations.length > 0) {
    desc += `h3. Tester Notes\n`;
    for (const note of report.annotations) {
      desc += `* *[${note.severity.toUpperCase()}]* ${note.text}\n`;
      if (note.expected) desc += `** *Expected:* ${note.expected}\n`;
      if (note.actual) desc += `** *Actual:* ${note.actual}\n`;
    }
    desc += `\n`;
  }

  // Actual Result (only if no tester note already covers it)
  const hasTesterResult = report.annotations.some(a => a.actual);
  if (!hasTesterResult && report.consoleErrors.length > 0) {
    desc += `h3. Actual Result\nApplication throws error:\n{code}${report.consoleErrors[0].message}{code}\n\n`;
  }

  // Console errors (max 3)
  if (report.consoleErrors.length > 0) {
    desc += `h3. Console Errors\n{code}\n`;
    for (const err of report.consoleErrors.slice(0, 3)) {
      desc += `${err.message}\n`;
      if (err.stack) {
        const stackLines = err.stack.split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 3);
        if (stackLines.length > 0) desc += `${stackLines.join("\n")}\n`;
      }
    }
    desc += `{code}\n\n`;
  }

  // Network errors
  if (report.networkErrors.length > 0) {
    desc += `h3. Failed Requests\n`;
    desc += `||Method||URL||Status||Duration||\n`;
    for (const req of report.networkErrors) {
      const status = req.status === 0 ? "Network Error" : String(req.status);
      desc += `|${req.method}|${req.url.slice(0, 80)}|${status}|${req.duration}ms|\n`;
    }
    desc += `\n`;

    // Response snippets (first 200 chars of body per failure)
    const withBody = report.networkErrors.filter(r => r.response && r.response.length > 0);
    if (withBody.length > 0) {
      desc += `h4. Response Snippets\n`;
      for (const req of withBody) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        desc += `*${req.method} ${req.url.slice(0, 80)} → ${status}*\n`;
        desc += `{code}${(req.response || "").replace(/\{code\}/g, "{ code }")}{code}\n`;
      }
      desc += `\n`;
    }
  }

  // Voice Description
  if (report.voiceTranscripts && report.voiceTranscripts.length > 0) {
    desc += `h3. Bug Description (Voice)\n`;
    desc += `{quote}\n`;
    for (const vt of report.voiceTranscripts) {
      desc += `${vt.text}\n`;
    }
    desc += `{quote}\n\n`;
  }

  // Screenshots — filenames listed, auto-downloaded for attachment
  if (report.screenshots.length > 0) {
    desc += `h3. Screenshots\n`;
    desc += `_Attach the downloaded screenshot files:_\n`;
    for (const ss of report.screenshots) {
      desc += `* !${ss.filename}|thumbnail!\n`;
    }
    desc += `\n`;
  }

  // Timeline — only user actions + errors (skip successful API calls)
  const significantTimeline = report.timeline.filter(e =>
    e.type !== "api_request" || e.isError
  );
  if (significantTimeline.length > 0) {
    desc += `h3. Session Timeline\n{code}\n`;
    desc += formatTimelineText(significantTimeline);
    desc += `\n{code}\n\n`;
  }

  // Environment
  desc += `h3. Environment\n`;
  desc += `* *Browser:* ${env.browser} ${env.browserVersion}\n`;
  desc += `* *OS:* ${env.os}\n`;
  desc += `* *Viewport:* ${env.viewport}\n`;
  desc += `* *Device:* ${env.deviceType}\n`;
  desc += `* *URL:* ${env.url}\n\n`;

  desc += `----\n_Generated by TraceBug SDK · Session: ${report.session.sessionId.slice(0, 8)}_\n`;

  return {
    summary: report.title,
    description: desc,
    environment: envStr,
    stepsToReproduce: report.steps || "",
    priority,
    labels,
  };
}

function determinePriority(report: BugReport): JiraTicket["priority"] {
  // Critical errors (TypeError, ReferenceError) = Highest
  const hasCriticalError = report.consoleErrors.some(e =>
    /TypeError|ReferenceError|SyntaxError/i.test(e.message)
  );
  if (hasCriticalError) return "Highest";

  // Server errors (5xx) = High
  const hasServerError = report.networkErrors.some(r => r.status >= 500);
  if (hasServerError) return "High";

  // Client errors (4xx) or network failures = Medium
  if (report.networkErrors.length > 0) return "Medium";

  // Console errors only = Low
  if (report.consoleErrors.length > 0) return "Low";

  // Tester-reported annotation = Medium
  if (report.annotations.some(a => a.severity === "critical" || a.severity === "major")) return "Medium";

  return "Low";
}
