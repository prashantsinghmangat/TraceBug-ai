// ── Personal data inside stored values ────────────────────────────────────
// storage-capture.ts masks a value outright when its KEY looks sensitive
// ("authToken", "password"). That missed personal data sitting inside an
// innocent-looking key: analytics SDKs keep the signed-in user in
// localStorage as JSON — e.g. `pendoConfig = {"visitor":{"email":…,
// "first_name":…,"last_name":…}}` — and it went into tickets, exports and
// MCP output verbatim. This scrubs inside the value:
//   - JSON: fields named like personal data or secrets are masked, recursively;
//   - any text: email addresses are masked wherever they appear.
// Token shapes (JWT, sk-…, ghp_…) are handled by sanitizeTokenShapes, which
// the caller runs as well.

const REDACTED = "[REDACTED]";

/** Field names that hold personal data. Matched against JSON keys only. */
export const PII_FIELD =
  /^(?:.*[_-])?(?:e-?mail(?:_?address)?|phone(?:_?number)?|mobile|tel|telephone|first_?name|last_?name|full_?name|given_?name|family_?name|middle_?name|surname|display_?name|user_?name|birth_?date|date_?of_?birth|dob|ssn|national_?id|passport|address(?:_?line\d?)?|street|post_?code|postal_?code|zip(?:_?code)?)$/i;

// Local part, @, domain with at least one dot and a 2+ letter TLD.
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24}\b/g;

/** "prashant.singh@net-effect.com" → "p***@n***.com" — recognisable, not readable. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return `${user.charAt(0)}***@${domain.charAt(0)}***${dot > 0 ? domain.slice(dot) : ""}`;
}

/** Mask every email address in free text. */
export function maskEmails(s: string): string {
  return s.replace(EMAIL_RE, maskEmail);
}

function _scrubJson(v: unknown, isSecretKey: (k: string) => boolean, depth: number): unknown {
  if (depth > 12) return v;
  if (typeof v === "string") return maskEmails(v);
  if (Array.isArray(v)) return v.map((x) => _scrubJson(x, isSecretKey, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      // Strings and numbers only: a flag like {"accessible": true} stays readable.
      const leaf = (typeof val === "string" && val !== "") || typeof val === "number";
      out[k] = leaf && (PII_FIELD.test(k) || isSecretKey(k))
        ? REDACTED
        : _scrubJson(val, isSecretKey, depth + 1);
    }
    return out;
  }
  return v;
}

/**
 * Scrub personal data inside one stored value. `isSecretKey` is the caller's
 * own sensitive-name rule, applied to nested JSON keys as well. Returns the
 * value unchanged (same string) when there was nothing to mask.
 */
export function scrubStoredValue(raw: string, isSecretKey: (k: string) => boolean): string {
  if (!raw) return raw;
  const t = raw.trimStart();
  // Only parse what looks like a JSON object/array, and not huge blobs.
  if ((t[0] === "{" || t[0] === "[") && raw.length <= 200_000) {
    try {
      const parsed = JSON.parse(raw);
      const scrubbed = JSON.stringify(_scrubJson(parsed, isSecretKey, 0));
      // Re-serialising changes whitespace; only replace when content changed.
      return scrubbed === JSON.stringify(parsed) ? raw : scrubbed;
    } catch {
      /* not JSON — fall through to text */
    }
  }
  return maskEmails(raw);
}
