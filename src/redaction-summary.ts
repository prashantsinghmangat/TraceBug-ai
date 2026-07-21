// ── Redaction summary ─────────────────────────────────────────────────────
// Counts what the capture-time sanitizers actually masked in a report so the
// export UI can say "4 sensitive values auto-masked" instead of leaving the
// redaction pipeline invisible. Pure read — scans the built report for the
// [REDACTED] markers the sanitizers leave behind; no re-scrubbing happens
// here (collectors.ts and sanitize/cloud-upload.ts own the masking).

import type { BugReport } from "./types";

export interface RedactionSummary {
  /** Sensitive query params masked in captured request URLs. */
  urlParams: number;
  /** Password/secret form + input field values masked at capture. */
  formFields: number;
  /** localStorage / sessionStorage / cookie values masked at capture. */
  storageKeys: number;
  /** Token shapes (JWT, Bearer, sk-, cloud keys…) masked in console output,
   *  error messages, and network response snippets. */
  tokens: number;
  total: number;
}

const REDACTED = "[REDACTED]";
const TOKEN_RE = /\[REDACTED\]/g;
// Collector-side URL sanitization writes the marker literally; the cloud-path
// URL API percent-encodes the brackets. Match both.
const PARAM_RE = /=(?:\[REDACTED\]|%5BREDACTED%5D)/g;

function count(s: string | undefined | null, re: RegExp): number {
  if (!s) return 0;
  const m = s.match(re);
  return m ? m.length : 0;
}

export function summarizeRedactions(report: BugReport): RedactionSummary {
  // networkRequests supersets networkErrors — use one, never both, or every
  // failed request would be counted twice.
  const requests =
    (report.networkRequests?.length ? report.networkRequests : report.networkErrors) || [];

  let urlParams = count(report.environment?.url, PARAM_RE);
  for (const r of requests) urlParams += count(r.url, PARAM_RE);

  // Input events fire per change on the same field — dedupe by field identity
  // so one password box doesn't report as a dozen maskings.
  const seenFields = new Set<string>();
  for (const ev of report.session?.events || []) {
    if (ev.type === "input") {
      const el = ev.data?.element;
      if (el?.value === REDACTED) seenFields.add(`input:${el.name || el.id || "field"}`);
    } else if (ev.type === "form_submit") {
      const fields = ev.data?.form?.fields;
      if (fields && typeof fields === "object") {
        for (const [name, v] of Object.entries(fields)) {
          if (v === REDACTED) seenFields.add(`form:${name}`);
        }
      }
    }
  }
  const formFields = seenFields.size;

  let storageKeys = 0;
  const st = report.storage;
  for (const list of [st?.local, st?.session, st?.cookies]) {
    if (!list) continue;
    for (const e of list) if (e.redacted) storageKeys++;
  }

  // consoleLogs supersets consoleErrors when populated — same either-or rule.
  const consoleTexts =
    (report.consoleLogs?.length ? report.consoleLogs : report.consoleErrors) || [];
  let tokens = 0;
  for (const c of consoleTexts) {
    tokens += count(c.message, TOKEN_RE) + count(c.stack, TOKEN_RE);
  }
  for (const r of requests) tokens += count(r.response, TOKEN_RE);

  return { urlParams, formFields, storageKeys, tokens, total: urlParams + formFields + storageKeys + tokens };
}

/** "4 sensitive values auto-masked (2 tokens, 1 URL param, 1 form field)" —
 *  null when nothing was masked, so callers can omit the line entirely
 *  rather than claim a clean bill of health the regexes can't promise. */
export function formatRedactionSummary(s: RedactionSummary): string | null {
  if (s.total === 0) return null;
  const part = (n: number, singular: string, plural = singular + "s") =>
    n > 0 ? `${n} ${n === 1 ? singular : plural}` : null;
  const parts = [
    part(s.tokens, "token"),
    part(s.urlParams, "URL param"),
    part(s.formFields, "form field"),
    part(s.storageKeys, "storage value"),
  ].filter(Boolean);
  return `${s.total} sensitive value${s.total === 1 ? "" : "s"} auto-masked (${parts.join(", ")})`;
}
