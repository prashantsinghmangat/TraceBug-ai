// ── BYO-token issue-tracker integrations ──────────────────────────────────
// Creates a REAL issue/message in the user's tracker using the USER'S OWN
// token — GitHub (PAT), Linear (API key), or Slack (incoming webhook). The
// call goes directly from the browser to the provider and never touches a
// TraceBug backend. In SDK (npm) mode the token lives in the app page's own
// localStorage; in EXTENSION mode it lives in chrome.storage.local and the
// background service worker makes the call, because the SDK runs in the host
// page's main world where the site under test could read it.
//
// This is the same privacy-preserving pattern as the BYO-key AI Debugger
// (src/ai/llm-client.ts): no OAuth, no client secret, no cloud in the path.
// Real API calls also lift the ~6-8 KB URL-prefill cap the old
// /issues/new?body=… flow hit — the full report body travels in the request.
//
// CORS note: GitHub and Linear serve CORS headers, so browser calls work and
// we can read the created issue URL back. Slack incoming webhooks don't, so
// that POST is fire-and-forget (mode: "no-cors", opaque response). Jira Cloud
// is CORS-blocked for browser XHR and intentionally NOT included here — it
// stays copy-markup until an optional proxy exists.

import type { BugReport } from "../types";
import { generateGitHubIssue } from "../github-issue";
import { generateSlackPost } from "../slack-export";
import { severityTitlePrefix } from "../report-builder";
import { isExtensionMode, getIntegrationStatus } from "../ext-transport";

export type TrackerProvider = "github" | "linear" | "slack";

export interface GitHubConfig {
  /** Personal access token with `repo` (or `public_repo`) scope. */
  token: string;
  /** "owner/repo", e.g. "facebook/react". */
  repo: string;
  /** Optional default labels applied to created issues. */
  labels?: string[];
}

export interface LinearConfig {
  /** Personal API key (lin_api_…). */
  apiKey: string;
  /** Team id the issue is filed under. */
  teamId: string;
}

export interface SlackConfig {
  /** Incoming-webhook URL (https://hooks.slack.com/services/…). */
  webhookUrl: string;
}

export interface IntegrationsConfig {
  github?: GitHubConfig;
  linear?: LinearConfig;
  slack?: SlackConfig;
}

export interface CreateIssueResult {
  provider: TrackerProvider;
  ok: boolean;
  /** Web URL of the created issue, when the provider returns one. */
  url?: string;
  /** Human-readable identifier (issue number / Linear identifier). */
  ref?: string;
  /** True when the provider gives no readable response (Slack no-cors). */
  opaque?: boolean;
}

export const TRACKER_LABELS: Record<TrackerProvider, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
};

export const STORAGE_KEY = "tracebug_integrations";

// ── Config store ──────────────────────────────────────────────────────────
// SDK (npm) mode: page localStorage, as before — the page is the app's own.
// EXTENSION mode: the SDK runs in the host page's main world, so tokens live in
// chrome.storage.local and are never handed to this module. Every accessor
// below returns empty / refuses, and `hasIntegration` answers from the
// non-secret boolean snapshot the content script pushes in. See
// src/ext-transport.ts and docs/launch/PLAN.md Phase 2.

export function getIntegrationsConfig(): IntegrationsConfig {
  // Never surface a token to page-world code in extension mode. The background
  // service worker reads the real config out of chrome.storage.local itself.
  if (isExtensionMode()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as IntegrationsConfig;
  } catch { /* localStorage blocked — treat as unconfigured */ }
  return {};
}

export function setIntegrationsConfig(config: IntegrationsConfig): void {
  // In extension mode tokens are entered in the extension's own options page,
  // which writes chrome.storage.local directly. Writing them here would put the
  // secret back into the host page's storage — the exact leak Phase 2 closes.
  if (isExtensionMode()) {
    console.warn("[TraceBug] Configure integrations in TraceBug settings — tokens are not stored on the page.");
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore quota/permission errors */ }
}

export function clearIntegrationsConfig(): void {
  if (isExtensionMode()) {
    console.warn("[TraceBug] Clear integrations in TraceBug settings.");
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/**
 * True when the given provider has enough config to make a real API call.
 * Stays SYNCHRONOUS in both modes — extension mode answers from the pushed
 * boolean snapshot, so render paths never have to await storage.
 */
export function hasIntegration(provider: TrackerProvider): boolean {
  if (isExtensionMode()) {
    const s = getIntegrationStatus();
    switch (provider) {
      case "github": return s.github;
      case "linear": return s.linear;
      case "slack": return s.slack;
      default: return false;
    }
  }
  const c = getIntegrationsConfig();
  switch (provider) {
    case "github": return !!(c.github?.token && c.github?.repo);
    case "linear": return !!(c.linear?.apiKey && c.linear?.teamId);
    case "slack": return !!c.slack?.webhookUrl;
    default: return false;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────

/** Severity-prefixed issue title, matching the copy/URL-prefill flows. */
function issueTitle(report: BugReport): string {
  const raw = report.title || "Bug report";
  return raw.match(/^[🔴🟠🟡🟢]/u) ? raw : `${severityTitlePrefix(report.severity)}${raw}`;
}

/** Report markdown with the leading "## title" line removed (title is separate). */
function issueBody(report: BugReport): string {
  return generateGitHubIssue(report).replace(/^##\s+[^\n]+\n+/, "");
}

/** The union of response fields we read off provider JSON — GitHub REST
 *  (html_url/number) and Linear GraphQL (data.issueCreate). All optional:
 *  bodies are dynamic and only trusted after the checks at each call site. */
interface TrackerJsonResponse {
  message?: string;
  error?: string;
  errors?: Array<{ message?: string }>;
  html_url?: string;
  number?: number;
  data?: {
    issueCreate?: {
      success?: boolean;
      issue?: { url?: string; identifier?: string };
    };
  };
}

async function parseJsonOrThrow(res: Response, label: string): Promise<TrackerJsonResponse> {
  let data: TrackerJsonResponse | null = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || (Array.isArray(data.errors) && data.errors[0]?.message))) ||
      `${label} request failed (HTTP ${res.status}).`;
    throw new Error(String(msg));
  }
  // res.ok with an unparseable body is a provider bug — keep the historical
  // shape (callers read fields off whatever came back) rather than inventing
  // a fallback object here.
  return data!;
}

// ── GitHub (REST: create an issue) ─────────────────────────────────────────

export async function createGitHubIssue(
  report: BugReport,
  config: GitHubConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) {
    throw new Error(`Invalid repo "${config.repo}". Expected "owner/repo".`);
  }
  const res = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      title: issueTitle(report),
      body: issueBody(report),
      labels: config.labels && config.labels.length ? config.labels : undefined,
    }),
  });
  const data = await parseJsonOrThrow(res, "GitHub");
  return { provider: "github", ok: true, url: data.html_url, ref: data.number ? `#${data.number}` : undefined };
}

// ── Linear (GraphQL: issueCreate) ──────────────────────────────────────────

export async function createLinearIssue(
  report: BugReport,
  config: LinearConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  const query =
    "mutation IssueCreate($input: IssueCreateInput!) {" +
    " issueCreate(input: $input) { success issue { id identifier url } } }";
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      // Linear personal API keys go in Authorization verbatim (no "Bearer").
      "authorization": config.apiKey,
    },
    body: JSON.stringify({
      query,
      variables: { input: { teamId: config.teamId, title: issueTitle(report), description: issueBody(report) } },
    }),
  });
  const data = await parseJsonOrThrow(res, "Linear");
  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(data.errors[0]?.message || "Linear rejected the request.");
  }
  const issue = data?.data?.issueCreate?.issue;
  if (!data?.data?.issueCreate?.success || !issue) {
    throw new Error("Linear did not create the issue.");
  }
  return { provider: "linear", ok: true, url: issue.url, ref: issue.identifier };
}

// ── Slack (incoming webhook: fire-and-forget) ──────────────────────────────

export async function sendSlackMessage(
  report: BugReport,
  config: SlackConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(config.webhookUrl)) {
    throw new Error("Invalid Slack webhook URL (expected https://hooks.slack.com/…).");
  }
  // no-cors: Slack webhooks send no CORS headers, so the response is opaque.
  // Content-type must stay CORS-safelisted, so we post the payload as a
  // urlencoded `payload=` field (Slack accepts this form).
  await fetch(config.webhookUrl, {
    method: "POST",
    signal,
    mode: "no-cors",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "payload=" + encodeURIComponent(JSON.stringify({ text: generateSlackPost(report) })),
  });
  // We can't read an opaque response — report success optimistically.
  return { provider: "slack", ok: true, opaque: true };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

/**
 * Create an issue / send a message via the given provider using stored config.
 * Throws if the provider isn't configured or the API call fails.
 */
export async function createTrackerIssue(
  provider: TrackerProvider,
  report: BugReport,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  // Extension mode: tokens are deliberately unreachable from the page world,
  // so this call cannot be made here. The background service worker owns it
  // (Phase 2b, with per-send confirmation) — until then, fail with a message
  // that tells the user where the token now lives.
  if (isExtensionMode()) {
    throw new Error(
      `${TRACKER_LABELS[provider] || provider} is sent from the extension — open TraceBug settings to configure it.`,
    );
  }
  const c = getIntegrationsConfig();
  switch (provider) {
    case "github":
      if (!c.github?.token || !c.github?.repo) throw new Error("GitHub is not configured.");
      return createGitHubIssue(report, c.github, signal);
    case "linear":
      if (!c.linear?.apiKey || !c.linear?.teamId) throw new Error("Linear is not configured.");
      return createLinearIssue(report, c.linear, signal);
    case "slack":
      if (!c.slack?.webhookUrl) throw new Error("Slack is not configured.");
      return sendSlackMessage(report, c.slack, signal);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
