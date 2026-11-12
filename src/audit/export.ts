// ── Audit export ───────────────────────────────────────────────────────────
// Downloads the usual self-contained .html report with the audit run inside
// (`payload.audit`). The viewer opens on its Audit tab; the MCP server reads
// it with get_audit / get_finding / compare_audits. Same file, same privacy:
// nothing leaves the machine except by the user's own download.

import type { AuditRun, BugReport, StoredSession } from "../types";
import { getActiveSessionId, getAllSessions } from "../storage";
import { buildReport } from "../report-builder";
import { captureEnvironment } from "../environment";
import { exportSessionAsHtml, type ExportedReplay } from "../exporters/html-replay";

const CATEGORY_LABEL: Record<string, string> = {
  accessibility: "Accessibility", ui: "Layout", performance: "Performance", seo: "SEO", runtime: "Runtime",
};

/** The capture on this page, or an empty one when TraceBug has recorded nothing yet. */
function currentSession(): StoredSession {
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const activeId = getActiveSessionId();
  const found = (activeId && sessions.find((s) => s.sessionId === activeId)) || sessions[0];
  if (found) return found;
  const now = Date.now();
  return {
    sessionId: `audit-${now.toString(36)}`,
    projectId: "audit",
    createdAt: now,
    updatedAt: now,
    errorMessage: null,
    errorStack: null,
    reproSteps: null,
    errorSummary: null,
    events: [],
    annotations: [],
    environment: captureEnvironment(),
  };
}

/** Markdown summary for the report's description (humans; agents use payload.audit). */
export function auditSummaryMarkdown(run: AuditRun): string {
  const total = run.findings.length + run.truncated;
  const lines = [
    `**Site audit** of \`${run.url}\` at ${run.viewport.width}×${run.viewport.height} (${run.userAgentFamily}): ${total} finding${total === 1 ? "" : "s"}.`,
    "",
    ...run.categories.map((c) =>
      `- **${CATEGORY_LABEL[c.name] || c.name}**: ${!c.ran ? "not run" : c.count === 0 ? "no findings" : `${c.count} found`}${c.limitation ? ` — ${c.limitation}` : ""}`),
    "",
    "Open the **Audit** tab for every finding with its evidence.",
  ];
  return lines.join("\n");
}

const BUG_SEVERITY: Record<string, BugReport["severity"]> = { critical: "critical", serious: "high", moderate: "medium", minor: "low" };

/** "Site audit: 5 findings (1 critical, 1 serious, 3 minor); SEO not run." */
export function auditOneLiner(run: AuditRun): string {
  const total = run.findings.length + run.truncated;
  const bySev = ["critical", "serious", "moderate", "minor"]
    .map((s) => [s, run.findings.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`);
  const notRun = run.categories.filter((c) => !c.ran).map((c) => CATEGORY_LABEL[c.name] || c.name);
  return `Site audit: ${total} finding${total === 1 ? "" : "s"}${bySev.length ? ` (${bySev.join(", ")})` : ""}` +
    (notRun.length ? `; ${notRun.join(", ")} not run.` : ".");
}

function filenameFor(run: AuditRun): string {
  let host = "page";
  try { host = new URL(run.url).hostname.replace(/[^a-z0-9.-]/gi, "") || "page"; } catch {}
  const stamp = new Date(run.scannedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-audit-${host}-${stamp}.html`;
}

export async function exportAuditReport(run: AuditRun): Promise<ExportedReplay> {
  const session = currentSession();
  const report = buildReport(session);
  report.video = undefined;
  let path = run.url;
  try { path = new URL(run.url).pathname; } catch {}
  report.title = `Site audit: ${path}`;
  // An audit is not a bug capture: no "bug captured on…" summary, no root-cause
  // guess, and the report's severity is the audit's worst finding.
  report.summary = auditOneLiner(run);
  (report as { rootCause?: unknown }).rootCause = undefined;
  report.severity = BUG_SEVERITY[run.findings[0]?.severity ?? "minor"];
  return exportSessionAsHtml(session, report, {
    includeVideo: false,
    audit: run,
    descriptionOverride: auditSummaryMarkdown(run),
    filename: filenameFor(run),
  });
}
