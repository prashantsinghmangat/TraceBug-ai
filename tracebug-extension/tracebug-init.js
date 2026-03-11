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
          navigator.clipboard.writeText(gh).then(function () {
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
          navigator.clipboard.writeText(text).then(function () {
            showToast("Jira ticket copied to clipboard!");
          });
        } else {
          showToast("No session data yet — interact with the page first");
        }
        break;
    }
  });

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
