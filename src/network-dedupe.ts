// ── Network row de-duplication ────────────────────────────────────────────
//
// Every fetch/XHR reaches the report TWICE. The wrappers in collectors.ts
// (`collectApiRequests` / `collectXhrRequests`) emit one row, and the Resource
// Timing backfill (`collectPerformanceNetwork`) emits another for the same
// request. `_emitPerfEntry` de-duplicates only *within* the timing source, so
// nothing ever compared the two against each other.
//
// The duplicate is not merely noise — it is wrong. Resource Timing does not
// expose the HTTP method, so the timing row always claims `GET`. A report of a
// failing POST therefore showed the POST and a phantom GET beside it, and a
// real export measured 112 rows for 75 distinct paths.
//
// Two things make the comparison non-obvious, and both are the reason this is
// a module and not three lines inline:
//
//  1. **The two sources spell the URL differently.** The wrapper records what
//     the app passed (`/api/orders` — usually relative); Resource Timing always
//     reports the resolved absolute URL (`https://host/api/orders`). Comparing
//     the strings as they stand matches almost nothing, so both sides are
//     resolved against the page origin first.
//  2. **The two sources time it differently.** The wrapper emits on completion
//     (`timestamp - duration` recovers the start); Resource Timing knows the
//     true start and carries it as `startedAt`. Pairing on START, not on the
//     emitted timestamp, is what keeps a slow request from pairing with a fast
//     one to the same URL.
//
// The wrapper row always wins: it is the one with the real method and status.
//
// Static assets (images, scripts, CSS, fonts, media) have no wrapper row at
// all — the backfill is the only reason they are in the report, which is the
// whole point of having it. They are never dropped, and an explicit initiator
// guard keeps that true even if an app also fetch()es an image URL.

/** The shape this works on — a superset of `NetworkRequestEntry`. */
export interface DedupableRow {
  url: string;
  duration: number;
  timestamp: number;
  /** `"resource-timing"` marks a row backfilled from the Resource Timing
   *  buffer. Absent (or anything else) means a fetch/XHR wrapper row. */
  source?: string;
  /** Resource Timing's `initiatorType`, when the row came from timing. */
  initiatorType?: string;
  /** True request start in epoch ms, when the source knows it exactly. */
  startedAt?: number;
}

/** Resource Timing initiator types the wrappers can never produce. A row with
 *  one of these is the backfill doing its job, so it is kept unconditionally. */
const STATIC_INITIATORS = new Set([
  "img", "image", "css", "link", "script", "font",
  "media", "video", "audio", "track", "embed", "object",
]);

/** How far apart two records of the same request may start and still be the
 *  same request. The wrapper stamps `Date.now()` just before calling through;
 *  Resource Timing stamps the browser's own start. A few ms of scheduling sits
 *  between them — 50ms is comfortably above that and well below the gap
 *  between two deliberate requests to the same URL. */
export const DEDUPE_WINDOW_MS = 50;

/** Resolve a URL for comparison. Relative stays comparable to absolute; a
 *  fragment is dropped (it never reaches the server); anything unparseable
 *  falls back to its raw form so a weird URL is compared with itself, not
 *  collapsed into every other weird URL. */
export function normalizeUrl(url: string, base?: string): string {
  if (!url) return "";
  try {
    const u = new URL(url, base || undefined);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

/** The start of the request this row describes. */
function startOf(row: DedupableRow): number {
  if (typeof row.startedAt === "number" && row.startedAt > 0) return row.startedAt;
  return row.timestamp - (row.duration || 0);
}

/**
 * Drop Resource Timing rows that duplicate a fetch/XHR row, keeping the
 * wrapper's version. Order is preserved; wrapper rows are never dropped.
 *
 * Pairing consumes the wrapper row it matched, so N polled requests to one URL
 * keep N rows rather than collapsing into one — a report that hid a retry loop
 * would be worse than the duplicates this removes.
 *
 * Pure: no DOM, no clock. `baseUrl` is the page the capture ran on; when it is
 * absent only already-absolute URLs can pair, which costs recall and never
 * correctness.
 */
export function dedupeNetworkRows<T extends DedupableRow>(
  rows: T[],
  opts?: { baseUrl?: string; windowMs?: number },
): T[] {
  if (!Array.isArray(rows) || rows.length < 2) return Array.isArray(rows) ? rows : [];
  const base = opts?.baseUrl;
  const windowMs = opts?.windowMs ?? DEDUPE_WINDOW_MS;

  const isTiming = (r: DedupableRow) => r.source === "resource-timing";

  // Wrapper starts by normalized URL. `used` marks the ones already paired.
  const wrapperStarts = new Map<string, { start: number; used: boolean }[]>();
  for (const row of rows) {
    if (isTiming(row)) continue;
    const key = normalizeUrl(row.url, base);
    const list = wrapperStarts.get(key);
    const entry = { start: startOf(row), used: false };
    if (list) list.push(entry);
    else wrapperStarts.set(key, [entry]);
  }
  if (wrapperStarts.size === 0) return rows;

  return rows.filter((row) => {
    if (!isTiming(row)) return true;
    // The backfill is the only source for static assets — never drop one.
    if (row.initiatorType && STATIC_INITIATORS.has(row.initiatorType)) return true;

    const candidates = wrapperStarts.get(normalizeUrl(row.url, base));
    if (!candidates) return true;

    const start = startOf(row);
    let best: { start: number; used: boolean } | null = null;
    let bestDelta = Infinity;
    for (const c of candidates) {
      if (c.used) continue;
      const delta = Math.abs(c.start - start);
      if (delta <= windowMs && delta < bestDelta) { best = c; bestDelta = delta; }
    }
    if (!best) return true;
    best.used = true;
    return false;
  });
}
