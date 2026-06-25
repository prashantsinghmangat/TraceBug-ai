// ── Web Storage snapshot ──────────────────────────────────────────────────
// Captures localStorage + sessionStorage at report-build time. Values under
// sensitive-looking keys (or that look like tokens) are redacted here, at the
// source, so secrets never enter the report object in the first place. The
// cloud-upload sanitizer (sanitize/cloud-upload.ts) runs a second pass for
// defense-in-depth.

import { StorageEntry, StorageSnapshot } from "./types";

// Cap per storage area so a page with thousands of keys can't bloat the report.
const MAX_ENTRIES_PER_AREA = 50;
// Cap individual value length — full tokens/blobs aren't useful for debugging.
const MAX_VALUE_LEN = 300;

// Keys whose values are masked outright. Conservative — matches the spirit of
// the network/query redaction in collectors + sanitize/cloud-upload.
const SENSITIVE_KEY = /token|secret|auth|password|passwd|pwd|jwt|session|api[_-]?key|access|refresh|credential|private/i;

// Value shapes that are almost certainly credentials regardless of key name.
const SENSITIVE_VALUE = /^(eyJ[A-Za-z0-9_-]{10,})|(sk-[A-Za-z0-9]{16,})|(gh[pousr]_[A-Za-z0-9]{20,})|(Bearer\s+)/;

function maskValue(raw: string): string {
  if (!raw) return "";
  if (raw.length <= 8) return "[REDACTED]";
  // Keep first/last 4 so a tester can recognize which value it is.
  return `${raw.slice(0, 4)}…${raw.slice(-4)} [REDACTED]`;
}

function readArea(area: Storage): { entries: StorageEntry[]; truncated: number } {
  const entries: StorageEntry[] = [];
  let truncated = 0;
  let len = 0;
  try {
    len = area.length;
  } catch {
    // Accessing storage can throw (disabled, sandboxed, SecurityError).
    return { entries, truncated: 0 };
  }
  for (let i = 0; i < len; i++) {
    let key: string | null = null;
    let value = "";
    try {
      key = area.key(i);
      if (key == null) continue;
      value = area.getItem(key) ?? "";
    } catch {
      continue;
    }
    if (entries.length >= MAX_ENTRIES_PER_AREA) {
      truncated++;
      continue;
    }
    const sensitive = SENSITIVE_KEY.test(key) || SENSITIVE_VALUE.test(value);
    let outValue: string;
    let redacted = false;
    if (sensitive) {
      outValue = maskValue(value);
      redacted = true;
    } else if (value.length > MAX_VALUE_LEN) {
      outValue = value.slice(0, MAX_VALUE_LEN) + "…";
    } else {
      outValue = value;
    }
    entries.push(redacted ? { key, value: outValue, redacted: true } : { key, value: outValue });
  }
  return { entries, truncated };
}

/**
 * Snapshot the current page's Web Storage with sensitive values redacted.
 * Safe to call in any context — returns empty arrays if storage is unavailable.
 */
export function captureStorageSnapshot(): StorageSnapshot {
  const snapshot: StorageSnapshot = { local: [], session: [] };
  if (typeof window === "undefined") return snapshot;

  try {
    const ls = readArea(window.localStorage);
    snapshot.local = ls.entries;
    if (ls.truncated > 0) snapshot.localTruncated = ls.truncated;
  } catch {
    /* localStorage unavailable */
  }
  try {
    const ss = readArea(window.sessionStorage);
    snapshot.session = ss.entries;
    if (ss.truncated > 0) snapshot.sessionTruncated = ss.truncated;
  } catch {
    /* sessionStorage unavailable */
  }
  return snapshot;
}
