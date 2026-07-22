// ── TraceBug Offscreen Document ─────────────────────────────────────────────
// Holds the MediaStream + MediaRecorder for screen recording. Lives in the
// extension's own document context, so host-page reloads / navigations don't
// kill the recording. Driven by chrome.runtime messages from background.js.
//
// Message contract (all in form `{ type: "tb:rec:*", data?: {...} }`):
//   tb:rec:start    { mode, withMicrophone } → { ok, error? }
//   tb:rec:stop     {}                       → VideoRecording | null
//   tb:rec:capture  {}                       → VideoRecording | null
//   tb:rec:comment  { text }                 → { offsetMs?, ok }
//   tb:rec:status   {}                       → { active, mode, capturesTaken, elapsedMs, comments, mimeType, startedAt }
//
// VideoRecording shape (see src/video-recorder.ts):
//   { dataUrl, mimeType, durationMs, sizeBytes, comments, startedAt }
//   — The blob is base64-dataURL-encoded for transport over chrome.runtime
//     messaging (Blob is not structured-clonable across the messaging
//     boundary in MV3).
// ─────────────────────────────────────────────────────────────────────────────

let _recorder = null;
let _stream = null;
let _chunks = [];
// Running size of the accumulated chunks + a one-shot warning past a soft
// ceiling. In "standard" mode (not the default rolling mode) chunks grow for
// the whole recording; a multi-hour session can reach hundreds of MB in the
// offscreen document. We don't hard-cap (that would truncate the video and
// possibly lose the bug) — we warn so a long standard recording is a choice,
// not a surprise. Rolling mode is bounded by its periodic captures.
let _chunksBytes = 0;
let _chunksWarned = false;
const CHUNKS_WARN_BYTES = 1024 * 1024 * 1024; // 1 GB
let _startedAt = 0;
let _mimeType = "";
let _mode = "rolling";
let _comments = [];
let _capturesTaken = 0;
// Guards against double-finalization when both the video track's `ended`
// event AND the MediaRecorder's own `stop` event fire on native "Stop
// sharing". Reset at the start of every recording.
let _autoStopBroadcast = false;
// Coalesces concurrent tb:rec:start RPCs. Without this, two requests
// racing each other both pass the `isActive()` guard (the recorder
// doesn't exist yet — we're still awaiting getDisplayMedia), and we end
// up showing the share-picker twice.
let _startInFlight = null;
// Keep the LAST finalized recording so the page can re-request it after
// page reloads or modal re-opens. Without this, if the page-side
// _lastRecording is lost (e.g., navigation between stop and export), the
// video is gone forever. Cleared when a new recording starts.
let _lastBuiltRecording = null;

// We persist the finalized recording to chrome.storage.local (NOT
// chrome.runtime IPC) because:
//   1. IPC sendMessage silently drops responses larger than ~10–20 MB.
//      A 30-second screen recording easily exceeds that.
//   2. chrome.storage.local has no per-message limit, and with the
//      `unlimitedStorage` manifest permission no aggregate limit either.
// Layout:
//   tb_rec_meta_v2  → { mimeType, durationMs, sizeBytes, comments, startedAt }
//   tb_rec_data_v2  → "data:video/webm;base64,..." (the big payload)
// The page-side reader pulls both via a content-script proxy so the
// dataUrl never has to travel through chrome.runtime.sendMessage.
const REC_META_KEY = "tb_rec_meta_v2";
const REC_DATA_KEY = "tb_rec_data_v2";

// Offscreen documents don't always have chrome.storage in MV3 (varies by
// Chrome build). Route writes through the background service worker which
// always has storage access. The background also writes the dataUrl to
// the persistent store the content-script reads from.
async function persistLastRecording(recording) {
  if (!recording) return;
  const meta = {
    mimeType: recording.mimeType,
    durationMs: recording.durationMs,
    sizeBytes: recording.sizeBytes,
    comments: recording.comments || [],
    startedAt: recording.startedAt,
  };
  try {
    const res = await chrome.runtime.sendMessage({
      type: "tb:rec:persist",
      _toBackground: true,
      meta,
      dataUrl: recording.dataUrl || "",
    });
    if (!res || !res.ok) {
      console.warn("[TraceBug] persist failed:", res && res.error);
    }
  } catch (err) {
    console.warn("[TraceBug] persist threw:", err && err.message);
  }
}

async function clearPersistedRecording() {
  try {
    await chrome.runtime.sendMessage({ type: "tb:rec:persist-clear", _toBackground: true });
  } catch {}
}

async function hydratePersistedRecording() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "tb:rec:persist-read", _toBackground: true });
    if (res && res.dataUrl && typeof res.dataUrl === "string" && res.dataUrl.startsWith("data:")) {
      _lastBuiltRecording = {
        dataUrl: res.dataUrl,
        mimeType: res.meta?.mimeType,
        durationMs: res.meta?.durationMs,
        sizeBytes: res.meta?.sizeBytes,
        comments: res.meta?.comments || [],
        startedAt: res.meta?.startedAt,
      };
    }
  } catch {}
}

// Restore on offscreen document load — covers the case where the doc was
// torn down (background reset, browser crash) between recording finalization
// and the page asking for it. We keep the promise around so the
// last-recording RPC can await it instead of racing the hydration.
const _hydratePromise = hydratePersistedRecording();

// ── Helpers ────────────────────────────────────────────────────────────────

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (!self.MediaRecorder || typeof MediaRecorder.isTypeSupported !== "function") return "";
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildRecording(chunks) {
  const safeChunks = Array.isArray(chunks) ? chunks.filter(c => c && c.size > 0) : [];
  const blob = new Blob(safeChunks, { type: _mimeType || "video/webm" });
  const dataUrl = await blobToDataUrl(blob);
  const rec = {
    dataUrl,
    mimeType: _mimeType || "video/webm",
    durationMs: Date.now() - _startedAt,
    sizeBytes: blob.size,
    comments: _comments.slice(),
    startedAt: _startedAt,
  };
  // Keep the "empty recording" warning — it tells QA whether the recorder
  // failed to capture anything when they report a missing video.
  if (blob.size === 0) {
    console.warn("[TraceBug] recording captured zero bytes (chunks =", safeChunks.length, ")");
  }
  return rec;
}

function teardown() {
  if (_recorder && _recorder.state !== "inactive") {
    try { _recorder.stop(); } catch {}
  }
  if (_stream) {
    _stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
  }
  _recorder = null;
  _stream = null;
  _chunks = [];
  _chunksBytes = 0;
  _chunksWarned = false;
  _startedAt = 0;
  _mimeType = "";
  _mode = "rolling";
  _comments = [];
  _capturesTaken = 0;
}

function isActive() {
  return _recorder !== null && _recorder.state === "recording";
}

// ── Recording lifecycle ──────────────────────────────────────────────────

async function startRecording(options) {
  if (isActive()) return { ok: true };
  // If a previous start is mid-flight (getDisplayMedia picker open), don't
  // open a second picker — return the same in-flight promise so the
  // duplicate caller resolves once the user picks (or cancels).
  if (_startInFlight) return _startInFlight;
  _startInFlight = (async () => {
    try {
      return await _startRecordingImpl(options);
    } finally {
      _startInFlight = null;
    }
  })();
  return _startInFlight;
}

async function _startRecordingImpl(options) {
  // Fresh recording — clear the previous one so the next "give me the last
  // recording" RPC doesn't return stale data from the previous session.
  _lastBuiltRecording = null;
  _autoStopBroadcast = false;
  clearPersistedRecording();
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return { ok: false, error: "MediaDevices not supported in this browser." };
  }
  // Always use getDisplayMedia. Chrome's native "Choose what to share"
  // picker appears so the user can record a tab, a window, or the whole
  // screen. We deliberately DON'T pass preferCurrentTab — that hint
  // collapses the picker to a single "Current tab" confirm step, which
  // skips the tab/window/screen choice the user actually wants.
  //
  // surfaceSwitching: "include" lets Chrome keep the recording alive when
  // the captured tab navigates (e.g., link click, reload) instead of
  // ending the stream — critical for QA flows that span page transitions.
  if (!navigator.mediaDevices.getDisplayMedia) {
    return { ok: false, error: "getDisplayMedia not supported in this browser." };
  }
  let displayStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
      surfaceSwitching: "include",
      selfBrowserSurface: "exclude",
    });
  } catch (err) {
    if (err && (err.name === "NotAllowedError" || err.name === "AbortError")) {
      return { ok: false, error: "cancelled" };
    }
    return { ok: false, error: (err && err.message) || "Could not start screen capture." };
  }

  let micIncluded = false;
  if (options?.withMicrophone) {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mic.getAudioTracks().forEach(t => displayStream.addTrack(t));
      micIncluded = mic.getAudioTracks().length > 0;
    } catch (err) {
      // Mic permission not granted to the extension. We can't prompt from an
      // offscreen document — the popup's mic toggle is where the user grants it.
      // Keep recording (screen + tab audio) so they still get a video.
      console.warn("[TraceBug offscreen] microphone unavailable — grant it from the extension popup:", (err && err.name) || err);
    }
  }

  _stream = displayStream;
  _chunks = [];
  _chunksBytes = 0;
  _chunksWarned = false;
  _comments = [];
  _startedAt = Date.now();
  _capturesTaken = 0;
  _mode = options?.mode === "standard" ? "standard" : "rolling";
  _mimeType = pickMimeType();

  try {
    _recorder = _mimeType
      ? new MediaRecorder(displayStream, { mimeType: _mimeType })
      : new MediaRecorder(displayStream);
  } catch (err) {
    teardown();
    return { ok: false, error: (err && err.message) || "MediaRecorder failed to construct." };
  }

  _recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      _chunks.push(e.data);
      _chunksBytes += e.data.size;
      if (!_chunksWarned && _mode !== "rolling" && _chunksBytes > CHUNKS_WARN_BYTES) {
        _chunksWarned = true;
        console.warn(
          "[TraceBug offscreen] recording buffer > 1 GB (" +
            Math.round(_chunksBytes / 1048576) +
            " MB) — a very long standard recording holds it all in memory. " +
            "Stop soon, or use rolling mode (the default) for long sessions."
        );
      }
    }
  };

  // ── Auto-stop finalize ─────────────────────────────────────────────────
  // Two events can signal a native "Stop sharing":
  //   1. The video track fires `ended` (this is the documented signal).
  //   2. The MediaRecorder fires `stop` because all source tracks ended.
  // We listen to both and de-dup with `_autoStopBroadcast`. The recorder's
  // state may already be "inactive" by the time our handler runs, so we
  // never bail on isActive() — we just build from whatever chunks we have.
  const finalizeAndBroadcast = async () => {
    if (_autoStopBroadcast) return;
    _autoStopBroadcast = true;
    let recording = null;
    try {
      if (_recorder && _recorder.state !== "inactive") {
        // Recorder still running — flush, then call stop() and wait for
        // onstop to handle the final chunk before we build the recording.
        try { _recorder.requestData(); } catch {}
        recording = await new Promise((resolve) => {
          const r = _recorder;
          r.onstop = async () => {
            try {
              const rec = await buildRecording(_chunks);
              _lastBuiltRecording = rec;
              await persistLastRecording(rec);
              resolve(rec);
            } catch {
              resolve(_lastBuiltRecording);
            }
          };
          try { r.stop(); } catch { resolve(_lastBuiltRecording); }
        });
      } else if (_chunks.length > 0) {
        // Recorder already inactive but we still have buffered chunks.
        recording = await buildRecording(_chunks);
        _lastBuiltRecording = recording;
        await persistLastRecording(recording);
      } else {
        recording = _lastBuiltRecording;
      }
    } catch {}
    teardown();
    // Strip the dataUrl from the broadcast — IPC can't carry the full
    // 17 MB+ payload reliably. Page reads it from chrome.storage.local
    // via the content-script.
    broadcast({ type: "tb:rec:auto-stopped", recording: stripDataUrlForIpc(recording) });
  };

  displayStream.getVideoTracks().forEach(track => {
    track.addEventListener("ended", finalizeAndBroadcast);
  });
  // Backup: some Chrome versions transition the recorder to "inactive"
  // when its source tracks all end, firing `stop` before our track.ended
  // handler runs. We still want the broadcast in that case.
  _recorder.addEventListener("stop", () => {
    // Only auto-broadcast if this stop wasn't triggered by an explicit
    // tb:rec:stop RPC (which sets its own onstop handler and broadcasts
    // nothing — the RPC response carries the recording instead).
    if (_autoStopBroadcast) return;
    if (_stream && _stream.getVideoTracks().some(t => t.readyState === "ended")) {
      finalizeAndBroadcast();
    }
  });

  _recorder.start(1000);
  // Tell every tab the recording REALLY started. The page mounts its HUD on
  // this (not on the start-RPC return) because in some Chrome builds the
  // offscreen getDisplayMedia surfaces an AbortError on the RPC channel even
  // though capture began — which used to leave the page showing "Recording
  // cancelled" with no controls while the screen was actually being recorded.
  try { broadcast({ type: "tb:rec:started", startedAt: _startedAt, mode: _mode, mimeType: _mimeType, micRequested: !!options?.withMicrophone, micIncluded }); } catch (e) {}
  return { ok: true };
}

async function stopAndBuildRecording() {
  if (!_recorder || _recorder.state === "inactive") {
    // Allow re-stops to return whatever we last built so the page can
    // still recover after a reload between stop and modal mount.
    return _lastBuiltRecording;
  }

  // Mark "explicit stop" so the auto-stop watcher we wired in startRecording
  // doesn't also fire a tb:rec:auto-stopped broadcast — the RPC response
  // already carries the recording back to the page.
  _autoStopBroadcast = true;

  // Flush any buffered data BEFORE stop() so very short recordings (under
  // one timeslice / 1000ms) still have a chunk. MediaRecorder.stop() does
  // emit a final dataavailable, but on some Chrome versions that emission
  // races our teardown — calling requestData() first is cheap insurance.
  try { _recorder.requestData(); } catch {}

  return await new Promise((resolve) => {
    const recorder = _recorder;
    recorder.onstop = async () => {
      try {
        // Read _chunks AT onstop time — we want the final dataavailable
        // that stop() emits BEFORE this event to have already pushed.
        const recording = await buildRecording(_chunks);
        _lastBuiltRecording = recording;
        await persistLastRecording(recording);
        teardown();
        resolve(recording);
      } catch {
        teardown();
        resolve(null);
      }
    };
    try { recorder.stop(); } catch { teardown(); resolve(null); }
  });
}

async function captureRollingBuffer() {
  if (!_recorder || _recorder.state !== "recording") return null;

  return await new Promise((resolve) => {
    const recorder = _recorder;
    const originalOnData = recorder.ondataavailable;
    const flushOnce = async (e) => {
      if (originalOnData) originalOnData.call(recorder, e);
      recorder.ondataavailable = originalOnData;

      const recording = await buildRecording(_chunks);
      _capturesTaken += 1;
      // Reset comments — next capture from this session starts fresh.
      _comments = [];
      resolve(recording);
    };
    recorder.ondataavailable = flushOnce;
    try {
      recorder.requestData();
    } catch {
      recorder.ondataavailable = originalOnData;
      resolve(null);
    }
  });
}

function addComment(text) {
  if (!isActive()) return null;
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const offsetMs = Date.now() - _startedAt;
  _comments.push({ offsetMs, text: trimmed.slice(0, 500) });
  return offsetMs;
}

function getStatus() {
  return {
    active: isActive(),
    mode: _mode,
    capturesTaken: _capturesTaken,
    elapsedMs: isActive() ? Date.now() - _startedAt : 0,
    comments: _comments.slice(),
    mimeType: _mimeType,
    startedAt: _startedAt,
  };
}

// ── Broadcast (offscreen → background → all tabs) ───────────────────────
// Used when the recording auto-stops because the user clicked the browser's
// native "Stop sharing" button. Background fans this out so any tab with
// the HUD mounted can dismiss it and open the ticket modal.

function broadcast(message) {
  try { chrome.runtime.sendMessage(message); } catch {}
}

// ── Message handler ─────────────────────────────────────────────────────

// Strip the dataUrl from a recording before sending through IPC. The
// caller can re-attach it by reading chrome.storage.local directly (the
// content-script handles that on the page side). IPC stays small.
function stripDataUrlForIpc(rec) {
  if (!rec) return rec;
  return {
    mimeType: rec.mimeType,
    durationMs: rec.durationMs,
    sizeBytes: rec.sizeBytes,
    comments: rec.comments || [],
    startedAt: rec.startedAt,
    // Marker so the page-side handler knows to pull the dataUrl from storage.
    _viaStorage: true,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages explicitly forwarded by background. The page's
  // content-script ALSO broadcasts these messages via chrome.runtime
  // (since broadcasts hit every extension context, including this offscreen
  // doc) — without this guard we'd receive the same message twice and call
  // getDisplayMedia twice → two screen-pickers. Background re-sends with
  // `_toOffscreen: true` after running its own routing logic.
  if (!message || message._toOffscreen !== true) return false;
  if (typeof message.type !== "string" || !message.type.startsWith("tb:rec:")) return false;
  if (message.type === "tb:rec:auto-stopped") return false;

  const handle = async () => {
    switch (message.type) {
      case "tb:rec:start":
        return await startRecording(message.data || {});
      case "tb:rec:stop":
        return stripDataUrlForIpc(await stopAndBuildRecording());
      case "tb:rec:capture":
        return stripDataUrlForIpc(await captureRollingBuffer());
      case "tb:rec:comment":
        return { offsetMs: addComment(message.data?.text), ok: true };
      case "tb:rec:status":
        return getStatus();
      case "tb:rec:last-recording":
        // Returns the most-recent finalized recording metadata. The dataUrl
        // is fetched separately via chrome.storage.local so IPC limits
        // don't truncate large recordings.
        try { await _hydratePromise; } catch {}
        return stripDataUrlForIpc(_lastBuiltRecording);
      default:
        return { error: "unknown_type" };
    }
  };

  handle()
    .then(result => sendResponse(result))
    .catch(err => sendResponse({ error: (err && err.message) || String(err) }));
  return true; // async response
});
