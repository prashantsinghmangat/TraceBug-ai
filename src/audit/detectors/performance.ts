// ── Performance checks (lab, this page load) ───────────────────────────────
// docs/audit-quality/implementation-plan.md §4. Read from the browser's own
// Performance timeline — no Lighthouse, no extra permission, no extra load:
//
//   perf/lcp, perf/fcp, perf/ttfb   slow paint / server response (web.dev thresholds)
//   perf/cls                        layout shift (Chromium only; N/A elsewhere, not "0")
//   perf/page-weight                total transfer size of this load
//   perf/large-resource             the biggest single files (≥ 500 KB)
//   perf/render-blocking            files that held up the first paint (Chromium only)
//
// Values are from THIS page load in THIS browser: lab data, not real-user
// (field) data, and INP is not measured — the limitation says so.

import type { Issue, IssueSeverity } from "../../types";
import { makeIssueId } from "../../scanner/helpers";

/** web.dev "needs improvement" / "poor" boundaries. */
export const PERF_THRESHOLDS = {
  lcpMs: [2500, 4000],
  fcpMs: [1800, 3000],
  ttfbMs: [800, 1800],
  cls: [0.1, 0.25],
} as const;
export const PAGE_WEIGHT_KB = 3000;
export const LARGE_RESOURCE_KB = 500;
const MAX_LARGE = 5;
const MAX_BLOCKING = 10;
/** A render-blocking file is a finding only when it took at least this long. */
export const RENDER_BLOCKING_MS = 200;

export const PERF_LIMITATION = "Lab values from this single page load in this browser, not real-user data. INP is not measured. TraceBug's own files are left out.";

export interface PerfAuditResult {
  ran: boolean;
  limitation: string;
  metrics: Record<string, number>;
  findings: Issue[];
}

function perfFinding(ruleId: string, severity: IssueSeverity, title: string, description: string, extra: Partial<Issue> = {}): Issue {
  return {
    id: makeIssueId("audit-perf"),
    detector: "audit-perf",
    category: "performance",
    ruleId,
    severity,
    title,
    description,
    page: location.href,
    detectedAt: Date.now(),
    ...extra,
  };
}

/** Entries of a type the browser buffered during load. Resolves [] when the type isn't supported. */
function buffered(type: string): Promise<PerformanceEntry[]> {
  const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes || [];
  if (!supported.includes(type)) return Promise.resolve([]);
  return new Promise((resolve) => {
    const got: PerformanceEntry[] = [];
    let po: PerformanceObserver | null = null;
    const finish = () => { try { got.push(...(po?.takeRecords() || [])); po?.disconnect(); } catch {} resolve(got); };
    try {
      po = new PerformanceObserver((list) => { got.push(...list.getEntries()); });
      po.observe({ type, buffered: true } as PerformanceObserverInit);
    } catch {
      resolve([]);
      return;
    }
    setTimeout(finish, 60);
  });
}

const fileName = (url: string): string => {
  try { const u = new URL(url); return (u.pathname.split("/").pop() || u.hostname).slice(0, 80); } catch { return url.slice(0, 80); }
};

/** A file TraceBug itself loaded: extension URLs, or a script named tracebug*.js. */
export function isTraceBugResource(url: string): boolean {
  if (/^(chrome|moz|safari-web)-extension:/i.test(url)) return true;
  try {
    const file = new URL(url).pathname.split("/").pop() || "";
    return /^tracebug[\w.-]*\.m?js$/i.test(file);
  } catch {
    return false;
  }
}

function grade(value: number, [good, poor]: readonly [number, number]): IssueSeverity | null {
  if (value > poor) return "serious";
  if (value > good) return "moderate";
  return null;
}

export async function detectPerfFindings(): Promise<PerfAuditResult> {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav) {
    return { ran: false, limitation: "This browser exposes no page-load timing for this page, so performance was not checked.", metrics: {}, findings: [] };
  }
  const findings: Issue[] = [];
  const metrics: Record<string, number> = {};
  const notes: string[] = [PERF_LIMITATION];

  // TTFB
  const ttfb = Math.round(nav.responseStart - nav.startTime);
  if (ttfb > 0) metrics.ttfbMs = ttfb;

  // FCP
  const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0];
  if (fcpEntry) metrics.fcpMs = Math.round(fcpEntry.startTime);

  // LCP (last candidate wins)
  const lcpEntries = await buffered("largest-contentful-paint");
  const lcp = lcpEntries[lcpEntries.length - 1] as (PerformanceEntry & { element?: Element | null; url?: string }) | undefined;
  if (lcp) metrics.lcpMs = Math.round(lcp.startTime);

  // CLS (sum of shifts without recent input; Chromium only)
  const shiftTypeSupported = ((PerformanceObserver as unknown as { supportedEntryTypes?: string[] }).supportedEntryTypes || []).includes("layout-shift");
  if (shiftTypeSupported) {
    const shifts = (await buffered("layout-shift")) as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>;
    metrics.cls = Math.round(shifts.filter((s) => !s.hadRecentInput).reduce((t, s) => t + s.value, 0) * 1000) / 1000;
  } else {
    notes.push("Layout shift (CLS) is not measured in this browser.");
  }

  const thresholds: Array<[keyof typeof PERF_THRESHOLDS, string, string, string]> = [
    ["lcpMs", "perf/lcp", "Largest content paints at", "The largest image or text block appears at {v}. Over 2.5 s feels slow; over 4 s, users leave."],
    ["fcpMs", "perf/fcp", "First content paints at", "Nothing is drawn until {v}. Over 1.8 s, the page feels stuck."],
    ["ttfbMs", "perf/ttfb", "Server responds after", "The first byte of the page arrives after {v}. Over 0.8 s, everything after it starts late."],
    ["cls", "perf/cls", "Layout shift score", "Content moved by {v} while loading (0.1 or less is good). Usually images or embeds without reserved space, or late-loading banners."],
  ];
  for (const [key, ruleId, label, text] of thresholds) {
    const v = metrics[key];
    if (v === undefined) continue;
    const sev = grade(v, PERF_THRESHOLDS[key]);
    if (!sev) continue;
    const shown = key === "cls" ? String(v) : `${(v / 1000).toFixed(2)} s`;
    const extra: Partial<Issue> = { evidence: { metrics: { [key]: v, good: PERF_THRESHOLDS[key][0], poor: PERF_THRESHOLDS[key][1] } } };
    if (key === "lcpMs" && lcp?.url) extra.url = lcp.url;
    findings.push(perfFinding(ruleId, sev, `${label} ${shown}`, text.replace("{v}", shown), extra));
  }

  // Resources
  // TraceBug's own files (the script-tag SDK, the extension's injected scripts
  // and axe) are not the page's: leave them out of every number and finding.
  const resources = (performance.getEntriesByType("resource") as Array<PerformanceResourceTiming & { renderBlockingStatus?: string }>)
    .filter((r) => !isTraceBugResource(r.name));
  const total = resources.reduce((t, r) => t + (r.transferSize || 0), nav.transferSize || 0);
  metrics.transferKb = Math.round(total / 1024);
  metrics.requests = resources.length + 1;
  if (metrics.transferKb > PAGE_WEIGHT_KB) {
    findings.push(perfFinding("perf/page-weight", "moderate", `Page downloads ${(metrics.transferKb / 1024).toFixed(1)} MB`,
      `This load transferred ${metrics.transferKb} KB over ${metrics.requests} requests. Above ${PAGE_WEIGHT_KB / 1024} MB is slow on mobile connections.`,
      { evidence: { metrics: { transferKb: metrics.transferKb, requests: metrics.requests } } }));
  }
  const sizeOf = (r: PerformanceResourceTiming) => r.transferSize || r.encodedBodySize || 0;
  const large = resources.filter((r) => sizeOf(r) >= LARGE_RESOURCE_KB * 1024).sort((a, b) => sizeOf(b) - sizeOf(a)).slice(0, MAX_LARGE);
  for (const r of large) {
    const kb = Math.round(sizeOf(r) / 1024);
    findings.push(perfFinding("perf/large-resource", "minor", `${fileName(r.name)} is ${kb} KB`,
      `One of the largest files on this page (${r.initiatorType || "resource"}). Compress it, split it, or load it later.`,
      { url: r.name, evidence: { metrics: { sizeKb: kb, durationMs: Math.round(r.duration) }, hints: [fileName(r.name)] } }));
  }
  // Every <head> stylesheet blocks rendering; only the ones that held it up long enough to matter are findings.
  const blocking = resources.filter((r) => r.renderBlockingStatus === "blocking" && r.duration >= RENDER_BLOCKING_MS).slice(0, MAX_BLOCKING);
  for (const r of blocking) {
    findings.push(perfFinding("perf/render-blocking", "minor", `${fileName(r.name)} blocks the first paint`,
      `The browser waited ${Math.round(r.duration)} ms for this ${r.initiatorType || "file"} before drawing anything. Add defer/async to scripts or load non-critical CSS later.`,
      { url: r.name, evidence: { metrics: { durationMs: Math.round(r.duration) }, hints: [fileName(r.name)] } }));
  }
  if (!resources.some((r) => typeof r.renderBlockingStatus === "string")) {
    notes.push("Render-blocking files are not reported by this browser.");
  }

  return { ran: true, limitation: notes.join(" "), metrics, findings };
}
