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
  // Only swap the state class: other classes are hooks (the tracker cards find
  // their line by `.acct-status`; overwriting className once lost it for good).
  el.classList.add("status");
  el.classList.remove("ok", "err");
  if (kind) el.classList.add(kind);
  // A decline note has to stay on screen — it is the one thing the user has
  // to act on. Only a clean success self-clears.
  if (kind === "ok" && !extra) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

function pill(el, on, words) {
  const w = words || ["Configured", "Not configured"];
  el.textContent = on ? w[0] : w[1];
  el.className = "pill" + (on ? " on" : "");
}
// The trackers' words, as in the hub and the ticket's ▾ tooltip; shown as a
// dot + word on each connected row.
const TRACKER_WORDS = ["Connected", "Not connected"];
function stateWord(el, on) {
  el.textContent = on ? TRACKER_WORDS[0] : TRACKER_WORDS[1];
  el.className = "state" + (on ? " on" : "");
}

// ── Sections ────────────────────────────────────────────────────────────────
// One section at a time, from the URL hash, so links (the panel's "Manage
// integrations" → #integrations, the popup's #mic) and Back/Forward work.
// #integrations:connect=… and :token=… are hand-offs, handled further down.

const SECTIONS = ["integrations", "ai", "recording", "privacy", "account", "help"];

function sectionOf(hash) {
  const m = /^#([a-z]+)/.exec(hash || "");
  const id = m ? m[1] : "";
  if (id === "mic") return "recording";
  return SECTIONS.includes(id) ? id : "integrations";
}

function showSection(id) {
  document.querySelectorAll(".section").forEach((s) => { s.hidden = s.dataset.section !== id; });
  document.querySelectorAll(".nav-item").forEach((a) => {
    if (a.dataset.section === id) {
      a.setAttribute("aria-current", "page");
      document.title = a.textContent.replace(/\d+$/, "").trim() + " · TraceBug settings";
      // Narrow windows: the nav is a sideways row; keep the current one in view.
      try { a.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
    } else {
      a.removeAttribute("aria-current");
    }
  });
}

showSection(sectionOf(location.hash));
window.addEventListener("hashchange", () => {
  showSection(sectionOf(location.hash));
  window.scrollTo(0, 0);
  followIntegrationsLink();
});

// Theme: the popup's choice (same extension origin, as signin.html reads it),
// and the sidebar's Auto / Light / Dark writes the same key, so the two stay
// in step — a change in either reaches the other (the storage event).
const THEME_KEY = "tracebug_popup_theme";

function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch { return "auto"; }
}

function applyTheme(v) {
  if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
  else document.documentElement.removeAttribute("data-theme");
  document.querySelectorAll("#themeSeg [data-theme-choice]").forEach((b) => {
    const on = b.dataset.themeChoice === v;
    b.setAttribute("aria-checked", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
}

function setTheme(v) {
  try { localStorage.setItem(THEME_KEY, v); } catch {}
  applyTheme(v);
}

applyTheme(readTheme());
window.addEventListener("storage", (e) => { if (e.key === THEME_KEY) applyTheme(readTheme()); });
if ($("themeSeg")) {
  const choices = () => [...$("themeSeg").querySelectorAll("[data-theme-choice]")];
  $("themeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme-choice]");
    if (b) setTheme(b.dataset.themeChoice);
  });
  // A radio group: arrows move and choose.
  $("themeSeg").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const list = choices();
    const i = list.findIndex((b) => b.dataset.themeChoice === readTheme());
    const next = list[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? list.length - 1 : 1)) % list.length];
    setTheme(next.dataset.themeChoice);
    next.focus();
  });
}

// ── Status pills ────────────────────────────────────────────────────────────
// Reflects what is stored WITHOUT reading the secret back into the DOM.

async function refreshPills() {
  const r = await get([INT_KEY, AI_KEY]);
  const i = r[INT_KEY] || {};
  const a = r[AI_KEY] || null;
  // A credential is enough since ADR 010 (the repo/team is picked when filing).
  // renderTrackerAccounts() then refines these with any OAuth sign-in.
  stateWord($("ghPill"), !!(i.github && i.github.token));
  stateWord($("lnPill"), !!(i.linear && i.linear.apiKey));
  const slack = !!(i.slack && i.slack.webhookUrl);
  stateWord($("slPill"), slack);
  // U8: Slack's row (and its Disconnect) only when there is something to disconnect.
  $("slRow").hidden = !slack;
  layoutIntegrations();
  pill($("aiPill"), !!(a && a.provider && (a.provider === "ollama" || a.apiKey)));

  // Show the provider/model that is set, which is not secret, so the user can
  // see what they configured without the key being re-rendered.
  if (a && a.provider) {
    $("aiProvider").value = a.provider;
    if (a.model) $("aiModel").placeholder = a.model;
    if (a.baseUrl) $("aiBaseUrl").placeholder = a.baseUrl;
    applyProviderUI();
  }
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

/**
 * Save a pasted token/key. With API access granted, the worker checks it with
 * GitHub/Linear first (tb:tracker:save-token, as the Create panel does) and
 * saves only a working one. Declined: saved as typed, as before, with the note
 * — the user can allow access later. Either way a stored default repo/team
 * stays (the old forms' optional field is gone; nothing is dropped).
 */
async function saveTrackerSecret(id, field, statusEl, granted, hostLabel) {
  const typed = $(field).value.trim();
  if (!typed) { say(statusEl, id === "linear" ? "Enter a Linear API key." : "Enter a personal access token.", "err"); return; }
  // A GitHub token is never saved unchecked: the same check as the panel (the
  // worker's tb:tracker:save-token), which needs access to the API host.
  // (Linear is frozen for this release and keeps its old path.)
  if (granted === false && id === "github") {
    say(statusEl, "TraceBug needs access to " + hostLabel + " to check the token before saving it. " +
      "Click Save again and choose Allow.", "err");
    return;
  }
  if (granted === false) {
    const cfg = (await get([INT_KEY]))[INT_KEY] || {};
    const value = Object.assign({}, cfg[id] || {}, { apiKey: typed });
    if (await saveProvider(id, value, statusEl, accessNote(granted, hostLabel))) $(field).value = "";
    return;
  }
  say(statusEl, "Checking with " + (id === "linear" ? "Linear" : "GitHub") + "…");
  const res = await trackerMsg("tb:tracker:save-token", { tracker: id, secret: typed });
  if (!res || res.error || !res.ok) {
    say(statusEl, (res && res.error) || "Could not check it.", "err");
    return;
  }
  $(field).value = "";
  statusEl.textContent = "";
  closeConnect();
  await refreshPills();
  say($("intStatus"), "Saved" + (res.account ? " — connected as " + res.account : "") + ".", "ok");
  await renderTrackerAccounts();
}

const saveGitHubToken = withHostAccess(() => HOSTS.github,
  (granted) => saveTrackerSecret("github", "ghToken", $("ghStatus"), granted, "api.github.com"));
$("ghSave").addEventListener("click", () => {
  // One GitHub connection: a token replaces the sign-in — ask first.
  const gh = trackerRows.github;
  if (gh && (gh.via === "oauth" || gh.needsReconnect) && $("ghToken").value.trim()) {
    // The last try's error is about the last token, not this one.
    $("ghStatus").textContent = "";
    askReplace($("ghReplace"), "This replaces your GitHub sign-in" + (gh.account ? " (" + gh.account + ")" : "") + " with this token.",
      saveGitHubToken);
    return;
  }
  saveGitHubToken();
});
$("ghToken").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("ghSave").click(); } });

$("lnSave").addEventListener("click", withHostAccess(() => HOSTS.linear,
  (granted) => saveTrackerSecret("linear", "lnKey", $("lnStatus"), granted, "api.linear.app")));
$("lnKey").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("lnSave").click(); } });

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
  status.textContent = "";
  if (await saveProvider("slack", { webhookUrl }, $("intStatus"), note)) {
    $("slHook").value = "";
    closeConnect();
  }
}

$("slSave").addEventListener("click", withHostAccess(() => HOSTS.slack, saveSlack));
$("slHook").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("slSave").click(); } });

$("slClear").addEventListener("click", () => openDisconnect({ id: "slack", label: "Slack" }, $("slRow").querySelector(".menu-btn")));
$("slChange").addEventListener("click", () => openConnect("slack", { opener: $("slRow").querySelector(".menu-btn") }));

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
    btn.className = "secondary small";
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

// ── Tracker accounts (ADR 010) ──────────────────────────────────────────────
// Sign-in state comes from the worker (tb:tracker:status), which answers this
// page because it is an extension page. It carries the account NAME and how
// it is connected — never a token. Connect is shown only where the build
// supports it (the worker decides by feature detection), so Firefox keeps
// exactly the pasted-token cards it had.

function trackerMsg(type, extra) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch { resolve(null); }
  });
}

const PILL_IDS = { github: "ghPill", linear: "lnPill" };
const STATE_PILL = { connected: ["Connected", " on"], reconnect: ["Needs reconnecting", " warn"], error: ["Error", " warn"] };
const SITES_KEY = "tb_tracker_sites_v1";
// Where GitHub finishes what Disconnect can't (B7, B11) — named in the confirm
// before disconnecting; the worker answers with the same pages afterwards.
const GITHUB_APPS_URL = "https://github.com/settings/apps/authorizations";
const GITHUB_TOKENS_URL = "https://github.com/settings/tokens";
// The last status row per tracker, for the "This replaces…" questions.
const trackerRows = {};

/**
 * One GitHub connection (B11): ask in place before a sign-in replaces a token
 * or a token a sign-in. onYes runs inside the Replace click, so it can still
 * ask the browser for permissions.
 */
function askReplace(box, text, onYes, onNo) {
  if (!box) { onYes(); return; }
  box.querySelector(".acct-confirm-text").textContent = text;
  box.hidden = false;
  box.querySelector(".acct-confirm-yes").onclick = () => { box.hidden = true; onYes(); };
  box.querySelector(".acct-confirm-no").onclick = () => { box.hidden = true; if (onNo) onNo(); };
  box.querySelector(".acct-confirm-yes").focus();
}

/**
 * The small "Saved" beside the control that changed (its row's `.saved`):
 * fades after ~2 s. An error stays until the next change.
 */
function flashSaved(control, ok, text) {
  const el = control && control.closest(".pref-row, .acct-default-wrap");
  const s = el && el.querySelector(".saved");
  if (!s) return;
  clearTimeout(s._fade);
  s.textContent = text || (ok ? "Saved" : "Couldn't save");
  s.classList.toggle("err", !ok);
  s.classList.add("show");
  if (!ok) return;
  s._fade = setTimeout(() => {
    s.classList.remove("show");
    s._fade = setTimeout(() => { s.textContent = ""; }, 300);
  }, 2000);
}

/** Preferences → Remembered choices: "On N sites", Forget off at 0. */
function renderRemembered(all) {
  const n = Object.keys(all || {}).filter((o) => Object.keys((all[o] && all[o].picks) || {}).length).length;
  $("rememberedCount").textContent = "On " + n + " site" + (n === 1 ? "" : "s");
  $("forgetChoices").disabled = n === 0;
}

/** Each row's and tile's logo, from the hub's marks (integrations-hub.js). */
document.querySelectorAll(".int-logo[data-logo]").forEach((el) => {
  const hub = window.TraceBugIntegrationsHub;
  if (hub && !el.firstChild) el.append(hub.logo(el.dataset.logo, 22));
});

/**
 * A tracker is either connected (a row in Connected) or offered (a tile in
 * Add a tracker). Also the count beside Integrations in the sidebar.
 */
function layoutIntegrations() {
  const on = Array.from(document.querySelectorAll("#connectedList .conn-row"))
    .filter((r) => !r.hidden).map((r) => r.dataset.tracker);
  $("connectedEmpty").hidden = on.length > 0;
  let offered = 0;
  document.querySelectorAll(".add-tile").forEach((tile) => {
    tile.hidden = on.includes(tile.dataset.tracker);
    if (!tile.hidden) offered++;
  });
  $("addCard").hidden = !offered;
  $("navIntCount").textContent = String(on.length);
  $("navIntCount").hidden = !on.length;
}

/**
 * One row per connection, from the worker's status (tb:tracker:status): the
 * state in the hub's words, how it's connected (signed in, or a token shown
 * masked), the default repository/team, and the ⋯ menu's actions as they
 * apply. Sign-in is offered only where the build can (feature detection:
 * Firefox and store builds without the GitHub App get the token path, never
 * a dead button).
 */
async function renderTrackerAccounts() {
  const res = await trackerMsg("tb:tracker:status");
  renderRemembered((await get([SITES_KEY]))[SITES_KEY]);
  if (!res || !Array.isArray(res.trackers)) return;
  const conns = (res.summary && res.summary.connections) || [];
  res.trackers.forEach((t) => {
    const row = document.querySelector('.tracker-acct[data-tracker="' + t.id + '"]');
    if (!row) return;
    const conn = conns.find((c) => c.id === t.id) || null;
    const state = conn ? conn.state : null;
    trackerRows[t.id] = t;
    row.hidden = !(conn || t.connected || t.needsReconnect);
    const line = row.querySelector(".acct-line");
    const gh = t.id === "github";
    let text = "";
    // GitHub names its one connection's mode (B11); Linear keeps its words.
    if (t.via === "oauth") text = "Signed in" + (t.account ? " as " + t.account : "") + (gh ? " · GitHub App" : ".");
    else if (t.via === "token" && gh) text = "Using a personal token" + (t.tokenHint ? " " + t.tokenHint : "");
    else if (t.via === "token") text = "Using an API key" + (t.tokenHint ? " " + t.tokenHint : "") + "." +
      (t.needsReconnect ? " Your " + t.label + " sign-in expired." : "");
    else if (t.needsReconnect) text = "Your " + t.label + " sign-in expired. Reconnect to keep filing issues.";
    if (state === "error" && conn.detail) text += " " + conn.detail;
    line.textContent = text;
    line.hidden = !text;

    // ⋯ menu: what applies to this connection. Disconnect is always there.
    const menuBtn = row.querySelector(".menu-btn");
    const reconnect = row.querySelector(".acct-reconnect");
    reconnect.hidden = !(t.needsReconnect && t.canConnect);
    reconnect.onclick = () => startSignIn(t, { opener: menuBtn });
    const manage = row.querySelector(".acct-manage");
    if (manage) {
      manage.hidden = !(gh && t.via === "oauth" && t.manageUrl);
      manage.onclick = () => TraceBugTrackerConnect.openHttps(t.manageUrl);
    }
    const toToken = row.querySelector(".acct-to-token");
    if (toToken) {
      toToken.hidden = !(gh && t.via !== "token");
      toToken.onclick = () => openConnect("github", { pane: "github-token", opener: menuBtn, switching: true });
    }
    const switchLink = row.querySelector(".acct-switch");
    if (switchLink) {
      switchLink.hidden = !(gh && t.via === "token" && t.canConnect);
      switchLink.onclick = () => {
        openConnect("github", { pane: "github-signin", opener: menuBtn, switching: true });
        const pane = paneOf("github-signin");
        askReplace(pane.querySelector(".acct-confirm"),
          "This replaces your token" + (t.tokenHint ? " " + t.tokenHint : "") + ". TraceBug signs in with GitHub instead.",
          () => connectFromOptions(t, pane), closeConnect);
      };
    }
    row.querySelector(".acct-disconnect").onclick = () => openDisconnect(t, menuBtn);

    // Connected (either way): pick the default repo/team here. Its "Saved"
    // sits beside it; errors go to the row's status line.
    const pickWrap = row.querySelector(".acct-default-wrap");
    pickWrap.hidden = !t.connected;
    if (t.connected) {
      const pick = pickWrap.querySelector("select");
      TraceBugTrackerConnect.fillDefaultPicker(t, pick,
        (msg, isErr) => isErr ? say(row.querySelector(".acct-status"), msg, "err", " ") : flashSaved(pick, true));
    }
    const pillEl = $(PILL_IDS[t.id]);
    if (pillEl) {
      const w = STATE_PILL[state] || ["Not connected", ""];
      pillEl.textContent = w[0];
      pillEl.className = "state" + w[1];
    }
    // Linear's connect form (frozen): sign-in where offered, else the key.
    // U8: where the key is the only way in, it's open and says so.
    if (t.id === "linear") {
      const pane = paneOf("linear");
      const connect = pane.querySelector(".acct-connect");
      connect.hidden = !t.canConnect;
      connect.textContent = (t.needsReconnect ? "Reconnect " : "Connect ") + t.label;
      connect.onclick = () => connectFromOptions(t, pane);
      const adv = $("lnAdvanced");
      adv.querySelector("summary").textContent = t.canConnect ? "Use an API key instead" : "Connect with an API key";
      if (!t.canConnect) adv.open = true;
    }
  });
  layoutIntegrations();
  renderDefaultTracker(res.summary);
}

/** The ticket's main button: one of the connections. */
function renderDefaultTracker(summary) {
  const sel = $("defaultTracker");
  if (!sel || !summary) return;
  const conns = summary.connections || [];
  document.querySelectorAll("#connectedList .conn-row").forEach((r) => {
    r.querySelector(".default-pill").hidden = !conns.length || r.dataset.tracker !== (summary.defaultId || conns[0].id);
  });
  sel.textContent = "";
  // Nothing connected: a muted line, not a dead select.
  sel.hidden = !conns.length;
  $("defaultTrackerEmpty").hidden = !!conns.length;
  if (!conns.length) return;
  conns.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.label + (c.state === "connected" ? "" : " (" + STATE_PILL[c.state][0].toLowerCase() + ")");
    sel.appendChild(o);
  });
  sel.value = summary.defaultId || conns[0].id;
}

$("defaultTracker").addEventListener("change", async () => {
  const res = await trackerMsg("tb:tracker:set-primary", { tracker: $("defaultTracker").value });
  flashSaved($("defaultTracker"), !!(res && res.ok));
});

// ── ⋯ menus ─────────────────────────────────────────────────────────────────
// A button that opens a list of actions: arrows move, Esc closes back to the
// button, Tab or a click elsewhere closes.

function closeMenus() {
  document.querySelectorAll('.menu-btn[aria-expanded="true"]').forEach((b) => {
    b.setAttribute("aria-expanded", "false");
    b.nextElementSibling.hidden = true;
  });
}

function menuItems(menu) {
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter((i) => !i.hidden);
}

document.querySelectorAll(".menu-btn").forEach((btn) => {
  const menu = btn.nextElementSibling;
  btn.addEventListener("click", () => {
    const open = btn.getAttribute("aria-expanded") === "true";
    closeMenus();
    if (open) return;
    // A divider only between two groups that both show.
    menu.querySelectorAll("hr").forEach((hr) => {
      let before = false, after = false;
      for (let n = hr.previousElementSibling; n; n = n.previousElementSibling) if (n.tagName !== "HR" && !n.hidden) before = true;
      for (let n = hr.nextElementSibling; n; n = n.nextElementSibling) if (n.tagName !== "HR" && !n.hidden) after = true;
      hr.hidden = !(before && after);
    });
    btn.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    const items = menuItems(menu);
    if (items[0]) items[0].focus();
  });
  menu.addEventListener("keydown", (e) => {
    const items = menuItems(menu);
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = items.length;
      if (n) items[(i + (e.key === "ArrowDown" ? 1 : n - 1) + n) % n].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenus();
      btn.focus();
    } else if (e.key === "Tab") {
      closeMenus();
    }
  });
  // The item's own handler runs first; then the menu folds away.
  menu.addEventListener("click", (e) => { if (e.target.closest('[role="menuitem"]')) closeMenus(); });
});
document.addEventListener("click", (e) => { if (!e.target.closest(".menu-wrap")) closeMenus(); });

// ── Connect dialog ──────────────────────────────────────────────────────────
// GitHub: two choices (sign-in, recommended; or a token), each its own step.
// Without sign-in in this build (Firefox) it opens straight on the token.
// Linear and Slack: their forms as before, in the same frame.

const dlg = $("connectDialog");
let dlgOpener = null;
let installTimer = 0;
const PANE_TEXT = {
  "github-choose": ["Connect GitHub", "Choose how to connect"],
  "github-signin": ["Connect GitHub", "Sign in with GitHub"],
  "github-token": ["Connect GitHub", "Personal access token"],
  linear: ["Connect Linear", "Sign in, or paste an API key"],
  slack: ["Connect Slack", "Incoming webhook"],
};

function paneOf(name) { return dlg.querySelector('.pane[data-pane="' + name + '"]'); }

function showPane(name, opts) {
  dlg.querySelectorAll(".pane").forEach((p) => { p.hidden = p.dataset.pane !== name; });
  const ln = trackerRows.linear;
  let [title, sub] = PANE_TEXT[name];
  if (opts && opts.switching) title = name === "github-token" ? "Switch to a personal token" : "Switch to GitHub sign-in";
  if (name === "linear" && ln && ln.needsReconnect) title = "Reconnect Linear";
  if (name === "linear" && ln && !ln.canConnect) sub = "Paste an API key";
  $("dlgTitle").textContent = title;
  $("dlgSub").textContent = sub;
  // Back to the two choices — only where there were two to choose from.
  const back = !(opts && opts.switching) && !!(trackerRows.github && trackerRows.github.canConnect);
  dlg.querySelectorAll(".dlg-back").forEach((b) => { b.hidden = !back; });
}

function resetSignInPane() {
  const pane = paneOf("github-signin");
  clearTimeout(installTimer);
  pane.querySelector(".acct-confirm").hidden = true;
  pane.querySelector(".device").hidden = true;
  pane.querySelector(".device-step2").hidden = true;
  pane.querySelector(".acct-connect").hidden = true;
  pane.querySelector(".connect-status").textContent = "";
}

/** Open Connect for one tracker on its first step, or on opts.pane. */
function openConnect(id, opts) {
  const o = opts || {};
  const t = trackerRows[id];
  let pane = o.pane || (id === "github" ? (t && t.canConnect ? "github-choose" : "github-token") : id);
  if (id === "github" && pane === "github-signin" && !(t && t.canConnect)) pane = "github-token";
  const logo = $("dlgLogo");
  logo.textContent = "";
  if (window.TraceBugIntegrationsHub) logo.append(window.TraceBugIntegrationsHub.logo(id, 20));
  ["ghStatus", "lnStatus", "slStatus"].forEach((s) => { $(s).textContent = ""; });
  $("ghReplace").hidden = true;
  resetSignInPane();
  showPane(pane, o);
  dlgOpener = o.opener || document.activeElement;
  if (!dlg.open) dlg.showModal();
  const first = { "github-choose": "ghChooseSignIn", "github-token": "ghToken", slack: "slHook" }[pane];
  if (first) $(first).focus();
  else if (pane === "linear") {
    const c = paneOf("linear").querySelector(".acct-connect");
    if (!c.hidden) c.focus(); else $("lnKey").focus();
  }
}

function closeConnect() { if (dlg.open) dlg.close(); }

dlg.addEventListener("close", () => {
  const o = dlgOpener;
  dlgOpener = null;
  if (o && o.isConnected && !o.closest("[hidden]")) o.focus();
});
dlg.addEventListener("click", (e) => { if (e.target === dlg) closeConnect(); });
$("dlgClose").addEventListener("click", closeConnect);
$("ghChooseSignIn").addEventListener("click", () => startSignIn(trackerRows.github));
$("ghChooseToken").addEventListener("click", () => { showPane("github-token"); $("ghToken").focus(); });
dlg.querySelectorAll(".dlg-back").forEach((b) => b.addEventListener("click", () => {
  resetSignInPane();
  showPane("github-choose");
  $("ghChooseSignIn").focus();
}));
// The sign-in step's own button: shown again once a code ends (try again).
paneOf("github-signin").querySelector(".acct-connect").addEventListener("click",
  () => connectFromOptions(trackerRows.github, paneOf("github-signin")));

document.querySelectorAll(".tile-connect").forEach((b) => b.addEventListener("click", async () => {
  const id = b.dataset.tracker;
  if (id !== "slack" && !trackerRows[id]) await renderTrackerAccounts();
  openConnect(id, { opener: b });
}));

/** Sign in from a click (Connect, Reconnect): the dialog shows the progress. */
function startSignIn(t, opts) {
  if (!t) return;
  if (t.id === "github") {
    openConnect("github", Object.assign({}, opts, { pane: "github-signin" }));
    connectFromOptions(t, paneOf("github-signin"));
  } else {
    openConnect(t.id, opts);
    connectFromOptions(t, paneOf(t.id));
  }
}

/** Step 2 in the same GitHub window: wait until the worker closes it (GitHub
 *  reported the install) or the user does; then carry on as connected. */
function waitForInstall(pane, then) {
  const box = pane.querySelector(".device-step2");
  if (box) box.hidden = false;
  say(pane.querySelector(".connect-status"), "Waiting for GitHub…", "ok", " ");
  const started = Date.now();
  const tick = async () => {
    const st = await TraceBugTrackerConnect.msg("tb:tracker:install-state", { tracker: "github" });
    if ((st && st.open === false) || Date.now() - started > 10 * 60 * 1000) { if (box) box.hidden = true; then(); return; }
    installTimer = setTimeout(tick, 1500);
  };
  clearTimeout(installTimer);
  installTimer = setTimeout(tick, 1500);
}

function connectFromOptions(t, pane) {
  const status = pane.querySelector(".connect-status");
  const dev = pane.querySelector(".device");
  // TraceBugTrackerConnect (tracker-connect.js) asks for permissions inside
  // this click, copies the device code, opens GitHub's page and polls.
  const connectBtn = pane.querySelector(".acct-connect");
  const reopenBtn = pane.querySelector(".device-reopen");
  // GitHub's step has the device-code box; Linear's (a sign-in popup) doesn't.
  const copyBtn = pane.querySelector(".device-copy");
  if (t.id === "github") connectBtn.hidden = true;
  if (copyBtn) {
    copyBtn.onclick = async () => {
      const code = pane.querySelector(".device-code").textContent || "";
      if (await TraceBugTrackerConnect.copy(code)) say(status, "Code copied — press " + TraceBugTrackerConnect.pasteKeys() + " on GitHub.", "ok", " ");
    };
  }
  if (reopenBtn) reopenBtn.onclick = () => TraceBugTrackerConnect.reopen(t);
  TraceBugTrackerConnect.connect(t, {
    say: (text, isErr) => say(status, text, isErr ? "err" : "ok", " "),
    code: (code) => {
      const el = pane.querySelector(".device-code");
      if (el) el.textContent = code || "";
      if (dev) dev.hidden = !code;
    },
    reopen: (on) => { if (reopenBtn) reopenBtn.hidden = !on; },
    final: (code) => {
      connectBtn.textContent = code === "expired_token" ? "Get a new code" : "Connect " + t.label;
      connectBtn.hidden = false;
    },
    done: async (account, res) => {
      // The app is on no repository yet: GitHub's window moved on to Install.
      if (res && res.installing && t.id === "github" && dlg.open) {
        if (dev) dev.hidden = true;
        waitForInstall(pane, () => finishConnected(t, account));
        return;
      }
      await finishConnected(t, account);
    },
  });
}

async function finishConnected(t, account) {
  closeConnect();
  say($("intStatus"), "Connected" + (account ? " as " + account : "") + ". Now pick where new issues go.", "ok", " ");
  await renderTrackerAccounts();
  const pick = document.querySelector('.tracker-acct[data-tracker="' + t.id + '"] .acct-default');
  // A long list is typed into (tracker-connect.js comboBox): focus that field.
  const field = pick && pick.hidden && pick._tbCombo ? pick._tbCombo.input : pick;
  if (field && !field.closest("[hidden]")) field.focus();
}

// ── Disconnect confirm ──────────────────────────────────────────────────────
// Says exactly what is removed before it is, and where to finish on GitHub —
// revoking needs a client secret TraceBug doesn't have (B7, B11).

const disc = $("disconnectDialog");
let discOpener = null;

function disconnectWords(t) {
  if (t.id === "slack") return { text: "TraceBug forgets the Slack webhook. Reports stop posting to that channel." };
  if (t.id === "github" && t.via === "token") {
    return { text: "TraceBug removes the token" + (t.tokenHint ? " " + t.tokenHint : "") +
      " from this browser. You can delete it on GitHub: ", link: "Personal access tokens", url: GITHUB_TOKENS_URL };
  }
  if (t.id === "github") {
    return { text: "TraceBug deletes its GitHub sign-in from this browser. To remove its access on GitHub too: ",
      link: "Authorized GitHub Apps", url: GITHUB_APPS_URL };
  }
  return { text: "TraceBug signs out of " + t.label + " and forgets any pasted key on this browser. Issues already filed stay in " + t.label + "." };
}

function openDisconnect(t, opener) {
  $("discTitle").textContent = "Disconnect " + t.label + "?";
  const w = disconnectWords(t);
  const p = $("discText");
  p.textContent = w.text;
  if (w.link) {
    const a = document.createElement("a");
    a.href = w.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = w.link;
    p.append(a, ".");
  }
  const yes = $("discYes");
  yes.disabled = false;
  yes.onclick = async () => {
    yes.disabled = true;
    disc.close();
    if (t.id === "slack") await clearProvider("slack", $("intStatus"), ["slHook"]);
    else await disconnectFromOptions(t);
    // Its row is gone: land on the section, where the result is said.
    $("integrationsTitle").focus();
  };
  discOpener = opener || null;
  disc.showModal();
  $("discCancel").focus();
}

$("discCancel").addEventListener("click", () => disc.close());
disc.addEventListener("close", () => {
  const o = discOpener;
  discOpener = null;
  if (o && o.isConnected && !o.closest("[hidden]")) o.focus();
});

async function disconnectFromOptions(t) {
  const status = $("intStatus");
  // A token connection: Disconnect removes the token too.
  const res = await trackerMsg("tb:tracker:disconnect", { tracker: t.id, token: t.via === "token" });
  if (!res || res.error) { say(status, (res && res.error) || "Could not disconnect.", "err"); return; }
  // GitHub: exactly what was removed, and where to finish on GitHub (B7, B11).
  const what = res.removed === "signin" && res.revokeUrl
    ? { text: "Signed out. TraceBug deleted its GitHub sign-in from this browser. To remove its access on GitHub too: ", link: "Authorized GitHub Apps", url: res.revokeUrl }
    : res.removed === "token" && res.tokenUrl
      ? { text: "Token removed from this browser. You can delete it on GitHub: ", link: "Personal access tokens", url: res.tokenUrl }
      : null;
  if (what) {
    say(status, what.text, "ok", " ");
    const a = document.createElement("a");
    a.href = what.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "revoke-link";
    a.textContent = what.link;
    status.textContent = what.text;
    status.append(a);
  } else {
    say(status, "Disconnected.", "ok");
  }
  await renderTrackerAccounts();
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.tb_tracker_auth_v1 || changes[INT_KEY] || changes.tb_tracker_sites_v1 ||
      changes.tb_tracker_default_v1)) renderTrackerAccounts();
  });
} catch {}

// ── Hand-offs into Integrations ────────────────────────────────────────────
// The popup's hub can't run a sign-in (it closes when GitHub's window takes
// focus), so it opens #integrations:connect=<id> or #integrations:token=<id>
// here. Connect needs a click on this page (permissions.request needs the
// gesture), so the dialog opens with "Sign in" focused.

const TOKEN_PANES = {
  github: { pane: "github-token", field: "ghToken" },
  linear: { pane: "linear", field: "lnKey" },
  slack: { pane: "slack", field: "slHook" },
};

function highlight(el) {
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.add("deep-link-target");
  setTimeout(() => el.classList.remove("deep-link-target"), 2500);
}

function showTokenForm(id) {
  const f = TOKEN_PANES[id];
  if (!f) return;
  openConnect(id, { pane: f.pane });
  if (id === "linear") $("lnAdvanced").open = true;
  $(f.field).focus();
}

async function showConnect(id) {
  await renderTrackerAccounts();
  const row = document.querySelector('#connectedList .conn-row[data-tracker="' + id + '"]');
  const t = trackerRows[id];
  // Already connected and working: show its row.
  if (row && !row.hidden && !(t && t.needsReconnect)) { highlight(row); return; }
  if (!t || !t.canConnect) { showTokenForm(id); return; }
  openConnect(id);
}

function followIntegrationsLink() {
  const m = /^#integrations(?::(connect|token)=(github|linear|slack))?$/.exec(location.hash);
  if (!m || !m[1]) return;
  if (m[1] === "connect") showConnect(m[2]);
  else showTokenForm(m[2]);
}
followIntegrationsLink();

// ── Boot ────────────────────────────────────────────────────────────────────

applyProviderUI();
refreshPills();
renderTrackerAccounts();
showMigrationNotices();
renderLlmSites();
renderAccount();

// ── Site Audit account (ADR 009) ────────────────────────────────────────────
// Only the signed-in email (what signin.html stores and shows); sign in, sign
// out and delete stay on signin.html.
async function renderAccount() {
  const acct = ((await get(["tb_audit_gate_v1"])).tb_audit_gate_v1 || {}).account;
  const email = acct && acct.email ? String(acct.email) : "";
  pill($("accountPill"), !!email, ["Signed in", "Not signed in"]);
  $("accountHelp").textContent = email
    ? "Signed in as " + email + ". Site Audit needs it after 3 audits."
    : "Needed after 3 audits: email and a code, no password.";
  $("accountLink").textContent = email ? "Manage" : "Sign in";
}
try {
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.tb_audit_gate_v1) renderAccount(); });
} catch {}

// Recording → Microphone: the ⓘ shows why it's granted on this page.
$("micWhyBtn").addEventListener("click", () => {
  const open = $("micWhy").hidden;
  $("micWhy").hidden = !open;
  $("micWhyBtn").setAttribute("aria-expanded", String(open));
});

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

  // Same chrome-extension:// origin as popup.html and offscreen.html, so
  // localStorage here is visible to both — no chrome.storage plumbing needed
  // to hand the chosen device over to the recorder or the popup's state line.
  const MIC_DEVICE_ID_KEY = "tracebug_mic_device_id";
  const MIC_DEVICE_LABEL_KEY = "tracebug_mic_device_label";
  const deviceRow = document.getElementById("micDeviceRow");
  const deviceSelect = document.getElementById("micDeviceSelect");

  const MIC_WARN_STATES = new Set(["Blocked", "No microphone", "Failed"]);
  function setState(state, message) {
    if (pill) {
      pill.textContent = state;
      pill.className = "pill" + (state === "Granted" ? " ok" : MIC_WARN_STATES.has(state) ? " warn" : "");
    }
    if (status) status.textContent = message || "";
  }

  // Device labels only come back non-blank once mic permission is actually
  // granted (privacy: a page can enumerate device COUNT without permission,
  // but not names) — so this is called after every successful grant/refresh
  // and simply hides the row again if labels still aren't there yet.
  async function refreshMicDevices() {
    if (!deviceSelect || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      if (!inputs.length || !inputs[0].label) {
        if (deviceRow) deviceRow.style.display = "none";
        return;
      }
      let storedId = "";
      try { storedId = localStorage.getItem(MIC_DEVICE_ID_KEY) || ""; } catch {}
      deviceSelect.textContent = "";
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "System default";
      deviceSelect.appendChild(defaultOpt);
      inputs.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label;
        deviceSelect.appendChild(opt);
      });
      deviceSelect.value = inputs.some((d) => d.deviceId === storedId) ? storedId : "";
      if (deviceRow) deviceRow.style.display = "flex";
    } catch {
      if (deviceRow) deviceRow.style.display = "none";
    }
  }

  deviceSelect?.addEventListener("change", () => {
    const id = deviceSelect.value;
    const label = id ? (deviceSelect.selectedOptions[0]?.textContent || "") : "";
    try {
      if (id) {
        localStorage.setItem(MIC_DEVICE_ID_KEY, id);
        localStorage.setItem(MIC_DEVICE_LABEL_KEY, label);
      } else {
        localStorage.removeItem(MIC_DEVICE_ID_KEY);
        localStorage.removeItem(MIC_DEVICE_LABEL_KEY);
      }
    } catch {}
  });

  // A device unplugged/replugged mid-session should update the list without
  // the user having to reopen this page.
  try { navigator.mediaDevices?.addEventListener?.("devicechange", refreshMicDevices); } catch {}

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
    void refreshMicDevices();
  }

  async function requestMicGrant() {
    setState("Asking…", "Answer the browser's prompt.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // We only wanted the grant - stop the tracks so no mic light stays on.
      stream.getTracks().forEach((t) => t.stop());
      setState("Granted", "Done. Turn the microphone on in the TraceBug popup before a recording.");
      void refreshMicDevices();
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
  }

  grant.addEventListener("click", requestMicGrant);
  check.addEventListener("click", refresh);
  void refresh();
  // Deep-linked from the popup's mic notice. Asks immediately, rather than
  // just scrolling the card into view and waiting for a second manual click
  // on "Allow microphone" — the whole reason this tab had to open at all is
  // that the popup cannot survive the permission prompt, so landing here is
  // already the one extra step; don't add a second one on top of it.
  if (location.hash === "#mic") {
    // #mic opens the Recording section (sectionOf); a brief highlight on the
    // card marks it in the moment before the browser's own prompt shows up.
    const card = document.getElementById("micCard");
    if (card) card.classList.add("deep-link-target");
    void requestMicGrant();
  }
})();

// ── Redaction rules ──────────────────────────────────────────────────────────
// Moved here from the popup (2026-10-27) — a settings-shaped control that was
// taking up scroll space on the popup's hero capture flow every time it
// opened, whether or not anyone touched it. App-specific PII fields/patterns
// masked at capture, on top of the built-in token/secret patterns. Synced via
// chrome.storage.sync; the content script hands them to the SDK through
// <html data-tb-redact>.
(function initRedactionCard() {
  const REDACT_KEY = "tracebug_redact";
  const fieldsTa = document.getElementById("redactFields");
  const patternsTa = document.getElementById("redactPatterns");
  const saveBtn = document.getElementById("redactSave");
  const pill = document.getElementById("redactPill");
  const status = document.getElementById("redactStatus");
  if (!fieldsTa || !patternsTa || !saveBtn) return;

  function parseFields(raw) {
    return String(raw || "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
  }
  function parsePatterns(raw) {
    return String(raw || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  }
  function setPill(rules) {
    if (!pill) return;
    const n = (rules?.fields?.length || 0) + (rules?.patterns?.length || 0);
    pill.textContent = n > 0 ? `${n} rule${n === 1 ? "" : "s"}` : "none set";
    pill.classList.toggle("on", n > 0);
  }

  try {
    chrome.storage.sync.get(REDACT_KEY).then((r) => {
      const rules = r?.[REDACT_KEY];
      if (rules) {
        fieldsTa.value = (rules.fields || []).join(", ");
        patternsTa.value = (rules.patterns || []).join("\n");
      }
      setPill(rules);
    }).catch(() => {});
  } catch {}

  saveBtn.addEventListener("click", async () => {
    const fields = parseFields(fieldsTa.value);
    const patterns = parsePatterns(patternsTa.value);
    // Reject regexes that don't compile so a typo can't silently no-op.
    const bad = patterns.find((p) => { try { new RegExp(p, "gi"); return false; } catch { return true; } });
    if (bad) {
      if (status) { status.textContent = `Invalid regex: ${bad}`; status.className = "status err"; }
      return;
    }
    const rules = { fields, patterns };
    try {
      await chrome.storage.sync.set({ [REDACT_KEY]: rules });
      setPill(rules);
      if (status) {
        status.textContent = fields.length + patterns.length > 0 ? "Saved — applies to new captures." : "Cleared.";
        status.className = "status ok";
      }
    } catch (err) {
      if (status) { status.textContent = "Save failed: " + (err?.message || err); status.className = "status err"; }
    }
  });
})();

// ── Diagnostics / "Having trouble?" ──────────────────────────────────────────
// Moved here from the popup (2026-10-27), same reason as Redaction rules
// above. TraceBug sends nothing anywhere, so the only route for a bug report
// is the user's own clipboard — both buttons produce the SAME scrubbed text
// (no URLs, no page content, no stored values; see diagnostics.js). The
// popup's version read a page CLASSIFICATION for the tab it opened for
// (diagPageState() there); this page isn't tied to any one tab, so that
// field is just a fixed, honest string instead.
(function initDiagnosticsCard() {
  const copyBtn = document.getElementById("diagCopy");
  const reportBtn = document.getElementById("diagReport");
  const pill = document.getElementById("diagPill");
  const status = document.getElementById("diagStatus");
  if (!copyBtn || !reportBtn) return;

  const DIAG_ISSUE_URL = "https://github.com/prashantsinghmangat/TraceBug-ai/issues/new";
  const PAGE_STATE = "opened from TraceBug settings, not a specific tab";

  if (typeof TraceBugDiagnostics !== "undefined" && pill) {
    TraceBugDiagnostics.readErrors().then((list) => {
      pill.textContent = list.length ? `${list.length} error${list.length === 1 ? "" : "s"}` : "no errors";
      pill.classList.toggle("on", list.length === 0);
    }).catch(() => {});
  }

  async function buildDiagnostics() {
    if (typeof TraceBugDiagnostics === "undefined") return "";
    return TraceBugDiagnostics.build({ pageState: PAGE_STATE });
  }

  copyBtn.addEventListener("click", async () => {
    const text = await buildDiagnostics();
    if (!text) { if (status) { status.textContent = "Diagnostics unavailable"; status.className = "status err"; } return; }
    try {
      await navigator.clipboard.writeText(text);
      if (status) { status.textContent = "Copied — paste it into an issue."; status.className = "status ok"; }
    } catch {
      if (status) { status.textContent = "Couldn't copy — see the browser console for the text."; status.className = "status err"; }
      console.log(text);
    }
  });

  reportBtn.addEventListener("click", async () => {
    const text = await buildDiagnostics();
    // Prefilled, but the user reads and submits it themselves. GitHub caps the
    // whole URL around 8 KB, so the body is trimmed rather than silently
    // truncated by the browser into something that ends mid-stack.
    const body = [
      "**What happened?**", "", "", "**Steps**", "", "1. ", "",
      "<details><summary>Diagnostics</summary>", "", "```", text.slice(0, 5500), "```", "", "</details>",
    ].join("\n");
    const url = `${DIAG_ISSUE_URL}?labels=bug&body=${encodeURIComponent(body)}`;
    try {
      chrome.tabs.create({ url });
    } catch {
      if (status) { status.textContent = "Couldn't open GitHub — copy the diagnostics instead."; status.className = "status err"; }
    }
  });
})();

// ── Integrations preferences ────────────────────────────────────────────────
// Open the filed issue in a new tab (default on), and forget the per-site
// remembered repositories/labels (tb_tracker_sites_v1, written by the worker).
const OPEN_AFTER_KEY = "tb_open_issue_after_create_v1";
get([OPEN_AFTER_KEY]).then((r) => { $("openAfterCreate").checked = r[OPEN_AFTER_KEY] !== false; });
$("openAfterCreate").addEventListener("change", async () => {
  try {
    await set({ [OPEN_AFTER_KEY]: $("openAfterCreate").checked });
    flashSaved($("openAfterCreate"), true);
  } catch {
    flashSaved($("openAfterCreate"), false);
  }
});
$("forgetChoices").addEventListener("click", async () => {
  const btn = $("forgetChoices");
  try {
    await new Promise((resolve, reject) => chrome.storage.local.remove(SITES_KEY, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve();
    }));
    renderRemembered({});
    flashSaved(btn, true, "Forgotten");
  } catch {
    flashSaved(btn, false, "Couldn't forget");
  }
});
