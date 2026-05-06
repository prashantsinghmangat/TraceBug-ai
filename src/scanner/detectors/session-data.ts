// ── Session-data detectors ────────────────────────────────────────────────
// Three detectors that read from the SDK's existing event buffer and
// network-failure ring buffer — no new tracking, just classification.
//
// console-error: every distinct error/unhandled rejection in the session
// failed-request: every 4xx/5xx/network-error from the api_request stream
// slow-api: every successful api_request that took longer than the threshold

import { Issue, StoredSession } from "../../types";
import { getNetworkFailures } from "../../collectors";
import { makeIssueId } from "../helpers";

const SLOW_API_MS = 2000;

export async function detectConsoleErrors(session: StoredSession | null): Promise<Issue[]> {
  if (!session) return [];
  const issues: Issue[] = [];
  const seen = new Set<string>();

  for (const e of session.events) {
    if (e.type !== "error" && e.type !== "unhandled_rejection" && e.type !== "console_error") continue;
    const message = e.data.error?.message || e.data.message || "";
    if (!message) continue;
    // Dedupe: identical messages collapse to one issue.
    if (seen.has(message)) continue;
    seen.add(message);

    const stack = e.data.error?.stack || "";
    const firstFrame = stack.split("\n").find((l: string) => l.trim().startsWith("at "))?.trim() || "";

    issues.push({
      id: makeIssueId("console-error"),
      detector: "console-error",
      severity: classifyErrorSeverity(message),
      title: `JS error: ${message.slice(0, 70)}${message.length > 70 ? "…" : ""}`,
      description: firstFrame
        ? `${message}\n\nFirst frame: ${firstFrame}`
        : message,
      page: e.page || window.location.pathname,
      detectedAt: e.timestamp,
    });
  }

  return issues;
}

export async function detectFailedRequests(session: StoredSession | null): Promise<Issue[]> {
  if (!session) return [];
  const issues: Issue[] = [];
  const buffer = getNetworkFailures();

  for (const e of session.events) {
    if (e.type !== "api_request") continue;
    const req = e.data.request;
    if (!req) continue;
    const status = req.statusCode || 0;
    if (status >= 200 && status < 400) continue; // success
    if (status === 0 && req.method === "HEAD") continue; // skip our own probe noise

    // Try to find a matching response body snippet from the failure buffer.
    const match = buffer.find(b =>
      b.url === req.url &&
      b.method === req.method &&
      b.status === status &&
      Math.abs(b.timestamp - e.timestamp) < 5000
    );
    const snippet = match?.response ? `\n\nResponse: ${match.response.slice(0, 160)}` : "";

    issues.push({
      id: makeIssueId("failed-request"),
      detector: "failed-request",
      severity: status >= 500 ? "critical" : status === 0 ? "serious" : "moderate",
      title: `${req.method} ${truncatePath(req.url)} → ${status === 0 ? "Network Error" : status}`,
      description: `Request failed in ${req.durationMs || 0}ms.${snippet}`,
      url: req.url,
      page: e.page || window.location.pathname,
      detectedAt: e.timestamp,
    });
  }

  return issues;
}

export async function detectSlowApis(session: StoredSession | null): Promise<Issue[]> {
  if (!session) return [];
  const issues: Issue[] = [];

  for (const e of session.events) {
    if (e.type !== "api_request") continue;
    const req = e.data.request;
    if (!req) continue;
    const status = req.statusCode || 0;
    // Only flag *successful* slow requests — failures are surfaced separately.
    if (status < 200 || status >= 400) continue;
    const duration = req.durationMs || 0;
    if (duration < SLOW_API_MS) continue;

    issues.push({
      id: makeIssueId("slow-api"),
      detector: "slow-api",
      severity: duration > 5000 ? "serious" : "moderate",
      title: `Slow API: ${req.method} ${truncatePath(req.url)} (${duration}ms)`,
      description: `This request took ${(duration / 1000).toFixed(1)}s — over the ${SLOW_API_MS / 1000}s threshold. Slow APIs are a common UX complaint and a leading cause of perceived bugs ("the page is frozen").`,
      url: req.url,
      page: e.page || window.location.pathname,
      detectedAt: e.timestamp,
    });
  }

  return issues;
}

function truncatePath(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const p = u.pathname.length > 50 ? u.pathname.slice(0, 47) + "…" : u.pathname;
    return p;
  } catch {
    return url.length > 50 ? url.slice(0, 47) + "…" : url;
  }
}

function classifyErrorSeverity(message: string): Issue["severity"] {
  if (/TypeError|ReferenceError|SyntaxError/i.test(message)) return "critical";
  if (/Network|fetch|failed to/i.test(message)) return "serious";
  return "moderate";
}
