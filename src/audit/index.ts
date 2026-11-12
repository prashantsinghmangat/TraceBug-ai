// ── Site Audit orchestrator ────────────────────────────────────────────────
// runAudit() checks the page the user is on and returns an AuditRun
// (docs/audit-quality/implementation-plan.md §2–§4). Read-only: nothing is
// clicked, filled or submitted. Each category reports whether it ran; one that
// fails says so instead of counting as "0 issues".
//
// Categories: accessibility (axe), ui (layout), performance (this page load's
// timings and files), seo (page tags), runtime (console errors, failed
// requests and mixed content seen in the current capture).

import type { AuditCategory, AuditRun, Issue } from "../types";
import { getAllSessions } from "../storage";
import { detectConsoleErrors, detectFailedRequests } from "../scanner/detectors/session-data";
import { detectMixedContent } from "../scanner/detectors/mixed-content";
import { buildAuditRun } from "./run";
import { detectA11yFindings } from "./detectors/a11y";
import { detectUiFindings } from "./detectors/ui";
import { detectSeoFindings } from "./detectors/seo";
import { detectPerfFindings } from "./detectors/performance";
import { detectKeyboardFindings } from "./detectors/keyboard";
import { detectFrustration } from "../scanner/detectors/frustration";
import { AUDIT_SCANS, type AuditScan } from "./types";

export const ALL_AUDIT_CATEGORIES: AuditCategory[] = ["accessibility", "ui", "performance", "seo", "runtime"];

export const CATEGORY_LIMITATIONS: Partial<Record<AuditCategory, string>> = {
  ui: "Checked at the current window size only. No design judgement.",
  seo: "This page only: no crawl, no ranking claims.",
  runtime: "Only what happened since TraceBug started capturing on this page: errors, failed requests, mixed content, and rage or dead clicks.",
};

export interface RunAuditOptions {
  /** A scan from the audit menu (plan §4a). Default "full". */
  scan?: AuditScan;
  /** Which categories to run; overrides `scan`. Default: the scan's categories. */
  categories?: AuditCategory[];
}

let _lastRun: AuditRun | null = null;
let _inFlight: Promise<AuditRun> | null = null;

/** The most recent run on this page, or null. Kept in memory only. */
export function getLastAuditRun(): AuditRun | null {
  return _lastRun;
}

/** Runtime detectors (scanner) as audit findings: same evidence, audit fields added. */
async function runtimeFindings(): Promise<Issue[]> {
  const session = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  const groups = await Promise.all([
    detectConsoleErrors(session).catch(() => [] as Issue[]),
    detectFailedRequests(session).catch(() => [] as Issue[]),
    detectMixedContent().catch(() => [] as Issue[]),
    // Dead and rage clicks from the capture: the "dead UI" half of Auto Review.
    detectFrustration(session)
      .then((list) => list.filter((i) => i.detector === "frustration-dead" || i.detector === "frustration-rage"))
      .catch(() => [] as Issue[]),
  ]);
  return groups.flat().map((i) => ({
    ...i,
    category: "runtime" as const,
    ruleId: `runtime/${i.detector}`,
    page: location.href,
  }));
}

export async function runAudit(options: RunAuditOptions = {}): Promise<AuditRun> {
  if (_inFlight) return _inFlight;
  const scan: AuditScan = options.scan && AUDIT_SCANS[options.scan] ? options.scan : "full";
  const wanted = new Set(options.categories?.length ? options.categories : AUDIT_SCANS[scan].categories);

  _inFlight = (async () => {
    const categories: Partial<Record<AuditCategory, { ran: boolean; limitation?: string; metrics?: Record<string, number> }>> = {};
    const findings: Issue[] = [];
    const guard = async (name: AuditCategory, fn: () => Promise<Issue[]> | Issue[]) => {
      if (!wanted.has(name)) return;
      try {
        findings.push(...(await fn()));
        categories[name] = { ran: true, limitation: CATEGORY_LIMITATIONS[name] };
      } catch (err) {
        console.warn(`[TraceBug] ${name} audit failed:`, err);
        categories[name] = { ran: false, limitation: `The ${name} check failed on this page, so it was not run.` };
      }
    };

    if (wanted.has("accessibility")) {
      const a11y = await detectA11yFindings();
      findings.push(...a11y.findings);
      let limitation = a11y.limitation;
      if (a11y.ran) {
        try {
          const kbd = detectKeyboardFindings(document);
          findings.push(...kbd.findings);
          limitation += " Keyboard: Tab order and focus styles read from the page, nothing focused" +
            (kbd.unreadableSheets ? `; ${kbd.unreadableSheets} stylesheet${kbd.unreadableSheets === 1 ? "" : "s"} from another site could not be read.` : ".");
        } catch (err) {
          console.warn("[TraceBug] keyboard checks failed:", err);
          limitation += " The keyboard checks failed on this page.";
        }
      }
      categories.accessibility = { ran: a11y.ran, limitation };
    }
    await guard("ui", detectUiFindings);
    if (wanted.has("performance")) {
      try {
        const perf = await detectPerfFindings();
        findings.push(...perf.findings);
        categories.performance = { ran: perf.ran, limitation: perf.limitation, metrics: perf.metrics };
      } catch (err) {
        console.warn("[TraceBug] performance audit failed:", err);
        categories.performance = { ran: false, limitation: "The performance check failed on this page, so it was not run." };
      }
    }
    await guard("seo", () => detectSeoFindings(document));
    await guard("runtime", runtimeFindings);

    const run = buildAuditRun(findings, {
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
      categories,
      scan: options.categories?.length ? undefined : scan,
    });
    _lastRun = run;
    return run;
  })();

  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
}

export function clearAuditRun(): void {
  _lastRun = null;
}
