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
// ADR 010 OAuth sign-ins. Read here only to publish "connected" booleans.
var TB_TRACKER_AUTH_KEY = "tb_tracker_auth_v1";
// Integrations hub: the chosen default tracker. Read only as a change signal;
// the worker resolves it (TB_HOST_ACCESS `integrations`).
var TB_TRACKER_DEFAULT_KEY = "tb_tracker_default_v1";
var TB_DEFAULT_TRACKERS = ["github", "linear", "slack"];

safeRun(function () {
  if (!isExtAlive() || !document.documentElement) return;

  function toStatus(integrations, ai, workerAnswer, auth) {
    var hostAccess = workerAnswer && workerAnswer.granted;
    var shortcut = (workerAnswer && workerAnswer.shortcut) || "";
    var i = integrations || {};
    var a = ai || null;
    var o = auth || {};
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
      // A credential is enough since ADR 010: the repo/team is picked in the
      // extension's Create window, not typed in settings.
      // …or nothing yet, where this build can sign in: the Create window
      // offers Connect (the worker's `connectable`, booleans only).
      github: !!((i.github && i.github.token) || o.github || (workerAnswer && workerAnswer.connectable && workerAnswer.connectable.github)),
      linear: !!((i.linear && i.linear.apiKey) || o.linear || (workerAnswer && workerAnswer.connectable && workerAnswer.connectable.linear)),
      slack: !!(i.slack && i.slack.webhookUrl),
      // Which tracker the ticket's main send button targets, and whether any
      // connection needs attention (the status icon's warning dot). An id
      // from a fixed list and a boolean — never a repo, team or account name.
      defaultTracker: (workerAnswer && workerAnswer.integrations &&
        TB_DEFAULT_TRACKERS.indexOf(workerAnswer.integrations.defaultTracker) !== -1)
        ? workerAnswer.integrations.defaultTracker : null,
      trackerAttention: !!(workerAnswer && workerAnswer.integrations && workerAnswer.integrations.attention),
      // Something is really connected (the flags above also mean "can connect"):
      // the ticket says "Send to app" until one is.
      trackerConnected: !!((i.github && i.github.token) || o.github || (i.linear && i.linear.apiKey) || o.linear ||
        (i.slack && i.slack.webhookUrl)),
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
      chrome.storage.local.get([TB_INT_KEY, TB_AI_KEY, TB_TRACKER_AUTH_KEY], function (r) {
        var _ = chrome.runtime.lastError;
        var ints = r && r[TB_INT_KEY];
        var ai = r && r[TB_AI_KEY];
        var auth = r && r[TB_TRACKER_AUTH_KEY];
        try {
          chrome.runtime.sendMessage({ type: "TB_HOST_ACCESS" }, function (res) {
            var _e = chrome.runtime.lastError;
            publishStatus(toStatus(ints, ai, res, auth));
          });
        } catch (e2) {
          publishStatus(toStatus(ints, ai, undefined, auth));
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
      if (area === "local" && (changes[TB_INT_KEY] || changes[TB_AI_KEY] || changes[TB_TRACKER_AUTH_KEY] || changes[TB_TRACKER_DEFAULT_KEY])) readAndPublish();
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

// ── Site Audit: axe on request ──────────────────────────────────────────────
// The toolbar's Audit button runs in the page, which can't inject extension
// files. Ask the worker to inject the packaged axe (same as the popup's Audit
// path), then tell the page it can run. Always answers, even on failure: the
// audit then reports accessibility as "not run".
window.addEventListener("tracebug-request-axe", () => safeRun(() => {
  safeSendMessage({ type: "TB_LOAD_AXE" }, () => {
    dispatchToPage("tracebug-ext-axe-ready", {});
  });
}));

// ── Success signal (email ask counter) ────────────────────────────────────
// The SDK says "audit" / "ticket" / "export" after a real result. Only the
// kind is forwarded; the worker counts them in chrome.storage.local so the
// popup knows when it may show its one optional email ask. A page could fire
// this event itself — worst case the ask shows a little early.
const TB_SUCCESS_KINDS = new Set(["audit", "ticket", "export"]);
window.addEventListener("tracebug-success", (e) => safeRun(() => {
  const kind = e && e.detail && e.detail.kind;
  if (!TB_SUCCESS_KINDS.has(kind)) return;
  safeSendMessage({ type: "TB_SUCCESS", kind }, () => {});
}));

// ── Site Audit sign-in gate (ADR 009) ─────────────────────────────────────
// Before each scan the panel asks whether it may run; the worker answers from
// chrome.storage.local (free audits left / signed in). No answer = allowed:
// the gate fails open. A page could fake the answer itself — it's a speed
// bump for honest users, not enforcement (ADR 009).
window.addEventListener("tracebug-audit-permit-request", () => safeRun(() => {
  safeSendMessage({ type: "TB_AUDIT_PERMIT" }, (r) => {
    const ok = r && typeof r.allowed === "boolean";
    dispatchToPage("tracebug-ext-audit-permit", ok
      ? { allowed: r.allowed, signedIn: !!r.signedIn, remaining: typeof r.remaining === "number" ? r.remaining : null, free: r.free }
      : { allowed: true, signedIn: false, remaining: null });
  });
}));
// The panel's "Sign in" button: sign-in happens on an extension page, never in
// a form on the user's site (the site's scripts could read it).
window.addEventListener("tracebug-open-signin", () => safeRun(() => {
  safeSendMessage({ type: "TB_OPEN_SIGNIN" }, () => {});
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
  // HUD mic-mute button (1.11.3). Missing from this allowlist meant every
  // mute/unmute request was rejected here as "Unsupported request type"
  // before ever reaching offscreen.js — silently, since video-recorder.ts's
  // setMicrophoneMuted() sets its optimistic flag and fires this RPC with a
  // bare .catch(() => {}). The HUD icon flipped to "muted" and stayed that
  // way, but the real MediaStreamTrack's `enabled` was never touched, so the
  // recording kept the microphone audio the whole time regardless of what
  // the button showed. Carries no secret and targets only the tab's own
  // in-progress recording, same trust level as the other tb:rec:* verbs.
  "tb:rec:mic-mute",
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
  // Phase 13 step 4: GitHub/Linear sends may carry files to attach.
  var optional = type === "tb:provider:send" && (provider === "github" || provider === "linear") ? ["attachments"] : [];
  var given = Object.keys(raw);
  for (var i = 0; i < given.length; i++) {
    if (keys.indexOf(given[i]) === -1 && optional.indexOf(given[i]) === -1) {
      return { error: 'Unexpected field "' + given[i] + '" in payload.' };
    }
  }
  var out = {};
  for (var j = 0; j < keys.length; j++) {
    var v = raw[keys[j]];
    out[keys[j]] = typeof v === "string" ? v : "";
  }
  if (raw.attachments !== undefined) {
    if (!Array.isArray(raw.attachments) || raw.attachments.length > 6) return { error: "Malformed attachments." };
    out.attachments = raw.attachments.map(function (a) {
      return {
        name: a && typeof a.name === "string" ? a.name : "",
        type: a && typeof a.type === "string" ? a.type : "",
        data: a && typeof a.data === "string" ? a.data : "",
      };
    });
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
    // Set HERE, not by the page: this script can show the in-page panel.
    if (type === "tb:provider:send" && panelCapable()) msg.panel = true;
    safeSendMessage(msg, (response) => safeRun(() => {
      const err = (chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message)
        || (response && response.error)
        || (!response ? "Extension context invalidated" : null);
      // An ack only ever reports a REJECTION. Success means a confirmation
      // window (or the in-page panel) is open and the outcome will arrive
      // later as tb:provider:result — see src/ext-rpc.ts.
      if (err) { ack(err); return; }
      if (response && response.panel && typeof response.panel.nonce === "string") mountCreatePanel(id, response.panel.nonce);
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

// ── In-page Create panel (Phase 13 Step 3) ─────────────────────────────────
// create-issue.html, docked in the ticket's right column. Cross-origin to the
// page, so the page can't read the repo names, labels or people in it, and it
// never gets the one-time nonce: the worker hands it to THIS script, which
// posts it into its own frame only. Messages from the frame are accepted only
// from that frame's window, with the extension's origin, in an exact shape;
// they carry layout and the tracker's id (the tab's name), nothing else. If
// the frame doesn't say "ready" in time (a CSP that blocks it, a page that
// tampers with it), the extension window opens instead.
var PANEL_PAGE = "create-issue.html";
var PANEL_READY_MS = 3500;
var activePanel = null;

/** Only builds that declare the panel as web-accessible (Chrome) frame it. */
function panelCapable() {
  try {
    var war = chrome.runtime.getManifest().web_accessible_resources || [];
    return war.some(function (e) { return e && Array.isArray(e.resources) && e.resources.indexOf(PANEL_PAGE) !== -1; });
  } catch (e) { return false; }
}

function ticketTheme() {
  var root = document.getElementById("tracebug-root");
  var t = root && root.getAttribute("data-tb-theme");
  return t === "dark" || t === "light" ? t : "auto";
}

// The panel docks in the ticket's right column as its own tab ("GitHub" or
// "Linear", with a ✕), next to Info · Actions · Console · Network · AI. The
// tab is there whenever a ticket is open, connected or not: clicking it opens
// the panel (which offers Connect when nothing is connected yet). The
// frame lies over the column's panel area, under the tab strip and down to
// the footer; the form scrolls inside it. Another tab hides the frame (its
// state stays); the tab shows it again. Only the tracker's id reaches the
// page (the tab's name), never a repository, label or account.
var PANEL_TABS = {
  github: { label: "GitHub", fill: "currentColor", d: "M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" },
  linear: { label: "Linear", fill: "#5E6AD2", d: "M1.2 13.9a11 11 0 0 0 8.9 8.9L1.2 13.9Zm-.2-3 12.1 12.1c.9-.1 1.8-.3 2.6-.6L1.6 8.3c-.3.8-.5 1.7-.6 2.6Zm1.4-4.3 15 15c.7-.4 1.3-.9 1.9-1.4L3.8 4.7c-.5.6-1 1.2-1.4 1.9ZM5.3 3.4A11 11 0 1 1 20.6 18.7L5.3 3.4Z" },
};
var SVG_NS = "http://www.w3.org/2000/svg";

/** A small inline SVG, built with DOM calls (no markup strings). */
function svgIcon(size, paths, attrs) {
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  Object.keys(attrs || {}).forEach(function (k) { svg.setAttribute(k, attrs[k]); });
  paths.forEach(function (pa) {
    var el = document.createElementNS(SVG_NS, "path");
    Object.keys(pa).forEach(function (k) { el.setAttribute(k, pa[k]); });
    svg.appendChild(el);
  });
  return svg;
}

// Whether the last thing the user did on the page was a pointer action: the
// panel then focuses its first control without a ring (keyboard users keep it).
var lastPageInput = "keyboard";
window.addEventListener("pointerdown", function () { lastPageInput = "pointer"; }, true);
window.addEventListener("keydown", function () { lastPageInput = "keyboard"; }, true);

function unmountCreatePanel() {
  if (!activePanel) return;
  var p = activePanel;
  activePanel = null;
  clearTimeout(p.timer);
  window.removeEventListener("message", p.onMessage);
  window.removeEventListener("resize", p.onResize);
  if (p.observer) p.observer.disconnect();
  if (p.tabObserver) p.tabObserver.disconnect();
  if (p.themeObserver) p.themeObserver.disconnect();
  if (p.sizeObserver) p.sizeObserver.disconnect();
  // Focus was in the panel, on its tab (or nowhere): give it back to the send button.
  var a = document.activeElement;
  var refocus = !a || a === document.body || a === p.frame || p.tabWrap.contains(a);
  var wasShown = p.tab.classList.contains("tb-qb-tab-active");
  if (p.slot.parentNode) p.slot.parentNode.removeChild(p.slot);
  // The tab stays (idle, no ✕) for the next time.
  p.close.hidden = true;
  p.tab.setAttribute("aria-selected", "false");
  p.modal.removeAttribute("data-tb-docked");
  if (p.restorePosition !== null) p.right.style.position = p.restorePosition;
  // Back to the tab that was open before (else the first one).
  if (wasShown) {
    var back = p.prevTab && p.prevTab.isConnected ? p.prevTab : p.strip.querySelector("[data-tab]");
    if (back) back.click();
  }
  setSplitExpanded(p, false);
  var opener = p.opener && p.opener.isConnected ? p.opener : p.modal.querySelector("[data-tb-split-main]");
  if (refocus && opener) { try { opener.focus(); } catch (e) {} }
}

/** aria-expanded on the ticket's send button follows the panel. Looked up
 *  each time: the ticket redraws the button when a tracker connects. */
function setSplitExpanded(p, open) {
  var btns = p.modal.querySelectorAll("[data-tb-send-split] [aria-haspopup]");
  for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-expanded", open ? "true" : "false");
}

/** Name the tab after the tracker the panel is on. */
function setPanelTab(p, tracker) {
  var t = PANEL_TABS[tracker] || PANEL_TABS.github;
  var name = document.createElement("span");
  name.textContent = t.label;
  p.tab.replaceChildren(svgIcon(14, [{ fill: t.fill, d: t.d }]), name);
  p.close.setAttribute("aria-label", "Close " + t.label);
  p.close.title = "Close " + t.label;
}

/** The tracker the ticket's send button goes to (github unless it says linear). */
function ticketTracker(modal) {
  var main = modal.querySelector("[data-tb-split-main]");
  var t = main && main.getAttribute("data-target");
  return PANEL_TABS.hasOwnProperty(t) ? t : "github";
}

/**
 * The tracker's tab in the ticket's strip: made once per ticket and kept, so
 * it is there before anything is connected. Idle, a click asks the ticket for
 * its panel (the same as its send button); with the panel open, it is that
 * panel's tab and the ✕ closes it.
 */
function trackerTab(modal, strip) {
  var wrap = strip.querySelector("[data-tb-tracker-tab]");
  if (wrap) return { wrap: wrap, tab: wrap.querySelector("[data-tab]"), close: wrap.querySelector(".tb-qb-tab-x") };
  wrap = document.createElement("span");
  wrap.className = "tb-qb-tab-tracker";
  wrap.setAttribute("data-tb-tracker-tab", "");
  wrap.setAttribute("role", "presentation");
  var tab = document.createElement("button");
  tab.type = "button";
  tab.className = "tb-qb-tab";
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", "false");
  tab.setAttribute("data-tab", "tracker");
  var close = document.createElement("button");
  close.type = "button";
  close.className = "tb-qb-tab-x";
  close.hidden = true;
  close.appendChild(svgIcon(12, [{ d: "M18 6 6 18M6 6l12 12" }],
    { fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round" }));
  wrap.appendChild(tab);
  wrap.appendChild(close);
  var t = { wrap: wrap, tab: tab, close: close };
  setPanelTab(t, ticketTracker(modal));
  close.addEventListener("click", function (e) {
    e.stopPropagation();
    if (activePanel && activePanel.tabWrap === wrap) unmountCreatePanel();
  });
  // Runs before the ticket's own (delegated) switching, so the tab that was
  // open is still the active one here.
  tab.addEventListener("click", function () {
    if (activePanel && activePanel.tabWrap === wrap) return;
    var prev = strip.querySelector(".tb-qb-tab-active");
    wrap._tbPrev = prev && prev !== tab ? prev : null;
    var act = ticketTracker(modal) === "linear" ? "linear" : "open-github";
    var main = modal.querySelector("[data-tb-split-main]");
    var btn = main && main.getAttribute("data-action") === act ? main : modal.querySelector('[data-action="' + act + '"]');
    var back = function () {
      if (activePanel && activePanel.tabWrap === wrap) return;
      var to = wrap._tbPrev && wrap._tbPrev.isConnected ? wrap._tbPrev : strip.querySelector("[data-tab]:not([data-tab=tracker])");
      if (to && tab.classList.contains("tb-qb-tab-active")) to.click();
    };
    if (!btn) { setTimeout(back, 0); return; }
    btn.click();
    // No panel came (the window opened instead, or nothing did): don't leave
    // an empty tab open.
    setTimeout(back, PANEL_READY_MS + 500);
  });
  strip.appendChild(wrap);
  return t;
}

/** Every open ticket gets the tab. */
function ensureTrackerTab() {
  var modal = document.getElementById("tracebug-quick-bug-modal");
  var strip = modal && modal.querySelector(".tb-qb-right .tb-qb-tabstrip");
  if (!strip) return;
  var t = trackerTab(modal, strip);
  // Idle, it follows the send button (GitHub, or Linear once that's the default).
  if (!(activePanel && activePanel.tabWrap === t.wrap) && t.tab.textContent !== PANEL_TABS[ticketTracker(modal)].label) {
    setPanelTab(t, ticketTracker(modal));
  }
}

// Only builds that frame the panel (Chrome) get the tab; Firefox keeps its
// send button and the window.
(function watchTicketsForTab() {
  if (!panelCapable() || typeof MutationObserver !== "function") return;
  var queued = false;
  var check = function () {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; ensureTrackerTab(); }, 30);
  };
  // TraceBug's own root only (the ticket mounts there): the page's own
  // changes aren't watched once it exists.
  var watchRoot = function (root) { new MutationObserver(check).observe(root, { childList: true, subtree: true }); check(); };
  var root = document.getElementById("tracebug-root");
  if (root) { watchRoot(root); return; }
  var mo = new MutationObserver(function () {
    var r = document.getElementById("tracebug-root");
    if (r) { mo.disconnect(); watchRoot(r); }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();

/**
 * The frame over the right column's panel area: from under the tab strip to
 * the column's foot (the ticket's footer is outside the column, so it is never
 * covered). Shown only while its tab is the active one. CSS keeps it in place
 * on scroll and resize; the strip's height is the one thing measured. Only
 * styles change: moving an iframe in the DOM would reload it.
 */
function dockCreatePanel(p) {
  if (!p.strip.isConnected) return;
  var on = p.tab.classList.contains("tb-qb-tab-active");
  p.tab.setAttribute("aria-selected", on ? "true" : "false");
  p.slot.style.cssText = "position:absolute;left:0;right:0;bottom:0;margin:0;padding:0;z-index:4;" +
    "top:" + Math.round(p.strip.offsetTop + p.strip.offsetHeight) + "px;" +
    "display:" + (on ? "block" : "none") + " !important;";
  // Shown (again): make sure all of it is in view.
  if (on && !p.wasShown) revealDockedPanel(p);
  p.wasShown = on;
  // Its tab stays in view in a strip that scrolls sideways.
  if (on) {
    var sr = p.strip.getBoundingClientRect(), tr = p.tabWrap.getBoundingClientRect();
    if (tr.right > sr.right) p.strip.scrollLeft += Math.ceil(tr.right - sr.right);
    else if (tr.left < sr.left) p.strip.scrollLeft -= Math.ceil(sr.left - tr.left);
  }
}

function panelFallback(id, nonce) {
  unmountCreatePanel();
  safeSendMessage({ type: "tb:panel:fallback", id: id, nonce: nonce }, function () { void chrome.runtime.lastError; });
}

function mountCreatePanel(id, nonce) {
  unmountCreatePanel();
  var modal = document.getElementById("tracebug-quick-bug-modal");
  var right = modal && modal.querySelector(".tb-qb-right");
  var strip = right && right.querySelector(".tb-qb-tabstrip");
  if (!strip) { panelFallback(id, nonce); return; }
  // The send button gets focus back when the panel closes. The page's hint
  // picks what the frame focuses first; it can't do anything else.
  var split = modal.querySelector("[data-tb-send-split]");
  var focusHint = modal.getAttribute("data-tb-panel-focus") === "picker" ? "picker"
    : lastPageInput === "pointer" ? "pointer" : "create";
  var active = document.activeElement;
  var main = split ? split.querySelector("[data-tb-split-main]") : null;
  var opener = split && active && split.contains(active) ? active : main;
  var first = main && PANEL_TABS.hasOwnProperty(main.getAttribute("data-target")) ? main.getAttribute("data-target") : "github";

  // getURL gives the per-session dynamic URL (use_dynamic_url); the loaded
  // document's origin is the extension's own. Both are ours, nothing else is.
  var src = chrome.runtime.getURL(PANEL_PAGE);
  var extOrigin, extOrigins;
  try {
    extOrigin = new URL(src).origin;
    extOrigins = [extOrigin, "chrome-extension://" + chrome.runtime.id];
  } catch (e) { panelFallback(id, nonce); return; }

  // The tab: a button the ticket's own tab switching handles (data-tab), and
  // a ✕ beside it (already there when the ticket opened; made now if not).
  var tt = trackerTab(modal, strip);
  var tabWrap = tt.wrap, tab = tt.tab, closeBtn = tt.close;
  closeBtn.hidden = false;
  // Opened from the tab itself: go back to the tab that was open before it.
  var prevTab = tab.classList.contains("tb-qb-tab-active") ? tabWrap._tbPrev || null : strip.querySelector(".tb-qb-tab-active");
  tabWrap._tbPrev = null;

  var slot = document.createElement("div");
  slot.setAttribute("data-tb-create-panel", "");
  var frame = document.createElement("iframe");
  frame.src = src;
  frame.title = "Create an issue";
  // The device code's Copy and "Copy screenshot" need the clipboard inside the
  // frame. `*`, not the default 'src': the src is the dynamic URL, but the
  // document that loads has the extension's own origin, so 'src' never matches
  // it and Chrome blocked every write. Naming that origin would put the
  // extension id in the page. `*` grants nothing the page lacks: it could
  // frame anything it likes with the same attribute. A site's own
  // Permissions-Policy (clipboard-write=()) still wins.
  frame.setAttribute("allow", "clipboard-write *");
  // !important on every box property: a page's own `iframe { … !important }`
  // rules (height caps are common) would otherwise squeeze the panel.
  frame.style.cssText = "display:block !important;width:100% !important;max-width:none !important;" +
    "height:100% !important;min-height:0 !important;max-height:none !important;border:0 !important;" +
    "border-radius:0 !important;background:transparent;color-scheme:normal;";
  slot.appendChild(frame);

  var p = { id: id, slot: slot, frame: frame, ready: false, timer: 0, observer: null, onMessage: null,
    modal: modal, right: right, strip: strip, tab: tab, tabWrap: tabWrap, close: closeBtn, opener: opener,
    prevTab: prevTab, onResize: null, tabObserver: null, themeObserver: null, sizeObserver: null,
    restorePosition: null };
  setPanelTab(p, first);
  if (getComputedStyle(right).position === "static") {
    p.restorePosition = right.style.position;
    right.style.position = "relative";
  }
  right.appendChild(slot);
  // Narrow tickets stack the columns: the right one takes the body (CSS).
  modal.setAttribute("data-tb-docked", "");

  p.onResize = function () { if (activePanel === p) dockCreatePanel(p); };
  window.addEventListener("resize", p.onResize);
  p.tabObserver = new MutationObserver(p.onResize);
  p.tabObserver.observe(tab, { attributes: true, attributeFilter: ["class"] });
  try {
    p.sizeObserver = new ResizeObserver(p.onResize);
    p.sizeObserver.observe(strip);
    p.sizeObserver.observe(right);
  } catch (e) {}
  setSplitExpanded(p, true);
  // The ticket's theme toggle (or T) after the panel opened: tell the frame,
  // which only had the theme from init. Same nonce, so the page can't forge it.
  var themeRoot = document.getElementById("tracebug-root");
  if (themeRoot) {
    p.themeObserver = new MutationObserver(function () {
      if (activePanel !== p || !p.ready) return;
      var t = ticketTheme();
      var win = frame.contentWindow;
      if (!win) return;
      extOrigins.forEach(function (o) {
        try { win.postMessage({ type: "tb-panel-theme", nonce: nonce, theme: t }, o); } catch (e) {}
      });
    });
    p.themeObserver.observe(themeRoot, { attributes: true, attributeFilter: ["data-tb-theme"] });
  }
  p.onMessage = function (e) {
    // Only our frame, from the extension's origin, in an exact shape.
    if (!activePanel || activePanel !== p || e.source !== frame.contentWindow || extOrigins.indexOf(e.origin) === -1) return;
    var d = e.data;
    if (!d || typeof d !== "object" || Array.isArray(d) || typeof d.type !== "string") return;
    if (d.type === "tb-panel-ready" && Object.keys(d).length === 1) {
      p.ready = true;
      clearTimeout(p.timer);
      // Keyboard users land in the panel (the frame focuses its own control).
      try { frame.focus(); } catch (e) {}
    } else if (d.type === "tb-panel-tracker" && Object.keys(d).length === 2 && PANEL_TABS.hasOwnProperty(d.tracker)) {
      setPanelTab(p, d.tracker);
    } else if (d.type === "tb-panel-close" && Object.keys(d).length === 1) {
      unmountCreatePanel();
    }
  };
  window.addEventListener("message", p.onMessage);
  frame.addEventListener("load", function () {
    if (activePanel !== p) return;
    try {
      // Only our frame's window, and only if it is still our document.
      var doc = frame.contentWindow;
      extOrigins.forEach(function (o) {
        try { doc.postMessage({ type: "tb-panel-init", id: id, nonce: nonce, theme: ticketTheme(), focus: focusHint }, o); } catch (e) {}
      });
    } catch (e) { /* the timer falls back */ }
  });
  p.timer = setTimeout(function () { if (activePanel === p && !p.ready) panelFallback(id, nonce); }, PANEL_READY_MS);
  // Ticket closed (or the page removed the frame): stop listening. The
  // frame's port closing tells the worker to cancel.
  p.observer = new MutationObserver(function () {
    if (activePanel === p && !frame.isConnected) unmountCreatePanel();
  });
  p.observer.observe(document.documentElement, { childList: true, subtree: true });
  activePanel = p;
  // Open on its tab: the ticket's own switching hides the other panels.
  tab.click();
  dockCreatePanel(p);
  revealDockedPanel(p);
}

/**
 * A narrow ticket (or a zoomed-in one) stacks and scrolls: bring the panel's
 * column fully into view, or its Create row sits below the visible part and
 * Create never arms. A wide ticket doesn't scroll, so this changes nothing there.
 */
function revealDockedPanel(p) {
  var shell = p.modal.querySelector(".tb-qb-shell");
  if (!shell || shell.scrollHeight <= shell.clientHeight + 1) return;
  var sr = shell.getBoundingClientRect(), fr = p.slot.getBoundingClientRect();
  if (fr.top >= sr.top - 1 && fr.bottom <= sr.bottom + 1) return;
  shell.scrollTop += Math.round(p.strip.getBoundingClientRect().top - sr.top);
}

// ── Is the panel really what the user sees? (second opinion) ──────────────
// IntersectionObserver v2 says "hidden" for ANY filter, opacity < 1 or
// transform on the frame or an ancestor, so a page-wide dark-mode filter on
// <html> pauses Create forever. When it does, the frame asks (via the worker,
// never postMessage — the page shares this window) for this check. It passes
// only if the Create row is our frame at its centre and corners, nothing
// click-through (pointer-events:none, also ::before/::after) is drawn over it,
// and no ancestor fades, clips, blends, skews or blurs it. Colour filters a
// dark-mode tool uses are fine. Any doubt → fail, and the panel offers the window.

var PROBE_MAX_NODES = 20000; // elements whose box meets the Create row
var SAFE_FILTERS = /^(invert|hue-rotate|sepia|grayscale|brightness|contrast|saturate)$/;

function parentAcrossShadow(el) {
  if (el.parentElement) return el.parentElement;
  var root = el.parentNode;
  return root && root.host ? root.host : null;
}

function shadowOf(el) {
  // Chrome: chrome.dom (looked up by name — Firefox has no such namespace and
  // offers element.openOrClosedShadowRoot instead).
  try {
    var dom = chrome["dom"];
    if (dom && typeof dom.openOrClosedShadowRoot === "function") return dom.openOrClosedShadowRoot(el) || null;
  } catch (e) {}
  return el.openOrClosedShadowRoot || el.shadowRoot || null;
}

/** null when the filter only shifts colours; else a short reason. */
function unsafeFilter(value) {
  if (!value || value === "none") return null;
  var re = /([a-z-]+)\(([^)]*)\)/g, m, n = 0;
  while ((m = re.exec(value))) {
    n++;
    if (!SAFE_FILTERS.test(m[1])) return m[1];
    if (m[1] === "brightness" || m[1] === "contrast" || m[1] === "saturate") {
      var v = parseFloat(m[2]);
      if (/%$/.test(m[2].trim())) v = v / 100;
      if (!(v >= 0.5 && v <= 2)) return m[1];
    }
  }
  return n ? null : "filter";
}

/** Only translate and plain (positive) scale. */
function unsafeTransform(value) {
  if (!value || value === "none") return false;
  var m = /^matrix\(([^)]*)\)$/.exec(value);
  if (!m) return true;
  var v = m[1].split(",").map(parseFloat);
  return !(v[0] > 0.5 && v[3] > 0.5 && Math.abs(v[1]) < 1e-6 && Math.abs(v[2]) < 1e-6);
}

function rectsMeet(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The pseudo-element's box, or null when it can't be placed (→ treat as over). */
function pseudoBox(el, cs) {
  if (cs.position === "fixed") return null;
  if (cs.position !== "absolute") return el.getBoundingClientRect();
  var cb = el;
  while (cb && getComputedStyle(cb).position === "static") cb = parentAcrossShadow(cb);
  var base = cb ? cb.getBoundingClientRect() : { left: 0, top: 0 };
  var l = parseFloat(cs.left), t = parseFloat(cs.top), w = parseFloat(cs.width), h = parseFloat(cs.height);
  if (![l, t, w, h].every(isFinite)) return null;
  return { left: base.left + l, top: base.top + t, right: base.left + l + w, bottom: base.top + t + h };
}

function probePanel(rowRect) {
  var p = activePanel;
  if (!p || !p.frame.isConnected) return { ok: false, reason: "gone" };
  var frame = p.frame;
  var fr = frame.getBoundingClientRect();
  // Scaled or turned frames: the box on screen must match its layout size.
  if (!frame.offsetWidth || Math.abs(fr.width / frame.offsetWidth - 1) > 0.05 ||
      Math.abs(fr.height / frame.offsetHeight - 1) > 0.05) return { ok: false, reason: "transform" };
  // The row the click lands on, in page coordinates.
  var row = {
    left: fr.left + rowRect.left, top: fr.top + rowRect.top,
    right: fr.left + rowRect.left + rowRect.width, bottom: fr.top + rowRect.top + rowRect.height,
  };
  if (row.left < 0 || row.top < 0 || row.right > window.innerWidth || row.bottom > window.innerHeight) return { ok: false, reason: "offscreen" };

  // The frame and every ancestor up to <html>.
  var chain = [];
  var opacity = 1;
  for (var el = frame; el; el = parentAcrossShadow(el)) {
    chain.push(el);
    var cs = getComputedStyle(el);
    opacity *= parseFloat(cs.opacity);
    if (el === frame && cs.visibility !== "visible") return { ok: false, reason: "hidden" };
    var f = unsafeFilter(cs.filter);
    if (f) return { ok: false, reason: "filter" };
    if (unsafeTransform(cs.transform)) return { ok: false, reason: "transform" };
    if (cs.mixBlendMode && cs.mixBlendMode !== "normal") return { ok: false, reason: "blend" };
    if (cs.clipPath && cs.clipPath !== "none") return { ok: false, reason: "clip" };
    if ((cs.maskImage && cs.maskImage !== "none") || (cs.webkitMaskImage && cs.webkitMaskImage !== "none")) return { ok: false, reason: "mask" };
  }
  if (opacity < 0.99) return { ok: false, reason: "faded" };

  // Hit test: our frame must be on top at the centre and four inset corners.
  if (!frameOnTop(frame, row)) return { ok: false, reason: "covered" };

  // Click-through layers: hit tests skip them, so find each one that meets
  // the row, make it hittable for a moment, and hit-test again. Below our
  // frame (page content under the ticket) it changes nothing; over it, it fails.
  // Only elements whose box meets the row are styled or probed (a rect read is
  // cheap; getComputedStyle isn't), and only those count toward the cap.
  var near = 0;
  var roots = [document];
  while (roots.length) {
    var all = roots.pop().querySelectorAll("*");
    for (var j = 0; j < all.length; j++) {
      var n = all[j];
      if (n === frame) continue;
      var r = n.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0 && rectsMeet(r, row))) continue;
      // Shadow trees too, under the same rule (a host whose own box misses
      // the row isn't opened — the accepted gap in ADR 010).
      var sh = shadowOf(n);
      if (sh) roots.push(sh);
      if (++near > PROBE_MAX_NODES) return { ok: false, reason: "large" };
      if (chain.indexOf(n) === -1) {
        var ncs = getComputedStyle(n);
        if (ncs.pointerEvents === "none" && ncs.visibility === "visible" && parseFloat(ncs.opacity) > 0 &&
            !clearWhenHittable(frame, row, r, n, null)) {
          return { ok: false, reason: "overlay" };
        }
      }
      for (var k = 0; k < 2; k++) {
        var which = k ? "::after" : "::before";
        var ps = getComputedStyle(n, which);
        if (!ps.content || ps.content === "none" || ps.content === "normal") continue;
        if (ps.pointerEvents !== "none" || ps.visibility !== "visible" || parseFloat(ps.opacity) === 0 || ps.display === "none") continue;
        var pb = unsafeTransform(ps.transform) ? null : pseudoBox(n, ps);
        if (pb && !rectsMeet(pb, row)) continue;
        if (!clearWhenHittable(frame, row, pb || row, n, which)) return { ok: false, reason: "overlay" };
      }
    }
  }
  return { ok: true };
}

/** The top element at (x, y), through open and closed shadow roots. */
function topAt(x, y) {
  var hit = document.elementFromPoint(x, y);
  for (var guard = 0; hit && guard < 20; guard++) {
    var sr = shadowOf(hit);
    var inner = sr && sr.elementFromPoint ? sr.elementFromPoint(x, y) : null;
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return hit;
}

/** Centre and four inset corners of `box` (clipped to `row`) all hit our frame. */
function frameOnTop(frame, row, box) {
  var b = box ? {
    left: Math.max(box.left, row.left), top: Math.max(box.top, row.top),
    right: Math.min(box.right, row.right), bottom: Math.min(box.bottom, row.bottom),
  } : row;
  var inset = Math.min(3, (b.right - b.left) / 2, (b.bottom - b.top) / 2);
  var pts = [[(b.left + b.right) / 2, (b.top + b.bottom) / 2],
    [b.left + inset, b.top + inset], [b.right - inset, b.top + inset],
    [b.left + inset, b.bottom - inset], [b.right - inset, b.bottom - inset]];
  for (var i = 0; i < pts.length; i++) if (topAt(pts[i][0], pts[i][1]) !== frame) return false;
  return true;
}

/** Make `n` (or its ::before/::after) hittable, hit-test where it meets the
 *  row, then put it back exactly. Synchronous: no page script runs between. */
function clearWhenHittable(frame, row, box, n, pseudo) {
  if (!pseudo) {
    var had = n.getAttribute("style");
    n.style.setProperty("pointer-events", "auto", "important");
    // Didn't take (a stronger page rule)? Then we can't tell: not clear.
    try { return getComputedStyle(n).pointerEvents === "auto" && frameOnTop(frame, row, box); }
    finally { if (had === null) n.removeAttribute("style"); else n.setAttribute("style", had); }
  }
  var root = n.getRootNode();
  var host = root === document ? (document.head || document.documentElement) : root;
  var st = document.createElement("style");
  st.textContent = "[data-tb-probe]" + pseudo + "{pointer-events:auto !important}";
  n.setAttribute("data-tb-probe", "");
  host.appendChild(st);
  // A strict style-src CSP can block this rule; then we can't tell: not clear.
  try { return getComputedStyle(n, pseudo).pointerEvents === "auto" && frameOnTop(frame, row, box); }
  finally { st.remove(); n.removeAttribute("data-tb-probe"); }
}

if (isExtAlive()) {
  try {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || message.type !== "tb:panel:probe") return false;
      // From the worker only (no tab), for the panel this page shows.
      if (!sender || sender.id !== chrome.runtime.id || sender.tab) return false;
      var r = message.rect;
      var ok = activePanel && activePanel.id === message.id && r && typeof r === "object" &&
        ["left", "top", "width", "height"].every(function (k) { return typeof r[k] === "number" && isFinite(r[k]); });
      try {
        sendResponse(ok ? probePanel(r) : { ok: false, reason: "gone" });
      } catch (e) {
        sendResponse({ ok: false, reason: "error" });
      }
      return false;
    });
  } catch (e) { /* extension reloaded */ }
}

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

      // Site Audit: the worker has already injected axe (vendor/axe.min.js)
      // into the page's MAIN world; the page SDK runs the audit and shows it.
      case "TB_RUN_AUDIT":
        dispatchToPage("tracebug-ext-action", { action: "audit", scan: typeof message.scan === "string" ? message.scan : undefined });
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
