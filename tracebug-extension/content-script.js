// ── TraceBug Extension — Content Script ──────────────────────────────────────
// Bridge between extension popup/background and the page-context SDK.
// Does NOT inject <script> tags (CSP blocks that).
// SDK injection is handled by background.js via chrome.scripting.executeScript.
//
// All chrome.runtime.sendMessage calls go through safeSendMessage() which
// swallows the "Extension context invalidated" error that fires after the
// extension is reloaded — without it, the page console gets a noisy
// uncaught error every time the dev reloads TraceBug while a page that has
// the old content script is still open.
//
// Idempotency: chrome.scripting.executeScript can re-run this file in the
// same isolated world (page reload + re-inject, hash navigation, etc.).
// Re-running top-level `const` declarations throws SyntaxError, so we guard
// the whole script and skip on re-injection. Everything real lives inside the
// IIFE below, so only this `if` and the marker are ever evaluated twice.
//
// Phase 3 — the marker is a LIVENESS PROBE, not a boolean. An orphaned tab
// (one open across an extension update/reload/disable) keeps the previous
// instance's content script in the isolated world, flag and all. A boolean
// flag therefore made re-injection a silent no-op: the worker injected, this
// file bailed at the guard, and the action did nothing — exactly the failure
// Phase 3 exists to kill. The probe closes over the PREVIOUS instance's
// `chrome`, so it answers false the moment that instance dies, and the fresh
// injection runs. A pre-1.11 content script left `true` here, which is not a
// function and so is also correctly treated as dead.
// ─────────────────────────────────────────────────────────────────────────────

if (!(typeof window.__TRACEBUG_CS_LOADED__ === "function" && window.__TRACEBUG_CS_LOADED__())) {
  window.__TRACEBUG_CS_LOADED__ = function () {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  };
  (function tracebugContentScriptMain() {

/**
 * True when the extension's runtime context is still attached to this content
 * script. Becomes false after the extension is reloaded/updated/disabled.
 * `chrome.runtime.id` reads as undefined on an invalidated context, so we use
 * it as a synchronous probe before each call.
 */
function isExtAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

/**
 * Wrapper around chrome.runtime.sendMessage that:
 *   - Bails out early if the context is gone (no synchronous throw).
 *   - Swallows the async "Extension context invalidated" rejection.
 *   - Reports a null result via the callback if invocation failed so the
 *     caller's logic still runs.
 */
function safeSendMessage(msg, cb) {
  if (!isExtAlive()) { if (cb) try { cb(null); } catch (e) {} return; }
  try {
    chrome.runtime.sendMessage(msg, function (response) {
      // Read lastError defensively — accessing it suppresses the
      // unchecked-runtime-error console warning.
      var _ = chrome.runtime.lastError;
      if (cb) try { cb(response); } catch (e) {}
    });
  } catch (err) {
    if (cb) try { cb(null); } catch (e) {}
  }
}

/**
 * Top-level error trap. If anything inside this content script throws after
 * the runtime context is invalidated, swallow it — the page should never
 * see an uncaught TraceBug error.
 */
/**
 * Dispatch a CustomEvent whose `detail` the PAGE can actually read.
 * Firefox isolates content-script objects behind Xray wrappers: a detail
 * object created here throws "Permission denied to access property ..."
 * the moment page code touches it. cloneInto() (Firefox-only) clones the
 * object into the page compartment; Chrome structurally shares the object,
 * so the raw detail is fine there and cloneInto simply doesn't exist.
 */
function dispatchToPage(name, detail) {
  var safeDetail = detail;
  try {
    if (typeof cloneInto === "function") safeDetail = cloneInto(detail, window);
  } catch (e) { /* fall back to the raw object (Chrome path) */ }
  try {
    window.dispatchEvent(new CustomEvent(name, { detail: safeDetail }));
  } catch (e) {}
}

function safeRun(fn) {
  try { return fn(); } catch (err) {
    // Only log if the message looks unexpected. The invalidated-context
    // error is normal during dev (extension reload) so we drop it silently.
    var msg = (err && err.message) || String(err);
    if (!/Extension context invalidated|Receiving end does not exist/i.test(msg)) {
      try { console.warn("[TraceBug]", msg); } catch (e) {}
    }
  }
}

// ── CSP-proof player URL hand-off ───────────────────────────────────────────
// The ticket modal's inline <video> is governed by the HOST page's CSP, which
// on strict sites (GitHub, HN) blocks blob: media. player.html is an extension
// page (extension CSP → always plays), embedded as an iframe. The page world
// has no chrome.* access, so we publish the URL on <html data-tb-player-url>
// where the SDK can read it synchronously whenever the modal renders.
safeRun(function () {
  if (isExtAlive() && document.documentElement) {
    document.documentElement.setAttribute(
      "data-tb-player-url",
      chrome.runtime.getURL("player.html")
    );
  }
});

// ── Redaction-rules hand-off ────────────────────────────────────────────────
// User-configured redact rules (popup → chrome.storage.sync) reach the
// page-world SDK the same way as the player URL: published on <html
// data-tb-redact>, read by tracebug-init.js at TraceBug.init() time. The
// page world has no chrome.* access, so this bridge is required.
safeRun(function () {
  if (!isExtAlive() || !document.documentElement) return;

  function publishRedactRules(rules) {
    try {
      var hasRules = rules && ((rules.fields || []).length || (rules.patterns || []).length);
      if (hasRules) {
        document.documentElement.setAttribute("data-tb-redact", JSON.stringify(rules));
      } else {
        document.documentElement.removeAttribute("data-tb-redact");
      }
    } catch (e) {}
  }

  try {
    chrome.storage.sync.get("tracebug_redact", function (r) {
      var _ = chrome.runtime.lastError;
      publishRedactRules(r && r.tracebug_redact);
    });
    // Live updates: tracebug-init.js observes the attribute, so a change here
    // reaches an already-initialized SDK without a reload.
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "sync" && changes.tracebug_redact) {
        publishRedactRules(changes.tracebug_redact.newValue);
      }
    });
  } catch (e) {}
});

// ── Integration status hand-off (NON-SECRET) ────────────────────────────────
// Phase 2: integration tokens and the AI key live in chrome.storage.local, NOT
// in the host page, because the page-world SDK shares storage with the site
// under test. But the SDK still renders "GitHub is configured" states
// synchronously, so we publish a NON-SECRET snapshot on <html data-tb-caps>
// — same bridge shape as data-tb-redact above. Booleans, plus the one short
// string the browser owns (the bound keyboard shortcut). Never publish a
// token here: the attribute is readable by every script on the page.
var TB_INT_KEY = "tb_integrations_v1";
var TB_AI_KEY = "tb_ai_config_v1";

safeRun(function () {
  if (!isExtAlive() || !document.documentElement) return;

  function toStatus(integrations, ai, workerAnswer) {
    var hostAccess = workerAnswer && workerAnswer.granted;
    var shortcut = (workerAnswer && workerAnswer.shortcut) || "";
    var i = integrations || {};
    var a = ai || null;
    return {
      // Can TraceBug keep capturing after the user navigates to another
      // origin? Phase 1 made <all_urls> optional, so this is now a real
      // question. The permissions API is not exposed to content scripts
      // either, so the worker answers it (TB_HOST_ACCESS). Left undefined
      // when we could not ask, so the SDK stays quiet rather than guessing.
      hostAccess: typeof hostAccess === "boolean" ? hostAccess : undefined,
      // The keyboard shortcut the BROWSER has bound to TraceBug's command, or
      // "" when the user has none. Not a secret, and the only non-boolean
      // here: no UI may hardcode the key, because the user can rebind it, and
      // the SDK needs to know when the browser owns Ctrl+Shift+B so one press
      // does not fire both the command and the in-page handler.
      shortcut: typeof shortcut === "string" ? shortcut : "",
      github: !!(i.github && i.github.token && i.github.repo),
      linear: !!(i.linear && i.linear.apiKey && i.linear.teamId),
      slack: !!(i.slack && i.slack.webhookUrl),
      // Ollama is local and needs no key, so "configured" means a provider is
      // chosen and either it's ollama or a key is present.
      ai: !!(a && a.provider && (a.provider === "ollama" || a.apiKey)),
    };
  }

  function publishStatus(status) {
    try {
      document.documentElement.setAttribute("data-tb-caps", JSON.stringify(status));
    } catch (e) {}
  }

  function readAndPublish() {
    try {
      chrome.storage.local.get([TB_INT_KEY, TB_AI_KEY], function (r) {
        var _ = chrome.runtime.lastError;
        var ints = r && r[TB_INT_KEY];
        var ai = r && r[TB_AI_KEY];
        try {
          chrome.runtime.sendMessage({ type: "TB_HOST_ACCESS" }, function (res) {
            var _e = chrome.runtime.lastError;
            publishStatus(toStatus(ints, ai, res));
          });
        } catch (e2) {
          publishStatus(toStatus(ints, ai, undefined));
        }
      });
    } catch (e) {}
  }

  readAndPublish();

  // The worker tells us when <all_urls> is granted or revoked, so a running
  // SDK stops showing the "this page only" hint the moment access is allowed.
  try {
    chrome.runtime.onMessage.addListener(function (message) {
      if (message && message.type === "TB_HOST_ACCESS_CHANGED") readAndPublish();
    });
  } catch (e) {}

  // Live updates: a token saved in the options page reaches an already-running
  // SDK without a reload (tracebug-init.js observes the attribute).
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "local" && (changes[TB_INT_KEY] || changes[TB_AI_KEY])) readAndPublish();
    });
  } catch (e) {}
});

// ── One-time migration of page-stored secrets ───────────────────────────────
// Before 1.11 the SDK wrote tokens into the HOST PAGE's localStorage, where any
// script on that site could read them. Migration is lazy: whenever this script
// runs on an origin that still holds them, move them into extension storage and
// delete the page copy. The decision (including the keep-existing conflict rule
// and the user notice) lives in secret-migration.js so it can be unit-tested;
// this block is only the I/O.
safeRun(function () {
  if (!isExtAlive()) return;

  var M = globalThis.TraceBugSecretMigration;
  if (!M) return; // secret-migration.js failed to inject — skip, never guess

  var LEGACY_INT = "tracebug_integrations";
  var LEGACY_AI = "tracebug_ai_config";
  var LEGACY_AI_BARE = "tracebug_ai_key";

  function readPage(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function dropPage(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  var pageInt = readPage(LEGACY_INT);
  var pageAi = readPage(LEGACY_AI);
  var pageAiLegacy = null;
  try {
    var bare = localStorage.getItem(LEGACY_AI_BARE);
    if (bare) pageAiLegacy = { provider: "anthropic", apiKey: bare, model: "" };
  } catch (e) {}

  if (!pageInt && !pageAi && !pageAiLegacy) return;

  var site = "this site";
  try { site = location.hostname || "this site"; } catch (e) {}

  try {
    chrome.storage.local.get([M.INT_KEY, M.AI_KEY, M.NOTICE_KEY], function (stored) {
      var _ = chrome.runtime.lastError;
      var plan = M.planSecretMigration(pageInt, pageAi, pageAiLegacy, stored || {}, site);

      // Delete the page copy only AFTER the write resolves, so a failed write
      // can never destroy the user's only copy of a token.
      var finish = function () {
        if (!plan.removeFromPage) return;
        if (pageInt) dropPage(LEGACY_INT);
        if (pageAi) dropPage(LEGACY_AI);
        if (pageAiLegacy) dropPage(LEGACY_AI_BARE);
      };

      if (Object.keys(plan.writes).length) {
        chrome.storage.local.set(plan.writes, function () {
          if (!chrome.runtime.lastError) finish();
        });
      } else {
        // Nothing to write: extension storage already had everything, so the
        // page copies are purely redundant and must still go.
        finish();
      }
    });
  } catch (e) {}
});

// ── Open the extension's settings (options) page ────────────────────────────
// Content scripts cannot call chrome.runtime.openOptionsPage(), so the
// page-world "Open TraceBug settings" button dispatches this event and the
// background worker opens the page.
window.addEventListener("tracebug-open-settings", () => safeRun(() => {
  safeSendMessage({ type: "TB_OPEN_OPTIONS" }, function () {});
}));

// Same destination, but landing directly on the mic card and asking for the
// permission immediately — see options.js's "#mic" handling. Needs its own
// message because chrome.runtime.openOptionsPage() (TB_OPEN_OPTIONS above)
// has no way to carry a hash fragment through to the opened page.
window.addEventListener("tracebug-open-mic-settings", () => safeRun(() => {
  safeSendMessage({ type: "TB_OPEN_OPTIONS_MIC" }, function () {});
}));

// ── Listen for SDK requesting a screenshot (toolbar camera button) ──────────
// The SDK dispatches this event when it detects it's in an extension context.
// We route it to background.js which calls chrome.tabs.captureVisibleTab,
// then send the result back to the page via another CustomEvent.
window.addEventListener("tracebug-request-screenshot", () => safeRun(() => {
  safeSendMessage({ type: "CAPTURE_SCREENSHOT" }, (result) => {
    dispatchToPage("tracebug-ext-screenshot-result", { dataUrl: (result && result.dataUrl) || null });
  });
}));

// ── Turn-off bridge ─────────────────────────────────────────────────────────
// The floating toolbar's ✕ ("Turn off TraceBug") dispatches this; tell the
// background to stop re-injecting on navigation for this tab.
window.addEventListener("tracebug-disable-tab", () => safeRun(() => {
  safeSendMessage({ type: "TB_DISABLE_TAB" }, () => {});
}));

// ── Recording RPC bridge ───────────────────────────────────────────────────
// ── Recording dataUrl transport ──────────────────────────────────────────
// Background writes the recording into chrome.storage.local (it has the
// API; offscreen documents don't always). Content scripts also have
// chrome.storage access via the `storage` permission, so we read here
// directly and avoid bouncing the multi-MB dataUrl through a second IPC
// round-trip. The page-side has no chrome.* access so we hand the value
// over via CustomEvent (no size limit, in-process).
const REC_DATA_KEY = "tb_rec_data_v2";

function fetchDataUrlFromStorage(cb) {
  if (!isExtAlive()) { cb(null); return; }
  // Try direct chrome.storage.local first — content scripts usually have it.
  if (chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(REC_DATA_KEY, (data) => {
        try { void chrome.runtime.lastError; } catch (e) {}
        const dataUrl = data && data[REC_DATA_KEY];
        if (dataUrl && typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
          cb(dataUrl);
        } else {
          readViaBackground(cb);
        }
      });
      return;
    } catch (e) { /* fall through to background read */ }
  }
  readViaBackground(cb);
}

function readViaBackground(cb) {
  safeSendMessage({ type: "tb:rec:persist-read", _toBackground: true }, (res) => {
    if (res && res.ok && typeof res.dataUrl === "string" && res.dataUrl.startsWith("data:")) {
      cb(res.dataUrl);
    } else {
      cb(null);
    }
  });
}

// Re-attaches the dataUrl from storage onto a recording object that
// carries the `_viaStorage` marker. Calls cb(recording) once done.
function reattachDataUrl(rec, cb) {
  if (!rec || !rec._viaStorage) { cb(rec); return; }
  fetchDataUrlFromStorage((dataUrl) => {
    if (dataUrl) rec.dataUrl = dataUrl;
    delete rec._viaStorage;
    cb(rec);
  });
}

// Page-context video-recorder dispatches `tracebug-rec-request` with an id
// + type + data. We forward to background.js, which routes to the offscreen
// document. The response comes back as `tracebug-rec-response` with the same
// id. Page resolves the matching pending promise.
// SECURITY: the page controls e.detail — only these recording verbs may cross
// into the privileged background. Without this allowlist, any page script
// could relay e.g. CAPTURE_SCREENSHOT and read the tab's pixels back through
// the response event, bypassing the getDisplayMedia consent prompt.
const REC_RPC_TYPES = new Set([
  "tb:rec:start", "tb:rec:stop", "tb:rec:capture",
  "tb:rec:comment", "tb:rec:status", "tb:rec:last-recording",
  // Capture ownership (1.11.1). These three carry no secret and no
  // destination: the page asks whether ITS OWN tab is still capturing, and
  // reports its own origin. The worker answers for sender.tab.id only, so a
  // page cannot ask about, start or stop a capture on any other tab.
  "tb:capture:status", "tb:capture:started", "tb:capture:stopped",
]);

window.addEventListener("tracebug-rec-request", (e) => safeRun(() => {
  const { id, type, data } = e.detail || {};
  if (!type) return;
  if (!REC_RPC_TYPES.has(type)) {
    dispatchToPage("tracebug-rec-response", { id, result: null, error: "Unsupported request type" });
    return;
  }
  if (!isExtAlive()) {
    // Reply with an error so the page-side promise rejects cleanly instead
    // of waiting forever for a response that will never come.
    dispatchToPage("tracebug-rec-response", { id, result: null, error: "Extension context invalidated" });
    return;
  }
  safeSendMessage({ type, data }, (response) => safeRun(() => {
    const error = (chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message)
      || (response && response.error)
      || (!response ? "Extension context invalidated" : null);
    const respond = (finalResult) =>
      dispatchToPage("tracebug-rec-response", { id, result: error ? null : finalResult, error });
    // Recordings carry only metadata over IPC — read the dataUrl out of
    // chrome.storage.local (where the offscreen wrote it) and stitch it
    // back on before handing the result to the page.
    if (!error && response && response._viaStorage) {
      reattachDataUrl(response, respond);
    } else {
      respond(response);
    }
  }));
}));


// ── Provider bridge relay (Phase 2b) ───────────────────────────────────────
// The page asks for a provider send by dispatching `tracebug-provider-request`.
// SECURITY: e.detail is page-controlled, so this relay does three things and
// nothing else —
//
//   1. allowlists the verb (exactly two, separate from the tb:rec:* set),
//   2. REBUILDS the forwarded data field by field, so a key the page added
//      cannot reach the worker even by accident,
//   3. forwards it with no credential and no destination, because the page has
//      none to give: the worker reads those from chrome.storage.local.
//
// The worker validates all of this again (provider-bridge.js). Two layers is
// deliberate — this one can be bypassed by a future refactor of the event
// shape, and that one can't.
var PROVIDER_RPC_TYPES = new Set(["tb:provider:send", "tb:llm:analyze"]);

// Above this, the payload goes through chrome.storage.local instead of
// sendMessage, the same way recordings do. The worker deletes the key in a
// finally block.
var PROVIDER_VIA_STORAGE_BYTES = 512 * 1024;

var _providerPayloadSeq = 0;

/**
 * Rebuild the forwarded payload from the expected fields only, and REJECT an
 * unexpected one rather than dropping it.
 *
 * Rejecting matters twice over: a page probing the bridge is told no instead of
 * getting a send with its extra field quietly ignored, and a future SDK change
 * that adds a field fails loudly in testing instead of half-working. The
 * worker enforces the same rule again (provider-bridge.js) — this layer can be
 * bypassed by a refactor of the event shape, that one cannot.
 */
function rebuildProviderPayload(type, provider, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Malformed payload." };
  }
  var keys = type === "tb:llm:analyze" ? ["prompt"]
    : provider === "slack" ? ["text"]
    : ["title", "body"];
  var given = Object.keys(raw);
  for (var i = 0; i < given.length; i++) {
    if (keys.indexOf(given[i]) === -1) {
      return { error: 'Unexpected field "' + given[i] + '" in payload.' };
    }
  }
  var out = {};
  for (var j = 0; j < keys.length; j++) {
    var v = raw[keys[j]];
    out[keys[j]] = typeof v === "string" ? v : "";
  }
  return { payload: out };
}

/** The request envelope carries exactly these — a destination is not one. */
var PROVIDER_DATA_KEYS = ["provider", "payload"];

window.addEventListener("tracebug-provider-request", (e) => safeRun(() => {
  const { id, type, data } = e.detail || {};
  if (!id || !type) return;

  const ack = (error) => dispatchToPage("tracebug-provider-ack", { id, error });

  if (!PROVIDER_RPC_TYPES.has(type)) { ack("Unsupported request type."); return; }
  if (!isExtAlive()) { ack("Extension context invalidated"); return; }

  if (!data || typeof data !== "object") { ack("Malformed request."); return; }
  // Reject an extra envelope field too: repo / token / baseUrl at this level
  // would otherwise be dropped silently, which reads as "accepted".
  const extra = Object.keys(data).find((k) => PROVIDER_DATA_KEYS.indexOf(k) === -1);
  if (extra) { ack('Unexpected field "' + extra + '" in request.'); return; }

  const provider = (typeof data.provider === "string") ? data.provider : undefined;
  const built = rebuildProviderPayload(type, provider, data.payload);
  if (built.error) { ack(built.error); return; }
  const payload = built.payload;

  const forward = (extra) => {
    const msg = { type, id, data: Object.assign({ provider, payload }, extra || {}) };
    safeSendMessage(msg, (response) => safeRun(() => {
      const err = (chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message)
        || (response && response.error)
        || (!response ? "Extension context invalidated" : null);
      // An ack only ever reports a REJECTION. Success means a confirmation
      // window is open and the outcome will arrive later as
      // tb:provider:result — see src/ext-rpc.ts.
      if (err) ack(err);
    }));
  };

  // Large payloads: write once, pass a reference. If the write fails we send
  // the payload inline anyway and let the worker's size check answer, rather
  // than failing a send the user asked for.
  var approxBytes = 0;
  try { approxBytes = JSON.stringify(payload).length; } catch (err) { approxBytes = 0; }
  if (approxBytes > PROVIDER_VIA_STORAGE_BYTES) {
    var ref = String(Date.now()) + "_" + (++_providerPayloadSeq);
    try {
      var obj = {};
      obj["tb_send_payload_" + ref] = payload;
      chrome.storage.local.set(obj, function () {
        var _ = chrome.runtime.lastError;
        if (_) forward(); else forward({ _viaStorage: ref });
      });
      return;
    } catch (err2) { /* fall through to inline */ }
  }
  forward();
}));

// ── Provider outcome fan-out ───────────────────────────────────────────────
// The worker sends the result to THIS tab's top frame only, after the user has
// approved it. Forward it to the page so the SDK's promise settles.
if (isExtAlive()) {
  try {
    chrome.runtime.onMessage.addListener((message) => safeRun(() => {
      if (message && message.type === "tb:provider:result") {
        dispatchToPage("tracebug-provider-result", {
          id: message.id,
          ok: message.ok === true,
          cancelled: message.cancelled === true,
          error: message.error || null,
          result: message.result || null,
        });
      }
    }));
  } catch (e) {}
}

// ── Auto-stop fan-out ──────────────────────────────────────────────────────
// When the user clicks the browser's native "Stop sharing" button, the
// offscreen document broadcasts `tb:rec:auto-stopped` via background to every
// tab. We forward to the page so the SDK can dismiss the HUD + open the
// ticket modal with the finalized recording.
if (isExtAlive()) {
  try {
    chrome.runtime.onMessage.addListener((message) => safeRun(() => {
      if (message && message.type === "tb:rec:auto-stopped") {
        const deliver = (m) => dispatchToPage("tracebug-rec-auto-stopped", m);
        // Same dataUrl rehydration as the RPC response path.
        if (message.recording && message.recording._viaStorage) {
          reattachDataUrl(message.recording, (rec) => {
            message.recording = rec;
            deliver(message);
          });
        } else {
          deliver(message);
        }
      }
    }));
  } catch (e) {}
}

// ── Recording-started fan-out ───────────────────────────────────────────────
// The offscreen broadcasts `tb:rec:started` the moment MediaRecorder.start
// fires. Forward it to the page so the SDK can mount the recording HUD even if
// the start RPC's return value got lost/aborted on the way back.
if (isExtAlive()) {
  try {
    chrome.runtime.onMessage.addListener((message) => safeRun(() => {
      if (message && message.type === "tb:rec:started") {
        dispatchToPage("tracebug-rec-started", message);
      }
    }));
  } catch (e) {}
}

// ── Listen for messages from popup/background ───────────────────────────────
if (isExtAlive()) {
 try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => safeRun(() => {
    switch (message.type) {
      case "TAKE_SCREENSHOT":
        // Use chrome.tabs.captureVisibleTab via background
        safeSendMessage({ type: "CAPTURE_SCREENSHOT" }, (result) => {
          if (result && result.dataUrl) {
            dispatchToPage("tracebug-ext-screenshot", { dataUrl: result.dataUrl });
          }
        });
        sendResponse({ ok: true });
        break;

      case "GENERATE_REPORT":
        dispatchToPage("tracebug-ext-action", { action: "report" });
        sendResponse({ ok: true });
        break;

      case "COPY_GITHUB_ISSUE":
        dispatchToPage("tracebug-ext-action", { action: "github" });
        sendResponse({ ok: true });
        break;

      case "COPY_JIRA_TICKET":
        dispatchToPage("tracebug-ext-action", { action: "jira" });
        sendResponse({ ok: true });
        break;

      case "TOGGLE_ANNOTATE":
        dispatchToPage("tracebug-ext-action", { action: "annotate" });
        sendResponse({ ok: true });
        break;

      case "TOGGLE_DRAW":
        dispatchToPage("tracebug-ext-action", { action: "draw" });
        sendResponse({ ok: true });
        break;

      case "EXPORT_ANNOTATIONS":
        dispatchToPage("tracebug-ext-action", { action: "export_annotations" });
        sendResponse({ ok: true });
        break;

      // ── New popup flow ───────────────────────────────────────────────────
      case "TB_CAPTURE_NOW":
        dispatchToPage("tracebug-ext-action", {
          action: "capture-now",
          // Default false: a plain click keeps today's instant viewport
          // shot. true only when the popup's Screenshot card explicitly
          // picked Crop.
          crop: !!message.crop,
          delaySec: message.delaySec || 0,
        });
        sendResponse({ ok: true });
        break;

      case "TB_START_RECORDING":
        dispatchToPage("tracebug-ext-action", {
          action: "record",
          // Phase 4: video is OPT-IN. Absent means an events-only capture
          // (console, network, actions, DOM replay) with no share picker, so
          // the default here must stay false — not "undefined means yes".
          video: !!message.video,
          withMic: !!message.withMic,
          blurFirst: !!message.blurFirst,
          delaySec: message.delaySec || 0,
          surfaceMode: message.surfaceMode || undefined,
        });
        sendResponse({ ok: true });
        break;

      case "TB_STOP_RECORDING":
        dispatchToPage("tracebug-ext-action", { action: "stop" });
        sendResponse({ ok: true });
        break;

      case "TB_VIEW_TICKETS":
        dispatchToPage("tracebug-ext-action", { action: "view-tickets" });
        sendResponse({ ok: true });
        break;

      case "TB_INSPECT":
        dispatchToPage("tracebug-ext-action", { action: "inspect" });
        sendResponse({ ok: true });
        break;

      // ── Health check (Phase 3) ───────────────────────────────────────────
      // The worker pings before dispatching any action. No answer means this
      // tab has no live bridge — never injected, or orphaned by an extension
      // update — and the worker repairs it instead of dispatching into the
      // void. `pageSdk` is what stops that repair from mounting a SECOND
      // toolbar: the page-world SDK is ordinary page JS and keeps running
      // when the extension reloads, so only the bridge needs replacing.
      //
      // The SAME signal, on a tab never injected before, means something else
      // entirely: a host page's own TraceBug integration already has a UI up.
      // background.js's injectSDK() (first-ever injection, as opposed to
      // ensureAlive()'s repair path) reads it that way and defers instead of
      // mounting a second toolbar — see docs/launch/sdk-isolation-1.11.2.md.
      // One detector, shared via page-support.js, so both call sites agree.
      //
      // `extensionOwned` breaks the remaining ambiguity: a DOM match alone
      // can't tell OUR surviving mount from a real host UI once the worker's
      // own bookkeeping (activeTabs/injectedTabs) is gone — a service-worker
      // restart or an extension reload/update clears that, but the page's
      // sessionStorage marker (set by src/dashboard.ts's mountDashboard when
      // it is running as the extension, cleared on teardown) is page-scoped
      // and survives it. injectSDK() only throws the host-UI error when a
      // TraceBug UI exists AND we did not put it there ourselves.
      case "TB_PING": {
        var hostUiPresent = globalThis.TraceBugPageSupport
          ? globalThis.TraceBugPageSupport.detectHostTraceBugUI(document)
          : !!document.getElementById("tracebug-root");
        var extensionOwned = false;
        try {
          var key = globalThis.TraceBugPageSupport
            ? globalThis.TraceBugPageSupport.EXTENSION_OWNER_KEY
            : "tracebug_ext_owns_ui";
          extensionOwned = window.sessionStorage.getItem(key) === "1";
        } catch (e) {}
        sendResponse({ alive: true, pageSdk: hostUiPresent, extensionOwned: extensionOwned });
        break;
      }
    }
  }));
 } catch (e) {}
}

// Last-resort net: any uncaught error originating from this content script's
// own execution gets suppressed via the window error handler. Required when
// the runtime is invalidated mid-execution (e.g., during an `await` inside
// a listener) — try/catch around the entry point doesn't catch async throws.
window.addEventListener("error", function (ev) {
  var msg = ev && ev.message;
  if (typeof msg === "string" && /Extension context invalidated|Receiving end does not exist/i.test(msg)) {
    ev.preventDefault();
    ev.stopImmediatePropagation && ev.stopImmediatePropagation();
  }
}, true);
window.addEventListener("unhandledrejection", function (ev) {
  var msg = ev && ev.reason && (ev.reason.message || String(ev.reason));
  if (typeof msg === "string" && /Extension context invalidated|Receiving end does not exist/i.test(msg)) {
    ev.preventDefault();
    ev.stopImmediatePropagation && ev.stopImmediatePropagation();
  }
}, true);

  })(); // end tracebugContentScriptMain IIFE
} // end __TRACEBUG_CS_LOADED__ guard
