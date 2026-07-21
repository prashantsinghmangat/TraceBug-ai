// ── TraceBug Extension — Page-Context Initializer ───────────────────────────
// Runs in PAGE context. Initializes SDK and wires extension communication.
// Guards against multiple injections with a global flag.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  // ── Prevent double initialization ───────────────────────────────────────
  if (window.__TRACEBUG_INITIALIZED__) return;
  window.__TRACEBUG_INITIALIZED__ = true;

  if (typeof window.TraceBug === "undefined") {
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

  // Initialize the SDK
  window.TraceBug.init({
    projectId: "tracebug-extension",
    enabled: "all",
    enableDashboard: true,
    redact: readRedactRules(),
  });

  // Rules edited in the popup mid-session reach the running SDK live: the
  // content script rewrites the attribute; we push it into the sanitizers.
  function syncRedactRules() {
    if (window.TraceBugSDK && window.TraceBugSDK.setRedactRules) {
      window.TraceBugSDK.setRedactRules(readRedactRules());
    }
  }
  try {
    new MutationObserver(syncRedactRules)
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tb-redact"] });
  } catch (e) {}
  // The content script publishes the attribute from an ASYNC storage read,
  // which can land between init() reading it and the observer attaching —
  // one explicit sync now closes that gap.
  syncRedactRules();

  console.info("[TraceBug Extension] Active on " + window.location.hostname);

  // ── Extension action handlers (via CustomEvents from content script) ────

  window.addEventListener("tracebug-ext-screenshot", function (e) {
    if (window.TraceBug && e.detail && e.detail.dataUrl) {
      var screenshots = window.TraceBug.getScreenshots
        ? window.TraceBug.getScreenshots()
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
      if (!document.getElementById("tracebug-root") && window.TraceBug && window.TraceBug.init) {
        window.TraceBug.init({ projectId: "tracebug-extension", enabled: "all", enableDashboard: true, redact: readRedactRules() });
      }
    } catch (e) {}
  }

  window.addEventListener("tracebug-ext-action", function (e) {
    var action = e.detail ? e.detail.action : null;
    if (!window.TraceBug || !action) return;
    ensureActive();

    switch (action) {
      case "report":
        if (window.TraceBug.downloadPdf) {
          window.TraceBug.downloadPdf();
          showToast("Generating PDF report...");
        }
        break;

      case "github":
        var gh = window.TraceBug.getGitHubIssue
          ? window.TraceBug.getGitHubIssue()
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
        var jira = window.TraceBug.getJiraTicket
          ? window.TraceBug.getJiraTicket()
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
        if (window.TraceBug.isAnnotateModeActive && window.TraceBug.isAnnotateModeActive()) {
          window.TraceBug.deactivateAnnotateMode();
          showToast("Annotate mode deactivated");
        } else {
          if (window.TraceBug.isDrawModeActive && window.TraceBug.isDrawModeActive()) {
            window.TraceBug.deactivateDrawMode();
          }
          window.TraceBug.activateAnnotateMode();
          showToast("Annotate mode: Click elements to annotate. Shift+click for multi-select.");
        }
        break;

      case "draw":
        if (window.TraceBug.isDrawModeActive && window.TraceBug.isDrawModeActive()) {
          window.TraceBug.deactivateDrawMode();
          showToast("Draw mode deactivated");
        } else {
          if (window.TraceBug.isAnnotateModeActive && window.TraceBug.isAnnotateModeActive()) {
            window.TraceBug.deactivateAnnotateMode();
          }
          window.TraceBug.activateDrawMode();
          showToast("Draw mode: Drag to draw rectangles or ellipses on the page.");
        }
        break;

      case "export_annotations":
        if (window.TraceBug.exportAnnotationsMarkdown) {
          var md = window.TraceBug.exportAnnotationsMarkdown();
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
        if (window.TraceBug.startRecording) {
          try { window.TraceBug.startRecording(); } catch (e) {}
        }
        var openModal = function () {
          if (window.TraceBug.quickCapture) window.TraceBug.quickCapture();
        };
        if (window.TraceBug.takeScreenshot) {
          Promise.resolve()
            .then(function () { return window.TraceBug.takeScreenshot(); })
            .catch(function () { /* capture failed — still open the modal */ })
            .then(openModal);
        } else {
          openModal();
        }
        break;

      // record: start tab-capture recording (silent — no screen-share picker).
      // Triggers the same code path as clicking the 🎥 toolbar button.
      // `withMic` flows from the popup's mic toggle through background +
      // content-script; offscreen.js calls getUserMedia({audio: true}) when
      // it's truthy, adding a mic track to the recording.
      case "record":
        if (window.TraceBug.startVideoRecording) {
          window.TraceBug.startVideoRecording({ withMicrophone: !!(e.detail && e.detail.withMic) });
        } else {
          showToast("Recording requires the latest extension build");
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
