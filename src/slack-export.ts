// ── Slack post export ───────────────────────────────────────────────────────
// Generates Slack-formatted plain text for a bug report. Slack supports a
// limited markdown subset (`*bold*`, `_italic_`, `~strike~`, single-backtick
// inline code, triple-backtick code blocks, `>` quotes, `<URL|label>` links).
//
// The caller copies the output to the clipboard. The user pastes into any
// Slack channel/DM/thread. Optionally we'll wire up a webhook later.

import { BugReport } from "./types";
import { formatRootCauseLine, severityBadge } from "./report-builder";

export function generateSlackPost(report: BugReport, userDescription?: string): string {
  const env = report.environment;
  const sev = severityBadge(report.severity); // "🔴 Critical" etc.
  const rc = formatRootCauseLine(report.rootCause);

  const lines: string[] = [];

  // Header — severity + title.
  lines.push(`${sev} *${report.title}*`);
  lines.push("");

  // Root-cause hint as a Slack quote.
  if (rc) lines.push(`> ${rc}`);
  if (report.summary) lines.push(`> *TL;DR:* ${report.summary}`);
  if (rc || report.summary) lines.push("");

  // User-typed description if provided.
  if (userDescription && userDescription.trim().length > 0) {
    lines.push(userDescription.trim());
    lines.push("");
  }

  // Environment compact.
  lines.push(`*Where:* \`${env.url}\``);
  lines.push(`*Env:* ${env.browser} ${env.browserVersion} · ${env.os} · ${env.viewport}`);
  lines.push("");

  // Recent actions — up to 5 to keep Slack post readable.
  if (report.sessionSteps && report.sessionSteps.length > 0) {
    lines.push(`*Recent actions:*`);
    for (const step of report.sessionSteps.slice(0, 5)) {
      lines.push(`• ${step}`);
    }
    lines.push("");
  }

  // Console error — first one, compact.
  if (report.consoleErrors.length > 0) {
    const first = report.consoleErrors[0];
    lines.push(`*Error:*`);
    lines.push("```");
    lines.push(first.message);
    if (first.stack) {
      const top = first.stack.split("\n").filter(l => l.trim().startsWith("at ")).slice(0, 2).join("\n");
      if (top) lines.push(top);
    }
    lines.push("```");
  }

  // Failed network — first one, compact.
  if (report.networkErrors.length > 0) {
    const n = report.networkErrors[0];
    const status = n.status === 0 ? "Network Error" : String(n.status);
    lines.push(`*Failed request:* \`${n.method} ${n.url.slice(0, 80)}\` → ${status}`);
  }

  lines.push("");
  lines.push("_Reported via TraceBug_");
  return lines.join("\n");
}
