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

  // src/providers/worker.ts
  var worker_exports = {};
  __export(worker_exports, {
    DEFAULT_BASE_URLS: () => DEFAULT_BASE_URLS,
    GITHUB_APP_INSTALL_URL: () => GITHUB_APP_INSTALL_URL,
    ISSUE_TRACKERS: () => ISSUE_TRACKERS,
    ISSUE_URL_HOSTS: () => ISSUE_URL_HOSTS,
    MAX_CONTAINERS: () => MAX_CONTAINERS,
    NotConnectedError: () => NotConnectedError,
    OAUTH_CLIENTS: () => OAUTH_CLIENTS,
    OAuthError: () => OAuthError,
    PROVIDER_BODY_LIMITS: () => PROVIDER_BODY_LIMITS,
    PROVIDER_ORIGINS: () => PROVIDER_ORIGINS,
    ProviderHttpError: () => ProviderHttpError,
    REFRESH_SKEW_MS: () => REFRESH_SKEW_MS,
    ReconnectNeededError: () => ReconnectNeededError,
    SYSTEM_PROMPT: () => SYSTEM_PROMPT,
    TODO_OWNER_CLIENT_ID: () => TODO_OWNER_CLIENT_ID,
    TRACKER_ADAPTERS: () => TRACKER_ADAPTERS,
    base64url: () => base64url,
    bodyWithMarker: () => bodyWithMarker,
    buildAuthorizeUrl: () => buildAuthorizeUrl,
    callLLM: () => callLLM,
    capProviderBody: () => capProviderBody,
    createPkcePair: () => createPkcePair,
    describeAuth: () => describeAuth,
    describeOAuthError: () => describeOAuthError,
    exchangeCode: () => exchangeCode,
    findFiledIssueWithRetry: () => findFiledIssueWithRetry,
    forgetOAuth: () => forgetOAuth,
    friendlyStatus: () => friendlyStatus,
    github: () => github,
    hasOAuthClient: () => hasOAuthClient,
    isSendId: () => isSendId,
    isTrustedIssueUrl: () => isTrustedIssueUrl,
    isUnclearFailure: () => isUnclearFailure,
    issueMarkerComment: () => issueMarkerComment,
    legacyContainer: () => legacyContainer,
    legacyToken: () => legacyToken,
    linear: () => linear,
    mapProviderError: () => mapProviderError,
    nextLink: () => nextLink,
    parseJsonOrThrow: () => parseJsonOrThrow,
    parseRedirect: () => parseRedirect,
    parseTokenResponse: () => parseTokenResponse,
    pkceChallenge: () => pkceChallenge,
    pollDeviceToken: () => pollDeviceToken,
    postGitHubIssue: () => postGitHubIssue,
    postLinearIssue: () => postLinearIssue,
    postSlackMessage: () => postSlackMessage,
    randomToken: () => randomToken,
    refreshTokens: () => refreshTokens,
    requestDeviceCode: () => requestDeviceCode,
    resolveAuth: () => resolveAuth,
    saveOAuth: () => saveOAuth,
    trackerAdapter: () => trackerAdapter,
    withTrackerAuth: () => withTrackerAuth
  });

  // src/providers/api.ts
  var SEND_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function isSendId(id) {
    return typeof id === "string" && SEND_ID_RE.test(id);
  }
  function issueMarkerComment(sendId) {
    return isSendId(sendId) ? `<!-- tracebug:${sendId} -->` : "";
  }
  function bodyWithMarker(provider, body, sendId) {
    var _a;
    const text = capProviderBody(provider, body).text;
    const mark = issueMarkerComment(sendId);
    if (!mark) return text;
    const limit = (_a = PROVIDER_BODY_LIMITS[provider]) != null ? _a : PROVIDER_BODY_LIMITS.github;
    const room = limit - mark.length - 2;
    return (text.length > room ? text.slice(0, room) : text) + "\n\n" + mark;
  }
  function isUnclearFailure(err) {
    if (!err || typeof err !== "object") return false;
    const e = err;
    if (typeof e.status === "number") return false;
    if (e.name === "ReconnectNeededError" || e.name === "NotConnectedError" || e.name === "ProviderHttpError") return false;
    if (e.name === "AbortError" || e.name === "TimeoutError" || e.name === "TypeError") return true;
    return /failed to fetch|networkerror|load failed|timed? ?out/i.test(e.message || "");
  }
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
      if (e.name === "TimeoutError") return `${label} didn't answer in time.`;
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
  var ProviderHttpError = class extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ProviderHttpError";
      this.status = status;
    }
  };
  async function parseJsonOrThrow(res, label, kind) {
    let body;
    try {
      body = await res.json();
    } catch (e) {
      if (!res.ok) throw new ProviderHttpError(friendlyStatus(res.status, label, kind), res.status);
      throw new Error(`${label} returned an unreadable response.`);
    }
    if (!res.ok) {
      const own = extractProviderError(body);
      const friendly = friendlyStatus(res.status, label, kind);
      throw new ProviderHttpError(own && own !== friendly ? `${friendly} (${own})` : friendly, res.status);
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
        body: bodyWithMarker("github", content.body, content.sendId),
        labels: config.labels && config.labels.length ? config.labels : void 0,
        assignees: config.assignees && config.assignees.length ? config.assignees : void 0,
        milestone: typeof config.milestone === "number" && config.milestone > 0 ? config.milestone : void 0
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
        // Linear personal API keys go in Authorization verbatim (no "Bearer");
        // OAuth access tokens do take it.
        "authorization": config.bearer ? `Bearer ${config.apiKey}` : config.apiKey
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            teamId: config.teamId,
            title: content.title,
            description: capProviderBody("linear", content.body).text,
            // Linear takes a client-made UUID v4 as the issue id, so a retry
            // can ask for it by id instead of filing it twice.
            id: isSendId(content.sendId) ? content.sendId : void 0
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

  // src/providers/oauth.ts
  var OAuthError = class extends Error {
    constructor(code, message, status) {
      super(message);
      this.name = "OAuthError";
      this.code = code;
      this.status = status;
    }
  };
  function base64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function randomToken(bytes = 32) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return base64url(buf);
  }
  async function pkceChallenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64url(new Uint8Array(digest));
  }
  async function createPkcePair() {
    const verifier = randomToken(32);
    return { verifier, challenge: await pkceChallenge(verifier) };
  }
  function buildAuthorizeUrl(spec, opts) {
    if (!spec.authorizeUrl) throw new OAuthError("unsupported", `${spec.label} has no sign-in page configured.`);
    const u = new URL(spec.authorizeUrl);
    const p = u.searchParams;
    p.set("response_type", "code");
    p.set("client_id", spec.clientId);
    p.set("redirect_uri", opts.redirectUri);
    p.set("state", opts.state);
    p.set("code_challenge", opts.challenge);
    p.set("code_challenge_method", "S256");
    if (spec.scope) p.set("scope", spec.scope);
    for (const [k, v] of Object.entries(spec.authorizeParams || {})) p.set(k, v);
    return u.toString();
  }
  function parseRedirect(redirectUrl, expectedState, label) {
    let u;
    try {
      u = new URL(redirectUrl);
    } catch (e) {
      throw new OAuthError("bad_redirect", `${label} sign-in returned an unreadable address.`);
    }
    const p = u.searchParams;
    const err = p.get("error");
    if (err) throw new OAuthError(err, describeOAuthError(err, label, p.get("error_description")));
    if (p.get("state") !== expectedState) {
      throw new OAuthError("state_mismatch", `${label} sign-in could not be verified. Try connecting again.`);
    }
    const code = p.get("code");
    if (!code) throw new OAuthError("no_code", `${label} sign-in did not return a code. Try connecting again.`);
    return code;
  }
  function parseTokenResponse(json, now, label) {
    const j = json && typeof json === "object" ? json : {};
    if (typeof j.error === "string") {
      throw new OAuthError(j.error, describeOAuthError(j.error, label, j.error_description));
    }
    const accessToken = typeof j.access_token === "string" ? j.access_token : "";
    if (!accessToken) throw new OAuthError("no_token", `${label} did not return a token.`);
    const secs = (v) => typeof v === "number" && v > 0 ? v : typeof v === "string" && +v > 0 ? +v : 0;
    const out = { accessToken };
    if (typeof j.refresh_token === "string" && j.refresh_token) out.refreshToken = j.refresh_token;
    if (secs(j.expires_in)) out.expiresAt = now + secs(j.expires_in) * 1e3;
    if (secs(j.refresh_token_expires_in)) out.refreshExpiresAt = now + secs(j.refresh_token_expires_in) * 1e3;
    if (typeof j.scope === "string") out.scope = j.scope;
    return out;
  }
  async function postForm(url, form, label, fetchFn, signal) {
    const res = await fetchFn(url, {
      method: "POST",
      signal,
      // GitHub answers form-encoded unless asked for JSON.
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString()
    });
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
    }
    if (!res.ok && !(json && typeof json.error === "string")) {
      throw new OAuthError(String(res.status), `${label} sign-in failed (HTTP ${res.status}).`, res.status);
    }
    return json;
  }
  async function exchangeCode(spec, opts, now, fetchFn = fetch, signal) {
    const json = await postForm(spec.tokenUrl, {
      grant_type: "authorization_code",
      client_id: spec.clientId,
      code: opts.code,
      code_verifier: opts.verifier,
      redirect_uri: opts.redirectUri
    }, spec.label, fetchFn, signal);
    return parseTokenResponse(json, now, spec.label);
  }
  async function refreshTokens(spec, refreshToken, now, fetchFn = fetch, signal) {
    const json = await postForm(spec.tokenUrl, {
      grant_type: "refresh_token",
      client_id: spec.clientId,
      refresh_token: refreshToken
    }, spec.label, fetchFn, signal);
    const next = parseTokenResponse(json, now, spec.label);
    if (!next.refreshToken) next.refreshToken = refreshToken;
    return next;
  }
  async function requestDeviceCode(spec, now, fetchFn = fetch, signal) {
    if (!spec.deviceCodeUrl) throw new OAuthError("unsupported", `${spec.label} has no device sign-in configured.`);
    const form = { client_id: spec.clientId };
    if (spec.scope) form.scope = spec.scope;
    const j = await postForm(spec.deviceCodeUrl, form, spec.label, fetchFn, signal) || {};
    if (typeof j.error === "string") {
      throw new OAuthError(j.error, describeOAuthError(j.error, spec.label, j.error_description));
    }
    if (typeof j.device_code !== "string" || typeof j.user_code !== "string" || typeof j.verification_uri !== "string") {
      throw new OAuthError("bad_response", `${spec.label} did not return a sign-in code.`);
    }
    return {
      deviceCode: j.device_code,
      userCode: j.user_code,
      verificationUri: j.verification_uri,
      interval: typeof j.interval === "number" && j.interval > 0 ? j.interval : 5,
      expiresAt: now + (typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 900) * 1e3
    };
  }
  async function pollDeviceToken(spec, code, now, fetchFn = fetch, signal) {
    if (now >= code.expiresAt) {
      throw new OAuthError("expired_token", describeOAuthError("expired_token", spec.label));
    }
    const j = await postForm(spec.tokenUrl, {
      client_id: spec.clientId,
      device_code: code.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    }, spec.label, fetchFn, signal) || {};
    if (j.error === "authorization_pending") return { status: "pending", interval: code.interval };
    if (j.error === "slow_down") {
      const asked = typeof j.interval === "number" && j.interval > 0 ? j.interval : 0;
      return { status: "pending", interval: Math.max(asked, code.interval + 5) };
    }
    return { status: "done", tokens: parseTokenResponse(j, now, spec.label) };
  }
  function describeOAuthError(code, label, vendorText) {
    switch (code) {
      case "access_denied":
        return `You declined access in ${label}. Click Connect to try again.`;
      case "expired_token":
        return `The ${label} sign-in code expired before it was entered. Click Connect to get a new one.`;
      case "invalid_grant":
        return `${label} no longer accepts this sign-in. Connect again.`;
      case "device_flow_disabled":
        return `${label} sign-in is not enabled for TraceBug's app yet. Use a token in TraceBug settings for now.`;
      case "incorrect_client_credentials":
      case "invalid_client":
      case "unauthorized_client":
        return `${label} did not recognise TraceBug's app. Use a token in TraceBug settings for now.`;
      default:
        return vendorText ? `${label} sign-in failed: ${vendorText}` : `${label} sign-in failed (${code}).`;
    }
  }

  // src/providers/auth-store.ts
  var ISSUE_TRACKERS = ["github", "linear"];
  var REFRESH_SKEW_MS = 60 * 1e3;
  var NotConnectedError = class extends Error {
    constructor(label) {
      super(`${label} is not connected \u2014 connect it in TraceBug, or add a token in settings.`);
      this.name = "NotConnectedError";
    }
  };
  var ReconnectNeededError = class extends Error {
    constructor(label) {
      super(`${label} needs you to reconnect \u2014 your sign-in expired or was revoked.`);
      this.name = "ReconnectNeededError";
    }
  };
  function legacyToken(tracker, i) {
    if (!i) return "";
    if (tracker === "github") return i.github && i.github.token || "";
    if (tracker === "linear") return i.linear && i.linear.apiKey || "";
    return "";
  }
  function legacyContainer(tracker, i) {
    if (!i) return "";
    if (tracker === "github") return i.github && i.github.repo || "";
    if (tracker === "linear") return i.linear && i.linear.teamId || "";
    return "";
  }
  var inflight = /* @__PURE__ */ new Map();
  async function markReconnect(store, tracker) {
    const map = await store.read();
    const cur = map[tracker];
    if (!cur) return;
    map[tracker] = { ...cur, needsReconnect: true };
    await store.write(map);
  }
  async function doRefresh(store, tracker, spec, now, fetchFn) {
    const running = inflight.get(tracker);
    if (running) return running;
    const p = (async () => {
      const map = await store.read();
      const cur = map[tracker];
      const rt = cur && cur.tokens.refreshToken;
      if (!cur || !rt || cur.tokens.refreshExpiresAt && cur.tokens.refreshExpiresAt <= now) {
        await markReconnect(store, tracker);
        throw new ReconnectNeededError(spec.label);
      }
      let next;
      try {
        next = await refreshTokens(spec, rt, now, fetchFn);
      } catch (err) {
        if (err instanceof OAuthError && (err.code === "invalid_grant" || err.code === "bad_refresh_token" || err.status === 401)) {
          await markReconnect(store, tracker);
          throw new ReconnectNeededError(spec.label);
        }
        throw err;
      }
      const again = await store.read();
      again[tracker] = { ...again[tracker] || cur, tokens: next, needsReconnect: false };
      await store.write(again);
      return next;
    })();
    inflight.set(tracker, p);
    try {
      return await p;
    } finally {
      inflight.delete(tracker);
    }
  }
  async function resolveAuth(ctx) {
    const now = (ctx.now || Date.now)();
    const map = await ctx.store.read();
    const o = map[ctx.tracker];
    const pasted = legacyToken(ctx.tracker, ctx.integrations);
    if (o && !o.needsReconnect) {
      const exp = o.tokens.expiresAt;
      if (!exp || exp - now > REFRESH_SKEW_MS) return { via: "oauth", token: o.tokens.accessToken, account: o.account };
      if (ctx.spec) {
        try {
          const t = await doRefresh(ctx.store, ctx.tracker, ctx.spec, now, ctx.fetchFn || fetch);
          return { via: "oauth", token: t.accessToken, account: o.account };
        } catch (err) {
          if (!(err instanceof ReconnectNeededError) || !pasted) throw err;
        }
      } else if (!pasted) {
        throw new ReconnectNeededError(ctx.label);
      }
    }
    if (pasted) return { via: "token", token: pasted };
    if (o) throw new ReconnectNeededError(ctx.label);
    throw new NotConnectedError(ctx.label);
  }
  async function withTrackerAuth(ctx, fn) {
    const auth = await resolveAuth(ctx);
    try {
      return await fn(auth);
    } catch (err) {
      if (auth.via !== "oauth" || statusOf(err) !== 401) throw err;
      if (!ctx.spec) {
        await markReconnect(ctx.store, ctx.tracker);
        throw new ReconnectNeededError(ctx.label);
      }
      const now = (ctx.now || Date.now)();
      const t = await doRefresh(ctx.store, ctx.tracker, ctx.spec, now, ctx.fetchFn || fetch);
      try {
        return await fn({ ...auth, token: t.accessToken });
      } catch (err2) {
        if (statusOf(err2) === 401) {
          await markReconnect(ctx.store, ctx.tracker);
          throw new ReconnectNeededError(ctx.label);
        }
        throw err2;
      }
    }
  }
  function statusOf(err) {
    const s = err && typeof err === "object" ? err.status : void 0;
    return typeof s === "number" ? s : void 0;
  }
  async function saveOAuth(store, tracker, tokens, account, now) {
    const map = await store.read();
    map[tracker] = { tokens, account, connectedAt: now };
    await store.write(map);
  }
  async function forgetOAuth(store, tracker) {
    const map = await store.read();
    const cur = map[tracker];
    delete map[tracker];
    await store.write(map);
    return cur;
  }
  function describeAuth(tracker, map, integrations) {
    const o = map[tracker];
    const pasted = !!legacyToken(tracker, integrations);
    if (o && !o.needsReconnect) return { connected: true, via: "oauth", account: o.account, needsReconnect: false };
    if (pasted) return { connected: true, via: "token", needsReconnect: !!o };
    return { connected: false, via: null, needsReconnect: !!o };
  }

  // src/providers/oauth-clients.ts
  var TODO_OWNER_CLIENT_ID = "TODO_OWNER_CLIENT_ID";
  var OAUTH_CLIENTS = {
    /** GitHub App "TraceBug Dev" (org tracebugdev), Device Flow on (Issues: R/W, Metadata: R). */
    github: "Iv23lidsU0w7Ezzc9qyb",
    /** Linear OAuth app; PKCE, scopes `read,write`. */
    linear: TODO_OWNER_CLIENT_ID,
    /** Microsoft Entra app registration, multi-tenant, Azure DevOps delegated permission. */
    ado: TODO_OWNER_CLIENT_ID,
    /** gitlab.com application, "Confidential" unticked, scope `api`. */
    gitlab: TODO_OWNER_CLIENT_ID
  };
  var GITHUB_APP_INSTALL_URL = "https://github.com/apps/tracebug-dev/installations/new";
  function hasOAuthClient(tracker) {
    const id = OAUTH_CLIENTS[tracker];
    return !!id && id !== TODO_OWNER_CLIENT_ID;
  }

  // src/providers/trackers.ts
  var MAX_CONTAINERS = 500;
  var MAX_LABELS = 300;
  var MAX_PEOPLE = 300;
  var MAX_INSTALLATIONS = 20;
  function asList(v) {
    if (Array.isArray(v)) return v.filter((s) => typeof s === "string" && s);
    return typeof v === "string" && v ? [v] : [];
  }
  var GH_API = "https://api.github.com";
  function ghHeaders(auth) {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${auth.token}`,
      "x-github-api-version": "2022-11-28"
    };
  }
  function nextLink(link) {
    if (!link) return null;
    for (const part of link.split(",")) {
      const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
      if (m) return m[1];
    }
    return null;
  }
  async function ghPages(auth, first, max, signal, key) {
    const out = [];
    let url = first;
    while (url && out.length < max) {
      if (!url.startsWith(GH_API + "/")) break;
      const res = await fetch(url, { headers: ghHeaders(auth), signal });
      const data = await parseJsonOrThrow(res, "GitHub", "tracker");
      const list = key && data && typeof data === "object" ? data[key] : data;
      if (!Array.isArray(list)) break;
      out.push(...list);
      url = nextLink(res.headers.get("link"));
    }
    return out.slice(0, max);
  }
  function toContainers(repos) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const r of repos) {
      if (typeof r.full_name !== "string" || r.archived || seen.has(r.full_name)) continue;
      seen.add(r.full_name);
      out.push({ id: r.full_name, label: r.full_name, detail: r.private ? "private" : void 0 });
    }
    return out;
  }
  async function optionalList(p) {
    try {
      return await p;
    } catch (err) {
      const s = err.status;
      if (s === 403 || s === 404) return [];
      throw err;
    }
  }
  var github = {
    id: "github",
    label: "GitHub",
    containerNoun: "Repository",
    apiHosts: ["https://api.github.com/*"],
    manageUrl: GITHUB_APP_INSTALL_URL,
    connect() {
      if (!hasOAuthClient("github")) return null;
      return {
        flow: "device",
        // A GitHub App takes no scopes: its permissions are set on the app.
        spec: {
          label: "GitHub",
          clientId: OAUTH_CLIENTS.github,
          deviceCodeUrl: "https://github.com/login/device/code",
          tokenUrl: "https://github.com/login/oauth/access_token"
        },
        hosts: ["https://github.com/*", "https://api.github.com/*"]
      };
    },
    async whoAmI(auth, signal) {
      const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(auth), signal });
      const d = await parseJsonOrThrow(res, "GitHub", "tracker");
      return d.login || "";
    },
    async listContainers(auth, signal) {
      if (auth.via === "oauth") {
        const installs = await ghPages(
          auth,
          `${GH_API}/user/installations?per_page=100`,
          MAX_INSTALLATIONS,
          signal,
          "installations"
        );
        const repos = [];
        for (const inst of installs) {
          if (typeof inst.id !== "number" || repos.length >= MAX_CONTAINERS) continue;
          repos.push(...await ghPages(
            auth,
            `${GH_API}/user/installations/${inst.id}/repositories?per_page=100`,
            MAX_CONTAINERS - repos.length,
            signal,
            "repositories"
          ));
        }
        return toContainers(repos);
      }
      return toContainers(await ghPages(
        auth,
        `${GH_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
        MAX_CONTAINERS,
        signal
      ));
    },
    async listFields(auth, container, signal) {
      if (!/^[\w.-]+\/[\w.-]+$/.test(container)) return [];
      const base = `${GH_API}/repos/${container}`;
      const [labels, people, milestones, repo] = await Promise.all([
        ghPages(auth, `${base}/labels?per_page=100`, MAX_LABELS, signal),
        optionalList(ghPages(auth, `${base}/assignees?per_page=100`, MAX_PEOPLE, signal)),
        optionalList(ghPages(
          auth,
          `${base}/milestones?state=open&per_page=100`,
          MAX_LABELS,
          signal
        )),
        // Only for its `permissions`: whether the warning below applies.
        fetch(base, { headers: ghHeaders(auth), signal }).then((r) => r.ok ? r.json() : null).catch(() => null)
      ]);
      const fields = [{
        key: "labels",
        label: "Labels",
        kind: "multi",
        options: labels.filter((l) => typeof l.name === "string").map((l) => ({ id: l.name, label: l.name }))
      }];
      if (people.length) {
        fields.push({
          key: "assignee",
          label: "Assignee",
          kind: "single",
          options: people.filter((p) => typeof p.login === "string").map((p) => ({ id: p.login, label: p.login }))
        });
      }
      if (milestones.length) {
        fields.push({
          key: "milestone",
          label: "Milestone",
          kind: "single",
          options: milestones.filter((m) => typeof m.number === "number").map((m) => ({ id: String(m.number), label: m.title || `#${m.number}` }))
        });
      }
      if (repo && repo.permissions && repo.permissions.push === false) {
        fields[fields.length - 1].note = "You can't push to this repository, so GitHub will drop labels, assignees and milestones.";
      }
      return fields;
    },
    async createIssue(auth, container, values, content, signal) {
      const milestone = Number(asList(values.milestone)[0]);
      return postGitHubIssue({
        token: auth.token,
        repo: container,
        labels: asList(values.labels),
        assignees: asList(values.assignee).slice(0, 1),
        milestone: Number.isInteger(milestone) && milestone > 0 ? milestone : void 0
      }, content, signal);
    },
    async findFiledIssue(auth, container, sendId, since, signal) {
      const mark = issueMarkerComment(sendId);
      if (!mark || !/^[\w.-]+\/[\w.-]+$/.test(container)) return null;
      const login = await github.whoAmI(auth, signal);
      if (!login) return null;
      const after = new Date(Math.max(0, since - 6e4)).toISOString();
      const res = await fetch(
        `${GH_API}/repos/${container}/issues?creator=${encodeURIComponent(login)}&since=${encodeURIComponent(after)}&state=all&sort=created&direction=desc&per_page=100`,
        { headers: ghHeaders(auth), signal }
      );
      const list = await parseJsonOrThrow(res, "GitHub", "tracker");
      if (!Array.isArray(list)) return null;
      const hit = list.find((i) => typeof i.body === "string" && i.body.includes(mark));
      if (!hit || typeof hit.html_url !== "string") return null;
      return { provider: "github", ok: true, url: hit.html_url, ref: hit.number ? `#${hit.number}` : void 0 };
    }
  };
  function linearAuthHeader(auth) {
    return auth.via === "oauth" ? `Bearer ${auth.token}` : auth.token;
  }
  async function linearQuery(auth, query, signal) {
    var _a;
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: linearAuthHeader(auth) },
      body: JSON.stringify({ query })
    });
    const data = await parseJsonOrThrow(res, "Linear", "tracker");
    if (Array.isArray(data.errors) && data.errors.length) {
      throw new Error(((_a = data.errors[0]) == null ? void 0 : _a.message) || "Linear rejected the request.");
    }
    return data.data || {};
  }
  var linear = {
    id: "linear",
    label: "Linear",
    containerNoun: "Team",
    apiHosts: ["https://api.linear.app/*"],
    connect() {
      if (!hasOAuthClient("linear")) return null;
      return {
        flow: "pkce",
        spec: {
          label: "Linear",
          clientId: OAUTH_CLIENTS.linear,
          authorizeUrl: "https://linear.app/oauth/authorize",
          tokenUrl: "https://api.linear.app/oauth/token",
          scope: "read,write"
        },
        hosts: ["https://api.linear.app/*"]
      };
    },
    async whoAmI(auth, signal) {
      const d = await linearQuery(auth, "query { viewer { name email } }", signal);
      return d.viewer && (d.viewer.email || d.viewer.name) || "";
    },
    async listContainers(auth, signal) {
      const d = await linearQuery(
        auth,
        "query { teams(first: 250) { nodes { id key name } } }",
        signal
      );
      return (d.teams && d.teams.nodes || []).filter((t) => typeof t.id === "string").map((t) => ({ id: t.id, label: t.name || t.key || t.id, detail: t.key }));
    },
    // Labels, assignee, priority and project arrive in Phase 3.
    async listFields() {
      return [];
    },
    async createIssue(auth, container, _values, content, signal) {
      return postLinearIssue(
        { apiKey: auth.token, teamId: container, bearer: auth.via === "oauth" },
        { title: content.title, body: capProviderBody("linear", content.body).text, sendId: content.sendId },
        signal
      );
    },
    async findFiledIssue(auth, _container, sendId, _since, signal) {
      if (!isSendId(sendId)) return null;
      try {
        const d = await linearQuery(
          auth,
          `{ issue(id: "${sendId}") { identifier url } }`,
          signal
        );
        const i = d.issue;
        return i && typeof i.url === "string" ? { provider: "linear", ok: true, url: i.url, ref: i.identifier } : null;
      } catch (err) {
        if (!err.status && /not found/i.test(err.message || "")) return null;
        throw err;
      }
    }
  };
  async function findFiledIssueWithRetry(adapter, auth, container, sendId, since, signal, wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
    if (!adapter.findFiledIssue) return null;
    const first = await adapter.findFiledIssue(auth, container, sendId, since, signal);
    if (first) return first;
    await wait(2e3);
    return adapter.findFiledIssue(auth, container, sendId, since, signal);
  }
  var TRACKER_ADAPTERS = { github, linear };
  function trackerAdapter(id) {
    return Object.prototype.hasOwnProperty.call(TRACKER_ADAPTERS, id) ? TRACKER_ADAPTERS[id] : null;
  }
  var ISSUE_URL_HOSTS = {
    github: ["github.com"],
    linear: ["linear.app"]
  };
  function isTrustedIssueUrl(tracker, url) {
    if (typeof url !== "string") return false;
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return false;
    }
    if (u.protocol !== "https:") return false;
    return (ISSUE_URL_HOSTS[tracker] || []).some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  }
  return __toCommonJS(worker_exports);
})();
