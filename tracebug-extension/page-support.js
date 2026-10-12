// ── Page support: can TraceBug run here, and if not, what do we say? ────────
// Phase 3. Two questions, both answered here and nowhere else:
//
//   1. BEFORE injecting — is this URL one a content script can never run on?
//      (browser-internal schemes, the extension galleries, file:// without
//      the file-URL grant). The popup asks this so it can replace the four
//      actions with an explanation instead of letting the user click into a
//      guaranteed failure.
//   2. AFTER a failure — the browser handed us a string like "Cannot access
//      contents of the page at ...". That is accurate and useless. Map it to
//      a sentence with a NEXT ACTION attached.
//
// Both questions used to be answered by an inline scheme list in popup.js and
// by passing the raw browser error to a toast. Pulling them out buys two
// things: the service worker can reach the same answers (the keyboard command
// has no popup to talk through), and tests/page-support.test.ts can load this
// SHIPPED file in a node:vm sandbox — the same pattern as provider-bridge.js
// and secret-migration.js. No chrome.*, no DOM, no I/O in this file.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  // ── Schemes a content script can never be injected into ───────────────────
  // Not a judgement call — the browser refuses, in both engines. Chrome's
  // chrome://, Edge's edge://, Firefox's about:/resource:/moz-extension://,
  // and view-source: on both.
  var BLOCKED_SCHEMES = [
    "chrome://",
    "chrome-extension://",
    "chrome-untrusted://",
    "edge://",
    "about:",
    "moz-extension://",
    "resource://",
    "view-source:",
    "devtools://",
  ];

  // ── Hosts the browser protects even over https ────────────────────────────
  // The extension galleries are script-injection-proof by policy, not by
  // scheme, so a scheme test misses them. The web store is the first page a
  // brand-new user has open — missing it was the audit's own first-run
  // scenario. Matched on hostname (exact or a subdomain), never on substring:
  // "chromewebstore.google.com.evil.test" must NOT match.
  var BLOCKED_HOSTS = [
    "chromewebstore.google.com",
    "chrome.google.com", // the legacy /webstore path lives here
    "addons.mozilla.org",
    "accounts.firefox.com",
    "microsoftedge.microsoft.com",
    "addons.opera.com",
  ];

  var DEMO_URL = "https://tracebug.dev/try.html";

  function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ""; }
  }

  function hostBlocked(host) {
    if (!host) return false;
    for (var i = 0; i < BLOCKED_HOSTS.length; i++) {
      var b = BLOCKED_HOSTS[i];
      if (host === b || host.endsWith("." + b)) return true;
    }
    return false;
  }

  /**
   * Can TraceBug run on this URL?
   *
   * @param {string|undefined} url      tab.url — may be undefined when neither
   *                                    activeTab nor a host permission is in play
   * @param {{fileAccess?: boolean}} [opts]
   *        fileAccess: result of chrome.extension.isAllowedFileSchemeAccess().
   *        Pass `undefined` when it could not be asked (Firefox has no such
   *        API) — an unknown grant must not be reported as a denial, so a
   *        file:// URL is then allowed through and the injection error speaks.
   * @returns {{ok: true} | {ok: false, reason: string, title: string, detail: string, action: string|null, url?: string}}
   */
  function classifyPage(url, opts) {
    var o = opts || {};

    if (!url || typeof url !== "string") {
      // No URL at all. Phase 1 made <all_urls> optional, so this is now the
      // NORMAL state on a tab the user has not acted on yet — it means "we
      // can't see the address", not "this page is restricted". Let the action
      // proceed: the click itself grants activeTab, and a real restriction
      // surfaces as an injection error we can map.
      return { ok: true };
    }

    var lower = url.toLowerCase();

    for (var i = 0; i < BLOCKED_SCHEMES.length; i++) {
      if (lower.indexOf(BLOCKED_SCHEMES[i]) === 0) {
        return {
          ok: false,
          reason: "browser-internal",
          title: "TraceBug can’t run on this page",
          detail: "Browsers block extensions on their own pages and the extension store.",
          action: "demo",
          url: DEMO_URL,
        };
      }
    }

    if (lower.indexOf("file://") === 0) {
      // Only a KNOWN denial is reported. `undefined` means we could not ask.
      if (o.fileAccess === false) {
        return {
          ok: false,
          reason: "file-no-access",
          title: "Allow access to local files",
          detail: "To capture pages opened from your computer, turn on “Allow access to file URLs” for TraceBug.",
          action: "file-access",
        };
      }
      return { ok: true };
    }

    if (hostBlocked(hostOf(url))) {
      return {
        ok: false,
        reason: "webstore",
        title: "TraceBug can’t run on this page",
        detail: "Browsers block extensions on their own pages and the extension store.",
        action: "demo",
        url: DEMO_URL,
      };
    }

    return { ok: true };
  }

  // ── Failure → sentence + next action ──────────────────────────────────────
  // The left-hand patterns are the REAL strings Chrome and Firefox produce.
  // Order matters: the host-permission message also contains "permission", so
  // it has to be tested before the broader cannot-access pattern.
  var ERROR_MAP = [
    {
      // Orphaned tab: the content script belongs to a previous extension
      // instance (update, reload, disable→enable). Nothing can reach it.
      test: /extension context invalidated|receiving end does not exist|could not establish connection/i,
      reason: "orphaned",
      title: "Reload this tab to capture",
      detail: "TraceBug was updated while this tab was open.",
      action: "reload",
    },
    {
      // A page that is walled off no matter what the user grants. Tested
      // BEFORE the permission patterns below, because Chrome words this one
      // as a permission problem too ("Cannot access contents of url
      // 'chrome://extensions/'. Extension manifest must request permission…")
      // and telling the user to click Allow would be a lie: no grant exists
      // that opens a browser page, an add-on store or the PDF viewer.
      test: /chrome:\/\/|chrome-untrusted:\/\/|chrome-extension:\/\/|edge:\/\/|moz-extension:\/\/|resource:\/\/|devtools:\/\/|view-source:|cannot be scripted|extensions gallery|\.pdf\b/i,
      reason: "restricted",
      title: "TraceBug can’t run on this page",
      detail: "Browsers block extensions on their own pages and the extension store.",
      action: "demo",
      url: DEMO_URL,
    },
    {
      // Firefox, and Chrome once the one-shot activeTab grant has expired on
      // an ordinary site. Here "click again and choose Allow" really is the fix.
      test: /missing host permission|does not have permission to access|must request permission/i,
      reason: "needs-access",
      title: "TraceBug needs access to this tab",
      detail: "Click the action again and choose Allow when your browser asks for site access. Capture works on this page either way — site access is what keeps it going after you navigate.",
      action: "retry",
    },
    {
      // Anything else the browser walls off, with no scheme in the message.
      test: /cannot access (the )?contents?|cannot access a chrome|showing error page/i,
      reason: "restricted",
      title: "TraceBug can’t run on this page",
      detail: "Browsers block extensions on their own pages and the extension store.",
      action: "demo",
      url: DEMO_URL,
    },
    {
      // The tab navigated or closed between the click and the injection.
      test: /no tab with id|frame .*was removed|frame was removed|no frame with id|tab was closed|invalid tab/i,
      reason: "page-moved",
      title: "The page changed while TraceBug was starting",
      detail: "Wait for the tab to finish loading, then try again.",
      action: "retry",
    },
    {
      // Strict CSP that refuses the injected bundle. Rare, and the honest
      // answer is "use video", which captures without touching the page.
      test: /content security policy|refused to (load|execute)|blocked by csp/i,
      reason: "csp",
      title: "This site's security policy blocks part of TraceBug",
      detail: "Video capture still works here — it records the tab from outside the page. Start a recording instead of a screenshot capture.",
      action: null,
    },
  ];

  /**
   * Turn a raw browser/runtime error into something a person can act on.
   * Unknown text is PASSED THROUGH as the detail rather than replaced by a
   * vague catch-all: a specific message we didn't anticipate is still more
   * useful to the user (and to a bug report) than "something went wrong".
   *
   * @param {string|Error|undefined} err
   * @returns {{ok: false, reason: string, title: string, detail: string, action: string|null, url?: string}}
   */
  function explainInjectionError(err) {
    var msg = "";
    if (typeof err === "string") msg = err;
    else if (err && typeof err.message === "string") msg = err.message;
    else if (err) { try { msg = String(err); } catch (e) { msg = ""; } }

    for (var i = 0; i < ERROR_MAP.length; i++) {
      if (ERROR_MAP[i].test.test(msg)) {
        var m = ERROR_MAP[i];
        var out = { ok: false, reason: m.reason, title: m.title, detail: m.detail, action: m.action };
        if (m.url) out.url = m.url;
        return out;
      }
    }

    return {
      ok: false,
      reason: "unknown",
      title: "TraceBug couldn't start on this page",
      detail: msg || "Reload the tab and try again.",
      action: "reload",
    };
  }

  root.TraceBugPageSupport = {
    BLOCKED_SCHEMES: BLOCKED_SCHEMES,
    BLOCKED_HOSTS: BLOCKED_HOSTS,
    DEMO_URL: DEMO_URL,
    classifyPage: classifyPage,
    explainInjectionError: explainInjectionError,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
