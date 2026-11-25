// ── Connect a tracker from an extension page (ADR 010) ─────────────────────
// Shared by options.html and welcome.html. Everything goes through the worker's
// tb:tracker:* verbs, which answer extension pages only; this file never sees a
// token — just the account name, and repo/team names for the default picker.
// The Create window (confirm-send.js) has its own copy of the connect steps
// because it also keeps the user's field choices across a reconnect.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  function msg(type, extra) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(Object.assign({ type }, extra || {}), (res) => {
          void chrome.runtime.lastError;
          resolve(res || null);
        });
      } catch { resolve(null); }
    });
  }

  /** Must run synchronously inside the click: an await before it loses the
   *  user gesture, and the browser then refuses without asking. */
  function requestPermissions(perm) {
    const p = { permissions: (perm && perm.permissions) || [], origins: (perm && perm.origins) || [] };
    if (!p.permissions.length && !p.origins.length) return Promise.resolve(true);
    return new Promise((resolve) => {
      try { chrome.permissions.request(p, (granted) => { void chrome.runtime.lastError; resolve(!!granted); }); }
      catch { resolve(false); }
    });
  }

  function pasteKeys() {
    return /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘V" : "Ctrl+V";
  }

  function openHttps(url) {
    let u;
    try { u = new URL(url); } catch { return; }
    if (u.protocol !== "https:") return;
    try { chrome.tabs.create({ url: u.toString(), active: true }); } catch {}
  }

  const timers = {};

  /** What to tell the user about the code, by how GitHub's page was opened. */
  function codeHint(copied, opened) {
    const where = opened === "tab" ? "GitHub tab" : "GitHub window";
    return copied
      ? "Code copied — in the " + where + ", press " + pasteKeys() + ", then Continue and Authorize. This page updates by itself."
      : "Copy the code (or select it) and paste it in the " + where + ", then Continue and Authorize. This page updates by itself.";
  }

  /** The line shown while a poll is still pending. */
  function pendingLine(res, opened) {
    if (res.popupClosed) return "The GitHub window is closed. Reopen it to finish — your code still works.";
    if (res.retrying) return "Can't reach GitHub — still trying…";
    return null;
  }

  /** The async clipboard, else a selected read-only input + execCommand. */
  async function copy(text) {
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

  /**
   * Start sign-in from a click handler. The worker opens GitHub's device page
   * (a popup window, else a tab) and closes it when the token arrives — the
   * token is the only "connected" signal.
   * ui.say(text, isErr)    — one status line
   * ui.code(userCode)      — show the code, large and selectable (null hides it)
   * ui.reopen(on)          — show/hide the "Reopen GitHub" button
   * ui.final(code)         — the code ended (access_denied, expired_token, …): relabel Connect
   * ui.done(account, res)  — connected (res.installing: GitHub's window went on to Install)
   */
  function connect(t, ui) {
    return requestPermissions(t.connectPermissions).then(async (granted) => {
      if (!granted) { ui.say("TraceBug needs that permission to sign in to " + t.label + ".", true); return; }
      ui.say("Connecting to " + t.label + "…");
      // open:false — copy the code while this page has focus, then open
      // GitHub's window (it takes focus; the clipboard refuses an unfocused page).
      const res = await msg("tb:tracker:connect", { tracker: t.id, open: false });
      if (!res || res.error) { ui.say((res && res.error) || "Could not connect.", true); return; }
      if (res.flow === "device") {
        ui.code(res.userCode || "");
        const copied = await copy(res.userCode);
        const shown = res.opened ? { ok: true, opened: res.opened } : await msg("tb:tracker:connect-show", { tracker: t.id });
        const opened = shown && shown.ok ? shown.opened : null;
        // Nothing could be opened by the worker: offer the button instead.
        ui.reopen(!opened);
        ui.say(codeHint(copied, opened));
        poll(t, ui, res.interval || 5, opened, codeHint(copied, opened));
        return;
      }
      ui.code(null);
      ui.done(res.account || "");
    });
  }

  function poll(t, ui, seconds, opened, hint) {
    clearTimeout(timers[t.id]);
    timers[t.id] = setTimeout(async () => {
      const res = await msg("tb:tracker:connect-poll", { tracker: t.id });
      if (!res || res.error) {
        ui.code(null);
        ui.reopen(false);
        if (ui.final) ui.final((res && res.code) || "error");
        ui.say((res && res.error) || "Sign-in failed. Click Connect to try again.", true);
        return;
      }
      if (res.status === "pending") {
        ui.reopen(!!res.popupClosed);
        ui.say(pendingLine(res, opened) || hint);
        poll(t, ui, res.interval || seconds, opened, hint);
        return;
      }
      ui.code(null);
      ui.reopen(false);
      ui.done(res.account || "", res);
    }, Math.max(1, seconds) * 1000);
  }

  /** "Reopen GitHub": the worker focuses or reopens the device page. */
  async function reopen(t) {
    const res = await msg("tb:tracker:connect-show", { tracker: t.id });
    return !!(res && res.ok);
  }

  /**
   * Fill a <select> with the repos/teams this sign-in can file into; picking
   * one saves it as where the Create panel starts. Resolves to the count.
   * say(text, isErr) reports; manageUrl, when given, is offered for an empty list.
   */
  async function fillDefaultPicker(t, select, say) {
    const noun = String(t.containerNoun || "repository").toLowerCase();
    // Settings re-renders on every storage change, so two fills can overlap:
    // only the newest one fills, and it clears right before it does — clearing
    // before the await let both append (every option listed twice).
    const seq = (select._tbFillSeq || 0) + 1;
    select._tbFillSeq = seq;
    const res = await msg("tb:tracker:containers", { tracker: t.id });
    if (select._tbFillSeq !== seq) return 0;
    select.textContent = "";
    if (!res || res.error || !Array.isArray(res.items)) {
      say((res && res.error) || (res && res.needsAccess ? "Click Connect again to allow access." : "Could not load the list."), true);
      return 0;
    }
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Choose a " + noun + "…";
    select.appendChild(first);
    res.items.forEach((it) => {
      const o = document.createElement("option");
      o.value = String(it.id);
      o.textContent = String(it.label || it.id) + (it.detail ? " · " + it.detail : "");
      select.appendChild(o);
    });
    const last = t.last && t.last.container;
    if (last && res.items.some((it) => it.id === last)) select.value = last;
    select.onchange = async () => {
      if (!select.value) return;
      const picked = res.items.find((it) => String(it.id) === select.value);
      // The name, for the status tooltip ("GitHub · owner/repo · connected").
      const r = await msg("tb:tracker:set-default", { tracker: t.id, container: select.value, label: picked ? String(picked.label || "") : "" });
      say(r && r.ok ? "Saved. New issues start in " + ((picked && picked.label) || select.value) + "." : (r && r.error) || "Could not save.", !(r && r.ok));
    };
    comboBox(select, noun, res.items);
    if (!res.items.length) {
      say(t.id === "github"
        ? "TraceBug isn't installed on any repositories yet. Add some on GitHub, then reload this page."
        : "Nothing to pick from yet.", true);
    }
    return res.items.length;
  }

  /**
   * A long list is one field you type into (the Create panel's Repository
   * field): typing narrows a list under it, a click or Enter picks. The
   * <select> stays the value and its change event still saves; it's hidden
   * while the field stands in for it. Short lists keep the plain <select>.
   */
  const COMBO_CSS = `
    .tb-combo[hidden], .tb-combo ul[hidden], .tb-combo ~ select[hidden] { display: none !important; }
    .tb-combo { position: relative; display: inline-block; width: 320px; max-width: 100%; }
    .tb-combo input { width: 100%; box-sizing: border-box; height: 34px; margin: 0; padding-right: 30px; font-weight: 500;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center; }
    .tb-combo ul { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; list-style: none; margin: 0; padding: 4px;
      max-height: 240px; overflow-y: auto; overscroll-behavior: contain; color: var(--text, #111827);
      background: var(--panel, #fff); border: 1px solid var(--border, #E5E7EB); border-radius: 8px; box-shadow: var(--shadow, 0 12px 32px rgba(17,24,39,.14)); }
    .tb-combo li { padding: 7px 10px; border-radius: 6px; cursor: pointer; overflow-wrap: anywhere; }
    .tb-combo li[aria-selected="true"], .tb-combo li:hover { background: var(--tile, #F3F4F6); }
    .tb-combo li .muted { margin-left: 6px; color: var(--muted, #6B7280); font-size: 12px; }
    .tb-combo li.none { cursor: default; color: var(--muted, #6B7280); background: none; }`;
  let comboSeq = 0;

  function comboBox(select, noun, items) {
    let c = select._tbCombo;
    if (!c && !select.parentNode) return;
    if (!c) c = select._tbCombo = makeCombo(select);
    c.items = items;
    const plural = noun === "team" ? "teams" : noun === "repository" ? "repositories" : noun + "s";
    c.input.placeholder = "Search " + plural + "…";
    c.input.setAttribute("aria-label", "Default " + noun + " (type to search " + plural + ")");
    c.none = "No " + plural + " match";
    const on = items.length > 8;
    c.wrap.hidden = !on;
    select.hidden = on;
    c.close();
  }

  function makeCombo(select) {
    const doc = select.ownerDocument;
    if (!doc.getElementById("tb-combo-css")) {
      const st = doc.createElement("style");
      st.id = "tb-combo-css";
      st.textContent = COMBO_CSS;
      doc.head.appendChild(st);
    }
    const id = "tbCombo" + ++comboSeq;
    const wrap = doc.createElement("span");
    wrap.className = "tb-combo";
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "acct-default-combo";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", id);
    const ul = doc.createElement("ul");
    ul.id = id;
    ul.setAttribute("role", "listbox");
    ul.hidden = true;
    wrap.append(input, ul);
    select.parentNode.insertBefore(wrap, select);

    const c = { wrap, input, items: [], shown: [], active: -1, none: "" };
    const text = (it) => String(it.label || it.id);
    // The field shows the saved pick whenever it isn't being typed in.
    const showPick = () => {
      const it = c.items.find((x) => String(x.id) === select.value);
      input.value = it ? text(it) : "";
    };
    const render = (list) => {
      c.shown = list;
      if (c.active >= list.length) c.active = list.length - 1;
      ul.textContent = "";
      list.forEach((it, i) => {
        const li = doc.createElement("li");
        li.id = id + "_" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === c.active ? "true" : "false");
        li.textContent = text(it);
        if (it.detail) {
          const s = doc.createElement("span");
          s.className = "muted";
          s.textContent = String(it.detail);
          li.appendChild(s);
        }
        // Focus stays in the field; preventDefault also stops the <label>
        // around it from clicking the field again.
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", (e) => { e.preventDefault(); pick(it); });
        ul.appendChild(li);
      });
      if (!list.length) {
        const li = doc.createElement("li");
        li.className = "none";
        li.textContent = c.none + " “" + input.value.trim() + "”.";
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", (e) => e.preventDefault());
        ul.appendChild(li);
      }
      ul.hidden = false;
      input.setAttribute("aria-expanded", "true");
      if (c.active >= 0) {
        input.setAttribute("aria-activedescendant", id + "_" + c.active);
        try { doc.getElementById(id + "_" + c.active).scrollIntoView({ block: "nearest" }); } catch {}
      } else input.removeAttribute("aria-activedescendant");
    };
    const open = (typed) => {
      const q = typed ? input.value.trim().toLowerCase() : "";
      render(!q ? c.items : c.items.filter((it) =>
        String(it.id).toLowerCase().includes(q) || text(it).toLowerCase().includes(q)));
    };
    c.close = () => {
      ul.hidden = true;
      c.active = -1;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      showPick();
    };
    const pick = (it) => {
      const changed = select.value !== String(it.id);
      select.value = String(it.id);
      c.close();
      if (changed) select.dispatchEvent(new Event("change"));
    };
    input.addEventListener("focus", () => { input.select(); open(false); });
    input.addEventListener("click", (e) => { e.preventDefault(); if (ul.hidden) open(false); });
    input.addEventListener("input", () => { c.active = -1; open(true); });
    input.addEventListener("blur", () => c.close());
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (ul.hidden) { c.active = Math.max(0, c.items.findIndex((x) => String(x.id) === select.value)); render(c.items); return; }
        c.active = e.key === "ArrowDown" ? Math.min(c.active + 1, c.shown.length - 1) : Math.max(c.active - 1, 0);
        render(c.shown);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = c.shown[c.active] || (c.shown.length === 1 ? c.shown[0] : null);
        if (!ul.hidden && it) pick(it);
      } else if (e.key === "Escape" && !ul.hidden) {
        e.preventDefault();
        e.stopPropagation();
        c.close();
        input.select();
      }
    });
    return c;
  }

  root.TraceBugTrackerConnect = { msg, connect, reopen, copy, fillDefaultPicker, openHttps, pasteKeys };
})(typeof self !== "undefined" ? self : this);
