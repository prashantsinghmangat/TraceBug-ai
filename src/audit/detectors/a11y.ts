// ── Accessibility checks (axe-core) for the Site Audit ─────────────────────
// docs/audit-quality/implementation-plan.md §4: axe-core with WCAG 2.0/2.1/2.2
// A+AA rules. Unlike the old scanner detector (src/scanner/detectors/a11y.ts),
// which rolls a rule into one row, the audit keeps ONE FINDING PER ELEMENT:
// each element is fixed and verified separately, and the fingerprint needs its
// selector. Capped per rule so a page with 300 unlabeled icons stays readable.
//
// Where axe comes from:
//   - npm / script-tag builds: bundled, `import("axe-core")`.
//   - extension build: stubbed out of the injected bundle (tsup.config.ts), so
//     the extension injects its packaged axe file first (step 2b) and it shows
//     up as `window.axe`. With neither, the category reports "did not run".

import type { Issue } from "../../types";
import { coerceSeverity, makeIssueId } from "../../scanner/helpers";
import { elementEvidence } from "./evidence";

type AxeLike = { run: (context: unknown, options: unknown) => Promise<AxeResultsLike> };
type AxeNode = { target?: unknown[]; html?: string; any?: Array<{ id?: string; data?: Record<string, unknown> }> };
type AxeResultsLike = { violations?: Array<{ id: string; impact?: string | null; help?: string; description?: string; helpUrl?: string; nodes?: AxeNode[] }> };

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const MAX_NODES_PER_RULE = 20;

export const A11Y_LIMITATION =
  "Automated checks cover only part of WCAG. This is not a conformance evaluation: keyboard use, screen-reader meaning and many success criteria need a person.";
export const A11Y_UNAVAILABLE = "The accessibility checker isn't available on this page, so accessibility was not checked.";

async function loadAxe(): Promise<AxeLike | null> {
  const w = globalThis as unknown as { axe?: AxeLike };
  if (w.axe && typeof w.axe.run === "function") return w.axe;
  try {
    const mod = (await import("axe-core")) as unknown as AxeLike & { default?: AxeLike };
    const axe = mod.default && typeof mod.default.run === "function" ? mod.default : mod;
    if (typeof axe.run === "function") return axe;
  } catch { /* stubbed or missing */ }
  return w.axe && typeof w.axe.run === "function" ? w.axe : null;
}

/** Numbers axe measured, where they help the fix (contrast ratio, colours, font size). */
function metricsFor(node: AxeNode): Record<string, number | string> | undefined {
  const data = node.any?.find((c) => c.data && typeof c.data === "object")?.data;
  if (!data) return undefined;
  const out: Record<string, number | string> = {};
  for (const key of ["contrastRatio", "expectedContrastRatio", "fgColor", "bgColor", "fontSize", "fontWeight"]) {
    const v = data[key];
    if (typeof v === "number" || typeof v === "string") out[key] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export interface A11yAuditResult { ran: boolean; limitation: string; findings: Issue[] }

export async function detectA11yFindings(): Promise<A11yAuditResult> {
  const axe = await loadAxe();
  if (!axe) return { ran: false, limitation: A11Y_UNAVAILABLE, findings: [] };

  let results: AxeResultsLike;
  try {
    results = await axe.run(
      { exclude: [["#tracebug-root"]] },
      { runOnly: { type: "tag", values: AXE_TAGS }, resultTypes: ["violations"] },
    );
  } catch (err) {
    console.warn("[TraceBug] axe.run failed:", err);
    return { ran: false, limitation: A11Y_UNAVAILABLE, findings: [] };
  }

  const findings: Issue[] = [];
  for (const v of results.violations || []) {
    const nodes = (v.nodes || []).slice(0, MAX_NODES_PER_RULE);
    for (const node of nodes) {
      const target = Array.isArray(node.target) ? node.target.map(String).join(" ") : "";
      let el: Element | null = null;
      try { el = target ? document.querySelector(target) : null; } catch { el = null; }
      const metrics = metricsFor(node);
      const evidence = el ? elementEvidence(el, metrics ? { metrics } : undefined) : { html: node.html || "", ...(metrics ? { metrics } : {}) };
      if (node.html && evidence.html !== node.html) evidence.html = node.html; // axe's snippet is the canonical one
      findings.push({
        id: makeIssueId("axe-a11y"),
        detector: "axe-a11y",
        category: "accessibility",
        ruleId: v.id,
        severity: coerceSeverity(v.impact),
        title: v.help || v.id,
        description: v.description || v.id,
        selector: target || undefined,
        helpUrl: v.helpUrl,
        page: location.href,
        detectedAt: Date.now(),
        evidence,
      });
    }
  }
  return { ran: true, limitation: A11Y_LIMITATION, findings };
}
