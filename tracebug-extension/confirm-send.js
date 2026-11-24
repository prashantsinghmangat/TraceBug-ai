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

// Phase 13 Step 3: the same panel, framed in the ticket (create-issue.html).
// There the request id and its one-time nonce arrive by postMessage from our
// content script, every call to the worker carries the nonce, Create waits
// until the frame has been fully visible for a moment and takes only a real
// click, and Close/Cancel tell the parent to remove the frame.
const EMBED = /\/create-issue\.html$/.test(location.pathname);
let ID = EMBED ? "" : (params.get("id") || "");
let NONCE = "";
let PARENT_ORIGIN = "";
// The frame must be fully on screen (and, where Chrome can tell, not covered
// or faded) for this long before Create works.
const ARM_MS = 500;

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

// The files this send carries (names, types, sizes — the bytes stay in the
// worker). Linear uploads them; GitHub can't.
let REQ_ATTACH = [];

function fmtSize(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}

function renderAttachNote(trackerId) {
  const el = $("attachNote");
  if (!el) return;
  const t = panel.current;
  // U4 (GitHub): only once there is something to file. Linear is frozen as is.
  if (!REQ_ATTACH.length || (EMBED && trackerId === "github" && !(t && t.connected))) { el.hidden = true; return; }
  const list = REQ_ATTACH.map((a) => a.name + " (" + fmtSize(a.size) + ")").join(", ");
  const ask = trackerId === "linear" && t && t.uploadOrigins && t.uploadOrigins.length && !t.uploadGranted
    ? " · Linear stores attachments on " + t.uploadWhere + "; Chrome asks once when you create."
    : "";
  if (trackerId === "linear") el.textContent = "Attaches: " + list + ask;
  else if (EMBED) {
    // One short line under Create.
    const img = REQ_ATTACH.some((a) => /^image\//.test(a.type));
    const vid = REQ_ATTACH.some((a) => /^video\//.test(a.type));
    el.textContent = "GitHub can't take files — after Create, copy or download " +
      (img && vid ? "the screenshot and recording" : vid ? "the recording" : "the screenshot") + ".";
  } else el.textContent = "Not attached (GitHub can't take files): " + list;
  el.hidden = false;
}

const panel = {
  active: false,
  trackers: [],          // tb:tracker:status rows
  current: null,         // the selected row
  items: [],             // containers for the current tracker
  fieldSpecs: [],        // FieldSpec[] for the current container
  picks: {},             // what is picked, per field — drawn from, and sent (panel-fields.js)
  fieldsFor: "",         // container the specs belong to (or are loading for)
  fieldsSeq: 0,          // the newest field load; older answers are dropped
  pollTimer: null,
  loadSeq: 0,
  keep: null,            // choices held across a reconnect: {tracker, container, fields}
  busy: false,           // a create is in flight
  armed: !EMBED,         // EMBED: fully visible for ARM_MS
  armedBy: "",           // "io" (v2 said visible) | "probe" (content script's check)
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

/** Why the picked repository can't take issues ("Archived", …), or "". */
function unavailableReason() {
  const c = selectedContainer().toLowerCase();
  const it = c && panel.items.find((x) => String(x.id).toLowerCase() === c);
  return it && it.unavailable ? String(it.unavailable) : "";
}

/** Create is possible once there is a credential and a destination. */
function syncCreateButton() {
  if (!panel.active || decided) return;
  const t = panel.current;
  $("send").disabled = panel.busy || !panel.armed || !(t && t.connected && selectedContainer()) || !!unavailableReason();
  if (EMBED) focusSendIfWanted();
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
  // The request id brings this site's remembered picks (worker-side only).
  const res = await send("tb:tracker:status", { id: ID });
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
  panel.fieldsSeq++;
  clearFields();
  $("containerList").textContent = "";
  // U9: only the current message — nothing from before this (re)render.
  panelMsg("");
  ["deviceBox", "accessBox", "replaceBox", "revokeNote", "ssoBox"].forEach((id) => show(id, false));
  if (!t) return;
  setTitle(t);
  renderAttachNote(t.id);

  put("account", accountText(t));
  // The panel can also remove a token; the window leaves that to settings —
  // except GitHub, whose one connection Disconnect removes whichever it is.
  show("disconnect", t.via === "oauth" || (t.via === "token" && (EMBED || t.id === "github")));
  // Token mode: sign-in is a quiet link, where this build can sign in.
  show("switchSignIn", t.id === "github" && t.connected && t.via === "token" && !!t.canConnect);
  show("installBox", false);
  show("repoNote", false);

  if (!t.connected) {
    show("pickBox", false);
    show("connectBox", true);
    show("tokenBox", true);
    put("connectText", t.canConnect
      ? (t.needsReconnect ? t.label + " needs you to sign in again." : "Connect " + t.label + " to pick where this goes.")
      : $("tokenBox")
        ? "Connect " + t.label + " with " + (t.id === "linear" ? "an API key" : "a token") + " to pick where this goes."
        : t.label + " isn't connected. Add a token in TraceBug settings, then send again.");
    show("connect", t.canConnect);
    $("connect").textContent = (t.needsReconnect ? "Reconnect " : "Connect ") + t.label;
    setupTokenBox(t);
    syncCreateButton();
    return;
  }

  show("connectBox", false);
  show("pickBox", true);
  show("repoField", true);
  renderSuggest(false);
  put("containerLabel", t.containerNoun);
  show("manageLink", !!t.manageUrl);
  $("manageLink").dataset.url = t.manageUrl || "";
  // After a reconnect, the user's own choices win over the remembered ones.
  const keep = panel.keep && panel.keep.tracker === t.id ? panel.keep : null;
  // This site's last pick first, else the default; checked once the list loads.
  const fromSite = !!(t.site && t.site.container);
  const pick = fromSite ? t.site : t.last;
  panel.prefill = keep ? null : { from: fromSite ? "site" : "default", container: (pick && pick.container) || "" };
  $("container").value = (keep && keep.container) || (pick && pick.container) || "";
  syncCreateButton();
  await loadContainers();
  await loadFields(true);
}

// ── Repository suggestions (panel, U7/U10) ────────────────────────────────
// Our own listbox under the field, in the panel's flow: never wider than the
// panel, scrolls past a max height, never over "Don't see it?". The window
// keeps the browser's datalist.

const suggest = { active: -1, shown: [] };

function suggestOpen() {
  const ul = $("containerSuggest");
  return !!ul && !ul.hidden;
}

function suggestItems() {
  const q = selectedContainer().toLowerCase();
  const exact = panel.items.find((it) => String(it.id).toLowerCase() === q);
  // The field holds a listed repository: it first, then all the others (to switch).
  const list = exact ? [exact].concat(panel.items.filter((it) => it !== exact))
    : !q ? panel.items
    : panel.items.filter((it) => String(it.id).toLowerCase().includes(q) || String(it.label || "").toLowerCase().includes(q));
  return list.slice(0, 100);
}

function renderSuggest(open) {
  const ul = $("containerSuggest");
  if (!ul) return;
  const items = open ? suggestItems() : [];
  suggest.shown = items;
  if (suggest.active >= items.length) suggest.active = -1;
  ul.textContent = "";
  items.forEach((it, i) => {
    const li = document.createElement("li");
    li.id = "sg_" + i;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", i === suggest.active ? "true" : "false");
    li.textContent = String(it.label || it.id);
    const extra = it.unavailable ? String(it.unavailable) + " (can't file here)" : it.detail ? String(it.detail) : "";
    if (extra) {
      const s = document.createElement("span");
      s.className = "muted";
      s.textContent = extra;
      li.appendChild(s);
    }
    if (it.unavailable) li.setAttribute("aria-disabled", "true");
    // Keep focus in the field; the click picks.
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => pickSuggestion(i));
    ul.appendChild(li);
  });
  ul.hidden = !items.length;
  const c = $("container");
  c.setAttribute("aria-expanded", items.length ? "true" : "false");
  if (suggest.active >= 0 && items.length) {
    c.setAttribute("aria-activedescendant", "sg_" + suggest.active);
    try { $("sg_" + suggest.active).scrollIntoView({ block: "nearest" }); } catch {}
  } else c.removeAttribute("aria-activedescendant");
}

function pickSuggestion(i) {
  const it = suggest.shown[i];
  if (!it) return;
  $("container").value = String(it.id);
  suggest.active = -1;
  renderSuggest(false);
  // The field's usual checks (why it can't take issues, its labels).
  $("container").dispatchEvent(new Event("input"));
}

function wireSuggest() {
  const c = $("container");
  if (!$("containerSuggest")) return;
  c.addEventListener("input", (e) => { if (e.isTrusted) { suggest.active = -1; renderSuggest(true); } });
  c.addEventListener("click", () => renderSuggest(!suggestOpen()));
  // The list sits in the flow above Create: closing it on the mousedown that
  // blurs the field would move Create before the mouseup, and the click
  // would be lost. A pointer blur closes it once that click has landed.
  let pointerDown = false;
  document.addEventListener("pointerdown", () => { pointerDown = true; }, true);
  document.addEventListener("pointerup", () => { pointerDown = false; }, true);
  c.addEventListener("blur", () => {
    if (!pointerDown) { renderSuggest(false); return; }
    document.addEventListener("click", () => setTimeout(() => { if (document.activeElement !== c) renderSuggest(false); }, 0), { once: true, capture: true });
    // No click follows (the pointer left the panel): close anyway.
    setTimeout(() => { if (document.activeElement !== c) renderSuggest(false); }, 1000);
  });
  c.addEventListener("keydown", (e) => {
    const open = suggestOpen();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        // Start on the repository the field already holds, if it's listed.
        const q = selectedContainer().toLowerCase();
        suggest.active = Math.max(0, suggestItems().findIndex((it) => String(it.id).toLowerCase() === q));
        renderSuggest(true);
        return;
      }
      suggest.active = Math.min(suggest.active + 1, suggest.shown.length - 1);
      renderSuggest(true);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      suggest.active = Math.max(suggest.active - 1, 0);
      renderSuggest(true);
    } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && open && suggest.active >= 0) {
      e.preventDefault();
      pickSuggestion(suggest.active);
    } else if (e.key === "Escape" && open) {
      // Closes the list only, not the panel.
      e.preventDefault();
      e.stopPropagation();
      renderSuggest(false);
    } else if (e.key === "Tab" && open) {
      renderSuggest(false);
    }
  });
}

/** How it's connected, in words: GitHub names the mode (B11); Linear keeps its own. */
function accountText(t) {
  if (!t || !t.connected) return "";
  const hint = t.tokenHint ? " " + t.tokenHint : "";
  if (t.id === "github") {
    return t.via === "oauth" ? "Signed in" + (t.account ? " as " + t.account : "") + " · GitHub App" : "Using a personal token" + hint;
  }
  return t.via === "oauth" ? (t.account ? "as " + t.account : "signed in") : "with a token" + hint;
}

/**
 * One GitHub connection (B11): before a sign-in replaces a token, or a token
 * a sign-in, ask in the panel. onYes runs inside the Replace click, so it can
 * still ask the browser for permissions. The window has no box: no question.
 */
function askReplace(text, onYes) {
  if (!$("replaceBox")) { onYes(); return; }
  put("replaceText", text);
  show("replaceBox", true);
  $("replaceYes").onclick = () => { show("replaceBox", false); onYes(); };
  $("replaceNo").onclick = () => { show("replaceBox", false); };
  $("replaceYes").focus();
}

/** A sign-in record exists for this tracker (working, or waiting for Reconnect). */
function hasSignIn(t) {
  return !!t && (t.via === "oauth" || !!t.needsReconnect);
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
    showSso(res && res.sso ? [res.sso] : [], "");
    if (res && res.reconnect) await refreshAfterAuthChange(t.id);
    return;
  }
  panel.items = Array.isArray(res.items) ? res.items : [];
  showSso(Array.isArray(res.ssoPartial) ? res.ssoPartial : [],
    "Some organisations hide repositories until you authorise TraceBug for them (single sign-on).");
  const list = $("containerList");
  list.textContent = "";
  panel.items.forEach((it) => {
    const o = document.createElement("option");
    o.value = String(it.id);
    if (it.label && it.label !== it.id) o.label = String(it.label) + (it.detail ? " · " + it.detail : "");
    else if (it.detail) o.label = String(it.detail);
    // Listed so the user sees why, but it can't take issues.
    if (it.unavailable) o.label = (o.label || String(it.id)) + " — " + String(it.unavailable) + " (can't file here)";
    list.appendChild(o);
  });
  // Signed in to the GitHub App but it's on no repository: offer the install.
  const noInstall = !panel.items.length && t.id === "github" && t.via === "oauth" && !!$("installBox");
  show("installBox", noInstall);
  // U4: not installed → Install + Refresh only; the repository field, its
  // link and the files line come back once there is something to pick.
  show("repoField", !noInstall);
  if (noInstall) { clearFields(); show("attachNote", false); } else renderAttachNote(t.id);
  if (suggestOpen()) renderSuggest(true);
  if (noInstall) {
    panel.installWatch = true;
    // GitHub told us (setup_action=request) an owner has to approve it.
    put("installText", res.installPending
      ? "Waiting for your organisation owner to approve TraceBug. Its repositories appear here once they do — use Refresh after they approve."
      : "TraceBug isn't installed on any of your GitHub repositories yet. Install it on the ones you want to file into, then come back here.");
    put("installApp", res.installPending ? "Install on another account" : "Install TraceBug on GitHub");
  }
  panelMsg(panel.items.length || noInstall ? "" : "Nothing to pick from — type the " + t.containerNoun.toLowerCase() + " instead.");
  await checkPrefill(t);
  if (seq !== panel.loadSeq) return;
  // Linear's container id is opaque; show the team the remembered id is.
  if (!selectedContainer() && panel.items.length === 1) $("container").value = panel.items[0].id;
  // U9: about the repository the field shows now — after any fallback above.
  checkRepoAllowed();
  syncCreateButton();
  // B8: the list just (re)loaded — after an install, a Refresh, a reconnect —
  // so a repository that is valid now gets its labels and assignees.
  if (!noInstall && selectedContainer() && !unavailableReason()) await loadFields(true);
}

/**
 * A remembered repository/team the fresh list no longer has (removed, access
 * revoked, app uninstalled) is never selected: fall back to the default if it
 * is still there, else leave it empty, and say so in one line. A list that hit
 * the cap may just be cut short: then each candidate is asked about directly
 * (the field stays empty meanwhile, so Create can't use it unchecked).
 */
const LIST_CAP = 500;
async function checkPrefill(t) {
  const pf = panel.prefill;
  panel.prefill = null;
  if (!pf || !pf.container || !panel.items.length) return;
  if (selectedContainer() !== pf.container) return;
  const capped = panel.items.length >= LIST_CAP;
  const listed = (c) => panel.items.some((it) => String(it.id).toLowerCase() === String(c).toLowerCase());
  const usable = async (c) => {
    if (listed(c)) return true;
    if (!capped) return false;
    const r = await send("tb:tracker:check-container", { tracker: t.id, container: c });
    return !!(r && r.ok === true);
  };
  if (listed(pf.container)) return;
  $("container").value = "";
  syncCreateButton();
  if (await usable(pf.container)) {
    if (!selectedContainer()) $("container").value = pf.container;
    syncCreateButton();
    return;
  }
  const def = t.last && t.last.container;
  const useDef = pf.from === "site" && def && def !== pf.container && await usable(def);
  if (!selectedContainer() && useDef) $("container").value = def;
  // Linear team ids are opaque: name GitHub repos, describe Linear teams.
  const gone = t.id === "github" ? pf.container : "The team you used last";
  const now = t.id === "github" ? "your default " + def : "your default team";
  panelMsg(gone + " is no longer available" + (useDef ? ", using " + now + "." : ". Pick one below."));
  syncCreateButton();
}

function clearFields() {
  $("fields").textContent = "";
  panel.fieldSpecs = [];
  panel.picks = {};
  panel.fieldsFor = "";
}

async function loadFields(useRemembered) {
  const t = panel.current;
  const container = selectedContainer();
  if (!t || !container || container === panel.fieldsFor) return;
  const seq = ++panel.fieldsSeq;
  // A repository that can't take issues: nothing to pick, and the reason stays on screen.
  if (unavailableReason()) { clearFields(); return; }
  clearFields();
  panel.fieldsFor = container;
  const res = await send("tb:tracker:fields", { tracker: t.id, container });
  // A newer load (another repository, a reconnect) owns the panel now.
  if (seq !== panel.fieldsSeq || container !== selectedContainer()) {
    if (seq === panel.fieldsSeq) panel.fieldsFor = "";
    return;
  }
  // Failed: forget the attempt, so the next list refresh (or pick) tries again.
  if (needsAccess(res)) { panel.fieldsFor = ""; return; }
  if (!res || res.error) {
    panel.fieldsFor = "";
    panelMsg((res && res.error) || "Could not load the fields.", true);
    return;
  }
  const specs = Array.isArray(res.fields) ? res.fields : [];
  const keep = panel.keep && panel.keep.tracker === t.id && panel.keep.container === container ? panel.keep : null;
  const remembered = keep ? keep.fields
    : useRemembered && t.site && t.site.container === container ? (t.site.fields || {})
    : useRemembered && t.last && t.last.container === container ? (t.last.fields || {}) : null;
  panel.keep = null;
  // One state, drawn here and sent by Create; cleared right before drawing.
  panel.fieldSpecs = specs;
  panel.picks = self.TraceBugPanelFields.initialPicks(specs, remembered);
  const box = $("fields");
  box.textContent = "";
  specs.forEach((f) => box.appendChild(renderField(f)));
}

function renderField(spec) {
  const PF = self.TraceBugPanelFields;
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
      if (PF.isPicked(panel.picks, spec.key, o.value)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", () => { panel.picks[spec.key] = sel.value; });
    wrap.append(lab, sel);
    if (spec.note) wrap.appendChild(noteEl(spec.note));
    return wrap;
  }

  // Multi-select as chips, drawn from panel.picks and written back to it
  // ("bug" starts ticked on a repository with nothing remembered: panel-fields.js).
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
    chip.setAttribute("aria-pressed", PF.isPicked(panel.picks, spec.key, chip.value) ? "true" : "false");
    chip.addEventListener("click", () => {
      chip.setAttribute("aria-pressed", PF.toggle(panel.picks, spec.key, chip.value) ? "true" : "false");
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

/** What Create sends: the same state the chips and selects are drawn from. */
function collectChoice() {
  const t = panel.current;
  return { tracker: t.id, container: selectedContainer(), fields: self.TraceBugPanelFields.choiceFields(panel.fieldSpecs, panel.picks) };
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

/**
 * Copy text: the async clipboard first (call it from the click, before any
 * await), else a selected read-only input and execCommand("copy").
 */
async function copyText(text) {
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const back = document.activeElement;
  const box = document.createElement("input");
  box.readOnly = true;
  box.value = text;
  box.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(box);
  box.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  box.remove();
  if (back && typeof back.focus === "function") { try { back.focus(); } catch {} }
  return ok;
}

/** The site's Permissions-Policy blocks the clipboard in this frame (it wins
 *  over the frame's allow attribute). Only then do we say "this site". */
function clipboardBlocked() {
  const fp = document.featurePolicy || document.permissionsPolicy;
  try { return !!(fp && typeof fp.allowsFeature === "function" && !fp.allowsFeature("clipboard-write")); }
  catch { return false; }
}

/** Select the device code on screen, so Ctrl+C works when Copy can't. */
function selectCode() {
  const el = $("userCode");
  if (!el) return;
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  } catch {}
}

function copyFailedText(what) {
  return (clipboardBlocked() ? "This site blocks copying. " : "Couldn't copy. ") + what;
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

/** The paste shortcut, as the user's keyboard labels it. */
function pasteKeys() {
  return /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘V" : "Ctrl+V";
}

function openExternal(url) {
  let u;
  try { u = new URL(url); } catch { return; }
  if (u.protocol !== "https:") return;
  try { chrome.tabs.create({ url: u.toString(), active: true }); } catch {}
}

// ── "Use a token instead" (panel only) ─────────────────────────────────────
// The token is typed into THIS frame, sent to the worker (which checks it
// against the API and saves it), and cleared. It is never posted to the page.

const TOKEN_HELP = {
  github: { url: "https://github.com/settings/tokens/new?scopes=repo&description=TraceBug", text: "A classic token with the \"repo\" scope, or a fine-grained one with Issues: Read and write." },
  linear: { url: "https://linear.app/settings/account/security", text: "A personal API key from Linear's security settings." },
};

function secretNoun(t) {
  return t && t.id === "linear" ? "API key" : "token";
}

function setupTokenBox(t) {
  const box = $("tokenBox");
  if (!box) return;
  const help = TOKEN_HELP[t.id] || TOKEN_HELP.github;
  put("tokenSummary", "Use " + (t.id === "linear" ? "an API key" : "a token") + " instead");
  put("tokenLabel", t.id === "linear" ? "Linear API key" : "GitHub personal access token");
  put("tokenHelpText", help.text);
  put("tokenHelp", t.id === "linear" ? "Create one in Linear" : "Create one on GitHub");
  $("tokenHelp").dataset.url = help.url;
  $("tokenInput").value = "";
  tokenMsg("");
  // No sign-in in this build (a store build without its GitHub App yet): the
  // token is the way in, so it starts open — never a dead Connect button.
  box.open = !t.canConnect;
}

function tokenMsg(text, isErr) {
  const el = $("tokenMsg");
  el.textContent = String(text || "");
  el.className = "msg" + (isErr ? " err" : "");
}

async function onTokenSave(e, replaceOk) {
  const t = panel.current;
  if (!t || panel.tokenSaving) return;
  const secret = ($("tokenInput").value || "").trim();
  if (!secret) { tokenMsg("Paste " + (t.id === "linear" ? "an API key" : "a token") + " first.", true); $("tokenInput").focus(); return; }
  // One GitHub connection: a token replaces the sign-in — ask first.
  if (t.id === "github" && hasSignIn(t) && replaceOk !== true) {
    askReplace("This replaces your GitHub sign-in" + (t.account ? " (" + t.account + ")" : "") + " with this token.",
      () => onTokenSave(null, true));
    return;
  }
  // Host access first, inside the click (an await before it loses the gesture).
  const granted = await requestPermissions({ origins: t.apiHosts || [] });
  if (!granted) { tokenMsg("TraceBug needs access to " + t.label + " to check and use the " + secretNoun(t) + ".", true); return; }
  panel.tokenSaving = true;
  $("tokenSave").disabled = true;
  tokenMsg("Checking with " + t.label + "…");
  const container = (selectedContainer() || (t.last && t.last.container) || "").trim();
  const res = await send("tb:tracker:save-token", { tracker: t.id, secret, container });
  panel.tokenSaving = false;
  $("tokenSave").disabled = false;
  if (!res || res.error || !res.ok) {
    tokenMsg((res && res.error) || "Could not check the " + secretNoun(t) + ".", true);
    return;
  }
  $("tokenInput").value = "";
  tokenMsg("");
  await refreshAfterAuthChange(t.id);
  panelMsg("Connected" + (res.account ? " as " + res.account : "") + " with " + (t.id === "linear" ? "an API key" : "a token") + ".");
}

// ── SAML single sign-on (panel only) ───────────────────────────────────────
// GitHub hides an SSO organisation's repositories (or refuses a call) until
// the token is authorised for it. Each link is a github.com page from GitHub's
// own answer, re-checked and opened by the worker; coming back reloads.

function showSso(links, text) {
  const box = $("ssoBox");
  if (!box) return;
  const list = (links || []).filter((l) => l && typeof l.url === "string" && /^https:\/\/github\.com\//.test(l.url));
  show("ssoBox", list.length > 0);
  if (!list.length) return;
  put("ssoText", text || "GitHub needs you to authorise TraceBug for this organisation (single sign-on) first.");
  const row = $("ssoLinks");
  row.textContent = "";
  list.forEach((l) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "small";
    b.textContent = "Authorise TraceBug for " + (l.org || "your organisation");
    b.addEventListener("click", () => openSso(l.url));
    row.appendChild(b);
  });
}

async function openSso(url) {
  const res = await send("tb:tracker:open-sso", { tracker: "github", url });
  if (!res || !res.ok) { panelMsg((res && res.error) || "Could not open GitHub.", true); return; }
  panelMsg("Authorise TraceBug on GitHub, then come back — the list refreshes by itself.");
  watchGitHubWindow();
}

// ── "Install TraceBug on GitHub" (panel only) ──────────────────────────────
// The worker opens GitHub's install page; we refresh the repositories when it
// closes, when the user comes back, or on Refresh.

async function openInstall() {
  const res = await send("tb:tracker:open-install", { tracker: "github" });
  if (!res || !res.ok) { panelMsg((res && res.error) || "Could not open GitHub.", true); return; }
  panelMsg("Pick the repositories on GitHub, then come back — the list refreshes by itself.");
  watchGitHubWindow();
}

/** Reload the list when the GitHub window (install or SSO) closes. */
function watchGitHubWindow() {
  panel.installWatch = true;
  clearTimeout(panel.installTimer);
  const started = Date.now();
  const tick = async () => {
    if (decided || !panel.installWatch) return;
    const st = await send("tb:tracker:install-state", { tracker: "github" });
    if (st && st.open === false) { await loadContainers(); return; }
    if (Date.now() - started < 10 * 60 * 1000) panel.installTimer = setTimeout(tick, 1500);
  };
  panel.installTimer = setTimeout(tick, 1500);
}

/** Signed in through the app, the list loaded, and the typed repo isn't on it. */
function checkRepoAllowed() {
  const t = panel.current;
  const why = unavailableReason();
  if (why) panelMsg(selectedContainer() + ": " + (why === "Archived" ? "archived, so it can't take new issues" : "Issues are turned off there") + ". Pick another repository.", true);
  syncCreateButton();
  if (!$("repoNote") || !t) return;
  const c = selectedContainer();
  const off = t.id === "github" && t.via === "oauth" && panel.items.length > 0 && /^[\w.-]+\/[\w.-]+$/.test(c) &&
    !panel.items.some((it) => String(it.id).toLowerCase() === c.toLowerCase());
  show("repoNote", off);
  if (off) put("repoNoteName", c);
  // Repositories are there now: stop refreshing on focus.
  if (panel.items.length) panel.installWatch = false;
}

async function onConnect() {
  const t = panel.current;
  if (!t || !t.canConnect) return;
  const granted = await requestPermissions(t.connectPermissions);
  if (!granted) { panelMsg("TraceBug needs that permission to sign in to " + t.label + ".", true); return; }
  $("connect").disabled = true;
  show("revokeNote", false);
  panelMsg("Connecting to " + t.label + "…");
  // open:false — copy the code while this page still has focus, then open
  // GitHub's window (it takes focus, and the clipboard refuses an unfocused page).
  const res = await send("tb:tracker:connect", { tracker: t.id, open: false });
  $("connect").disabled = false;
  if (!res || res.error) { panelMsg((res && res.error) || "Could not connect.", true); return; }
  if (needsAccess(res)) { panelMsg(""); return; }
  if (res.flow === "device") {
    put("userCode", res.userCode || "");
    $("openDevice").dataset.url = res.verificationUri || "";
    show("deviceBox", true);
    // The code is selectable and has its own Copy button if this fails.
    const copied = await copyText(res.userCode || "");
    // The worker opens GitHub's page (a popup window, else a tab) and closes
    // it when the token arrives — the token is the only "connected" signal.
    const shown = res.opened ? { ok: true, opened: res.opened } : await send("tb:tracker:connect-show", { tracker: t.id });
    const opened = shown && shown.ok ? shown.opened : null;
    show("openDevice", !opened);
    const where = opened === "tab" ? "GitHub tab" : "GitHub window";
    panel.deviceHint = copied
      ? "Code copied — in the " + where + ", press " + pasteKeys() + ", then Continue and Authorize."
      : "Select the code and copy it, then paste it in the " + where + " and Continue and Authorize.";
    put("deviceHint", panel.deviceHint);
    panelMsg("This window carries on by itself once you authorize.");
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
      const code = res && res.code;
      // The code ended: cancelled on GitHub, expired, or refused.
      $("connect").textContent = code === "expired_token" ? "Get a new code" : "Connect " + (panel.current ? panel.current.label : "");
      panelMsg((res && res.error) || "Sign-in failed. Click Connect to try again.", true);
      return;
    }
    if (res.status === "pending") {
      show("openDevice", !!res.popupClosed);
      panelMsg(res.popupClosed
        ? "The GitHub window is closed. Reopen it to finish — your code still works."
        : res.retrying ? "Can't reach GitHub — still trying…" : "This window carries on by itself once you authorize.");
      schedulePoll(id, res.interval || seconds);
      return;
    }
    show("deviceBox", false);
    bringToFront();
    panelMsg("Connected" + (res.account ? " as " + res.account : "") + ".");
    await refreshAfterAuthChange(id);
  }, Math.max(1, seconds) * 1000);
}

async function onDisconnect() {
  const t = panel.current;
  if (!t) return;
  const res = await send("tb:tracker:disconnect", { tracker: t.id, token: EMBED && t.via === "token" });
  if (!res || res.error) { panelMsg((res && res.error) || "Could not disconnect.", true); return; }
  await refreshAfterAuthChange(t.id);
  // Exactly what was removed, and where to finish on GitHub (B7, B11).
  const what = disconnectNote(res);
  if (!what) return;
  if ($("revokeNote")) {
    put("revokeText", what.text);
    put("revokeLink", what.link);
    $("revokeLink").dataset.url = what.url;
    show("revokeNote", true);
  } else {
    panelMsg(what.text + " " + what.link + " (" + what.url + ")");
  }
}

/** The Disconnect answer in words: { text, link, url }, or null. */
function disconnectNote(res) {
  if (res.removed === "signin" && res.revokeUrl) {
    return { text: "Signed out. TraceBug deleted its GitHub sign-in from this browser. To remove its access on GitHub too:",
      link: "Authorized GitHub Apps", url: res.revokeUrl };
  }
  if (res.removed === "token" && res.tokenUrl) {
    return { text: "Token removed from this browser. You can delete it on GitHub:", link: "Personal access tokens", url: res.tokenUrl };
  }
  return null;
}

/** Token mode → "Switch to GitHub sign-in": confirm, then the usual Connect. */
function onSwitchSignIn(e) {
  e.preventDefault();
  const t = panel.current;
  if (!t || !t.canConnect) return;
  askReplace("This replaces your token" + (t.tokenHint ? " " + t.tokenHint : "") + ". TraceBug signs in with GitHub instead.", () => {
    // The device code shows in the Connect box; the token form isn't wanted here.
    show("switchSignIn", false);
    show("pickBox", false);
    show("connectBox", true);
    show("connect", false);
    show("tokenBox", false);
    put("connectText", "Sign in on GitHub to replace your token.");
    onConnect();
  });
}

function wirePanel() {
  $("tracker").addEventListener("change", () => selectTracker($("tracker").value));
  $("connect").addEventListener("click", onConnect);
  $("disconnect").addEventListener("click", onDisconnect);
  if ($("settingsLink")) $("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    try { chrome.runtime.openOptionsPage(); } catch {}
  });
  if ($("tokenSave")) {
    $("tokenSave").addEventListener("click", onTokenSave);
    $("tokenInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); onTokenSave(); }
    });
    $("tokenHelp").addEventListener("click", (e) => { e.preventDefault(); openExternal($("tokenHelp").dataset.url || ""); });
  }
  if ($("revokeLink")) $("revokeLink").addEventListener("click", (e) => { e.preventDefault(); openExternal($("revokeLink").dataset.url || ""); });
  if ($("switchSignIn")) $("switchSignIn").addEventListener("click", onSwitchSignIn);
  if ($("installApp")) {
    $("installApp").addEventListener("click", openInstall);
    $("configureRepo").addEventListener("click", (e) => { e.preventDefault(); openInstall(); });
    $("refreshRepos").addEventListener("click", () => loadContainers());
    // Back from GitHub (window focus, tab shown again): look again.
    const back = () => { if (panel.installWatch) loadContainers(); };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) back(); });
  }
  // The ticket's plug icon is gone: the Integrations hub is reached from here.
  if ($("manageInt")) $("manageInt").addEventListener("click", (e) => {
    e.preventDefault();
    try { chrome.tabs.create({ url: chrome.runtime.getURL("options.html#integrations") }); } catch {}
  });
  $("copyCode").addEventListener("click", async () => {
    if (await copyText($("userCode").textContent || "")) { panelMsg("Code copied — press " + pasteKeys() + " on GitHub."); return; }
    selectCode();
    panelMsg(copyFailedText("The code is selected: press " + (pasteKeys() === "⌘V" ? "⌘C" : "Ctrl+C") + "."), true);
  });
  $("manageLink").addEventListener("click", (e) => {
    e.preventDefault();
    if ($("installBox")) { openInstall(); return; }
    openExternal($("manageLink").dataset.url || "");
  });
  $("openDevice").addEventListener("click", async () => {
    const t = panel.current;
    const res = t ? await send("tb:tracker:connect-show", { tracker: t.id }) : null;
    if (res && res.ok) { show("openDevice", false); panelMsg("This window carries on by itself once you authorize."); return; }
    openExternal($("openDevice").dataset.url || "");
  });
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
  wireSuggest();
  c.addEventListener("input", () => {
    // U9: a note about the repository that was there before goes with it;
    // then what applies to this one (archived, Issues off, not allowed).
    panelMsg("");
    checkRepoAllowed();
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

async function createIssue(e) {
  if (decided || panel.busy || $("send").disabled) return;
  // In the page, only a real click (or key press) — not one a script made.
  if (EMBED && !(e && e.isTrusted)) return;
  const choice = collectChoice();
  // Linear keeps attachments on separate storage (an optional host). Ask for
  // it here, on the first send that has files — synchronously, inside this
  // click, before any await, or the browser refuses without asking.
  const t = panel.current;
  let asking = null;
  if (t && t.id === "linear" && REQ_ATTACH.length && t.uploadOrigins && t.uploadOrigins.length && !t.uploadGranted) {
    panelMsg("Linear stores attachments on " + t.uploadWhere + ". Allow TraceBug to upload them there?");
    asking = requestPermissions({ origins: t.uploadOrigins });
  }
  // Armed on the content script's word, not v2's: check again at the click.
  if (EMBED && panel.armedBy === "probe") {
    panel.busy = true;
    const again = await probeOnce();
    panel.busy = false;
    if (!again.ok || !panel.armed) {
      panel.armed = false;
      syncCreateButton();
      return;
    }
  }
  let attach = true;
  if (asking) {
    attach = await asking;
    if (attach) t.uploadGranted = true;
    panelMsg(attach ? "" : "Filing without attachments — you didn't allow access to " + t.uploadWhere + ".");
  }
  panel.busy = true;
  $("send").disabled = true;
  $("cancel").disabled = true;
  panelMsg("");
  put("countdown", "Creating…");
  const res = await send(EMBED ? "tb:panel:create" : "tb:confirm:create", { id: ID, nonce: NONCE, choice, attach });
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
  // Blocked by single sign-on: nothing was filed; authorise, then Retry.
  if (res && res.sso) showSso([res.sso], "");
  $("send").textContent = "Retry";
  syncCreateButton();
}

function showDone(tracker, r) {
  decided = true;
  // U9: after Create, only "Created #N".
  ["connectBox", "accessBox", "pickBox", "disconnect", "revokeNote", "ssoBox", "replaceBox", "switchSignIn"].forEach((id) => show(id, false));
  $("tracker").disabled = true;
  panelMsg("");
  const link = $("issueLink");
  link.textContent = r.ref || "the issue";
  link.dataset.url = r.url || "";
  link.dataset.tracker = tracker;
  const missing = Array.isArray(r.notAttached) && r.notAttached.length
    ? " Not attached: " + r.notAttached.map((m) => m.name + " — " + m.reason).join("; ") + "."
    : "";
  const attached = r.attached ? " " + r.attached + (r.attached === 1 ? " file" : " files") + " attached." : "";
  put("doneNote", (r.found
    ? "It had already been created — TraceBug found it rather than filing it twice."
    : (r.label || "") + (r.label ? " · " : "") + "Your ticket in TraceBug is unchanged.") + attached + missing);
  show("attachNote", false);
  show("copyShot", tracker === "github" && canCopyShot());
  if (tracker === "github") showDownloads();
  show("doneBox", true);
  $("send").hidden = true;
  $("cancel").textContent = "Close";
  $("cancel").disabled = false;
  $("cancel").focus();
}

// ── Copy / Download screenshot, Download recording (panel, GitHub) ─────────
// GitHub's API takes no files, so after Create the user can paste the
// screenshot into a comment, or download it and the recording. The files are
// fetched from the worker before Create (the request's files go when it ends)
// and live only in this frame. Copy is written on a real click only; no new
// permission (the frame is allowed clipboard-write). Downloads are an <a
// download> on a blob: URL of this frame — no downloads permission.

function canCopyShot() {
  return !!(EMBED && panel.shot && navigator.clipboard && typeof navigator.clipboard.write === "function" &&
    typeof window.ClipboardItem === "function");
}

async function loadFile(kind) {
  const want = kind === "video" ? /^video\// : /^image\//;
  if (!EMBED || !REQ_ATTACH.some((a) => want.test(a.type))) return null;
  const r = await send("tb:panel:screenshot", kind === "video" ? { id: ID, nonce: NONCE, kind } : { id: ID, nonce: NONCE });
  return r && r.ok && typeof r.data === "string" ? { type: r.type, data: r.data, name: typeof r.name === "string" ? r.name : "" } : null;
}

async function loadShot() {
  panel.shot = await loadFile("image");
  panel.video = await loadFile("video");
}

function fileBlob(f) {
  const bin = atob(f.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: f.type });
}

/** A file name we made, never a path: letters, digits and a few marks. */
function safeName(name, fallback) {
  const n = String(name || "").replace(/[^A-Za-z0-9 _.()-]+/g, "-").slice(0, 100);
  return /\.[a-z0-9]{2,4}$/i.test(n) ? n : fallback;
}

/** After Create: point the Download links at blob: URLs of this frame. */
function showDownloads() {
  [["downloadShot", panel.shot, "tracebug-screenshot.png"], ["downloadVideo", panel.video, "tracebug-recording.webm"]].forEach(([id, f, fallback]) => {
    const a = $(id);
    if (!a) return;
    if (!f) { a.hidden = true; return; }
    try {
      if (a.dataset.blobUrl) URL.revokeObjectURL(a.dataset.blobUrl);
      const url = URL.createObjectURL(fileBlob(f));
      a.dataset.blobUrl = url;
      a.href = url;
      a.download = safeName(f.name, fallback);
      a.hidden = false;
    } catch { a.hidden = true; }
  });
}

/** The clipboard takes PNG: re-encode JPEG/WebP through a canvas. */
async function shotAsPng() {
  const blob = fileBlob(panel.shot);
  if (panel.shot.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
}

async function copyShot(e) {
  if (!e || !e.isTrusted || !canCopyShot()) return;
  try {
    const png = await shotAsPng();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    panelMsg("Screenshot copied. Paste it into a comment on the issue.");
  } catch {
    // "This site blocks copying" only when its Permissions-Policy really does.
    panelMsg(copyFailedText("Use Download screenshot instead."), true);
  }
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
  if ($("meta")) $("meta").hidden = true;
  if (tick) clearInterval(tick);
  put("countdown", "");
  $("send").textContent = "Create issue";
  const first = rowFor(target) ? target : ISSUE_TRACKERS[0];
  renderTrackerSelect(first);
  await selectTracker(first);
  return true;
}

// ── Embedded in the ticket ────────────────────────────────────────────────

function postParent(msg) {
  if (PARENT_ORIGIN) { try { window.parent.postMessage(msg, PARENT_ORIGIN); } catch {} }
}

function closeEmbedded() {
  stopPolling();
  postParent({ type: "tb-panel-close" });
}

/** The port that ties the request to this frame: when the frame goes, the
 *  worker cancels it (unless a create is running). Reconnects if the worker
 *  restarted under it. */
function connectPanelPort(tries) {
  let port;
  try { port = chrome.runtime.connect({ name: "tb-panel:" + ID }); } catch { return; }
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (!decided && (tries || 0) < 5) setTimeout(() => connectPanelPort((tries || 0) + 1), 300);
  });
}

function watchSize() {
  const report = () => postParent({ type: "tb-panel-size", height: Math.ceil(document.documentElement.scrollHeight) });
  try { new ResizeObserver(report).observe(document.body); } catch {}
  report();
}

/** Create arms only after the frame has been fully visible for ARM_MS. With
 *  IntersectionObserver v2 (Chrome) "visible" also means not covered,
 *  faded or transformed by the page; elsewhere it means fully on screen. */
function watchVisibility() {
  let timer = 0;
  const set = (visible, onScreenButHidden) => {
    clearTimeout(timer);
    stopProbing();
    if (!visible) {
      panel.armed = false;
      panel.armedBy = "";
      syncCreateButton();
      // On screen, yet v2 says covered, faded or filtered — maybe a decoy,
      // maybe just a page (or a dark-mode extension) that filters everything.
      // Ask our content script for a second opinion.
      if (onScreenButHidden) startProbing();
      else show("toWindowBox", false);
      return;
    }
    show("toWindowBox", false);
    if (panel.armed) return;
    timer = setTimeout(() => { panel.armed = true; panel.armedBy = "io"; syncCreateButton(); }, ARM_MS);
  };
  const onEntries = (entries) => {
    const en = entries[entries.length - 1];
    const full = en.isIntersecting && en.intersectionRatio >= 0.99;
    const seen = en.isVisible === undefined || en.isVisible === true;
    set(full && seen, full && !seen);
  };
  // What must be fully visible is where the click lands: the row holding
  // Create. (The whole panel was too strict: a page that caps the frame's
  // height made it scroll, and Create never armed. Not the button itself: a
  // disabled button is drawn at half opacity, which v2 counts as hidden.)
  let io;
  try { io = new IntersectionObserver(onEntries, { threshold: [0, 0.99, 1], trackVisibility: true, delay: 100 }); }
  catch { io = new IntersectionObserver(onEntries, { threshold: [0, 0.99, 1] }); }
  io.observe($("send").parentElement);
}

// ── Second opinion (IntersectionObserver v2 said "hidden") ──────────────────
// v2 says hidden for ANY filter, opacity or transform up the tree — a
// page-wide dark-mode filter included — so Create would stay paused forever.
// Our content script checks what is really drawn over the Create row (via the
// worker; the page can't answer for it). Two clean checks ARM_MS apart arm
// Create and stop the loop; the click checks once more. While it says no, the
// panel says why, offers the window, and keeps checking every ARM_MS.

const PROBE_WHY = {
  covered: "Something on this page is drawn over this panel",
  overlay: "Something on this page is drawn over this panel",
  faded: "This page fades or hides this panel",
  hidden: "This page fades or hides this panel",
};

let probeTimer = 0;
let probeRun = 0;

function rowRect() {
  const r = $("send").parentElement.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

async function probeOnce() {
  const res = await send("tb:panel:probe", { id: ID, nonce: NONCE, rect: rowRect() });
  return res && res.ok === true ? { ok: true } : { ok: false, reason: (res && res.reason) || "gone" };
}

function stopProbing() {
  clearTimeout(probeTimer);
  probeRun++;
}

function startProbing() {
  const run = ++probeRun;
  let clean = 0;
  const tick = async () => {
    if (decided || panel.busy) { if (!decided) probeTimer = setTimeout(tick, ARM_MS); return; }
    const res = await probeOnce();
    if (run !== probeRun || decided) return;
    if (res.ok) {
      clean++;
      show("toWindowBox", false);
      // Armed: stop here. The click checks once more.
      if (clean >= 2) { panel.armed = true; panel.armedBy = "probe"; syncCreateButton(); return; }
    } else {
      clean = 0;
      if (panel.armed) { panel.armed = false; panel.armedBy = ""; syncCreateButton(); }
      $("toWindowWhy").textContent = (PROBE_WHY[res.reason] || "This page changes how this panel is drawn") +
        ", so Create is paused here for your safety.";
      show("toWindowBox", true);
    }
    probeTimer = setTimeout(tick, ARM_MS);
  };
  tick();
}

// ── Keyboard: the panel is the split button's dropdown ─────────────────────
// It opens with focus on the picker (▾ / Alt+Down) or on Create (the main
// button). Not connected: Connect. Create is disabled until armed, so it takes
// focus the moment it arms, unless the user has moved on. Tab past the last
// control (or Shift+Tab before the first) closes the panel like Esc, and the
// page gives focus back to the button.

let focusWanted = "";

window.addEventListener("focus", () => { if (EMBED) focusSendIfWanted(); });

function focusFirst(hint) {
  if (hint === "picker") { $("tracker").focus(); return; }
  if (!$("connectBox").hidden && !$("connect").hidden) { $("connect").focus(); return; }
  focusWanted = "send";
  focusSendIfWanted();
}

function focusSendIfWanted() {
  if (focusWanted !== "send" || $("send").disabled) return;
  // Never pull focus from the ticket: wait until the panel has it again (the
  // window focus listener below calls back here).
  if (!document.hasFocus()) return;
  const a = document.activeElement;
  if (a && a !== document.body) { focusWanted = ""; return; }
  focusWanted = "";
  $("send").focus();
}

function tabStops() {
  return [...document.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")].filter((el) =>
    !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest("[hidden]"));
}

/** "Open in a window": hand this request to the extension window. */
async function moveToWindow() {
  if (panel.busy || decided) return;
  const res = await send("tb:panel:to-window", { id: ID, nonce: NONCE });
  if (res && res.ok) { decided = true; closeEmbedded(); return; }
  panelMsg((res && res.error) || "Could not open the window.", true);
}

const NONCE_RE = /^[0-9a-f]{48}$/;
let embedStarting = false;

function loadEmbedded() {
  const onInit = async (e) => {
    // Only from our parent, once, in the exact shape the content script sends.
    // The page shares that window and could post too, but it has no nonce: a
    // forged init fails at the worker and the real one still gets through.
    if (ID || embedStarting || e.source !== window.parent) return;
    const d = e.data;
    if (!d || typeof d !== "object" || Array.isArray(d) || Object.keys(d).length !== 5) return;
    if (d.type !== "tb-panel-init" || typeof d.id !== "string" || !d.id || d.id.length > 200) return;
    if (typeof d.nonce !== "string" || !NONCE_RE.test(d.nonce)) return;
    if (d.theme !== "auto" && d.theme !== "light" && d.theme !== "dark") return;
    if (d.focus !== "create" && d.focus !== "picker") return;
    embedStarting = true;
    const res = await send("tb:panel:hello", { id: d.id, nonce: d.nonce, parentOrigin: e.origin });
    embedStarting = false;
    if (!res || !res.ok || !res.request) return;
    window.removeEventListener("message", onInit);
    REQ_ATTACH = Array.isArray(res.request.attachments) ? res.request.attachments : [];
    ID = d.id;
    NONCE = d.nonce;
    PARENT_ORIGIN = e.origin;
    if (d.theme !== "auto") document.documentElement.dataset.theme = d.theme;
    connectPanelPort(0);
    postParent({ type: "tb-panel-ready" });
    watchSize();
    watchVisibility();
    $("send").disabled = true;
    loadShot();
    await startPanel(res.request.target);
    focusFirst(d.focus);
  };
  window.addEventListener("message", onInit);
}

async function load() {
  if (EMBED) { loadEmbedded(); return; }
  if (!ID) { fatal("This confirmation window has no request id."); return; }

  const res = await send("tb:confirm:get", { id: ID });
  if (!res || !res.ok) {
    fatal((res && res.error) || "This request is no longer waiting for confirmation.");
    return;
  }

  const r = res.request;
  REQ_ATTACH = Array.isArray(r.attachments) ? r.attachments : [];
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

$("send").addEventListener("click", (e) => (panel.active ? createIssue(e) : decide(true)));

async function cancelEmbedded() {
  if (panel.busy) return;
  if (!decided) {
    decided = true;
    await send("tb:panel:cancel", { id: ID, nonce: NONCE });
  }
  closeEmbedded();
}

$("cancel").addEventListener("click", () => {
  if (panel.busy) return;
  if (EMBED) { cancelEmbedded(); return; }
  // After a create, the request is already settled: Close just closes.
  if (decided && panel.active) { window.close(); return; }
  decide(false);
});
$("issueLink").addEventListener("click", (e) => { e.preventDefault(); openIssue(); });
if ($("copyShot")) $("copyShot").addEventListener("click", copyShot);
if ($("toWindow")) $("toWindow").addEventListener("click", moveToWindow);

document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd+Enter creates, from any field — the same checks as the button
  // (armed, destination picked, a real key press in the page).
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && panel.active && !decided) {
    e.preventDefault();
    if (!$("send").disabled) createIssue(e);
    return;
  }
  if (EMBED && e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && !panel.busy) {
    const stops = tabStops();
    const a = document.activeElement;
    if (stops.length && a === stops[e.shiftKey ? 0 : stops.length - 1]) {
      e.preventDefault();
      cancelEmbedded();
      return;
    }
  }
  if (e.key !== "Escape" || panel.busy) return;
  if (EMBED) { e.stopPropagation(); cancelEmbedded(); return; }
  if (decided && panel.active) { window.close(); return; }
  decide(false);
});

// Closing the window with the titlebar ✕ is a cancel. The worker also watches
// windows.onRemoved, so this is belt-and-braces for the case where the window
// is closed in a way that still runs unload handlers.
window.addEventListener("beforeunload", () => {
  // Embedded: the port closing tells the worker.
  if (decided || EMBED) return;
  decided = true;
  try { chrome.runtime.sendMessage({ type: "tb:confirm:decide", id: ID, approved: false }); } catch {}
});

load();
