// ── Cloud-upload sanitization ─────────────────────────────────────────────
// Runs on a BugReport right before it's serialized into an HTML blob for
// cloud upload. Goal: strip secrets that may have been captured incidentally
// in network response snippets, console output, or URL query strings, so they
// never leave the user's machine.
//
// Scope: text fields only. Screenshots and video frames are NOT scanned —
// users who screenshot a password input will share that screenshot. Document
// this limitation in the share-modal copy.

import type { BugReport } from "../types";

const REDACTED = "[REDACTED]";

// Token-shape patterns. Conservative — only match well-known prefixes or
// strong shapes so we don't mangle normal log lines.
const TOKEN_PATTERNS: { name: string; re: RegExp; replace: (m: string) => string }[] = [
  // Bearer <token> in headers, console output, anywhere
  { name: "bearer",      re: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, replace: () => "Bearer " + REDACTED },
  // JWT (3 base64url segments separated by dots, leading with eyJ which is `{"` in base64)
  { name: "jwt",         re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: mask },
  // OpenAI / Stripe-style
  { name: "sk_prefix",   re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, replace: mask },
  { name: "sk_live",     re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replace: mask },
  // GitHub PATs
  { name: "github_pat",  re: /\bghp_[A-Za-z0-9]{30,}\b/g, replace: mask },
  { name: "github_fine", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, replace: mask },
  // AWS access keys (begins with AKIA, ASIA, AGPA, AIDA, etc.)
  { name: "aws_access",  re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/g, replace: mask },
  // Slack
  { name: "slack",       re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, replace: mask },
  // Google API keys
  { name: "google_api",  re: /\bAIza[A-Za-z0-9_-]{35}\b/g, replace: mask },
];

// Show first 4 and last 4 chars so the user can still recognize which token
// fired without exposing the secret value.
function mask(s: string): string {
  if (s.length <= 12) return REDACTED;
  return `${s.slice(0, 4)}…${REDACTED}…${s.slice(-4)}`;
}

// Sensitive query-param names (case-insensitive). Strip the value.
const SENSITIVE_QUERY_KEYS = new Set([
  "token", "access_token", "id_token", "refresh_token", "api_key",
  "apikey", "secret", "password", "passwd", "pwd", "auth",
  "authorization", "x-api-key", "session", "sid", "csrf",
]);

function sanitizeUrl(url: string): string {
  if (typeof url !== "string" || url.length === 0) return url;
  try {
    // Try to parse — if not absolute, treat as path with query.
    const isAbs = /^[a-z][a-z0-9+.-]*:/i.test(url);
    const u = new URL(isAbs ? url : `http://_placeholder_${url.startsWith("/") ? "" : "/"}${url}`);
    let changed = false;
    u.searchParams.forEach((_v, k) => {
      if (SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, REDACTED);
        changed = true;
      }
    });
    if (!changed) return sanitizeText(url);
    const out = isAbs ? u.toString() : u.pathname + u.search + u.hash;
    return sanitizeText(out);
  } catch {
    return sanitizeText(url);
  }
}

function sanitizeText(s: string | undefined | null): string {
  if (s == null) return s as any;
  let out = String(s);
  for (const p of TOKEN_PATTERNS) out = out.replace(p.re, p.replace);
  return out;
}

// Returns a new sanitized BugReport. The original object is not mutated, so
// the local download / export-to-html path keeps the unsanitized version.
export function sanitizeReportForUpload(report: BugReport): BugReport {
  const out: BugReport = structuredClone(report);

  if (out.consoleErrors) {
    out.consoleErrors = out.consoleErrors.map((e) => ({
      ...e,
      message: sanitizeText(e.message),
      stack: sanitizeText(e.stack ?? undefined),
    }));
  }
  if (out.consoleLogs) {
    out.consoleLogs = out.consoleLogs.map((e) => ({
      ...e,
      message: sanitizeText(e.message),
      stack: sanitizeText(e.stack ?? undefined),
    }));
  }
  if (out.networkErrors) {
    out.networkErrors = out.networkErrors.map((e) => ({
      ...e,
      url: sanitizeUrl(e.url),
      response: sanitizeText(e.response ?? undefined),
    }));
  }
  if (out.networkRequests) {
    out.networkRequests = out.networkRequests.map((e) => ({
      ...e,
      url: sanitizeUrl(e.url),
      response: sanitizeText(e.response ?? undefined),
    }));
  }
  if (out.steps) out.steps = sanitizeText(out.steps);
  if (out.summary) out.summary = sanitizeText(out.summary);
  if (out.title) out.title = sanitizeText(out.title);
  if (Array.isArray(out.sessionSteps)) out.sessionSteps = out.sessionSteps.map((s) => sanitizeText(s));
  if (out.actionChips) {
    out.actionChips = out.actionChips.map((c) => ({
      ...c,
      target: sanitizeText(c.target ?? undefined),
      detail: sanitizeText(c.detail ?? undefined),
    }));
  }
  if (out.environment?.url) out.environment.url = sanitizeUrl(out.environment.url);
  if (out.context && typeof out.context === "object") {
    const ctx: Record<string, any> = {};
    for (const [k, v] of Object.entries(out.context)) {
      ctx[k] = typeof v === "string" ? sanitizeText(v) : v;
    }
    out.context = ctx as any;
  }

  return out;
}
