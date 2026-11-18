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

  function openHttps(url) {
    let u;
    try { u = new URL(url); } catch { return; }
    if (u.protocol !== "https:") return;
    try { chrome.tabs.create({ url: u.toString(), active: true }); } catch {}
  }

  const timers = {};

  /**
   * Start sign-in from a click handler.
   * ui.say(text, isErr) — one status line
   * ui.code(userCode)   — show the device code (null hides it)
   * ui.done(account)    — connected
   */
  function connect(t, ui) {
    return requestPermissions(t.connectPermissions).then(async (granted) => {
      if (!granted) { ui.say("TraceBug needs that permission to sign in to " + t.label + ".", true); return; }
      ui.say("Connecting to " + t.label + "…");
      const res = await msg("tb:tracker:connect", { tracker: t.id });
      if (!res || res.error) { ui.say((res && res.error) || "Could not connect.", true); return; }
      if (res.flow === "device") {
        ui.code(res.userCode || "");
        // One click: copy the code and open the page that asks for it.
        let copied = false;
        try { await navigator.clipboard.writeText(res.userCode || ""); copied = true; } catch {}
        openHttps(res.verificationUri || "");
        ui.say(copied
          ? "Code copied. Paste it on GitHub and click Authorize — this page updates by itself."
          : "Enter the code on GitHub and click Authorize — this page updates by itself.");
        poll(t, ui, res.interval || 5);
        return;
      }
      ui.code(null);
      ui.done(res.account || "");
    });
  }

  function poll(t, ui, seconds) {
    clearTimeout(timers[t.id]);
    timers[t.id] = setTimeout(async () => {
      const res = await msg("tb:tracker:connect-poll", { tracker: t.id });
      if (!res || res.error) {
        ui.code(null);
        ui.say((res && res.error) || "Sign-in failed. Click Connect to try again.", true);
        return;
      }
      if (res.status === "pending") { poll(t, ui, res.interval || seconds); return; }
      ui.code(null);
      ui.done(res.account || "");
    }, Math.max(1, seconds) * 1000);
  }

  /**
   * Fill a <select> with the repos/teams this sign-in can file into; picking
   * one saves it as where the Create panel starts. Resolves to the count.
   * say(text, isErr) reports; manageUrl, when given, is offered for an empty list.
   */
  async function fillDefaultPicker(t, select, say) {
    const noun = String(t.containerNoun || "repository").toLowerCase();
    select.textContent = "";
    const res = await msg("tb:tracker:containers", { tracker: t.id });
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
      const r = await msg("tb:tracker:set-default", { tracker: t.id, container: select.value });
      say(r && r.ok ? "Saved. New issues start in " + select.value + "." : (r && r.error) || "Could not save.", !(r && r.ok));
    };
    if (!res.items.length) {
      say(t.id === "github"
        ? "TraceBug isn't installed on any repositories yet. Add some on GitHub, then reload this page."
        : "Nothing to pick from yet.", true);
    }
    return res.items.length;
  }

  root.TraceBugTrackerConnect = { msg, connect, fillDefaultPicker, openHttps };
})(typeof self !== "undefined" ? self : this);
