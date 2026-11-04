// ── Evidence integrity ─────────────────────────────────────────────────────
// What a report captured, what it did not, what was masked and what was
// dropped — one summary rendered in the ticket, the exported .html, the AI
// prompt and the MCP server, so a reader (or an AI agent) never mistakes
// missing evidence for evidence that nothing happened.
//
// Pure: reads the built report (plus the in-memory console-cap flags), no
// re-scrubbing, no DOM. Facts only — never a guess about the bug.

import type { BugReport } from "./types";
import { summarizeRedactions, formatRedactionSummary } from "./redaction-summary";
import { getConsoleCapped } from "./collectors";

export interface EvidenceSummary {
  captured: string[];
  notCaptured: string[];
  /** e.g. "3 sensitive values auto-masked (2 URL params, 1 token)"; null when nothing was masked. */
  redacted: string | null;
  dropped: string[];
  /** False when something that could hide an error or the steps leading to
   *  it is missing — events evicted, console capture off. "No errors
   *  captured" is only a clean bill when this is true. */
  complete: boolean;
}

const ACTION_TYPES = new Set(["click", "input", "select_change", "form_submit", "route_change"]);

/** Recordings auto-stop at 2 minutes (video-recorder.ts MAX_CLOUD_RECORDING_S). */
const VIDEO_CAP_MS = 120_000;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summarizeEvidence(report: BugReport): EvidenceSummary {
  const session = report.session;
  const events = session?.events || [];
  const captured: string[] = [];
  const notCaptured: string[] = [];
  const dropped: string[] = [];

  // ── Captured ────────────────────────────────────────────────────────────
  const actions = events.filter((e) => ACTION_TYPES.has(e.type)).length;
  captured.push(plural(actions, "user action"));
  const errors = (report.consoleErrors || []).length;
  captured.push(plural(errors, "error"));
  const requests = (report.networkRequests?.length ? report.networkRequests : report.networkErrors) || [];
  const failed = (report.networkErrors || []).length;
  captured.push(`${plural(requests.length, "network request")}${failed ? ` (${failed} failed)` : ""}`);
  const shots = (report.screenshots || []).length;
  if (shots) captured.push(plural(shots, "screenshot"));
  const pages = Array.from(new Set(events.map((e) => e.page).filter(Boolean)));
  const lastPage = pages[pages.length - 1] || "/";
  const hasReplay = Array.isArray(report.video?.rrwebEvents) && report.video!.rrwebEvents!.length > 0;
  const hasVideo = !!report.video && (report.video.sizeBytes || 0) > 0;
  if (hasReplay) captured.push(`DOM replay of ${lastPage}`);
  if (hasVideo) captured.push(`screen video (${Math.round((report.video!.durationMs || 0) / 1000)}s)`);

  // ── Not captured ────────────────────────────────────────────────────────
  // Never captured by design — said every time, so silence is never read as
  // "there was nothing there".
  notCaptured.push("request and response bodies (only the first 200 characters of a failed response)");
  notCaptured.push("request and response headers");
  notCaptured.push("content inside iframes and canvas");
  notCaptured.push("successful image, font and script loads during the capture");
  const level = session?.consoleLevel;
  if (level === "none") notCaptured.push("console output (console capture was off)");
  else if (level === "errors") notCaptured.push("console warnings, info and logs (only errors were captured)");
  else if (level === "warnings") notCaptured.push("console info and logs (only errors and warnings were captured)");
  if (!hasReplay && !hasVideo) notCaptured.push("screen video and DOM replay (events-only capture)");

  // ── Dropped ─────────────────────────────────────────────────────────────
  const evicted = session?.droppedEvents || 0;
  if (evicted > 0) dropped.push(`the ${plural(evicted, "oldest event")} of the session (event limit), so the earliest steps may be missing`);
  const capped = getConsoleCapped();
  if (capped.length) dropped.push(`console.${capped.join(", console.")} output after the first 50 of each`);
  if (hasVideo && (report.video!.durationMs || 0) >= VIDEO_CAP_MS - 500) {
    dropped.push("everything after 2 minutes of screen video (recordings stop at the 2-minute limit)");
  }
  if (hasReplay && pages.length > 1) {
    dropped.push(`DOM replay of the earlier pages (${pages.slice(0, -1).join(", ")}); the replay covers only ${lastPage}`);
  }
  const noBody = (report.networkErrors || []).filter((r) => !r.response).length;
  if (noBody) dropped.push(`the response body of ${plural(noBody, "failed request")} (empty, binary, or not readable)`);

  return {
    captured,
    notCaptured,
    redacted: formatRedactionSummary(summarizeRedactions(report)),
    dropped,
    complete: evicted === 0 && level !== "none",
  };
}

/** Markdown block for the AI prompt (and anything else that wants text). */
export function formatEvidenceMarkdown(s: EvidenceSummary): string {
  const lines = [
    `- **Captured:** ${s.captured.join(", ")}`,
    `- **Not captured:** ${s.notCaptured.join("; ")}`,
  ];
  if (s.redacted) lines.push(`- **Redacted:** ${s.redacted}`);
  if (s.dropped.length) lines.push(`- **Dropped:** ${s.dropped.join("; ")}`);
  return lines.join("\n");
}
