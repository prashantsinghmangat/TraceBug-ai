// ── Audit score ────────────────────────────────────────────────────────────
// One number per category, and an overall one, from what the checks found.
// Deliberately simple so anyone can recompute it by hand:
//
//   category score = 100 − Σ over each distinct problem (rule) of
//                    weight(worst severity) × min(2, 1 + 0.25 × (elements − 1))
//   weights: critical 20 · serious 10 · moderate 5 · minor 2   (floor 0, rounded)
//   overall = the same formula over every problem in the categories that ran
//             (a page with one bad category is not "Good" because the rest are fine)
//
// So one serious problem costs 10 points; the same problem on 5+ elements
// costs at most 20. A category that did not run has no score (never 100), and
// the overall leaves it out. It is computed from ALL findings, before the
// 200-finding cap, so truncation never inflates it.
//
// It measures what the automated checks found. It is not a WCAG conformance
// grade and not comparable with other tools' scores.
// Dependency-free: the CLI and the exported viewer read the stored result.

import type { AuditCategory } from "./types";

type Sev = "critical" | "serious" | "moderate" | "minor";

export const SCORE_WEIGHTS: Record<Sev, number> = { critical: 20, serious: 10, moderate: 5, minor: 2 };
export const SCORE_EXPLANATION =
  "100 minus points per distinct problem: critical 20, serious 10, moderate 5, minor 2. The same problem on more elements adds a quarter of its weight per extra element, up to double. Each category is scored on its own problems; the overall score counts every problem from the checks that ran. Checks that didn't run are left out. It reflects what the automated checks found — not WCAG conformance.";

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
  let penalty = 0;
  for (const { sev, elements } of byRule.values()) {
    penalty += SCORE_WEIGHTS[sev] * Math.min(2, 1 + 0.25 * (elements - 1));
  }
  return Math.max(0, Math.round(100 - penalty));
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
