// ── TraceBug settings (options page) ────────────────────────────────────────
// The ONLY place integration tokens and the AI key are entered. Phase 2 moved
// them here because the page-world SDK shares the host page's DOM and storage
// with the site under test: an in-page form leaks the secret both as you type
// AND as a pre-filled input value.
//
// Reads/writes chrome.storage.local directly. Saved values are NOT echoed back
// into the fields — the page shows a "Configured" pill instead, so a stored
// token is never re-rendered anywhere, not even here.
//
// Phase 2b: saving an integration also REQUESTS that provider's optional host
// permission, because the background worker is what calls the API now and it
// needs access to the one host it will talk to. Optional host permissions add
// no install warning, so a fresh install still shows the smallest warning set.
// ─────────────────────────────────────────────────────────────────────────────

const INT_KEY = "tb_integrations_v1";
const AI_KEY = "tb_ai_config_v1";
const NOTICE_KEY = "tb_migration_notices";
const LLM_SITES_KEY = "tb_llm_sites_v1";

// One host per integration — the ONLY host that integration ever talks to.
// Mirrors optional_host_permissions in build/manifest.base.json and
// PROVIDER_ORIGINS in src/providers/api.ts.
const HOSTS = {
  github: ["https://api.github.com/*"],
  linear: ["https://api.linear.app/*"],
  slack: ["https://hooks.slack.com/*"],
  anthropic: ["https://api.anthropic.com/*"],
  openai: ["https://api.openai.com/*"],
  // Match patterns cannot carry a port, so localhost/* already covers
  // Ollama's default :11434 — but 127.0.0.1 is a different HOST and needs its
  // own pattern.
  ollama: ["http://localhost/*", "http://127.0.0.1/*"],
};

/**
 * The host pattern for the AI provider being saved. Ollama is the only one the
 * user can point somewhere else, and since Phase 1 declared `<all_urls>` as an
 * optional host permission we can request that ONE origin instead of refusing
 * it — so a self-hosted Ollama on another machine works.
 *
 * Must stay SYNCHRONOUS: it runs inside the click handler, before
 * permissions.request(), and an await there would lose the user gesture.
 * Returns null for a URL we cannot parse — the save handler reports that.
 */
function aiHostPatterns(provider, baseUrl) {
  if (provider !== "ollama") return HOSTS[provider] || null;
  var raw = (baseUrl || "").trim();
  if (!raw) return HOSTS.ollama;
  var u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return HOSTS.ollama;
  // Match patterns cannot carry a port, so the port in baseUrl is dropped here
  // on purpose — the pattern covers every port on that host.
  return [u.protocol + "//" + u.hostname + "/*"];
}

/**
 * Wrap a click handler so it asks for host access FIRST.
 *
 * chrome.permissions.request() requires a user gesture, and an `await`
 * before it loses that gesture in Chrome — so the request has to be the first
 * statement in the handler, with the save running in its callback. The save
 * proceeds either way: a declined permission is worth saving the token for,
 * because the user can grant it later by clicking Save again.
 *
 * `granted` is true, false, or null when we could not ask at all.
 */
function withHostAccess(getPatterns, run) {
  return function () {
    let patterns;
    try { patterns = getPatterns(); } catch { patterns = null; }
    if (!patterns || !patterns.length) { run(null); return; }
    try {
      chrome.permissions.request({ origins: patterns }, (granted) => {
        void chrome.runtime.lastError;
        run(granted === true ? true : false);
      });
    } catch {
      run(null);
    }
  };
}

/** Plain words for a decline, appended to whatever the save reported. */
function accessNote(granted, hostLabel) {
  if (granted !== false) return "";
  return " TraceBug has no access to " + hostLabel + " yet, so sending will fail." +
    " Click Save again and choose Allow to fix that — nothing else is needed.";
}

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini",
  ollama: "llama3.1",
};

const $ = (id) => document.getElementById(id);

function get(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (r) => {
        void chrome.runtime.lastError;
        resolve(r || {});
      });
    } catch { resolve({}); }
  });
}

function set(obj) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(obj, () => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message)); else resolve();
      });
    } catch (e) { reject(e); }
  });
}

function say(el, msg, kind, extra) {
  el.textContent = extra ? msg + extra : msg;
  el.className = "status" + (kind ? " " + kind : "");
  // A decline note has to stay on screen — it is the one thing the user has
  // to act on. Only a clean success self-clears.
  if (kind === "ok" && !extra) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

function pill(el, on) {
  el.textContent = on ? "Configured" : "Not configured";
  el.className = "pill" + (on ? " on" : "");
}

// ── Status pills ────────────────────────────────────────────────────────────
// Reflects what is stored WITHOUT reading the secret back into the DOM.

async function refreshPills() {
  const r = await get([INT_KEY, AI_KEY]);
  const i = r[INT_KEY] || {};
  const a = r[AI_KEY] || null;
  pill($("ghPill"), !!(i.github && i.github.token && i.github.repo));
  pill($("lnPill"), !!(i.linear && i.linear.apiKey && i.linear.teamId));
  pill($("slPill"), !!(i.slack && i.slack.webhookUrl));
  pill($("aiPill"), !!(a && a.provider && (a.provider === "ollama" || a.apiKey)));

  // Show the provider/model that is set, which is not secret, so the user can
  // see what they configured without the key being re-rendered.
  if (a && a.provider) {
    $("aiProvider").value = a.provider;
    if (a.model) $("aiModel").placeholder = a.model;
    if (a.baseUrl) $("aiBaseUrl").placeholder = a.baseUrl;
    applyProviderUI();
  }
  if (i.github && i.github.repo) $("ghRepo").value = i.github.repo;
  if (i.linear && i.linear.teamId) $("lnTeam").value = i.linear.teamId;
}

// ── Migration notice ────────────────────────────────────────────────────────
// The content script records a notice when it finds an OLDER token in a site's
// localStorage while extension storage already holds one. Keeping the existing
// config is the safe choice, but silently dropping the other would lose work —
// so name the site and tell the user they may need to re-enter it.

async function showMigrationNotices() {
  const r = await get([NOTICE_KEY]);
  const notices = Array.isArray(r[NOTICE_KEY]) ? r[NOTICE_KEY] : [];
  if (!notices.length) return;

  const lines = notices.map((n) => {
    const site = (n && n.site) || "another site";
    const what = (n && n.what) || "an older token";
    return `Removed ${what} found on ${site}. Re-enter it here if you still need it.`;
  });
  $("migrationNoticeText").textContent = lines.join(" ");
  $("migrationNotice").style.display = "block";
}

$("migrationDismiss").addEventListener("click", async () => {
  try { chrome.storage.local.remove(NOTICE_KEY, () => void chrome.runtime.lastError); } catch {}
  $("migrationNotice").style.display = "none";
});

// ── AI provider ─────────────────────────────────────────────────────────────

function applyProviderUI() {
  const p = $("aiProvider").value;
  // Ollama runs locally and needs no key; it does need a base URL.
  $("aiKeyWrap").style.display = p === "ollama" ? "none" : "block";
  $("aiBaseWrap").style.display = p === "ollama" ? "block" : "none";
  if (!$("aiModel").value) $("aiModel").placeholder = DEFAULT_MODELS[p] || "";
}

$("aiProvider").addEventListener("change", applyProviderUI);

// Every origin a fixed integration or the default Ollama hosts ever requests —
// never removed, even if a custom Ollama URL momentarily resolves to the same
// pattern (it can't, since these are all declared on their own, but a stale
// one-off origin computed for a DIFFERENT custom host must never take one of
// these down with it).
const PROTECTED_ORIGINS = new Set(Object.values(HOSTS).flat());

/**
 * Drop the host permission for a PREVIOUS custom Ollama/OpenAI-compatible
 * base URL, now that it is no longer configured. Only a non-localhost custom
 * host ever reaches here (see `aiHostPatterns`) — `<all_urls>` and every
 * fixed/localhost origin are filtered out by PROTECTED_ORIGINS, so this can
 * only ever remove the one-off grant this settings page itself requested.
 */
async function releaseStaleOrigin(patterns) {
  if (!patterns || !patterns.length) return;
  const stale = patterns.filter((p) => !PROTECTED_ORIGINS.has(p));
  if (!stale.length) return;
  try {
    await new Promise((resolve) => chrome.permissions.remove({ origins: stale }, resolve));
  } catch {}
}

async function saveAI(granted) {
  const provider = $("aiProvider").value;
  const key = $("aiKey").value.trim();
  const model = $("aiModel").value.trim() || DEFAULT_MODELS[provider] || "";
  const baseUrl = $("aiBaseUrl").value.trim();
  const status = $("aiStatus");

  const existing = (await get([AI_KEY]))[AI_KEY] || null;
  // An empty key field means "keep the stored key" — the field is never
  // pre-filled, so blank must not wipe a working config.
  const apiKey = key || (existing && existing.provider === provider ? existing.apiKey || "" : "");

  if (provider !== "ollama" && !apiKey) {
    say(status, "Enter an API key for this provider.", "err");
    return;
  }
  // A base URL we cannot parse is the one case there is no origin to ask for,
  // so it is rejected here rather than saved and failing at send time.
  if (provider === "ollama" && baseUrl && !aiHostPatterns(provider, baseUrl)) {
    say(status, "That base URL isn't usable — enter a full http:// or https:// URL, e.g. http://localhost:11434.", "err");
    return;
  }

  // The origin a PREVIOUS save requested, if this save is changing or
  // dropping a custom Ollama/OpenAI-compatible host — computed before the
  // new config overwrites `existing`, so there is still something to compare.
  const oldPatterns = existing && existing.provider === "ollama"
    ? aiHostPatterns("ollama", existing.baseUrl)
    : null;
  const newPatterns = provider === "ollama" ? aiHostPatterns(provider, baseUrl) : null;

  try {
    await set({ [AI_KEY]: { provider, apiKey, model, baseUrl: baseUrl || undefined } });
    $("aiKey").value = "";
    await refreshPills();
    if (oldPatterns && (!newPatterns || oldPatterns[0] !== newPatterns[0])) {
      await releaseStaleOrigin(oldPatterns);
    }
    // Name the host when Ollama points somewhere other than this machine —
    // "your local Ollama" would be wrong, and the decline note has to say
    // which site the user is being asked to allow.
    var label = provider;
    if (provider === "ollama") {
      var h = "";
      try { h = baseUrl ? new URL(baseUrl).hostname : ""; } catch (e) {}
      label = (!h || h === "localhost" || h === "127.0.0.1") ? "your local Ollama" : h;
    }
    say(status, "Saved.", "ok", accessNote(granted, label));
  } catch (e) {
    say(status, "Couldn't save: " + (e.message || "storage error"), "err");
  }
}

$("aiSave").addEventListener("click", withHostAccess(
  () => aiHostPatterns($("aiProvider").value, $("aiBaseUrl").value),
  saveAI,
));

$("aiClear").addEventListener("click", async () => {
  const existing = (await get([AI_KEY]))[AI_KEY] || null;
  const oldPatterns = existing && existing.provider === "ollama"
    ? aiHostPatterns("ollama", existing.baseUrl)
    : null;
  try {
    chrome.storage.local.remove(AI_KEY, async () => {
      void chrome.runtime.lastError;
      $("aiKey").value = "";
      $("aiModel").value = "";
      await refreshPills();
      await releaseStaleOrigin(oldPatterns);
      say($("aiStatus"), "Removed.", "ok");
    });
  } catch {
    say($("aiStatus"), "Couldn't remove the key.", "err");
  }
});

// ── Trackers ────────────────────────────────────────────────────────────────

/** Merge one provider's config into the stored integrations object. */
async function saveProvider(name, value, statusEl, note) {
  try {
    const cfg = (await get([INT_KEY]))[INT_KEY] || {};
    cfg[name] = value;
    await set({ [INT_KEY]: cfg });
    await refreshPills();
    say(statusEl, "Saved.", "ok", note);
    return true;
  } catch (e) {
    say(statusEl, "Couldn't save: " + (e.message || "storage error"), "err");
    return false;
  }
}

async function clearProvider(name, statusEl, fields) {
  try {
    const cfg = (await get([INT_KEY]))[INT_KEY] || {};
    delete cfg[name];
    await set({ [INT_KEY]: cfg });
    (fields || []).forEach((id) => { $(id).value = ""; });
    await refreshPills();
    say(statusEl, "Removed.", "ok");
  } catch (e) {
    say(statusEl, "Couldn't remove: " + (e.message || "storage error"), "err");
  }
}

/** Blank secret field = keep what's stored (fields are never pre-filled). */
async function keptSecret(name, field) {
  const typed = $(field).value.trim();
  if (typed) return typed;
  const cfg = (await get([INT_KEY]))[INT_KEY] || {};
  const prev = cfg[name] || {};
  return prev.token || prev.apiKey || prev.webhookUrl || "";
}

async function saveGitHub(granted) {
  const status = $("ghStatus");
  const repo = $("ghRepo").value.trim();
  const token = await keptSecret("github", "ghToken");
  if (!token) { say(status, "Enter a personal access token.", "err"); return; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { say(status, 'Repository must look like "owner/repo".', "err"); return; }
  const note = accessNote(granted, "api.github.com");
  if (await saveProvider("github", { token, repo }, status, note)) $("ghToken").value = "";
}

$("ghSave").addEventListener("click", withHostAccess(() => HOSTS.github, saveGitHub));

$("ghClear").addEventListener("click", () => clearProvider("github", $("ghStatus"), ["ghToken", "ghRepo"]));

async function saveLinear(granted) {
  const status = $("lnStatus");
  const teamId = $("lnTeam").value.trim();
  const apiKey = await keptSecret("linear", "lnKey");
  if (!apiKey) { say(status, "Enter a Linear API key.", "err"); return; }
  if (!teamId) { say(status, "Enter the team ID.", "err"); return; }
  const note = accessNote(granted, "api.linear.app");
  if (await saveProvider("linear", { apiKey, teamId }, status, note)) $("lnKey").value = "";
}

$("lnSave").addEventListener("click", withHostAccess(() => HOSTS.linear, saveLinear));

$("lnClear").addEventListener("click", () => clearProvider("linear", $("lnStatus"), ["lnKey", "lnTeam"]));

async function saveSlack(granted) {
  const status = $("slStatus");
  const webhookUrl = await keptSecret("slack", "slHook");
  if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    say(status, "Enter a Slack incoming-webhook URL (https://hooks.slack.com/…).", "err");
    return;
  }
  // Granting hooks.slack.com is what lets the worker read Slack's REAL reply
  // instead of guessing from an opaque response — so a declined grant costs a
  // real confirmation, not just future-proofing.
  const note = granted === false
    ? " TraceBug has no access to hooks.slack.com, so it can post but cannot confirm delivery." +
      " Click Save again and choose Allow for real confirmation."
    : "";
  if (await saveProvider("slack", { webhookUrl }, status, note)) $("slHook").value = "";
}

$("slSave").addEventListener("click", withHostAccess(() => HOSTS.slack, saveSlack));

$("slClear").addEventListener("click", () => clearProvider("slack", $("slStatus"), ["slHook"]));

// ── Sites allowed to run AI analysis ────────────────────────────────────────
// The first AI analysis on a site is confirmed by the user, and the approval is
// remembered per origin so we only ask once. This is where it is revoked.

async function renderLlmSites() {
  const wrap = $("llmSites");
  const empty = $("llmSitesEmpty");
  if (!wrap) return;
  const sites = (await get([LLM_SITES_KEY]))[LLM_SITES_KEY] || {};
  const origins = Object.keys(sites).filter((o) => sites[o] && sites[o].allowed).sort();

  wrap.textContent = "";
  empty.style.display = origins.length ? "none" : "";

  origins.forEach((origin) => {
    const row = document.createElement("div");
    row.className = "siterow";

    const name = document.createElement("span");
    // Origins are page-controlled strings — textContent, never innerHTML.
    name.className = "siteorigin";
    name.textContent = origin;

    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.type = "button";
    btn.textContent = "Remove";
    btn.addEventListener("click", async () => {
      const current = (await get([LLM_SITES_KEY]))[LLM_SITES_KEY] || {};
      delete current[origin];
      await set({ [LLM_SITES_KEY]: current });
      await renderLlmSites();
      say($("llmSitesStatus"), "Removed. TraceBug will ask again on that site.", "ok");
    });

    row.appendChild(name);
    row.appendChild(btn);
    wrap.appendChild(row);
  });
}

// ── Access to all sites (T-13) ──────────────────────────────────────────────
// The popup no longer offers to request <all_urls> (docs/audit/product-review.md):
// it bought only a cosmetic toolbar-visibility convenience, not a capability
// worth a broad permission prompt. This card only ever shows the way out, for
// anyone who granted it in an earlier version — nothing here can grant it again.
(function initAllUrlsCard() {
  const card = $("allUrlsCard");
  const removeBtn = $("allUrlsRemove");
  const status = $("allUrlsStatus");
  if (!card) return;

  async function refresh() {
    let granted = false;
    try { granted = await chrome.permissions.contains({ origins: ["<all_urls>"] }); } catch {}
    card.style.display = granted ? "block" : "none";
  }

  removeBtn.addEventListener("click", async () => {
    try {
      await new Promise((resolve) => chrome.permissions.remove({ origins: ["<all_urls>"] }, resolve));
    } catch {}
    say(status, "Removed.", "ok");
    await refresh();
  });

  void refresh();
})();

// ── Boot ────────────────────────────────────────────────────────────────────

applyProviderUI();
refreshPills();
showMigrationNotices();
renderLlmSites();

// ── Microphone grant ────────────────────────────────────────────────────────
// Lives here, not in the popup, for one concrete reason: an extension popup is
// dismissed the instant it loses focus, and Chrome's microphone prompt takes
// focus. The prompt therefore kills the popup and the pending getUserMedia
// rejects with NotAllowedError - the user sees a refusal having never been
// asked, and TraceBug appears in no blocked list because it was never blocked.
// An options tab survives the prompt, and the grant persists for the extension
// origin, so the offscreen recorder gets the mic for every later recording.
(function initMicrophoneCard() {
  const grant = document.getElementById("micGrant");
  const check = document.getElementById("micCheck");
  const pill = document.getElementById("micPill");
  const status = document.getElementById("micStatus");
  if (!grant) return;

  function setState(state, message) {
    if (pill) {
      pill.textContent = state;
      pill.className = "pill" + (state === "Granted" ? " ok" : "");
    }
    if (status) status.textContent = message || "";
  }

  async function refresh() {
    // navigator.permissions is the non-intrusive way to ask - it never prompts.
    try {
      const st = await navigator.permissions.query({ name: "microphone" });
      if (st.state === "granted") setState("Granted", "TraceBug can use the microphone when you turn it on for a recording.");
      else if (st.state === "denied") setState("Blocked", "Blocked for this extension. Use the padlock in the address bar of this page, or chrome://settings/content/microphone, to allow it.");
      else setState("Not granted", "Not asked yet.");
    } catch {
      setState("Unknown", "This browser will not say without asking. Use Allow microphone.");
    }
  }

  grant.addEventListener("click", async () => {
    setState("Asking…", "Answer the browser's prompt.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // We only wanted the grant - stop the tracks so no mic light stays on.
      stream.getTracks().forEach((t) => t.stop());
      setState("Granted", "Done. Turn the microphone on in the TraceBug popup before a recording.");
    } catch (err) {
      const name = (err && err.name) || "";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setState("No microphone", "No microphone found on this computer.");
      } else if (name === "NotAllowedError") {
        setState("Blocked", "You declined, or the browser is blocking it. Use the padlock in this page's address bar to allow it, then Re-check.");
      } else {
        setState("Failed", (err && err.message) || "Could not access the microphone.");
      }
    }
  });

  check.addEventListener("click", refresh);
  void refresh();
  // Deep-linked from the popup's mic notice.
  if (location.hash === "#mic") {
    document.getElementById("micCard")?.scrollIntoView({ block: "center" });
  }
})();

// ── Record current tab (no picker) — tabCapture optional permission ────────
// Mirrors the popup's own request (popup.js, surfaceTabBtn): both call
// chrome.permissions.request({ permissions: ["tabCapture"] }) directly in a
// click handler. This card exists for anyone who declined in the popup and
// wants a second chance without starting a recording, and for Remove —
// symmetric with the Access-to-all-sites card below. Not shown at all on
// Firefox, which has no chrome.tabCapture (see docs/audit/capture-flow-1.11.3.md).
(function initTabCaptureCard() {
  const card = document.getElementById("tabCaptureCard");
  const grant = document.getElementById("tabCaptureGrant");
  const remove = document.getElementById("tabCaptureRemove");
  const pill = document.getElementById("tabCapturePill");
  const status = document.getElementById("tabCaptureStatus");
  if (!card) return;
  if (!(chrome.tabCapture && chrome.tabCapture.getMediaStreamId)) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  async function refresh() {
    let granted = false;
    try { granted = await new Promise((r) => chrome.permissions.contains({ permissions: ["tabCapture"] }, r)); } catch {}
    if (pill) {
      pill.textContent = granted ? "Granted" : "Not granted";
      pill.className = "pill" + (granted ? " ok" : "");
    }
    if (grant) grant.style.display = granted ? "none" : "";
    if (remove) remove.style.display = granted ? "" : "none";
  }

  grant.addEventListener("click", () => {
    // First statement in the handler, synchronous — same constraint as the
    // popup's request call.
    chrome.permissions.request({ permissions: ["tabCapture"] }, (granted) => {
      void chrome.runtime.lastError;
      if (status) status.textContent = granted ? "Granted." : "Declined.";
      void refresh();
    });
  });

  remove.addEventListener("click", async () => {
    try {
      await new Promise((resolve) => chrome.permissions.remove({ permissions: ["tabCapture"] }, resolve));
    } catch {}
    if (status) status.textContent = "Removed. “Tab” will ask again next time, or fall back to the share picker.";
    await refresh();
  });

  void refresh();
})();
