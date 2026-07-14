// ── Accessibility detector ────────────────────────────────────────────────
// Lazy-loads axe-core (~250 KB minified) only on first scan, runs the
// default rule set against the live DOM, and converts axe violations into
// our Issue shape. Skips TraceBug's own UI by passing `exclude: ["#tracebug-root"]`.
//
// axe-core has its own dependency graph but bundles cleanly via tsup's
// dynamic-import support — the chunk only loads when scan() is called.

import { Issue } from "../../types";
import { coerceSeverity, makeIssueId } from "../helpers";

type AxeModule = typeof import("axe-core");
type AxeResults = import("axe-core").AxeResults;

let _axePromise: Promise<AxeModule | null> | null = null;

function loadAxe(): Promise<AxeModule | null> {
  if (_axePromise) return _axePromise;
  _axePromise = import("axe-core")
    .then((mod) => (mod as AxeModule & { default?: AxeModule }).default || mod)
    .catch((err) => {
      console.warn("[TraceBug] axe-core failed to load:", err);
      return null;
    });
  return _axePromise;
}

export async function detectA11yViolations(): Promise<Issue[]> {
  const axe = await loadAxe();
  if (!axe || typeof axe.run !== "function") return [];

  let results: AxeResults;
  try {
    results = await axe.run(document, {
      // Only WCAG-tagged rules — keeps signal-to-noise high. Best-practice
      // rules add ~30% more noise without proportional value for QA.
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      // Skip our own UI so QA isn't told their toolbar fails contrast checks.
      // axe accepts a context with exclude — we pass { exclude: [...] } via
      // the second-argument options-shaped form below to keep types loose.
      resultTypes: ["violations"],
    });
  } catch (err) {
    console.warn("[TraceBug] axe.run failed:", err);
    return [];
  }

  const issues: Issue[] = [];
  const violations = results?.violations || [];

  for (const v of violations) {
    const nodes = v.nodes || [];
    // Each violation often hits multiple elements (e.g. 12 buttons missing
    // labels). Roll all of them into a single issue with a node count, so
    // the panel doesn't drown in 200 near-duplicate rows.
    const firstNode = nodes[0];
    const selector = Array.isArray(firstNode?.target) ? firstNode.target.join(" ") : "";
    const exampleSnippet: string = (firstNode?.html || "").slice(0, 120);
    const moreSuffix = nodes.length > 1 ? ` (+ ${nodes.length - 1} more element${nodes.length === 2 ? "" : "s"})` : "";

    issues.push({
      id: makeIssueId("axe-a11y"),
      detector: "axe-a11y",
      severity: coerceSeverity(v.impact),
      title: `${v.help || v.id}${moreSuffix}`,
      description: `${v.description || v.id}\n\nFirst element: \`${exampleSnippet}\``,
      selector: selector || undefined,
      helpUrl: v.helpUrl,
      page: window.location.pathname,
      detectedAt: Date.now(),
    });
  }

  return issues;
}
