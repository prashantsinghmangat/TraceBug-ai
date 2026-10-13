// ── Diagnostics without telemetry ───────────────────────────────────────────
// TraceBug sends nothing anywhere, ever. So when something goes wrong the only
// way to find out is for the user to tell us — and the only way they can do
// that usefully is if we hand them something worth pasting.
//
// This builds that something. Two hard rules, both tested:
//
//  1. NO USER DATA. No URLs, no page content, no storage values, no form
//     fields, no email addresses. Not from the page, not from an error message,
//     not from a stack frame. Everything that goes in is either about the
//     BROWSER (version, OS), about TRACEBUG (its version, its own grants, its
//     own code paths), or a classification (`restricted`) rather than a value.
//  2. NOTHING LEAVES ON ITS OWN. The output goes to the clipboard, or into a
//     GitHub issue form the user can read and edit before submitting. There is
//     no upload path in this file and there must never be one.
//
// Loaded as a classic script by background.js (importScripts / Firefox
// background.scripts) and by popup.html, the same way page-support.js is.

(function (root) {
  "use strict";

  // Keep it small: the point is the last few things that went wrong, not a log.
  // Held in chrome.storage.session so it survives a service-worker restart but
  // never touches disk and dies with the browser session.
  var ERROR_KEY = "tb_diag_errors_v1";
  var MAX_ERRORS = 20;
  /** Truncation limits, so one enormous error cannot crowd out the rest. */
  var MAX_MESSAGE = 300;
  var MAX_STACK_FRAMES = 6;

  // ── Scrubbing ─────────────────────────────────────────────────────────────

  /**
   * Remove anything that could identify a user, a site, or their data.
   *
   * Applied to every string that reaches the output, including error messages
   * and stack frames — "Failed to fetch https://acme.internal/orders/4821"
   * names a customer's host AND an order id, and that is a routine error
   * message, not an edge case.
   *
   * Order matters: data: URLs before generic URLs (a data URL contains "://"
   * only sometimes), and extension URLs before generic ones so our own file
   * paths survive as the useful part of a stack.
   */
  function scrub(text) {
    if (typeof text !== "string" || !text) return "";
    var out = text;
    // MARKUP FIRST, before any placeholder is inserted (the placeholders below
    // look like tags). An error message carrying an HTML tag is carrying page
    // content by definition — attribute values are form data, inner text is
    // the user's. Found by tests/diagnostics.test.ts with a card number inside
    // an <input value="...">, which every other rule here let through.
    out = out.replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/gi, "<markup>");
    // Our own code, kept: chrome-extension://<32 chars>/background.js → /background.js
    out = out.replace(/(?:chrome-extension|moz-extension|safari-web-extension):\/\/[^/\s)]+\//gi, "/");
    // data: and blob: payloads — potentially the page's own content.
    out = out.replace(/\bdata:[^\s,]*,[^\s)"']*/gi, "<data>");
    out = out.replace(/\bblob:[^\s)"']+/gi, "<blob>");
    // Any remaining absolute URL is someone's site.
    out = out.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)"']+/gi, "<url>");
    // Local paths, Windows and POSIX.
    out = out.replace(/\b[A-Za-z]:\\[^\s)"']+/g, "<path>");
    out = out.replace(/(?:^|\s)\/(?:Users|home|var|tmp|Volumes)\/[^\s)"']+/g, " <path>");
    // Email addresses, which turn up in error text more often than you'd think.
    out = out.replace(/\b[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}\b/gi, "<email>");
    // Long digit runs — card numbers, phone numbers, account and order ids.
    // 12+ consecutive digits is never a datum we need: stack line numbers are
    // short and version strings are dotted.
    out = out.replace(/\d{12,}/g, "<redacted>");
    // Long opaque runs — tokens, ids, hashes. 24+ chars of base64-ish text is
    // never something we need in order to fix a bug.
    out = out.replace(/\b[A-Za-z0-9_-]{24,}\b/g, function (m) {
      // Keep words that are plainly English-ish (no digits, no mixed case runs).
      return /^[a-z]+$/i.test(m) ? m : "<redacted>";
    });
    return out;
  }

  /** Keep only frames in TraceBug's own code; drop the host page's scripts. */
  function scrubStack(stack) {
    if (typeof stack !== "string" || !stack) return "";
    var lines = stack.split("\n");
    var kept = [];
    for (var i = 0; i < lines.length && kept.length < MAX_STACK_FRAMES; i++) {
      var line = lines[i];
      // The first line is the message; the rest are frames.
      var isFrame = /^\s*at\s/.test(line);
      if (!isFrame) continue;
      // Ours, or anonymous/internal. A frame naming a host-page script is a URL
      // and tells us nothing about TraceBug's code.
      var ours = /(?:chrome|moz|safari-web)-extension:\/\//i.test(line)
        || /\b(?:background|content-script|popup|offscreen|options|welcome|player|provider-bridge|page-support|secret-migration|tracebug-sdk|tracebug-init|tracebug-provider-api|diagnostics)\.js/.test(line)
        || /\(<anonymous>\)|\[native code\]/.test(line);
      if (!ours) continue;
      kept.push(scrub(line).trim());
    }
    return kept.join("\n");
  }

  // ── The error ring ────────────────────────────────────────────────────────

  /**
   * Record one internal error. Best-effort and never throwing: this runs inside
   * error handlers, and an exception here would be invisible and recursive.
   */
  function record(where, err) {
    try {
      var message = "";
      var stack = "";
      if (err && typeof err === "object") {
        message = String(err.message || err.name || err);
        stack = typeof err.stack === "string" ? err.stack : "";
      } else {
        message = String(err);
      }
      var entry = {
        at: Date.now(),
        where: String(where || "unknown").slice(0, 40),
        message: scrub(message).slice(0, MAX_MESSAGE),
        stack: scrubStack(stack),
      };
      if (!entry.message) return;
      var area = root.chrome && root.chrome.storage && root.chrome.storage.session;
      if (!area) return;
      area.get(ERROR_KEY, function (got) {
        try {
          var list = (got && got[ERROR_KEY]) || [];
          if (!Array.isArray(list)) list = [];
          list.push(entry);
          if (list.length > MAX_ERRORS) list = list.slice(list.length - MAX_ERRORS);
          var patch = {};
          patch[ERROR_KEY] = list;
          area.set(patch);
        } catch (e) { /* diagnostics must never break anything */ }
      });
    } catch (e) { /* ditto */ }
  }

  function readErrors() {
    return new Promise(function (resolve) {
      try {
        var area = root.chrome && root.chrome.storage && root.chrome.storage.session;
        if (!area) return resolve([]);
        var maybe = area.get(ERROR_KEY, function (got) {
          var list = (got && got[ERROR_KEY]) || [];
          resolve(Array.isArray(list) ? list : []);
        });
        if (maybe && typeof maybe.then === "function") {
          maybe.then(function (got) {
            var list = (got && got[ERROR_KEY]) || [];
            resolve(Array.isArray(list) ? list : []);
          }, function () { resolve([]); });
        }
      } catch (e) { resolve([]); }
    });
  }

  function clearErrors() {
    try {
      var area = root.chrome && root.chrome.storage && root.chrome.storage.session;
      if (area) area.remove(ERROR_KEY);
    } catch (e) { /* ignore */ }
  }

  /** Attach global handlers in whichever context called this. */
  function install(where) {
    try {
      root.addEventListener("error", function (e) {
        record(where, (e && e.error) || (e && e.message) || "error");
      });
      root.addEventListener("unhandledrejection", function (e) {
        record(where, (e && e.reason) || "unhandled rejection");
      });
    } catch (e) { /* ignore */ }
  }

  // ── Environment, without fingerprinting the user ──────────────────────────

  /**
   * Browser name and major version, and the OS family.
   *
   * This is the one place TraceBug reads the user-agent, and it is REPORTING,
   * not branching — the project rule (feature-detect, never UA-sniff) is about
   * deciding behaviour, and nothing here decides anything. `userAgentData` is
   * preferred because it is both cleaner and less identifying; the UA fallback
   * is reduced to a name and a MAJOR version, never the full string, so the
   * output cannot be used as a fingerprint.
   */
  function environment() {
    var nav = root.navigator || {};
    var out = { browser: "unknown", browserVersion: "", os: "unknown" };
    try {
      var uad = nav.userAgentData;
      if (uad && Array.isArray(uad.brands)) {
        for (var i = 0; i < uad.brands.length; i++) {
          var b = uad.brands[i];
          if (!b || !b.brand) continue;
          if (/not.a.brand/i.test(b.brand)) continue;
          out.browser = b.brand;
          out.browserVersion = String(b.version || "").split(".")[0];
          if (/chrome|edge|firefox/i.test(b.brand)) break; // prefer a real engine name
        }
        if (uad.platform) out.os = String(uad.platform);
      }
    } catch (e) { /* fall through to the UA */ }
    if (out.browser === "unknown" || out.os === "unknown") {
      var ua = String(nav.userAgent || "");
      var m = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/(\d+)/);
      if (m && out.browser === "unknown") {
        out.browser = { Edg: "Edge", OPR: "Opera" }[m[1]] || m[1];
        out.browserVersion = m[2];
      }
      if (out.os === "unknown") {
        if (/Windows/i.test(ua)) out.os = "Windows";
        else if (/Macintosh|Mac OS/i.test(ua)) out.os = "macOS";
        else if (/CrOS/i.test(ua)) out.os = "ChromeOS";
        else if (/Android/i.test(ua)) out.os = "Android";
        else if (/Linux/i.test(ua)) out.os = "Linux";
      }
    }
    return out;
  }

  /**
   * Which of TraceBug's OWN declared optional origins are granted.
   *
   * Reports them by name against a fixed list, and counts anything else without
   * naming it: a user who pointed Ollama at `https://llm.acme.internal` has
   * granted an origin that is their infrastructure, not ours, and naming it
   * here would put a private hostname on the clipboard.
   */
  var KNOWN_ORIGINS = [
    "<all_urls>",
    "https://api.github.com/*",
    "https://api.linear.app/*",
    "https://hooks.slack.com/*",
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ];

  function permissions() {
    return new Promise(function (resolve) {
      try {
        if (!root.chrome || !root.chrome.permissions || !root.chrome.permissions.getAll) {
          return resolve({ granted: [], otherOrigins: 0, api: [] });
        }
        root.chrome.permissions.getAll(function (p) {
          try {
            var origins = (p && p.origins) || [];
            var granted = [];
            var other = 0;
            for (var i = 0; i < origins.length; i++) {
              if (KNOWN_ORIGINS.indexOf(origins[i]) >= 0) granted.push(origins[i]);
              else other++;
            }
            resolve({
              granted: granted,
              otherOrigins: other,
              api: ((p && p.permissions) || []).slice().sort(),
            });
          } catch (e) {
            resolve({ granted: [], otherOrigins: 0, api: [] });
          }
        });
      } catch (e) { resolve({ granted: [], otherOrigins: 0, api: [] }); }
    });
  }

  // ── The report ────────────────────────────────────────────────────────────

  /**
   * Build the diagnostics text.
   *
   * @param {{pageState?: string}} [opts] pageState is a CLASSIFICATION from
   *        page-support.js (`restricted`, `file-no-access`, "ok"), never a URL.
   */
  function build(opts) {
    var o = opts || {};
    return Promise.all([permissions(), readErrors()]).then(function (res) {
      var perms = res[0];
      var errors = res[1];
      var env = environment();
      var version = "";
      try { version = (root.chrome.runtime.getManifest().version) || ""; } catch (e) { /* ignore */ }

      var lines = [];
      lines.push("TraceBug diagnostics");
      lines.push("");
      lines.push("- TraceBug: " + (version || "unknown"));
      lines.push("- Browser: " + env.browser + (env.browserVersion ? " " + env.browserVersion : ""));
      lines.push("- OS: " + env.os);
      lines.push("- Page: " + (o.pageState ? scrub(String(o.pageState)) : "unknown"));
      lines.push("- Site access: " + (perms.granted.indexOf("<all_urls>") >= 0 ? "all sites" : "this tab only"));
      var named = perms.granted.filter(function (g) { return g !== "<all_urls>"; });
      lines.push("- Granted API permissions: " + (perms.api.length ? perms.api.join(", ") : "none"));
      lines.push("- Granted provider origins: " + (named.length ? named.join(", ") : "none")
        + (perms.otherOrigins ? " (+" + perms.otherOrigins + " other, not listed)" : ""));
      lines.push("");
      if (!errors.length) {
        lines.push("No internal errors recorded this session.");
      } else {
        lines.push("Last " + errors.length + " internal error" + (errors.length === 1 ? "" : "s") + ":");
        for (var i = errors.length - 1; i >= 0; i--) {
          var e = errors[i];
          lines.push("");
          lines.push("  [" + (e.where || "?") + "] " + (e.message || ""));
          if (e.stack) {
            lines.push("  " + String(e.stack).split("\n").join("\n  "));
          }
        }
      }
      lines.push("");
      lines.push("No URLs, page content or stored values are included.");
      return lines.join("\n");
    });
  }

  root.TraceBugDiagnostics = {
    ERROR_KEY: ERROR_KEY,
    MAX_ERRORS: MAX_ERRORS,
    KNOWN_ORIGINS: KNOWN_ORIGINS,
    scrub: scrub,
    scrubStack: scrubStack,
    record: record,
    readErrors: readErrors,
    clearErrors: clearErrors,
    install: install,
    environment: environment,
    permissions: permissions,
    build: build,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
