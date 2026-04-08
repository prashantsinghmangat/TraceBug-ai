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

  // Initialize the SDK
  window.TraceBug.init({
    projectId: "tracebug-extension",
    enabled: "all",
    enableDashboard: true,
  });

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

  window.addEventListener("tracebug-ext-action", function (e) {
    var action = e.detail ? e.detail.action : null;
    if (!window.TraceBug || !action) return;

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
