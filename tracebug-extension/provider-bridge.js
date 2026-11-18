// ── Provider bridge: the decision layer, with no I/O ────────────────────────
// Phase 2b. The page→service-worker bridge is the part of TraceBug a hostile
// page would attack. It cannot read the user's GitHub token any more (Phase 2a
// moved it out of the page), but it could try to SPEND it: file issues in the
// user's repo, post to their Slack, burn their LLM credits. The page controls
// the event detail, so every verb is callable by any script on the page.
//
// So: a two-verb allowlist, payloads that carry CONTENT and nothing else, and
// a strict sender check. This file holds only the decisions — no fetch, no
// chrome.* — so tests/provider-bridge.test.ts can load the SHIPPED file in a
// node:vm sandbox and test the real artifact (same pattern as
// secret-migration.js). background.js does the I/O.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  // ── Verb allowlist ────────────────────────────────────────────────────────
  // Exactly two. Anything else — including the tb:rec:* recording verbs, which
  // have their own separate allowlist — is rejected here.
  var VERBS = ["tb:provider:send", "tb:llm:analyze"];

  var TRACKERS = ["github", "linear", "slack"];

  // Trackers that take a title + body and can be picked in the confirm
  // window's Create panel (ADR 010). Slack is a webhook with its own shape.
  var ISSUE_TRACKERS = ["github", "linear"];

  // ADR 010 §4: the Create panel's list/connect messages. These return repo,
  // team and account NAMES, which are private, so they are accepted only from
  // the extension's own pages (see validateExtensionPageSender) — never from a
  // content script, so the page under test can neither call them nor read the
  // answers.
  var TRACKER_UI_VERBS = [
    "tb:tracker:status",
    "tb:tracker:containers",
    "tb:tracker:fields",
    "tb:tracker:connect",
    "tb:tracker:connect-poll",
    "tb:tracker:disconnect",
    // Settings / onboarding: the repo/team to start from next time.
    "tb:tracker:set-default",
  ];

  // The pages allowed to send them.
  var TRACKER_UI_PAGES = ["confirm-send.html", "options.html", "welcome.html"];

  // What a Create-panel choice may carry, at most.
  var MAX_CONTAINER_CHARS = 300;
  var MAX_FIELD_KEYS = 20;
  var MAX_FIELD_VALUES = 100;
  var MAX_VALUE_CHARS = 300;

  // Payload shape, per target. The page may send THESE KEYS AND NO OTHERS.
  // Note what is absent: repo, teamId, webhookUrl, token, apiKey, model,
  // baseUrl, provider URLs. The worker reads all of those from
  // chrome.storage.local, so a page cannot redirect a send or supply a
  // credential even if it guesses the wire format perfectly.
  var SHAPES = {
    github: ["title", "body"],
    linear: ["title", "body"],
    slack: ["text"],
    llm: ["prompt"],
  };

  // Caps. The hard cap is what a send is refused for; above the storage
  // threshold the payload travels through chrome.storage.local instead of
  // sendMessage (see _viaStorage in content-script.js).
  // Per-field and total must be chosen together: with two fields, a total cap
  // above 2x the field cap could never trigger. Both are far above anything a
  // provider accepts anyway (a GitHub issue body maxes out at 64 KB), so these
  // are a denial-of-service guard on our own messaging, not a product limit.
  var MAX_FIELD_BYTES = 2 * 1024 * 1024;      // 2 MB per field
  var MAX_TOTAL_BYTES = 3 * 1024 * 1024;      // 3 MB per send
  var VIA_STORAGE_BYTES = 512 * 1024;         // 512 KB → go via storage

  // LLM rate limit, per origin.
  var RATE_WINDOW_MS = 60 * 1000;
  var RATE_MAX = 10;

  // Pending confirmations.
  var MAX_PENDING_TOTAL = 3;                  // across all tabs
  var CONFIRM_TIMEOUT_MS = 120 * 1000;
  // A tracker send can include signing in and picking a repo, which takes
  // longer than reading a prompt. Still bounded, so nothing waits forever.
  var TRACKER_CONFIRM_TIMEOUT_MS = 10 * 60 * 1000;

  function isVerb(verb) {
    return VERBS.indexOf(verb) !== -1;
  }

  /**
   * Is this message really from our own content script, in the top-level frame
   * of a real tab?
   *
   * - `sender.id !== runtimeId` → another extension, or a spoof attempt.
   * - no `sender.tab` → an extension page (popup, options, the confirm window).
   *   Those must not be able to drive a page-originated send.
   * - `frameId !== 0` → a subframe. A hostile ad iframe must not be able to
   *   file an issue that looks like it came from the page the user is testing.
   */
  function validateSender(sender, runtimeId) {
    if (!sender || typeof sender !== "object") return false;
    if (!runtimeId || sender.id !== runtimeId) return false;
    if (!sender.tab || typeof sender.tab.id !== "number" || sender.tab.id < 0) return false;
    if (sender.frameId !== 0) return false;
    return true;
  }

  /**
   * Is this message from our OWN confirmation window?
   *
   * Separate and stricter than validateSender: an approve/cancel decision is
   * the one thing that turns a queued request into a real API call, so it is
   * accepted only from the document we opened at confirm-send.html.
   *
   * The guard is `sender.url`, which the BROWSER sets from the sending
   * document's own URL — a page cannot choose it. It must be exactly our
   * confirm page (optionally with a query string), and confirm-send.html is
   * deliberately NOT in web_accessible_resources, so a web page cannot load,
   * frame or navigate to it in order to become that document.
   *
   * Note what is NOT checked: the absence of `sender.tab`. An extension page
   * shown in a popup WINDOW has a tab, so "no tab" would reject our own
   * window. A content script keeps the host page's URL, so the URL check
   * already excludes it.
   */
  function validateConfirmSender(sender, runtimeId, confirmUrl) {
    if (!sender || typeof sender !== "object") return false;
    if (!runtimeId || sender.id !== runtimeId) return false;
    if (!confirmUrl || typeof sender.url !== "string") return false;
    // An extension page in a subframe has no business deciding either.
    if (sender.frameId !== undefined && sender.frameId !== 0) return false;
    return sender.url === confirmUrl || sender.url.indexOf(confirmUrl + "?") === 0;
  }

  /**
   * Is this message from one of our own extension pages (`pages`, file names
   * relative to the extension root)? Same guard as validateConfirmSender:
   * `sender.url` is set by the browser from the sending document, and a content
   * script keeps the HOST page's URL, so the page under test can never pass.
   * `extBase` is chrome.runtime.getURL("").
   */
  function validateExtensionPageSender(sender, runtimeId, extBase, pages) {
    if (!sender || typeof sender !== "object") return false;
    if (!runtimeId || sender.id !== runtimeId) return false;
    if (!extBase || typeof sender.url !== "string") return false;
    if (sender.frameId !== undefined && sender.frameId !== 0) return false;
    var list = Array.isArray(pages) ? pages : TRACKER_UI_PAGES;
    for (var i = 0; i < list.length; i++) {
      var full = extBase + list[i];
      if (sender.url === full || sender.url.indexOf(full + "?") === 0 || sender.url.indexOf(full + "#") === 0) return true;
    }
    return false;
  }

  function isIssueTracker(t) {
    return typeof t === "string" && ISSUE_TRACKERS.indexOf(t) !== -1;
  }

  /**
   * Validate and REBUILD the Create panel's choice: which tracker, which
   * container, which field values. It comes from our own window, but it is
   * still input — rebuilt key by key, capped, strings only.
   */
  function validateChoice(choice) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) return { ok: false, error: "Malformed choice." };
    if (!isIssueTracker(choice.tracker)) return { ok: false, error: "Unknown tracker." };
    var container = choice.container;
    if (typeof container !== "string" || !container.trim()) return { ok: false, error: "Pick where to file the issue." };
    if (container.length > MAX_CONTAINER_CHARS) return { ok: false, error: "That destination name is too long." };
    var fields = {};
    var src = choice.fields;
    if (src != null) {
      if (typeof src !== "object" || Array.isArray(src)) return { ok: false, error: "Malformed fields." };
      var keys = Object.keys(src);
      if (keys.length > MAX_FIELD_KEYS) return { ok: false, error: "Too many fields." };
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!/^[a-zA-Z][\w-]{0,40}$/.test(k)) return { ok: false, error: "Bad field name." };
        var v = src[k];
        var list = Array.isArray(v) ? v : [v];
        if (list.length > MAX_FIELD_VALUES) return { ok: false, error: 'Too many values for "' + k + '".' };
        var clean = [];
        for (var j = 0; j < list.length; j++) {
          if (typeof list[j] !== "string") return { ok: false, error: 'Field "' + k + '" must be text.' };
          if (list[j].length > MAX_VALUE_CHARS) return { ok: false, error: 'A value for "' + k + '" is too long.' };
          if (list[j]) clean.push(list[j]);
        }
        fields[k] = Array.isArray(v) ? clean : (clean[0] || "");
      }
    }
    return { ok: true, choice: { tracker: choice.tracker, container: container.trim(), fields: fields } };
  }

  function byteLen(str) {
    // Rough but monotonic, and it never under-reports for ASCII-heavy report
    // text. Avoids needing TextEncoder in the vm sandbox.
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return n;
  }

  /**
   * Validate and REBUILD a payload. The returned object is constructed key by
   * key from the shape, so nothing the page added can survive even by
   * accident.
   *
   * An unexpected key is a rejection, not a silent strip: if a future version
   * of the SDK starts sending a field the worker does not know about, we want a
   * loud error in testing, not a send that quietly ignores half its input.
   */
  function validatePayload(target, payload) {
    var shape = SHAPES[target];
    if (!shape) return { ok: false, error: "Unknown send target." };
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "Malformed payload." };
    }

    var keys = Object.keys(payload);
    for (var i = 0; i < keys.length; i++) {
      if (shape.indexOf(keys[i]) === -1) {
        // Name the field. This is the error a page probing the bridge gets,
        // and the error a developer gets after a refactor — both want it.
        return { ok: false, error: 'Unexpected field "' + keys[i] + '" in payload.' };
      }
    }

    var out = {};
    var total = 0;
    for (var j = 0; j < shape.length; j++) {
      var k = shape[j];
      var v = payload[k];
      if (typeof v !== "string") return { ok: false, error: 'Field "' + k + '" must be a string.' };
      if (k !== "body" && !v.trim()) return { ok: false, error: 'Field "' + k + '" is empty.' };
      var len = byteLen(v);
      if (len > MAX_FIELD_BYTES) {
        return { ok: false, error: "This report is too large to file — export the .html instead." };
      }
      total += len;
      out[k] = v;
    }
    if (total > MAX_TOTAL_BYTES) {
      return { ok: false, error: "This report is too large to file — export the .html instead." };
    }

    return { ok: true, payload: out, bytes: total, viaStorage: total > VIA_STORAGE_BYTES };
  }

  /** Normalize a request into { target, payload } or an error. */
  function validateRequest(verb, data, runtimeId, sender) {
    if (!isVerb(verb)) return { ok: false, error: "Unsupported request type." };
    if (!validateSender(sender, runtimeId)) return { ok: false, error: "Request rejected." };
    if (!data || typeof data !== "object") return { ok: false, error: "Malformed request." };

    if (verb === "tb:llm:analyze") {
      var p = validatePayload("llm", data.payload);
      if (!p.ok) return p;
      return { ok: true, kind: "llm", target: "llm", payload: p.payload, bytes: p.bytes, viaStorage: p.viaStorage };
    }

    var provider = data.provider;
    if (TRACKERS.indexOf(provider) === -1) return { ok: false, error: "Unknown provider." };
    var q = validatePayload(provider, data.payload);
    if (!q.ok) return q;
    return { ok: true, kind: "tracker", target: provider, payload: q.payload, bytes: q.bytes, viaStorage: q.viaStorage };
  }

  // ── Rate limiting (per origin, sliding window) ────────────────────────────

  /**
   * Pure: takes the stored hit list and returns the next one. Kept pure so the
   * worker can persist it to chrome.storage.session — a worker restart must not
   * hand a page a fresh quota.
   */
  function rateLimit(origin, now, state) {
    var all = (state && typeof state === "object") ? state : {};
    var hits = Array.isArray(all[origin]) ? all[origin] : [];
    var recent = hits.filter(function (t) { return typeof t === "number" && now - t < RATE_WINDOW_MS; });
    if (recent.length >= RATE_MAX) {
      var waitMs = RATE_WINDOW_MS - (now - recent[0]);
      var waitS = Math.max(1, Math.ceil(waitMs / 1000));
      var next = {};
      Object.keys(all).forEach(function (k) { next[k] = all[k]; });
      next[origin] = recent;
      return {
        allow: false,
        state: next,
        error: "Too many AI requests from this site — wait " + waitS + "s and try again.",
      };
    }
    recent.push(now);
    var merged = {};
    // Drop origins with no recent hits so this never grows without bound.
    Object.keys(all).forEach(function (k) {
      if (k === origin) return;
      var keep = (Array.isArray(all[k]) ? all[k] : []).filter(function (t) { return now - t < RATE_WINDOW_MS; });
      if (keep.length) merged[k] = keep;
    });
    merged[origin] = recent;
    return { allow: true, state: merged };
  }

  // ── Pending-confirmation bookkeeping ──────────────────────────────────────

  /**
   * One pending confirmation per tab, and at most MAX_PENDING_TOTAL overall.
   * The per-tab rule stops a page from stacking windows; the global rule stops
   * many tabs from doing the same thing at once.
   */
  function canQueue(pending, tabId, now) {
    var ids = Object.keys(pending || {});
    var live = ids.filter(function (id) {
      var p = pending[id];
      return p && (typeof p.expiresAt !== "number" || p.expiresAt > now);
    });
    for (var i = 0; i < live.length; i++) {
      if (pending[live[i]].tabId === tabId) {
        return { ok: false, error: "A send from this tab is already waiting for confirmation." };
      }
    }
    if (live.length >= MAX_PENDING_TOTAL) {
      return { ok: false, error: "Too many sends are waiting for confirmation. Finish one first." };
    }
    return { ok: true };
  }

  /** Drop entries whose deadline has passed. Returns the ids that expired. */
  function reapExpired(pending, now) {
    var expired = [];
    Object.keys(pending || {}).forEach(function (id) {
      var p = pending[id];
      if (p && typeof p.expiresAt === "number" && p.expiresAt <= now) expired.push(id);
    });
    return expired;
  }

  // ── Confirmation-window content ───────────────────────────────────────────

  /**
   * What to show as the destination. NEVER returns the Slack webhook URL: that
   * URL *is* the credential, and the confirmation window is a screen someone
   * can be looking over your shoulder at. Repo and team id are not secrets and
   * are exactly what the user needs to see to spot a redirected send.
   */
  function destinationLabel(target, cfg) {
    var c = cfg || {};
    switch (target) {
      case "github": return (c.github && c.github.repo) || "(choose a repository)";
      case "linear": return (c.linear && c.linear.teamId) ? "team " + c.linear.teamId : "(choose a team)";
      case "slack": return "your configured Slack webhook";
      default: return "";
    }
  }

  /**
   * Things in a report body that behave differently once they land in a
   * tracker, and that the user should see flagged BEFORE approving:
   *
   *  - remote images: GitHub and Slack fetch them to render the issue, which
   *    tells the image's host that the issue was filed (and from where). A
   *    hostile page can use that as a read receipt.
   *  - @mentions: in GitHub and Slack these notify real people. A page that
   *    gets "@channel" into a body gets to ping a whole workspace.
   */
  function previewWarnings(text) {
    var out = [];
    var s = String(text || "");
    var img = /!\[[^\]]*\]\(\s*(https?:)?\/\//i.test(s) || /<img\b[^>]*\bsrc\s*=\s*["']?(https?:)?\/\//i.test(s);
    if (img) out.push("Contains a remote image. Whoever hosts it will see when this issue is viewed.");
    var mention = s.match(/(^|[\s(])@([a-z0-9][a-z0-9._-]{0,38})/gi);
    if (mention) {
      var names = [];
      mention.forEach(function (m) {
        var n = m.trim();
        if (names.indexOf(n) === -1 && names.length < 5) names.push(n);
      });
      out.push("Contains " + mention.length + " @mention" + (mention.length === 1 ? "" : "s") +
        " (" + names.join(", ") + ") — these notify real people.");
    }
    return out;
  }

  var api = {
    VERBS: VERBS,
    TRACKERS: TRACKERS,
    ISSUE_TRACKERS: ISSUE_TRACKERS,
    TRACKER_UI_VERBS: TRACKER_UI_VERBS,
    TRACKER_UI_PAGES: TRACKER_UI_PAGES,
    TRACKER_CONFIRM_TIMEOUT_MS: TRACKER_CONFIRM_TIMEOUT_MS,
    SHAPES: SHAPES,
    MAX_FIELD_BYTES: MAX_FIELD_BYTES,
    MAX_TOTAL_BYTES: MAX_TOTAL_BYTES,
    VIA_STORAGE_BYTES: VIA_STORAGE_BYTES,
    RATE_WINDOW_MS: RATE_WINDOW_MS,
    RATE_MAX: RATE_MAX,
    MAX_PENDING_TOTAL: MAX_PENDING_TOTAL,
    CONFIRM_TIMEOUT_MS: CONFIRM_TIMEOUT_MS,
    isVerb: isVerb,
    validateSender: validateSender,
    validateConfirmSender: validateConfirmSender,
    validateExtensionPageSender: validateExtensionPageSender,
    isIssueTracker: isIssueTracker,
    validateChoice: validateChoice,
    validatePayload: validatePayload,
    validateRequest: validateRequest,
    rateLimit: rateLimit,
    canQueue: canQueue,
    reapExpired: reapExpired,
    destinationLabel: destinationLabel,
    previewWarnings: previewWarnings,
  };

  // Published as a global: the service worker loads this file as a plain
  // script (importScripts on Chrome, background.scripts on Firefox), and
  // tests/provider-bridge.test.ts evaluates it in a vm sandbox — so the shipped
  // file is what's tested.
  if (root) root.TraceBugProviderBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
