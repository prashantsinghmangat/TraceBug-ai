// ── Session-data detectors ────────────────────────────────────────────────
// Three detectors that read from the SDK's existing event buffer and
// network-failure ring buffer — no new tracking, just classification.
//
// console-error: every distinct error/unhandled rejection in the session
// failed-request: every 4xx/5xx/network-error from the api_request stream
// slow-api: every successful api_request that took longer than the threshold

import { Issue, StoredSession, TraceBugEvent } from "../../types";
import { getNetworkFailures } from "../../collectors";
import { makeIssueId } from "../helpers";
import { computeFingerprint } from "../../fingerprint";

const SLOW_API_MS = 2000;
const MAX_CONTEXT_SAMPLES = 10;

/**
 * Console errors collapsed by fingerprint (errorType + top-3 frames + page).
 * Repeats accumulate `occurrences` + `firstSeenAt`/`lastSeenAt` + a few
 * `contextSamples` so the UI can show the count and let the user expand
 * to see distinct preceding actions.
 */
export async function detectConsoleErrors(session: StoredSession | null): Promise<Issue[]> {
  if (!session) return [];

  // Build groups by fingerprint.
  type Group = {
    issue: Issue;
    samples: Array<{ timestamp: number; precedingAction?: string }>;
  };
  const groups = new Map<string, Group>();

  for (let i = 0; i < session.events.length; i++) {
    const e = session.events[i];
    if (e.type !== "error" && e.type !== "unhandled_rejection" && e.type !== "console_error") continue;
    const message = e.data.error?.message || e.data.message || "";
    if (!message) continue;

    const stack = e.data.error?.stack || "";
    const page = e.page || (typeof window !== "undefined" ? window.location.pathname : "");
    const fp = await computeFingerprint(message, stack, page);

    const precedingAction = describePrecedingAction(session.events, i);

    const existing = groups.get(fp);
    if (existing) {
      existing.issue.occurrences = (existing.issue.occurrences || 1) + 1;
      existing.issue.lastSeenAt = e.timestamp;
      if (existing.samples.length < MAX_CONTEXT_SAMPLES) {
        existing.samples.push({ timestamp: e.timestamp, precedingAction });
      }
      continue;
    }

    const firstFrame = stack.split("\n").find((l: string) => l.trim().startsWith("at "))?.trim() || "";
    const issue: Issue = {
      id: makeIssueId("console-error"),
      detector: "console-error",
      severity: classifyErrorSeverity(message),
      title: `JS error: ${message.slice(0, 70)}${message.length > 70 ? "…" : ""}`,
      description: firstFrame ? `${message}\n\nFirst frame: ${firstFrame}` : message,
      page,
      detectedAt: e.timestamp,
      fingerprint: fp,
      occurrences: 1,
      firstSeenAt: e.timestamp,
      lastSeenAt: e.timestamp,
    };
    groups.set(fp, { issue, samples: [{ timestamp: e.timestamp, precedingAction }] });
  }

  // Finalize: attach context samples + adjust title to reflect repeat count.
  const out: Issue[] = [];
  for (const g of groups.values()) {
    const n = g.issue.occurrences || 1;
    if (n > 1) {
      g.issue.title = `${g.issue.title} [×${n}]`;
      g.issue.contextSamples = g.samples;
    }
    out.push(g.issue);
  }
  return out;
}

/** Look back from index `i` for the most recent click/input/navigation. */
function describePrecedingAction(events: TraceBugEvent[], i: number): string | undefined {
  for (let j = i - 1; j >= 0; j--) {
    const e = events[j];
    if (e.type === "click") {
      const t = e.data?.element?.text || e.data?.element?.ariaLabel || e.data?.element?.tag || "element";
      return `clicked "${String(t).slice(0, 40)}"`;
    }
    if (e.type === "input") {
      const n = e.data?.element?.name || e.data?.element?.id || "field";
      return `typed in ${n}`;
    }
    if (e.type === "select_change") return "selected an option";
    if (e.type === "form_submit") return "submitted a form";
    if (e.type === "route_change") return `navigated to ${e.data?.to || "page"}`;
  }
  return undefined;
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
