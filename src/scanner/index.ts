// ── Scanner orchestrator ──────────────────────────────────────────────────
// Runs every detector in parallel, collects results into a single in-memory
// store, and exposes simple queries (getIssues, dismissIssue, fileAsBug).
//
// Issues live in memory only — each scan is a fresh run, results clear on
// page reload. Mirrors the screenshot/video memory model.

import { Issue, IssueDetector } from "../types";
import { getAllSessions } from "../storage";
import { detectBrokenImages } from "./detectors/broken-images";
import { detectMixedContent } from "./detectors/mixed-content";
import { detectConsoleErrors, detectFailedRequests, detectSlowApis } from "./detectors/session-data";
import { detectA11yViolations } from "./detectors/a11y";

let _issues: Issue[] = [];
let _scanInFlight: Promise<Issue[]> | null = null;
let _lastScanAt = 0;

const SEVERITY_ORDER: Record<Issue["severity"], number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export interface ScanResult {
  issues: Issue[];
  durationMs: number;
  scannedAt: number;
}

/**
 * Run every detector in parallel. Concurrent scans are coalesced — calling
 * scan() while one is already running returns the in-flight promise.
 */
export async function scan(): Promise<ScanResult> {
  if (_scanInFlight) {
    const issues = await _scanInFlight;
    return { issues, durationMs: 0, scannedAt: _lastScanAt };
  }

  const startedAt = Date.now();
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const session = sessions[0] || null;

  // Promise.allSettled isn't in the ES2018 target lib, so wrap each detector
  // in a catch that returns []. One failure doesn't block the others.
  const safeRun = (p: Promise<Issue[]>): Promise<Issue[]> =>
    p.catch((err) => {
      console.warn("[TraceBug] Detector failed:", err);
      return [];
    });

  _scanInFlight = Promise.all([
    safeRun(detectBrokenImages()),
    safeRun(detectMixedContent()),
    safeRun(detectConsoleErrors(session)),
    safeRun(detectFailedRequests(session)),
    safeRun(detectSlowApis(session)),
    safeRun(detectA11yViolations()),
  ]).then((results) => {
    const all: Issue[] = ([] as Issue[]).concat(...results);
    // Stable sort: severity first, then detection time.
    all.sort((a, b) => {
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (sev !== 0) return sev;
      return a.detectedAt - b.detectedAt;
    });
    _issues = all;
    return all;
  });

  try {
    const issues = await _scanInFlight;
    _lastScanAt = Date.now();
    return { issues, durationMs: _lastScanAt - startedAt, scannedAt: _lastScanAt };
  } finally {
    _scanInFlight = null;
  }
}

/** Snapshot of current issues. Filters out dismissed by default. */
export function getIssues(options?: { includeDismissed?: boolean }): Issue[] {
  const includeDismissed = options?.includeDismissed ?? false;
  return includeDismissed ? _issues.slice() : _issues.filter(i => !i.dismissed);
}

/** Mark an issue as dismissed for the current session. */
export function dismissIssue(id: string): boolean {
  const issue = _issues.find(i => i.id === id);
  if (!issue) return false;
  issue.dismissed = true;
  return true;
}

/** Restore a previously dismissed issue. */
export function undismissIssue(id: string): boolean {
  const issue = _issues.find(i => i.id === id);
  if (!issue) return false;
  issue.dismissed = false;
  return true;
}

/** Clear all issues from memory. Called from destroy() and "Clear all data". */
export function clearIssues(): void {
  _issues = [];
  _lastScanAt = 0;
}

/** Aggregate counts grouped by detector, useful for the toolbar badge. */
export function getIssueCountsByDetector(): Record<IssueDetector, number> {
  const counts: Record<IssueDetector, number> = {
    "axe-a11y": 0,
    "broken-image": 0,
    "mixed-content": 0,
    "console-error": 0,
    "slow-api": 0,
    "failed-request": 0,
  };
  for (const i of _issues) {
    if (i.dismissed) continue;
    counts[i.detector] = (counts[i.detector] || 0) + 1;
  }
  return counts;
}

/** Count of non-dismissed issues at each severity. */
export function getIssueCountsBySeverity(): Record<Issue["severity"], number> {
  const counts: Record<Issue["severity"], number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  };
  for (const i of _issues) {
    if (i.dismissed) continue;
    counts[i.severity] += 1;
  }
  return counts;
}

/** Lookup helper for the issues panel — find by id. */
export function getIssueById(id: string): Issue | null {
  return _issues.find(i => i.id === id) || null;
}
