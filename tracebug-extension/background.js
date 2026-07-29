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
    // Inject content script (message bridge between extension and page)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
    });

    // Inject SDK bundle into page context
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tracebug-sdk.js"],
      world: "MAIN",
    });

    // Inject initializer into page context
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["tracebug-init.js"],
      world: "MAIN",
    });

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
  const wasAlreadyInjected = injectedTabs.has(tabId);
  await injectSDK(tabId);

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
  try { await chrome.tabs.sendMessage(tabId, actionMessage); } catch {}
}

// ── Auto-inject on navigation complete ──────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act on full page load (not partial updates)
  if (changeInfo.status !== "complete" || !tab.url) return;

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
