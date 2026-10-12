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
// Firefox host-permission state: once the user declines the "<all_urls>"
// doorhanger, don't re-prompt on every click — that punishes a "no".
// Persisted so the decision survives popup reopens.
let hostPermDeclined = false;
// The shortcut the BROWSER bound to TraceBug's capture command, or "" if the
// user has none. Never hardcoded in copy: it is rebindable, and Ctrl+Shift+B
// collides with Chrome's bookmarks bar and Firefox's bookmarks Library, so it
// may well have failed to bind.
let boundShortcut = "";
try {
  chrome.storage.local.get("tb_host_perm_declined", (r) => {
    void chrome.runtime.lastError;
    hostPermDeclined = !!(r && r.tb_host_perm_declined);
  });
} catch {}

// ── Page support (page-support.js, loaded ahead of this file) ───────────────
// build-ext.mjs refuses to produce a build without this file, so a miss means
// a broken dev checkout. Degrade to "allow everything, show the raw error"
// rather than throwing out of DOMContentLoaded — a blank popup would be a
// worse failure than the one we are here to fix.
const PageSupport = globalThis.TraceBugPageSupport || {
  DEMO_URL: "https://tracebug.dev/try.html",
  classifyPage: () => ({ ok: true }),
  explainInjectionError: (e) => ({
    ok: false,
    reason: "unknown",
    title: "TraceBug couldn't start on this page",
    detail: (e && e.message) || String(e || "Reload the tab and try again"),
    action: "reload",
  }),
};
if (!globalThis.TraceBugPageSupport) console.error("[TraceBug] page-support.js did not load");

/**
 * Is "Allow access to file URLs" on? Chrome-only API — Firefox has no
 * equivalent, and there a file:// injection simply works or fails on its own.
 * Returns undefined when it could not be asked, which page-support.js treats
 * as "unknown, don't claim a denial".
 */
function fileSchemeAccess() {
  return new Promise((resolve) => {
    try {
      if (!chrome.extension || !chrome.extension.isAllowedFileSchemeAccess) return resolve(undefined);
      chrome.extension.isAllowedFileSchemeAccess((allowed) => {
        void chrome.runtime.lastError;
        resolve(typeof allowed === "boolean" ? allowed : undefined);
      });
    } catch { resolve(undefined); }
  });
}

/**
 * Replace the four actions with one explanation and at most one button.
 * Every branch here comes from page-support.js — this function only renders.
 * Phase 3: nothing in the popup may end in a no-op.
 */
function showUnavailable(verdict) {
  const main = document.getElementById("mainContent");
  const panel = document.getElementById("unavailable");
  const title = document.getElementById("unavailableTitle");
  const sub = document.getElementById("unavailableSub");
  const btn = document.getElementById("unavailableAction");
  if (!panel || !title || !sub || !btn) return;

  if (main) main.style.display = "none";
  panel.style.display = "block";
  // textContent, not innerHTML: `detail` can carry a browser error string.
  title.textContent = verdict.title || "Can't run on this page";
  sub.textContent = verdict.detail || "";

  const action = verdict.action;
  btn.onclick = null;
  if (!action) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "inline-block";

  if (action === "demo") {
    btn.textContent = "Try it on the bug playground";
    btn.onclick = () => {
      chrome.tabs.create({ url: verdict.url || PageSupport.DEMO_URL });
      window.close();
    };
  } else if (action === "file-access") {
    btn.textContent = "Open extension settings";
    btn.onclick = () => {
      // chrome://extensions/?id=… is the only page carrying the file-URL
      // toggle, and chrome.tabs.create may open it even though we can never
      // inject into it. This branch is reachable on Chrome-family browsers
      // only: the verdict needs isAllowedFileSchemeAccess() to have returned
      // a hard false, and Firefox has no such API.
      try {
        chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id });
        window.close();
      } catch {
        showToast("Open your browser's extensions page and enable file access for TraceBug", true);
      }
    };
  } else if (action === "reload") {
    btn.textContent = "Reload tab";
    btn.onclick = () => {
      if (currentTabId == null) return;
      try { chrome.tabs.reload(currentTabId); } catch {}
      window.close();
    };
  } else if (action === "retry") {
    btn.textContent = "Try again";
    btn.onclick = () => window.location.reload();
  }
}

/** What chrome.commands bound to our capture command. "" = nothing. */
function loadBoundShortcut() {
  return new Promise((resolve) => {
    try {
      if (!chrome.commands || !chrome.commands.getAll) return resolve("");
      const maybe = chrome.commands.getAll((list) => {
        void chrome.runtime.lastError;
        const found = (list || []).find((c) => c && c.name === "tb-quick-capture");
        resolve((found && found.shortcut) || "");
      });
      // Firefox returns a promise and ignores the callback.
      if (maybe && typeof maybe.then === "function") {
        maybe.then(
          (list) => {
            const found = (list || []).find((c) => c && c.name === "tb-quick-capture");
            resolve((found && found.shortcut) || "");
          },
          () => resolve(""),
        );
      }
    } catch { resolve(""); }
  });
}

/**
 * Where the user rebinds extension shortcuts. Branches on the extension URL
 * scheme, which is the thing that actually differs — not on a user-agent
 * string. Firefox has no shortcuts URL of its own; about:addons is where the
 * "Manage Extension Shortcuts" menu lives.
 */
function shortcutsPageUrl() {
  let scheme = "";
  try { scheme = chrome.runtime.getURL(""); } catch {}
  return scheme.startsWith("moz-extension://") ? "about:addons" : "chrome://extensions/shortcuts";
}

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
  void initWhatsNew();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;

  // Can TraceBug run here at all? The scheme/host list and every sentence live
  // in page-support.js so the service worker reaches the same answers (the
  // keyboard command has no popup to talk through) and so they are unit
  // testable. Note what is NOT a blocker any more: a missing tab.url. Phase 1
  // made <all_urls> optional, so an unknown URL is now the normal state on a
  // tab the user hasn't acted on — treating it as "restricted" would have
  // shown "Can't run on this page" on every single page.
  const verdict = PageSupport.classifyPage(tab?.url, { fileAccess: await fileSchemeAccess() });
  if (!verdict.ok) {
    showUnavailable(verdict);
    return;
  }

  let url = null;
  try { url = new URL(tab.url); } catch {}
  currentHostname = url ? url.hostname : "";

  // With site access withheld there is no URL to show. Say "this tab" rather
  // than rendering an empty header that looks broken.
  document.getElementById("hostname").textContent = currentHostname || "this tab";
  document.getElementById("sitePath").textContent = url ? (url.pathname || "/") : "";

  // Show whether the SDK is currently loaded on this tab. Informational
  // only — there's no enable/disable toggle here. Reloading the tab is
  // the way to unload it.
  boundShortcut = await loadBoundShortcut();

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
  // These live in chrome.storage.local, not the popup's localStorage, because
  // the service worker writes the video default on install/update and cannot
  // see localStorage (background.js `seedRecordOptsDefault`). LEGACY_OPTS_KEY
  // is the pre-1.11 localStorage blob, migrated once on first open.
  const OPTS_KEY = "tb_record_opts";
  const LEGACY_OPTS_KEY = "tracebug_record_opts";
  const surfaceSel = document.getElementById("optSurface");
  const delaySel = document.getElementById("optDelay");
  const blurCb = document.getElementById("optBlurFirst");
  const videoCb = document.getElementById("optVideo");
  const optsState = document.getElementById("recordOptsState");
  /**
   * Read the options, migrating the legacy localStorage blob on the way.
   *
   * The migration adopts the legacy blob's fields but only lets its `video`
   * win when the stored value is the worker's seed (`videoSetBy !== "user"`).
   * Ordering makes that necessary: onInstalled runs before the popup is ever
   * opened, so the seed is always already there by the time we get here, and
   * an "only migrate when the key is absent" rule would throw away the choice
   * of a 1.11 user who had turned video on.
   */
  async function loadRecordOpts() {
    let stored = {};
    try { stored = (await chrome.storage.local.get(OPTS_KEY))[OPTS_KEY] || {}; } catch {}
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_OPTS_KEY)); } catch {}
    if (!legacy || typeof legacy !== "object") return stored;
    // An explicit boolean means a 1.11 popup wrote it, i.e. the user was asked
    // and answered — off counts as much as on. A blob with no `video` field at
    // all predates the option and carries no answer.
    const legacyAnswered = typeof legacy.video === "boolean";
    const chosen = stored.videoSetBy === "user" || legacyAnswered;
    const merged = {
      surfaceMode: legacy.surfaceMode ?? stored.surfaceMode,
      delaySec: legacy.delaySec ?? stored.delaySec,
      blurFirst: legacy.blurFirst ?? stored.blurFirst,
      // No answer anywhere → keep the worker's seed. It must NOT fall back to
      // a literal here: an update seeds video ON for an existing user, and a
      // hardcoded `false` would undo that on the first popup open, which is
      // exactly the silent change the seed exists to prevent.
      video: stored.videoSetBy === "user"
        ? stored.video
        : legacyAnswered ? legacy.video : !!stored.video,
      videoSetBy: chosen ? "user" : "default",
    };
    try { await chrome.storage.local.set({ [OPTS_KEY]: merged }); } catch { return stored; }
    // Only drop the old copy once the new one is committed, so a failed write
    // leaves the user's settings where they still get read from.
    try { localStorage.removeItem(LEGACY_OPTS_KEY); } catch {}
    return merged;
  }
  // Who last decided the video setting. Only the checkbox promotes this to
  // "user" (markVideoChosen below) — not a surface change, not a delay change,
  // and not clicking Capture Bug. Accepting a default is not choosing one, and
  // the difference matters: a "user" value is never overwritten by a future
  // install or update seed, so stamping it on a click would freeze someone on
  // a default they never saw. Initialised from storage in the block below.
  let videoSetBy = "default";
  function markVideoChosen() { videoSetBy = "user"; }
  /**
   * Persist the current control values and return them synchronously.
   *
   * The write is deliberately not awaited: the Capture Bug handler calls this
   * and then starts a capture, and gating the hero action on a storage round
   * trip to record a preference the caller already holds buys nothing.
   */
  function saveRecordOpts() {
    const o = {
      video: !!videoCb.checked,
      surfaceMode: surfaceSel.value,
      delaySec: Number(delaySel.value) || 0,
      blurFirst: !!blurCb.checked,
      videoSetBy,
    };
    try { void chrome.storage.local.set({ [OPTS_KEY]: o }); } catch {}
    updateOptsState(o);
    applyVideoUI(o.video);
    return o;
  }
  function updateOptsState(o) {
    const bits = [];
    // Lead with the thing that changes what the browser will do to you.
    bits.push(o.video ? "video" : "no video");
    if (o.video && o.surfaceMode === "desktop") bits.push("desktop");
    if (o.delaySec > 0) bits.push(`${o.delaySec}s delay`);
    if (o.blurFirst) bits.push("blur first");
    if (optsState) optsState.textContent = bits.join(" · ");
  }
  /**
   * Surface and microphone describe a video recording and nothing else, so with
   * video off they are disabled rather than hidden — a control that vanishes
   * reads as a bug, one that greys out reads as "turn the thing above on".
   * The hero button's own label changes too: it is the only part of the popup a
   * user in a hurry reads, and it must not promise a recording it won't make.
   */
  function applyVideoUI(on) {
    surfaceSel.disabled = !on;
    surfaceSel.style.opacity = on ? "" : "0.45";
    const micRow = document.getElementById("micOpt");
    if (micRow) {
      micRow.disabled = !on;
      micRow.style.opacity = on ? "" : "0.45";
      micRow.title = on
        ? "Toggle microphone for the recording"
        : "Turn on “Record video too” in Record options first — there is no audio track without a recording";
    }
    const sub = document.getElementById("ctaSub");
    if (sub) {
      sub.textContent = on
        ? "Records the tab · stop when done"
        : "Console, network & replay · stop when done";
    }
    // Both icons are in popup.html; show one. No innerHTML — see the comment
    // on the markup.
    const iconEvents = document.getElementById("ctaIconEvents");
    const iconVideo = document.getElementById("ctaIconVideo");
    if (iconEvents) iconEvents.style.display = on ? "none" : "";
    if (iconVideo) iconVideo.style.display = on ? "" : "none";
  }
  {
    const o = await loadRecordOpts();
    // The default itself now comes from the worker (off on install, on on
    // update) and from the legacy migration, so this only has to render what
    // was decided. Still `=== true` rather than truthy: a storage read that
    // came back empty must land on off, not on whatever coerces.
    videoCb.checked = o.video === true;
    if (o.videoSetBy === "user") videoSetBy = "user";
    if (o.surfaceMode) surfaceSel.value = o.surfaceMode;
    if (o.delaySec) delaySel.value = String(o.delaySec);
    blurCb.checked = !!o.blurFirst;
    updateOptsState({
      video: videoCb.checked,
      surfaceMode: surfaceSel.value,
      delaySec: Number(delaySel.value) || 0,
      blurFirst: blurCb.checked,
    });
    applyVideoUI(videoCb.checked);
    // The checkbox gets its own handler: toggling it is the one action that
    // means "I have decided about video".
    videoCb.addEventListener("change", () => { markVideoChosen(); saveRecordOpts(); });
    [surfaceSel, delaySel, blurCb].forEach((el) => el.addEventListener("change", saveRecordOpts));
  }

  document.getElementById("btnCaptureBug").addEventListener("click", async () => {
    const o = saveRecordOpts();
    await runCombo("TB_START_RECORDING", o.video ? "Starting recording…" : "Starting capture…", {
      video: o.video,
      // Only meaningful with video on; sent as false/undefined otherwise so the
      // page side can't mistake a leftover pref for a request to record.
      withMic: o.video && micOn,
      blurFirst: o.blurFirst,
      delaySec: o.delaySec,
      surfaceMode: o.video ? o.surfaceMode : undefined,
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
  // Firefox MV3 treats manifest host_permissions as OPT-IN: without a granted
  // origin, re-injection after navigation and captureVisibleTab fail once the
  // one-shot activeTab grant expires. Request it here — this runs inside the
  // button's click handler and MUST be the first await (Firefox rejects
  // permissions.request made after unrelated awaits in the input handler).
  // On Chrome the permission is already granted, so this resolves instantly.
  // If the user declines, activeTab still covers the immediate action — and
  // we remember the decline so they aren't re-prompted on every click.
  let declinedThisClick = false;
  if (!hostPermDeclined) {
    try {
      const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
      if (granted === false) {
        hostPermDeclined = true;
        declinedThisClick = true;
        try { chrome.storage.local.set({ tb_host_perm_declined: true }); } catch {}
      } else {
        try { chrome.storage.local.set({ tb_host_perm_declined: false }); } catch {}
      }
    } catch {}
  }
  setBusy(true);
  showToast(busyText);
  try {
    const res = await chrome.runtime.sendMessage({ type: messageType, tabId: currentTabId, ...(extra || {}) });
    if (res?.error) {
      reportFailure(res.error);
      return;
    }
    // Success — close popup so focus returns to the page, where the modal /
    // HUD / panel is about to appear. If site access was just declined, leave
    // the honest limitation on screen a beat longer before closing.
    if (declinedThisClick) {
      showToast("Works on this page for now — TraceBug stops after navigation without site access (grant it anytime in your browser's extension settings)");
      setTimeout(() => window.close(), 2400);
    } else {
      setTimeout(() => window.close(), 350);
    }
  } catch (err) {
    reportFailure(err);
  }
}

/**
 * An action failed. Phase 3's rule: never a no-op, and never a raw browser
 * string on its own. A mapping that carries a next step takes over the whole
 * popup (a 2.5s toast scrolls an instruction away before it can be read); a
 * mapping without one stays a toast so the user can retry immediately.
 */
function reportFailure(err) {
  setBusy(false);
  const verdict = PageSupport.explainInjectionError(err);
  if (verdict.action) showUnavailable(verdict);
  else showToast(verdict.detail || verdict.title, true);
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

  const base = isLoaded
    ? "TraceBug is loaded on this tab. Reload to remove."
    : "Nothing is tracked until you pick an action above.";

  // The shortcut now works on any tab, cold — it is a real browser command,
  // not a page handler — so the old "once TraceBug is on a page" caveat is
  // gone with it.
  text.textContent = boundShortcut
    ? `${base} Tip: ${boundShortcut} captures a bug on this tab.`
    : `${base} No capture shortcut is set.`;

  dot.classList.toggle("active", !!isLoaded);

  const link = document.getElementById("hintShortcut");
  if (!link) return;
  if (boundShortcut) {
    link.style.display = "none";
    return;
  }
  // Nothing bound — most likely the browser refused Ctrl+Shift+B because it
  // already owns it. Offer the page where the user can pick their own.
  link.style.display = "inline-block";
  link.textContent = "Set a shortcut";
  link.title = `Opens ${shortcutsPageUrl()}, where you can assign a key to TraceBug`;
  link.onclick = () => {
    try {
      chrome.tabs.create({ url: shortcutsPageUrl() });
      window.close();
    } catch {
      showToast("Open your browser's extension shortcuts page to assign a key", true);
    }
  };
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

// ── "What's new" after an update (Phase 4 Step D) ───────────────────────────
// background.js records which version landed (tb_whats_new); the copy lives
// HERE, keyed by that version, and literal. Deliberately not generated from the
// changelog and not templated on the version number: every line below is a
// claim about 1.11 specifically, and three of them stop being true the moment
// 1.12 changes something. A version with no entry shows no card.
//
// The capture line is an INVITATION, not an announcement, and that is load
// bearing: this card is only ever shown on UPDATE, and an updating user keeps
// video ON (background.js seedRecordOptsDefault). "Captures no longer share
// your screen" would be false for every single person who reads it.
const WHATS_NEW_KEY = "tb_whats_new";
const WHATS_NEW = {
  "1.11.0": {
    label: "New in 1.11",
    lines: [
      "New: capture without screen sharing. Turn off Record video too in Record options to try it.",
      "No more “read all your data” warning at install",
      "Tokens and API keys now live in TraceBug settings, not in the sites you test",
      "Every GitHub, Linear or Slack send asks you first",
    ],
    warning: "Set up GitHub, Linear, Slack or an AI key before 1.11? Please revoke and re-create it.",
  },
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The check mark, built with createElementNS rather than innerHTML.
 *
 * innerHTML here is what web-ext flags as UNSAFE_VAR_ASSIGNMENT, and the
 * warning is fair even for a string literal: it makes the next edit to this
 * function an injection point. Six lines of DOM calls, no warning, no risk.
 */
function wnCheckIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M20 6 9 17l-5-5");
  svg.appendChild(path);
  return svg;
}

/**
 * Show the card if, and only if, an update landed on a version this file has
 * copy for. Dismissing clears the key, so it never returns for that version.
 */
async function initWhatsNew() {
  const card = document.getElementById("whatsNew");
  if (!card) return;
  let version = "";
  try { version = (await chrome.storage.local.get(WHATS_NEW_KEY))[WHATS_NEW_KEY] || ""; } catch { return; }
  const copy = WHATS_NEW[version];
  if (!copy) {
    // Either nothing landed, or it landed on a version with nothing to say.
    // Drop a stale flag so it is not reconsidered on every popup open.
    if (version) { try { void chrome.storage.local.remove(WHATS_NEW_KEY); } catch {} }
    return;
  }

  document.getElementById("whatsNewLabel").textContent = copy.label;
  const list = document.getElementById("whatsNewList");
  for (const line of copy.lines) {
    const li = document.createElement("li");
    li.className = "wn-item";
    // The icon is built as nodes; the copy is set as text. Neither path goes
    // through innerHTML.
    const text = document.createElement("span");
    text.textContent = line;
    li.append(wnCheckIcon(), text);
    list.appendChild(li);
  }
  if (copy.warning) {
    const warn = document.getElementById("whatsNewWarn");
    warn.textContent = copy.warning;
    warn.style.display = "";
  }
  document.getElementById("whatsNewGot").addEventListener("click", () => {
    card.style.display = "none";
    try { void chrome.storage.local.remove(WHATS_NEW_KEY); } catch {}
  });
  card.style.display = "";
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
