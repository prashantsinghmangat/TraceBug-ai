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
// Phase 2b adds: requesting each provider's optional host permission on save,
// and the background worker making the actual API calls.
// ─────────────────────────────────────────────────────────────────────────────

const INT_KEY = "tb_integrations_v1";
const AI_KEY = "tb_ai_config_v1";
const NOTICE_KEY = "tb_migration_notices";

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

function say(el, msg, kind) {
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
  if (kind === "ok") setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
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

$("aiSave").addEventListener("click", async () => {
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

  try {
    await set({ [AI_KEY]: { provider, apiKey, model, baseUrl: baseUrl || undefined } });
    $("aiKey").value = "";
    await refreshPills();
    say(status, "Saved.", "ok");
  } catch (e) {
    say(status, "Couldn't save: " + (e.message || "storage error"), "err");
  }
});

$("aiClear").addEventListener("click", async () => {
  try {
    chrome.storage.local.remove(AI_KEY, async () => {
      void chrome.runtime.lastError;
      $("aiKey").value = "";
      $("aiModel").value = "";
      await refreshPills();
      say($("aiStatus"), "Removed.", "ok");
    });
  } catch {
    say($("aiStatus"), "Couldn't remove the key.", "err");
  }
});

// ── Trackers ────────────────────────────────────────────────────────────────

/** Merge one provider's config into the stored integrations object. */
async function saveProvider(name, value, statusEl) {
  try {
    const cfg = (await get([INT_KEY]))[INT_KEY] || {};
    cfg[name] = value;
    await set({ [INT_KEY]: cfg });
    await refreshPills();
    say(statusEl, "Saved.", "ok");
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

$("ghSave").addEventListener("click", async () => {
  const status = $("ghStatus");
  const repo = $("ghRepo").value.trim();
  const token = await keptSecret("github", "ghToken");
  if (!token) { say(status, "Enter a personal access token.", "err"); return; }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { say(status, 'Repository must look like "owner/repo".', "err"); return; }
  if (await saveProvider("github", { token, repo }, status)) $("ghToken").value = "";
});

$("ghClear").addEventListener("click", () => clearProvider("github", $("ghStatus"), ["ghToken", "ghRepo"]));

$("lnSave").addEventListener("click", async () => {
  const status = $("lnStatus");
  const teamId = $("lnTeam").value.trim();
  const apiKey = await keptSecret("linear", "lnKey");
  if (!apiKey) { say(status, "Enter a Linear API key.", "err"); return; }
  if (!teamId) { say(status, "Enter the team ID.", "err"); return; }
  if (await saveProvider("linear", { apiKey, teamId }, status)) $("lnKey").value = "";
});

$("lnClear").addEventListener("click", () => clearProvider("linear", $("lnStatus"), ["lnKey", "lnTeam"]));

$("slSave").addEventListener("click", async () => {
  const status = $("slStatus");
  const webhookUrl = await keptSecret("slack", "slHook");
  if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    say(status, "Enter a Slack incoming-webhook URL (https://hooks.slack.com/…).", "err");
    return;
  }
  if (await saveProvider("slack", { webhookUrl }, status)) $("slHook").value = "";
});

$("slClear").addEventListener("click", () => clearProvider("slack", $("slStatus"), ["slHook"]));

// ── Boot ────────────────────────────────────────────────────────────────────

applyProviderUI();
refreshPills();
showMigrationNotices();
