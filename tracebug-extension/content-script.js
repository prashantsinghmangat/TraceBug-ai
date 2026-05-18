// ── TraceBug Extension — Content Script ──────────────────────────────────────
// Bridge between extension popup/background and the page-context SDK.
// Does NOT inject <script> tags (CSP blocks that).
// SDK injection is handled by background.js via chrome.scripting.executeScript.
//
// All chrome.runtime.sendMessage calls go through safeSendMessage() which
// swallows the "Extension context invalidated" error that fires after the
// extension is reloaded — without it, the page console gets a noisy
// uncaught error every time the dev reloads TraceBug while a page that has
// the old content script is still open.
//
// Idempotency: chrome.scripting.executeScript can re-run this file in the
// same isolated world (page reload + re-inject, hash navigation, etc.).
// Re-running top-level `const` declarations throws SyntaxError, so we
// guard the whole script with a window flag and skip on re-injection.
// ─────────────────────────────────────────────────────────────────────────────

if (!window.__TRACEBUG_CS_LOADED__) {
  window.__TRACEBUG_CS_LOADED__ = true;
  (function tracebugContentScriptMain() {

/**
 * True when the extension's runtime context is still attached to this content
 * script. Becomes false after the extension is reloaded/updated/disabled.
 * `chrome.runtime.id` reads as undefined on an invalidated context, so we use
 * it as a synchronous probe before each call.
 */
function isExtAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

/**
 * Wrapper around chrome.runtime.sendMessage that:
 *   - Bails out early if the context is gone (no synchronous throw).
 *   - Swallows the async "Extension context invalidated" rejection.
 *   - Reports a null result via the callback if invocation failed so the
 *     caller's logic still runs.
 */
function safeSendMessage(msg, cb) {
  if (!isExtAlive()) { if (cb) try { cb(null); } catch (e) {} return; }
  try {
    chrome.runtime.sendMessage(msg, function (response) {
      // Read lastError defensively — accessing it suppresses the
      // unchecked-runtime-error console warning.
      var _ = chrome.runtime.lastError;
      if (cb) try { cb(response); } catch (e) {}
    });
  } catch (err) {
    if (cb) try { cb(null); } catch (e) {}
  }
}

/**
 * Top-level error trap. If anything inside this content script throws after
 * the runtime context is invalidated, swallow it — the page should never
 * see an uncaught TraceBug error.
 */
function safeRun(fn) {
  try { return fn(); } catch (err) {
    // Only log if the message looks unexpected. The invalidated-context
    // error is normal during dev (extension reload) so we drop it silently.
    var msg = (err && err.message) || String(err);
    if (!/Extension context invalidated|Receiving end does not exist/i.test(msg)) {
      try { console.warn("[TraceBug]", msg); } catch (e) {}
    }
  }
}

// ── Listen for SDK requesting a screenshot (toolbar camera button) ──────────
// The SDK dispatches this event when it detects it's in an extension context.
// We route it to background.js which calls chrome.tabs.captureVisibleTab,
// then send the result back to the page via another CustomEvent.
window.addEventListener("tracebug-request-screenshot", () => safeRun(() => {
  safeSendMessage({ type: "CAPTURE_SCREENSHOT" }, (result) => {
    window.dispatchEvent(
      new CustomEvent("tracebug-ext-screenshot-result", {
        detail: { dataUrl: (result && result.dataUrl) || null },
      })
    );
  });
}));

// ── Recording RPC bridge ───────────────────────────────────────────────────
// ── Recording dataUrl transport ──────────────────────────────────────────
// Background writes the recording into chrome.storage.local (it has the
// API; offscreen documents don't always). Content scripts also have
// chrome.storage access via the `storage` permission, so we read here
// directly and avoid bouncing the multi-MB dataUrl through a second IPC
// round-trip. The page-side has no chrome.* access so we hand the value
// over via CustomEvent (no size limit, in-process).
const REC_DATA_KEY = "tb_rec_data_v2";

function fetchDataUrlFromStorage(cb) {
  if (!isExtAlive()) { cb(null); return; }
  // Try direct chrome.storage.local first — content scripts usually have it.
  if (chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(REC_DATA_KEY, (data) => {
        try { void chrome.runtime.lastError; } catch (e) {}
        const dataUrl = data && data[REC_DATA_KEY];
        if (dataUrl && typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
          cb(dataUrl);
        } else {
          readViaBackground(cb);
        }
      });
      return;
    } catch (e) { /* fall through to background read */ }
  }
  readViaBackground(cb);
}

function readViaBackground(cb) {
  safeSendMessage({ type: "tb:rec:persist-read", _toBackground: true }, (res) => {
    if (res && res.ok && typeof res.dataUrl === "string" && res.dataUrl.startsWith("data:")) {
      cb(res.dataUrl);
    } else {
      cb(null);
    }
  });
}

// Re-attaches the dataUrl from storage onto a recording object that
// carries the `_viaStorage` marker. Calls cb(recording) once done.
function reattachDataUrl(rec, cb) {
  if (!rec || !rec._viaStorage) { cb(rec); return; }
  fetchDataUrlFromStorage((dataUrl) => {
    if (dataUrl) rec.dataUrl = dataUrl;
    delete rec._viaStorage;
    cb(rec);
  });
}

// Page-context video-recorder dispatches `tracebug-rec-request` with an id
// + type + data. We forward to background.js, which routes to the offscreen
// document. The response comes back as `tracebug-rec-response` with the same
// id. Page resolves the matching pending promise.
window.addEventListener("tracebug-rec-request", (e) => safeRun(() => {
  const { id, type, data } = e.detail || {};
  if (!type) return;
  if (!isExtAlive()) {
    // Reply with an error so the page-side promise rejects cleanly instead
    // of waiting forever for a response that will never come.
    window.dispatchEvent(
      new CustomEvent("tracebug-rec-response", {
        detail: { id, result: null, error: "Extension context invalidated" },
      })
    );
    return;
  }
  safeSendMessage({ type, data }, (response) => safeRun(() => {
    const error = (chrome.runtime && chrome.runtime.lastError && chrome.runtime.lastError.message)
      || (response && response.error)
      || (!response ? "Extension context invalidated" : null);
    const respond = (finalResult) => window.dispatchEvent(
      new CustomEvent("tracebug-rec-response", {
        detail: { id, result: error ? null : finalResult, error },
      })
    );
    // Recordings carry only metadata over IPC — read the dataUrl out of
    // chrome.storage.local (where the offscreen wrote it) and stitch it
    // back on before handing the result to the page.
    if (!error && response && response._viaStorage) {
      reattachDataUrl(response, respond);
    } else {
      respond(response);
    }
  }));
}));

// ── Auto-stop fan-out ──────────────────────────────────────────────────────
// When the user clicks the browser's native "Stop sharing" button, the
// offscreen document broadcasts `tb:rec:auto-stopped` via background to every
// tab. We forward to the page so the SDK can dismiss the HUD + open the
// ticket modal with the finalized recording.
if (isExtAlive()) {
  try {
    chrome.runtime.onMessage.addListener((message) => safeRun(() => {
      if (message && message.type === "tb:rec:auto-stopped") {
        const deliver = (m) => window.dispatchEvent(
          new CustomEvent("tracebug-rec-auto-stopped", { detail: m })
        );
        // Same dataUrl rehydration as the RPC response path.
        if (message.recording && message.recording._viaStorage) {
          reattachDataUrl(message.recording, (rec) => {
            message.recording = rec;
            deliver(message);
          });
        } else {
          deliver(message);
        }
      }
    }));
  } catch (e) {}
}

// ── Listen for messages from popup/background ───────────────────────────────
if (isExtAlive()) {
 try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => safeRun(() => {
    switch (message.type) {
      case "TAKE_SCREENSHOT":
        // Use chrome.tabs.captureVisibleTab via background
        safeSendMessage({ type: "CAPTURE_SCREENSHOT" }, (result) => {
          if (result && result.dataUrl) {
            window.dispatchEvent(
              new CustomEvent("tracebug-ext-screenshot", {
                detail: { dataUrl: result.dataUrl },
              })
            );
          }
        });
        sendResponse({ ok: true });
        break;

      case "GENERATE_REPORT":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "report" },
          })
        );
        sendResponse({ ok: true });
        break;

      case "COPY_GITHUB_ISSUE":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "github" },
          })
        );
        sendResponse({ ok: true });
        break;

      case "COPY_JIRA_TICKET":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "jira" },
          })
        );
        sendResponse({ ok: true });
        break;

      case "TOGGLE_ANNOTATE":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "annotate" },
          })
        );
        sendResponse({ ok: true });
        break;

      case "TOGGLE_DRAW":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "draw" },
          })
        );
        sendResponse({ ok: true });
        break;

      case "EXPORT_ANNOTATIONS":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "export_annotations" },
          })
        );
        sendResponse({ ok: true });
        break;

      // ── New popup flow ───────────────────────────────────────────────────
      case "TB_CAPTURE_NOW":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", { detail: { action: "capture-now" } })
        );
        sendResponse({ ok: true });
        break;

      case "TB_START_RECORDING":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", {
            detail: { action: "record", withMic: !!message.withMic },
          })
        );
        sendResponse({ ok: true });
        break;

      case "TB_VIEW_TICKETS":
        window.dispatchEvent(
          new CustomEvent("tracebug-ext-action", { detail: { action: "view-tickets" } })
        );
        sendResponse({ ok: true });
        break;
    }
  }));
 } catch (e) {}
}

// Last-resort net: any uncaught error originating from this content script's
// own execution gets suppressed via the window error handler. Required when
// the runtime is invalidated mid-execution (e.g., during an `await` inside
// a listener) — try/catch around the entry point doesn't catch async throws.
window.addEventListener("error", function (ev) {
  var msg = ev && ev.message;
  if (typeof msg === "string" && /Extension context invalidated|Receiving end does not exist/i.test(msg)) {
    ev.preventDefault();
    ev.stopImmediatePropagation && ev.stopImmediatePropagation();
  }
}, true);
window.addEventListener("unhandledrejection", function (ev) {
  var msg = ev && ev.reason && (ev.reason.message || String(ev.reason));
  if (typeof msg === "string" && /Extension context invalidated|Receiving end does not exist/i.test(msg)) {
    ev.preventDefault();
    ev.stopImmediatePropagation && ev.stopImmediatePropagation();
  }
}, true);

  })(); // end tracebugContentScriptMain IIFE
} // end __TRACEBUG_CS_LOADED__ guard
