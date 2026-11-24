// ── Integrations hub (Phase 13 step 5, ADR 010) ─────────────────────────────
// One component for the popup's Integrations view and the settings page:
// "My connections (N)" and "Add platform" (a roving-tabindex logo grid), plus
// the connect dialog per tracker. Everything goes through the worker's
// tb:tracker:* verbs (extension pages only) and tracker-connect.js — no
// sign-in logic of its own, and no token ever reaches this file: the worker
// answers with account and repo/team NAMES only.
//
// The popup can't run a sign-in: it closes the moment GitHub's or Linear's
// window takes focus, which would kill the device-code poll and the user
// gesture permissions.request needs. So in popup mode, Sign in and the token
// path hand off to settings (host.handoff), where this same component runs it.
//
// Pasted-token disconnects write tb_integrations_v1 directly, like the token
// forms in options.js.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  const INT_KEY = "tb_integrations_v1";
  const C = () => root.TraceBugTrackerConnect;

  // Small inline marks (no remote loads). src/ui/brand-logos.ts carries the
  // ticket's copies of GitHub/Linear/Slack — keep the two in step.
  const LOGOS = {
    github: '<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
    linear: '<path fill="#5E6AD2" d="M1.2 13.9a11 11 0 0 0 8.9 8.9L1.2 13.9Zm-.2-3 12.1 12.1c.9-.1 1.8-.3 2.6-.6L1.6 8.3c-.3.8-.5 1.7-.6 2.6Zm1.4-4.3 15 15c.7-.4 1.3-.9 1.9-1.4L3.8 4.7c-.5.6-1 1.2-1.4 1.9ZM5.3 3.4A11 11 0 1 1 20.6 18.7L5.3 3.4Z"/>',
    slack: '<rect x="2" y="9.5" width="9" height="3.4" rx="1.7" fill="#36C5F0"/><rect x="9.5" y="2" width="3.4" height="9" rx="1.7" fill="#2EB67D"/><rect x="13" y="11.1" width="9" height="3.4" rx="1.7" fill="#E01E5A"/><rect x="11.1" y="13" width="3.4" height="9" rx="1.7" fill="#ECB22E"/>',
    gitlab: '<path fill="#E24329" d="m12 22.3 4.1-12.7H7.9L12 22.3Z"/><path fill="#FC6D26" d="M12 22.3 7.9 9.6H2.1L12 22.3Zm0 0 4.1-12.7h5.8L12 22.3Z"/><path fill="#FCA326" d="M2.1 9.6.9 13.3c-.1.3 0 .7.3.9L12 22.3 2.1 9.6Zm19.8 0 1.2 3.7c.1.3 0 .7-.3.9L12 22.3l9.9-12.7Z"/><path fill="#E24329" d="M2.1 9.6h5.8L5.4 1.9c-.1-.4-.7-.4-.8 0L2.1 9.6Zm19.8 0h-5.8l2.5-7.7c.1-.4.7-.4.8 0l2.5 7.7Z"/>',
    azure: '<path fill="#0078D4" d="M22 5.6v12.2l-5 4.1-7.8-2.8V22l-4.4-5.8 12.8 1V6.2L22 5.6ZM17.7 6.2 10.5 1.8v2.9L3.9 6.6 2 9.1v5.5l2.8 1.2V8.7l12.9-2.5Z"/>',
    jira: '<path fill="#2684FF" d="M22.2 11.3 12.7 1.8 12 1.1 4.8 8.3 1.8 11.3a1 1 0 0 0 0 1.4l6.5 6.5L12 23l7.2-7.2.1-.1 2.9-2.9a1 1 0 0 0 0-1.5ZM12 15.2 8.8 12 12 8.8l3.2 3.2L12 15.2Z"/>',
  };
  const NAMES = { github: "GitHub", linear: "Linear", slack: "Slack", gitlab: "GitLab", azure: "Azure DevOps", jira: "Jira" };

  // What each tracker's connect dialog says. Exact scopes: the token path asks
  // for exactly these, and the sign-in path's are fixed by the app.
  const INFO = {
    github: {
      signIn: "Sign in with GitHub",
      signInNote: "TraceBug asks GitHub for Issues access only, on the repositories you choose. TraceBug can't read your code.",
      tokenLabel: "Advanced: use a token",
      tokenSteps: "Create a fine-grained token with Issues: Read and write and Metadata: Read on the repositories you file into — or a classic token with the repo scope.",
      getTokenUrl: "https://github.com/settings/personal-access-tokens/new",
      getTokenText: "Get a token on GitHub",
    },
    linear: {
      signIn: "Sign in with Linear",
      signInNote: "A Linear window asks you to allow TraceBug (scopes read, write). Disconnect revokes it at Linear.",
      tokenLabel: "Advanced: use a key",
      tokenSteps: "Create a personal API key in Linear (Settings → Security & access → Personal API keys). It acts as you, with your access.",
      getTokenUrl: "https://linear.app/settings/account/security",
      getTokenText: "Get a key in Linear",
    },
    slack: {
      tokenLabel: "Incoming webhook",
      tokenSteps: "Create a Slack app with Incoming Webhooks turned on, add a webhook for the channel, and paste its URL (https://hooks.slack.com/…). It can post to that one channel and nothing else.",
      getTokenUrl: "https://api.slack.com/messaging/webhooks",
      getTokenText: "How to get a webhook URL",
    },
  };
  const LIVE = ["github", "linear", "slack"];
  const SOON = {
    gitlab: "Coming soon — GitLab sign-in and filing are a later step.",
    azure: "Coming soon — Azure DevOps filing is a later step.",
    jira: "Coming soon — Jira Cloud filing is a later step. Until then, use Copy for Jira on the ticket.",
  };
  const COLS = 3;

  /** An <svg> element with an accessible name. Parsed from our own constant
   *  markup with DOMParser — never innerHTML (web-ext's UNSAFE_VAR_ASSIGNMENT). */
  function logo(id, size) {
    const s = size || 20;
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" class="tbh-logo" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" role="img">' +
      (LOGOS[id] || "") + "</svg>", "image/svg+xml");
    const svg = document.importNode(doc.documentElement, true);
    svg.setAttribute("aria-label", NAMES[id] || id);
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = NAMES[id] || id;
    svg.insertBefore(title, svg.firstChild);
    return svg;
  }

  function el(tag, attrs) {
    const e = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "hidden") e.hidden = !!attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    return e;
  }

  function storage(keys) {
    return new Promise((resolve) => {
      try { chrome.storage.local.get(keys, (r) => { void chrome.runtime.lastError; resolve(r || {}); }); }
      catch { resolve({}); }
    });
  }
  function store(obj) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set(obj, () => resolve(!chrome.runtime.lastError)); }
      catch { resolve(false); }
    });
  }

  const STATE_TEXT = { connected: "Connected", reconnect: "Needs reconnect", error: "Error" };

  /**
   * mount(container, host)
   *   host.mode     "popup" | "options"
   *   host.handoff(kind, tracker)  popup: "signin" | "token" → open settings
   *   host.tokenPath(tracker)      options: show and focus that tracker's token form
   *   host.onSummary(summary)      after every status load (header icon)
   */
  function mount(container, host) {
    const h = host || {};
    const popup = h.mode === "popup";
    const state = { status: null, tab: "conn", connecting: {}, focusIdx: 0, opener: null, testResult: {} };

    container.textContent = "";
    const rootEl = el("section", { class: "tbh", "aria-label": "Integrations" });
    const tabs = el("div", { class: "tbh-tabs", role: "tablist", "aria-label": "Integrations" });
    const tabConn = el("button", { type: "button", role: "tab", id: "tbh-tab-conn", "aria-controls": "tbh-conn", class: "tbh-tab" });
    const tabAdd = el("button", { type: "button", role: "tab", id: "tbh-tab-add", "aria-controls": "tbh-add", class: "tbh-tab", text: "Add platform" });
    tabs.append(tabConn, tabAdd);
    const panelConn = el("div", { role: "tabpanel", id: "tbh-conn", "aria-labelledby": "tbh-tab-conn", class: "tbh-panel" });
    const panelAdd = el("div", { role: "tabpanel", id: "tbh-add", "aria-labelledby": "tbh-tab-add", class: "tbh-panel" });
    const live = el("p", { class: "tbh-live", role: "status", "aria-live": "polite" });
    const dialog = el("div", { class: "tbh-dialog-wrap", hidden: true });
    rootEl.append(tabs, panelConn, panelAdd, live, dialog);
    container.appendChild(rootEl);

    function say(text, isErr) {
      live.textContent = String(text || "");
      live.classList.toggle("err", !!isErr);
    }

    // ── Tabs (arrow keys move between the two) ──────────────────────────────
    function selectTab(which, focus) {
      state.tab = which;
      const conn = which === "conn";
      tabConn.setAttribute("aria-selected", String(conn));
      tabAdd.setAttribute("aria-selected", String(!conn));
      tabConn.tabIndex = conn ? 0 : -1;
      tabAdd.tabIndex = conn ? -1 : 0;
      panelConn.hidden = !conn;
      panelAdd.hidden = conn;
      if (focus) (conn ? tabConn : tabAdd).focus();
    }
    tabConn.addEventListener("click", () => selectTab("conn"));
    tabAdd.addEventListener("click", () => selectTab("add"));
    tabs.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(e.key) === -1) return;
      e.preventDefault();
      const next = e.key === "Home" ? "conn" : e.key === "End" ? "add" : state.tab === "conn" ? "add" : "conn";
      selectTab(next, true);
    });

    // ── Data ────────────────────────────────────────────────────────────────
    async function load() {
      const res = await C().msg("tb:tracker:status");
      if (!res || !Array.isArray(res.trackers)) { say("Couldn't read your connections. Reload TraceBug.", true); return; }
      state.status = res;
      render();
      if (h.onSummary) h.onSummary(res.summary);
    }

    function trackerRow(id) {
      if (!state.status) return null;
      if (id === "slack") return state.status.slack;
      return state.status.trackers.find((t) => t.id === id) || null;
    }

    function connections() {
      return (state.status && state.status.summary && state.status.summary.connections) || [];
    }

    function render() {
      const list = connections();
      tabConn.textContent = "My connections (" + list.length + ")";
      renderConnections(list);
      renderGrid(list);
      if (state.tab === "conn" && !list.length && !state.everSwitched) {
        state.everSwitched = true;
        selectTab("add");
      } else selectTab(state.tab);
    }

    // ── My connections ──────────────────────────────────────────────────────
    function renderConnections(list) {
      panelConn.textContent = "";
      if (!list.length) {
        const empty = el("div", { class: "tbh-empty" });
        empty.append(el("p", { text: "No trackers connected yet." }));
        const go = el("button", { type: "button", class: "tbh-btn", text: "Add a platform" });
        go.addEventListener("click", () => { selectTab("add"); focusTile(0); });
        empty.append(go);
        panelConn.append(empty);
        return;
      }
      const ul = el("ul", { class: "tbh-rows", "aria-label": "Connected trackers" });
      list.forEach((c) => ul.append(connectionRow(c)));
      panelConn.append(ul);
    }

    function connectionRow(c) {
      const t = trackerRow(c.id) || {};
      const li = el("li", { class: "tbh-row", "data-tracker": c.id, "data-state": c.state });
      const head = el("div", { class: "tbh-row-head" });
      head.append(logo(c.id, 22));
      const names = el("div", { class: "tbh-row-names" });
      const title = el("div", { class: "tbh-row-title" });
      title.append(el("span", { text: c.label }));
      if (c.isDefault) title.append(el("span", { class: "tbh-badge", text: "Default" }));
      names.append(title);
      // GitHub names its one connection's mode (B11).
      const how = c.id === "github"
        ? (c.via === "oauth" ? "Signed in" + (c.account ? " as " + c.account : "") + " · GitHub App" : c.via === "token" ? "Using a personal token" : "")
        : c.account || (c.via === "token" ? "with a token" : c.via === "webhook" ? "webhook" : "");
      const sub = [how, c.container].filter(Boolean).join(" · ");
      if (sub) names.append(el("div", { class: "tbh-row-sub", text: sub }));
      head.append(names);
      const pill = el("span", { class: "tbh-pill " + c.state, text: STATE_TEXT[c.state] + (c.state === "reconnect" ? " ⚠" : "") });
      head.append(pill);
      li.append(head);
      if (c.detail) li.append(el("p", { class: "tbh-row-detail", text: c.detail }));
      const tr = state.testResult[c.id];
      const result = el("p", { class: "tbh-row-result" + (tr && tr.err ? " err" : ""), text: tr ? tr.text : "" });
      result.hidden = !tr;

      const actions = el("div", { class: "tbh-actions" });
      if (c.state === "reconnect") {
        // The dialog offers sign-in where this build has it, the token otherwise.
        const rc = el("button", { type: "button", class: "tbh-btn", text: "Reconnect " + c.label });
        rc.addEventListener("click", () => openConnect(c.id, rc));
        actions.append(rc);
      }
      if (!c.isDefault) {
        const sd = el("button", { type: "button", class: "tbh-btn ghost", text: "Set default" });
        sd.addEventListener("click", async () => {
          const r = await C().msg("tb:tracker:set-primary", { tracker: c.id });
          if (!r || !r.ok) { say((r && r.error) || "Couldn't save.", true); return; }
          say(c.label + " is now the default. The ticket's main button sends to " + c.label + ".");
          await load();
          focusRow(c.id);
        });
        actions.append(sd);
      }
      const picker = el("label", { class: "tbh-picker", hidden: true });
      if (c.id !== "slack" && c.state !== "reconnect") {
        const noun = String(t.containerNoun || "repository").toLowerCase();
        const ch = el("button", { type: "button", class: "tbh-btn ghost", "aria-expanded": "false", text: "Change default " + (c.id === "linear" ? "team" : "repo") });
        picker.append(el("span", { text: "Default " + noun }));
        const sel = el("select", { class: "tbh-select" });
        picker.append(sel);
        ch.addEventListener("click", async () => {
          const open = picker.hidden;
          picker.hidden = !open;
          ch.setAttribute("aria-expanded", String(open));
          if (open) {
            await C().fillDefaultPicker(t, sel, (text, isErr) => say(text, isErr));
            sel.focus();
          }
        });
        actions.append(ch);
        const test = el("button", { type: "button", class: "tbh-btn ghost", text: "Test connection" });
        test.addEventListener("click", () => testConnection(c, t, test));
        actions.append(test);
      }
      const dc = el("button", { type: "button", class: "tbh-btn ghost danger", text: "Disconnect" });
      dc.addEventListener("click", () => confirmDisconnect(c, dc));
      actions.append(dc);
      li.append(actions, picker, result);
      return li;
    }

    function focusRow(id) {
      const row = panelConn.querySelector('.tbh-row[data-tracker="' + id + '"]');
      const target = row && row.querySelector(".tbh-actions button");
      (target || tabConn).focus();
    }

    function testConnection(c, t, btn) {
      // A removed API permission is asked for again here, inside the click —
      // an await first would lose the gesture.
      const ask = c.state === "error" && t.apiHosts && t.apiHosts.length
        ? new Promise((resolve) => {
          try { chrome.permissions.request({ origins: t.apiHosts }, (g) => { void chrome.runtime.lastError; resolve(!!g); }); }
          catch { resolve(false); }
        })
        : Promise.resolve(true);
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      say("Testing " + c.label + "…");
      ask.then(async (granted) => {
        let text, err = false;
        if (!granted) { text = "TraceBug needs access to " + c.label + " to file issues there."; err = true; }
        else {
          const r = await C().msg("tb:tracker:containers", { tracker: c.id });
          if (r && Array.isArray(r.items)) {
            const noun = String(t.containerNoun || "repository").toLowerCase();
            const n = r.items.length;
            text = c.label + " works — " + n + " " + (n === 1 ? noun : noun.replace(/y$/, "ie") + "s") + " available.";
          } else if (r && r.needsAccess) { text = "TraceBug has no access to " + c.label + ". Click Test connection to allow it."; err = true; }
          else { text = (r && r.error) || "Couldn't reach " + c.label + "."; err = true; }
        }
        state.testResult[c.id] = { text, err };
        say(text, err);
        await load();
        // The row was redrawn: put focus back on its Test button.
        const testBtn = Array.from(panelConn.querySelectorAll('.tbh-row[data-tracker="' + c.id + '"] .tbh-actions button'))
          .find((b) => b.textContent === "Test connection");
        (testBtn || tabConn).focus();
      });
    }

    async function forgetToken(id) {
      const cfg = (await storage([INT_KEY]))[INT_KEY] || {};
      if (!cfg[id]) return true;
      delete cfg[id];
      return store({ [INT_KEY]: cfg });
    }

    function confirmDisconnect(c, opener) {
      const body = el("div");
      body.append(el("p", { text: c.id === "slack"
        ? "TraceBug forgets the Slack webhook. Reports stop posting to that channel."
        : "TraceBug signs out of " + c.label + " and forgets any pasted token on this browser. Issues already filed stay in " + c.label + "." }));
      const yes = el("button", { type: "button", class: "tbh-btn danger", text: "Disconnect " + c.label });
      const no = el("button", { type: "button", class: "tbh-btn ghost", text: "Cancel" });
      const row = el("div", { class: "tbh-actions" });
      row.append(yes, no);
      body.append(row);
      no.addEventListener("click", () => closeDialog());
      yes.addEventListener("click", async () => {
        yes.disabled = true;
        let msgText = "Disconnected " + c.label + ".";
        if (c.id !== "slack") {
          const r = await C().msg("tb:tracker:disconnect", { tracker: c.id });
          if (!r || r.error) { say((r && r.error) || "Couldn't disconnect.", true); yes.disabled = false; return; }
          // GitHub: exactly what was removed, and where to finish on GitHub.
          if (r.removed === "signin" && r.revokeUrl) {
            msgText = "Signed out of GitHub. TraceBug deleted its GitHub sign-in from this browser. To remove its access on GitHub too: Authorized GitHub Apps (" + r.revokeUrl + ").";
          } else if (r.removed === "token" && r.tokenUrl) {
            msgText = "Removed the GitHub token from this browser. You can delete it on GitHub: Personal access tokens (" + r.tokenUrl + ").";
          } else if (r.revokeUrl) {
            msgText += " To revoke TraceBug's access entirely, visit " + r.revokeUrl;
          }
        }
        await forgetToken(c.id);
        delete state.testResult[c.id];
        closeDialog(true);
        say(msgText);
        await load();
        selectTab("conn");
        const first = panelConn.querySelector(".tbh-row .tbh-actions button") || panelConn.querySelector(".tbh-empty button");
        (first || tabConn).focus();
      });
      openDialog("Disconnect " + c.label + "?", body, opener, no);
    }

    // ── Add platform: roving-tabindex grid ──────────────────────────────────
    function tiles() { return Array.from(panelAdd.querySelectorAll(".tbh-tile")); }

    function renderGrid(list) {
      panelAdd.textContent = "";
      const connected = new Set(list.map((c) => c.id));
      const ids = LIVE.filter((id) => !connected.has(id)).concat(Object.keys(SOON));
      const grid = el("div", { class: "tbh-grid", role: "grid", "aria-label": "Platforms", "aria-describedby": "tbh-grid-help" });
      for (let i = 0; i < ids.length; i += COLS) {
        const row = el("div", { role: "row", class: "tbh-grid-row" });
        ids.slice(i, i + COLS).forEach((id) => {
          const cell = el("div", { role: "gridcell" });
          const soon = !!SOON[id];
          const busy = !!state.connecting[id];
          const tile = el("button", {
            type: "button", class: "tbh-tile" + (soon ? " soon" : "") + (busy ? " busy" : ""),
            "data-tracker": id, tabindex: "-1", title: soon ? SOON[id] : "Connect " + NAMES[id],
            "aria-label": NAMES[id] + (soon ? ", coming soon" : busy ? ", connecting" : ""),
          });
          if (soon) tile.setAttribute("aria-disabled", "true");
          if (busy) tile.setAttribute("aria-busy", "true");
          tile.append(logo(id, 26), el("span", { class: "tbh-tile-name", text: NAMES[id] }));
          if (busy) tile.append(el("span", { class: "tbh-spinner", "aria-hidden": "true" }));
          else if (soon) tile.append(el("span", { class: "tbh-soon", text: "Soon" }));
          tile.addEventListener("click", () => activateTile(tile));
          cell.append(tile);
          row.append(cell);
        });
        grid.append(row);
      }
      grid.addEventListener("keydown", onGridKey);
      panelAdd.append(grid);
      panelAdd.append(el("p", { class: "tbh-help", id: "tbh-grid-help", text: "Arrow keys move, Enter opens." }));
      const all = tiles();
      state.focusIdx = Math.min(state.focusIdx, all.length - 1);
      all.forEach((t, i) => { t.tabIndex = i === state.focusIdx ? 0 : -1; });
    }

    function focusTile(i) {
      const all = tiles();
      if (!all.length) return;
      state.focusIdx = Math.max(0, Math.min(all.length - 1, i));
      all.forEach((t, j) => { t.tabIndex = j === state.focusIdx ? 0 : -1; });
      all[state.focusIdx].focus();
    }

    function onGridKey(e) {
      const all = tiles();
      const i = all.indexOf(document.activeElement);
      if (i === -1) return;
      let next = null;
      if (e.key === "ArrowRight") next = i + 1;
      else if (e.key === "ArrowLeft") next = i - 1;
      else if (e.key === "ArrowDown") next = i + COLS < all.length ? i + COLS : i;
      else if (e.key === "ArrowUp") next = i - COLS >= 0 ? i - COLS : i;
      else if (e.key === "Home") next = e.ctrlKey ? 0 : i - (i % COLS);
      else if (e.key === "End") next = e.ctrlKey ? all.length - 1 : Math.min(all.length - 1, i - (i % COLS) + COLS - 1);
      if (next === null) return;
      e.preventDefault();
      focusTile(next);
    }

    function activateTile(tile) {
      const id = tile.dataset.tracker;
      state.focusIdx = tiles().indexOf(tile);
      if (SOON[id]) { say(SOON[id]); return; }
      if (state.connecting[id]) { say(NAMES[id] + " is connecting…"); }
      openConnect(id, tile);
    }

    // ── Dialog: focus trap, Esc closes, focus returns to the opener ─────────
    function openDialog(titleText, body, opener, initial) {
      state.opener = opener || null;
      dialog.textContent = "";
      const box = el("div", { class: "tbh-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "tbh-dialog-title" });
      const head = el("div", { class: "tbh-dialog-head" });
      head.append(el("h3", { id: "tbh-dialog-title", text: titleText }));
      const x = el("button", { type: "button", class: "tbh-x", "aria-label": "Close", text: "✕" });
      x.addEventListener("click", () => closeDialog());
      head.append(x);
      box.append(head, body);
      dialog.append(box);
      dialog.hidden = false;
      (initial || box.querySelector("button, a[href], input, select, summary") || x).focus();
    }

    function closeDialog(keepFocus) {
      if (dialog.hidden) return;
      dialog.hidden = true;
      dialog.textContent = "";
      const back = state.opener;
      state.opener = null;
      if (!keepFocus && back && back.isConnected) back.focus();
    }

    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDialog(); return; }
      if (e.key !== "Tab") return;
      const f = Array.from(dialog.querySelectorAll("button, a[href], input, select, summary"))
        // checkVisibility: a closed <details>' contents still have an offsetParent.
        .filter((n) => !n.disabled && (n.checkVisibility ? n.checkVisibility() : n.offsetParent !== null));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    dialog.addEventListener("click", (e) => { if (e.target === dialog) closeDialog(); });

    // ── Connect dialog ──────────────────────────────────────────────────────
    function openConnect(id, opener) {
      const t = trackerRow(id) || { id, label: NAMES[id] };
      const info = INFO[id];
      const body = el("div", { class: "tbh-connect" });
      let initial = null;
      const signIn = id !== "slack" && t.canConnect;

      if (signIn) {
        const btn = el("button", { type: "button", class: "tbh-btn tbh-signin" });
        btn.append(logo(id, 16), el("span", { text: info.signIn + (id === "github" ? " — recommended" : "") }));
        body.append(btn);
        body.append(el("p", { class: "tbh-note", text: info.signInNote }));
        if (popup) body.append(el("p", { class: "tbh-note", text: "Opens TraceBug settings to finish: this popup closes when a sign-in window opens." }));
        const dev = el("div", { class: "tbh-device", hidden: true });
        dev.append(el("p", { class: "tbh-note", text: "Your code:" }), el("b", { class: "tbh-code" }));
        const copyBtn = el("button", { type: "button", class: "tbh-btn ghost", text: "Copy code" });
        const reopen = el("button", { type: "button", class: "tbh-btn ghost", text: "Reopen GitHub", hidden: true });
        const devRow = el("div", { class: "tbh-actions" });
        devRow.append(copyBtn, reopen);
        dev.append(devRow);
        const status = el("p", { class: "tbh-note tbh-dialog-status", role: "status", "aria-live": "polite" });
        body.append(dev, status);
        copyBtn.addEventListener("click", async () => {
          if (await C().copy(dev.querySelector(".tbh-code").textContent || "")) status.textContent = "Code copied — press " + C().pasteKeys() + " on GitHub.";
        });
        reopen.addEventListener("click", () => C().reopen(t));
        btn.addEventListener("click", () => {
          if (popup) { h.handoff && h.handoff("signin", id); return; }
          startSignIn(t, btn, { status, dev, reopen });
        });
        initial = btn;
      } else if (id !== "slack") {
        body.append(el("p", { class: "tbh-note", text: t.canConnect === false && state.status && !state.status.oauthUi
          ? "Sign-in isn't available in this browser yet. Use a " + (id === "linear" ? "key" : "token") + "."
          : "Sign-in for " + t.label + " isn't set up in this build yet. Use a " + (id === "linear" ? "key" : "token") + "." }));
      }

      // The token path: second, labelled Advanced, where sign-in exists.
      const adv = el(signIn ? "details" : "div", { class: "tbh-advanced" });
      if (signIn) adv.append(el("summary", { text: info.tokenLabel }));
      else adv.append(el("h4", { text: info.tokenLabel }));
      adv.append(el("p", { class: "tbh-note", text: info.tokenSteps }));
      const get = el("a", { href: info.getTokenUrl, class: "tbh-link", text: info.getTokenText + " ↗" });
      get.addEventListener("click", (e) => { e.preventDefault(); C().openHttps(info.getTokenUrl); });
      adv.append(get);
      const enter = el("button", { type: "button", class: "tbh-btn" + (signIn ? " ghost" : ""),
        text: id === "slack" ? "Enter webhook URL" : "Enter " + (id === "linear" ? "key" : "token") });
      enter.addEventListener("click", () => {
        closeDialog(true);
        if (popup) { h.handoff && h.handoff("token", id); return; }
        if (h.tokenPath) h.tokenPath(id);
      });
      const advRow = el("div", { class: "tbh-actions" });
      advRow.append(enter);
      adv.append(advRow);
      body.append(adv);
      if (!initial) initial = get;
      openDialog("Connect " + t.label, body, opener, initial);
    }

    function setTileBusy(id, on) {
      if (on) state.connecting[id] = true; else delete state.connecting[id];
      const tile = panelAdd.querySelector('.tbh-tile[data-tracker="' + id + '"]');
      if (!tile) return;
      tile.classList.toggle("busy", on);
      if (on) tile.setAttribute("aria-busy", "true"); else tile.removeAttribute("aria-busy");
      tile.setAttribute("aria-label", NAMES[id] + (on ? ", connecting" : ""));
      const sp = tile.querySelector(".tbh-spinner");
      if (on && !sp) tile.append(el("span", { class: "tbh-spinner", "aria-hidden": "true" }));
      if (!on && sp) sp.remove();
    }

    function startSignIn(t, btn, ui) {
      setTileBusy(t.id, true);
      btn.disabled = true;
      say("Connecting " + t.label + "…");
      // tracker-connect.js asks for permissions inside this click, copies the
      // device code, opens the sign-in window and polls.
      C().connect(t, {
        say: (text, isErr) => {
          ui.status.textContent = text;
          ui.status.classList.toggle("err", !!isErr);
          if (isErr) { setTileBusy(t.id, false); btn.disabled = false; say(text, true); }
        },
        code: (code) => {
          ui.dev.querySelector(".tbh-code").textContent = code || "";
          ui.dev.hidden = !code;
        },
        reopen: (on) => { ui.reopen.hidden = !on; },
        final: (code) => {
          setTileBusy(t.id, false);
          btn.disabled = false;
          btn.querySelector("span").textContent = code === "expired_token" ? "Get a new code" : INFO[t.id].signIn;
        },
        done: async (account) => {
          setTileBusy(t.id, false);
          closeDialog(true);
          await load();
          selectTab("conn");
          say("Connected " + t.label + (account ? " as " + account : "") + ". Now pick where new issues go.");
          await askDefault(t.id);
        },
      });
    }

    /** Right after connecting: open the row's default repo/team picker. */
    async function askDefault(id) {
      const row = panelConn.querySelector('.tbh-row[data-tracker="' + id + '"]');
      const ch = row && Array.from(row.querySelectorAll(".tbh-actions button")).find((b) => /^Change default/.test(b.textContent || ""));
      if (ch) ch.click(); else if (row) (row.querySelector(".tbh-actions button") || tabConn).focus();
    }

    // Live refresh: another page (or the worker) changed a connection.
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.tb_tracker_auth_v1 || changes[INT_KEY] || changes.tb_tracker_default_v1) {
          // Don't redraw under an open dialog or an open picker.
          if (!dialog.hidden || panelConn.querySelector(".tbh-picker:not([hidden])")) return;
          load();
        }
      });
    } catch {}

    load();
    return {
      reload: load,
      /** Open the connect dialog (a settings deep link from the popup). */
      openConnect: (id) => {
        const go = () => {
          selectTab("add");
          const tile = panelAdd.querySelector('.tbh-tile[data-tracker="' + id + '"]');
          openConnect(id, tile || tabAdd);
        };
        if (state.status) go(); else load().then(go);
      },
      say,
    };
  }

  root.TraceBugIntegrationsHub = { mount, LOGOS, NAMES, logo };
})(typeof self !== "undefined" ? self : this);
