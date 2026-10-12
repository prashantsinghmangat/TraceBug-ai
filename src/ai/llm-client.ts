// ── BYO-key LLM analysis ──────────────────────────────────────────────────
// Runs LLM-powered root-cause analysis on a bug report using the USER'S OWN
// API key — Anthropic, OpenAI, or a local Ollama. The call goes directly from
// the browser to the provider and the report text is scrubbed of secret shapes
// before it leaves the page. In SDK (npm) mode the key lives in the app page's
// own localStorage; in EXTENSION mode it lives in chrome.storage.local and the
// background service worker makes the call, because the SDK runs in the host
// page's main world where the site under test could read it.
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
import { isExtensionMode, getIntegrationStatus } from "../ext-transport";
import { analyzeViaBridge } from "../ext-rpc";
import { callLLM } from "../providers/api";
import type { AIProvider, AIConfig, AIAnalysisResult } from "../providers/api";

// The wire types, the system prompt and the fetch adapters live in
// src/providers/api.ts, which is also bundled into the extension's service
// worker (Phase 2b). Re-exported here so this stays the SDK's public surface.
export type { AIProvider, AIConfig, AIAnalysisResult };

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

// ── Config store ──────────────────────────────────────────────────────────
// SDK (npm) mode: the app page's own localStorage, as before.
// EXTENSION mode: the key lives in chrome.storage.local and the background
// service worker makes the provider call — the SDK runs in the host page's main
// world, where the site under test could read anything held here. See
// src/ext-transport.ts and docs/launch/PLAN.md Phase 2.

export function getAIConfig(): AIConfig | null {
  // Never surface the key to page-world code in extension mode.
  if (isExtensionMode()) return null;
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
  // Extension mode: the key is entered in the extension's own options page,
  // which writes chrome.storage.local. Writing it here would put the secret
  // back into the host page's storage — the leak Phase 2 closes.
  if (isExtensionMode()) {
    console.warn("[TraceBug] Configure the AI key in TraceBug settings — it is not stored on the page.");
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore quota/permission errors */ }
}

export function clearAIConfig(): void {
  if (isExtensionMode()) {
    console.warn("[TraceBug] Clear the AI key in TraceBug settings.");
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
}

/**
 * Whether an AI provider is configured. SYNCHRONOUS in both modes — extension
 * mode answers from the non-secret boolean snapshot the content script pushes
 * in, so render paths never await storage.
 */
export function hasAIKey(): boolean {
  if (isExtensionMode()) return getIntegrationStatus().ai;
  const c = getAIConfig();
  return !!c && (c.provider === "ollama" || !!c.apiKey);
}

// ── Prompt construction ───────────────────────────────────────────────────

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
  const userContent = buildAnalysisPrompt(report);

  // Extension mode: the key is deliberately unreachable from the page world,
  // so the background service worker makes the call. We hand it the prompt
  // only — never a provider, model, base URL or key. First use on a site is
  // confirmed by the user and then remembered; after that the worker rate
  // limits the site to 10 requests a minute (Phase 2b).
  if (isExtensionMode()) {
    if (!hasAIKey()) throw new Error("No AI provider configured — open TraceBug settings to add a key.");
    return analyzeViaBridge(userContent);
  }

  const config = getAIConfig();
  if (!config) throw new Error("No AI provider configured. Add an API key first.");
  if (config.provider !== "ollama" && !config.apiKey) {
    throw new Error(`Add an API key for ${PROVIDER_LABELS[config.provider]}.`);
  }
  return callLLM(config, userContent, options.signal);
}
