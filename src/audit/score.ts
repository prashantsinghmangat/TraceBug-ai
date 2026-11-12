// ── Audit score ────────────────────────────────────────────────────────────
// One number per category, and an overall one, from what the checks found.
// Deliberately simple so anyone can recompute it by hand:
//
//   category score = 100 × Π over each distinct problem (rule) of
//                    (1 − share(worst severity) × min(2, 1 + 0.25 × (elements − 1)))
//   shares: critical 20% · serious 12% · moderate 6% · minor 2%   (rounded)
//   overall = the same formula over every problem in the categories that ran
//             (a page with one bad category is not "Good" because the rest are fine)
//
// So one serious problem takes 12% off; the same problem on 5+ elements takes
// at most 24%. Each problem takes its share of what is left, so a page with
// many problems approaches 0 but never sits at an unexplained 0 — checked
// against ten public sites (gov.uk 94–100, Shopify 79, MDN 76, GitHub 50, Hacker News 24). A category that did not run has no score (never 100), and
// the overall leaves it out. It is computed from ALL findings, before the
// 200-finding cap, so truncation never inflates it.
//
// It measures what the automated checks found. It is not a WCAG conformance
// grade and not comparable with other tools' scores.
// Dependency-free: the CLI and the exported viewer read the stored result.

import type { AuditCategory } from "./types";

type Sev = "critical" | "serious" | "moderate" | "minor";

/** Share of the remaining score each distinct problem takes, by its worst severity. */
export const SCORE_WEIGHTS: Record<Sev, number> = { critical: 0.2, serious: 0.12, moderate: 0.06, minor: 0.02 };
export const SCORE_EXPLANATION =
  "Starts at 100. Each distinct problem takes a share of what's left: critical 20%, serious 12%, moderate 6%, minor 2%. The same problem on more elements takes a quarter more per extra element, up to double. Each category is scored on its own problems; the overall score counts every problem from the checks that ran. Checks that didn't run are left out. It reflects what the automated checks found — not WCAG conformance.";

export interface AuditScore {
  /** Every problem from the categories that ran, scored together; null when none ran. */
  overall: number | null;
  /** Score per category that ran. Categories that did not run are absent. */
  categories: Partial<Record<AuditCategory, number>>;
}

export type ScoreBand = "good" | "fair" | "poor";

/** ≥ 90 good · 50–89 fair · < 50 poor (the same bands Lighthouse uses). */
export function scoreBand(score: number): ScoreBand {
  return score >= 90 ? "good" : score >= 50 ? "fair" : "poor";
}

const RANK: Record<Sev, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function scoreCategory(findings: ReadonlyArray<{ ruleId?: string; severity: Sev; occurrences?: number }>): number {
  const byRule = new Map<string, { sev: Sev; elements: number }>();
  for (const f of findings) {
    const key = f.ruleId || "unknown";
    const n = Math.max(1, f.occurrences ?? 1);
    const cur = byRule.get(key);
    if (!cur) byRule.set(key, { sev: f.severity, elements: n });
    else {
      cur.elements += n;
      if (RANK[f.severity] < RANK[cur.sev]) cur.sev = f.severity;
    }
  }
  let score = 100;
  for (const { sev, elements } of byRule.values()) {
    score *= 1 - SCORE_WEIGHTS[sev] * Math.min(2, 1 + 0.25 * (elements - 1));
  }
  return Math.max(0, Math.round(score));
}

export function scoreAudit(
  categories: ReadonlyArray<{ name: AuditCategory; ran: boolean }>,
  findings: ReadonlyArray<{ category?: AuditCategory; ruleId?: string; severity: Sev; occurrences?: number }>,
): AuditScore {
  const out: AuditScore = { overall: null, categories: {} };
  const ran = categories.filter((c) => c.ran);
  for (const c of ran) out.categories[c.name] = scoreCategory(findings.filter((f) => f.category === c.name));
  if (ran.length) {
    const names = new Set(ran.map((c) => c.name));
    out.overall = scoreCategory(findings.filter((f) => f.category && names.has(f.category)));
  }
  return out;
}
