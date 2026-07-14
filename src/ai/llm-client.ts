// ── BYO-key LLM analysis ──────────────────────────────────────────────────
// Runs LLM-powered root-cause analysis on a bug report using the USER'S OWN
// API key — Anthropic, OpenAI, or a local Ollama. The call goes directly from
// the browser to the provider; the key lives only in localStorage and the
// report text is scrubbed of secret shapes before it leaves the page.
//
// This is the privacy-preserving answer to competitors' cloud AI debuggers:
// TraceBug never sees the key, the prompt, or the response. Combined with the
// local heuristic hint and the local MCP server, it completes the "AI
// debugging that never phones home" story — the one position no metered,
// cloud-hosted competitor can copy.
//
// Provider-agnostic on purpose: each adapter is a thin fetch() shaped to that
// provider's wire format. No SDKs, no dependencies — the SDK ships zero-deps.

import type { BugReport } from "../types";
import { generateAIPrompt } from "../exporters/ai-prompt";
import { sanitizeTokenShapes } from "../sanitize/cloud-upload";

export type AIProvider = "anthropic" | "openai" | "ollama";

export interface AIConfig {
  provider: AIProvider;
  /** API key. Not required for ollama (local). */
  apiKey: string;
  /** Model id. Provider-specific; user-editable. */
  model: string;
  /** Base URL override (ollama, proxies, Azure-style gateways). */
  baseUrl?: string;
}

export interface AIAnalysisResult {
  text: string;
  provider: AIProvider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const STORAGE_KEY = "tracebug_ai_config";
// Legacy: earlier builds stored a bare Anthropic key under this key.
const LEGACY_KEY = "tracebug_ai_key";

export const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  ollama: "Ollama (local)",
};

// Sensible defaults. Model ids are user-editable in the config UI — these are
// just the starting point. Anthropic tiers per the current model lineup:
// haiku-4-5 (fast/cheap) · sonnet-4-6 (balanced, default) · opus-4-8 (max).
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
};

export const ANTHROPIC_MODEL_CHOICES = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest, cheapest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced (recommended)" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — most capable" },
];

const DEFAULT_BASE_URLS: Record<AIProvider, string> = {
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com",
  ollama: "http://localhost:11434",
};

// ── Config store (localStorage only — never leaves the browser) ───────────

export function getAIConfig(): AIConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<AIConfig>;
      if (c && c.provider && (c.provider === "ollama" || c.apiKey)) {
        return {
          provider: c.provider,
          apiKey: c.apiKey || "",
          model: c.model || DEFAULT_MODELS[c.provider],
          baseUrl: c.baseUrl,
        };
      }
    }
    // Migrate a legacy bare Anthropic key.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated: AIConfig = { provider: "anthropic", apiKey: legacy, model: DEFAULT_MODELS.anthropic };
      setAIConfig(migrated);
      return migrated;
    }
  } catch { /* localStorage blocked — treat as unconfigured */ }
  return null;
}

export function setAIConfig(config: AIConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore quota/permission errors */ }
}

export function clearAIConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

export function hasAIKey(): boolean {
  const c = getAIConfig();
  return !!c && (c.provider === "ollama" || !!c.apiKey);
}

// ── Prompt construction ───────────────────────────────────────────────────

const SYSTEM_PROMPT =
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

/** Build the (sanitized) user-content prompt sent to the LLM. */
export function buildAnalysisPrompt(report: BugReport): string {
  // Reuse the same structured prompt the "copy prompt" flow produces, minus its
  // trailing task block (the system prompt owns the task here).
  const prompt = generateAIPrompt(report, { includeTask: false });
  // Scrub token shapes that may have slipped into console/network snippets
  // before anything leaves the browser.
  return sanitizeTokenShapes(prompt);
}

// ── Public entry point ────────────────────────────────────────────────────

export async function runLLMAnalysis(
  report: BugReport,
  options: { signal?: AbortSignal } = {},
): Promise<AIAnalysisResult> {
  const config = getAIConfig();
  if (!config) throw new Error("No AI provider configured. Add an API key first.");
  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error(`Add an API key for ${PROVIDER_LABELS[config.provider]}.`);
  }

  const userContent = buildAnalysisPrompt(report);
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URLS[config.provider]).replace(/\/+$/, "");

  switch (config.provider) {
    case "anthropic":
      return callAnthropic(config, baseUrl, userContent, options.signal);
    case "openai":
      return callOpenAI(config, baseUrl, userContent, options.signal);
    case "ollama":
      return callOllama(config, baseUrl, userContent, options.signal);
    default:
      throw new Error(`Unknown provider: ${(config as AIConfig).provider}`);
  }
}

// ── Anthropic (Messages API, direct browser call) ─────────────────────────

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

  const data = await parseJsonOrThrow(res, "Anthropic");
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

// ── OpenAI (Chat Completions) ─────────────────────────────────────────────

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

  const data = await parseJsonOrThrow(res, "OpenAI");
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

// ── Ollama (local, no key, no network egress off-device) ──────────────────

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

  const data = await parseJsonOrThrow(res, "Ollama");
  const text = String(data?.message?.content || "").trim();
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

// ── Shared error handling ─────────────────────────────────────────────────

/** The union of response fields we actually read across the three providers.
 *  Everything is optional — provider JSON is dynamic and only trusted after
 *  the explicit checks at each call site. */
interface ProviderResponse {
  model?: string;
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
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

async function parseJsonOrThrow(res: Response, provider: string): Promise<ProviderResponse> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new Error(friendlyStatus(res.status, provider));
    throw new Error(`${provider} returned an unreadable response.`);
  }
  if (!res.ok) {
    const msg = extractProviderError(body) || friendlyStatus(res.status, provider);
    throw new Error(msg);
  }
  return body as ProviderResponse;
}

function extractProviderError(body: unknown): string | null {
  if (body && typeof body === "object") {
    const b = body as { error?: { message?: string } | string };
    if (typeof b.error === "string") return b.error;
    if (b.error?.message) return b.error.message;
  }
  return null;
}

function friendlyStatus(status: number, provider: string): string {
  if (status === 401 || status === 403) return `${provider}: invalid or unauthorized API key.`;
  if (status === 429) return `${provider}: rate limited — wait a moment and retry.`;
  if (status === 0) return `Could not reach ${provider}. Check your connection${provider === "Ollama" ? " and that Ollama is running." : "."}`;
  if (status >= 500) return `${provider} is temporarily unavailable (${status}).`;
  return `${provider} request failed (${status}).`;
}
