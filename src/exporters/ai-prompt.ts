// ── AI debugging prompt exporter ──────────────────────────────────────────
// Turns a BugReport into a markdown prompt designed for pasting into Claude /
// ChatGPT / Cursor / etc.
//
// Token economy matters — we don't want a 100K-char prompt that hits context
// limits or distracts the model with noise. Heuristics:
//   - Console errors: dedupe by message prefix, top 5
//   - Network: failures only (status >= 400 or 0); plus the 3 most-recent
//     successful calls for narrative context
//   - User actions: last 10, chronological
//   - Screenshots: noted as count, not embedded (data URLs blow context)
//   - Steps + env: included verbatim, they're already short
//
// Target output: 2-5K characters. Worst case ~8K (lots of unique errors).

import { BugReport } from "../types";

const MAX_CONSOLE_ERRORS = 5;
const MAX_NETWORK_FAILURES = 5;
const MAX_NETWORK_CONTEXT = 3;
const MAX_USER_ACTIONS = 10;
const MAX_LINE = 240;          // truncate long single lines (stack traces, URLs)

export interface AIPromptOptions {
  /** If true, includes a "What to do" call-to-action block at the end. Default: true. */
  includeTask?: boolean;
  /** Optional project name shown in the header. */
  projectName?: string;
  /**
   * True when the screenshots are being handed off as separate image files
   * (the `.md` download path). The prompt then names them and tells the model
   * to look at the attached images, instead of the "not embedded" note used by
   * the copy-to-chat flow. Default: false.
   */
  screenshotsAttached?: boolean;
}

export function generateAIPrompt(report: BugReport, options: AIPromptOptions = {}): string {
  const { includeTask = true, projectName, screenshotsAttached = false } = options;
  const env = report.environment;
  const lines: string[] = [];

  // ── Header ─────────────────────────────────────────────────────────────
  lines.push(`# Bug report`);
  if (projectName) lines.push(`\n**Project:** ${projectName}`);
  if (report.title) lines.push(`**Title:** ${truncate(report.title, 200)}`);
  if (report.summary) lines.push(`**Summary:** ${truncate(report.summary, 240)}`);
  if (report.severity) lines.push(`**Severity:** ${report.severity}`);
  if (report.priority) lines.push(`**Priority:** ${report.priority}`);

  // ── Environment ────────────────────────────────────────────────────────
  if (env) {
    lines.push(`\n## Environment`);
    if (env.url) lines.push(`- URL: ${env.url}`);
    if (env.browser) lines.push(`- Browser: ${env.browser} ${env.browserVersion || ""}`.trim());
    if (env.os) lines.push(`- OS: ${env.os}`);
    if (env.viewport) lines.push(`- Viewport: ${env.viewport}`);
    if (env.deviceType) lines.push(`- Device: ${env.deviceType}`);
  }

  // ── Root-cause hint (only if auto-detector had something useful) ──────
  if (report.rootCause?.hint) {
    lines.push(`\n## Auto-detected root cause hint (${report.rootCause.confidence || "low"} confidence)`);
    lines.push(report.rootCause.hint);
  }

  // ── Reproduction steps (the SDK already builds plain-English steps) ───
  if (report.steps && report.steps.trim()) {
    lines.push(`\n## Reproduction steps`);
    lines.push(report.steps.trim());
  }

  // ── Console errors (deduped, top N) ────────────────────────────────────
  const dedupedConsole = dedupeByMessage(report.consoleErrors || [], MAX_CONSOLE_ERRORS);
  if (dedupedConsole.length > 0) {
    lines.push(`\n## Console errors (${dedupedConsole.length}${(report.consoleErrors?.length || 0) > dedupedConsole.length ? `, of ${report.consoleErrors!.length} total — dedup'd` : ""})`);
    dedupedConsole.forEach((e, i) => {
      lines.push(`${i + 1}. ${truncate(e.message, MAX_LINE)}`);
      if (e.stack) {
        const stackLines = String(e.stack)
          .split("\n")
          .slice(0, 4)              // first 4 stack frames is usually enough
          .map((l) => `   ${truncate(l.trim(), MAX_LINE)}`)
          .join("\n");
        if (stackLines) lines.push(stackLines);
      }
    });
  }

  // ── Network failures + a few successful ones for narrative ────────────
  const failures = (report.networkErrors || []).slice(0, MAX_NETWORK_FAILURES);
  const allRequests = report.networkRequests || [];
  const recentSuccess = allRequests
    .filter((r) => r.status >= 200 && r.status < 400)
    .slice(-MAX_NETWORK_CONTEXT);

  if (failures.length > 0 || recentSuccess.length > 0) {
    lines.push(`\n## Network`);
    if (failures.length > 0) {
      lines.push(`**Failures:**`);
      failures.forEach((f) => {
        const responseBit = f.response ? ` — ${truncate(f.response, 120).replace(/\n/g, " ")}` : "";
        lines.push(`- ${f.method} ${truncate(f.url, 120)} → ${f.status}${responseBit}`);
      });
    }
    if (recentSuccess.length > 0) {
      lines.push(`**Recent successful calls (for context):**`);
      recentSuccess.forEach((r) => {
        lines.push(`- ${r.method} ${truncate(r.url, 120)} → ${r.status}`);
      });
    }
  }

  // ── Recent user actions ────────────────────────────────────────────────
  const actions = (report.sessionSteps || []).slice(-MAX_USER_ACTIONS);
  if (actions.length > 0) {
    lines.push(`\n## Last ${actions.length} user actions`);
    actions.forEach((a, i) => {
      lines.push(`${i + 1}. ${truncate(a, MAX_LINE)}`);
    });
  }

  // ── Attached context ──────────────────────────────────────────────────
  const ctxBits: string[] = [];
  if (report.screenshots && report.screenshots.length > 0) {
    const n = report.screenshots.length;
    if (screenshotsAttached) {
      const names = report.screenshots.map((s) => s.filename).filter(Boolean);
      ctxBits.push(
        `${n} screenshot${n === 1 ? "" : "s"} attached separately as image file${n === 1 ? "" : "s"}${names.length ? ` (${names.join(", ")})` : ""} — look at the attached image${n === 1 ? "" : "s"} for the visual state when the bug was captured.`,
      );
    } else {
      ctxBits.push(`${n} screenshot${n === 1 ? "" : "s"} captured (not embedded — share the .html or cloud link for visuals)`);
    }
  }
  if (report.video) ctxBits.push(`video recording available (${Math.round(report.video.durationMs / 1000)}s)`);
  if (report.annotations && report.annotations.length > 0) ctxBits.push(`${report.annotations.length} tester note${report.annotations.length === 1 ? "" : "s"}`);
  if (ctxBits.length > 0) {
    lines.push(`\n## Attached`);
    ctxBits.forEach((b) => lines.push(`- ${b}`));
  }

  // ── Custom context the dev passed via TraceBug.context() ──────────────
  if (report.context && Object.keys(report.context).length > 0) {
    lines.push(`\n## App context`);
    Object.entries(report.context).forEach(([k, v]) => {
      lines.push(`- ${k}: ${truncate(String(v), MAX_LINE)}`);
    });
  }

  // ── Task (call-to-action for the AI) ───────────────────────────────────
  if (includeTask) {
    lines.push(`\n## Task`);
    lines.push(`Analyze this bug report and respond with:`);
    lines.push(`1. The most likely root cause`);
    lines.push(`2. Specific files or components to inspect`);
    lines.push(`3. A concrete fix suggestion (code where possible)`);
    lines.push(`4. Edge cases worth testing once the fix lands`);
  }

  return lines.join("\n");
}

function dedupeByMessage<T extends { message?: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = String(it.message || "").slice(0, 100);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ── MCP hand-off prompt ───────────────────────────────────────────────────
// The paste-into-your-agent prompt shown after an .html export. Unlike
// generateAIPrompt (which inlines the bug data for chat UIs), this one points
// a coding agent at the export file via the TraceBug MCP server, so the agent
// pulls exactly the data it needs — including screenshots as real images —
// and can cross-reference the codebase it's already sitting in.

export function generateMcpPrompt(filename: string): string {
  return [
    `This is a TraceBug bug report export: ${filename}`,
    ``,
    `1. Call get_bug_report("${filename}") to load the report overview and its investigation guide.`,
    `2. Follow the investigation guide to gather the relevant data (console errors, network failures, repro steps, screenshots).`,
    `3. Cross-reference the findings with this codebase to identify the root cause and propose a fix.`,
    ``,
    `If the tracebug MCP server isn't connected yet, register it first (point --dir at the folder containing the export):`,
    `claude mcp add tracebug -- npx -y tracebug mcp --dir <reports-folder>`,
  ].join("\n");
}

// ── Deep-link helpers ─────────────────────────────────────────────────────
// URL-prefilled chat URLs work for short prompts. Above ~6 KB we fall back
// to opening an empty chat + leaving the prompt on the clipboard.

const URL_PREFILL_LIMIT = 6000;

export function openInClaude(prompt: string): void {
  if (typeof window === "undefined") return;
  if (prompt.length <= URL_PREFILL_LIMIT) {
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
  } else {
    window.open("https://claude.ai/new", "_blank", "noopener");
  }
}

export function openInChatGPT(prompt: string): void {
  if (typeof window === "undefined") return;
  if (prompt.length <= URL_PREFILL_LIMIT) {
    window.open(`https://chat.openai.com/?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
  } else {
    window.open("https://chat.openai.com/", "_blank", "noopener");
  }
}

// ── Markdown report download ──────────────────────────────────────────────
// The upload-friendly artifact for non-MCP users. Unlike the self-contained
// `.html` (which inlines the video/screenshots as base64 and blows a chat's
// context when uploaded), this is a few KB of plain markdown that any agent
// or chat reads directly. Screenshots are handed off as separate image files
// (see the widget's "Download screenshots" action), so the prompt references
// them by name and the model gets visuals through the cheap vision path.

export interface MarkdownReportResult {
  filename: string;
  blob: Blob;
  url: string;
  sizeBytes: number;
}

export function exportReportAsMarkdown(
  report: BugReport,
  options: AIPromptOptions & { filename?: string } = {},
): MarkdownReportResult {
  const hasShots = (report.screenshots?.length ?? 0) > 0;
  const md = generateAIPrompt(report, { ...options, screenshotsAttached: hasShots });
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = options.filename || defaultMarkdownFilename(report);
  triggerDownload(url, filename);
  return { filename, blob, url, sizeBytes: blob.size };
}

function defaultMarkdownFilename(report: BugReport): string {
  const sid = report.session?.sessionId?.slice(0, 8) || "session";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-report-${sid}-${stamp}.md`;
}

function triggerDownload(url: string, filename: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* already revoked */ } }, 30000);
}
