// ── Cloud-upload sanitization ─────────────────────────────────────────────
// Runs on a BugReport right before it's serialized into an HTML blob for
// cloud upload. Goal: strip secrets that may have been captured incidentally
// in network response snippets, console output, or URL query strings, so they
// never leave the user's machine.
//
// Scope: text fields only. Screenshots and video frames are NOT scanned —
// users who screenshot a password input will share that screenshot. Document
// this limitation in the share-modal copy.

import type { BugReport, ContextData, StorageEntry } from "../types";

const REDACTED = "[REDACTED]";

// Token-shape patterns. Conservative — only match well-known prefixes or
// strong shapes so we don't mangle normal log lines.
const TOKEN_PATTERNS: { name: string; re: RegExp; replace: (m: string) => string }[] = [
  // Bearer <token> in headers, console output, anywhere
  { name: "bearer",      re: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, replace: () => "Bearer " + REDACTED },
  // JWT (3 base64url segments separated by dots, leading with eyJ which is `{"` in base64)
  { name: "jwt",         re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replace: mask },
  // OpenAI / Stripe sk_*
  { name: "sk_prefix",   re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, replace: mask },
  // Stripe secret + publishable (live/test, secret + publishable + restricted)
  { name: "stripe",      re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replace: mask },
  // GitHub PATs (classic + fine-grained + OAuth + server tokens)
  { name: "github_pat",  re: /\bghp_[A-Za-z0-9]{30,}\b/g, replace: mask },
  { name: "github_fine", re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/g, replace: mask },
  { name: "github_oauth", re: /\bgho_[A-Za-z0-9]{30,}\b/g, replace: mask },
  { name: "github_server", re: /\bghs_[A-Za-z0-9]{30,}\b/g, replace: mask },
  // AWS access keys (begins with AKIA, ASIA, AGPA, AIDA, etc.) + secret key (40-char base64)
  { name: "aws_access",  re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[A-Z0-9]{16}\b/g, replace: mask },
  { name: "aws_secret",  re: /\b(?:aws.{0,20})?[A-Za-z0-9/+]{40}\b(?=.*aws|.*secret|.*key)/gi, replace: mask },
  // Slack — broader than before (xoxa-z covers all known prefixes)
  { name: "slack",       re: /\bxox[abeprs]-[A-Za-z0-9-]{10,}\b/g, replace: mask },
  // Google API keys
  { name: "google_api",  re: /\bAIza[A-Za-z0-9_-]{35}\b/g, replace: mask },
  // Twilio — Account SID + Auth tokens
  { name: "twilio_sid",  re: /\b(?:AC|SK)[a-f0-9]{32}\b/g, replace: mask },
  // SendGrid
  { name: "sendgrid",    re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, replace: mask },
  // Mailgun
  { name: "mailgun",     re: /\bkey-[a-f0-9]{32}\b/g, replace: mask },
  // Postmark
  { name: "postmark",    re: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b(?=.{0,30}(postmark|server-token|api-token))/gi, replace: mask },
  // Linear / Vercel / Cloudflare / Discord
  { name: "linear",      re: /\blin_api_[A-Za-z0-9]{40,}\b/g, replace: mask },
  { name: "discord_bot", re: /\b[MN][A-Za-z\d]{23}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/g, replace: mask },
  // Generic high-entropy hex (≥32 chars). Catches webhook signing secrets,
  // session IDs, etc. that don't carry a recognizable prefix. Conservative:
  // only triggers when preceded by a common secret-y keyword to avoid
  // mangling legitimate hex like git SHAs.
  { name: "labeled_hex", re: /\b(?:secret|token|key|password|api[_-]?key|auth)["':\s=]{1,5}([a-fA-F0-9]{32,})\b/gi, replace: (s) => s.replace(/[a-fA-F0-9]{32,}/, REDACTED) },
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

function sanitizeText(s: string): string;
function sanitizeText(s: string | undefined): string | undefined;
function sanitizeText(s: string | undefined | null): string | undefined | null;
function sanitizeText(s: string | undefined | null): string | undefined | null {
  if (s == null) return s;
  let out = String(s);
  for (const p of TOKEN_PATTERNS) out = out.replace(p.re, p.replace);
  return out;
}

/**
 * Token-shape scrub for a single string — exported so capture-time code
 * (network response snippets in collectors.ts) can share the exact same
 * patterns. Applying it at capture means the modal, the local .html export,
 * AND the cloud path all see scrubbed text; this pass here stays as
 * defense-in-depth for everything else in the report.
 */
export function sanitizeTokenShapes(s: string): string {
  return sanitizeText(s);
}

// Returns a new sanitized BugReport. The original object is not mutated, so
// the local download / export-to-html path keeps the unsanitized version.
export function sanitizeReportForUpload(report: BugReport): BugReport {
  // structuredClone is Safari 15.2+ / Firefox 94+. The JSON round-trip
  // fallback is fine here: BugReport is plain data (no Dates/Maps/Blobs —
  // video carries dataUrl strings, not Blob refs, through this path).
  const out: BugReport =
    typeof structuredClone === "function"
      ? structuredClone(report)
      : (JSON.parse(JSON.stringify(report)) as BugReport);

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
  if (out.storage) {
    // Storage values are already key-redacted at capture; run the token-shape
    // pass too as defense-in-depth before they leave the machine.
    const scrub = (entries: StorageEntry[]) =>
      entries.map((e) => ({ ...e, value: sanitizeText(e.value) }));
    out.storage.local = scrub(out.storage.local || []);
    out.storage.session = scrub(out.storage.session || []);
    if (out.storage.cookies) out.storage.cookies = scrub(out.storage.cookies);
  }
  if (out.environment?.url) out.environment.url = sanitizeUrl(out.environment.url);
  if (out.context && typeof out.context === "object") {
    const ctx: ContextData = {};
    for (const [k, v] of Object.entries(out.context)) {
      ctx[k] = typeof v === "string" ? sanitizeText(v) : v;
    }
    out.context = ctx;
  }

  return out;
}
