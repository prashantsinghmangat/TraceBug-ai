// ── TraceBug Extension — Popup ──────────────────────────────────────────────
// Minimal three-action surface:
//   1. Capture Bug Now  → enable site + inject + open Quick Bug modal w/ screenshot
//   2. Record session   → enable site + inject + start tab-capture recording
//   3. View tickets     → enable site + inject + open dashboard panel
// Background handles the enable-and-inject pipeline atomically.

const STORAGE_KEY = "tracebug_enabled_sites";
const THEME_KEY = "tracebug_popup_theme";
const MIC_KEY = "tracebug_mic_enabled";
const REDACT_KEY = "tracebug_redact";
const CLOUD_ENDPOINT_KEY = "tracebug_cloud_endpoint";
// Production default; override for local dev via:
//   chrome.storage.local.set({ tracebug_cloud_endpoint: "http://localhost:3001" })
const DEFAULT_CLOUD_ENDPOINT = "https://tracebug.dev";

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
// Lucide icons (inline SVG) — auto: monitor · dark: moon · light: sun.
function themeIcon(pref) {
  const svg = (paths) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  if (pref === "dark") return svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>');
  if (pref === "light") return svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>');
  return svg('<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>');
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
  themeBtn.innerHTML = themeIcon(loadTheme());
  themeBtn.addEventListener("click", () => {
    const cur = loadTheme();
    const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
    saveTheme(next);
    applyTheme(next);
    themeBtn.innerHTML = themeIcon(next);
  });

  // PHASE2-CLOUD: cloud endpoint + account state disabled for Phase 1 offline release
  // await loadCloudEndpoint();
  // wireAccountButtons();
  // void refreshAccount();

  void initRedactionUI();

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
  // ── Record options — persisted, passed with the record message ───────
  const OPTS_KEY = "tracebug_record_opts";
  const surfaceSel = document.getElementById("optSurface");
  const delaySel = document.getElementById("optDelay");
  const blurCb = document.getElementById("optBlurFirst");
  const optsState = document.getElementById("recordOptsState");
  function loadRecordOpts() {
    try { return JSON.parse(localStorage.getItem(OPTS_KEY)) || {}; } catch { return {}; }
  }
  function saveRecordOpts() {
    const o = { surfaceMode: surfaceSel.value, delaySec: Number(delaySel.value) || 0, blurFirst: !!blurCb.checked };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(o)); } catch {}
    updateOptsState(o);
    return o;
  }
  function updateOptsState(o) {
    const bits = [];
    if (o.surfaceMode === "desktop") bits.push("desktop");
    if (o.delaySec > 0) bits.push(`${o.delaySec}s delay`);
    if (o.blurFirst) bits.push("blur first");
    if (optsState) optsState.textContent = bits.join(" · ");
  }
  {
    const o = loadRecordOpts();
    if (o.surfaceMode) surfaceSel.value = o.surfaceMode;
    if (o.delaySec) delaySel.value = String(o.delaySec);
    blurCb.checked = !!o.blurFirst;
    updateOptsState({ surfaceMode: surfaceSel.value, delaySec: Number(delaySel.value) || 0, blurFirst: blurCb.checked });
    [surfaceSel, delaySel, blurCb].forEach((el) => el.addEventListener("change", saveRecordOpts));
  }

  document.getElementById("btnCaptureBug").addEventListener("click", async () => {
    const o = saveRecordOpts();
    await runCombo("TB_START_RECORDING", "Starting recording…", {
      withMic: micOn,
      blurFirst: o.blurFirst,
      delaySec: o.delaySec,
      surfaceMode: o.surfaceMode,
    });
  });

  // ── Secondary: Screenshot only — old one-shot Capture flow ──────────
  document.getElementById("btnScreenshot").addEventListener("click", async () => {
    await runCombo("TB_CAPTURE_NOW", "Capturing screenshot…");
  });

  // ── Secondary: View tickets ──────────────────────────────────────────
  document.getElementById("btnViewTickets").addEventListener("click", async () => {
    await runCombo("TB_VIEW_TICKETS", "Opening tickets…");
  });

  // ── Secondary: Inspect element — style evidence for design-QA bugs ───
  document.getElementById("btnInspect").addEventListener("click", async () => {
    await runCombo("TB_INSPECT", "Starting inspect…");
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
  ["btnCaptureBug", "btnScreenshot", "btnViewTickets", "btnInspect"].forEach((id) => {
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

// ── Redaction rules ─────────────────────────────────────────────────────────
// App-specific PII fields/patterns masked at capture, on top of the built-in
// token/secret patterns. Synced via chrome.storage.sync; the content script
// hands them to the SDK through <html data-tb-redact>.

function parseRedactFields(raw) {
  return String(raw || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function parseRedactPatterns(raw) {
  return String(raw || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function redactStateLabel(rules) {
  const n = (rules?.fields?.length || 0) + (rules?.patterns?.length || 0);
  return n > 0 ? `${n} rule${n === 1 ? "" : "s"}` : "";
}

async function initRedactionUI() {
  const fieldsTa = document.getElementById("redactFields");
  const patternsTa = document.getElementById("redactPatterns");
  const saveBtn = document.getElementById("redactSave");
  const state = document.getElementById("redactState");
  if (!fieldsTa || !patternsTa || !saveBtn) return;

  try {
    const r = await chrome.storage.sync.get(REDACT_KEY);
    const rules = r?.[REDACT_KEY];
    if (rules) {
      fieldsTa.value = (rules.fields || []).join(", ");
      patternsTa.value = (rules.patterns || []).join("\n");
      state.textContent = redactStateLabel(rules);
    }
  } catch {}

  saveBtn.addEventListener("click", async () => {
    const fields = parseRedactFields(fieldsTa.value);
    const patterns = parseRedactPatterns(patternsTa.value);
    // Reject regexes that don't compile so a typo can't silently no-op.
    const bad = patterns.find((p) => { try { new RegExp(p, "gi"); return false; } catch { return true; } });
    if (bad) {
      showToast(`Invalid regex: ${bad}`, true);
      return;
    }
    const rules = { fields, patterns };
    try {
      await chrome.storage.sync.set({ [REDACT_KEY]: rules });
      state.textContent = redactStateLabel(rules);
      showToast(fields.length + patterns.length > 0
        ? "Redaction rules saved — applies to new captures"
        : "Redaction rules cleared");
    } catch (err) {
      showToast("Save failed: " + (err?.message || err), true);
    }
  });
}
