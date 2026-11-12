// ── Compare two audit runs ─────────────────────────────────────────────────
// The verification half of "audit → fix → verify": given the run before a fix
// and the run after it, say which findings are fixed, which are still there,
// which are new, and which of the new ones are regressions
// (docs/audit-quality/implementation-plan.md §5, `compare_audits`).
//
// Matching: primary fingerprint first; then, among findings still unmatched on
// both sides, the fallback fingerprint (same rule, same tag and text — the
// selector changed). A finding is never matched twice.
//
// "regressed" = new in a category where something was fixed, i.e. the likely
// side effect of the change. Other new findings are reported as "new".
// Categories that did not run in BOTH runs are excluded and listed, so a
// category that was N/A after the fix can't look like "everything fixed".

import type { AuditCategory, AuditFindingKeys, AuditRunOf } from "./types";
import { urlPath } from "./fingerprint";

export interface AuditComparison<F extends AuditFindingKeys = AuditFindingKeys> {
  comparable: boolean;
  /** Why not comparable (different page), when `comparable` is false. */
  reason?: string;
  fixed: F[];
  stillPresent: Array<{ before: F; after: F; matchedBy: "fingerprint" | "fallback" }>;
  new: F[];
  regressed: F[];
  /** Categories left out because one of the runs could not run them. */
  skippedCategories: AuditCategory[];
  /** Set when either run hit the findings cap: the comparison may be incomplete. */
  incomplete: boolean;
}

function ranCategories(run: AuditRunOf<unknown>): Set<AuditCategory> {
  return new Set(run.categories.filter((c) => c.ran).map((c) => c.name));
}

export function compareAudits<F extends AuditFindingKeys>(before: AuditRunOf<F>, after: AuditRunOf<F>): AuditComparison<F> {
  const empty: AuditComparison<F> = {
    comparable: false, fixed: [], stillPresent: [], new: [], regressed: [], skippedCategories: [], incomplete: false,
  };
  const pathA = urlPath(before.url);
  const pathB = urlPath(after.url);
  if (pathA !== pathB) {
    return { ...empty, reason: `Different pages: ${pathA || "(none)"} vs ${pathB || "(none)"}. Compare two runs of the same page.` };
  }

  const ranA = ranCategories(before);
  const ranB = ranCategories(after);
  const both = new Set([...ranA].filter((c) => ranB.has(c)));
  const skipped = [...new Set([...ranA, ...ranB])].filter((c) => !both.has(c)).sort() as AuditCategory[];
  const inScope = (f: F) => !!f.category && both.has(f.category);

  const left = before.findings.filter(inScope);
  const right = after.findings.filter(inScope);
  const usedL = new Set<number>();
  const usedR = new Set<number>();
  const stillPresent: AuditComparison<F>["stillPresent"] = [];

  const pass = (key: "fingerprint" | "fallbackFingerprint", matchedBy: "fingerprint" | "fallback") => {
    const index = new Map<string, number[]>();
    right.forEach((f, i) => {
      const k = f[key];
      if (!k || usedR.has(i)) return;
      const list = index.get(k);
      if (list) list.push(i); else index.set(k, [i]);
    });
    left.forEach((f, i) => {
      const k = f[key];
      if (!k || usedL.has(i)) return;
      const candidates = index.get(k);
      const j = candidates?.find((c) => !usedR.has(c));
      if (j === undefined) return;
      usedL.add(i);
      usedR.add(j);
      stillPresent.push({ before: f, after: right[j], matchedBy });
    });
  };
  pass("fingerprint", "fingerprint");
  pass("fallbackFingerprint", "fallback");

  const fixed = left.filter((_, i) => !usedL.has(i));
  const added = right.filter((_, i) => !usedR.has(i));
  const fixedCategories = new Set(fixed.map((f) => f.category));
  const regressed = added.filter((f) => fixedCategories.has(f.category));
  const fresh = added.filter((f) => !fixedCategories.has(f.category));

  return {
    comparable: true,
    fixed,
    stillPresent,
    new: fresh,
    regressed,
    skippedCategories: skipped,
    incomplete: before.truncated > 0 || after.truncated > 0,
  };
}
