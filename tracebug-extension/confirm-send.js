// ── Confirmation window ─────────────────────────────────────────────────────
// Phase 2b. Every tracker send, and the first AI analysis on each site, is
// confirmed here before anything leaves the browser. This window is owned by
// the extension: the page under test cannot script it, read it, or dismiss it.
//
// TWO RULES, both load-bearing:
//
// 1. Everything rendered here is PAGE-CONTROLLED TEXT inside a PRIVILEGED
//    page. It is written with textContent only — never innerHTML. The CSP
//    (script-src 'self') would stop inline script, but markup would still
//    render: a body containing <img src=x onerror=…> or an <a> pointing
//    somewhere else must appear as source, not as a rendered element.
//
// 2. The request id arrives in the URL, and nothing else does. The report text
//    is fetched over chrome.runtime messaging, so no part of it is ever in a
//    URL bar, a window title, or a history entry.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const ID = params.get("id") || "";

let decided = false;
let deadline = 0;
let tick = null;

/** Set text safely. Every dynamic value on this page goes through here. */
function put(id, text) {
  const el = $(id);
  if (el) el.textContent = String(text == null ? "" : text);
}

function fatal(msg) {
  document.body.innerHTML = "";
  const p = document.createElement("div");
  p.className = "fatal";
  p.textContent = msg;
  document.body.appendChild(p);
}

function send(type, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(Object.assign({ type }, payload), (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch { resolve(null); }
  });
}

function startCountdown(expiresAt) {
  deadline = expiresAt || 0;
  if (!deadline) return;
  const render = () => {
    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const shown = left >= 90 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
    put("countdown", left > 0 ? `Cancels automatically in ${shown}` : "Cancelled.");
    if (left <= 0) {
      if (tick) clearInterval(tick);
      // The worker's chrome.alarms timeout is the authority — it has already
      // told the page. Just make the window stop pretending it can still send.
      decided = true;
      $("send").disabled = true;
      $("cancel").disabled = true;
      setTimeout(() => window.close(), 800);
    }
  };
  render();
  tick = setInterval(render, 1000);
}

function renderWarnings(list) {
  if (!Array.isArray(list) || !list.length) return;
  const ul = $("warnList");
  list.forEach((w) => {
    const li = document.createElement("li");
    li.textContent = String(w);          // page-controlled → textContent
    ul.appendChild(li);
  });
  $("warnBox").style.display = "";
}

// ── Create panel (ADR 010) ──────────────────────────────────────────────────
// For a tracker send, this window is where the user picks WHERE the issue goes:
// tracker, repo/team, fields. The page under test sent content only; the names
// below come from the worker over tb:tracker:* messages, which it answers only
// for extension pages. Rendered with textContent, like everything else here.

const ISSUE_TRACKERS = ["github", "linear"];

const panel = {
  active: false,
  trackers: [],          // tb:tracker:status rows
  current: null,         // the selected row
  items: [],             // containers for the current tracker
  fieldSpecs: [],        // FieldSpec[] for the current container
  fieldsFor: "",         // container the specs belong to
  pollTimer: null,
  loadSeq: 0,
  keep: null,            // choices held across a reconnect: {tracker, container, fields}
  busy: false,           // a create is in flight
};

function show(id, on) {
  const el = $(id);
  if (el) el.hidden = !on;
}

function panelMsg(text, isErr) {
  const el = $("panelMsg");
  if (!el) return;
  el.textContent = String(text || "");
  el.className = "msg" + (isErr ? " err" : "");
}

function rowFor(id) {
  return panel.trackers.find((t) => t.id === id) || null;
}

function selectedContainer() {
  return ($("container").value || "").trim();
}

/** Create is possible once there is a credential and a destination. */
function syncCreateButton() {
  if (!panel.active || decided) return;
  const t = panel.current;
  $("send").disabled = panel.busy || !(t && t.connected && selectedContainer());
  put("destination", selectedContainer() || "(choose below)");
  put("provider", t ? t.label : "");
}

/** "Create GitHub issue" — in the heading and the window's title bar. */
function setTitle(t) {
  const text = "Create " + (t ? t.label + " " : "an ") + "issue";
  put("heading", text);
  document.title = text;
}

function renderTrackerSelect(selectedId) {
  const sel = $("tracker");
  sel.textContent = "";
  panel.trackers.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = t.label + (t.connected ? "" : t.needsReconnect ? " (reconnect)" : " (not connected)");
    sel.appendChild(o);
  });
  sel.value = selectedId;
}

async function loadStatus() {
  const res = await send("tb:tracker:status", {});
  if (!res || !Array.isArray(res.trackers)) return false;
  panel.trackers = res.trackers;
  return true;
}

function stopPolling() {
  if (panel.pollTimer) clearTimeout(panel.pollTimer);
  panel.pollTimer = null;
}

async function selectTracker(id) {
  stopPolling();
  const t = rowFor(id);
  panel.current = t;
  panel.items = [];
  panel.fieldSpecs = [];
  panel.fieldsFor = "";
  $("fields").textContent = "";
  $("containerList").textContent = "";
  panelMsg("");
  show("deviceBox", false);
  show("accessBox", false);
  if (!t) return;
  setTitle(t);

  put("account", t.connected
    ? (t.via === "oauth" ? (t.account ? "as " + t.account : "signed in") : "with a token")
    : "");
  show("disconnect", t.via === "oauth");

  if (!t.connected) {
    show("pickBox", false);
    show("connectBox", true);
    put("connectText", t.canConnect
      ? (t.needsReconnect ? t.label + " needs you to sign in again." : "Connect " + t.label + " to pick where this goes.")
      : t.label + " isn't connected. Add a token in TraceBug settings, then send again.");
    show("connect", t.canConnect);
    $("connect").textContent = (t.needsReconnect ? "Reconnect " : "Connect ") + t.label;
    syncCreateButton();
    return;
  }

  show("connectBox", false);
  show("pickBox", true);
  put("containerLabel", t.containerNoun);
  show("manageLink", !!t.manageUrl);
  $("manageLink").dataset.url = t.manageUrl || "";
  // After a reconnect, the user's own choices win over the remembered ones.
  const keep = panel.keep && panel.keep.tracker === t.id ? panel.keep : null;
  $("container").value = (keep && keep.container) || (t.last && t.last.container) || "";
  syncCreateButton();
  await loadContainers();
  await loadFields(true);
}

/** A tb:tracker:* answer that needs host access shows the Allow button. */
function needsAccess(res) {
  if (!res || !Array.isArray(res.needsAccess)) return false;
  const hosts = res.needsAccess.map((p) => String(p).replace(/^https?:\/\//, "").replace(/\/\*$/, ""));
  put("accessText", "TraceBug needs access to " + hosts.join(", ") + " to list and file issues.");
  $("allowAccess").dataset.origins = JSON.stringify(res.needsAccess);
  show("accessBox", true);
  return true;
}

async function loadContainers() {
  const t = panel.current;
  if (!t) return;
  const seq = ++panel.loadSeq;
  const noun = t.containerNoun.toLowerCase();
  panelMsg("Loading " + (noun.endsWith("y") ? noun.slice(0, -1) + "ies" : noun + "s") + "…");
  const res = await send("tb:tracker:containers", { tracker: t.id });
  if (seq !== panel.loadSeq) return;
  if (needsAccess(res)) { panelMsg(""); return; }
  if (!res || res.error) {
    panelMsg((res && res.error) || "Could not load the list.", true);
    if (res && res.reconnect) await refreshAfterAuthChange(t.id);
    return;
  }
  panel.items = Array.isArray(res.items) ? res.items : [];
  const list = $("containerList");
  list.textContent = "";
  panel.items.forEach((it) => {
    const o = document.createElement("option");
    o.value = String(it.id);
    if (it.label && it.label !== it.id) o.label = String(it.label) + (it.detail ? " · " + it.detail : "");
    else if (it.detail) o.label = String(it.detail);
    list.appendChild(o);
  });
  panelMsg(panel.items.length ? "" : "Nothing to pick from — type the " + t.containerNoun.toLowerCase() + " instead.");
  // Linear's container id is opaque; show the team the remembered id is.
  if (!selectedContainer() && panel.items.length === 1) $("container").value = panel.items[0].id;
  syncCreateButton();
}

async function loadFields(useRemembered) {
  const t = panel.current;
  const container = selectedContainer();
  if (!t || !container || container === panel.fieldsFor) return;
  panel.fieldsFor = container;
  $("fields").textContent = "";
  panel.fieldSpecs = [];
  const res = await send("tb:tracker:fields", { tracker: t.id, container });
  if (container !== selectedContainer()) return;
  if (needsAccess(res)) return;
  if (!res || res.error) {
    panelMsg((res && res.error) || "Could not load the fields.", true);
    return;
  }
  panel.fieldSpecs = Array.isArray(res.fields) ? res.fields : [];
  const keep = panel.keep && panel.keep.tracker === t.id && panel.keep.container === container ? panel.keep : null;
  const remembered = keep ? keep.fields
    : useRemembered && t.last && t.last.container === container ? (t.last.fields || {}) : null;
  panel.keep = null;
  panel.fieldSpecs.forEach((f) => $("fields").appendChild(renderField(f, remembered ? remembered[f.key] : undefined)));
}

function renderField(spec, preset) {
  const want = new Set(Array.isArray(preset) ? preset : preset ? [preset] : []);
  if (spec.kind === "single") {
    const wrap = document.createElement("div");
    wrap.className = "pblock";
    const lab = document.createElement("label");
    lab.className = "plabel";
    lab.textContent = spec.label;
    const sel = document.createElement("select");
    sel.dataset.field = spec.key;
    sel.id = "f_" + spec.key;
    lab.htmlFor = sel.id;
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "—";
    sel.appendChild(none);
    (spec.options || []).forEach((op) => {
      const o = document.createElement("option");
      o.value = String(op.id);
      o.textContent = String(op.label);
      if (want.has(op.id)) o.selected = true;
      sel.appendChild(o);
    });
    wrap.append(lab, sel);
    if (spec.note) wrap.appendChild(noteEl(spec.note));
    return wrap;
  }

  // Multi-select as chips. Nothing remembered for this repo yet (preset is
  // undefined, not an empty list) → "bug" starts ticked, if the repo has it.
  if (preset === undefined) {
    const bug = (spec.options || []).find((op) => String(op.label).toLowerCase() === "bug");
    if (bug) want.add(bug.id);
  }
  const fs = document.createElement("fieldset");
  fs.dataset.field = spec.key;
  const lg = document.createElement("legend");
  lg.textContent = spec.label;
  fs.appendChild(lg);
  const box = document.createElement("div");
  box.className = "chips";
  if ((spec.options || []).length > 8) {
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "filter";
    filter.placeholder = "Search " + spec.label.toLowerCase();
    filter.setAttribute("aria-label", "Search " + spec.label.toLowerCase());
    filter.addEventListener("input", () => {
      const q = filter.value.trim().toLowerCase();
      box.querySelectorAll("button.chip").forEach((c) => { c.hidden = !!q && !c.textContent.toLowerCase().includes(q); });
    });
    box.appendChild(filter);
  }
  (spec.options || []).forEach((op) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.value = String(op.id);
    chip.textContent = String(op.label);
    chip.setAttribute("aria-pressed", want.has(op.id) ? "true" : "false");
    chip.addEventListener("click", () => {
      chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
    box.appendChild(chip);
  });
  if (!(spec.options || []).length) {
    const none = document.createElement("span");
    none.className = "muted";
    none.textContent = "None in this " + (panel.current ? panel.current.containerNoun.toLowerCase() : "place") + ".";
    box.appendChild(none);
  }
  fs.appendChild(box);
  if (spec.note) fs.appendChild(noteEl(spec.note));
  return fs;
}

function noteEl(text) {
  const n = document.createElement("div");
  n.className = "muted";
  n.textContent = String(text);
  return n;
}

function collectChoice() {
  const t = panel.current;
  const fields = {};
  panel.fieldSpecs.forEach((f) => {
    if (f.kind === "single") {
      const sel = document.querySelector('select[data-field="' + CSS.escape(f.key) + '"]');
      if (sel && sel.value) fields[f.key] = sel.value;
    } else {
      const fs = document.querySelector('fieldset[data-field="' + CSS.escape(f.key) + '"]');
      fields[f.key] = fs ? [...fs.querySelectorAll('button.chip[aria-pressed="true"]')].map((c) => c.value) : [];
    }
  });
  return { tracker: t.id, container: selectedContainer(), fields };
}

async function refreshAfterAuthChange(id) {
  if (await loadStatus()) {
    renderTrackerSelect(id);
    await selectTracker(id);
  }
}

// ── Connect ───────────────────────────────────────────────────────────────

function requestPermissions(perm) {
  // Must run synchronously inside the click: an await before it loses the
  // user gesture, and the browser then refuses without asking.
  return new Promise((resolve) => {
    const p = { permissions: (perm && perm.permissions) || [], origins: (perm && perm.origins) || [] };
    if (!p.permissions.length && !p.origins.length) { resolve(true); return; }
    try { chrome.permissions.request(p, (granted) => { void chrome.runtime.lastError; resolve(!!granted); }); }
    catch { resolve(false); }
  });
}

async function copyText(text) {
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** After signing in on GitHub's tab, put this window back in front of it. */
function bringToFront() {
  try {
    chrome.windows.getCurrent((w) => {
      void chrome.runtime.lastError;
      if (w && w.id != null) chrome.windows.update(w.id, { focused: true }, () => void chrome.runtime.lastError);
    });
  } catch {}
}

function openExternal(url) {
  let u;
  try { u = new URL(url); } catch { return; }
  if (u.protocol !== "https:") return;
  try { chrome.tabs.create({ url: u.toString(), active: true }); } catch {}
}

async function onConnect() {
  const t = panel.current;
  if (!t || !t.canConnect) return;
  const granted = await requestPermissions(t.connectPermissions);
  if (!granted) { panelMsg("TraceBug needs that permission to sign in to " + t.label + ".", true); return; }
  $("connect").disabled = true;
  panelMsg("Connecting to " + t.label + "…");
  const res = await send("tb:tracker:connect", { tracker: t.id });
  $("connect").disabled = false;
  if (!res || res.error) { panelMsg((res && res.error) || "Could not connect.", true); return; }
  if (needsAccess(res)) { panelMsg(""); return; }
  if (res.flow === "device") {
    put("userCode", res.userCode || "");
    $("openDevice").dataset.url = res.verificationUri || "";
    put("openDevice", "Open " + String(res.verificationUri || "").replace(/^https:\/\//, ""));
    show("deviceBox", true);
    // One click: copy the code and open the page that asks for it. The copy can
    // fail (the click's user activation may have lapsed); the code stays on
    // screen with its own Copy button either way.
    const copied = await copyText(res.userCode || "");
    openExternal(res.verificationUri || "");
    panelMsg(copied
      ? "Code copied. Paste it on GitHub and click Authorize — this window carries on by itself."
      : "Enter the code on GitHub and click Authorize — this window carries on by itself.");
    schedulePoll(t.id, res.interval || 5);
    return;
  }
  panelMsg("Connected" + (res.account ? " as " + res.account : "") + ".");
  await refreshAfterAuthChange(t.id);
}

function schedulePoll(id, seconds) {
  stopPolling();
  panel.pollTimer = setTimeout(async () => {
    if (!panel.current || panel.current.id !== id || decided) return;
    const res = await send("tb:tracker:connect-poll", { tracker: id });
    if (!res || res.error) {
      show("deviceBox", false);
      panelMsg((res && res.error) || "Sign-in failed. Click Connect to try again.", true);
      return;
    }
    if (res.status === "pending") { schedulePoll(id, res.interval || seconds); return; }
    show("deviceBox", false);
    bringToFront();
    panelMsg("Connected" + (res.account ? " as " + res.account : "") + ".");
    await refreshAfterAuthChange(id);
  }, Math.max(1, seconds) * 1000);
}

async function onDisconnect() {
  const t = panel.current;
  if (!t) return;
  const res = await send("tb:tracker:disconnect", { tracker: t.id });
  if (!res || res.error) { panelMsg((res && res.error) || "Could not disconnect.", true); return; }
  await refreshAfterAuthChange(t.id);
  if (res.revokeUrl) panelMsg("Disconnected. To revoke TraceBug's access entirely, visit " + res.revokeUrl);
}

function wirePanel() {
  $("tracker").addEventListener("change", () => selectTracker($("tracker").value));
  $("connect").addEventListener("click", onConnect);
  $("disconnect").addEventListener("click", onDisconnect);
  $("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    try { chrome.runtime.openOptionsPage(); } catch {}
  });
  $("copyCode").addEventListener("click", async () => {
    if (await copyText($("userCode").textContent || "")) panelMsg("Code copied.");
  });
  $("manageLink").addEventListener("click", (e) => {
    e.preventDefault();
    openExternal($("manageLink").dataset.url || "");
  });
  $("openDevice").addEventListener("click", () => openExternal($("openDevice").dataset.url || ""));
  $("allowAccess").addEventListener("click", async () => {
    let origins = [];
    try { origins = JSON.parse($("allowAccess").dataset.origins || "[]"); } catch {}
    const ok = await requestPermissions({ origins });
    if (!ok) { panelMsg("Without access TraceBug can't reach " + (panel.current ? panel.current.label : "the tracker") + ".", true); return; }
    show("accessBox", false);
    panel.fieldsFor = "";
    await loadContainers();
    await loadFields(true);
  });
  const c = $("container");
  c.addEventListener("input", () => {
    syncCreateButton();
    // Picking from the list fires `input` with an exact match: load at once.
    if (panel.items.some((it) => it.id === selectedContainer())) loadFields(false);
  });
  c.addEventListener("change", () => { syncCreateButton(); loadFields(false); });
}

// ── Create ────────────────────────────────────────────────────────────────
// The window stays open for the outcome. The request stays pending in the
// worker until it succeeds, so a failure changes nothing: same ticket, same
// choices, and Retry. Cancel is locked while a create is in flight — closing
// under it could hide an issue that did get filed.

const ISSUE_HOSTS = { github: ["github.com"], linear: ["linear.app"] };

async function createIssue() {
  if (decided || panel.busy || $("send").disabled) return;
  const choice = collectChoice();
  panel.busy = true;
  $("send").disabled = true;
  $("cancel").disabled = true;
  panelMsg("");
  put("countdown", "Creating…");
  const res = await send("tb:confirm:create", { id: ID, choice });
  panel.busy = false;
  $("cancel").disabled = false;
  put("countdown", "");
  if (res && res.ok && res.result) { showDone(choice.tracker, res.result); return; }
  const error = (res && res.error) || "Could not create the issue.";
  if (res && res.reconnect) {
    // Keep what the user picked; the Reconnect button is in the panel now.
    panel.keep = choice;
    await refreshAfterAuthChange(choice.tracker);
    panelMsg(error, true);
    return;
  }
  panelMsg(res && res.unclear
    ? error + " Retry checks whether it was created first, so it won't be filed twice."
    : error, true);
  $("send").textContent = "Retry";
  syncCreateButton();
}

function showDone(tracker, r) {
  decided = true;
  ["connectBox", "accessBox", "pickBox", "disconnect"].forEach((id) => show(id, false));
  $("tracker").disabled = true;
  panelMsg("");
  const link = $("issueLink");
  link.textContent = r.ref || "the issue";
  link.dataset.url = r.url || "";
  link.dataset.tracker = tracker;
  put("doneNote", r.found
    ? "It had already been created — TraceBug found it rather than filing it twice."
    : (r.label || "") + (r.label ? " · " : "") + "Your ticket in TraceBug is unchanged.");
  show("doneBox", true);
  $("send").hidden = true;
  $("cancel").textContent = "Close";
  $("cancel").disabled = false;
  $("cancel").focus();
}

/** Open the created issue — only an https URL on that tracker's own site. */
function openIssue() {
  const link = $("issueLink");
  let u;
  try { u = new URL(link.dataset.url || ""); } catch { return; }
  const hosts = ISSUE_HOSTS[link.dataset.tracker] || [];
  if (u.protocol !== "https:" || !hosts.includes(u.hostname)) return;
  openExternal(u.toString());
}

/** Called from load() for a title + body tracker send. */
async function startPanel(target) {
  if (!(await loadStatus())) return false;
  panel.active = true;
  wirePanel();
  show("panel", true);
  // The panel already says where it goes; no Destination/Via rows, no timer.
  $("meta").hidden = true;
  if (tick) clearInterval(tick);
  put("countdown", "");
  $("send").textContent = "Create issue";
  const first = rowFor(target) ? target : ISSUE_TRACKERS[0];
  renderTrackerSelect(first);
  await selectTracker(first);
  return true;
}

async function load() {
  if (!ID) { fatal("This confirmation window has no request id."); return; }

  const res = await send("tb:confirm:get", { id: ID });
  if (!res || !res.ok) {
    fatal((res && res.error) || "This request is no longer waiting for confirmation.");
    return;
  }

  const r = res.request;
  put("origin", r.origin || "an unknown page");
  put("provider", r.providerLabel || r.target || "");

  if (r.kind === "llm") {
    // First AI analysis on this site: the question is about trusting the site,
    // not about one report, so the copy and the buttons change.
    put("heading", "Allow AI analysis from this site?");
    put("destination", r.destination || "");
    $("send").textContent = "Allow";
    $("cancel").textContent = "Don't allow";
    $("titleWrap").style.display = "none";
    put("bodyLabel", "Prompt that will be sent");
  } else {
    put("heading", "Send this report?");
    put("destination", r.destination || "");
    if (r.title) {
      put("title", r.title);
    } else {
      $("titleWrap").style.display = "none";
    }
  }

  put("body", r.body || "");
  // A shortened body is labelled at the body itself as well as warned about
  // above: the label is where someone looks when they notice the text stops.
  if (r.shortened) put("bodyLabel", (r.kind === "llm" ? "Prompt that will be sent" : "Body") + " — shortened to fit");
  renderWarnings(r.warnings);
  startCountdown(r.expiresAt);

  // Cancel is focused by default: the safe answer should be the one a stray
  // Enter keypress picks.
  $("cancel").focus();

  // The Create panel loads AFTER the body and warnings are on screen: listing
  // repos is a network call, and what is about to be sent must never wait on it.
  if (r.kind !== "llm" && ISSUE_TRACKERS.includes(r.target)) {
    setTitle(null);
    $("send").disabled = true;
    await startPanel(r.target);
  }
}

async function decide(approved) {
  if (decided) return;
  if (approved && panel.active && $("send").disabled) return;
  decided = true;
  stopPolling();
  $("send").disabled = true;
  $("cancel").disabled = true;
  put("countdown", approved ? (panel.active ? "Creating…" : "Sending…") : "Cancelled.");
  const msg = { id: ID, approved: !!approved };
  if (approved && panel.active) msg.choice = collectChoice();
  const res = await send("tb:confirm:decide", msg);
  // A choice the worker refused leaves the request waiting: say why, and let
  // the user fix it rather than closing on them.
  if (approved && panel.active && res && res.ok === false && res.error) {
    decided = false;
    $("cancel").disabled = false;
    panelMsg(res.error, true);
    syncCreateButton();
    return;
  }
  if (tick) clearInterval(tick);
  window.close();
}

$("send").addEventListener("click", () => (panel.active ? createIssue() : decide(true)));
$("cancel").addEventListener("click", () => {
  if (panel.busy) return;
  // After a create, the request is already settled: Close just closes.
  if (decided && panel.active) { window.close(); return; }
  decide(false);
});
$("issueLink").addEventListener("click", (e) => { e.preventDefault(); openIssue(); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panel.busy) return;
  if (decided && panel.active) { window.close(); return; }
  decide(false);
});

// Closing the window with the titlebar ✕ is a cancel. The worker also watches
// windows.onRemoved, so this is belt-and-braces for the case where the window
// is closed in a way that still runs unload handlers.
window.addEventListener("beforeunload", () => {
  if (decided) return;
  decided = true;
  try { chrome.runtime.sendMessage({ type: "tb:confirm:decide", id: ID, approved: false }); } catch {}
});

load();
