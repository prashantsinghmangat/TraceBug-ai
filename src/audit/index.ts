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
import { detectMobileFindings } from "./detectors/mobile";
import { detectCrawlFindings, detectSeoFindings } from "./detectors/seo";
import { detectPerfFindings } from "./detectors/performance";
import { detectKeyboardFindings } from "./detectors/keyboard";
import { detectFrustration } from "../scanner/detectors/frustration";
import { AUDIT_SCANS, type AuditReviewItem, type AuditScan } from "./types";

export const ALL_AUDIT_CATEGORIES: AuditCategory[] = ["accessibility", "ui", "mobile", "performance", "seo", "runtime"];

export const CATEGORY_LIMITATIONS: Partial<Record<AuditCategory, string>> = {
  ui: "Checked at the current window size only. No design judgement.",
  seo: "This page only: no crawl, no ranking claims.",
  runtime: "Only what happened since TraceBug started capturing on this page: errors, failed requests, mixed content, and rage or dead clicks.",
};

/** localhost, loopback, private LAN addresses and *.local / *.test / *.localhost dev names. */
export function isDevHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "[::1]" || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.(local|localhost|test)$/.test(h) || h === "0.0.0.0";
}

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
/** "dark" or "light" from the page's own background (the body, else the root); null if transparent. */
function pageColorScheme(): "dark" | "light" | null {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(el).backgroundColor);
    if (!m || (m[4] !== undefined && parseFloat(m[4]) < 0.5)) continue;
    const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
    return lum < 0.4 ? "dark" : "light";
  }
  return null;
}

/** Path of an event's page (stored as a path or a full URL), for comparing with the audited page. */
function pagePath(p: string | undefined): string {
  if (!p) return "";
  try { return new URL(p, location.origin).pathname.replace(/\/+$/, "") || "/"; } catch { return p; }
}

/** The latest session, cut down to the events captured on THIS page. An audit of "/" must not
 *  report the error or dead click a tester hit earlier on "/try.html" (seen in a real export). */
export function sessionForThisPage<S extends { updatedAt: number; events: Array<{ page: string }> }>(sessions: S[], path: string): S | null {
  const latest = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) return null;
  const here = pagePath(path);
  const events = latest.events.filter((e) => pagePath(e.page) === here);
  return events.length ? { ...latest, events } : null;
}

async function runtimeFindings(): Promise<Issue[]> {
  const session = sessionForThisPage(getAllSessions(), location.pathname);
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
    let review: AuditReviewItem[] | undefined;
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
      let kbdRan = false;
      if (a11y.ran) {
        try {
          const kbd = detectKeyboardFindings(document);
          kbdRan = true;
          findings.push(...kbd.findings);
          limitation += " Keyboard: Tab order and focus styles read from the page, nothing focused" +
            (kbd.unreadableSheets ? `; ${kbd.unreadableSheets} stylesheet${kbd.unreadableSheets === 1 ? "" : "s"} from another site could not be read.` : ".");
        } catch (err) {
          console.warn("[TraceBug] keyboard checks failed:", err);
          limitation += " The keyboard checks failed on this page.";
        }
      }
      // Colour results depend on the theme the page is showing; a light/dark site needs a run in each.
      const scheme = pageColorScheme();
      if (a11y.ran && scheme) {
        limitation += ` Colours were checked in the page's ${scheme} theme only — if the site has a theme switch, switch it and re-run to check the other.`;
      }
      const hidden = a11y.transparentText ?? 0;
      if (a11y.ran && hidden > 0) {
        limitation += ` ${hidden} piece${hidden === 1 ? "" : "s"} of text ${hidden === 1 ? "was" : "were"} invisible (opacity 0) when checked — usually content that fades in when you scroll — and could not be checked. Scroll through the page, then re-run.`;
      }
      const metrics: Record<string, number> = {};
      if (a11y.ran) {
        // Our keyboard rules join axe's counts: 3 apply whenever the page has focusable elements, focus-obscured
        // when it scrolls. Counted as applied only when we know they ran.
        const kbdFailed = new Set(findings.filter((f) => f.ruleId?.startsWith("kbd/")).map((f) => f.ruleId)).size;
        const kbdApplied = kbdRan ? 4 : 0;
        metrics.rulesChecked = (a11y.rulesChecked ?? 0) + kbdApplied;
        metrics.rulesPassed = metrics.rulesChecked - (a11y.rulesFailed ?? 0) - kbdFailed;
        const wcag = new Set([...(a11y.wcagFailed ?? []), ...findings.filter((f) => f.ruleId?.startsWith("kbd/")).flatMap((f) => f.wcag || [])]);
        metrics.wcagCriteriaFailed = wcag.size;
        if (hidden > 0) metrics.transparentText = hidden;
      }
      review = a11y.review;
      categories.accessibility = { ran: a11y.ran, limitation, ...(Object.keys(metrics).length ? { metrics } : {}) };
    }
    await guard("ui", () => detectUiFindings());
    if (wanted.has("mobile")) {
      const m = await detectMobileFindings(findings.filter((f) => f.category === "ui"));
      findings.push(...m.findings);
      categories.mobile = { ran: m.ran, limitation: m.limitation };
    }
    if (wanted.has("performance")) {
      try {
        const perf = await detectPerfFindings();
        findings.push(...perf.findings);
        // A development server serves unminified bundles: "main.js is 1.3 MB" there says nothing
        // about production. Keep the timings, drop file-size findings, and say why.
        const dev = isDevHost(location.hostname);
        if (dev) {
          for (let i = findings.length - 1; i >= 0; i--) {
            if (findings[i].ruleId === "perf/large-resource" || findings[i].ruleId === "perf/page-weight") findings.splice(i, 1);
          }
        }
        categories.performance = {
          ran: perf.ran,
          limitation: perf.limitation + (dev ? " This is a development server: file sizes aren't checked here (dev builds are unminified) and timings won't match production." : ""),
          metrics: perf.metrics,
        };
      } catch (err) {
        console.warn("[TraceBug] performance audit failed:", err);
        categories.performance = { ran: false, limitation: "The performance check failed on this page, so it was not run." };
      }
    }
    if (wanted.has("seo")) {
      try {
        findings.push(...detectSeoFindings(document));
        let limitation = CATEGORY_LIMITATIONS.seo!;
        if (isDevHost(location.hostname)) {
          limitation += " robots.txt and the sitemap aren't checked on a development server.";
        } else {
          const crawl = await detectCrawlFindings();
          findings.push(...crawl.findings);
          limitation += crawl.checked
            ? " Also read this site's /robots.txt (and /sitemap.xml if robots.txt names none)."
            : " robots.txt couldn't be read, so whether search engines may crawl this page wasn't checked.";
        }
        categories.seo = { ran: true, limitation };
      } catch (err) {
        console.warn("[TraceBug] seo audit failed:", err);
        categories.seo = { ran: false, limitation: "The seo check failed on this page, so it was not run." };
      }
    }
    await guard("runtime", runtimeFindings);

    const run = buildAuditRun(findings, {
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      userAgent: navigator.userAgent,
      categories,
      scan: options.categories?.length ? undefined : scan,
      review,
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
