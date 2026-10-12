"use strict";
var TraceBugProviderAPI = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/providers/api.ts
  var api_exports = {};
  __export(api_exports, {
    DEFAULT_BASE_URLS: () => DEFAULT_BASE_URLS,
    PROVIDER_BODY_LIMITS: () => PROVIDER_BODY_LIMITS,
    PROVIDER_ORIGINS: () => PROVIDER_ORIGINS,
    SYSTEM_PROMPT: () => SYSTEM_PROMPT,
    callLLM: () => callLLM,
    capProviderBody: () => capProviderBody,
    friendlyStatus: () => friendlyStatus,
    mapProviderError: () => mapProviderError,
    postGitHubIssue: () => postGitHubIssue,
    postLinearIssue: () => postLinearIssue,
    postSlackMessage: () => postSlackMessage
  });
  var DEFAULT_BASE_URLS = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
    ollama: "http://localhost:11434"
  };
  var SYSTEM_PROMPT = "You are an expert debugging assistant. You are given a structured bug report captured by TraceBug (console errors, network activity, reproduction steps, environment). Analyze it and respond in concise markdown with exactly these sections:\n\n## Root cause\nThe single most likely cause, stated plainly.\n\n## Evidence\nThe specific signals in the report that point to it (quote the error/status/step).\n\n## Where to look\nThe files, components, or endpoints a developer should inspect first.\n\n## Suggested fix\nA concrete fix, with a short code sketch when possible.\n\n## Edge cases to test\n2-4 things to verify once the fix lands.\n\nBe specific and grounded in the report \u2014 do not invent details it does not contain. If the report lacks enough signal, say so and list what to capture next.";
  var PROVIDER_ORIGINS = {
    github: "https://api.github.com/*",
    linear: "https://api.linear.app/*",
    slack: "https://hooks.slack.com/*",
    anthropic: "https://api.anthropic.com/*",
    openai: "https://api.openai.com/*",
    ollama: "http://localhost/*",
    ollama127: "http://127.0.0.1/*"
  };
  var PROVIDER_BODY_LIMITS = {
    github: 65536,
    slack: 4e4,
    linear: 65536
  };
  function withCommas(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  var CUT_LOOKBACK = 1e3;
  var FENCE_RESERVE = 4;
  function openFenceCount(text) {
    const m = text.match(/^\s{0,3}```/gm);
    return m ? m.length : 0;
  }
  function capProviderBody(provider, text) {
    var _a;
    const limit = (_a = PROVIDER_BODY_LIMITS[provider]) != null ? _a : PROVIDER_BODY_LIMITS.github;
    const label = provider === "github" ? "GitHub" : provider === "linear" ? "Linear" : "Slack";
    const body = typeof text === "string" ? text : String(text != null ? text : "");
    if (body.length <= limit) return { text: body, limit };
    const notice = "\n\n---\n**Cut off here by TraceBug** \u2014 this report is longer than " + label + " accepts (" + withCommas(limit) + " characters). The rest is in the full TraceBug report: export the .html from the ticket and attach it.";
    const budget = Math.max(0, limit - notice.length - FENCE_RESERVE);
    let keep = body.slice(0, budget);
    const floor = Math.max(0, keep.length - CUT_LOOKBACK);
    const near = (i) => i > floor ? i : -1;
    const at = [near(keep.lastIndexOf("\n\n")), near(keep.lastIndexOf("\n")), near(keep.lastIndexOf(" "))].find((i) => i > 0);
    if (at !== void 0) keep = keep.slice(0, at);
    keep = keep.replace(/\s+$/, "");
    if (openFenceCount(keep) % 2 === 1) keep += "\n```";
    return {
      text: keep + notice,
      limit,
      cutFrom: body.length,
      warning: "Shortened to fit " + label + ": " + withCommas(body.length) + " characters became " + withCommas(keep.length + notice.length) + ", the most " + label + " accepts. The body below is exactly what will be sent."
    };
  }
  function friendlyStatus(status, label, kind = "llm") {
    const where = kind === "tracker" ? "token" : "API key";
    switch (status) {
      case 0:
        return `Could not reach ${label}. Check your connection${label === "Ollama" ? " and that Ollama is running." : "."}`;
      case 401:
        return `${label} rejected the ${where}. Re-create it and enter the new one in TraceBug settings.`;
      case 403:
        return `${label} denied access \u2014 the ${where} may be missing a scope, or you have hit a rate limit.`;
      case 404:
        return kind === "tracker" ? `${label} could not find that destination, or the ${where} cannot see it.` : `${label} could not find that endpoint or model.`;
      case 422:
        return `${label} could not accept this report (it failed validation).`;
      case 429:
        return `Rate limited by ${label} \u2014 wait a moment and retry.`;
      default:
        if (status >= 500) return `${label} is temporarily unavailable (${status}).`;
        return `${label} request failed (HTTP ${status}).`;
    }
  }
  function mapProviderError(err, label) {
    if (err && typeof err === "object") {
      const e = err;
      if (e.name === "AbortError") return `${label} request was cancelled.`;
      if (e.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(e.message || "")) {
        return `Could not reach ${label}. Check your connection, and that TraceBug has access to it in settings.`;
      }
      if (e.message) return e.message;
    }
    return `${label} request failed.`;
  }
  function extractProviderError(body) {
    var _a;
    if (body && typeof body === "object") {
      const b = body;
      if (typeof b.error === "string") return b.error;
      if (b.error && typeof b.error === "object" && b.error.message) return b.error.message;
      if (typeof b.message === "string") return b.message;
      if (Array.isArray(b.errors) && ((_a = b.errors[0]) == null ? void 0 : _a.message)) return b.errors[0].message;
    }
    return null;
  }
  async function parseJsonOrThrow(res, label, kind) {
    let body;
    try {
      body = await res.json();
    } catch (e) {
      if (!res.ok) throw new Error(friendlyStatus(res.status, label, kind));
      throw new Error(`${label} returned an unreadable response.`);
    }
    if (!res.ok) {
      const own = extractProviderError(body);
      const friendly = friendlyStatus(res.status, label, kind);
      throw new Error(own && own !== friendly ? `${friendly} (${own})` : friendly);
    }
    return body;
  }
  async function postGitHubIssue(config, content, signal) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo || "")) {
      throw new Error(`Invalid repo "${config.repo}". Expected "owner/repo".`);
    }
    const res = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${config.token}`
      },
      body: JSON.stringify({
        title: content.title,
        // Backstop: the extension already capped this before the confirmation
        // window, so this is a no-op there. It is the ONLY cap in SDK (npm) mode.
        body: capProviderBody("github", content.body).text,
        labels: config.labels && config.labels.length ? config.labels : void 0
      })
    });
    const data = await parseJsonOrThrow(res, "GitHub", "tracker");
    return { provider: "github", ok: true, url: data.html_url, ref: data.number ? `#${data.number}` : void 0 };
  }
  async function postLinearIssue(config, content, signal) {
    var _a, _b, _c, _d, _e;
    const query = "mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }";
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        // Linear personal API keys go in Authorization verbatim (no "Bearer").
        "authorization": config.apiKey
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            teamId: config.teamId,
            title: content.title,
            description: capProviderBody("linear", content.body).text
          }
        }
      })
    });
    const data = await parseJsonOrThrow(res, "Linear", "tracker");
    if (Array.isArray(data.errors) && data.errors.length) {
      throw new Error(((_a = data.errors[0]) == null ? void 0 : _a.message) || "Linear rejected the request.");
    }
    const issue = (_c = (_b = data == null ? void 0 : data.data) == null ? void 0 : _b.issueCreate) == null ? void 0 : _c.issue;
    if (!((_e = (_d = data == null ? void 0 : data.data) == null ? void 0 : _d.issueCreate) == null ? void 0 : _e.success) || !issue) {
      throw new Error("Linear did not create the issue.");
    }
    return { provider: "linear", ok: true, url: issue.url, ref: issue.identifier };
  }
  async function postSlackMessage(config, content, signal, opts = {}) {
    if (!/^https:\/\/hooks\.slack\.com\//.test(config.webhookUrl || "")) {
      throw new Error("Invalid Slack webhook URL (expected https://hooks.slack.com/\u2026).");
    }
    if (!opts.readResponse) {
      await fetch(config.webhookUrl, {
        method: "POST",
        signal,
        mode: "no-cors",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "payload=" + encodeURIComponent(JSON.stringify({ text: capProviderBody("slack", content.text).text }))
      });
      return { provider: "slack", ok: true, opaque: true };
    }
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: capProviderBody("slack", content.text).text })
    });
    const text = (await res.text().catch(() => "")).trim();
    if (!res.ok) {
      const friendly = friendlyStatus(res.status, "Slack", "tracker");
      throw new Error(text ? `${friendly} (${text})` : friendly);
    }
    if (text && text !== "ok") throw new Error(`Slack rejected the message (${text}).`);
    return { provider: "slack", ok: true };
  }
  async function callLLM(config, prompt, signal) {
    const baseUrl = (config.baseUrl || DEFAULT_BASE_URLS[config.provider] || "").replace(/\/+$/, "");
    switch (config.provider) {
      case "anthropic":
        return callAnthropic(config, baseUrl, prompt, signal);
      case "openai":
        return callOpenAI(config, baseUrl, prompt, signal);
      case "ollama":
        return callOllama(config, baseUrl, prompt, signal);
      default:
        throw new Error(`Unknown provider: ${String(config.provider)}`);
    }
  }
  async function callAnthropic(config, baseUrl, userContent, signal) {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        // Opt in to CORS from the browser — Anthropic gates direct browser
        // access behind this header. The key is the user's own (BYO-key).
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }]
      })
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
      usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : void 0
    };
  }
  function extractAnthropicText(data) {
    if (!Array.isArray(data.content)) return "";
    return data.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("").trim();
  }
  async function callOpenAI(config, baseUrl, userContent, signal) {
    var _a, _b, _c;
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        max_completion_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ]
      })
    });
    const data = await parseJsonOrThrow(res, "OpenAI", "llm");
    const text = String(((_c = (_b = (_a = data == null ? void 0 : data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) || "").trim();
    if (!text) throw new Error("OpenAI returned an empty response.");
    return {
      text,
      provider: "openai",
      model: data.model || config.model,
      usage: data.usage ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens } : void 0
    };
  }
  async function callOllama(config, baseUrl, userContent, signal) {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ]
      })
    });
    const data = await parseJsonOrThrow(res, "Ollama", "llm");
    const msg = data == null ? void 0 : data.message;
    const text = String((msg && typeof msg === "object" ? msg.content : "") || "").trim();
    if (!text) throw new Error("Ollama returned an empty response.");
    return {
      text,
      provider: "ollama",
      model: data.model || config.model,
      usage: data.prompt_eval_count ? { inputTokens: data.prompt_eval_count, outputTokens: data.eval_count } : void 0
    };
  }
  return __toCommonJS(api_exports);
})();
