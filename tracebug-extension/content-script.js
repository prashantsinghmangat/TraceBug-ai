// ── TraceBug Extension — Content Script ──────────────────────────────────────
// Bridge between extension popup/background and the page-context SDK.
// Does NOT inject <script> tags (CSP blocks that).
// SDK injection is handled by background.js via chrome.scripting.executeScript.
// ─────────────────────────────────────────────────────────────────────────────

// ── Listen for messages from popup/background ───────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "TAKE_SCREENSHOT":
      // Use chrome.tabs.captureVisibleTab via background
      chrome.runtime.sendMessage({ type: "CAPTURE_SCREENSHOT" }, (result) => {
        if (result?.dataUrl) {
          window.dispatchEvent(
            new CustomEvent("tracebug-ext-screenshot", {
              detail: { dataUrl: result.dataUrl },
            })
          );
        }
      });
      sendResponse({ ok: true });
      break;

    case "GENERATE_REPORT":
      window.dispatchEvent(
        new CustomEvent("tracebug-ext-action", {
          detail: { action: "report" },
        })
      );
      sendResponse({ ok: true });
      break;

    case "COPY_GITHUB_ISSUE":
      window.dispatchEvent(
        new CustomEvent("tracebug-ext-action", {
          detail: { action: "github" },
        })
      );
      sendResponse({ ok: true });
      break;

    case "COPY_JIRA_TICKET":
      window.dispatchEvent(
        new CustomEvent("tracebug-ext-action", {
          detail: { action: "jira" },
        })
      );
      sendResponse({ ok: true });
      break;
  }
});
