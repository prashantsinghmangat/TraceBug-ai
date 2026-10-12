// ── Provider HTTP layer — the ONLY place a provider is called ──────────────
// GitHub / Linear / Slack / Anthropic / OpenAI / Ollama, as thin fetch()
// adapters shaped to each provider's wire format. No SDKs, no dependencies.
//
// This module is loaded in TWO very different places:
//
//   1. The page-world SDK (npm mode), via src/integrations/tracker-client.ts
//      and src/ai/llm-client.ts.
//   2. The extension's background service worker, as the IIFE bundle
//      tracebug-extension/tracebug-provider-api.js (tsup entry
//      "tracebug-provider-api"), loaded with importScripts() on Chrome and as
//      the first background script on Firefox.
//
// Because of (2) it must stay free of DOM, localStorage, window and any
// TraceBug module that touches them. It takes CONTENT (title/body/text/prompt)
// and a CONFIG, and does nothing else — all rendering stays page-side, all
// config reading stays caller-side. Phase 2b, docs/launch/PLAN.md.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tracker types ─────────────────────────────────────────────────────────

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

/** What the page supplies for a GitHub/Linear send. Nothing else is accepted. */
export interface IssueContent {
  title: string;
  body: string;
}

/** What the page supplies for a Slack send. */
export interface SlackContent {
  text: string;
}

// ── AI types ──────────────────────────────────────────────────────────────

export type AIProvider = "anthropic" | "openai" | "ollama";

export interface AIConfig {
  provider: AIProvider;
  /** API key. Not required for ollama (local). */
  apiKey: string;
  /** Model id. Provider-specific; user-editable. */
  model: string;
  /** Override for self-hosted/compatible endpoints (Ollama especially). */
  baseUrl?: string;
}

export interface AIAnalysisResult {
  text: string;
  provider: AIProvider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  ollama: "http://localhost:11434",
};

export const SYSTEM_PROMPT =
  "You are an expert debugging assistant. You are given a structured bug report " +
  "captured by TraceBug (console errors, network activity, reproduction steps, " +
  "environment). Analyze it and respond in concise markdown with exactly these " +
  "sections:\n\n" +
  "## Root cause\nThe single most likely cause, stated plainly.\n\n" +
  "## Evidence\nThe specific signals in the report that point to it (quote the " +
  "error/status/step).\n\n" +
  "## Where to look\nThe files, components, or endpoints a developer should " +
  "inspect first.\n\n" +
  "## Suggested fix\nA concrete fix, with a short code sketch when possible.\n\n" +
  "## Edge cases to test\n2-4 things to verify once the fix lands.\n\n" +
  "Be specific and grounded in the report — do not invent details it does not " +
  "contain. If the report lacks enough signal, say so and list what to capture next.";

// ── Host patterns (mirrors optional_host_permissions in manifest.base.json) ─

/** The optional host permission each provider call needs. */
export const PROVIDER_ORIGINS = {
  github: "https://api.github.com/*",
  linear: "https://api.linear.app/*",
  slack: "https://hooks.slack.com/*",
  anthropic: "https://api.anthropic.com/*",
  openai: "https://api.openai.com/*",
  ollama: "http://localhost/*",
  ollama127: "http://127.0.0.1/*",
} as const;

// ── Error mapping ─────────────────────────────────────────────────────────

/**
 * HTTP status → a sentence a non-developer can act on. `label` is the
 * provider's display name; `kind` picks the wording for the two shapes of
 * credential we deal with (a tracker token vs an LLM API key).
 */
export function friendlyStatus(
  status: number,
  label: string,
  kind: "tracker" | "llm" = "llm",
): string {
  const where = kind === "tracker" ? "token" : "API key";
  switch (status) {
    case 0:
      return `Could not reach ${label}. Check your connection${label === "Ollama" ? " and that Ollama is running." : "."}`;
    case 401:
      return `${label} rejected the ${where}. Re-create it and enter the new one in TraceBug settings.`;
    case 403:
      return `${label} denied access — the ${where} may be missing a scope, or you have hit a rate limit.`;
    case 404:
      return kind === "tracker"
        ? `${label} could not find that destination, or the ${where} cannot see it.`
        : `${label} could not find that endpoint or model.`;
    case 422:
      return `${label} could not accept this report (it failed validation).`;
    case 429:
      return `Rate limited by ${label} — wait a moment and retry.`;
    default:
      if (status >= 500) return `${label} is temporarily unavailable (${status}).`;
      return `${label} request failed (HTTP ${status}).`;
  }
}

/**
 * Turn anything thrown by a provider call into a plain sentence. Abort and
 * network failures surface as a `TypeError`/`DOMException` with an unhelpful
 * message ("Failed to fetch"), which is exactly what users report as "it just
 * says failed".
 */
export function mapProviderError(err: unknown, label: string): string {
  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string };
    if (e.name === "AbortError") return `${label} request was cancelled.`;
    // A bare "Failed to fetch"/"NetworkError" means DNS, offline, or a host
    // permission we were never granted — never a provider rejection, because
    // those arrive with a status.
    if (e.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(e.message || "")) {
      return `Could not reach ${label}. Check your connection, and that TraceBug has access to it in settings.`;
    }
    if (e.message) return e.message;
  }
  return `${label} request failed.`;
}

/** The union of response fields we read across providers. All optional:
 *  provider JSON is dynamic and only trusted after the checks at each site. */
interface ProviderResponse {
  message?: string | { content?: string };
  error?: { message?: string } | string;
  errors?: Array<{ message?: string }>;
  html_url?: string;
  number?: number;
  model?: string;
  data?: {
    issueCreate?: {
      success?: boolean;
      issue?: { url?: string; identifier?: string };
    };
  };
  // Anthropic (Messages API)
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string }>;
  // OpenAI (Chat Completions)
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  // Ollama (/api/chat)
  prompt_eval_count?: number;
  eval_count?: number;
}

function extractProviderError(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as ProviderResponse;
    if (typeof b.error === "string") return b.error;
    if (b.error && typeof b.error === "object" && b.error.message) return b.error.message;
    if (typeof b.message === "string") return b.message;
    if (Array.isArray(b.errors) && b.errors[0]?.message) return b.errors[0].message!;
  }
  return null;
}

async function parseJsonOrThrow(
  res: Response,
  label: string,
  kind: "tracker" | "llm",
): Promise<ProviderResponse> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new Error(friendlyStatus(res.status, label, kind));
    throw new Error(`${label} returned an unreadable response.`);
  }
  if (!res.ok) {
    // Lead with the friendly sentence; keep the provider's own words as a
    // suffix, because "Validation Failed: body is too long" is the actionable
    // half of a 422.
    const own = extractProviderError(body);
    const friendly = friendlyStatus(res.status, label, kind);
    throw new Error(own && own !== friendly ? `${friendly} (${own})` : friendly);
  }
  return body as ProviderResponse;
}

// ── GitHub (REST: create an issue) ─────────────────────────────────────────

export async function postGitHubIssue(
  config: GitHubConfig,
  content: IssueContent,
  signal?: AbortSignal,
): Promise<CreateIssueResult> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo || "")) {
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
      title: content.title,
      body: content.body,
      labels: config.labels && config.labels.length ? config.labels : undefined,
    }),
  });
  const data = await parseJsonOrThrow(res, "GitHub", "tracker");
  return { provider: "github", ok: true, url: data.html_url, ref: data.number ? `#${data.number}` : undefined };
}

// ── Linear (GraphQL: issueCreate) ──────────────────────────────────────────

export async function postLinearIssue(
  config: LinearConfig,
  content: IssueContent,
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
      variables: { input: { teamId: config.teamId, title: content.title, description: content.body } },
    }),
  });
  const data = await parseJsonOrThrow(res, "Linear", "tracker");
  // Linear answers 200 with an `errors` array for a rejected mutation.
  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(data.errors[0]?.message || "Linear rejected the request.");
  }
  const issue = data?.data?.issueCreate?.issue;
  if (!data?.data?.issueCreate?.success || !issue) {
    throw new Error("Linear did not create the issue.");
  }
  return { provider: "linear", ok: true, url: issue.url, ref: issue.identifier };
}

// ── Slack (incoming webhook) ───────────────────────────────────────────────

/**
 * `readResponse: false` (the default, and the only option in page-world SDK
 * mode) posts with `mode: "no-cors"`: Slack webhooks send no CORS headers, so
 * a page cannot read the reply and the content type must stay CORS-safelisted.
 * Success is reported optimistically with `opaque: true`.
 *
 * `readResponse: true` is the extension service-worker path. With host access
 * to hooks.slack.com the worker is not bound by page CORS, so it posts JSON
 * and reads the REAL status — Slack replies with the literal body "ok", or a
 * 4xx with a reason like "invalid_payload" / "no_service". That is what turns
 * the honest-but-useless "Sent to Slack (Slack doesn't confirm delivery)" into
 * a real result (PLAN.md Phase 6).
 */
export async function postSlackMessage(
  config: SlackConfig,
  content: SlackContent,
  signal?: AbortSignal,
  opts: { readResponse?: boolean } = {},
): Promise<CreateIssueResult> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(config.webhookUrl || "")) {
    throw new Error("Invalid Slack webhook URL (expected https://hooks.slack.com/…).");
  }
  if (!opts.readResponse) {
    await fetch(config.webhookUrl, {
      method: "POST",
      signal,
      mode: "no-cors",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "payload=" + encodeURIComponent(JSON.stringify({ text: content.text })),
    });
    // We can't read an opaque response — report success optimistically.
    return { provider: "slack", ok: true, opaque: true };
  }

  const res = await fetch(config.webhookUrl, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: content.text }),
  });
  const text = (await res.text().catch(() => "")).trim();
  if (!res.ok) {
    const friendly = friendlyStatus(res.status, "Slack", "tracker");
    // Slack's reasons are terse machine strings; show them, they are googleable.
    throw new Error(text ? `${friendly} (${text})` : friendly);
  }
  if (text && text !== "ok") throw new Error(`Slack rejected the message (${text}).`);
  return { provider: "slack", ok: true };
}

// ── LLM providers ─────────────────────────────────────────────────────────

/**
 * One entry point for all three LLM providers, so the service worker has a
 * single call to make. `prompt` is the already-built, already-sanitized user
 * content — see buildAnalysisPrompt() in src/ai/llm-client.ts.
 */
export async function callLLM(
  config: AIConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<AIAnalysisResult> {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URLS[config.provider] || "").replace(/\/+$/, "");
  switch (config.provider) {
    case "anthropic": return callAnthropic(config, baseUrl, prompt, signal);
    case "openai": return callOpenAI(config, baseUrl, prompt, signal);
    case "ollama": return callOllama(config, baseUrl, prompt, signal);
    default: throw new Error(`Unknown provider: ${String((config as AIConfig).provider)}`);
  }
}

async function callAnthropic(
  config: AIConfig,
  baseUrl: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<AIAnalysisResult> {
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      // Opt in to CORS from the browser — Anthropic gates direct browser
      // access behind this header. The key is the user's own (BYO-key).
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const data = await parseJsonOrThrow(res, "Anthropic", "llm");
  if (data.stop_reason === "refusal") {
    throw new Error("The model declined to analyze this report.");
  }
  const text = extractAnthropicText(data);
  if (!text) throw new Error("Anthropic returned an empty response.");
  return {
    text,
    provider: "anthropic",
    model: data.model || config.model,
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
      : undefined,
  };
}

function extractAnthropicText(data: { content?: Array<{ type?: string; text?: string }> }): string {
  if (!Array.isArray(data.content)) return "";
  return data.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function callOpenAI(
  config: AIConfig,
  baseUrl: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<AIAnalysisResult> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await parseJsonOrThrow(res, "OpenAI", "llm");
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("OpenAI returned an empty response.");
  return {
    text,
    provider: "openai",
    model: data.model || config.model,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined,
  };
}

async function callOllama(
  config: AIConfig,
  baseUrl: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<AIAnalysisResult> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await parseJsonOrThrow(res, "Ollama", "llm");
  const msg = data?.message;
  const text = String((msg && typeof msg === "object" ? msg.content : "") || "").trim();
  if (!text) throw new Error("Ollama returned an empty response.");
  return {
    text,
    provider: "ollama",
    model: data.model || config.model,
    usage: data.prompt_eval_count
      ? { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count }
      : undefined,
  };
}
