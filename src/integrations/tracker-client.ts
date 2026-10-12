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
import { signIssueBody, signSlackPost } from "./issue-signature";
import { severityTitlePrefix } from "../report-builder";
import { isExtensionMode, getIntegrationStatus } from "../ext-transport";
import { sendTrackerViaBridge } from "../ext-rpc";
import { postGitHubIssue, postLinearIssue, postSlackMessage } from "../providers/api";
import type {
  TrackerProvider, GitHubConfig, LinearConfig, SlackConfig,
  IntegrationsConfig, CreateIssueResult,
} from "../providers/api";

// The wire types and the fetch adapters live in src/providers/api.ts, which is
// also bundled into the extension's service worker (Phase 2b). Re-exported
// here so this module stays the public surface the SDK and src/index.ts use.
export type {
  TrackerProvider, GitHubConfig, LinearConfig, SlackConfig,
  IntegrationsConfig, CreateIssueResult,
};

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

/**
 * Report markdown with the leading "## title" line removed (title is separate),
 * plus the issue signature when it is enabled.
 *
 * Signed HERE rather than at each call site: GitHub, Linear, the page-world
 * path and the extension bridge path all funnel through this one function, so
 * one path cannot get out of step with another.
 */
function issueBody(report: BugReport): string {
  return signIssueBody(generateGitHubIssue(report).replace(/^##\s+[^\n]+\n+/, ""));
}

/** The Slack text, signed. Slack's link syntax differs — see issue-signature. */
function slackText(report: BugReport): string {
  return signSlackPost(generateSlackPost(report));
}

// ── Provider adapters ──────────────────────────────────────────────────────
// The HTTP calls live in src/providers/api.ts (shared with the service worker).
// What stays here is the page-side rendering: BugReport → title/body/text.

export async function createGitHubIssue(
  report: BugReport,
  config: GitHubConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  return postGitHubIssue(config, { title: issueTitle(report), body: issueBody(report) }, signal);
}

export async function createLinearIssue(
  report: BugReport,
  config: LinearConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  return postLinearIssue(config, { title: issueTitle(report), body: issueBody(report) }, signal);
}

export async function sendSlackMessage(
  report: BugReport,
  config: SlackConfig,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  // Page-world mode only ever gets an opaque response — see postSlackMessage.
  return postSlackMessage(config, { text: slackText(report) }, signal);
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
  // so the call is made by the background service worker. We hand it CONTENT
  // only — no repo, no team, no webhook, no token. The worker reads those from
  // chrome.storage.local and shows the user a confirmation window naming the
  // destination before anything leaves the browser (Phase 2b).
  if (isExtensionMode()) {
    if (!hasIntegration(provider)) {
      throw new Error(`${TRACKER_LABELS[provider] || provider} is not configured — open TraceBug settings.`);
    }
    const content = provider === "slack"
      ? { text: slackText(report) }
      : { title: issueTitle(report), body: issueBody(report) };
    return sendTrackerViaBridge(provider, content);
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
