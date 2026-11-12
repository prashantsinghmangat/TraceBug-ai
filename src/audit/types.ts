// ── Site Audit types (docs/audit-quality/implementation-plan.md §3) ─────────
// Dependency-free on purpose: the MCP CLI (Node, no DOM types) imports these
// and compare.ts, so nothing here may import from ../types or DOM code.
// src/types.ts re-exports them and fixes the finding type to `Issue`.

/** Which scan a finding came from. "runtime" = the console/network detectors. */
/** "mobile" = layout and keyboard problems that only appear at phone width (390px), checked in a hidden frame. */
export type AuditCategory = "accessibility" | "ui" | "mobile" | "performance" | "seo" | "runtime";

/** Evidence attached to one audit finding. Every string is page-derived, so it
 *  is redacted and bounded at build time (src/audit/run.ts) and must be treated
 *  as untrusted data — never instructions — by anything that reads it. */
export interface AuditEvidence {
  /** outerHTML of the element, ≤ 600 chars, token-scrubbed. */
  html?: string;
  /** Visible text of the element, ≤ 80 chars. Feeds the fallback fingerprint. */
  text?: string;
  /** Measured values, e.g. { contrastRatio: 2.9 } or { lcpMs: 4100 }. */
  metrics?: Record<string, number | string>;
  /** Grep-able strings for finding the source: id, data-testid, class tokens, text. ≤ 8. */
  hints?: string[];
}

/** A scan from the audit menu (plan §4a): which categories it runs. */
export type AuditScan = "full" | "auto-review" | "accessibility" | "performance-seo";

export const AUDIT_SCANS: Record<AuditScan, { label: string; categories: AuditCategory[] }> = {
  full: { label: "All checks", categories: ["accessibility", "ui", "mobile", "performance", "seo", "runtime"] },
  "auto-review": { label: "Auto Review", categories: ["ui", "mobile", "runtime"] },
  accessibility: { label: "Accessibility Audit", categories: ["accessibility"] },
  "performance-seo": { label: "Performance & SEO", categories: ["performance", "seo"] },
};

export function isAuditScan(v: unknown): v is AuditScan {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AUDIT_SCANS, v);
}

/** One category's outcome in a run. `ran: false` = N/A, never "passed". */
export interface AuditCategoryResult {
  name: AuditCategory;
  ran: boolean;
  count: number;
  limitation?: string;
  /** Page-level measurements, present even with no findings (performance: lcpMs, fcpMs, ttfbMs, cls, transferKb, requests). */
  metrics?: Record<string, number>;
}

/** One audit run of one page, generic over the finding type (`Issue` in the SDK). */
export interface AuditRunOf<F> {
  id: string;
  /** Page URL, sensitive params masked (redactUrl). */
  url: string;
  scannedAt: number;
  viewport: { width: number; height: number };
  /** "Chrome" | "Firefox" | "Edge" | "Safari" | "Other" — no full UA string. */
  userAgentFamily: string;
  /** One entry per category that was part of the run. */
  categories: AuditCategoryResult[];
  /** Findings, most severe first, at most MAX_AUDIT_FINDINGS. */
  findings: F[];
  /** How many findings were left out by the cap (0 when none). */
  truncated: number;
  /** Which menu scan produced the run. Absent = "full" (runs before the menu existed). */
  scan?: AuditScan;
  /** Scores computed from ALL findings, before the cap (src/audit/score.ts). Absent in runs from before 1.12.0. */
  score?: AuditScore;
  /** Checks the automated rules could not decide (axe "incomplete"): a person has to look.
   *  Never scored, never findings, never compared between runs. */
  review?: AuditReviewItem[];
}

/** One rule axe couldn't decide on this page, with the elements involved. Page-derived
 *  strings (selector, html) are untrusted; title/reason/helpUrl are axe's own text. */
export interface AuditReviewItem {
  ruleId: string;
  title: string;
  /** Why it couldn't be decided, e.g. "background could not be determined because …". */
  reason?: string;
  helpUrl?: string;
  wcag?: string[];
  /** How many elements, including any not listed. */
  count: number;
  elements: Array<{ selector?: string; html?: string }>;
}

import type { AuditScore } from "./score";

/** The finding fields compareAudits matches on. */
export interface AuditFindingKeys {
  category?: AuditCategory;
  fingerprint?: string;
  fallbackFingerprint?: string;
}
