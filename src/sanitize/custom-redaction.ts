// ── User-configured redaction rules ───────────────────────────────────────
// The built-in sanitizers catch token *shapes* (JWT, Bearer, sk-…) and
// secret-looking key names, but they can't know that `customer_email` or
// `patient_id` is sensitive in YOUR app. `redact` in TraceBug.init() lets
// teams declare that, and the rules apply at capture time everywhere the
// built-ins do: form/input values, storage keys, URL query params, and
// field values inside captured text (console output, response snippets).
//
// This module is the single store for those rules. It has no imports beyond
// types so every sanitizer (collectors, storage-capture, cloud-upload) can
// depend on it without cycles.

import type { RedactRules } from "../types";

const REDACTED = "[REDACTED]";

let _fieldRe: RegExp | null = null;
// The raw field names, kept so other masking surfaces (the DOM replay's
// selector — src/rrweb-recorder.ts) can be built from the SAME list instead
// of declaring a second one that drifts.
let _fields: string[] = [];
// Per-text matchers derived from field names: JSON `"key": value` and
// urlencoded/assignment `key=value` forms.
let _fieldTextRes: { re: RegExp; replace: string }[] = [];
let _patterns: RegExp[] = [];
// The patterns as ONE alternation. The replay runs this over every text node
// of a page — on a large app that is thousands of nodes per snapshot, and N
// separate `String.replace` passes meant N full walks of each string. One
// combined regex is one walk. Null when no pattern compiled, or when a
// pattern could not be merged (see setRedactRules).
let _patternsCombined: RegExp | null = null;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Install rules from config (call with undefined to clear). Invalid custom
 *  patterns are skipped silently — a typo in one rule must not disable capture. */
export function setRedactRules(rules: RedactRules | undefined): void {
  _fieldRe = null;
  _fields = [];
  _fieldTextRes = [];
  _patterns = [];
  _patternsCombined = null;
  if (!rules) return;

  const fields = (rules.fields || []).filter(f => typeof f === "string" && f.trim().length > 0);
  if (fields.length > 0) {
    const alts = fields.map(f => escapeRe(f.trim())).join("|");
    // Substring + case-insensitive, matching the built-in /password|secret/i
    // convention — `email` also covers `customer_email` and `emailAddress`.
    _fieldRe = new RegExp(alts, "i");
    _fields = fields.map(f => f.trim());
    for (const f of fields) {
      const k = escapeRe(f.trim());
      // "…email…": "value" | 123 | true — JSON bodies in response snippets
      // and stringified objects in console output.
      _fieldTextRes.push({
        re: new RegExp(`("([^"]*${k}[^"]*)"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|-?\\d[\\d.eE+-]*|true|false)`, "gi"),
        replace: `$1"${REDACTED}"`,
      });
      // …email…=value — urlencoded bodies and key=value console lines.
      _fieldTextRes.push({
        re: new RegExp(`\\b([\\w.-]*${k}[\\w.-]*)=([^&\\s"']+)`, "gi"),
        replace: `$1=${REDACTED}`,
      });
    }
  }

  for (const p of rules.patterns || []) {
    try {
      if (typeof p === "string") {
        _patterns.push(new RegExp(p, "gi"));
      } else if (p instanceof RegExp) {
        _patterns.push(p.flags.includes("g") ? p : new RegExp(p.source, p.flags + "g"));
      }
    } catch {}
  }

  // Combine into a single alternation, each branch grouped so a top-level `|`
  // inside one pattern cannot swallow the next. Built once, here, rather than
  // per text node. If the merge is itself invalid (a pattern with a
  // backreference, say, whose group numbers shift), fall back to the
  // per-pattern loop — correctness over speed.
  if (_patterns.length > 0) {
    try {
      const sources = _patterns.map(r => `(?:${r.source})`).join("|");
      const combined = new RegExp(sources, "gi");
      // Prove it runs before trusting it: a pattern that throws at match time
      // would take a snapshot down with it.
      "probe".replace(combined, "");
      _patternsCombined = combined;
    } catch {
      _patternsCombined = null;
    }
  }
}

/** True when a form field name, storage key, or URL query param matches a
 *  user-declared sensitive field. */
export function isCustomSensitiveKey(key: string | undefined | null): boolean {
  if (!key || !_fieldRe) return false;
  return _fieldRe.test(key);
}

/** Mask user-declared field values and custom patterns inside free text.
 *  Applied wherever the token-shape scrub runs. */
export function applyCustomRedaction(s: string): string {
  if (!s || (_fieldTextRes.length === 0 && _patterns.length === 0)) return s;
  let out = s;
  for (const { re, replace } of _fieldTextRes) out = out.replace(re, replace);
  if (_patternsCombined) out = out.replace(_patternsCombined, REDACTED);
  else for (const re of _patterns) out = out.replace(re, REDACTED);
  return out;
}

/** The user's declared sensitive field names, as given. Exported so the DOM
 *  replay's mask selector is built from this list rather than a copy of it. */
export function getCustomSensitiveFields(): string[] {
  return _fields.slice();
}

/** True when any user rule is configured — fields or patterns. Lets callers
 *  skip work entirely for the common case of no rules at all. */
export function hasCustomRedaction(): boolean {
  return _fieldTextRes.length > 0 || _patterns.length > 0;
}
