// ── Last audit per page ────────────────────────────────────────────────────
// Keeps the newest run of each scan for the last few pages in sessionStorage,
// so reopening the panel shows the last result instead of re-scanning, and a
// re-scan after "fix the code → reload" still has a "before" to compare with.
//
// Why sessionStorage: it survives reloads in the same tab (the fix loop) and
// has its OWN quota — page localStorage holds saved tickets, which must never
// lose space to a cache (docs/ticket-flow.md). Like localStorage it is
// readable by the page; an audit run only holds this page's own content,
// already redacted by buildAuditRun. Every access is best-effort: blocked or
// full storage just means no saved result.

import type { AuditRun } from "../types";

const KEY = "tracebug_audit_last_v1";
const MAX_ENTRIES = 8;
const MAX_CHARS = 1_500_000;

interface Entry { page: string; scan: string; run: AuditRun }

/** The page a run belongs to, from the LIVE address (a run's own `url` has its query masked, so it
 *  can't identify the page). No hash part, so in-page anchors share a result. Stored hashed, so no
 *  query value (which may hold a token) is written to storage. */
export function auditPageKey(url: string): string {
  let page: string;
  try {
    const u = new URL(url);
    page = `${u.origin}${u.pathname}${u.search}`;
  } catch {
    page = url.split("#")[0];
  }
  // FNV-1a, 2 × 32 bits: an id, not a secret.
  let a = 0x811c9dc5, b = 0x01000193 ^ page.length;
  for (let i = 0; i < page.length; i++) {
    const c = page.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

function read(): Entry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.page === "string" && e.run) : [];
  } catch {
    return [];
  }
}

/** Remember a run as the newest for its page (the live address it ran on) and scan. */
export function saveAuditRun(run: AuditRun, pageUrl: string): void {
  try {
    const page = auditPageKey(pageUrl);
    const scan = run.scan ?? "custom";
    const entry: Entry = { page, scan, run };
    const one = JSON.stringify(entry);
    if (one.length > MAX_CHARS) return;
    let list = [entry, ...read().filter((e) => !(e.page === page && e.scan === scan))].slice(0, MAX_ENTRIES);
    // Shed the oldest until it fits our budget (and, if the quota is tighter, the browser's).
    while (list.length && JSON.stringify(list).length > MAX_CHARS) list = list.slice(0, -1);
    for (;;) {
      try { sessionStorage.setItem(KEY, JSON.stringify(list)); return; }
      catch { if (list.length <= 1) return; list = list.slice(0, -1); }
    }
  } catch {
    /* storage blocked: memory only */
  }
}

/** The newest saved run for this page and scan, or (no scan given) of any scan. */
export function loadAuditRun(url: string, scan?: string): AuditRun | null {
  const page = auditPageKey(url);
  const hit = read().find((e) => e.page === page && (scan === undefined || e.scan === scan));
  return hit ? hit.run : null;
}

export function clearSavedAuditRuns(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
