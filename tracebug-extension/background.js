// ── Worker-side scripts (Phase 2b) ──────────────────────────────────────────
// tracebug-provider-api.js  — the fetch adapters, built from src/providers/api.ts
//                             by tsup, so the page SDK and the worker share one
//                             source of truth for every provider call.
// provider-bridge.js        — the pure decision layer (verb allowlist, payload
//                             validation, sender checks, rate limit).
// page-support.js           — "can TraceBug run on this page", and the mapping
//                             from a browser error to a sentence. The popup
//                             loads it too; the worker needs it because the
//                             keyboard command has no popup to talk through.
// Chrome runs background.js as a CLASSIC service worker, so importScripts
// works. Firefox has no importScripts in an event page and lists both files
// ahead of background.js in manifest background.scripts instead — hence the
// guard. Either way the globals exist before the first message arrives.
if (typeof importScripts === "function" && typeof TraceBugProviderBridge === "undefined") {
  try { importScripts("tracebug-provider-api.js", "provider-bridge.js", "page-support.js", "diagnostics.js"); } catch (e) {
    console.error("[TraceBug] failed to load provider scripts", e);
  }
}

// ── TraceBug Extension — Background Service Worker ──────────────────────────
// SDK is injected on demand when the user clicks an action in the popup.
// No persistent per-site allowlist — tracking is fully opt-in per action.
// Tracks injected tabs so we don't double-inject and so the badge can show
// "loaded" state.
// ─────────────────────────────────────────────────────────────────────────────

// ── Internal error capture (Phase 7) ────────────────────────────────────────
// TraceBug sends nothing anywhere, so a bug nobody can describe is a bug
// nobody can fix. These handlers put the worker's own failures in a session
// ring buffer the user can copy out of the popup. No URLs, no page data — see
// diagnostics.js, which does the scrubbing.
if (typeof TraceBugDiagnostics !== "undefined") {
  TraceBugDiagnostics.install("worker");
}

// ── Record options, worker-writable (Phase 4) ───────────────────────────────
// The popup's Record options used to live in the popup's own localStorage,
// which a service worker cannot read or write. That made one question
// unanswerable: "has this user chosen whether to record video, or have they
// just never been asked?" The popup could only see a missing field, and a
// missing field is not a choice. So the blob moved here, and carries an
// explicit `videoSetBy` discriminator:
//   "default" — written by this worker on install/update; safe to overwrite
//   "user"    — the user toggled the checkbox themselves; never overwrite it
// The default itself depends on which of the two it was: off for a new
// install, on for an update, because a pre-Phase-4 user has been recording
// video on every capture whether they asked to or not.
// The popup migrates its legacy localStorage blob into this key on first open
// (see popup.js `loadRecordOpts`) — the worker cannot do that migration
// itself, which is why the seed below must not clobber a user's choice.
const RECORD_OPTS_KEY = "tb_record_opts";

// ── "What's new" after an update (Phase 4 Step D) ───────────────────────────
// An update must not steal a tab — the user was doing something. So instead of
// opening a page, the worker writes the version that landed and the popup shows
// a card the next time it is opened. The worker deliberately holds no COPY: it
// records "1.11.0 happened", and popup.js decides whether it has anything to
// say about that version. A release that forgets to add copy shows nothing,
// which is the right failure.
const WHATS_NEW_KEY = "tb_whats_new";

/** Record the version that just landed, for the popup to announce once. */
async function flagWhatsNew() {
  const version = currentVersion();
  if (!version) return;
  try {
    await chrome.storage.local.set({ [WHATS_NEW_KEY]: version });
  } catch (err) {
    // Not fatal: the user misses one card. Never worth failing an update over.
    console.warn("[TraceBug] couldn't flag what's new", err);
  }
}

/**
 * Seed the video default once, without ever overriding a choice.
 *
 * Video defaults ON where the build can record the current tab with no share
 * dialog (it declares `tabCapture`: the Chrome build). The Firefox build has
 * Desktop mode only, so video ON there opened the screen-share picker on a
 * new user's very first Capture Bug; it defaults OFF instead, and a default
 * ON that an earlier Firefox build seeded is turned off once. Feature test on
 * the manifest, no browser-name check. `videoSetBy: "user"` is never touched,
 * and a stored default is otherwise not re-applied on later updates.
 */
async function seedRecordOptsDefault() {
  try {
    const stored = (await chrome.storage.local.get(RECORD_OPTS_KEY))[RECORD_OPTS_KEY];
    if (stored && stored.videoSetBy === "user") return;
    const tabCapture = (chrome.runtime.getManifest().permissions || []).includes("tabCapture");
    if (stored && typeof stored.video === "boolean") {
      if (tabCapture || stored.video !== true) return;
    }
    await chrome.storage.local.set({
      [RECORD_OPTS_KEY]: {
        ...(stored || {}),
        video: tabCapture,
        videoSetBy: "default",
      },
    });
  } catch (err) {
    // A failed seed is not fatal — the popup falls back to video off when the
    // key is absent.
    console.warn("[TraceBug] couldn't seed record options", err);
  }
}

// First install: open the BUNDLED welcome page (Phase 4 Step C). It used to
// open https://tracebug.dev/try.html directly, which made the very first thing
// a new user saw depend on their network — and on a page we cannot change in
// lockstep with the extension. welcome.html links out to that playground as
// its step 2 instead. Updates/reloads don't open a tab at all.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
  // Both reasons seed the same default now — see seedRecordOptsDefault.
  if (details.reason === "install" || details.reason === "update") {
    void seedRecordOptsDefault();
  }
  // Only an update has something new to report. A fresh install has just been
  // shown the welcome page; telling them what changed since a version they
  // never ran would be noise.
  if (details.reason === "update") {
    void flagWhatsNew();
  }
});

// An update is ready. Chrome holds it until the extension reloads or the
// browser restarts, so this is a decision, not a notification: reload now and
// get it over with, or wait because the user is mid-recording.
chrome.runtime.onUpdateAvailable.addListener(async () => {
  try { await _hydrated; } catch {}
  _updatePending = true;
  // persistState records the flag AND reloads if nothing is recording.
  persistState();
});

// Track which tabs have been injected (tab ID → true)
const injectedTabs = new Set();
// Tabs where the user has turned TraceBug ON. Unlike injectedTabs (current
// injection state, wiped on every navigation), this persists across page loads
// so the SDK + floating toolbar follow the user as they click around the site,
// instead of vanishing on every navigation. Cleared on tab close or when the
// user explicitly turns TraceBug off from the toolbar.
const activeTabs = new Set();

// ── Who is capturing, and where (Phase 1.11.1) ──────────────────────────────
// A capture's own state used to live ONLY in the host page's localStorage,
// which is per-origin. Moving to another site therefore killed the capture in
// silence: the HUD vanished with no Stop control, nothing said why, and coming
// back to the first site RESURRECTED it — the flag was still sitting in that
// origin's storage, so the page re-mounted a HUD for a capture that had been
// over for minutes.
//
// The worker is the one thing that spans origins, so it owns the answer now:
// tabId -> { origin, startedAt }. The page asks before it resumes anything
// (tb:capture:status) and is told plainly when the capture is gone.
const captureTabs = new Map();

// One pending "your capture ended" notice per tab, consumed by the first page
// that asks. The page that needs to show it is on the NEW origin and has no
// state of its own — the notice is the only way it can know.
const captureEndedNotices = new Map();

/**
 * The origin a message really came from.
 *
 * `sender.origin` and `sender.url` are filled in by Chrome itself: they need
 * no host permission and a page cannot forge them. The page's own claim is
 * only a fallback for a browser that supplies neither (Firefox does not always
 * set `sender.origin`), because treating "unknown" as cross-site would end
 * every capture there.
 *
 * What a lie could buy, if we trusted the page: a script could keep ITS OWN
 * tab's capture alive past a navigation, or end it early. Small — but this is
 * a few lines and removes the question.
 */
function senderOrigin(sender, claimed) {
  if (sender && typeof sender.origin === "string" && sender.origin && sender.origin !== "null") {
    return sender.origin;
  }
  if (sender && typeof sender.url === "string" && sender.url) {
    try { return new URL(sender.url).origin; } catch { /* opaque or malformed */ }
  }
  return typeof claimed === "string" ? claimed : "";
}

/** Host part of an origin, for a sentence. Never the path or the query. */
function originHost(origin) {
  try { return new URL(origin).host || origin; } catch { return String(origin || ""); }
}

/** End the capture this tab was running, and leave a note saying why. */
function endCapture(tabId, reason) {
  const live = captureTabs.get(tabId);
  if (!live) return false;
  captureTabs.delete(tabId);
  captureEndedNotices.set(tabId, { reason, host: originHost(live.origin), at: Date.now() });
  persistState();
  updateBadge(tabId);
  return true;
}

// The tab that's currently being screen-recorded by the offscreen document.
// Set when tb:rec:start succeeds; cleared on tb:rec:stop or auto-stop. We
// use this in chrome.tabs.onUpdated to re-inject the SDK after a page
// navigation so the user keeps seeing the recording HUD — without this,
// reloading or navigating mid-recording would silently strip the on-page
// UI while the offscreen document kept recording.
let _recordingTabId = null;

// ── Uninstall survey (Phase 4 Step E / Phase 5) ─────────────────────────────
// The one moment someone will tell you why they left. The URL carries the
// VERSION ONLY — no id, no install date, nothing that identifies a person or a
// machine — and the page itself says so in its fine print. Set once at worker
// start rather than on install, because a worker restart is cheap and an
// unset uninstall URL is silent data loss.
(function setUninstallSurvey() {
  try {
    if (!chrome.runtime.setUninstallURL) return;
    const v = chrome.runtime.getManifest().version || "";
    chrome.runtime.setUninstallURL("https://tracebug.dev/bye?v=" + encodeURIComponent(v));
  } catch (err) {
    console.warn("[TraceBug] couldn't set the uninstall URL", err);
  }
})();

// ── Deferred extension update (Phase 3) ─────────────────────────────────────
// chrome.runtime.onUpdateAvailable was not handled at all, which means an
// auto-update landing mid-recording killed the recording: the worker and the
// offscreen/recorder host are both torn down, and the video only exists in
// the recorder's memory until the stop finalizes it. So an update that
// arrives while recording is HELD, and applied once the recording has ended
// and been persisted.
let _updatePending = false;
// How long to wait after the recording ends before reloading. Not a guess
// about timing — it is so the in-flight stop response reaches the page and
// the auto-stop broadcast fans out. runtime.reload() tears the worker down
// synchronously, so reloading inside the stop handler would lose the reply
// that opens the ticket modal.
const UPDATE_RELOAD_DELAY_MS = 2000;
let _updateTimer = null;

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
        // A capture must survive a worker restart: MV3 kills the worker after
        // ~30s idle, and a capture the worker forgot would be reported as
        // "not running" to a page that is still capturing happily.
        captureTabs: [...captureTabs.entries()],
        captureEndedNotices: [...captureEndedNotices.entries()],
        recordingTabId: _recordingTabId,
        recorderWindowId: _recorderWindowId,
        updatePending: _updatePending,
        // Stamped so hydration can tell a still-pending update from one that
        // already landed — see the version check there.
        updatePendingFrom: _updatePending ? currentVersion() : null,
      },
    });
  } catch {}
  // Every path that ends a recording clears _recordingTabId and then calls
  // this — tb:rec:stop, the auto-stop fan-out, the recorder window closing,
  // the tab closing, and the toolbar's ✕. Hooking the single choke point
  // here is why a held update cannot be forgotten by one of them.
  maybeApplyUpdate();
}

/**
 * Apply a held update, but only once nothing is being recorded. A no-op when
 * no update is waiting, which is the normal case.
 */
function maybeApplyUpdate() {
  if (!_updatePending || _recordingTabId != null || _updateTimer != null) return;
  _updateTimer = setTimeout(() => {
    _updateTimer = null;
    // Re-check: a new recording may have started inside the delay, and
    // interrupting that would be the very bug this is here to prevent.
    if (!_updatePending || _recordingTabId != null) return;
    try { chrome.runtime.reload(); } catch {}
  }, UPDATE_RELOAD_DELAY_MS);
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
      if (Array.isArray(s.captureTabs)) s.captureTabs.forEach(([k, v]) => captureTabs.set(k, v));
      if (Array.isArray(s.captureEndedNotices)) s.captureEndedNotices.forEach(([k, v]) => captureEndedNotices.set(k, v));
      if (typeof s.recordingTabId === "number") _recordingTabId = s.recordingTabId;
      // Firefox event pages restart mid-recording too — without this, closing
      // the recorder popup after a restart never fans out the auto-stop, and
      // passive probes wrongly report "not recording".
      if (typeof s.recorderWindowId === "number") _recorderWindowId = s.recorderWindowId;
      // A held update has to survive a worker restart too: the worker
      // restarting is not the extension reloading, so without this the
      // update would wait for a second onUpdateAvailable that never comes.
      // ...but only if we are still the version that deferred it. Without
      // this check a flag that outlived the update it was waiting for would
      // reload the worker, find the flag again, and reload forever.
      if (s.updatePending === true && s.updatePendingFrom === currentVersion()) {
        _updatePending = true;
      }
    }
  } catch {}
  // A worker restart is not an extension reload, so a held update is still
  // held. Nothing else would notice until the next state mutation.
  maybeApplyUpdate();
})();

/** Our own version — the stamp that tells a pending update from a landed one. */
function currentVersion() {
  try { return chrome.runtime.getManifest().version || ""; } catch { return ""; }
}

// ── Badge ───────────────────────────────────────────────────────────────────
// Reflects whether the SDK is currently injected in this tab. Clears
// automatically on reload (onUpdated wipes injectedTabs first), so the badge
// always matches reality.

async function updateBadge(tabId /* , hostname */) {
  const loaded = injectedTabs.has(tabId);
  // A capture in progress outranks "loaded": the user needs to see at a
  // glance that something is actively being recorded, not just that the SDK
  // is present on the tab — "ON" looked identical whether or not a capture
  // was running, which is the bug this badge state fixes.
  const capturing = captureTabs.has(tabId);
  // Await both calls — without await the returned promises reject outside the
  // try/catch ("Uncaught (in promise) Error: No tab with id: …") whenever the
  // tab closed between the event firing and the badge update (prerendered
  // tabs, rapid tab churn).
  try {
    await chrome.action.setBadgeText({ tabId, text: capturing ? "REC" : loaded ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: capturing ? "#ef4444" : loaded ? "#22c55e" : "#6b7280",
    });
  } catch {}
}

// ── Injection, in two halves ────────────────────────────────────────────────
// Split because they fail and recover independently. The bridge (isolated
// world) dies with its extension instance; the page-world SDK does not — it
// is ordinary page JS and keeps running across an extension reload. Repairing
// an orphaned tab therefore means replacing the BRIDGE ONLY, or a second
// toolbar mounts on top of the first. See ensureAlive().

/** Isolated world: the message bridge. secret-migration.js first — content-script.js
 *  calls its planner. page-support.js before content-script.js — content-script.js's
 *  TB_PING handler reads TraceBugPageSupport.detectHostTraceBugUI(). */
async function injectBridge(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["secret-migration.js", "page-support.js", "content-script.js"],
  });
}

/**
 * The SDK's own CSS, injected via the privileged chrome.scripting API instead
 * of a page-level <style> tag — the only way to style the toolbar/HUD/modal
 * correctly on a page whose CSP has no discoverable nonce to borrow (the SDK
 * tries that first; it works when a nonce is visible in the DOM, and quietly
 * doesn't when a page sets nonces via JS property assignment instead of a
 * static HTML attribute — confirmed on a real Microsoft 365 page, not
 * assumed). insertCSS bypasses style-src entirely, the same way this file's
 * own executeScript calls already bypass script-src. Never fails loudly:
 * same reasoning as injectBridge's caller — a page the extension can't touch
 * at all is the normal "no host access" case, not a thing to surface here.
 */
async function injectStyles(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["tracebug-injected-styles.css"],
    });
  } catch (err) {
    console.warn("[TraceBug] couldn't insert extension stylesheet:", err?.message || err);
  }
}

/** MAIN world: the SDK bundle and its initializer.
 *
 *  tracebug-sdk-ext.js, NOT tracebug-sdk.js — a separate build of the same
 *  src/index.ts that publishes under window.__TraceBugExtension instead of
 *  window.TraceBug, so a host page that embeds its own copy of the npm SDK
 *  (tracebug-sdk.js, page mode) never collides with the extension's.
 *  See docs/launch/sdk-isolation-1.11.2.md. */
// Site Audit: axe-core is NOT in the injected SDK bundle (tsup stubs it, to keep
// every page injection small). It is packaged as vendor/axe.min.js — the
// library's own release file, copied unmodified by build-ext.mjs — and
// injected into the page's MAIN world only when the user runs an audit, so the
// page SDK finds it as `window.axe`. Same permissions as every other injection
// (activeTab + scripting); extension-file injection is not subject to page CSP.
// A failure is not fatal: the audit reports accessibility as "not run".
async function injectAxe(tabId) {
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => !!(window.axe && typeof window.axe.run === "function"),
    });
    if (probe && probe.result) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["vendor/axe.min.js"], world: "MAIN" });
  } catch (err) {
    console.warn("[TraceBug] Could not load the accessibility checker:", err && err.message);
  }
}

async function injectPageWorld(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["tracebug-sdk-ext.js"],
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
  void injectStyles(tabId);

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
    void injectStyles(tabId);

    // One interface per page (deliberately not supported — see
    // docs/launch/sdk-isolation-1.11.2.md): if this tab already has a host
    // page's own TraceBug UI, defer entirely rather than mounting a second
    // toolbar. A `pageSdk: true` answer here does NOT always mean a host
    // page's own instance, though injectedTabs having never seen this tab
    // before once made that assumption — injectedTabs/activeTabs are
    // in-memory (chrome.storage.session) and do NOT survive a service-worker
    // restart or the extension itself being reloaded/updated while the tab
    // stays open, so a tab we genuinely injected earlier can look "never
    // seen" here even though our own #tracebug-root is still mounted.
    // `extensionOwned` (content-script.js's TB_PING, backed by a sessionStorage
    // marker page-support.js names — page-scoped, so it survives exactly
    // what the worker's bookkeeping doesn't) is what tells the two apart.
    const pong = await pingTab(tabId);
    if (pong?.pageSdk && !pong.extensionOwned) {
      const S = globalThis.TraceBugPageSupport;
      throw new Error(S ? S.HOST_UI_ERROR : "tracebug-host-ui-present");
    }

    if (!pong?.pageSdk) await injectPageWorld(tabId);

    // Reflect "loaded" state in the toolbar badge for this tab.
    updateBadge(tabId);
  } catch (err) {
    injectedTabs.delete(tabId);
    // Injection never happened — don't keep the tab marked active, or every
    // future navigation retries and silently fails again.
    activeTabs.delete(tabId);
    // A capture tracked against this tab cannot possibly continue if the SDK
    // never mounted — most commonly because the destination page runs its own
    // TraceBug and we defer entirely (HOST_UI_ERROR). Nothing on a page like
    // that ever pings tb:capture:status, so without this the REC badge (and
    // captureTabs) would stay stuck forever: the only other way a capture
    // ends is the NEW page proactively reporting its origin, which a deferred
    // page can never do.
    endCapture(tabId, "inject-failed");
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

  // MUST come before the activeTabs check below. The worker can be woken BY
  // this very message (MV3 idle timeout), in which case _hydrated's own
  // chrome.storage.session read is still in flight and activeTabs is still
  // the empty Set it starts as — reading it one tick too early is exactly as
  // wrong as never reading it at all, and was still reproducible after the
  // activeTabs fix below for precisely that reason.
  try { await _hydrated; } catch {}

  // No persistent site state — every action injects the SDK fresh. Tracking
  // only starts when the user explicitly takes an action. Reloading the tab
  // unloads everything (the onUpdated listener clears injectedTabs).
  // A tab we believe is injected may be orphaned (extension updated while it
  // was open), so verify rather than trust the bookkeeping. Both paths throw
  // on failure, and the popup turns that into a sentence with a button.
  let wasAlreadyInjected = injectedTabs.has(tabId);
  // The inverse can also be wrong: injectedTabs is in-memory only and does
  // NOT survive a service-worker restart (MV3's idle timeout, an update), even
  // though the tab's content script and page-world SDK do — they are tied to
  // the page, not the worker. Trusting a false "never injected" here sent a
  // perfectly fine tab through injectSDK()'s host-UI check, which (correctly,
  // for a genuinely fresh tab) treats any TraceBug DOM it finds as a host
  // page's own instance — misdiagnosing our own surviving #tracebug-root as
  // "this site runs its own TraceBug" and refusing to capture on it at all.
  //
  // activeTabs DOES survive a restart (persisted), and is only ever set
  // after a successful injection of THIS tab — so if it has this tab, any
  // TraceBug DOM a ping finds now can only be our own surviving instance,
  // never a host's first-ever appearance. A ping alone can't make that call:
  // "alive + a TraceBug element exists" looks identical whether it's ours or
  // a real host UI, which is exactly the ambiguity activeTabs resolves.
  if (!wasAlreadyInjected && activeTabs.has(tabId) && (await pingTab(tabId))?.alive) {
    wasAlreadyInjected = true;
    injectedTabs.add(tabId);
  }
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
    // Phase 4: screen recording is opt-in, so a capture with no `video` flag is
    // the events-only one. Default false, never "undefined means yes".
    video: !!message.video,
    withMic: !!message.withMic,
    blurFirst: !!message.blurFirst,
    delaySec: message.delaySec || 0,
    surfaceMode: message.surfaceMode || undefined,
    // Screenshot-only flows: crop (region-select) vs the default instant
    // viewport shot. Meaningless for other action types, same as the fields
    // above already are for theirs.
    crop: !!message.crop,
    // Site Audit: which menu scan (plan §4a). Whitelisted again in the page.
    scan: typeof message.scan === "string" ? message.scan : undefined,
  };
  if (!wasAlreadyInjected) {
    await new Promise((r) => setTimeout(r, 250));
  }
  if (message.type === "TB_RUN_AUDIT") await injectAxe(tabId);
  // A capture now has an owner outside the page. The origin comes from the
  // page itself (tb:capture:started) because `tab.url` is normally undefined
  // without <all_urls> — see STATE.md — and a capture must not depend on a
  // permission the user declined.
  if (message.type === "TB_START_RECORDING") {
    captureEndedNotices.delete(tabId);
    captureTabs.set(tabId, { origin: "", startedAt: Date.now() });
    persistState();
    updateBadge(tabId);
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

  // Chrome can fire "complete" more than once for the SAME document — SPA
  // route changes, lazy-loaded resources, slow subresources — with no real
  // reload in between. Treating every one as a genuine navigation used to
  // unconditionally wipe injectedTabs and run injectSDK()'s FRESH-injection
  // path again, whose host-UI check assumes any TraceBug DOM it finds
  // belongs to a host page. On a spurious repeat that assumption is wrong:
  // it is OUR OWN surviving mount, now misread as "this site runs its own
  // TraceBug" — and because injectSDK()'s failure path also clears
  // activeTabs, the tab stays broken on every later click until a real
  // reload. A ping settles it for real: only an actual navigation kills the
  // content script.
  if (injectedTabs.has(tabId)) {
    const pong = await pingTab(tabId).catch(() => null);
    if (pong?.alive) {
      try { updateBadge(tabId); } catch {}
      return;
    }
  }

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
  // If the tab closing right now is the one actively being recorded, finalize
  // BEFORE clearing any state. Found by e2e: a Tab-mode recording's captured
  // video track does not reliably fire its own "ended" event when the source
  // tab closes, so offscreen.js's auto-stop watcher (wired for the Desktop-mode
  // "Stop sharing" case) never runs here — nothing was ever written to
  // chrome.storage.local, and the offscreen document stayed alive forever with
  // no way for the user to recover the recording. Explicitly stopping forces
  // the same finalize-and-persist path a normal tb:rec:stop takes
  // (stopAndBuildRecording() -> persistLastRecording()), independent of
  // whether the track ever reports itself ended. A Desktop-mode recording of
  // an unrelated surface is unaffected: it only acts when this tab IS the one
  // pinned by _recordingTabId.
  if (_recordingTabId === tabId) {
    try {
      const hostAbsent = HAS_OFFSCREEN ? !(await offscreenDocumentExists()) : _recorderWindowId == null;
      if (!hostAbsent) {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: "tb:rec:stop", _toOffscreen: true }, () => {
            void chrome.runtime.lastError; // no listener left to answer is fine — best-effort finalize
            resolve();
          });
        });
      }
    } catch {}
    closeRecorderHost();
  }
  injectedTabs.delete(tabId);
  activeTabs.delete(tabId);
  captureTabs.delete(tabId);
  captureEndedNotices.delete(tabId);
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

// ── Keyboard command (Phase 3) ──────────────────────────────────────────────
// Until now Ctrl/Cmd+Shift+B was ONLY a keydown handler inside the injected
// SDK, so it did nothing on a page TraceBug had never been started on — which
// is exactly what docs/quickstart.md told a brand-new user to press. This
// makes it a real browser command: it works on any tab, from a cold start.
//
// No new permission is involved. Invoking an extension command grants
// activeTab in both Chrome and Firefox, the same way clicking the toolbar
// icon does, so the injection below needs no host access.
const QUICK_CAPTURE_COMMAND = "tb-quick-capture";

/** The shortcut the browser actually bound, or "" if the user has none. */
async function boundQuickCaptureShortcut() {
  try {
    if (!chrome.commands || !chrome.commands.getAll) return "";
    const all = await new Promise((resolve) => {
      try {
        const maybe = chrome.commands.getAll((list) => {
          void chrome.runtime.lastError;
          resolve(list || []);
        });
        // Firefox returns a promise and ignores the callback.
        if (maybe && typeof maybe.then === "function") maybe.then((l) => resolve(l || []), () => resolve([]));
      } catch { resolve([]); }
    });
    const found = (all || []).find((c) => c && c.name === QUICK_CAPTURE_COMMAND);
    return (found && found.shortcut) || "";
  } catch {
    return "";
  }
}

/**
 * The command fired and something went wrong. A service worker has no popup
 * to explain itself in and TraceBug has no notifications permission, so the
 * toolbar button is the whole surface: a red "!" plus the mapped sentence as
 * its tooltip, for 8 seconds. Documented in docs/testing/restricted-pages.md
 * rather than left as a surprise.
 */
const ACTION_ERROR_MS = 8000;

async function flashActionError(tabId, err) {
  const S = globalThis.TraceBugPageSupport;
  const v = S ? S.explainInjectionError(err) : null;
  const title = v
    ? "TraceBug — " + v.title + "\n" + v.detail
    : "TraceBug — " + ((err && err.message) || String(err || "couldn't start here"));
  try {
    await chrome.action.setBadgeText({ tabId, text: "!" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
    await chrome.action.setTitle({ tabId, title });
  } catch {}
  setTimeout(() => {
    try { updateBadge(tabId); } catch {}
    try { chrome.action.setTitle({ tabId, title: "TraceBug — QA Bug Reporter" }); } catch {}
  }, ACTION_ERROR_MS);
}

/**
 * Alt+B has no popup to explain itself in, and the badge tooltip
 * (flashActionError) is easy to miss — it only shows on hover. For the host-UI
 * case specifically, show the same sentence directly on the page instead: a
 * small notice in its OWN shadow root (`mode: "open"` — nothing secret in it,
 * and "open" keeps it inspectable for debugging), with `all: initial` on the
 * host element so the page's own CSS cannot reach in and the notice's own
 * inline styles cannot leak out. Auto-removes itself; no cleanup needed from
 * this side if the page navigates first.
 */
async function showHostUiNotice(tabId, sentence) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text) => {
        var existing = document.getElementById("tracebug-host-ui-notice");
        if (existing) existing.remove();
        var host = document.createElement("div");
        host.id = "tracebug-host-ui-notice";
        host.style.all = "initial";
        host.style.position = "fixed";
        host.style.zIndex = "2147483647";
        host.style.bottom = "20px";
        host.style.right = "20px";
        var shadow = host.attachShadow({ mode: "open" });
        var style = document.createElement("style");
        style.textContent =
          ":host{all:initial}" +
          ".tb-notice{all:initial;display:block;font-family:-apple-system,BlinkMacSystemFont,sans-serif;" +
          "font-size:13px;line-height:1.4;color:#fff;background:#111113;border:1px solid rgba(255,255,255,0.15);" +
          "border-radius:10px;padding:12px 16px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,0.35)}";
        var notice = document.createElement("div");
        notice.className = "tb-notice";
        notice.textContent = text;
        shadow.appendChild(style);
        shadow.appendChild(notice);
        document.documentElement.appendChild(host);
        setTimeout(function () { try { host.remove(); } catch (e) {} }, 6000);
      },
      args: [sentence],
      world: "ISOLATED",
    });
  } catch {}
}

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== QUICK_CAPTURE_COMMAND) return;
    let tabId = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id ?? null;
      if (tabId == null) return;
      // Check the URL only when we can see it — without site access tab.url
      // is undefined, and that is not a reason to refuse (the command grants
      // activeTab, so the injection below will work).
      const S = globalThis.TraceBugPageSupport;
      if (S && tab?.url) {
        const verdict = S.classifyPage(tab.url, {});
        if (!verdict.ok) {
          await flashActionError(tabId, verdict.detail);
          return;
        }
      }
      // Same pipeline as the popup's Screenshot action, which is what the
      // in-page Ctrl+Shift+B does: fresh screenshot, then the Quick Bug modal
      // (tracebug-init.js, case "capture-now").
      await handleComboAction({ type: "TB_CAPTURE_NOW", tabId }, null);
    } catch (err) {
      if (tabId == null) return;
      const S = globalThis.TraceBugPageSupport;
      if (S && err?.message === S.HOST_UI_ERROR) {
        await showHostUiNotice(tabId, S.HOST_UI_TITLE + ". " + S.HOST_UI_DETAIL);
        return;
      }
      await flashActionError(tabId, err);
    }
  });
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // GET_STATE now returns whether the SDK is currently injected on the tab,
  // not whether the site is on a persistent allowlist (allowlist is gone).
  // The popup uses this to show a "loaded / not loaded" indicator.
  if (message.type === "GET_STATE") {
    const tabId = message.tabId || sender?.tab?.id;
    sendResponse({
      loaded: tabId ? injectedTabs.has(tabId) : false,
      // The popup uses this to avoid silently clobbering a capture already
      // running on this tab — starting a new one ends the active session.
      capturing: tabId ? captureTabs.has(tabId) : false,
    });
    return false;
  }

  // ── Is this tab's capture still running? (Phase 1.11.1) ─────────────────
  // Asked by the page before it resumes anything after a navigation, and by
  // every freshly-injected page so it can deliver a notice it has no other
  // way of knowing about.
  //
  // The page sends its CURRENT origin and the worker compares: same origin,
  // the capture is simply continuing across a reload or an SPA route change;
  // a different one means the user left the site the capture started on, and
  // the capture ends HERE, in the one place that can see both sides. Page
  // localStorage is per-origin and cannot.
  if (message.type === "tb:capture:status") {
    const tabId = sender?.tab?.id;
    if (tabId == null) { sendResponse({ running: false }); return false; }
    (async () => {
      try { await _hydrated; } catch {}
      const origin = senderOrigin(sender, message.data?.origin);
      const live = captureTabs.get(tabId);
      if (live && live.origin && origin && live.origin !== origin) {
        endCapture(tabId, "cross-site");
      }
      const still = captureTabs.get(tabId);
      // A notice is delivered once, to the first page that asks for it.
      const notice = captureEndedNotices.get(tabId) || null;
      if (notice) { captureEndedNotices.delete(tabId); persistState(); }
      sendResponse({ running: !!still, startedAt: still?.startedAt ?? null, ended: notice });
    })();
    return true;
  }

  // The page reports the origin its capture is running on. Sent right after a
  // capture arms — the worker cannot read it itself without <all_urls>.
  if (message.type === "tb:capture:started") {
    const tabId = sender?.tab?.id;
    if (tabId == null) { sendResponse({ ok: false }); return false; }
    (async () => {
      try { await _hydrated; } catch {}
      const origin = senderOrigin(sender, message.data?.origin);
      const startedAt = Number(message.data?.startedAt) || Date.now();
      captureEndedNotices.delete(tabId);
      captureTabs.set(tabId, { origin, startedAt });
      persistState();
      updateBadge(tabId);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // The user pressed Stop (or the capture finalized itself). Nothing is
  // running on this tab any more, and no notice is owed — the user watched it
  // end.
  if (message.type === "tb:capture:stopped") {
    const tabId = sender?.tab?.id;
    if (tabId == null) { sendResponse({ ok: false }); return false; }
    (async () => {
      try { await _hydrated; } catch {}
      captureTabs.delete(tabId);
      captureEndedNotices.delete(tabId);
      persistState();
      updateBadge(tabId);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ── Cross-site access, asked by the content script ──────────────────────
  // Phase 1 made <all_urls> optional, so "can TraceBug keep capturing after
  // the user navigates?" is now a real question with two answers. The page
  // world has no chrome.permissions, and NEITHER DOES A CONTENT SCRIPT — the
  // permissions API is not exposed there — so the worker answers it and the
  // content script publishes the boolean on <html data-tb-caps>.
  // Also carries the bound keyboard shortcut, for the same reason: neither the
  // page nor a content script can read chrome.commands, and no UI may hardcode
  // the key — the user can rebind or clear it. "" means nothing is bound.
  if (message.type === "TB_HOST_ACCESS") {
    // `connectable` (ADR 010): trackers this build can sign in to, so the
    // ticket offers "Send to GitHub" before anyone has connected — the Create
    // window is where Connect lives. Booleans only, like the rest of caps.
    Promise.all([hasHostAccess("<all_urls>"), boundQuickCaptureShortcut()])
      .then(([granted, shortcut]) => sendResponse({ granted, shortcut, connectable: connectableTrackers() }))
      .catch(() => sendResponse({ granted: false, shortcut: "", connectable: {} }));
    return true; // async
  }

  // The toolbar's Audit button (page world) asks for axe via the content script.
  // Injects only into the sender's own tab, which TraceBug is already running in.
  if (message.type === "TB_LOAD_AXE") {
    const tabId = sender?.tab?.id;
    if (!tabId) { sendResponse({ ok: false }); return true; }
    injectAxe(tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  // Site Audit gate (ADR 009): may this scan run? Always answers.
  if (message.type === "TB_AUDIT_PERMIT") {
    auditPermit().then(sendResponse).catch(() => sendResponse({ allowed: true, signedIn: false, remaining: null }));
    return true;
  }
  if (message.type === "TB_OPEN_SIGNIN") {
    try { chrome.tabs.create({ url: chrome.runtime.getURL("signin.html") }); } catch {}
    sendResponse({ ok: true });
    return true;
  }

  // A real result in the page (audit / ticket / export) — count it for the
  // popup's optional email ask. Kind only; nothing about the result.
  if (message.type === "TB_SUCCESS") {
    if (sender?.tab?.id) void recordSuccess(message.kind);
    sendResponse({ ok: true });
    return true;
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
  if (message.type === "TB_CAPTURE_NOW" || message.type === "TB_START_RECORDING" || message.type === "TB_VIEW_TICKETS" || message.type === "TB_INSPECT" || message.type === "TB_RUN_AUDIT" || message.type === "TB_STOP_RECORDING") {
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

  // Same destination, but straight to the mic card asking for the permission
  // immediately (options.js's "#mic" handling) — chrome.runtime.openOptionsPage()
  // above has no way to carry a hash fragment, so this needs tabs.create.
  if (message.type === "TB_OPEN_OPTIONS_MIC") {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html#mic") });
    } catch {}
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
    // ADR 010: an approved tracker send may carry the Create panel's choice
    // (tracker, repo/team, fields). A bad choice is answered to the WINDOW,
    // which stays open so the user can fix it — the request is not resolved.
    let choice = null;
    if (message.approved && message.choice != null) {
      const b = bridgeLib();
      const c = b ? b.validateChoice(message.choice) : { ok: false, error: "Reload the extension." };
      if (!c.ok) { sendResponse({ ok: false, error: c.error }); return false; }
      choice = c.choice;
    }
    resolvePending(message.id, !!message.approved, choice)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // ADR 010: Create from the panel. Unlike decide, the window stays open and
  // gets the outcome itself — "Created #N" with a link, or the error and a
  // Retry that keeps the user's choices. Accepted ONLY from confirm-send.html.
  if (message.type === "tb:confirm:create") {
    if (!isConfirmSender(sender)) { sendResponse({ ok: false, error: "Rejected." }); return false; }
    const b = bridgeLib();
    const c = b ? b.validateChoice(message.choice) : { ok: false, error: "Reload the extension." };
    if (!c.ok) { sendResponse({ ok: false, error: c.error }); return false; }
    createFromPanel(String(message.id || ""), c.choice)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: (err && err.message) || "Could not create the issue." }));
    return true;
  }

  // Step 3: the in-page Create panel (create-issue.html in a frame). Every
  // panel message is checked against the request's tab, its bound frame and
  // its one-time nonce (panelRequestFor).
  if (typeof message.type === "string" && message.type.indexOf("tb:panel:") === 0) {
    handlePanelMessage(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: (err && err.message) || "Request failed." }));
    return true;
  }

  // ADR 010 §4: the Create panel and the options page. Extension pages only.
  if (typeof message.type === "string" && message.type.indexOf("tb:tracker:") === 0) {
    handleTrackerUi(message, sender)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: (err && err.message) || "Request failed." }));
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
  // Desktop mode (the default) always routes to getDisplayMedia so the user
  // gets the browser's native "Choose what to share" picker. Tab mode
  // (surfaceMode: "tab", optional `tabCapture` permission) is resolved below —
  // only background.js has a real tab to target chrome.tabCapture.getMediaStreamId
  // at; an offscreen document has none. See docs/audit/capture-flow-1.11.3.md.
  const extraData = {};
  if (message.type === "tb:rec:start" && message.data?.surfaceMode === "auto") {
    message = { ...message, data: { ...message.data, surfaceMode: await preferredSurfaceMode() } };
  }
  if (
    message.type === "tb:rec:start" &&
    message.data?.surfaceMode === "tab" &&
    sender?.tab?.id != null
  ) {
    const tab = await resolveTabCaptureStreamId(sender.tab.id);
    if (tab.streamId) {
      extraData.tabCaptureStreamId = tab.streamId;
    } else {
      // Permission not granted, Chrome refused this page, or no tabCapture API
      // (Firefox) — fall back to the picker rather than failing the capture
      // outright. The page says which via `tabModeReason` on the response.
      message = { ...message, data: { ...message.data, surfaceMode: "desktop" } };
      extraData.tabModeFallback = true;
      extraData.tabModeReason = tab.reason;
    }
  }

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
  if (extraData.tabModeFallback && result && typeof result === "object") {
    result.tabModeFallback = true;
    result.tabModeReason = extraData.tabModeReason;
  }

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
const ATTACH_PREFIX = "tb_send_attach_";
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
  if (req && req.attachments && req.attachments.length) await localRemove([ATTACH_PREFIX + id]);
  return req;
}

/** The request's files, decoded for the tracker. [] when there are none. */
async function loadAttachments(id) {
  const got = await localGet([ATTACH_PREFIX + id], {});
  const files = got[ATTACH_PREFIX + id];
  if (!Array.isArray(files)) return [];
  return files.map((f) => {
    const bin = atob(f.data);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { name: f.name, type: f.type, data };
  });
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
  // Files to attach (Phase 13 step 4) are kept out of session storage (10 MB
  // quota) and out of the request record: they wait in local storage under
  // the request id, and dropPending deletes them however the request ends.
  let attachFiles = [];
  if (payload && Array.isArray(payload.attachments)) {
    if (v.kind === "tracker") attachFiles = payload.attachments;
    payload = Object.assign({}, payload);
    delete payload.attachments;
  }

  const cfgAll = await localGet([INT_KEY, AI_CFG_KEY, LLM_SITES_KEY, TRACKER_AUTH_KEY], {});

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
  if (!hasProviderConfig(v.target, integrations, cfgAll[TRACKER_AUTH_KEY]) && !connectableTrackers()[v.target]) {
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
    // Our content script (top frame) can show the in-page Create panel.
    panel: message.panel === true && sender.frameId === 0 && b.isIssueTracker(v.target),
    files: attachFiles,
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

/**
 * Can this tracker send at all? Since ADR 010 the repo/team is picked in the
 * confirm window, so a credential is enough: a pasted token, or an OAuth
 * sign-in (even one that needs reconnecting — the window says so).
 */
function hasProviderConfig(target, integrations, authMap) {
  const i = integrations || {};
  const a = authMap || {};
  if (target === "github") return !!((i.github && i.github.token) || a.github);
  if (target === "linear") return !!((i.linear && i.linear.apiKey) || a.linear);
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
  // An in-page panel still open for this tab is replaced by the new send
  // (the ticket asked again) — unless it is creating right now.
  for (const old of Object.keys(all)) {
    const r = all[old];
    if (!r || r.tabId !== req.tabId || r.mode !== "panel" || isInFlight(r)) continue;
    delete all[old];
    tellTab(r.tabId, { type: "tb:provider:result", id: old, cancelled: true, error: "Send cancelled." });
  }
  const room = b.canQueue(all, req.tabId, now);
  if (!room.ok) {
    await sessionSet({ [PENDING_KEY]: all });
    return ackError(room.error);
  }

  // A request whose window is gone (closed while this worker slept through
  // onRemoved) must not block the next send from that tab.
  for (const stale of Object.keys(all)) {
    const r = all[stale];
    if (!r || r.windowId == null || r.expiresAt != null) continue;
    const alive = await chrome.windows.get(r.windowId).then(() => true, () => false);
    if (alive || isInFlight(r)) continue;
    delete all[stale];
    tellTab(r.tabId, { type: "tb:provider:result", id: stale, cancelled: true, error: "Send cancelled." });
  }
  // A tracker send has no deadline: the window holds the user's choices and
  // stays until they Create or close it (closing cancels; so does closing the
  // tab). An AI analysis keeps its short timeout.
  const issueSend = req.kind === "tracker" && b.isIssueTracker(req.target);
  const expiresAt = issueSend ? null : now + b.CONFIRM_TIMEOUT_MS;
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
    // Random, made here, reused on every retry: nothing from the ticket.
    sendId: issueSend ? crypto.randomUUID() : undefined,
    // In-page panel (Step 3) or the extension window. A panel request is
    // bound to one frame by a one-time nonce the content script hands to it.
    mode: req.panel && issueSend ? "panel" : "window",
    nonce: req.panel && issueSend ? randomNonce() : undefined,
    panelFrameId: null,
    // Names, types and sizes only; the bytes wait under ATTACH_PREFIX + id.
    attachments: (req.files || []).map((f) => ({ name: f.name, type: f.type, size: Math.floor(f.data.length * 3 / 4) })),
  };
  all[req.id] = record;
  await sessionSet({ [PENDING_KEY]: all });
  if (req.files && req.files.length) await localSet({ [ATTACH_PREFIX + req.id]: req.files });

  // The timeout runs on chrome.alarms, not setTimeout: a terminated worker
  // takes its timers with it, and a confirmation that silently never expires
  // would leave the page's promise hanging forever.
  if (expiresAt != null) { try { chrome.alarms.create(CONFIRM_ALARM + req.id, { when: expiresAt }); } catch {} }

  // The content script mounts the panel; nothing opens here. If the frame
  // can't load, it asks for the window instead (tb:panel:fallback).
  if (record.mode === "panel") return { pending: true, id: req.id, panel: { nonce: record.nonce } };
  return openConfirmWindow(record);
}

function randomNonce() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Open the extension-owned confirm window for a queued request. */
async function openConfirmWindow(record) {
  const req = record;
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
    const again = await sessionGet(PENDING_KEY, {});
    if (again[req.id]) {
      again[req.id] = Object.assign(again[req.id], { windowId: (win && win.id) != null ? win.id : null, mode: "window", nonce: undefined });
      await sessionSet({ [PENDING_KEY]: again });
    }
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
    target: req.target,
    providerLabel: req.providerLabel,
    destination: req.destination,
    title: (req.payload && req.payload.title) || "",
    body: bodyTextOf(req.payload),
    warnings: req.warnings || [],
    shortened: !!req.shortened,
    expiresAt: req.expiresAt,
    attachments: (req.attachments || []).map((a) => ({ name: a.name, type: a.type, size: a.size })),
  };
}

async function resolvePending(id, approved, choice) {
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
  // The Create panel may have switched trackers; both carry title + body.
  if (choice && req.kind === "tracker" && bridgeLib().isIssueTracker(req.target)) {
    req.choice = choice;
    req.target = choice.tracker;
    req.providerLabel = TB_PROVIDER_LABELS[choice.tracker] || choice.tracker;
  }
  await runAndReport(id, req.tabId, req);
}

// A create still running after this long is taken to have died with the
// worker — and, since it may have landed, the next try checks first.
const IN_FLIGHT_STALE_MS = 90 * 1000;
// Per request to the tracker. A hung create is an unclear failure, not a hang.
const CREATE_TIMEOUT_MS = 30 * 1000;

function isInFlight(req) {
  return !!(req && req.inFlightAt && Date.now() - req.inFlightAt < IN_FLIGHT_STALE_MS);
}

// Creates running in this worker, keyed by request id and by ticket. Checked
// and set synchronously, before any await: two messages arriving together
// would otherwise both read "not in flight" from storage and both file.
const creating = new Set();

/** One ticket = one tab's report with this title and body. */
function ticketKey(req) {
  const text = String(req.tabId) + "\n" + ((req.payload && req.payload.title) || "") + "\n" + ((req.payload && req.payload.body) || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return "ticket:" + (h >>> 0).toString(16);
}

/**
 * Create from the panel. The request stays pending until it succeeds, so a
 * failure leaves everything as it was: the page's ticket untouched, the window
 * open with the user's choices, Retry available. After an unclear failure
 * (network, timeout) the retry looks for the hidden marker first — GitHub has
 * no idempotency key, and a create that landed must not be filed twice.
 */
async function createFromPanel(id, choice) {
  const api = providerApi();
  if (!api) return { ok: false, error: "TraceBug could not load its provider code. Reload the extension." };
  const busy = { ok: false, error: "Already creating this issue…", busy: true };
  if (creating.has(id)) return busy;
  creating.add(id);
  let key = "";
  try {
    const all = await sessionGet(PENDING_KEY, {});
    const req = all[id];
    if (!req || req.kind !== "tracker") {
      return { ok: false, error: "This request is no longer waiting. Send it again from the ticket." };
    }
    key = ticketKey(req);
    if (creating.has(key)) { key = ""; return busy; }
    creating.add(key);
    // A create that died with an earlier worker: treat it as unclear.
    if (isInFlight(req)) return busy;
    if (req.inFlightAt) req.unclear = true;
    req.inFlightAt = Date.now();
    // What the first attempt aimed at, for the retry's look-up.
    if (!req.firstAttemptAt) {
      req.firstAttemptAt = req.inFlightAt;
      req.firstTarget = { tracker: choice.tracker, container: choice.container };
    }
    await sessionSet({ [PENDING_KEY]: all });
    return await runPanelCreate(api, id, req, choice);
  } finally {
    creating.delete(id);
    if (key) creating.delete(key);
  }
}

async function runPanelCreate(api, id, req, choice) {
  const run = Object.assign({}, req, {
    choice,
    target: choice.tracker,
    providerLabel: TB_PROVIDER_LABELS[choice.tracker] || choice.tracker,
    fromPanel: true,
  });
  try {
    const result = await callTrackerFromWorker(api, run);
    result.shown = true;
    if (req.mode === "panel") result.panel = true;
    const was = await dropPending(id);
    try { chrome.alarms.clear(CONFIRM_ALARM + id); } catch {}
    if (was) tellTab(was.tabId, { type: "tb:provider:result", id, ok: true, result });
    return {
      ok: true,
      result: {
        url: result.url || "", ref: result.ref || "", label: result.label || run.providerLabel, found: !!result.found,
        attached: typeof result.attached === "number" ? result.attached : 0,
        notAttached: Array.isArray(result.notAttached) ? result.notAttached.slice(0, 10) : [],
      },
    };
  } catch (err) {
    const unclear = api.isUnclearFailure(err);
    const again = await sessionGet(PENDING_KEY, {});
    if (again[id]) {
      again[id].inFlightAt = 0;
      if (unclear) again[id].unclear = true;
      await sessionSet({ [PENDING_KEY]: again });
    }
    return {
      ok: false,
      error: api.mapProviderError(err, run.providerLabel),
      reconnect: !!(err && err.name === "ReconnectNeededError"),
      unclear,
    };
  }
}

// ── The in-page Create panel (Step 3) ──────────────────────────────────────
// create-issue.html is web-accessible (use_dynamic_url) so the content script
// can frame it in the ticket. Any page could frame it too, so nothing is
// trusted by URL alone:
//   - the frame must be OUR extension page (sender.id, chrome-extension: URL,
//     path /create-issue.html) in a subframe of the request's tab;
//   - it must present the request's one-time nonce, which only our content
//     script has (it got it in the ack and posts it into its own frame);
//   - the first frame to do so is bound by frameId, and only that frame may
//     read the request, list repos or create.
// The page never gets the nonce, a token, repo names or field values.

function isPanelPage(sender) {
  if (!sender || sender.id !== chrome.runtime.id || !sender.tab || typeof sender.url !== "string") return false;
  if (!(sender.frameId > 0)) return false;
  try {
    const u = new URL(sender.url);
    return u.protocol === "chrome-extension:" && u.pathname === "/create-issue.html";
  } catch { return false; }
}

/** The panel request this sender is bound to (tracker UI verbs), or null. */
async function boundPanelFor(sender) {
  if (!isPanelPage(sender)) return null;
  const all = await sessionGet(PENDING_KEY, {});
  const id = Object.keys(all).find((k) => {
    const r = all[k];
    return r && r.mode === "panel" && r.tabId === sender.tab.id && r.panelFrameId === sender.frameId;
  });
  return id ? all[id] : null;
}

/** Validate a panel message → the request, or an error. `bind` binds a first hello. */
async function panelRequestFor(message, sender, bind) {
  if (!isPanelPage(sender)) return { error: "Rejected." };
  const id = typeof message.id === "string" ? message.id : "";
  const nonce = typeof message.nonce === "string" ? message.nonce : "";
  const all = await sessionGet(PENDING_KEY, {});
  const req = all[id];
  if (!req || req.mode !== "panel" || !req.nonce || req.tabId !== sender.tab.id || nonce !== req.nonce) {
    return { error: "This request is no longer waiting. Send it again from the ticket." };
  }
  if (req.panelFrameId == null) {
    if (!bind) return { error: "Rejected." };
    req.panelFrameId = sender.frameId;
    await sessionSet({ [PENDING_KEY]: all });
  } else if (req.panelFrameId !== sender.frameId) {
    return { error: "Rejected." };
  }
  return { req, id };
}

async function handlePanelMessage(message, sender) {
  switch (message.type) {
    case "tb:panel:hello": {
      const got = await panelRequestFor(message, sender, true);
      if (got.error) return { ok: false, error: got.error };
      // The frame's parent must be the page that asked.
      if (message.parentOrigin !== got.req.origin) return { ok: false, error: "Rejected." };
      return { ok: true, request: confirmViewOf(got.req) };
    }
    case "tb:panel:create": {
      const got = await panelRequestFor(message, sender, false);
      if (got.error) return { ok: false, error: got.error };
      const b = bridgeLib();
      const c = b ? b.validateChoice(message.choice) : { ok: false, error: "Reload the extension." };
      if (!c.ok) return { ok: false, error: c.error };
      return createFromPanel(got.id, c.choice);
    }
    case "tb:panel:cancel": {
      const got = await panelRequestFor(message, sender, false);
      if (got.error) return { ok: false, error: got.error };
      if (isInFlight(got.req)) return { ok: false, error: "Already creating this issue…" };
      await resolvePending(got.id, false, null);
      return { ok: true };
    }
    case "tb:panel:fallback": {
      // From OUR content script (top frame of the request's tab, page URL):
      // the frame didn't come up — use the extension window instead.
      if (!sender || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return { ok: false, error: "Rejected." };
      const all = await sessionGet(PENDING_KEY, {});
      const req = all[message.id];
      if (!req || req.mode !== "panel" || req.tabId !== sender.tab.id || message.nonce !== req.nonce || req.panelFrameId != null) {
        return { ok: false, error: "Rejected." };
      }
      const res = await openConfirmWindow(req);
      return res && res.pending ? { ok: true } : { ok: false, error: (res && res.error) || "Could not open the window." };
    }
    default:
      return { ok: false, error: "Unsupported request type." };
  }
}

// The panel frame holds a port open for its lifetime. When it goes — ticket
// closed, page navigated or reloaded, tab closed — so does the request,
// unless a create is running (that one finishes and reports to the page).
if (chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || typeof port.name !== "string" || port.name.indexOf("tb-panel:") !== 0) return;
    const id = port.name.slice("tb-panel:".length);
    const sender = port.sender;
    boundPanelFor(sender).then((req) => {
      if (!req || req.id !== id) { try { port.disconnect(); } catch {} return; }
      port.onDisconnect.addListener(async () => {
        const all = await sessionGet(PENDING_KEY, {});
        const r = all[id];
        if (!r || r.mode !== "panel" || r.panelFrameId !== sender.frameId || isInFlight(r)) return;
        await resolvePending(id, false, null);
      });
    }).catch(() => {});
  });
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

/**
 * Resolve a stream id for Tab mode's no-picker recording.
 *
 * Resolves `{ streamId }`, or `{ reason }` when it can't be done:
 *   "permission"  — this build doesn't hold `tabCapture`.
 *   "not-allowed" — Chrome refused this tab. Its own error covers both pages
 *                   it never captures and a tab TraceBug wasn't opened on
 *                   ("Extension has not been invoked for the current page").
 *   "unavailable" — no chrome.tabCapture at all (Firefox), or it never bound.
 * All are ordinary fallback cases, not errors — the caller falls back to the
 * getDisplayMedia picker and the page says which reason applied.
 */
/**
 * The surface a recording started from the in-page toolbar ("auto") should
 * use: the popup's stored Tab/Desktop choice, by the same rule as popup.js's
 * resolveSurface — Tab unless the user picked Desktop, and Desktop wherever
 * the build doesn't declare `tabCapture` (Firefox). Before this, the toolbar
 * always asked for Desktop, so every toolbar recording opened the share
 * picker even with Tab mode set up.
 */
async function preferredSurfaceMode() {
  const tabDeclared = (chrome.runtime.getManifest().permissions || []).includes("tabCapture");
  if (!tabDeclared) return "desktop";
  let stored = {};
  try { stored = (await localGet([RECORD_OPTS_KEY], {}))[RECORD_OPTS_KEY] || {}; } catch {}
  const chosen = stored.surfaceSetBy === "user" || stored.surfaceMode === "tab";
  if (!chosen) return "tab";
  return stored.surfaceMode === "tab" ? "tab" : "desktop";
}

async function resolveTabCaptureStreamId(tabId) {
  const granted = await new Promise((resolve) => {
    try {
      chrome.permissions.contains({ permissions: ["tabCapture"] }, (g) => {
        void chrome.runtime.lastError;
        resolve(!!g);
      });
    } catch { resolve(false); }
  });
  if (!granted) return { reason: "permission" };
  if (!(chrome.tabCapture && chrome.tabCapture.getMediaStreamId)) return { reason: "unavailable" };
  return new Promise((resolve) => {
    try {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        const err = chrome.runtime.lastError;
        if (err) console.warn("[TraceBug] tab capture refused:", err.message);
        resolve(streamId ? { streamId } : { reason: "not-allowed" });
      });
    } catch { resolve({ reason: "not-allowed" }); }
  });
}

async function callTrackerFromWorker(api, req) {
  const got = await localGet([INT_KEY], {});
  const cfg = got[INT_KEY] || {};
  const adapter = api.trackerAdapter(req.target);
  if (adapter) return createViaAdapter(api, adapter, req, cfg);
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

// ════════════════════════════════════════════════════════════════════════════
// Tracker connect + the Create panel — ADR 010
// ════════════════════════════════════════════════════════════════════════════
//
// Credentials: OAuth sign-ins in chrome.storage.local `tb_tracker_auth_v1`,
// pasted tokens in `tb_integrations_v1` (unchanged, still honoured). Only this
// worker reads either. The confirm window and the options page get display
// data — account name, repo/team names, labels — and never a token. The page
// under test gets nothing from here at all: every tb:tracker:* message must
// come from an extension page (provider-bridge.js validateExtensionPageSender).

const TRACKER_AUTH_KEY = "tb_tracker_auth_v1";
const TRACKER_PREFS_KEY = "tb_tracker_prefs_v1";
// Device-flow state between polls. Session storage: it must survive a worker
// restart mid-sign-in, and must not outlive the browser session.
const DEVICE_FLOW_KEY = "tb_device_flow_v1";

const trackerAuthStore = {
  read: async () => (await localGet([TRACKER_AUTH_KEY], {}))[TRACKER_AUTH_KEY] || {},
  write: (map) => localSet({ [TRACKER_AUTH_KEY]: map }),
};

/**
 * Does this build offer Connect at all? Feature detection, not a user-agent
 * check: only a manifest that declares `identity` as optional (the Chrome
 * build — build-ext.mjs strips it for Firefox, where it cannot be optional)
 * gets the sign-in UI. Everywhere else the pasted-token paths stay as they are.
 */
function oauthUiSupported() {
  try { return (chrome.runtime.getManifest().optional_permissions || []).includes("identity"); }
  catch { return false; }
}

/** { github: true, … } for each tracker whose Connect this build can offer. */
function connectableTrackers() {
  const api = providerApi();
  const out = {};
  if (!api || typeof api.trackerAdapter !== "function" || !oauthUiSupported()) return out;
  for (const id of api.ISSUE_TRACKERS) {
    const a = api.trackerAdapter(id);
    if (a && a.connect()) out[id] = true;
  }
  return out;
}

function authContext(adapter, integrations) {
  const c = adapter.connect();
  return { store: trackerAuthStore, tracker: adapter.id, label: adapter.label, integrations, spec: c ? c.spec : null };
}

async function hasAllHosts(patterns) {
  for (const p of patterns || []) {
    if (!(await hasHostAccess(p))) return false;
  }
  return true;
}

function hostOfPattern(pattern) {
  return String(pattern || "").replace(/^https?:\/\//, "").replace(/\/\*$/, "");
}

/** Labels typed in settings before ADR 010 — the default field values. */
function legacyFields(tracker, integrations) {
  const i = integrations || {};
  if (tracker === "github" && i.github && Array.isArray(i.github.labels) && i.github.labels.length) {
    return { labels: i.github.labels.slice() };
  }
  return {};
}

async function rememberChoice(tracker, container, fields) {
  const got = await localGet([TRACKER_PREFS_KEY], {});
  const prefs = got[TRACKER_PREFS_KEY] || {};
  prefs[tracker] = { container, fields: fields || {}, at: Date.now() };
  await localSet({ [TRACKER_PREFS_KEY]: prefs });
}

async function createViaAdapter(api, adapter, req, integrations) {
  if (!(await hasAllHosts(adapter.apiHosts))) throw new Error(noAccessMessage(hostOfPattern(adapter.apiHosts[0])));
  const choice = req.choice || null;
  const container = (choice && choice.container) || api.legacyContainer(adapter.id, integrations);
  if (!container) throw new Error("Pick a " + adapter.containerNoun.toLowerCase() + " to file the issue in.");
  const fields = choice ? choice.fields : legacyFields(adapter.id, integrations);
  // Random per send (queueConfirmation), reused on every retry. GitHub: an
  // invisible comment in the body; Linear: the issue id.
  const sendId = req.sendId;
  const result = await api.withTrackerAuth(authContext(adapter, integrations), async (auth) => {
    // After an unclear failure, look where the FIRST attempt went before
    // filing again — the user may have changed the repo since.
    const first = req.firstTarget && req.firstTarget.tracker === adapter.id ? req.firstTarget.container : container;
    if (req.unclear && sendId) {
      const found = await api.findFiledIssueWithRetry(adapter, auth, first, sendId,
        req.firstAttemptAt || Date.now(), AbortSignal.timeout(CREATE_TIMEOUT_MS));
      if (found) { found.found = true; return found; }
    }
    const attachments = req.attachments && req.attachments.length ? await loadAttachments(req.id) : [];
    return adapter.createIssue(auth, container, fields,
      { title: req.payload.title, body: req.payload.body, sendId, attachments },
      // Uploads ride on the same request: allow them their own time.
      AbortSignal.timeout(CREATE_TIMEOUT_MS + (attachments.length ? 90 * 1000 : 0)));
  });
  if (choice) await rememberChoice(adapter.id, container, fields);
  result.label = adapter.label;
  // The panel shows the result with its link; nothing opens unless the user
  // clicks it. Only the older decide path (no panel) still opens the issue
  // here: a page's window.open after an async round trip is a blocked popup.
  // Only an https URL on the tracker's own host — the URL came over the network.
  if (!req.fromPanel && api.isTrustedIssueUrl(adapter.id, result.url)) {
    try { await chrome.tabs.create({ url: result.url, active: true }); result.opened = true; } catch {}
  }
  return result;
}

async function trackerStatusList(api) {
  const got = await localGet([INT_KEY, TRACKER_AUTH_KEY, TRACKER_PREFS_KEY], {});
  const integrations = got[INT_KEY] || {};
  const map = got[TRACKER_AUTH_KEY] || {};
  const prefs = got[TRACKER_PREFS_KEY] || {};
  const ui = oauthUiSupported();
  return api.ISSUE_TRACKERS.map((id) => {
    const a = api.trackerAdapter(id);
    const c = ui ? a.connect() : null;
    const p = prefs[id];
    return Object.assign({
      id,
      label: a.label,
      containerNoun: a.containerNoun,
      canConnect: !!c,
      connectFlow: c ? c.flow : null,
      // What Connect must request. The window calls permissions.request with
      // this from the click handler itself — an await first would lose the
      // user gesture the browser requires.
      connectPermissions: c ? {
        permissions: c.flow === "pkce" ? ["identity"] : [],
        // Linear: its upload host too, so attachments work from the first issue.
        origins: c.hosts.concat(id === "linear" ? (api.LINEAR_UPLOAD_ORIGINS || []).map((o) => o + "/*") : []),
      } : null,
      apiHosts: a.apiHosts,
      // "Add repositories" link — only meaningful once signed in through the app.
      manageUrl: map[id] && !map[id].needsReconnect ? (a.manageUrl || null) : null,
      last: p
        ? { container: p.container || "", fields: p.fields || {} }
        : { container: api.legacyContainer(id, integrations), fields: legacyFields(id, integrations) },
    }, api.describeAuth(id, map, integrations));
  });
}

async function finishConnect(api, adapter, tokens) {
  let account = "";
  try { account = await adapter.whoAmI({ via: "oauth", token: tokens.accessToken }); } catch {}
  await api.saveOAuth(trackerAuthStore, adapter.id, tokens, account || undefined, Date.now());
  return { connected: true, account };
}

async function connectTracker(api, adapter, sender) {
  if (!oauthUiSupported()) return { error: "Sign-in isn't available in this browser yet. Use a token in TraceBug settings." };
  const c = adapter.connect();
  if (!c) return { error: adapter.label + " sign-in isn't set up in this build. Use a token in TraceBug settings." };
  if (!(await hasAllHosts(c.hosts))) return { needsAccess: c.hosts };

  if (c.flow === "device") {
    const code = await api.requestDeviceCode(c.spec, Date.now());
    const state = {
      deviceCode: code.deviceCode, interval: code.interval, expiresAt: code.expiresAt,
      verificationUri: code.verificationUri,
      // Where to bring the user back to: the window/tab that clicked Connect.
      returnWindowId: sender && sender.tab ? sender.tab.windowId : null,
      returnTabId: sender && sender.tab ? sender.tab.id : null,
    };
    // A new code replaces any earlier one: close the page that one opened.
    const prev = (await sessionGet(DEVICE_FLOW_KEY, {}))[adapter.id];
    if (prev && !prev.done) closeDevicePage(prev, false);
    // GitHub's page goes in a small popup window of its own (a normal tab if
    // that fails), closed by us once the token arrives.
    const opened = await openDevicePage(code.verificationUri);
    Object.assign(state, opened.ids);
    const all = await sessionGet(DEVICE_FLOW_KEY, {});
    all[adapter.id] = state;
    await sessionSet({ [DEVICE_FLOW_KEY]: all });
    // The user code is meant to be read by the user. The device code is the
    // secret half, and stays in this worker.
    return { flow: "device", userCode: code.userCode, verificationUri: code.verificationUri,
      interval: code.interval, expiresAt: code.expiresAt, opened: opened.how };
  }

  if (!(chrome.identity && chrome.identity.launchWebAuthFlow && chrome.identity.getRedirectURL)) {
    return { error: "TraceBug needs permission to open the " + adapter.label + " sign-in window. Click Connect again and allow it." };
  }
  const pair = await api.createPkcePair();
  const state = api.randomToken(16);
  const redirectUri = chrome.identity.getRedirectURL();
  const url = api.buildAuthorizeUrl(c.spec, { redirectUri, state, challenge: pair.challenge });
  let back;
  try {
    back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  } catch {
    return { error: adapter.label + " sign-in was closed before it finished." };
  }
  const code = api.parseRedirect(back, state, adapter.label);
  const tokens = await api.exchangeCode(c.spec, { code, verifier: pair.verifier, redirectUri }, Date.now());
  return finishConnect(api, adapter, tokens);
}

// ── The device-flow sign-in popup ──────────────────────────────────────────
// GitHub's device page opens in a small popup window (a normal tab if the
// window can't be created). The ONLY success signal is the token arriving on
// a poll: the popup's URL is never read. On the token, the worker closes the
// popup if it is still open and brings back the TraceBug page that clicked
// Connect. Closing the popup early changes nothing but a flag — polling goes
// on until the code expires, and the page offers "Reopen GitHub".

const DEVICE_POPUP = { type: "popup", width: 520, height: 760 };
// A finished sign-in stays readable this long, so a second page that was also
// polling (the Create window and settings, say) still hears "connected".
const DEVICE_DONE_TTL_MS = 2 * 60 * 1000;
// Device polls in flight, per tracker: a device code yields its token once.
const devicePolling = new Set();

/** Open GitHub's device page: a popup window, else a tab. → {how, ids}. */
async function openDevicePage(url) {
  const b = bridgeLib();
  if (!b || !b.isDeviceVerificationUrl(url)) return { how: null, ids: {} };
  try {
    const win = await chrome.windows.create(Object.assign({ url, focused: true }, DEVICE_POPUP));
    if (win && win.id != null) return { how: "popup", ids: { popupWindowId: win.id, popupTabId: null, popupClosed: false } };
  } catch {}
  try {
    const tab = await chrome.tabs.create({ url, active: true });
    if (tab && tab.id != null) return { how: "tab", ids: { popupWindowId: null, popupTabId: tab.id, popupClosed: false } };
  } catch {}
  return { how: null, ids: {} };
}

/** "Reopen GitHub": focus the popup if it is still there, or open it again. */
async function showDevicePopup(tracker) {
  const all = await sessionGet(DEVICE_FLOW_KEY, {});
  const st = all[tracker];
  if (!st || st.done) return { error: "There is no sign-in in progress. Click Connect again." };
  if (st.popupWindowId != null && !st.popupClosed) {
    try { await chrome.windows.update(st.popupWindowId, { focused: true }); return { ok: true, opened: "popup" }; } catch {}
  }
  const opened = await openDevicePage(st.verificationUri);
  if (!opened.how) return { error: "Could not open GitHub's sign-in page." };
  const again = await sessionGet(DEVICE_FLOW_KEY, {});
  if (again[tracker]) {
    again[tracker] = Object.assign(again[tracker], opened.ids);
    await sessionSet({ [DEVICE_FLOW_KEY]: again });
  }
  return { ok: true, opened: opened.how };
}

/** Close what we opened on GitHub (if still open) and return to TraceBug. */
function closeDevicePage(st, refocus) {
  if (st.popupWindowId != null && !st.popupClosed) {
    try { chrome.windows.remove(st.popupWindowId, () => void chrome.runtime.lastError); } catch {}
  }
  if (st.popupTabId != null) {
    try { chrome.tabs.remove(st.popupTabId, () => void chrome.runtime.lastError); } catch {}
  }
  if (!refocus) return;
  if (st.returnWindowId != null) {
    try { chrome.windows.update(st.returnWindowId, { focused: true }, () => void chrome.runtime.lastError); } catch {}
  }
  if (st.returnTabId != null) {
    try { chrome.tabs.update(st.returnTabId, { active: true }, () => void chrome.runtime.lastError); } catch {}
  }
}

// OAuth answers that end this code for good. Anything else thrown by a poll
// (offline, DNS, a 5xx) is passing: keep the code and keep polling.
const DEVICE_FINAL = {
  access_denied: "Cancelled — you declined on GitHub. Click Connect to try again.",
  expired_token: "Code expired. Get a new code to connect.",
};

/**
 * One device-flow poll, driven by the page at the server's interval. Answers:
 *   {status: "pending", interval, popupClosed, retrying?}
 *   {status: "done", connected, account}
 *   {error, code}   — code is the OAuth error ("access_denied", "expired_token", …)
 */
async function pollTrackerConnect(api, adapter) {
  const c = adapter.connect();
  if (!c || c.flow !== "device") return { error: "There is no sign-in to finish.", code: "no_flow" };
  const all = await sessionGet(DEVICE_FLOW_KEY, {});
  const pending = all[adapter.id];
  if (!pending) return { error: "This sign-in code is no longer valid. Click Connect again.", code: "no_flow" };
  if (pending.done) {
    return Date.now() - pending.doneAt < DEVICE_DONE_TTL_MS
      ? { status: "done", connected: true, account: pending.account || "" }
      : { error: "This sign-in code is no longer valid. Click Connect again.", code: "no_flow" };
  }
  if (devicePolling.has(adapter.id)) return { status: "pending", interval: pending.interval, popupClosed: !!pending.popupClosed };
  devicePolling.add(adapter.id);
  let r;
  try {
    r = await api.pollDeviceToken(c.spec, pending, Date.now());
  } catch (err) {
    if (!(err && err.name === "OAuthError")) {
      // Not GitHub saying no — the network. The code is still good.
      return { status: "pending", interval: pending.interval, popupClosed: !!pending.popupClosed, retrying: true };
    }
    const again = await sessionGet(DEVICE_FLOW_KEY, {});
    delete again[adapter.id];
    await sessionSet({ [DEVICE_FLOW_KEY]: again });
    closeDevicePage(pending, false);
    return { error: DEVICE_FINAL[err.code] || err.message || "Sign-in failed.", code: err.code || "error" };
  } finally {
    devicePolling.delete(adapter.id);
  }
  const again = await sessionGet(DEVICE_FLOW_KEY, {});
  const cur = again[adapter.id] || pending;
  if (r.status === "pending") {
    if (again[adapter.id]) {
      again[adapter.id] = Object.assign(again[adapter.id], { interval: r.interval });
      await sessionSet({ [DEVICE_FLOW_KEY]: again });
    }
    return { status: "pending", interval: r.interval, popupClosed: !!cur.popupClosed };
  }
  // The token: the one and only "signed in".
  const done = await finishConnect(api, adapter, r.tokens);
  again[adapter.id] = { done: true, doneAt: Date.now(), account: done.account || "" };
  await sessionSet({ [DEVICE_FLOW_KEY]: again });
  closeDevicePage(cur, true);
  return Object.assign({ status: "done" }, done);
}

/** The user closed GitHub's window. Only a flag: polling goes on. */
async function onDevicePopupClosed(windowId) {
  const all = await sessionGet(DEVICE_FLOW_KEY, {});
  const id = Object.keys(all).find((k) => all[k] && all[k].popupWindowId === windowId);
  if (!id || all[id].done) return;
  all[id].popupClosed = true;
  all[id].popupWindowId = null;
  await sessionSet({ [DEVICE_FLOW_KEY]: all });
}

if (chrome.windows && chrome.windows.onRemoved) {
  chrome.windows.onRemoved.addListener((windowId) => { onDevicePopupClosed(windowId).catch(() => {}); });
}

async function disconnectTracker(api, adapter) {
  const gone = await api.forgetOAuth(trackerAuthStore, adapter.id);
  // Linear lets a public (PKCE) client revoke its own grant; GitHub doesn't.
  if (adapter.id === "linear" && gone && gone.tokens) {
    if (gone.tokens.refreshToken) await api.revokeLinearToken(gone.tokens.refreshToken, "refresh_token");
    await api.revokeLinearToken(gone.tokens.accessToken, "access_token");
  }
  const got = await localGet([TRACKER_PREFS_KEY], {});
  const prefs = got[TRACKER_PREFS_KEY] || {};
  delete prefs[adapter.id];
  await localSet({ [TRACKER_PREFS_KEY]: prefs });
  // GitHub's revoke endpoint needs the client secret we don't have (ADR 010 §6),
  // so the window links the user to where they can revoke it themselves.
  return { ok: true, revokeUrl: adapter.id === "github" ? "https://github.com/settings/apps/authorizations" : null };
}

async function handleTrackerUi(message, sender) {
  const b = bridgeLib();
  const api = providerApi();
  if (!b || !api || typeof api.trackerAdapter !== "function") {
    return { error: "TraceBug could not load its tracker code. Reload the extension." };
  }
  if (b.TRACKER_UI_VERBS.indexOf(message.type) === -1) return { error: "Unsupported request type." };
  let base = "";
  try { base = chrome.runtime.getURL(""); } catch {}
  if (!b.validateExtensionPageSender(sender, chrome.runtime.id, base) && !(await boundPanelFor(sender))) return { error: "Rejected." };

  if (message.type === "tb:tracker:status") {
    return { trackers: await trackerStatusList(api), oauthUi: oauthUiSupported() };
  }

  const adapter = api.trackerAdapter(message.tracker);
  if (!adapter) return { error: "Unknown tracker." };
  const integrations = (await localGet([INT_KEY], {}))[INT_KEY] || {};
  try {
    switch (message.type) {
      case "tb:tracker:containers": {
        if (!(await hasAllHosts(adapter.apiHosts))) return { needsAccess: adapter.apiHosts };
        const items = await api.withTrackerAuth(authContext(adapter, integrations), (auth) => adapter.listContainers(auth));
        return { items };
      }
      case "tb:tracker:fields": {
        const container = typeof message.container === "string" ? message.container.trim().slice(0, 300) : "";
        if (!container) return { fields: [] };
        if (!(await hasAllHosts(adapter.apiHosts))) return { needsAccess: adapter.apiHosts };
        const fields = await api.withTrackerAuth(authContext(adapter, integrations), (auth) => adapter.listFields(auth, container));
        return { fields };
      }
      case "tb:tracker:connect": return await connectTracker(api, adapter, sender);
      case "tb:tracker:connect-show": return await showDevicePopup(adapter.id);
      case "tb:tracker:connect-poll": return await pollTrackerConnect(api, adapter);
      case "tb:tracker:disconnect": return await disconnectTracker(api, adapter);
      case "tb:tracker:set-default": {
        const c = b.validateChoice({ tracker: adapter.id, container: message.container, fields: {} });
        if (!c.ok) return { error: c.error };
        const prev = ((await localGet([TRACKER_PREFS_KEY], {}))[TRACKER_PREFS_KEY] || {})[adapter.id];
        // Same repo as last time keeps its labels; a new one starts clean.
        await rememberChoice(adapter.id, c.choice.container,
          prev && prev.container === c.choice.container ? prev.fields : {});
        return { ok: true };
      }
      default: return { error: "Unsupported request type." };
    }
  } catch (err) {
    return {
      error: api.mapProviderError(err, adapter.label),
      reconnect: !!(err && err.name === "ReconnectNeededError"),
    };
  }
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
    // Never cancel under a create that is running: it may land, and the page
    // must hear that, not "cancelled". Look again in a minute.
    if (isInFlight(await getPending(id))) {
      try { chrome.alarms.create(CONFIRM_ALARM + id, { when: Date.now() + 60 * 1000 }); } catch {}
      return;
    }
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
    // Closed while creating: let the create finish and report to the page.
    if (isInFlight(all[hit])) { all[hit].windowId = null; await sessionSet({ [PENDING_KEY]: all }); return; }
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

// ── Optional email ask: success counter ────────────────────────────────────
// docs/launch/email-capture-plan.md. The popup shows the ask when `state` is
// "due": after the 2nd saved ticket or export (audits don't count — ADR 009's
// sign-in covers audit users), and once more at the 10th only if the
// first was closed with ✕ ("snoozed"). "No thanks" or a signup → "done",
// never shown again. Counts stay on this machine; the popup sends them only
// if the user ticks the box under the email field.
const EMAIL_ASK_KEY = "tb_email_ask_v1";
const EMAIL_ASK_KINDS = ["audit", "ticket", "export"];
let _emailAskChain = Promise.resolve();

function recordSuccess(kind) {
  if (!EMAIL_ASK_KINDS.includes(kind)) return Promise.resolve();
  // Serialise: several results can land at once (export right after a save).
  _emailAskChain = _emailAskChain.then(async () => {
    try {
      const st = (await chrome.storage.local.get(EMAIL_ASK_KEY))[EMAIL_ASK_KEY] || {};
      const counts = { audit: 0, ticket: 0, export: 0, ...(st.counts || {}) };
      counts[kind] = Math.min((counts[kind] || 0) + 1, 99999);
      // Audits are counted (for the opt-in usage snapshot) but don't move the ask: Site Audit has
      // its own sign-in after 3 audits (ADR 009), and one ask per user is enough.
      const total = counts.ticket + counts.export;
      let state = st.state || "waiting";
      let source = st.source || "";
      if (state === "waiting" && total >= 2) { state = "due"; source = `ext-${kind}-2`; }
      else if (state === "snoozed" && total >= 10) { state = "due"; source = "ext-retry-10"; }
      await chrome.storage.local.set({ [EMAIL_ASK_KEY]: { ...st, counts, state, source } });
      if (kind === "audit") {
        const g = await readAuditGate();
        await chrome.storage.local.set({ [AUDIT_GATE_KEY]: { ...g, audits: Math.min(g.audits + 1, 99999) } });
      }
    } catch {}
  });
  return _emailAskChain;
}

// ── Site Audit sign-in gate (ADR 009, docs/launch/sign-in-gate-plan.md) ────
// 3 audits free in total, then a free account (email + code, signin.html).
// `audits` counts finished audits (recordSuccess); `account` is set by
// signin.html after the code is verified; `graceUntil` is set there when
// sign-in can't be reached, so a server problem never blocks the audit.
// Only the audit is gated — capture, exports, tickets and MCP never are.
const AUDIT_GATE_KEY = "tb_audit_gate_v1";
const FREE_AUDITS = 3;

async function readAuditGate() {
  try {
    const g = (await chrome.storage.local.get(AUDIT_GATE_KEY))[AUDIT_GATE_KEY] || {};
    return {
      audits: Number.isFinite(g.audits) ? g.audits : 0,
      account: g.account && typeof g.account.email === "string" ? g.account : null,
      graceUntil: Number.isFinite(g.graceUntil) ? g.graceUntil : 0,
    };
  } catch {
    return { audits: 0, account: null, graceUntil: 0 };
  }
}

async function auditPermit() {
  const g = await readAuditGate();
  const signedIn = !!g.account;
  const remaining = signedIn ? null : Math.max(0, FREE_AUDITS - g.audits);
  const allowed = signedIn || remaining > 0 || g.graceUntil > Date.now();
  return { allowed, signedIn, remaining, free: FREE_AUDITS };
}

