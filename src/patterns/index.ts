// ── Pattern Library v2 ────────────────────────────────────────────────────
// Categorized error → cause/fix pattern dictionary. Ordered specific-first
// inside each category. Tries every category in priority order; first match
// wins. Falls back to "unexpected runtime value" if nothing matches.
//
// Categories (ordered):
//   react   — framework-specific React errors (hooks, hydration, key warnings)
//   vue     — Vue 2/3 specific
//   angular — Angular Zone.js + NG codes
//   network — CORS, mixed content, timeout, DNS, expired tokens
//   auth    — 401/403, JWT expiration
//   storage — QuotaExceeded, JSON parse failures
//   general — non-framework runtime errors (TypeError, ReferenceError, etc.)
//
// Each pattern returns: { hint, fix?, category }. Hints are one short
// sentence, fixes are concrete actions a dev can try (one short sentence).

import { reactPatterns } from "./react";
import { vuePatterns } from "./vue";
import { angularPatterns } from "./angular";
import { networkPatterns } from "./network";
import { authPatterns } from "./auth";
import { storagePatterns } from "./storage";
import { generalPatterns } from "./general";

export interface ErrorPattern {
  /** Stable id (e.g. "react-hydration-mismatch"). */
  id: string;
  /** Regex tested against the lowercased error message. */
  pattern: RegExp;
  /** One-sentence cause hint (rendered in root-cause line). */
  hint: string;
  /** Optional one-sentence concrete fix suggestion. */
  fix?: string;
  /** Tag for the rendered hint, e.g. "React data-loading pattern". */
  category: string;
}

export interface PatternMatch {
  hint: string;
  fix?: string;
  category: string;
}

const CATEGORIES: ErrorPattern[][] = [
  reactPatterns,
  vuePatterns,
  angularPatterns,
  networkPatterns,
  authPatterns,
  storagePatterns,
  generalPatterns,
];

/**
 * Walk the pattern library and return the first match. Returns null if
 * nothing matches — caller falls back to the generic hint.
 */
export function matchErrorPattern(message: string): PatternMatch | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  for (const category of CATEGORIES) {
    for (const p of category) {
      if (p.pattern.test(lower)) {
        return { hint: p.hint, fix: p.fix, category: p.category };
      }
    }
  }
  return null;
}

/**
 * Build the rendered cause string from a match — joins hint + fix with a
 * separator, appends the category as parens. Used by report-builder.
 */
export function formatPatternMatch(match: PatternMatch): string {
  const parts: string[] = [match.hint];
  if (match.fix) parts.push(`Try: ${match.fix}`);
  parts.push(`*(${match.category})*`);
  return parts.join(" — ");
}
