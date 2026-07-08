# AI Debugger — BYO-Key LLM Analysis

TraceBug can run LLM-powered root-cause analysis on a bug report using **your own API key** — Anthropic, OpenAI, or a local Ollama. The call goes **directly from the browser to the provider**; TraceBug never sees your key, your prompt, or the response.

This is the privacy-preserving counterpart to competitors' cloud AI debuggers. Combined with the [local heuristic hint](bug-reporting.md) and the [local MCP server](mcp.md), it completes the story: **AI debugging that never phones home.** No metered credits, no vendor cloud in the path.

## Setup

1. Open a report in the Quick Bug modal and go to the **AI** tab.
2. Click **Configure API key**.
3. Pick a provider, paste your key (not needed for Ollama), optionally change the model, and **Save**.

The key is stored only in this browser's `localStorage` under `tracebug_ai_config`. Removing it (**Change key → Remove key**) deletes it.

## Providers & models

| Provider | Models | Notes |
|---|---|---|
| **Anthropic** | `claude-haiku-4-5` (fast/cheap), `claude-sonnet-4-6` (balanced, default), `claude-opus-4-8` (most capable) | Called via the Messages API with the browser direct-access header. |
| **OpenAI** | any chat model, e.g. `gpt-4o`, `gpt-4o-mini` | Chat Completions API. |
| **Ollama** | any local tag, e.g. `llama3.1` | Runs entirely on your machine. Start Ollama with browser CORS allowed (`OLLAMA_ORIGINS=*`). |

The model field is free-text — put whatever your key/host supports.

## What gets sent

Clicking **Generate AI analysis** sends the same structured prompt the "copy prompt" flow produces (title, summary, environment, root-cause hint, repro steps, console errors, network failures) — **after** it's scrubbed of secret token shapes (JWTs, Bearer tokens, `sk-…` keys, etc.) by the same sanitizer used before any cloud share. Screenshots and video are never sent.

The model is asked to return concise markdown with five sections: **Root cause**, **Evidence**, **Where to look**, **Suggested fix** (with a code sketch), and **Edge cases to test**.

## Privacy properties

- **Direct browser → provider.** No TraceBug backend is involved; the request never touches our servers.
- **Key stays local.** It lives in `localStorage`, is sent only in the request to the provider you chose, and is removable in one click.
- **Prompt is scrubbed.** Token shapes are redacted before the prompt leaves the page.
- **You pay the provider directly.** No TraceBug metering, no per-analysis credits.

## Programmatic use (SDK)

```ts
import { setAIConfig, runLLMAnalysis, generateReport } from "tracebug-sdk";

setAIConfig({ provider: "anthropic", apiKey: "sk-ant-…", model: "claude-sonnet-4-6" });

const report = generateReport();
const { text, model, usage } = await runLLMAnalysis(report);
console.log(text); // markdown analysis
```

`runLLMAnalysis(report, { signal })` accepts an `AbortSignal`. `buildAnalysisPrompt(report)` returns the scrubbed prompt string if you want to send it yourself.
