// ── TraceBug Extension — Popup Script ────────────────────────────────────────
// Controls enable/disable toggle and quick actions for the current site
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "tracebug_enabled_sites";

let currentHostname = "";
let currentTabId = null;

// ── Initialize ──────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if we're on a valid page
  if (
    !tab?.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("unavailable").style.display = "block";
    loadEnabledSites();
    return;
  }

  const url = new URL(tab.url);
  currentHostname = url.hostname;
  currentTabId = tab.id;

  // Display site info
  document.getElementById("hostname").textContent = currentHostname;
  document.getElementById("fullUrl").textContent = url.href;

  // Check current state
  const response = await chrome.runtime.sendMessage({
    type: "GET_STATE",
    hostname: currentHostname,
  });

  const enabled = response?.enabled || false;
  updateUI(enabled);

  // ── Toggle handler ────────────────────────────────────────────────────
  document.getElementById("siteToggle").addEventListener("change", async () => {
    const result = await chrome.runtime.sendMessage({
      type: "TOGGLE_SITE",
      hostname: currentHostname,
      tabId: currentTabId,
    });

    updateUI(result.enabled);
    loadEnabledSites();

    // Reload tab to inject/remove SDK
    chrome.tabs.reload(currentTabId);

    // Show feedback
    showToast(
      result.enabled
        ? "TraceBug enabled — page will reload"
        : "TraceBug disabled — page will reload"
    );
  });

  // ── Quick action handlers ─────────────────────────────────────────────
  document.getElementById("btnAnnotate").addEventListener("click", () => {
    sendAction("TOGGLE_ANNOTATE");
    showButtonSuccess("btnAnnotate", "Active!");
    // Close popup so user can interact with page
    setTimeout(() => window.close(), 300);
  });

  document.getElementById("btnDraw").addEventListener("click", () => {
    sendAction("TOGGLE_DRAW");
    showButtonSuccess("btnDraw", "Active!");
    setTimeout(() => window.close(), 300);
  });

  document.getElementById("btnScreenshot").addEventListener("click", () => {
    sendAction("TAKE_SCREENSHOT");
    showButtonSuccess("btnScreenshot", "Captured!");
  });

  document.getElementById("btnReport").addEventListener("click", () => {
    sendAction("GENERATE_REPORT");
    showButtonSuccess("btnReport", "Opening...");
  });

  document.getElementById("btnGithub").addEventListener("click", () => {
    sendAction("COPY_GITHUB_ISSUE");
    showButtonSuccess("btnGithub", "Copied!");
  });

  document.getElementById("btnJira").addEventListener("click", () => {
    sendAction("COPY_JIRA_TICKET");
    showButtonSuccess("btnJira", "Copied!");
  });

  loadEnabledSites();
});

// ── Update UI state ─────────────────────────────────────────────────────────
function updateUI(enabled) {
  const toggle = document.getElementById("siteToggle");
  const toggleLabel = document.getElementById("toggleLabel");
  const toggleText = document.getElementById("toggleText");
  const statusDot = document.getElementById("statusDot");
  const actions = document.getElementById("actions");
  const recordingBar = document.getElementById("recordingBar");

  toggle.checked = enabled;

  if (enabled) {
    statusDot.className = "status-dot active";
    toggleText.textContent = "TraceBug Active";
    toggleLabel.classList.add("active");
    actions.style.display = "grid";
    recordingBar.style.display = "flex";
  } else {
    statusDot.className = "status-dot";
    toggleText.textContent = "Enable TraceBug";
    toggleLabel.classList.remove("active");
    actions.style.display = "none";
    recordingBar.style.display = "none";
  }
}

// ── Load enabled sites list ─────────────────────────────────────────────────
async function loadEnabledSites() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const sites = result[STORAGE_KEY] || [];
  const listEl = document.getElementById("sitesList");
  const countEl = document.getElementById("sitesCount");

  countEl.textContent = sites.length;

  if (sites.length === 0) {
    listEl.innerHTML = '<div class="no-sites">No sites enabled yet</div>';
    return;
  }

  listEl.innerHTML = sites
    .map(
      (site) => `
      <div class="site-item">
        <div class="site-item-left">
          <div class="site-item-dot"></div>
          <span class="site-item-name">${esc(site)}</span>
        </div>
        <button class="site-remove" data-site="${esc(site)}" title="Remove">✕</button>
      </div>`
    )
    .join("");

  // Remove handlers
  listEl.querySelectorAll(".site-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const site = e.currentTarget.dataset.site;
      await chrome.runtime.sendMessage({
        type: "TOGGLE_SITE",
        hostname: site,
        tabId: currentTabId,
      });

      if (site === currentHostname) {
        updateUI(false);
        chrome.tabs.reload(currentTabId);
      }

      loadEnabledSites();
    });
  });
}

// ── Send action to content script (via background for reliability) ──────────
function sendAction(type) {
  if (!currentTabId) return;
  // Send to background which forwards to content script
  chrome.runtime.sendMessage({ type, tabId: currentTabId }).catch(() => {});
  // Also try direct to content script
  chrome.tabs.sendMessage(currentTabId, { type }).catch(() => {
    showToast("Page not ready — try reloading", true);
  });
}

// ── Show success state on button ────────────────────────────────────────────
function showButtonSuccess(id, label) {
  const btn = document.getElementById(id);
  const origText = btn.querySelector("span").textContent;
  btn.classList.add("success");
  btn.querySelector("span").textContent = label;

  setTimeout(() => {
    btn.classList.remove("success");
    btn.querySelector("span").textContent = origText;
  }, 1800);
}

// ── Show toast notification ─────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const area = document.getElementById("toastArea");
  const content = document.getElementById("toastContent");

  content.textContent = msg;
  content.className = "toast-content" + (isError ? " error" : "");
  area.style.display = "block";

  setTimeout(() => {
    area.style.display = "none";
  }, 2500);
}

// ── Escape HTML ─────────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
