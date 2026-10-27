// ── TraceBug Extension — Page-Context Initializer ───────────────────────────
// Runs in PAGE context. Initializes SDK and wires extension communication.
// Guards against multiple injections with a global flag.
//
// Talks ONLY to window.__TraceBugExtension / window.__TraceBugExtensionSDK —
// never window.TraceBug / window.TraceBugSDK. Those are the npm SDK's names,
// and a host page that embeds its own copy (page mode, no transport) can
// claim them before this script ever runs. window.TraceBug.init() is a no-op
// past the first call, so if this file read/wrote that global, the extension's
// init({transport:"extension"}) would be silently dropped and the page would
// stay in page mode forever — no real tracker sends, wrong settings pointer.
// See docs/launch/sdk-isolation-1.11.2.md. The extension's injected bundle
// (tracebug-sdk-ext.js, a separate tsup output from the same src/index.ts)
// publishes under this distinct global specifically so a page-defined
// TraceBug is invisible to it and can never be adopted.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // ── Prevent double initialization ───────────────────────────────────────
  if (window.__TRACEBUG_INITIALIZED__) return;
  window.__TRACEBUG_INITIALIZED__ = true;

  if (typeof window.__TraceBugExtension === "undefined") {
    console.warn("[TraceBug Extension] SDK not found");
    window.__TRACEBUG_INITIALIZED__ = false;
    return;
  }

  // User-configured redaction rules, published by the content script on
  // <html data-tb-redact> (page world has no chrome.storage access).
  function readRedactRules() {
    try {
      var raw = document.documentElement.getAttribute("data-tb-redact");
      if (!raw) return undefined;
      var parsed = JSON.parse(raw);
      if (parsed && (Array.isArray(parsed.fields) || Array.isArray(parsed.patterns))) return parsed;
    } catch (e) {}
    return undefined;
  }

  // Which integrations are configured, published by the content script on
  // <html data-tb-caps>. BOOLEANS ONLY — the tokens themselves live in
  // chrome.storage.local and never reach the page. This lets the SDK render
  // "configured / not configured" states synchronously without async getters.
  function readIntegrationStatus() {
    try {
      var raw = document.documentElement.getAttribute("data-tb-caps");
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (e) {}
    return null;
  }

  function syncIntegrationStatus() {
    var caps = readIntegrationStatus();
    if (window.__TraceBugExtensionSDK && window.__TraceBugExtensionSDK.setIntegrationStatus) {
      window.__TraceBugExtensionSDK.setIntegrationStatus(caps);
    }
    // Same attribute also carries `hostAccess` — whether <all_urls> is granted,
    // which Phase 1 made optional. Absent means "unknown", and the SDK stays
    // quiet about it rather than claiming the capture is limited.
    if (window.__TraceBugExtensionSDK && window.__TraceBugExtensionSDK.setHostAccess) {
      window.__TraceBugExtensionSDK.setHostAccess(caps ? caps.hostAccess : undefined);
    }
    // ...and the shortcut the browser bound to TraceBug's command. The SDK
    // shows it instead of a hardcoded key, and stands down from its own
    // Ctrl+Shift+B handler when the browser owns that combo — otherwise one
    // press would fire the command AND the page handler.
    if (window.__TraceBugExtensionSDK && window.__TraceBugExtensionSDK.setBoundShortcut) {
      window.__TraceBugExtensionSDK.setBoundShortcut(caps ? caps.shortcut : undefined);
    }
  }

  // Initialize the SDK. `transport: "extension"` is the explicit declaration
  // that secrets must not be kept in page storage — see src/ext-transport.ts.
  window.__TraceBugExtension.init({
    projectId: "tracebug-extension",
    enabled: "all",
    enableDashboard: true,
    transport: "extension",
    redact: readRedactRules(),
  });
  syncIntegrationStatus();

  // Rules edited in the popup mid-session reach the running SDK live: the
  // content script rewrites the attribute; we push it into the sanitizers.
  function syncRedactRules() {
    if (window.__TraceBugExtensionSDK && window.__TraceBugExtensionSDK.setRedactRules) {
      window.__TraceBugExtensionSDK.setRedactRules(readRedactRules());
    }
  }
  try {
    new MutationObserver(syncRedactRules)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tb-redact"] });
  } catch (e) {}
  // Same live-update bridge for the integration status: a token saved in the
  // options page flips the badge in an already-running SDK without a reload.
  try {
    new MutationObserver(syncIntegrationStatus)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tb-caps"] });
  } catch (e) {}
  // The content script publishes both attributes from ASYNC storage reads,
  // which can land between init() reading them and the observers attaching —
  // one explicit sync of each now closes that gap.
  syncRedactRules();
  syncIntegrationStatus();

  console.info("[TraceBug Extension] Active on " + window.location.hostname);

  // ── Extension action handlers (via CustomEvents from content script) ────

  window.addEventListener("tracebug-ext-screenshot", function (e) {
    if (window.__TraceBugExtension && e.detail && e.detail.dataUrl) {
      var screenshots = window.__TraceBugExtension.getScreenshots
        ? window.__TraceBugExtension.getScreenshots()
        : [];
      var count = screenshots.length + 1;
      var name = count.toString().padStart(2, "0") + "_screenshot.png";
      showToast("Screenshot captured: " + name);
    }
  });

  // Re-initialize the SDK if it was torn down via the toolbar's ✕ ("Turn off
  // TraceBug"), which calls TraceBug.destroy() and removes #tracebug-root.
  // Without this, popup actions (Screenshot / Capture / Record) silently no-op
  // because quickCapture() needs the dashboard mounted — even though the
  // extension popup still shows "On".
  function ensureActive() {
    try {
      if (!document.getElementById("tracebug-root") && window.__TraceBugExtension && window.__TraceBugExtension.init) {
        window.__TraceBugExtension.init({ projectId: "tracebug-extension", enabled: "all", enableDashboard: true, transport: "extension", redact: readRedactRules() });
        syncIntegrationStatus();
      }
    } catch (e) {}
  }

  window.addEventListener("tracebug-ext-action", function (e) {
    var action = e.detail ? e.detail.action : null;
    if (!window.__TraceBugExtension || !action) return;
    ensureActive();

    switch (action) {
      case "report":
        if (window.__TraceBugExtension.downloadPdf) {
          window.__TraceBugExtension.downloadPdf();
          showToast("Generating PDF report...");
        }
        break;

      case "github":
        var gh = window.__TraceBugExtension.getGitHubIssue
          ? window.__TraceBugExtension.getGitHubIssue()
          : null;
        if (gh) {
          copyToClipboard(gh).then(function () {
            showToast("GitHub issue copied to clipboard!");
          });
        } else {
          showToast("No session data yet — interact with the page first");
        }
        break;

      case "jira":
        var jira = window.__TraceBugExtension.getJiraTicket
          ? window.__TraceBugExtension.getJiraTicket()
          : null;
        if (jira) {
          var text = jira.summary + "\n\n" + jira.description;
          copyToClipboard(text).then(function () {
            showToast("Jira ticket copied to clipboard!");
          });
        } else {
          showToast("No session data yet — interact with the page first");
        }
        break;

      case "annotate":
        if (window.__TraceBugExtension.isAnnotateModeActive && window.__TraceBugExtension.isAnnotateModeActive()) {
          window.__TraceBugExtension.deactivateAnnotateMode();
          showToast("Annotate mode deactivated");
        } else {
          if (window.__TraceBugExtension.isDrawModeActive && window.__TraceBugExtension.isDrawModeActive()) {
            window.__TraceBugExtension.deactivateDrawMode();
          }
          window.__TraceBugExtension.activateAnnotateMode();
          showToast("Annotate mode: Click elements to annotate. Shift+click for multi-select.");
        }
        break;

      case "draw":
        if (window.__TraceBugExtension.isDrawModeActive && window.__TraceBugExtension.isDrawModeActive()) {
          window.__TraceBugExtension.deactivateDrawMode();
          showToast("Draw mode deactivated");
        } else {
          if (window.__TraceBugExtension.isAnnotateModeActive && window.__TraceBugExtension.isAnnotateModeActive()) {
            window.__TraceBugExtension.deactivateAnnotateMode();
          }
          window.__TraceBugExtension.activateDrawMode();
          showToast("Draw mode: Drag to draw rectangles or ellipses on the page.");
        }
        break;

      case "inspect":
        if (window.__TraceBugExtension.isInspectModeActive && window.__TraceBugExtension.isInspectModeActive()) {
          window.__TraceBugExtension.deactivateInspectMode();
          showToast("Inspect mode deactivated");
        } else if (window.__TraceBugExtension.activateInspectMode) {
          window.__TraceBugExtension.activateInspectMode();
        } else {
          showToast("Inspect requires the latest extension build");
        }
        break;

      case "export_annotations":
        if (window.__TraceBugExtension.exportAnnotationsMarkdown) {
          var md = window.__TraceBugExtension.exportAnnotationsMarkdown();
          if (md) {
            copyToClipboard(md).then(function () {
              showToast("Annotations copied to clipboard as Markdown!");
            });
          } else {
            showToast("No annotations yet");
          }
        }
        break;

      // ── New popup flow ────────────────────────────────────────────────
      // capture-now: the popup's "Screenshot only" action. Capture a fresh
      // screenshot of the current page FIRST (the modal isn't open yet, so the
      // shot is of the real page), then open the Quick Bug modal showing it.
      // quickCapture() itself never auto-captures, so without this the ticket
      // opens empty.
      case "capture-now":
        // Start a session BEFORE taking the screenshot so:
        //   1. getAllSessions() is non-empty → Export .html / GitHub / Jira work
        //   2. clearScreenshots() fires NOW (clean slate), not inside
        //      quickCapture() after the screenshot was already stored.
        // Also required by prepareScreenshot's crop path specifically:
        // takeRegionScreenshot() refuses with no sessionId set yet, unlike
        // takeScreenshot()'s looser fallback. startRecording() sets it
        // synchronously, so it's in place before either runs below.
        if (window.__TraceBugExtension.startRecording) {
          try { window.__TraceBugExtension.startRecording(); } catch (e) {}
        }
        var openModal = function () {
          if (window.__TraceBugExtension.quickCapture) window.__TraceBugExtension.quickCapture();
        };
        var wantsCropShot = !!(e.detail && e.detail.crop);
        var shotDelaySec = (e.detail && e.detail.delaySec) || 0;
        if (window.__TraceBugExtension.prepareScreenshot) {
          Promise.resolve()
            .then(function () { return window.__TraceBugExtension.prepareScreenshot({ crop: wantsCropShot, delaySec: shotDelaySec }); })
            .catch(function () { /* capture failed — still open the modal */ })
            .then(openModal);
        } else if (window.__TraceBugExtension.takeScreenshot) {
          Promise.resolve()
            .then(function () { return window.__TraceBugExtension.takeScreenshot(); })
            .catch(function () { /* capture failed — still open the modal */ })
            .then(openModal);
        } else {
          openModal();
        }
        break;

      // record: the popup's Capture Bug. Since Phase 4 this is an EVENTS-ONLY
      // capture by default — console, network, actions and an interactive DOM
      // replay, with no screen-share picker and no OS permission. `video`
      // (the popup's "Record video too") opts into the screen recording, and
      // only then do `withMic` / `surfaceMode` mean anything: offscreen.js
      // calls getUserMedia({audio: true}) when withMic is truthy.
      case "record":
        var wantsVideo = !!(e.detail && e.detail.video);
        if (window.__TraceBugExtension.prepareRecording) {
          // Pre-capture flow: optional blur-first pass + countdown, then go.
          window.__TraceBugExtension.prepareRecording({
            video: wantsVideo,
            withMicrophone: !!(e.detail && e.detail.withMic),
            blurFirst: !!(e.detail && e.detail.blurFirst),
            delaySec: (e.detail && e.detail.delaySec) || 0,
            surfaceMode: (e.detail && e.detail.surfaceMode) || undefined,
          });
        } else if (!wantsVideo && window.__TraceBugExtension.startEventsCapture) {
          window.__TraceBugExtension.startEventsCapture();
        } else if (window.__TraceBugExtension.startVideoRecording) {
          window.__TraceBugExtension.startVideoRecording({ withMicrophone: !!(e.detail && e.detail.withMic) });
        } else {
          showToast("Capture requires the latest extension build");
        }
        break;

      // stop: the popup's Stop button, for when a capture is running on this
      // tab but the on-page bar that started it isn't where the user expects
      // to find it. Mirrors whichever stop the on-page UI itself would have
      // called — video vs events-only — using only the SDK's public,
      // already-exported isRecording()/isVideoRecording() state checks, so
      // this never opens an empty ticket modal when nothing is running.
      case "stop":
        var ext = window.__TraceBugExtension;
        if (ext && ext.isVideoRecording && ext.isVideoRecording()) {
          Promise.resolve(ext.stopVideoRecording()).catch(function () {});
        } else if (ext && ext.isRecording && ext.isRecording() && ext.stopEventsCapture) {
          Promise.resolve(ext.stopEventsCapture()).catch(function () {});
        } else {
          showToast("Nothing is being recorded on this tab");
        }
        break;

      // view-tickets: open the offline saved-tickets list from the floating toolbar.
      case "view-tickets":
        var ticketsBtn = document.getElementById("tracebug-toolbar-tickets-btn");
        if (ticketsBtn) {
          ticketsBtn.click();
        } else {
          showToast("Open the toolbar to view tickets");
        }
        break;
    }
  });

  // ── Clipboard (with fallback for unfocused documents) ──────────────────────

  function copyToClipboard(text) {
    // Try modern API first
    if (navigator.clipboard && document.hasFocus()) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback: textarea + execCommand (works even when page is not focused)
    return new Promise(function (resolve) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute(
        "style",
        "position:fixed;left:-9999px;top:-9999px;opacity:0"
      );
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
      resolve();
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(msg) {
    var existing = document.getElementById("tracebug-ext-toast");
    if (existing) existing.remove();

    var toast = document.createElement("div");
    toast.id = "tracebug-ext-toast";
    toast.textContent = msg;
    toast.setAttribute(
      "style",
      "position:fixed;bottom:80px;right:20px;background:#22c55e;color:#fff;" +
        "padding:12px 24px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
        "font-size:13px;font-weight:500;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.3);" +
        "transition:opacity 0.3s;pointer-events:none"
    );
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
    }, 2500);
    setTimeout(function () {
      toast.remove();
    }, 3000);
  }
})();
