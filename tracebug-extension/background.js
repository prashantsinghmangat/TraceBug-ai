// ── Worker-side scripts (Phase 2b) ──────────────────────────────────────────
// tracebug-provider-api.js  — the fetch adapters, built from src/providers/api.ts
//                             by tsup, so the page SDK and the worker share one
//                             source of truth for every provider call.
// provider-bridge.js        — the pure decision layer (verb allowlist, payload
//                             validation, sender checks, rate limit).
// Chrome runs background.js as a CLASSIC service worker, so importScripts
// works. Firefox has no importScripts in an event page and lists both files
// ahead of background.js in manifest background.scripts instead — hence the
// guard. Either way the globals exist before the first message arrives.
if (typeof importScripts === "function" && typeof TraceBugProviderBridge === "undefined") {
  try { importScripts("tracebug-provider-api.js", "provider-bridge.js"); } catch (e) {
    console.error("[TraceBug] failed to load provider scripts", e);
  }
}

// ── TraceBug Extension — Background Service Worker ──────────────────────────
// SDK is injected on demand when the user clicks an action in the popup.
// No persistent per-site allowlist — tracking is fully opt-in per action.
// Tracks injected tabs so we don't double-inject and so the badge can show
// "loaded" state.
// ─────────────────────────────────────────────────────────────────────────────

// First install: open the live sandbox as the welcome experience — a page
// with intentional bugs where the user can try a capture immediately, instead
// of a static "thanks for installing" tab. Updates/reloads don't re-open it.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "https://tracebug.dev/try.html?welcome=extension" });
  }
});

// Track which tabs have been injected (tab ID → true)
const injectedTabs = new Set();
// Tabs where the user has turned TraceBug ON. Unlike injectedTabs (current
// injection state, wiped on every navigation), this persists across page loads
// so the SDK + floating toolbar follow the user as they click around the site,
// instead of vanishing on every navigation. Cleared on tab close or when the
// user explicitly turns TraceBug off from the toolbar.
const activeTabs = new Set();

// The tab that's currently being screen-recorded by the offscreen document.
// Set when tb:rec:start succeeds; cleared on tb:rec:stop or auto-stop. We
// use this in chrome.tabs.onUpdated to re-inject the SDK after a page
// navigation so the user keeps seeing the recording HUD — without this,
// reloading or navigating mid-recording would silently strip the on-page
// UI while the offscreen document kept recording.
let _recordingTabId = null;

// ── MV3 durability ──────────────────────────────────────────────────────────
// The service worker is terminated after ~30s idle and restarts with blank
// module state. Without persistence, a worker restart mid-session wipes
// activeTabs + _recordingTabId, so navigation stops re-injecting the SDK/HUD
// even though the offscreen recording keeps running. chrome.storage.session is
// in-memory, survives SW restarts, clears on browser close, and needs only the
// already-declared "storage" permission — exactly the right store for this.
const SESSION_STATE_KEY = "tb_sw_state_v1";
// Set the moment any mutation persists — hydration must then DISCARD its
// (older) read instead of restoring stale state over the fresh write.
let _stateDirty = false;
function persistState() {
  _stateDirty = true;
  try {
    chrome.storage.session.set({
      [SESSION_STATE_KEY]: {
        activeTabs: [...activeTabs],
        recordingTabId: _recordingTabId,
        recorderWindowId: _recorderWindowId,
      },
    });
  } catch {}
}
// Rehydrate on every worker startup. Every handler that MUTATES this state
// must `await _hydrated` first: if the SW is woken BY a mutating event (tab
// close, toolbar ✕, auto-stop), running against empty in-memory sets would
// persist that emptiness over every other tab's state — and the in-flight
// read here could then resurrect the stale snapshot. The _stateDirty guard
// closes the second half of that race.
const _hydrated = (async () => {
  try {
    const got = await chrome.storage.session.get(SESSION_STATE_KEY);
    if (_stateDirty) return; // a mutation beat us — memory is newer than this read
    const s = got && got[SESSION_STATE_KEY];
    if (s) {
      if (Array.isArray(s.activeTabs)) s.activeTabs.forEach((t) => activeTabs.add(t));
      if (typeof s.recordingTabId === "number") _recordingTabId = s.recordingTabId;
      // Firefox event pages restart mid-recording too — without this, closing
      // the recorder popup after a restart never fans out the auto-stop, and
      // passive probes wrongly report "not recording".
      if (typeof s.recorderWindowId === "number") _recorderWindowId = s.recorderWindowId;
    }
  } catch {}
})();

// ── Badge ───────────────────────────────────────────────────────────────────
// Reflects whether the SDK is currently injected in this tab. Clears
// automatically on reload (onUpdated wipes injectedTabs first), so the badge
// always matches reality.

async function updateBadge(tabId /* , hostname */) {
  const loaded = injectedTabs.has(tabId);
  // Await both calls — without await the returned promises reject outside the
  // try/catch ("Uncaught (in promise) Error: No tab with id: …") whenever the
  // tab closed between the event firing and the badge update (prerendered
  // tabs, rapid tab churn).
  try {
    await chrome.action.setBadgeText({ tabId, text: loaded ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: loaded ? "#22c55e" : "#6b7280",
    });
  } catch {}
}

// ── Injection, in two halves ────────────────────────────────────────────────
// Split because they fail and recover independently. The bridge (isolated
// world) dies with its extension instance; the page-world SDK does not — it
// is ordinary page JS and keeps running across an extension reload. Repairing
// an orphaned tab therefore means replacing the BRIDGE ONLY, or a second
// toolbar mounts on top of the first. See ensureAlive().

/** Isolated world: the message bridge. secret-migration.js first — content-script.js calls its planner. */
async function injectBridge(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["secret-migration.js", "content-script.js"],
  });
}

/** MAIN world: the SDK bundle and its initializer. */
async function injectPageWorld(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["tracebug-sdk.js"],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["tracebug-init.js"],
    world: "MAIN",
  });
}

// ── Health check and repair (Phase 3) ───────────────────────────────────────
// The silent failure this replaces: a tab left open across an extension
// update keeps a dead content script, `injectedTabs` still believed it was
// fine, and every popup action dispatched into nothing. content-script.js
// suppresses the orphan errors on purpose (a clean host-page console), so
// there was nothing to see anywhere.
//
// 300ms is a generous ceiling for a message round trip to a live content
// script in the same process; a dead one never answers at all, so the timeout
// only bounds how long the user waits before the repair starts.
const PING_TIMEOUT_MS = 300;

function pingTab(tabId) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; resolve(v); };
    const timer = setTimeout(() => done(null), PING_TIMEOUT_MS);
    try {
      chrome.tabs.sendMessage(tabId, { type: "TB_PING" }, { frameId: 0 }, (res) => {
        // Reading lastError suppresses the unchecked-error console warning;
        // an orphaned tab lands here with no response, which IS the answer.
        void chrome.runtime.lastError;
        clearTimeout(timer);
        done(res || null);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

/**
 * Make sure this tab has a live bridge before anything is dispatched to it.
 * Throws if it cannot be repaired — the caller (popup) maps that to
 * "Reload this tab to capture" with a Reload tab button. Never returns
 * quietly on failure.
 */
async function ensureAlive(tabId) {
  try { await _hydrated; } catch {}

  if ((await pingTab(tabId))?.alive) return;

  // Our bookkeeping was wrong — the tab is not actually injected.
  injectedTabs.delete(tabId);

  await injectBridge(tabId);

  const pong = await pingTab(tabId);
  if (!pong?.alive) {
    // The bridge was injected and still cannot be reached. Nothing left to
    // try from here; this exact wording is what page-support.js maps to the
    // reload panel.
    throw new Error("Receiving end does not exist");
  }

  // Only now do we know whether the page already has a running SDK.
  if (!pong.pageSdk) await injectPageWorld(tabId);

  injectedTabs.add(tabId);
  activeTabs.add(tabId);
  persistState();
  try { updateBadge(tabId); } catch {}
}

// ── Inject SDK (once per tab) ───────────────────────────────────────────────

async function injectSDK(tabId) {
  // Hydrate before mutating activeTabs — a combo action can be the SW's wake
  // event, and persisting against blank state would wipe other tabs.
  try { await _hydrated; } catch {}
  // Prevent duplicate injection
  if (injectedTabs.has(tabId)) return;
  injectedTabs.add(tabId);
  // Any injection means the user wants TraceBug here — keep it alive across
  // navigations until they close the tab or turn it off.
  activeTabs.add(tabId);
  persistState();

  try {
    await injectBridge(tabId);
    await injectPageWorld(tabId);

    // Reflect "loaded" state in the toolbar badge for this tab.
    updateBadge(tabId);
  } catch (err) {
    injectedTabs.delete(tabId);
    // Injection never happened — don't keep the tab marked active, or every
    // future navigation retries and silently fails again.
    activeTabs.delete(tabId);
    persistState();
    console.warn("[TraceBug] Injection failed:", err.message);
    // Rethrow so the popup shows the real error instead of a false success.
    // Critical on Firefox: without the host-permission grant this fails with
    // "Missing host permission for the tab" — the user must see that. All
    // background-internal callers already .catch() this.
    throw err;
  }
}

// ── Combo action: enable site + inject SDK + dispatch action ──────────────
// The popup's single-click flows (Capture Bug Now, Record, View Tickets) all
// share this pipeline. Idempotent — enabling an already-enabled site is a
// no-op, and injectSDK skips tabs that are already injected.
async function handleComboAction(message, sender) {
  const tabId = message.tabId || sender?.tab?.id;
  if (!tabId) throw new Error("No active tab");

  // No persistent site state — every action injects the SDK fresh. Tracking
  // only starts when the user explicitly takes an action. Reloading the tab
  // unloads everything (the onUpdated listener clears injectedTabs).
  // A tab we believe is injected may be orphaned (extension updated while it
  // was open), so verify rather than trust the bookkeeping. Both paths throw
  // on failure, and the popup turns that into a sentence with a button.
  const wasAlreadyInjected = injectedTabs.has(tabId);
  if (wasAlreadyInjected) await ensureAlive(tabId);
  else await injectSDK(tabId);

  // Tell the page which action to run. Map the combo type to the bridge
  // message the content script forwards as a CustomEvent. On the very first
  // inject, give the SDK a beat to mount its event listeners; on subsequent
  // calls the listener already exists so we can dispatch immediately.
  // Forward the popup's per-action options into the page-side handler. Right
  // now this is just the mic flag for recording flows, but any future combo
  // option (region, framerate, etc.) plugs in here.
  const actionMessage = {
    type: message.type,
    withMic: !!message.withMic,
    blurFirst: !!message.blurFirst,
    delaySec: message.delaySec || 0,
    surfaceMode: message.surfaceMode || undefined,
  };
  if (!wasAlreadyInjected) {
    await new Promise((r) => setTimeout(r, 250));
  }
  try {
    await chrome.tabs.sendMessage(tabId, actionMessage);
  } catch (err) {
    // This used to be swallowed, which is how an orphaned tab turned into a
    // popup that closed with nothing happening. One repair attempt, then let
    // it throw: the user gets "Reload this tab to capture" and a button.
    await ensureAlive(tabId);
    await chrome.tabs.sendMessage(tabId, actionMessage);
  }
}

// ── Auto-inject on navigation complete ──────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on full page load (not partial updates).
  //
  // Deliberately does NOT look at tab.url. Phase 1 made <all_urls> an optional
  // host permission, so until it is granted `tab.url` is undefined on almost
  // every tab — a `!tab.url` guard here would return early and kill
  // re-injection after navigation entirely. The decision below needs only the
  // tabId, checked against activeTabs / _recordingTabId.
  if (changeInfo.status !== "complete") return;

  // Ensure persisted state (activeTabs / _recordingTabId) is rehydrated before
  // we decide whether to re-inject — a cold worker wake could otherwise miss it.
  await _hydrated;

  // A reload wipes the SDK from the page, so the injection-tracking set
  // must also forget the tab. The badge update right after will show the
  // user that TraceBug is no longer loaded for this tab.
  injectedTabs.delete(tabId);

  try {
    updateBadge(tabId);

    // Re-inject the SDK after navigation if the user turned TraceBug ON for
    // this tab (activeTabs) or it's the tab being recorded. This keeps the
    // floating toolbar + capture alive as the user clicks around the site,
    // instead of vanishing on every navigation and forcing a re-open. Tabs
    // the user never enabled stay untouched (tracking is opt-in per tab).
    if (_recordingTabId === tabId || activeTabs.has(tabId)) {
      injectSDK(tabId).catch(() => {});
    }
  } catch {}
});

// Clean up when tab is closed. Await hydration first: if THIS event woke the
// worker, mutating + persisting against blank state would wipe every other
// tab's persisted ON state.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try { await _hydrated; } catch {}
  injectedTabs.delete(tabId);
  activeTabs.delete(tabId);
  if (_recordingTabId === tabId) _recordingTabId = null;
  persistState();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateBadge(activeInfo.tabId);
});

// ── Cross-site access changes ───────────────────────────────────────────────
// Granting or revoking <all_urls> changes what an ALREADY-RUNNING SDK should
// tell the user, so nudge every injected tab to re-read it. Only tabs we
// injected are touched, and the message carries a boolean, never a URL.

function notifyHostAccessChanged() {
  injectedTabs.forEach((tabId) => {
    try {
      chrome.tabs.sendMessage(tabId, { type: "TB_HOST_ACCESS_CHANGED" }, { frameId: 0 }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  });
}

if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(notifyHostAccessChanged);
}
if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(notifyHostAccessChanged);
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // GET_STATE now returns whether the SDK is currently injected on the tab,
  // not whether the site is on a persistent allowlist (allowlist is gone).
  // The popup uses this to show a "loaded / not loaded" indicator.
  if (message.type === "GET_STATE") {
    const tabId = message.tabId || sender?.tab?.id;
    sendResponse({ loaded: tabId ? injectedTabs.has(tabId) : false });
    return false;
  }

  // ── Cross-site access, asked by the content script ──────────────────────
  // Phase 1 made <all_urls> optional, so "can TraceBug keep capturing after
  // the user navigates?" is now a real question with two answers. The page
  // world has no chrome.permissions, and NEITHER DOES A CONTENT SCRIPT — the
  // permissions API is not exposed there — so the worker answers it and the
  // content script publishes the boolean on <html data-tb-caps>.
  if (message.type === "TB_HOST_ACCESS") {
    hasHostAccess("<all_urls>").then((granted) => sendResponse({ granted }));
    return true; // async
  }

  // User turned TraceBug OFF from the floating toolbar (✕). Forget the tab so
  // it isn't re-injected on the next navigation. Hydration-await inside the
  // async block (sendResponse stays sync-safe via return true).
  if (message.type === "TB_DISABLE_TAB") {
    const tabId = message.tabId || sender?.tab?.id;
    (async () => {
      try { await _hydrated; } catch {}
      if (tabId) {
        activeTabs.delete(tabId);
        injectedTabs.delete(tabId);
        if (_recordingTabId === tabId) _recordingTabId = null;
        persistState();
        try { updateBadge(tabId); } catch {}
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ── Popup combo flows ───────────────────────────────────────────────
  // Each one: ensure the site is enabled, inject the SDK if needed, then
  // dispatch the matching action message to the page. Lets the popup
  // express user intent in a single call instead of a 3-step dance.
  if (message.type === "TB_CAPTURE_NOW" || message.type === "TB_START_RECORDING" || message.type === "TB_VIEW_TICKETS" || message.type === "TB_INSPECT") {
    handleComboAction(message, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: (err && err.message) || String(err) }));
    return true;
  }

  if (message.type === "INJECT_SDK_NOW") {
    // Popup just enabled the site — inject the SDK into the active tab without
    // forcing a reload. The user keeps whatever state they had on the page.
    const tabId = message.tabId || sender?.tab?.id;
    if (!tabId) { sendResponse({ error: "no_tab" }); return true; }
    injectSDK(tabId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: (err && err.message) || String(err) }));
    return true;
  }

  if (message.type === "CAPTURE_SCREENSHOT") {
    // Capture the REQUESTER's window, not "the current window": on Firefox
    // the recorder host is a real, focusable popup window, so a null
    // windowId while it has focus would screenshot the recorder page
    // instead of the tab under test. (Chrome's offscreen host can never be
    // focused, so null was always safe there.)
    const windowId = sender?.tab?.windowId ?? null;
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // Open the extension's own settings (options) page. Content scripts cannot
  // call openOptionsPage(), so the in-page "Open TraceBug settings" button
  // relays through the content script to here. Secrets are entered only on
  // that page — never in the host page's DOM (Phase 2).
  if (message.type === "TB_OPEN_OPTIONS") {
    try {
      chrome.runtime.openOptionsPage();
    } catch {
      // Fallback for builds/browsers where openOptionsPage is unavailable.
      try { chrome.tabs.create({ url: chrome.runtime.getURL("options.html") }); } catch {}
    }
    sendResponse({ ok: true });
    return true;
  }

  // Forward quick actions from popup to content script
  if (
    ["TAKE_SCREENSHOT", "GENERATE_REPORT", "COPY_GITHUB_ISSUE", "COPY_JIRA_TICKET", "TOGGLE_ANNOTATE", "TOGGLE_DRAW", "EXPORT_ANNOTATIONS"].includes(message.type)
  ) {
    if (message.tabId) {
      chrome.tabs.sendMessage(message.tabId, message).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // Auto-stopped broadcast from offscreen (user clicked browser's "Stop sharing"
  // button). Fan it out to every TraceBug-enabled tab so the HUD can clean up
  // and the ticket modal can open. MUST be checked BEFORE the generic
  // tb:rec:* handler below — otherwise that handler swallows the broadcast
  // and forwards it back to the offscreen (which ignores it), so this
  // dedicated path never runs.
  if (message.type === "tb:rec:auto-stopped") {
    forwardAutoStopToTabs(message);
    // The recording is finalized and persisted to storage before this
    // broadcast fires (see finalizeAndBroadcast), so the recorder host has
    // done its job — close it (Firefox: blank popup; Chrome: offscreen doc
    // holding the multi-MB recording in memory indefinitely).
    closeRecorderHost();
    return false;
  }

  // The recorder host broadcasts tb:rec:started the moment MediaRecorder
  // starts. chrome.runtime.sendMessage NEVER reaches content scripts, so
  // without this per-tab fan-out the page-side started listener — HUD-mount
  // fallback, mic-missing toast, slow-picker recovery (duration cap + DOM
  // replay) — was dead code end-to-end. Fan out to all tabs: at broadcast
  // time _recordingTabId may not be set yet (the start RPC is still in
  // flight), and unrelated tabs safely ignore it.
  if (message.type === "tb:rec:started") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id) continue;
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      } catch {}
    })();
    return false;
  }

  // ── Storage proxy ───────────────────────────────────────────────────────
  // chrome.storage is not always reachable from offscreen documents in MV3.
  // The service worker always has it, so the offscreen proxies persist /
  // read / clear through here. Content scripts read directly via
  // chrome.storage.local (they have it), so the page-side path stays fast.
  if (message.type === "tb:rec:persist" && message._toBackground === true) {
    (async () => {
      try {
        const dataUrl = message.dataUrl || "";
        const meta = message.meta || {};
        await chrome.storage.local.set({ ["tb_rec_data_v2"]: dataUrl });
        await chrome.storage.local.set({ ["tb_rec_meta_v2"]: meta });
        sendResponse({ ok: true });
      } catch (err) {
        console.warn("[TraceBug] persist failed:", err && err.message);
        sendResponse({ ok: false, error: (err && err.message) || String(err) });
      }
    })();
    return true;
  }
  if (message.type === "tb:rec:persist-clear" && message._toBackground === true) {
    (async () => {
      try { await chrome.storage.local.remove(["tb_rec_data_v2", "tb_rec_meta_v2"]); } catch {}
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (message.type === "tb:rec:persist-read" && message._toBackground === true) {
    (async () => {
      try {
        const data = await chrome.storage.local.get(["tb_rec_data_v2", "tb_rec_meta_v2"]);
        sendResponse({
          ok: true,
          dataUrl: data["tb_rec_data_v2"] || "",
          meta: data["tb_rec_meta_v2"] || null,
        });
      } catch (err) {
        sendResponse({ ok: false, error: (err && err.message) || String(err) });
      }
    })();
    return true;
  }

  // ── Provider sends (Phase 2b) ──────────────────────────────────────────
  // Two verbs, and only two. Everything a hostile page would need in order to
  // abuse them — a destination, a credential — is absent from the wire format
  // by design, and every tracker send is confirmed by the user in a window
  // this worker owns. See provider-bridge.js for the full reasoning.
  if (message.type === "tb:provider:send" || message.type === "tb:llm:analyze") {
    handleProviderRequest(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: (err && err.message) || "Request failed." }));
    return true;
  }

  // Content for the confirmation window. Accepted ONLY from that window.
  if (message.type === "tb:confirm:get") {
    if (!isConfirmSender(sender)) { sendResponse({ ok: false, error: "Rejected." }); return false; }
    getPending(message.id)
      .then((req) => sendResponse(req
        ? { ok: true, request: confirmViewOf(req) }
        : { ok: false, error: "This request is no longer waiting for confirmation." }))
      .catch(() => sendResponse({ ok: false, error: "Could not read the request." }));
    return true;
  }

  // The decision. This is the single message that turns a queued request into
  // a real API call, so it is accepted ONLY from our own confirm-send.html —
  // never from a content script, however well-formed the message looks.
  if (message.type === "tb:confirm:decide") {
    if (!isConfirmSender(sender)) { sendResponse({ ok: false, error: "Rejected." }); return false; }
    resolvePending(message.id, !!message.approved)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ── Recording RPC ──────────────────────────────────────────────────────
  // tb:rec:* messages come from content scripts. Background ensures the
  // offscreen document exists, then forwards the message to it WITH a
  // `_toOffscreen: true` marker so offscreen knows the message is for it.
  // chrome.runtime broadcasts deliver to all extension contexts, so the
  // marker prevents offscreen from also handling the original (untagged)
  // content-script broadcast — which would otherwise fire getDisplayMedia
  // twice.
  if (typeof message.type === "string" && message.type.startsWith("tb:rec:")) {
    // Skip our own re-emit so we don't recurse into ourselves.
    if (message._toOffscreen === true) return false;
    handleRecordingMessage(message, sender)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: (err && err.message) || String(err) }));
    return true;
  }
});

// ── Offscreen document lifecycle ───────────────────────────────────────────

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
let _offscreenCreating = null;

// Chrome hosts the recorder page as an offscreen document. Firefox has no
// chrome.offscreen API (nor chrome.runtime.getContexts), so it hosts the same
// page (offscreen.html + offscreen.js) in a small popup window instead — a
// visible extension document is exactly what Firefox's getDisplayMedia needs.
// Both paths speak the identical tb:rec:* message contract, so only the
// host's create/teardown differs.
const HAS_OFFSCREEN =
  typeof chrome.offscreen?.createDocument === "function" &&
  typeof chrome.runtime.getContexts === "function";
let _recorderWindowId = null;

async function hasOffscreenDocument() {
  // chrome.runtime.getContexts is the modern (Chrome 116+) way to check.
  if (typeof chrome.runtime.getContexts === "function") {
    try {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [OFFSCREEN_URL],
      });
      return existing.length > 0;
    } catch {}
  }
  // Fallback: legacy clients.getAll on workers (rarely needed).
  try {
    const matched = await self.clients?.matchAll();
    return !!matched?.some((c) => c.url === OFFSCREEN_URL);
  } catch {}
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  // Coalesce concurrent creation calls.
  if (_offscreenCreating) return _offscreenCreating;
  _offscreenCreating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    // USER_MEDIA covers chrome.tabCapture-via-getUserMedia (silent recording);
    // DISPLAY_MEDIA covers the getDisplayMedia fallback path.
    reasons: ["USER_MEDIA", "DISPLAY_MEDIA"],
    justification: "Hold the screen-recording MediaStream so it survives host-page reloads.",
  }).finally(() => { _offscreenCreating = null; });
  return _offscreenCreating;
}

async function closeOffscreenDocument() {
  if (!(await hasOffscreenDocument())) return;
  try { await chrome.offscreen.closeDocument(); } catch {}
}

// ── Firefox recorder-window host ────────────────────────────────────────────
// Opens offscreen.html in a small popup window (Firefox has no offscreen API).
// The page's offscreen.js listener is the same one Chrome's offscreen doc runs,
// so background forwards tb:rec:* messages to it unchanged.

async function ensureRecorderWindow() {
  if (_recorderWindowId != null) {
    try {
      await chrome.windows.get(_recorderWindowId);
      // Bring it forward — the user must SEE the window to click its
      // "Share screen" button (the gesture getDisplayMedia requires).
      try { await chrome.windows.update(_recorderWindowId, { focused: true }); } catch {}
      return;
    }
    catch { _recorderWindowId = null; }
  }
  const win = await chrome.windows.create({
    // ?host=window tells offscreen.js it's running as a visible popup and
    // must gate getDisplayMedia behind a click (transient activation).
    url: chrome.runtime.getURL("offscreen.html") + "?host=window",
    type: "popup",
    width: 480,
    height: 240,
    focused: true,
  });
  _recorderWindowId = win?.id ?? null;
  // Persist immediately — a Firefox event-page restart mid-recording must be
  // able to rediscover the window (onRemoved guard, passive-probe gate).
  persistState();
  // Let the page install its chrome.runtime.onMessage listener before the
  // first tb:rec:* message is forwarded to it.
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// If the user closes the recorder popup mid-recording, its document (and the
// MediaStream it holds) dies with no chance to broadcast — fan out the
// auto-stop ourselves so the page HUD tears down instead of showing a live
// recording that no longer exists. No recording payload survives this path.
if (chrome.windows?.onRemoved) {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    // Hydrate first: after an event-page restart, _recorderWindowId lives
    // only in storage.session — without this await, closing the recorder
    // popup mid-recording would never fan out the auto-stop.
    try { await _hydrated; } catch {}
    if (windowId !== _recorderWindowId) return;
    _recorderWindowId = null;
    if (_recordingTabId != null) {
      forwardAutoStopToTabs({ type: "tb:rec:auto-stopped", recording: null });
      _recordingTabId = null;
    }
    persistState();
  });
}

async function closeRecorderWindow() {
  if (_recorderWindowId == null) return;
  const id = _recorderWindowId;
  _recorderWindowId = null;
  persistState();
  try { await chrome.windows.remove(id); } catch {}
}

/** Is a Chrome offscreen document currently alive? Uses getContexts (Chrome
 *  116+); when the API is unavailable, claim it exists so callers fall through
 *  to the old create-and-ask path — correct, just slower. Safe across service
 *  worker restarts: a live recording implies a live offscreen doc, which
 *  getContexts will find. */
async function offscreenDocumentExists() {
  try {
    if (typeof chrome.runtime.getContexts !== "function") return true;
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    return contexts.length > 0;
  } catch {
    return true;
  }
}

// ── Recorder host dispatch (offscreen on Chrome, popup window on Firefox) ────

async function ensureRecorderHost() {
  return HAS_OFFSCREEN ? ensureOffscreenDocument() : ensureRecorderWindow();
}

async function closeRecorderHost() {
  return HAS_OFFSCREEN ? closeOffscreenDocument() : closeRecorderWindow();
}

async function handleRecordingMessage(message, sender) {
  // Hydrate before reading _recorderWindowId (Firefox host-absent gate) or
  // mutating _recordingTabId below — either can be the wake event.
  try { await _hydrated; } catch {}
  // No more silent tabCapture path. We always route to getDisplayMedia so
  // the user gets Chrome's native "Choose what to share" picker — they can
  // pick the current tab, a different tab, a window, or the whole screen.
  // The picker is more reliable than chrome.tabCapture (which fails in
  // dozens of edge cases — popups, file://, chrome://, sandboxed iframes)
  // and produces a recording that always plays back correctly.
  const extraData = {};

  // Never spin up the recorder host just to answer a passive probe.
  // Firefox: the host is a VISIBLE popup that used to flash at the user on
  // every ticket-modal open. Chrome: creating an offscreen document (plus its
  // boot-retry loop) costs 100-400ms on the modal-open path — just to answer
  // "no recording". No live host → nothing is recording; answer from here.
  const hostAbsent = HAS_OFFSCREEN ? !(await offscreenDocumentExists()) : _recorderWindowId == null;
  if (hostAbsent && message.type !== "tb:rec:start") {
    switch (message.type) {
      case "tb:rec:status":
        return { active: false, mode: null, capturesTaken: 0, elapsedMs: 0, comments: [], mimeType: "", startedAt: 0 };
      case "tb:rec:last-recording": {
        // The last finalized recording survives in chrome.storage.local even
        // after the recorder window closed — serve its metadata directly; the
        // content script pulls the big dataUrl from storage itself.
        try {
          const data = await chrome.storage.local.get("tb_rec_meta_v2");
          const meta = data && data["tb_rec_meta_v2"];
          if (meta && meta.durationMs) {
            return {
              mimeType: meta.mimeType,
              durationMs: meta.durationMs,
              sizeBytes: meta.sizeBytes,
              comments: meta.comments || [],
              startedAt: meta.startedAt,
              _viaStorage: true,
            };
          }
        } catch {}
        return null;
      }
      case "tb:rec:comment":
        return { ok: false };
      default:
        // tb:rec:stop / tb:rec:capture with no recorder → nothing to return.
        return null;
    }
  }

  await ensureRecorderHost();
  // Forward to offscreen with the `_toOffscreen` marker so it knows this is
  // the routed copy. We use a Promise-wrapped sendMessage since the callback
  // form isn't promise-based when invoked across runtime contexts.
  const forwarded = {
    ...message,
    data: { ...(message.data || {}), ...extraData },
    _toOffscreen: true,
  };
  const result = await new Promise((resolve, reject) => {
    // The recorder host may still be booting (fresh offscreen doc, or a
    // Firefox popup window on a cold start) when the first message arrives —
    // "Receiving end does not exist" here means "not listening YET", so retry
    // briefly instead of failing the user's recording on a race.
    const attempt = (triesLeft) => {
      chrome.runtime.sendMessage(forwarded, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          if (triesLeft > 0 && /receiving end|establish connection/i.test(err.message || "")) {
            setTimeout(() => attempt(triesLeft - 1), 150);
            return;
          }
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    };
    attempt(20); // ~3s worst case
  });

  // Track the recording tab so we can re-attach the on-page HUD after a
  // navigation/reload. We pin the tab id on a successful start, clear it on
  // a stop or when the auto-stop broadcast fans out.
  if (message.type === "tb:rec:start" && result && !result.error && result.ok !== false) {
    _recordingTabId = sender?.tab?.id || null;
    persistState();
  }
  // Start didn't happen (user cancelled the gesture or the picker, or it
  // errored) — close the host instead of leaving a blank popup (Firefox) or
  // an idle offscreen document (Chrome).
  if (message.type === "tb:rec:start" && (!result || result.error || result.ok === false)) {
    closeRecorderHost();
  }

  // Keep the offscreen alive after a stop so the page can re-request the
  // last recording via tb:rec:last-recording. Without this, a page reload
  // between Stop and modal mount loses the video forever. The offscreen
  // tears down its MediaStream (via teardown() in offscreen.js) so it's
  // not holding the recorder open — just the last-built recording metadata.
  // The next tb:rec:start clears _lastBuiltRecording and reuses the doc.
  if (message.type === "tb:rec:stop" && result && !result.error) {
    _recordingTabId = null;
    persistState();
    // Close the recorder host on BOTH browsers. Firefox: the popup would
    // linger as a blank window. Chrome: the offscreen document (exempt from
    // auto-teardown with USER_MEDIA/DISPLAY_MEDIA reasons) would otherwise
    // hold the full base64 recording in memory until browser close. Safe:
    // the finalized recording is persisted to chrome.storage.local, and the
    // passive-RPC path above serves last-recording metadata from storage
    // without reopening a host.
    closeRecorderHost();
  }

  return result;
}

async function forwardAutoStopToTabs(message) {
  // Hydrate first — this broadcast can be the event-page/SW wake event, and
  // both the _recordingTabId read and the persistState below need real state.
  try { await _hydrated; } catch {}
  // Snapshot the recording tab BEFORE clearing it so we can focus it after
  // the broadcast. The user expects to see the ticket modal — if they're on
  // a different tab when Chrome auto-stops the share, switch them back.
  const recordingTab = _recordingTabId;
  try {
    _recordingTabId = null;
    persistState();

    // Make sure the SDK is loaded on the recording tab so the auto-stop
    // listener has somewhere to fire and the modal can mount. If the tab
    // was reloaded mid-recording (already covered by onUpdated) or restored
    // from bfcache (which can sometimes drop the script), re-injecting here
    // is a safety net.
    if (recordingTab) {
      try { await injectSDK(recordingTab); } catch {}
    }

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      // sendMessage may set lastError when the page is in bfcache or no
      // receiver is listening. We don't care — we just want one of the
      // tabs (the recording one) to deliver. Read lastError defensively so
      // Chrome doesn't print the "Unchecked runtime.lastError" warning.
      await new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(tab.id, message, () => {
            void chrome.runtime.lastError; // touched intentionally
            resolve();
          });
        } catch { resolve(); }
      });
    }

    // Bring the recording tab to the front so the modal is visible. Without
    // this the user might be on a different tab and never see the ticket.
    if (recordingTab) {
      try {
        const tab = await chrome.tabs.get(recordingTab);
        if (tab) {
          await chrome.tabs.update(recordingTab, { active: true });
          if (tab.windowId != null) {
            try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
          }
        }
      } catch {}
    }

    // Keep the offscreen alive after auto-stop too, so the page can recover
    // the finalized recording via tb:rec:last-recording if the broadcast
    // arrived before the SDK had wired up its listener. The next
    // tb:rec:start clears _lastBuiltRecording and reuses the document, so
    // there's no stale-recording risk.
  } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// Provider sends — Phase 2b
// ════════════════════════════════════════════════════════════════════════════
//
// Flow, and why it is shaped like this:
//
//   page → content script → tb:provider:send {provider, payload}
//     ↓  validate verb + sender + payload (provider-bridge.js)
//     ↓  write the request to chrome.storage.session
//     ↓  open confirm-send.html in an extension-owned popup window
//     ↓  respond {pending:true, id}  ← the response channel closes HERE
//   …user reads it…
//   confirm window → tb:confirm:decide {id, approved}
//     ↓  read config from chrome.storage.local, call the provider
//     ↓  chrome.tabs.sendMessage(tabId, result, {frameId: 0})
//
// The response channel is NOT held open across the human decision. An MV3
// worker may be terminated while the user reads the window, which would strand
// a pending sendResponse — so the request lives in storage.session, the
// timeout lives in chrome.alarms, and the outcome is delivered as its own
// message. All three survive a worker restart.

const PENDING_KEY = "tb_pending_sends_v1";
const RATE_KEY = "tb_llm_rates_v1";
const LLM_SITES_KEY = "tb_llm_sites_v1";
const INT_KEY = "tb_integrations_v1";
const AI_CFG_KEY = "tb_ai_config_v1";
const PAYLOAD_PREFIX = "tb_send_payload_";
const CONFIRM_ALARM = "tb:confirm:expire:";

const TB_PROVIDER_LABELS = { github: "GitHub", linear: "Linear", slack: "Slack" };
const TB_AI_LABELS = { anthropic: "Anthropic (Claude)", openai: "OpenAI", ollama: "Ollama (local)" };

function bridgeLib() {
  // Read lazily so every call site is honest about the one failure mode that
  // matters: the script didn't load, so nothing may be sent.
  return typeof TraceBugProviderBridge !== "undefined" ? TraceBugProviderBridge : null;
}
function providerApi() {
  return typeof TraceBugProviderAPI !== "undefined" ? TraceBugProviderAPI : null;
}

function isConfirmSender(sender) {
  const b = bridgeLib();
  if (!b) return false;
  let url = "";
  try { url = chrome.runtime.getURL("confirm-send.html"); } catch { return false; }
  return b.validateConfirmSender(sender, chrome.runtime.id, url);
}

// ── storage helpers (callback form — works on Chrome and Firefox 128) ──────

function sessionGet(key, fallback) {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get([key], (r) => {
        void chrome.runtime.lastError;
        resolve((r && r[key]) || fallback);
      });
    } catch { resolve(fallback); }
  });
}

function sessionSet(obj) {
  return new Promise((resolve) => {
    try { chrome.storage.session.set(obj, () => { void chrome.runtime.lastError; resolve(); }); }
    catch { resolve(); }
  });
}

function localGet(keys, fallback) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (r) => {
        void chrome.runtime.lastError;
        resolve(r || fallback);
      });
    } catch { resolve(fallback); }
  });
}

function localSet(obj) {
  return new Promise((resolve) => {
    try { chrome.storage.local.set(obj, () => { void chrome.runtime.lastError; resolve(); }); }
    catch { resolve(); }
  });
}

function localRemove(keys) {
  return new Promise((resolve) => {
    try { chrome.storage.local.remove(keys, () => { void chrome.runtime.lastError; resolve(); }); }
    catch { resolve(); }
  });
}

async function getPending(id) {
  if (!id) return null;
  const all = await sessionGet(PENDING_KEY, {});
  return all[id] || null;
}

/** Remove and return one pending request. This is the ONLY path that resolves
 *  a request, so whichever of cancel / timeout / window-close arrives first
 *  wins and the others find nothing. */
async function dropPending(id) {
  const all = await sessionGet(PENDING_KEY, {});
  const req = all[id] || null;
  delete all[id];
  await sessionSet({ [PENDING_KEY]: all });
  return req;
}

// ── Outcome delivery ───────────────────────────────────────────────────────

/**
 * Deliver a result to the ONE tab that asked, top frame only. Never a
 * broadcast: another tab must not learn that a send happened, let alone
 * receive its result, and a subframe has no business seeing it either.
 */
function tellTab(tabId, msg) {
  if (typeof tabId !== "number") return;
  try {
    chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, () => { void chrome.runtime.lastError; });
  } catch {}
}

function ackError(error) {
  return { error };
}

// ── The request handler ────────────────────────────────────────────────────

async function handleProviderRequest(message, sender) {
  const b = bridgeLib();
  if (!b) return ackError("TraceBug could not start the send (provider scripts missing). Reload the extension.");

  const id = message.id;
  const v = b.validateRequest(message.type, message.data, chrome.runtime.id, sender);
  if (!v.ok) return ackError(v.error);

  const tabId = sender.tab.id;
  let origin = "";
  try { origin = sender.origin || new URL(sender.url).origin; } catch { origin = "an unknown page"; }

  // Payloads above the storage threshold travel through chrome.storage.local
  // (the same trick recordings use) and are read back here. The key is deleted
  // in a finally so a cancelled or failed send never leaves report text behind.
  let payload = v.payload;
  if (message.data && message.data._viaStorage) {
    const key = PAYLOAD_PREFIX + String(message.data._viaStorage);
    try {
      const got = await localGet([key], {});
      const stored = got[key];
      const re = stored
        ? b.validatePayload(v.target, stored)
        : { ok: false, error: "The report could not be read — try again." };
      if (!re.ok) return ackError(re.error);
      payload = re.payload;
    } finally {
      await localRemove([key]);
    }
  }

  const cfgAll = await localGet([INT_KEY, AI_CFG_KEY, LLM_SITES_KEY], {});

  if (v.kind === "llm") {
    const aiCfg = cfgAll[AI_CFG_KEY];
    if (!aiCfg || !aiCfg.provider) return ackError("No AI provider configured — open TraceBug settings to add a key.");
    if (aiCfg.provider !== "ollama" && !aiCfg.apiKey) return ackError("No API key saved — open TraceBug settings.");

    // Rate limit BEFORE the per-site approval check, so an already-approved
    // site cannot burn credits either. The window is persisted: a worker
    // restart must not hand the page a fresh quota.
    const rates = await sessionGet(RATE_KEY, {});
    const rl = b.rateLimit(origin, Date.now(), rates);
    await sessionSet({ [RATE_KEY]: rl.state });
    if (!rl.allow) return ackError(rl.error);

    const sites = cfgAll[LLM_SITES_KEY] || {};
    if (sites[origin] && sites[origin].allowed) {
      // Already trusted by the user: run it now, no window.
      runAndReport(id, tabId, { kind: "llm", target: aiCfg.provider, payload, origin,
        providerLabel: TB_AI_LABELS[aiCfg.provider] || aiCfg.provider });
      return { pending: true, id };
    }
    return queueConfirmation({
      id, tabId, origin, kind: "llm",
      target: aiCfg.provider,
      providerLabel: TB_AI_LABELS[aiCfg.provider] || aiCfg.provider,
      destination: TB_AI_LABELS[aiCfg.provider] || aiCfg.provider,
      payload,
    });
  }

  // Tracker send. Confirmed EVERY time: one approval per session would let a
  // hostile page spam for the rest of it, and "session" is vague anyway
  // because the worker restarts.
  const integrations = cfgAll[INT_KEY] || {};
  if (!hasProviderConfig(v.target, integrations)) {
    return ackError((TB_PROVIDER_LABELS[v.target] || v.target) + " is not configured — open TraceBug settings.");
  }

  // Cap the body to what the provider actually accepts BEFORE the confirmation
  // window opens. Two reasons it has to happen here and not at the fetch:
  //   1. the user must approve the EXACT text that will be sent, and
  //   2. an over-long body is a 422 that loses the whole send, so cutting it is
  //      the difference between a shortened issue and no issue.
  const cap = capTrackerPayload(v.target, payload);

  return queueConfirmation({
    id, tabId, origin, kind: "tracker",
    target: v.target,
    providerLabel: TB_PROVIDER_LABELS[v.target] || v.target,
    destination: b.destinationLabel(v.target, integrations),
    payload: cap.payload,
    cutWarning: cap.warning,
  });
}

/**
 * Shorten the one text field this provider carries, if it exceeds the
 * provider's limit. Returns the payload unchanged when it fits (the usual
 * case) and a one-sentence warning when it did not, which the confirmation
 * window shows in its "Before you send" box.
 */
function capTrackerPayload(target, payload) {
  const api = providerApi();
  if (!api || typeof api.capProviderBody !== "function") return { payload };
  const field = target === "slack" ? "text" : "body";
  const capped = api.capProviderBody(target, payload[field] || "");
  if (!capped.cutFrom) return { payload };
  const next = Object.assign({}, payload);
  next[field] = capped.text;
  return { payload: next, warning: capped.warning };
}

function hasProviderConfig(target, integrations) {
  const i = integrations || {};
  if (target === "github") return !!(i.github && i.github.token && i.github.repo);
  if (target === "linear") return !!(i.linear && i.linear.apiKey && i.linear.teamId);
  if (target === "slack") return !!(i.slack && i.slack.webhookUrl);
  return false;
}

// ── Confirmation lifecycle ─────────────────────────────────────────────────

function bodyTextOf(payload) {
  if (!payload) return "";
  if (payload.body != null) return payload.body;
  if (payload.text != null) return payload.text;
  return payload.prompt || "";
}

async function queueConfirmation(req) {
  const b = bridgeLib();
  const now = Date.now();

  const all = await sessionGet(PENDING_KEY, {});
  // Reap anything whose alarm never fired (worker asleep at the deadline).
  for (const dead of b.reapExpired(all, now)) {
    const stale = all[dead];
    delete all[dead];
    tellTab(stale && stale.tabId, {
      type: "tb:provider:result", id: dead, cancelled: true,
      error: "Send cancelled — the confirmation timed out.",
    });
  }
  const room = b.canQueue(all, req.tabId, now);
  if (!room.ok) {
    await sessionSet({ [PENDING_KEY]: all });
    return ackError(room.error);
  }

  const expiresAt = now + b.CONFIRM_TIMEOUT_MS;
  const record = {
    id: req.id,
    tabId: req.tabId,
    origin: req.origin,
    kind: req.kind,
    target: req.target,
    providerLabel: req.providerLabel,
    destination: req.destination,
    payload: req.payload,
    // The cut notice goes FIRST: it is the one warning that changes what the
    // user is approving, rather than just describing it.
    warnings: (req.cutWarning ? [req.cutWarning] : []).concat(b.previewWarnings(bodyTextOf(req.payload))),
    shortened: !!req.cutWarning,
    expiresAt,
    windowId: null,
  };
  all[req.id] = record;
  await sessionSet({ [PENDING_KEY]: all });

  // The timeout runs on chrome.alarms, not setTimeout: a terminated worker
  // takes its timers with it, and a confirmation that silently never expires
  // would leave the page's promise hanging forever.
  try { chrome.alarms.create(CONFIRM_ALARM + req.id, { when: expiresAt }); } catch {}

  try {
    const win = await chrome.windows.create({
      // The id is the ONLY thing in the URL — no report text in a URL bar,
      // a window title, or a history entry.
      url: chrome.runtime.getURL("confirm-send.html") + "?id=" + encodeURIComponent(req.id),
      type: "popup",
      width: 560,
      height: 680,
      focused: true,
    });
    record.windowId = (win && win.id) != null ? win.id : null;
    const again = await sessionGet(PENDING_KEY, {});
    if (again[req.id]) { again[req.id] = record; await sessionSet({ [PENDING_KEY]: again }); }
  } catch {
    await dropPending(req.id);
    try { chrome.alarms.clear(CONFIRM_ALARM + req.id); } catch {}
    return ackError("TraceBug could not open the confirmation window, so nothing was sent.");
  }

  return { pending: true, id: req.id };
}

/** What the confirmation window is allowed to see. */
function confirmViewOf(req) {
  return {
    kind: req.kind,
    origin: req.origin,
    providerLabel: req.providerLabel,
    destination: req.destination,
    title: (req.payload && req.payload.title) || "",
    body: bodyTextOf(req.payload),
    warnings: req.warnings || [],
    shortened: !!req.shortened,
    expiresAt: req.expiresAt,
  };
}

async function resolvePending(id, approved) {
  const req = await dropPending(id);
  try { chrome.alarms.clear(CONFIRM_ALARM + id); } catch {}
  if (!req) return;
  if (req.windowId != null) {
    try { await chrome.windows.remove(req.windowId); } catch {}
  }
  if (!approved) {
    tellTab(req.tabId, { type: "tb:provider:result", id, cancelled: true, error: "Send cancelled." });
    return;
  }
  // An approved first AI analysis also records the site, so we only ask once.
  // Revocable from the settings page.
  if (req.kind === "llm") {
    const got = await localGet([LLM_SITES_KEY], {});
    const sites = got[LLM_SITES_KEY] || {};
    sites[req.origin] = { allowed: true, at: Date.now() };
    await localSet({ [LLM_SITES_KEY]: sites });
  }
  await runAndReport(id, req.tabId, req);
}

// ── The actual call ────────────────────────────────────────────────────────

async function runAndReport(id, tabId, req) {
  const api = providerApi();
  if (!api) {
    tellTab(tabId, {
      type: "tb:provider:result", id,
      error: "TraceBug could not load its provider code. Reload the extension.",
    });
    return;
  }
  try {
    const result = req.kind === "llm"
      ? await callLLMFromWorker(api, req)
      : await callTrackerFromWorker(api, req);
    tellTab(tabId, { type: "tb:provider:result", id, ok: true, result });
  } catch (err) {
    const label = req.providerLabel || req.target || "the provider";
    tellTab(tabId, { type: "tb:provider:result", id, error: api.mapProviderError(err, label) });
  }
}

/** Is a host pattern granted — either as an optional permission, or by the
 *  still-required <all_urls> that Phase 1 will make optional? */
function hasHostAccess(pattern) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ origins: [pattern] }, (granted) => {
        void chrome.runtime.lastError;
        resolve(!!granted);
      });
    } catch { resolve(false); }
  });
}

async function callTrackerFromWorker(api, req) {
  const got = await localGet([INT_KEY], {});
  const cfg = got[INT_KEY] || {};
  if (req.target === "github") {
    if (!(await hasHostAccess(api.PROVIDER_ORIGINS.github))) throw new Error(noAccessMessage("api.github.com"));
    return api.postGitHubIssue(cfg.github, { title: req.payload.title, body: req.payload.body });
  }
  if (req.target === "linear") {
    if (!(await hasHostAccess(api.PROVIDER_ORIGINS.linear))) throw new Error(noAccessMessage("api.linear.app"));
    return api.postLinearIssue(cfg.linear, { title: req.payload.title, body: req.payload.body });
  }
  // Slack: with host access the worker is not bound by page CORS, so it reads
  // the REAL response instead of guessing — this is what resolves the Phase 6
  // Slack item. Without access, fall back to the opaque no-cors post rather
  // than failing outright, because that still delivers the message.
  const readResponse = await hasHostAccess(api.PROVIDER_ORIGINS.slack);
  return api.postSlackMessage(cfg.slack, { text: req.payload.text }, undefined, { readResponse });
}

function noAccessMessage(host) {
  return "TraceBug doesn't have access to " + host + " yet. Open TraceBug settings and save this integration again to allow it.";
}

async function callLLMFromWorker(api, req) {
  const got = await localGet([AI_CFG_KEY], {});
  const cfg = got[AI_CFG_KEY];
  if (!cfg || !cfg.provider) throw new Error("No AI provider configured — open TraceBug settings.");

  // A user-edited Ollama baseUrl can point anywhere. Phase 1 made <all_urls>
  // an optional host permission, so a custom host is no longer a refusal: the
  // settings page requests that ONE origin when the provider is saved, and we
  // check the same origin here. Only an unparseable or non-HTTP URL is still a
  // hard error — nothing to request for those.
  //
  // 127.0.0.1 is a different HOST from localhost, so it gets its own pattern.
  // Match patterns carry no port, so :11434 needs no special handling.
  let pattern = api.PROVIDER_ORIGINS[cfg.provider];
  let hostLabel = cfg.provider === "ollama" ? "localhost" : "the AI provider";
  if (cfg.provider === "ollama") {
    let u = null;
    if (cfg.baseUrl) {
      try { u = new URL(cfg.baseUrl); }
      catch { throw new Error("The Ollama base URL in TraceBug settings is not a valid URL."); }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("The Ollama base URL must start with http:// or https:// — fix it in TraceBug settings.");
      }
    }
    const host = u ? u.hostname : "localhost";
    hostLabel = host;
    pattern = host === "localhost"
      ? api.PROVIDER_ORIGINS.ollama
      : host === "127.0.0.1"
        ? api.PROVIDER_ORIGINS.ollama127
        : u.protocol + "//" + host + "/*";
  }
  if (pattern && !(await hasHostAccess(pattern))) {
    throw new Error(noAccessMessage(hostLabel));
  }
  return api.callLLM(cfg, req.payload.prompt);
}

// ── Expiry, window-close, tab-close ────────────────────────────────────────

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (!alarm || typeof alarm.name !== "string" || alarm.name.indexOf(CONFIRM_ALARM) !== 0) return;
    const id = alarm.name.slice(CONFIRM_ALARM.length);
    const req = await dropPending(id);
    if (!req) return;
    if (req.windowId != null) {
      try { await chrome.windows.remove(req.windowId); } catch {}
    }
    tellTab(req.tabId, {
      type: "tb:provider:result", id, cancelled: true,
      error: "Send cancelled — the confirmation timed out.",
    });
  });
}

// Closing the confirmation window with the titlebar ✕ is a cancel. The window
// also posts a decision on beforeunload; whichever arrives first wins, because
// dropPending() is the only path that resolves a request.
if (chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener(async (windowId) => {
    const all = await sessionGet(PENDING_KEY, {});
    const hit = Object.keys(all).find((k) => all[k] && all[k].windowId === windowId);
    if (!hit) return;
    const req = await dropPending(hit);
    try { chrome.alarms.clear(CONFIRM_ALARM + hit); } catch {}
    if (!req) return;
    tellTab(req.tabId, { type: "tb:provider:result", id: hit, cancelled: true, error: "Send cancelled." });
  });
}

// A tab that goes away can have no pending confirmation, and its window should
// not be left on screen asking about a page that no longer exists.
if (chrome.tabs && chrome.tabs.onRemoved) {
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const all = await sessionGet(PENDING_KEY, {});
    const hits = Object.keys(all).filter((k) => all[k] && all[k].tabId === tabId);
    for (const id of hits) {
      const req = await dropPending(id);
      try { chrome.alarms.clear(CONFIRM_ALARM + id); } catch {}
      if (req && req.windowId != null) {
        try { await chrome.windows.remove(req.windowId); } catch {}
      }
    }
  });
}
