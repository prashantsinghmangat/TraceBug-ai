// ── TraceBug Extension — Background Service Worker ──────────────────────────
// Manages per-site enable/disable and injects SDK via chrome.scripting API.
// Tracks injected tabs to prevent duplicate injection.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tracebug_enabled_sites";

// Track which tabs have been injected (tab ID → true)
const injectedTabs = new Set();

// ── Storage helpers ─────────────────────────────────────────────────────────

async function getEnabledSites() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveEnabledSites(sites) {
  await chrome.storage.local.set({ [STORAGE_KEY]: sites });
}

async function isSiteEnabled(hostname) {
  const sites = await getEnabledSites();
  return sites.includes(hostname);
}

async function toggleSite(hostname) {
  const sites = await getEnabledSites();
  const index = sites.indexOf(hostname);
  let enabled;

  if (index === -1) {
    sites.push(hostname);
    enabled = true;
  } else {
    sites.splice(index, 1);
    enabled = false;
  }

  await saveEnabledSites(sites);
  return enabled;
}

// ── Badge ───────────────────────────────────────────────────────────────────

async function updateBadge(tabId, hostname) {
  const enabled = await isSiteEnabled(hostname);
  try {
    chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" });
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: enabled ? "#22c55e" : "#6b7280",
    });
  } catch {}
}

// ── Inject SDK (once per tab) ───────────────────────────────────────────────

async function injectSDK(tabId) {
  // Prevent duplicate injection
  if (injectedTabs.has(tabId)) return;
  injectedTabs.add(tabId);

  try {
    // Inject content script (message bridge between extension and page)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
    });

    // Inject SDK bundle into page context
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tracebug-sdk.js"],
      world: "MAIN",
    });

    // Inject initializer into page context
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tracebug-init.js"],
      world: "MAIN",
    });
  } catch (err) {
    injectedTabs.delete(tabId);
    console.warn("[TraceBug] Injection failed:", err.message);
  }
}

// ── Auto-inject on navigation complete ──────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on full page load (not partial updates)
  if (changeInfo.status !== "complete" || !tab.url) return;

  // Clear injection tracking on new page load
  injectedTabs.delete(tabId);

  try {
    const url = new URL(tab.url);
    updateBadge(tabId, url.hostname);

    if (await isSiteEnabled(url.hostname)) {
      injectSDK(tabId);
    }
  } catch {}
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      updateBadge(activeInfo.tabId, new URL(tab.url).hostname);
    }
  } catch {}
});

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    isSiteEnabled(message.hostname).then((enabled) => {
      sendResponse({ enabled });
    });
    return true;
  }

  if (message.type === "TOGGLE_SITE") {
    toggleSite(message.hostname).then(async (enabled) => {
      if (message.tabId) {
        updateBadge(message.tabId, message.hostname);
      }
      sendResponse({ enabled });
    });
    return true;
  }

  if (message.type === "CHECK_SITE") {
    isSiteEnabled(message.hostname).then((enabled) => {
      sendResponse({ enabled });
    });
    return true;
  }

  if (message.type === "CAPTURE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // Forward quick actions from popup to content script
  if (
    ["TAKE_SCREENSHOT", "GENERATE_REPORT", "COPY_GITHUB_ISSUE", "COPY_JIRA_TICKET"].includes(message.type)
  ) {
    if (message.tabId) {
      chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
});
