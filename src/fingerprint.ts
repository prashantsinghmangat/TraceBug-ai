// ── Bug Fingerprint ───────────────────────────────────────────────────────
// Group identical errors locally so 14× the same TypeError collapses into
// one issue with `[×14]` instead of 14 near-duplicate rows.
//
// Fingerprint inputs (in priority order):
//   1. Error type/class extracted from the message ("TypeError", etc.)
//   2. Top three "at ..." stack frames (location-only — line numbers
//      stable across invocations within the same build)
//   3. Page path
//
// We use SHA-1 via `crypto.subtle.digest` when available — falls back to
// a tiny non-cryptographic hash on older contexts. Fingerprint is not
// security-sensitive; collision rate of djb2 is good enough for this.

/** Compute a stable fingerprint string for an error + page combo. */
export async function computeFingerprint(
  errorMessage: string,
  errorStack: string | undefined,
  page: string
): Promise<string> {
  const errorType = extractErrorType(errorMessage);
  const topFrames = extractTopFrames(errorStack || "", 3);
  const input = `${errorType}|${topFrames.join("\n")}|${page}`;

  // Prefer SHA-1 from the Subtle Crypto API for stronger uniqueness.
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    try {
      const buf = new TextEncoder().encode(input);
      const hash = await crypto.subtle.digest("SHA-1", buf);
      return bufferToHex(hash).slice(0, 16);
    } catch {}
  }
  return djb2(input).toString(16).padStart(8, "0");
}

/**
 * Synchronous fallback fingerprint — used in code paths that can't `await`.
 * Collision rate higher than SHA-1 but acceptable for in-session grouping.
 */
export function computeFingerprintSync(
  errorMessage: string,
  errorStack: string | undefined,
  page: string
): string {
  const errorType = extractErrorType(errorMessage);
  const topFrames = extractTopFrames(errorStack || "", 3);
  const input = `${errorType}|${topFrames.join("\n")}|${page}`;
  return djb2(input).toString(16).padStart(8, "0");
}

/** Pick out the JS error class — TypeError, ReferenceError, etc. */
function extractErrorType(message: string): string {
  const m = message.match(/^([A-Z][a-zA-Z]+Error|Error)\b/);
  return m ? m[1] : "Error";
}

/**
 * Extract the location parts ("foo.js:42:13") of the top N stack frames,
 * dropping function names. Same call site → same fingerprint, even if the
 * function gets renamed between minified/dev builds.
 */
function extractTopFrames(stack: string, n: number): string[] {
  const frames: string[] = [];
  const lines = stack.split("\n");
  for (const line of lines) {
    const m = line.match(/(https?:\/\/[^):\s]+|[^():\s]+\.[a-z]+):(\d+):(\d+)/i);
    if (m) {
      const url = m[1];
      const path = url.includes("://") ? new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname : url;
      frames.push(`${path}:${m[2]}:${m[3]}`);
      if (frames.length >= n) break;
    }
  }
  return frames;
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** djb2 — tiny non-cryptographic hash. Stable, deterministic, no deps. */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  return hash >>> 0; // unsigned 32-bit
}
