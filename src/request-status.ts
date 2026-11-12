// ── Did this request fail? ─────────────────────────────────────────────────
// One answer for the report, the title, the timeline, the repro steps, the
// AI prompt and the MCP server. Status 0 used to mean "failed" everywhere,
// but it also means three things that are not failures:
//   - a Resource Timing row whose status the browser didn't expose (every
//     Firefox row; cross-origin rows without Timing-Allow-Origin) — unknown;
//   - a fetch/XHR the app aborted on purpose;
//   - an opaque `no-cors` response, which is status 0 by design.
// Reporting those as "API … failed with Network Error" at high confidence
// sent readers and AI agents after a failure that never happened.

/** The fields a request row or `api_request` event carries. Rows use
 *  `status`, events `statusCode`. */
export interface RequestOutcome {
  status?: number;
  statusCode?: number;
  /** `"resource-timing"` for a row backfilled from the Resource Timing buffer. */
  source?: string;
  /** Set on report rows built from a status-0 Resource Timing record. */
  statusUnknown?: boolean;
  aborted?: boolean;
  opaque?: boolean;
}

function statusOf(r: RequestOutcome): number {
  return typeof r.status === "number" ? r.status : typeof r.statusCode === "number" ? r.statusCode : 0;
}

/** True for an HTTP error (>= 400) or a network error the app actually hit. */
export function isFailedRequest(r: RequestOutcome | null | undefined): boolean {
  if (!r) return false;
  const status = statusOf(r);
  if (status >= 400) return true;
  if (status !== 0) return false;
  return !(r.source === "resource-timing" || r.statusUnknown || r.aborted || r.opaque);
}

/** How to show a request's status: a number, or what a 0 really means. */
export function requestStatusLabel(r: RequestOutcome): string {
  const status = statusOf(r);
  if (status !== 0) return String(status);
  if (r.aborted) return "aborted";
  if (r.opaque) return "opaque";
  if (r.source === "resource-timing" || r.statusUnknown) return "status unknown";
  return "Network Error";
}
