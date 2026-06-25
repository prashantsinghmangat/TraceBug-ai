// ── TraceBug Extension — Popup ──────────────────────────────────────────────
// Minimal three-action surface:
//   1. Capture Bug Now  → enable site + inject + open Quick Bug modal w/ screenshot
//   2. Record session   → enable site + inject + start tab-capture recording
//   3. View tickets     → enable site + inject + open dashboard panel
// Background handles the enable-and-inject pipeline atomically.

const STORAGE_KEY = "tracebug_enabled_sites";
const THEME_KEY = "tracebug_popup_theme";
const MIC_KEY = "tracebug_mic_enabled";
const CLOUD_ENDPOINT_KEY = "tracebug_cloud_endpoint";
// Production default; override for local dev via:
//   chrome.storage.local.set({ tracebug_cloud_endpoint: "http://localhost:3001" })
const DEFAULT_CLOUD_ENDPOINT = "https://tracebug.netlify.app";

let currentHostname = "";
let currentTabId = null;
let cloudEndpoint = DEFAULT_CLOUD_ENDPOINT;

async function loadCloudEndpoint() {
  try {
    const r = await chrome.storage.local.get(CLOUD_ENDPOINT_KEY);
    const v = r?.[CLOUD_ENDPOINT_KEY];
    if (typeof v === "string" && v.trim()) cloudEndpoint = v.trim().replace(/\/+$/, "");
  } catch {}
}

// ── Account / cloud-sharing block ──────────────────────────────────────────
async function refreshAccount() {
  const loading = document.getElementById("accountLoading");
  const out = document.getElementById("accountOut");
  const inBox = document.getElementById("accountIn");
  if (!loading || !out || !inBox) return;

  loading.style.display = "flex";
  out.style.display = "none";
  inBox.style.display = "none";

  try {
    const res = await fetch(`${cloudEndpoint}/api/me`, { credentials: "include" });
    if (res.status === 401) {
      loading.style.display = "none";
      out.style.display = "block";
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const me = await res.json();
    const email = me.email || "";
    document.getElementById("accountEmail").textContent = email;
    const avatar = document.getElementById("accountAvatar");
    avatar.textContent = (email.charAt(0) || "?").toUpperCase();
    const q = me.quotas || { video: { used: 0, limit: 5 }, screenshot: { used: 0, limit: 10 } };
    document.getElementById("accountQuotaVideo").textContent = `🎥 ${q.video.used}/${q.video.limit}`;
    document.getElementById("accountQuotaScreen").textContent = `📸 ${q.screenshot.used}/${q.screenshot.limit}`;
    const dashLink = document.getElementById("linkDashboard");
    if (dashLink) dashLink.setAttribute("href", `${cloudEndpoint}/dashboard`);
    loading.style.display = "none";
    inBox.style.display = "block";
  } catch (err) {
    // Network blocked, endpoint wrong, etc. — treat as signed-out so user
    // still has an obvious next action.
    loading.style.display = "none";
    out.style.display = "block";
  }
}

function wireAccountButtons() {
  const signIn = document.getElementById("btnSignIn");
  if (signIn) signIn.addEventListener("click", () => {
    chrome.tabs.create({ url: `${cloudEndpoint}/auth?source=extension` });
  });
  const signOut = document.getElementById("btnSignOut");
  if (signOut) signOut.addEventListener("click", async () => {
    try {
      await fetch(`${cloudEndpoint}/api/auth/signout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {}
    refreshAccount();
  });
}

// ── Theme toggle ────────────────────────────────────────────────────────────
function applyTheme(pref) {
  if (pref === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", pref);
}
function themeIcon(pref) {
  return pref === "auto" ? "🌗" : pref === "dark" ? "🌙" : "☀";
}
function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" || v === "auto" ? v : "auto";
  } catch {
    return "auto";
  }
}
function saveTheme(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch {}
}

// Apply persisted theme immediately to avoid a flash.
applyTheme(loadTheme());

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Theme button
  const themeBtn = document.getElementById("themeToggle");
  themeBtn.textContent = themeIcon(loadTheme());
  themeBtn.addEventListener("click", () => {
    const cur = loadTheme();
    const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    saveTheme(next);
    applyTheme(next);
    themeBtn.textContent = themeIcon(next);
  });

  // Cloud-share account state. Loaded in parallel with the tab check so the
  // user sees account info even on chrome:// pages where bug capture is
  // unavailable.
  await loadCloudEndpoint();
  wireAccountButtons();
  void refreshAccount();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Bail out on chrome:// pages, the new-tab page, etc.
  if (
    !tab?.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("unavailable").style.display = "block";
    return;
  }

  const url = new URL(tab.url);
  currentHostname = url.hostname;
  currentTabId = tab.id;

  document.getElementById("hostname").textContent = currentHostname;
  document.getElementById("sitePath").textContent = url.pathname || "/";

  // Show whether the SDK is currently loaded on this tab. Informational
  // only — there's no enable/disable toggle here. Reloading the tab is
  // the way to unload it.
  const stateResponse = await chrome.runtime.sendMessage({
    type: "GET_STATE",
    tabId: currentTabId,
  });
  updateHint(!!stateResponse?.loaded);

  // ── Microphone toggle ────────────────────────────────────────────────
  // Default OFF: no mic permission prompt fires when the user just wants a
  // silent tab recording. Flipping ON tells the offscreen document to also
  // request mic access via getUserMedia({audio: true}), which adds a track
  // to the recording. The pref persists across popup opens.
  let micOn = false;
  try { micOn = localStorage.getItem(MIC_KEY) === "1"; } catch {}
  const micBtn = document.getElementById("micOpt");
  const micPill = document.getElementById("micOptState");
  function applyMicUI() {
    micBtn.classList.toggle("mic-opt-on", micOn);
    micBtn.setAttribute("aria-pressed", micOn ? "true" : "false");
    micPill.textContent = micOn ? "On" : "Off";
  }
  applyMicUI();
  micBtn.addEventListener("click", async () => {
    const turningOn = !micOn;
    if (turningOn) {
      // Request mic permission HERE. The popup is an extension page that can
      // show the permission prompt; the offscreen recorder cannot. A grant
      // persists for the extension origin, so the offscreen getUserMedia({audio})
      // then succeeds and narration is actually included. If denied, stay OFF
      // and tell the user instead of silently recording without a mic.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Microphone not available in this browser", true);
        return;
      }
      try {
        const test = await navigator.mediaDevices.getUserMedia({ audio: true });
        test.getTracks().forEach((t) => t.stop());
      } catch (err) {
        micOn = false;
        try { localStorage.setItem(MIC_KEY, "0"); } catch {}
        applyMicUI();
        showToast(
          err && err.name === "NotAllowedError"
            ? "Microphone blocked — allow it for this extension, then toggle again"
            : "Couldn't access the microphone",
          true,
        );
        return;
      }
    }
    micOn = turningOn;
    try { localStorage.setItem(MIC_KEY, micOn ? "1" : "0"); } catch {}
    applyMicUI();
  });

  // ── Primary: Capture Bug — starts tab-capture recording ──────────────
  // Single hero action. The user reproduces, then hits Stop on the on-page
  // HUD; modal opens with video + screenshot + console + network. Matches
  // Jam's "video is always there" default — the screenshot-only path is a
  // secondary option for users who just want a quick snap.
  document.getElementById("btnCaptureBug").addEventListener("click", async () => {
    await runCombo("TB_START_RECORDING", "Starting recording…", { withMic: micOn });
  });

  // ── Secondary: Screenshot only — old one-shot Capture flow ──────────
  document.getElementById("btnScreenshot").addEventListener("click", async () => {
    await runCombo("TB_CAPTURE_NOW", "Capturing screenshot…");
  });

  // ── Secondary: View tickets ──────────────────────────────────────────
  document.getElementById("btnViewTickets").addEventListener("click", async () => {
    await runCombo("TB_VIEW_TICKETS", "Opening tickets…");
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function runCombo(messageType, busyText, extra) {
  if (!currentTabId) return;
  setBusy(true);
  showToast(busyText);
  try {
    const res = await chrome.runtime.sendMessage({ type: messageType, tabId: currentTabId, ...(extra || {}) });
    if (res?.error) {
      showToast(res.error, true);
      setBusy(false);
      return;
    }
    // Success — close popup so focus returns to the page, where the modal /
    // HUD / panel is about to appear.
    setTimeout(() => window.close(), 350);
  } catch (err) {
    showToast(err?.message || "Failed — see console", true);
    setBusy(false);
  }
}

function setBusy(busy) {
  ["btnCaptureBug", "btnScreenshot", "btnViewTickets"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  });
}

function updateHint(isLoaded) {
  const dot = document.getElementById("hintDot");
  const text = document.getElementById("hintText");
  if (!dot || !text) return;
  if (isLoaded) {
    dot.classList.add("active");
    text.textContent = "TraceBug is loaded on this tab. Reload to remove.";
  } else {
    dot.classList.remove("active");
    text.textContent = "Nothing is tracked until you pick an action above.";
  }
}

function showToast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2500);
}
