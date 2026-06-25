// ── Report builder ────────────────────────────────────────────────────────
// Assembles a complete BugReport from session data, screenshots, and env info.
// One-click report generation — collects everything into a structured object.

import {
  BugReport,
  BugSeverity,
  BugPriority,
  StoredSession,
  ScreenshotData,
  TraceBugEvent,
  NetworkErrorEntry,
  ClickedElementSummary,
  RootCauseHint,
} from "./types";
import { captureEnvironment } from "./environment";
import { captureStorageSnapshot } from "./storage-capture";
import { getScreenshots } from "./screenshot";
import { getVoiceTranscripts } from "./voice-recorder";
import { getLastVideoRecording } from "./video-recorder";
import { getCurrentContext } from "./dev-api";
import { matchErrorPattern, formatPatternMatch } from "./patterns";
import { generateBugTitle } from "./title-generator";
import { buildTimeline } from "./timeline-builder";
import { generateReproSteps } from "./repro-generator";
import { getNetworkFailures } from "./collectors";
import { buildActionChips } from "./action-chips";

export function buildReport(
  session: StoredSession,
  extraScreenshots?: ScreenshotData[]
): BugReport {
  const environment = session.environment || captureEnvironment();

  // Anchor the report to the actual capture moment, then drop events from long
  // before it. A session reused after a long idle gap (hours later) would
  // otherwise make the replay timeline span that whole gap — stale events at
  // the start, the fresh screenshot/recording at the end — e.g. showing
  // "194:44" instead of the real ~28s. captureTs = latest of video start +
  // screenshot timestamps; falls back to the newest event when there's no media.
  const _ssForAnchor = [...getScreenshots(), ...(extraScreenshots || [])];
  const _vidForAnchor = getLastVideoRecording();
  const captureTs = Math.max(
    _vidForAnchor?.startedAt ?? 0,
    ..._ssForAnchor.map((s) => s.timestamp),
    0,
  );
  const events = trimStaleEvents(session.events, captureTs);

  // Generate repro steps if not already present
  let steps = session.reproSteps || "";
  if (!steps && events.length > 0) {
    const errorMsg = session.errorMessage || "Issue reported by tester";
    const result = generateReproSteps(events, errorMsg, session.errorStack || undefined);
    steps = result.reproSteps;
  }

  // Collect console errors (deduplicated by message). Errors only — used by
  // GitHub/Jira/markdown exports + the root-cause + severity rules.
  const seenErrors = new Set<string>();
  const consoleErrors = events
    .filter(e => ["error", "unhandled_rejection", "console_error"].includes(e.type))
    .map(e => ({
      message: e.data.error?.message || "",
      stack: e.data.error?.stack,
      timestamp: e.timestamp,
    }))
    .filter(e => {
      if (seenErrors.has(e.message)) return false;
      seenErrors.add(e.message);
      return true;
    });

  // Full console capture across all levels — used by the modal + HTML
  // export Console tab so devs see warnings and logs alongside errors,
  // matching what's in DevTools.
  const levelMap: Record<string, "error" | "warn" | "log" | "info"> = {
    "error": "error",
    "unhandled_rejection": "error",
    "console_error": "error",
    "console_warn": "warn",
    "console_log": "log",
  };
  const consoleLogs = events
    .filter(e => e.type in levelMap)
    .map(e => ({
      level: levelMap[e.type],
      message: e.data.error?.message || "",
      stack: e.data.error?.stack,
      timestamp: e.timestamp,
    }))
    .filter(e => !!e.message);

  // Collect ALL captured requests (success + failure) for the Network tab.
  // URLs are already sanitized in collectors.ts (sensitive query params replaced).
  const networkRequests: import("./types").NetworkRequestEntry[] = events
    .filter(e => e.type === "api_request" && e.data.request)
    .map(e => ({
      method: e.data.request?.method || "GET",
      url: e.data.request?.url || "",
      status: e.data.request?.statusCode || 0,
      duration: e.data.request?.durationMs || 0,
      timestamp: e.timestamp,
    }));

  // Enrich failed requests in `networkRequests` with response snippets from the
  // in-memory failure buffer (last 10 only; snippets not persisted).
  // Match by (method+url+status) and nearest timestamp within 5s.
  // Only consider buffer entries captured during THIS session — otherwise
  // failures from a previously-cleared session would leak in.
  const sessionStart = events[0]?.timestamp ?? (captureTs || session.createdAt || 0);
  const buffer = getNetworkFailures().filter(b => b.timestamp >= sessionStart);
  for (const entry of networkRequests) {
    if (entry.status < 400 && entry.status !== 0) continue;
    const match = buffer.find(
      b =>
        b.url === entry.url &&
        b.method === entry.method &&
        b.status === entry.status &&
        Math.abs(b.timestamp - entry.timestamp) < 5000
    );
    if (match && match.response) entry.response = match.response;
  }

  // If an in-memory failure wasn't yet persisted to events (race on async body
  // read), still surface it so the report isn't missing the snippet.
  for (const buf of buffer) {
    const already = networkRequests.some(
      n => n.url === buf.url && n.method === buf.method && n.status === buf.status && Math.abs(n.timestamp - buf.timestamp) < 5000
    );
    if (!already) {
      networkRequests.push({
        method: buf.method,
        url: buf.url,
        status: buf.status,
        duration: 0,
        timestamp: buf.timestamp,
        response: buf.response,
      });
    }
  }

  // Failure-only subset used by GitHub/Jira/markdown exports + root-cause logic.
  const networkErrors: NetworkErrorEntry[] = networkRequests
    .filter(r => r.status >= 400 || r.status === 0)
    .map(r => ({ ...r }));

  // Screenshots from memory + any extras
  const screenshots = [...getScreenshots(), ...(extraScreenshots || [])];

  // Timeline
  const timeline = buildTimeline(events);

  // Voice transcripts from memory
  const voiceTranscripts = getVoiceTranscripts();

  // Most recent screen recording, if QA captured one this session.
  const lastVideo = getLastVideoRecording();
  const video = lastVideo ? {
    url: lastVideo.url,
    dataUrl: lastVideo.dataUrl, // raw base64 — exports use this directly
    durationMs: lastVideo.durationMs,
    mimeType: lastVideo.mimeType,
    sizeBytes: lastVideo.sizeBytes,
    comments: lastVideo.comments.slice(),
    startedAt: lastVideo.startedAt,
  } : undefined;

  // Auto-generate title
  const title = generateBugTitle(session);

  // Last ~10 readable user actions (FIFO, newest last)
  const sessionSteps = generateSessionSteps(events);
  const actionChips = buildActionChips(events);

  // The element the user clicked just before the bug
  const clickedElement = extractClickedElement(events);

  // Build report first, then generate summary + rootCause + severity from full context
  const report: BugReport = {
    title,
    summary: "",
    steps,
    environment,
    consoleErrors,
    consoleLogs,
    networkErrors,
    networkRequests,
    sessionSteps,
    actionChips,
    clickedElement,
    rootCause: { hint: "", confidence: "low" },
    severity: "low",
    priority: "low",
    storage: captureStorageSnapshot(),
    annotations: session.annotations || [],
    screenshots,
    timeline,
    voiceTranscripts,
    video,
    context: getCurrentContext(),
    // Store the trimmed-events session so the HTML export's timeline/duration
    // match the live ticket (both anchored to the capture, no stale span).
    session: { ...session, events },
    generatedAt: Date.now(),
  };

  report.summary = generateSmartSummary(report);
  report.rootCause = generateRootCauseHint(report);
  report.severity = determineSeverity(report);
  // Priority is the tester's call; default it from severity when unset.
  report.priority = session.priority ?? derivePriorityFromSeverity(report.severity);
  return report;
}

/** Default priority mapping when the tester hasn't set one explicitly. */
export function derivePriorityFromSeverity(severity: BugSeverity): BugPriority {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

/** Title-case label for a priority, e.g. "High". */
export function priorityLabel(priority: BugPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/**
 * Drop events from long before the capture so a session reused after a long
 * idle gap doesn't make the replay timeline span hours. `anchorTs` is the
 * capture moment (video start / latest screenshot); when 0 (no media) we anchor
 * to the newest event. Events older than `lookbackMs` before the anchor are
 * dropped. May return an empty array — correct when every event is stale.
 */
export function trimStaleEvents(
  events: TraceBugEvent[],
  anchorTs: number,
  lookbackMs = 30 * 60 * 1000,
): TraceBugEvent[] {
  if (events.length === 0) return events;
  const anchor = anchorTs > 0 ? anchorTs : Math.max(...events.map((e) => e.timestamp));
  const cutoff = anchor - lookbackMs;
  return events.filter((e) => e.timestamp >= cutoff);
}

// ── Smart Summary ─────────────────────────────────────────────────────────
// Single-sentence description at the top of every report.
// Priority: network failure + click > error + click > network > error > click > page.

/**
 * Generate a single-sentence summary that tells a developer what went wrong
 * and where, instantly. Example:
 *   "API POST /orders failed with 500 when clicking 'Place Order' on /checkout"
 */
export function generateSmartSummary(report: BugReport): string {
  const page = report.environment?.url
    ? safePath(report.environment.url)
    : (report.session?.events?.[0]?.page || "/");
  const click = report.clickedElement;
  const firstNet = report.networkErrors[0];
  const firstErr = report.consoleErrors[0];

  const clickPhrase = click ? describeClickPhrase(click) : "";
  const pagePhrase = ` on ${page}`;

  // 1. Network failure + click → richest summary
  if (firstNet && clickPhrase) {
    return `API ${firstNet.method} ${shortPath(firstNet.url)} failed with ${formatStatus(firstNet.status)} when ${clickPhrase}${pagePhrase}`;
  }

  // 2. Error + click → runtime failure tied to an action
  if (firstErr && clickPhrase) {
    const errType = classifyErrorType(firstErr.message);
    return `${errType} thrown when ${clickPhrase}${pagePhrase} — ${truncateMsg(firstErr.message, 80)}`;
  }

  // 3. Network failure alone
  if (firstNet) {
    return `API ${firstNet.method} ${shortPath(firstNet.url)} failed with ${formatStatus(firstNet.status)}${pagePhrase}`;
  }

  // 4. Error alone
  if (firstErr) {
    const errType = classifyErrorType(firstErr.message);
    return `${errType}${pagePhrase}: ${truncateMsg(firstErr.message, 100)}`;
  }

  // 5. Click alone
  if (clickPhrase) {
    return `User action — ${clickPhrase}${pagePhrase} (no errors captured)`;
  }

  // 6. Pure page/session fallback
  return `Bug report captured${pagePhrase}`;
}

function describeClickPhrase(click: ClickedElementSummary): string {
  const label = click.text?.trim() || click.ariaLabel || click.testId || click.id || click.tag || "element";
  const kind =
    click.tag === "button" ? "button" :
    click.tag === "a" ? "link" :
    click.tag === "input" ? "input" :
    "element";
  return `clicking '${truncateMsg(label, 40)}' ${kind}`;
}

function formatStatus(status: number): string {
  if (status === 0) return "Network Error";
  return String(status);
}

function shortPath(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    return u.pathname || url.slice(0, 40);
  } catch {
    return url.length > 40 ? url.slice(0, 40) + "…" : url;
  }
}

function safePath(url: string): string {
  try { return new URL(url).pathname || "/"; } catch { return url; }
}

function classifyErrorType(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("typeerror")) return "TypeError";
  if (m.includes("referenceerror")) return "ReferenceError";
  if (m.includes("syntaxerror")) return "SyntaxError";
  if (m.includes("rangeerror")) return "RangeError";
  const match = (msg || "").match(/^(\w+Error)/);
  if (match) return match[1];
  return "Error";
}

function truncateMsg(msg: string, n: number): string {
  if (!msg) return "";
  const single = msg.replace(/\s+/g, " ").trim();
  return single.length > n ? single.slice(0, n) + "…" : single;
}

// ── Session Steps ─────────────────────────────────────────────────────────
// Last ~10 user-facing actions as plain-English strings.

const SESSION_STEPS_LIMIT = 10;

/** Produce up to 10 readable user-action strings, newest last. */
export function generateSessionSteps(events: TraceBugEvent[]): string[] {
  const steps: string[] = [];
  for (const ev of events) {
    const line = describeStep(ev);
    if (line) steps.push(line);
  }
  // Keep only the last N (FIFO)
  return steps.slice(-SESSION_STEPS_LIMIT);
}

function describeStep(ev: TraceBugEvent): string | null {
  switch (ev.type) {
    case "click": {
      const el = ev.data.element;
      const label = (el?.text || el?.ariaLabel || el?.id || el?.tag || "element").toString().trim().split("\n")[0];
      const kind =
        el?.tag === "button" || el?.buttonType ? "button" :
        el?.tag === "a" ? "link" :
        el?.tag || "element";
      return `Clicked '${truncateMsg(label, 40)}' ${kind}`;
    }
    case "route_change":
      return `Navigated to ${ev.data.to || "/"}`;
    case "form_submit": {
      const id = ev.data.form?.id;
      return id ? `Submitted '${id}' form` : "Submitted form";
    }
    case "select_change": {
      const name = ev.data.element?.name || "dropdown";
      const val = ev.data.element?.selectedText || ev.data.element?.value || "";
      return `Selected '${truncateMsg(val, 30)}' in ${name}`;
    }
    // Inputs intentionally skipped — too noisy for a 10-step summary.
    default:
      return null;
  }
}

// ── Clicked Element ───────────────────────────────────────────────────────
// Extract the most recent click's element info for use in smart summary
// and in downstream export formats (GitHub / Jira).

export function extractClickedElement(events: TraceBugEvent[]): ClickedElementSummary | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.type !== "click") continue;
    const el = ev.data.element || {};
    return {
      tag: el.tag || "",
      text: ((el.text || "").toString().trim().split("\n")[0] || "").slice(0, 120),
      selector: el.selector || undefined,
      id: el.id || undefined,
      ariaLabel: el.ariaLabel || undefined,
      testId: el.testId || undefined,
      page: ev.page || "/",
    };
  }
  return null;
}

// ── Root Cause Hint Engine ────────────────────────────────────────────────
// Deterministic, no API calls, no dependencies. Pure function of report data.
// Three-tier confidence based on which signal is strongest:
//   HIGH   → a failed network request is present
//   MEDIUM → a JS runtime error is present (but no network failure)
//   LOW    → only a click / fallback

const RC_LABEL_MAX = 40;

/**
 * Produce a best-guess cause for the bug. Runs in O(1) on report fields
 * that are already computed — no event scans, no async.
 */
export function generateRootCauseHint(report: BugReport): RootCauseHint {
  const firstNet = report.networkErrors && report.networkErrors[0];
  const firstErr = report.consoleErrors && report.consoleErrors[0];
  const click = report.clickedElement;

  // ── HIGH confidence ── Network failure tells us exactly what broke ──────
  if (firstNet) {
    const endpoint = shortPath(firstNet.url);
    const status = firstNet.status === 0 ? "Network Error" : String(firstNet.status);
    const method = firstNet.method || "GET";
    const actionPhrase = click ? ` after clicking '${clickLabel(click)}'` : "";
    return {
      hint: `API ${method} ${endpoint} failed with ${status}${actionPhrase}`,
      confidence: "high",
    };
  }

  // ── MEDIUM confidence ── Runtime error with no network context ──────────
  if (firstErr && firstErr.message) {
    const errType = classifyErrorType(firstErr.message);
    const suggestion = suggestCauseFromError(firstErr.message);
    return {
      hint: `${errType} ${suggestion}`,
      confidence: "medium",
    };
  }

  // ── LOW confidence ── Click with no error / network signal ──────────────
  if (click) {
    return {
      hint: `Click on '${clickLabel(click)}' did not trigger any observable effect`,
      confidence: "low",
    };
  }

  // No actionable signal at all
  return {
    hint: "Not enough signal captured to suggest a likely cause",
    confidence: "low",
  };
}

/**
 * Render a root-cause hint as a one-line label for report headers.
 * Shared by GitHub / Jira / PDF / Quick-Bug so the phrasing stays consistent.
 *
 * Example: "🔍 Possible Cause (high confidence): API POST /orders failed with 500"
 */
export function formatRootCauseLine(rc: RootCauseHint | null | undefined): string {
  if (!rc || !rc.hint) return "";
  return `\uD83D\uDD0D Possible Cause (${rc.confidence} confidence): ${rc.hint}`;
}

// \u2500\u2500 Severity Auto-Tag \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Top-level severity classification \u2014 drives the colored emoji prefix on
// every export title and the badge in the Quick Bug modal. Same rule ladder
// `determinePriority` used in jira-issue.ts; relocated so every export
// (GitHub / PDF / modal / Jira) maps from one source of truth.

const SEVERITY_EMOJI: Record<BugSeverity, string> = {
  critical: "\uD83D\uDD34", // \uD83D\uDD34
  high: "\uD83D\uDFE0",     // \uD83D\uDFE0
  medium: "\uD83D\uDFE1",   // \uD83D\uDFE1
  low: "\uD83D\uDFE2",      // \uD83D\uDFE2
};

const SEVERITY_LABEL: Record<BugSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function determineSeverity(report: BugReport): BugSeverity {
  // Critical errors (TypeError, ReferenceError, SyntaxError) \u2192 critical
  const hasCriticalError = report.consoleErrors.some(e =>
    /TypeError|ReferenceError|SyntaxError/i.test(e.message)
  );
  if (hasCriticalError) return "critical";

  // Server errors (5xx) \u2192 high
  const hasServerError = report.networkErrors.some(r => r.status >= 500);
  if (hasServerError) return "high";

  // Client errors (4xx) or network failures \u2192 medium
  if (report.networkErrors.length > 0) return "medium";

  // Tester-reported critical/major annotation \u2192 medium
  if (report.annotations.some(a => a.severity === "critical" || a.severity === "major")) return "medium";

  // Console errors only \u2192 low
  if (report.consoleErrors.length > 0) return "low";

  return "low";
}

/** Emoji + label, e.g. "\uD83D\uDD34 Critical". */
export function severityBadge(sev: BugSeverity): string {
  return `${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]}`;
}

/** Title prefix string, e.g. "\uD83D\uDD34 Critical \u00B7 " \u2014 caller appends raw title. */
export function severityTitlePrefix(sev: BugSeverity): string {
  return `${SEVERITY_EMOJI[sev]} ${SEVERITY_LABEL[sev]} \u00B7 `;
}

function clickLabel(click: ClickedElementSummary): string {
  const raw = click.text || click.ariaLabel || click.testId || click.id || click.tag || "element";
  return truncateMsg(raw, RC_LABEL_MAX);
}

// Heuristic mapping from error message shape → human cause suggestion.
// First tries the categorized Pattern Library v2 (~60 patterns across React,
// Vue, Angular, network, auth, storage, general). Falls back to the legacy
// inline rules if nothing matches — keeps previous behavior on edge cases.
function suggestCauseFromError(msg: string): string {
  const match = matchErrorPattern(msg);
  if (match) return formatPatternMatch(match);

  const m = msg.toLowerCase();

  if (m.includes("cannot read prop") || m.includes("cannot read properties") ||
      m.includes("of undefined") || m.includes("of null")) {
    return "suggests undefined/null data — the response or upstream value was likely missing";
  }
  if (m.includes("cannot set prop") || m.includes("cannot assign to read only")) {
    return "suggests writing to an undefined/null or frozen object";
  }
  if (m.includes("is not a function")) {
    return "suggests the target is not callable — check imports, typos, or a wrong value shape";
  }
  if (m.includes("is not defined") || m.includes("is not a constructor")) {
    return "suggests a missing variable, import, or stale build";
  }
  if (m.includes("maximum call stack")) {
    return "suggests infinite recursion or a render loop";
  }
  if (m.includes("unexpected token") || m.includes("unexpected end of")) {
    return "suggests malformed JSON or a parsing issue in the response";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) {
    return "suggests a blocked or failed request — check CORS, offline, or DNS";
  }
  if (m.includes("aborted") || m.includes("abort")) {
    return "suggests the request was cancelled before completion";
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return "suggests an upstream service is slow or unreachable";
  }
  if (m.includes("cors")) {
    return "suggests a CORS policy mismatch on the server";
  }
  if (m.includes("permission") || m.includes("denied")) {
    return "suggests a missing permission or authorization failure";
  }
  if (m.includes("quota") || m.includes("exceeded")) {
    return "suggests a storage or rate limit was exceeded";
  }

  return "suggests an unexpected runtime value — inspect inputs and data sources";
}
