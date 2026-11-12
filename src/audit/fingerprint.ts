// ── Audit fingerprints ─────────────────────────────────────────────────────
// Two keys per finding, so a re-run can tell "the same problem" from "a new
// one" (docs/audit-quality/implementation-plan.md §3):
//
//   fingerprint          category + ruleId + URL path + normalized selector
//   fallbackFingerprint  category + ruleId + tag + visible text
//
// The primary key survives query strings, hash routes and generated class
// names. The fallback catches a selector that changed shape between runs
// (a wrapper div added, an id removed) while the element itself is the same.
//
// Synchronous and dependency-free on purpose: the extension computes these
// and the CLI may recompute them, so the hash must come out identical in a
// page, a service worker and Node. (src/fingerprint.ts picks SHA-1 or djb2 by
// environment, which is fine for grouping errors but not for this.)

import type { AuditCategory } from "./types";

/** FNV-1a over UTF-16 code units, two 32-bit lanes → 16 hex chars. */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Path of a URL with no query or hash, trailing slash trimmed ("/" stays "/"). */
export function urlPath(url: string | undefined): string {
  if (!url) return "";
  let path: string;
  try {
    path = new URL(url, "http://x").pathname;
  } catch {
    path = url.split(/[?#]/)[0];
  }
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

// A class or id is "generated" when it carries a build hash: CSS-in-JS
// (css-1a2b3c, sc-bdfBwQ, jsx-1234567, svelte-xyz123, emotion-0), CSS Modules
// (Button_primary__a1B2c), React useId (:r1:, radix-:r2:), or a long run that
// mixes letters and digits. Such tokens change between builds, so they are
// dropped from the selector before hashing.
const GENERATED_TOKEN: RegExp[] = [
  /^(css|sc|jsx|svelte|emotion|tw|chakra|mui|makestyles)-[a-z0-9_-]{3,}$/i,
  /__[a-z0-9_-]{4,}$/i,
  /^_[a-z0-9]{5,}$/i,
  /:r[0-9a-z]+:/i,
  /^radix-/i,
  /^(ember|react-select|headlessui-[a-z-]+)-?\d+/i,
];
function isGenerated(token: string): boolean {
  if (GENERATED_TOKEN.some((re) => re.test(token))) return true;
  // 6+ chars, letters and at least two digits, no separator: "a1b2c3", "x9k2lq".
  // Hand-written names with numbers use separators ("col-md-6", "step_2").
  return /^(?=(?:.*\d){2})(?=.*[a-z])[a-z0-9]{6,}$/i.test(token);
}

/**
 * Normalize a CSS selector so the same element gives the same string across
 * builds and attribute order: drop generated ids/classes, sort attribute
 * selectors within each compound, lowercase tags, collapse combinator spacing.
 * Structural parts (tag, nth-of-type, stable ids/classes, attributes) are kept.
 */
export function normalizeSelector(selector: string | undefined): string {
  if (!selector) return "";
  const compounds = selector.trim().split(/\s*([>+~])\s*|\s+/).filter((p) => p !== undefined && p !== "");
  return compounds
    .map((part) => {
      if (part === ">" || part === "+" || part === "~") return part;
      const attrs = (part.match(/\[[^\]]*\]/g) || []).map((a) => a.replace(/\s+/g, "")).sort();
      const rest = part.replace(/\[[^\]]*\]/g, "");
      // Split into tag, #id, .class and :pseudo tokens, keeping escaped characters.
      const tokens = rest.match(/(^[a-zA-Z*][\w-]*)|([#.](?:\\.|[^#.:\\])+)|(:[^#.:]+(?:\([^)]*\))?)/g) || [];
      const kept = tokens.filter((t) => {
        if (t[0] === "#" || t[0] === ".") return !isGenerated(t.slice(1).replace(/\\/g, ""));
        return true;
      });
      const tag = kept.filter((t) => /^[a-zA-Z*]/.test(t)).map((t) => t.toLowerCase());
      const ids = kept.filter((t) => t[0] === "#");
      const classes = kept.filter((t) => t[0] === ".").sort();
      const pseudos = kept.filter((t) => t[0] === ":");
      const out = [...tag, ...ids, ...classes, ...attrs, ...pseudos].join("");
      return out || "*";
    })
    .join(" ")
    .replace(/ ([>+~]) /g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** First tag name in an outerHTML snippet ("button"), or "". */
export function tagFromHtml(html: string | undefined): string {
  const m = (html || "").match(/^\s*<([a-zA-Z][\w-]*)/);
  return m ? m[1].toLowerCase() : "";
}

function normalizeText(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
}

export interface FingerprintInput {
  category: AuditCategory;
  ruleId: string;
  /** Page URL or path the finding is on. */
  page: string;
  selector?: string;
  /** Resource URL, for findings about a request/asset rather than an element. */
  url?: string;
  /** outerHTML snippet (only its first tag is used). */
  html?: string;
  /** Visible text of the element. */
  text?: string;
}

/** Primary key: category + ruleId + page path + (normalized selector, or the resource path). */
export function auditFingerprint(f: FingerprintInput): string {
  const anchor = f.selector ? normalizeSelector(f.selector) : f.url ? "url:" + urlPath(f.url) : "page";
  return stableHash(["v1", f.category, f.ruleId, urlPath(f.page), anchor].join("|"));
}

/** Fallback key: category + ruleId + page path + tag + visible text. Undefined when there
 *  is neither a tag nor text to go on — then only the primary key can match. */
export function auditFallbackFingerprint(f: FingerprintInput): string | undefined {
  const tag = tagFromHtml(f.html);
  const text = normalizeText(f.text);
  if (!tag && !text) return undefined;
  return stableHash(["v1-fb", f.category, f.ruleId, urlPath(f.page), tag, text].join("|"));
}
