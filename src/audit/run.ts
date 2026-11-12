// ── Audit run builder ──────────────────────────────────────────────────────
// Turns raw findings from the audit detectors into the `AuditRun` that rides
// in the exported report (docs/audit-quality/implementation-plan.md §3):
//
//   - every page-derived string is redacted and bounded (it reaches an AI agent)
//   - each finding gets its fingerprints, so a later run can be compared
//   - duplicates collapse into one finding with an `occurrences` count
//   - most severe first, at most MAX_AUDIT_FINDINGS, the rest counted in `truncated`
//   - a category that did not run says so; it is never reported as "0 issues"
//
// Pure: no DOM access. Detectors gather; this only shapes.

import type { AuditCategory, AuditEvidence, AuditRun, Issue, IssueSeverity } from "../types";
import type { AuditScan } from "./types";
import { redactUrl, redactUrlsInText } from "../url-hygiene";
import { sanitizeTokenShapes } from "../sanitize/cloud-upload";
import { auditFallbackFingerprint, auditFingerprint } from "./fingerprint";

export const MAX_AUDIT_FINDINGS = 200;
export const MAX_EVIDENCE_HTML = 600;
export const MAX_EVIDENCE_TEXT = 80;
export const MAX_HINTS = 8;
export const MAX_HINT_LENGTH = 60;

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** Redact, then cut to `max` characters, marking the cut with "…". */
function bound(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  const clean = sanitizeTokenShapes(redactUrlsInText(String(s)));
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/** Bounded, redacted copy of a finding's evidence. */
export function boundEvidence(e: AuditEvidence | undefined): AuditEvidence | undefined {
  if (!e) return undefined;
  const out: AuditEvidence = {};
  if (e.html != null) out.html = bound(e.html, MAX_EVIDENCE_HTML);
  if (e.text != null) out.text = bound(e.text.replace(/\s+/g, " ").trim(), MAX_EVIDENCE_TEXT);
  if (e.metrics) {
    out.metrics = {};
    for (const [k, v] of Object.entries(e.metrics)) {
      out.metrics[k] = typeof v === "number" ? v : (bound(String(v), MAX_HINT_LENGTH) as string);
    }
  }
  if (e.hints?.length) {
    const seen = new Set<string>();
    out.hints = [];
    for (const h of e.hints) {
      const b = bound(h, MAX_HINT_LENGTH);
      if (!b || seen.has(b)) continue;
      seen.add(b);
      out.hints.push(b);
      if (out.hints.length >= MAX_HINTS) break;
    }
  }
  return out;
}

/** Browser family from a user-agent string. Order matters: Edge and Chrome both say "Chrome". */
export function userAgentFamily(ua: string | undefined): string {
  const s = ua || "";
  if (/\bEdg\//.test(s)) return "Edge";
  if (/\bFirefox\//.test(s)) return "Firefox";
  if (/\b(?:Headless)?Chrome\//.test(s) || /\bChromium\//.test(s)) return "Chrome";
  if (/\bSafari\//.test(s)) return "Safari";
  return "Other";
}

export interface AuditRunContext {
  /** Page URL (redacted here). */
  url: string;
  viewport: { width: number; height: number };
  userAgent?: string;
  /** Every category that was part of this run, and whether it could run. */
  categories: Partial<Record<AuditCategory, { ran: boolean; limitation?: string; metrics?: Record<string, number> }>>;
  now?: number;
  /** The menu scan this run belongs to (omitted for a custom category list). */
  scan?: AuditScan;
  /** For tests: a fixed id. */
  id?: string;
}

/**
 * Build the AuditRun. Findings must carry `category` and `ruleId`; ones that
 * don't are dropped (they are scanner output that isn't part of an audit).
 */
export function buildAuditRun(findings: Issue[], ctx: AuditRunContext): AuditRun {
  const now = ctx.now ?? Date.now();
  const page = redactUrl(ctx.url);

  // Shape, fingerprint and collapse duplicates.
  const byKey = new Map<string, Issue>();
  for (const raw of findings) {
    if (!raw.category || !raw.ruleId) continue;
    const evidence = boundEvidence(raw.evidence);
    const fpInput = {
      category: raw.category,
      ruleId: raw.ruleId,
      page: raw.page || page,
      selector: raw.selector,
      url: raw.url,
      html: evidence?.html,
      text: evidence?.text,
    };
    const fingerprint = auditFingerprint(fpInput);
    const existing = byKey.get(fingerprint);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + (raw.occurrences ?? 1);
      if (SEVERITY_RANK[raw.severity] < SEVERITY_RANK[existing.severity]) existing.severity = raw.severity;
      continue;
    }
    const shaped: Issue = {
      ...raw,
      title: bound(raw.title, 120) ?? "",
      description: bound(raw.description, 600) ?? "",
      url: raw.url ? redactUrl(raw.url) : undefined,
      page: raw.page ? redactUrl(raw.page) : page,
      evidence,
      fingerprint,
      fallbackFingerprint: auditFallbackFingerprint(fpInput),
    };
    if (shaped.url === undefined) delete shaped.url;
    if (shaped.evidence === undefined) delete shaped.evidence;
    if (shaped.fallbackFingerprint === undefined) delete shaped.fallbackFingerprint;
    byKey.set(fingerprint, shaped);
  }

  const all = [...byKey.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.category! < b.category! ? -1 : a.category! > b.category! ? 1 : 0),
  );
  const kept = all.slice(0, MAX_AUDIT_FINDINGS);

  const order: AuditCategory[] = ["accessibility", "ui", "performance", "seo", "runtime"];
  const categories = order
    .filter((name) => ctx.categories[name] !== undefined)
    .map((name) => {
      const c = ctx.categories[name]!;
      const entry: AuditRun["categories"][number] = {
        name,
        ran: c.ran,
        // Counts every finding in the category, including any the cap left out.
        count: c.ran ? all.filter((f) => f.category === name).length : 0,
      };
      if (c.limitation) entry.limitation = c.limitation;
      if (c.metrics && Object.keys(c.metrics).length) entry.metrics = { ...c.metrics };
      return entry;
    });

  return {
    id: ctx.id ?? `audit-${now.toString(36)}`,
    url: page,
    scannedAt: now,
    viewport: { width: Math.round(ctx.viewport.width), height: Math.round(ctx.viewport.height) },
    userAgentFamily: userAgentFamily(ctx.userAgent),
    categories,
    findings: kept,
    truncated: all.length - kept.length,
    ...(ctx.scan ? { scan: ctx.scan } : {}),
  };
}
