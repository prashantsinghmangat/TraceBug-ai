// ── HAR export ────────────────────────────────────────────────────────────
// Serializes a report's captured network activity into a standard HAR 1.2
// (HTTP Archive) file. HAR is the interchange format every DevTools, Charles,
// Fiddler, and Postman speaks — so a TraceBug capture drops straight into any
// existing network-debugging workflow.
//
// Notably: Jam markets "everything a HAR offers" but ships no HAR export.
// TraceBug already captures the request/response data — this just reshapes it
// into the spec, no new capture and no dependency.
//
// We populate what we captured (method, url, status, timing, query string,
// failed-response bodies) and leave spec-optional fields we don't have as
// empty arrays / -1 sentinels, which is valid per the HAR 1.2 schema.

import type { BugReport, NetworkRequestEntry, NetworkErrorEntry } from "../types";

// ── HAR 1.2 types (only the fields we emit) ──────────────────────────────

interface HarNameValue { name: string; value: string; }

interface HarEntry {
  pageref: string;
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: HarNameValue[];
    headers: HarNameValue[];
    queryString: HarNameValue[];
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: HarNameValue[];
    headers: HarNameValue[];
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

export interface HarLog {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    browser?: { name: string; version: string };
    pages: Array<{
      startedDateTime: string;
      id: string;
      title: string;
      pageTimings: { onContentLoad: number; onLoad: number };
    }>;
    entries: HarEntry[];
  };
}

// ── Build ─────────────────────────────────────────────────────────────────

/** Build a HAR 1.2 log object from a BugReport. Pure — no download side effect. */
export function buildHar(report: BugReport, creatorVersion = "0.0.0"): HarLog {
  const env = report.environment;
  const pageStart = env?.timestamp || report.generatedAt || minTimestamp(report) || Date.now();

  // Prefer the full request list; fall back to failures-only for older reports.
  const requests: Array<NetworkRequestEntry | NetworkErrorEntry> =
    report.networkRequests && report.networkRequests.length
      ? report.networkRequests
      : report.networkErrors || [];

  const pageId = "page_1";
  const entries: HarEntry[] = requests
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((r) => toEntry(r, pageId));

  return {
    log: {
      version: "1.2",
      creator: { name: "TraceBug", version: creatorVersion },
      ...(env?.browser
        ? { browser: { name: env.browser, version: env.browserVersion || "" } }
        : {}),
      pages: [
        {
          startedDateTime: new Date(pageStart).toISOString(),
          id: pageId,
          title: env?.url || report.title || "TraceBug session",
          pageTimings: { onContentLoad: -1, onLoad: -1 },
        },
      ],
      entries,
    },
  };
}

function toEntry(r: NetworkRequestEntry | NetworkErrorEntry, pageId: string): HarEntry {
  const duration = Math.max(0, Math.round(r.duration || 0));
  const hasBody = typeof r.response === "string" && r.response.length > 0;
  return {
    pageref: pageId,
    startedDateTime: new Date(r.timestamp).toISOString(),
    time: duration,
    request: {
      method: r.method || "GET",
      url: r.url || "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      queryString: parseQueryString(r.url || ""),
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: r.status ?? 0,
      statusText: statusText(r.status ?? 0),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      content: hasBody
        ? { size: r.response!.length, mimeType: guessMime(r.response!), text: r.response }
        : { size: 0, mimeType: "" },
      redirectURL: "",
      headersSize: -1,
      bodySize: hasBody ? r.response!.length : -1,
    },
    cache: {},
    // We only captured total duration; attribute it to `wait` and mark the
    // phases we didn't measure as -1 (the HAR spec sentinel for "unknown").
    timings: { send: -1, wait: duration, receive: -1 },
  };
}

// ── Browser download ──────────────────────────────────────────────────────

export interface HarExportResult {
  filename: string;
  blob: Blob;
  url: string;
  sizeBytes: number;
  entryCount: number;
}

/** Build the HAR and trigger a browser download. Returns the blob for callers. */
export function exportSessionAsHar(
  report: BugReport,
  options: { filename?: string; creatorVersion?: string } = {},
): HarExportResult {
  const har = buildHar(report, options.creatorVersion);
  const json = JSON.stringify(har, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = options.filename || defaultFilename(report);
  triggerDownload(url, filename);
  return { filename, blob, url, sizeBytes: blob.size, entryCount: har.log.entries.length };
}

function defaultFilename(report: BugReport): string {
  const sid = report.session?.sessionId?.slice(0, 8) || "session";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-${sid}-${stamp}.har`;
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseQueryString(url: string): HarNameValue[] {
  const q = url.indexOf("?");
  if (q === -1) return [];
  const search = url.slice(q + 1).split("#")[0];
  if (!search) return [];
  const out: HarNameValue[] = [];
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const name = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    out.push({ name: safeDecode(name), value: safeDecode(value) });
  }
  return out;
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return s; }
}

function guessMime(body: string): string {
  const t = body.trimStart();
  if (t.startsWith("{") || t.startsWith("[")) return "application/json";
  if (t.startsWith("<")) return t.slice(0, 20).toLowerCase().includes("html") ? "text/html" : "application/xml";
  return "text/plain";
}

const STATUS_TEXT: Record<number, string> = {
  0: "", 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently",
  302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized",
  403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
  409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests",
  500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
  503: "Service Unavailable", 504: "Gateway Timeout",
};

function statusText(status: number): string {
  return STATUS_TEXT[status] ?? "";
}

function minTimestamp(report: BugReport): number | null {
  const all: number[] = [];
  for (const r of report.networkRequests || []) all.push(r.timestamp);
  for (const r of report.networkErrors || []) all.push(r.timestamp);
  return all.length ? Math.min(...all) : null;
}
