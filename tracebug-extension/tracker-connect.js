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
   * ui.done(account)       — connected
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
      ui.done(res.account || "");
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
    if (!res.items.length) {
      say(t.id === "github"
        ? "TraceBug isn't installed on any repositories yet. Add some on GitHub, then reload this page."
        : "Nothing to pick from yet.", true);
    }
    return res.items.length;
  }

  root.TraceBugTrackerConnect = { msg, connect, reopen, copy, fillDefaultPicker, openHttps, pasteKeys };
})(typeof self !== "undefined" ? self : this);
