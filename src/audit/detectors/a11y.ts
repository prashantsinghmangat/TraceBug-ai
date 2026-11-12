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
import { wcagFromAxeTags } from "../wcag";
import { parseExpectedRatio, suggestTextColor } from "../contrast";

type AxeLike = { run: (context: unknown, options: unknown) => Promise<AxeResultsLike> };
type AxeNode = { target?: unknown[]; html?: string; failureSummary?: string; any?: Array<{ id?: string; data?: Record<string, unknown> }> };
type AxeResultsLike = { violations?: Array<{ id: string; impact?: string | null; help?: string; description?: string; helpUrl?: string; tags?: string[]; nodes?: AxeNode[] }> };

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** WCAG rules axe ships as "experimental" (off by default) that we turn on.
 *  label-content-name-mismatch = WCAG 2.5.3 Label in Name: voice-control users
 *  say the visible label, so the accessible name must contain it. */
export const AXE_EXTRA_RULES = ["label-content-name-mismatch"];

/** axe's "Fix any of the following: …" summary as one plain sentence list. */
export function cleanFailureSummary(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const lines = s.split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^Fix (any|all) of the following:?$/i.test(l));
  return lines.length ? lines.join(" ") : undefined;
}

/** Contrast: the measured colours plus the nearest passing text colour. */
function contrastFix(metrics: Record<string, number | string> | undefined): { fix?: string; suggested?: string } {
  if (!metrics) return {};
  const fg = String(metrics.fgColor ?? ""), bg = String(metrics.bgColor ?? "");
  const expected = parseExpectedRatio(metrics.expectedContrastRatio);
  if (!fg || !bg || !expected) return {};
  const s = suggestTextColor(fg, bg, expected);
  if (!s) {
    return { fix: `Text ${fg} on ${bg} needs a contrast ratio of ${expected}:1. No text colour reaches it on this background — change the background colour instead.` };
  }
  return {
    suggested: s.color,
    fix: `Change the text colour from ${fg} to ${s.color} (${s.ratio.toFixed(2)}:1 on ${bg}) or further from the background; this text needs ${expected}:1. Or change the background.`,
  };
}

/** Text-bearing elements that are rendered but fully transparent right now —
 *  typically content that fades in on scroll. axe skips them, so the panel says
 *  how many were not checked instead of implying the page was clean. */
export function countTransparentText(doc: Document = document, limit = 6000): number {
  let count = 0;
  const els = doc.body ? doc.body.getElementsByTagName("*") : [];
  for (let i = 0; i < els.length && i < limit; i++) {
    const el = els[i] as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean };
    if (el.closest("#tracebug-root")) continue;
    let hasText = false;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.textContent || "").trim()) { hasText = true; break; }
    }
    if (!hasText) continue;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility()) continue; // display:none etc. — not on the page at all
      if (!el.checkVisibility({ opacityProperty: true })) count++;
      continue;
    }
    let o = 1, shown = true;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none") { shown = false; break; }
      o *= parseFloat(cs.opacity || "1");
    }
    if (shown && o === 0) count++;
  }
  return count;
}
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

export interface A11yAuditResult { ran: boolean; limitation: string; findings: Issue[]; transparentText?: number }

export async function detectA11yFindings(): Promise<A11yAuditResult> {
  const axe = await loadAxe();
  if (!axe) return { ran: false, limitation: A11Y_UNAVAILABLE, findings: [] };

  let results: AxeResultsLike;
  try {
    results = await axe.run(
      { exclude: [["#tracebug-root"]] },
      {
        runOnly: { type: "tag", values: AXE_TAGS },
        rules: Object.fromEntries(AXE_EXTRA_RULES.map((id) => [id, { enabled: true }])),
        resultTypes: ["violations"],
      },
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
      let fix = cleanFailureSummary(node.failureSummary);
      if (v.id === "color-contrast" || v.id === "color-contrast-enhanced") {
        const c = contrastFix(metrics);
        if (c.fix) fix = c.fix;
        if (c.suggested && metrics) metrics.suggestedFgColor = c.suggested;
      } else if (v.id === "label-content-name-mismatch" && el) {
        const visible = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
        const name = el.getAttribute("aria-label");
        if (visible) {
          fix = `The visible text "${visible}" must be part of the accessible name${name ? ` (now "${name.slice(0, 80)}")` : ""}. Start the aria-label with the visible text, or remove aria-label so the visible text becomes the name.`;
        }
      }
      const evidence = el ? elementEvidence(el, metrics ? { metrics } : undefined) : { html: node.html || "", ...(metrics ? { metrics } : {}) };
      if (node.html && evidence.html !== node.html) evidence.html = node.html; // axe's snippet is the canonical one
      const wcag = wcagFromAxeTags(v.tags);
      findings.push({
        ...(wcag.length ? { wcag } : {}),
        ...(fix ? { fix } : {}),
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
  let transparentText = 0;
  try { transparentText = countTransparentText(); } catch { /* best effort */ }
  return { ran: true, limitation: A11Y_LIMITATION, findings, transparentText };
}
