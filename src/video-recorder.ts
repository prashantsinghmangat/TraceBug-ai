// ── Video Recorder ────────────────────────────────────────────────────────
// Two transports — both expose the same public API:
//
//   1. Extension transport (preferred when present):
//      Recording lives in an offscreen document owned by the Chrome extension,
//      so it survives host-page reloads, navigations, and tab switches. Page
//      sends RPC commands via CustomEvent → content script → background →
//      offscreen. Persistent until Stop is clicked or the user hits the
//      browser's native "Stop sharing" button.
//
//   2. In-page transport (npm SDK / non-extension fallback):
//      MediaStream + MediaRecorder live in the page's JS context. Page reload
//      kills the recording — there is no browser-supported way around this.
//      We harden this path with a beforeunload warning + pagehide auto-save
//      so the user never silently loses footage.
//
// Comments added during recording are timestamped relative to recording start
// so they can be synced to the video on playback in the Quick Bug modal.
// No backend, no API keys.

export interface VideoComment {
  /** Milliseconds since recording started. */
  offsetMs: number;
  text: string;
}

export interface VideoRecording {
  /** Blob URL (in-memory). Revokes on clearVideoRecording(). */
  url: string;
  /** Underlying Blob — caller can re-download or upload. */
  blob: Blob;
  /** Raw base64 data URL, preserved across modal re-opens / page reloads.
   *  We hand this to the HTML export so it doesn't depend on the blob URL
   *  still being attached to a live document context. */
  dataUrl?: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  comments: VideoComment[];
  /** Wall-clock timestamp of when recording started. */
  startedAt: number;
}

// ── Shadow state (read by sync getters in both transports) ───────────────

let _active = false;
let _startedAt = 0;
let _mimeType = "";
let _mode: "rolling" | "standard" = "rolling";
let _comments: VideoComment[] = [];
let _capturesTaken = 0;
let _lastRecording: VideoRecording | null = null;
let _onStatus: ((status: "recording" | "stopped" | "error" | "warning", message?: string) => void) | null = null;

// ── Cloud share duration cap ─────────────────────────────────────────────
// Free-tier cloud share allows max 2 min videos (50 MB upload cap at typical
// WebM quality). Warn at 1:30, final warning at 1:55, auto-stop at 2:00.
// All recordings are capped — users who don't want the limit simply don't
// upload (the existing local .html export is unaffected by this).

const MAX_CLOUD_RECORDING_S = 120;
const WARN_AT_S = 90;
const FINAL_WARN_AT_S = 115;

let _warnTimer: ReturnType<typeof setTimeout> | null = null;
let _finalWarnTimer: ReturnType<typeof setTimeout> | null = null;
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

function clearDurationCapTimers(): void {
  if (_warnTimer) { clearTimeout(_warnTimer); _warnTimer = null; }
  if (_finalWarnTimer) { clearTimeout(_finalWarnTimer); _finalWarnTimer = null; }
  if (_autoStopTimer) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
}

function scheduleDurationCap(): void {
  clearDurationCapTimers();
  _warnTimer = setTimeout(() => {
    if (!_active) return;
    _onStatus?.("warning", `${MAX_CLOUD_RECORDING_S - WARN_AT_S} seconds left in recording — cloud share limit is ${MAX_CLOUD_RECORDING_S / 60} min`);
  }, WARN_AT_S * 1000);
  _finalWarnTimer = setTimeout(() => {
    if (!_active) return;
    _onStatus?.("warning", `Recording stops in ${MAX_CLOUD_RECORDING_S - FINAL_WARN_AT_S} seconds`);
  }, FINAL_WARN_AT_S * 1000);
  _autoStopTimer = setTimeout(async () => {
    if (!_active) return;
    try {
      const recording = await stopVideoRecording();
      _onAutoStop?.(recording);
    } catch {
      _onAutoStop?.(null);
    }
  }, MAX_CLOUD_RECORDING_S * 1000);
}

// ── In-page-only state (null when extension transport is in use) ─────────

let _recorder: MediaRecorder | null = null;
let _stream: MediaStream | null = null;
let _chunks: Blob[] = [];
// Guards against the native-"Stop sharing" track `ended` handler re-entering
// the stop flow when WE call track.stop() during finalization (which would
// double-fire _onAutoStop → the ticket modal opening twice).
let _stopping = false;

// ── Auto-stop callback (when user hits browser's "Stop sharing" button) ──
// SDK init wires this so the HUD can dismiss + Quick Bug modal can open with
// the finalized recording.

let _onAutoStop: ((recording: VideoRecording | null) => void) | null = null;

export function setAutoStopHandler(cb: ((recording: VideoRecording | null) => void) | null): void {
  _onAutoStop = cb;
}

// ── Transport detection ──────────────────────────────────────────────────

function isExtensionContext(): boolean {
  return !!(window as any).__TRACEBUG_INITIALIZED__;
}

// ── Public sync queries ──────────────────────────────────────────────────

export function isVideoSupported(): boolean {
  if (isExtensionContext()) return true; // offscreen handles capability
  return !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof (window as any).MediaRecorder === "function"
  );
}

export function isVideoRecording(): boolean {
  return _active;
}

export function isRollingMode(): boolean {
  return _active && _mode === "rolling";
}

export function getCaptureCount(): number {
  return _capturesTaken;
}

export function getVideoElapsedMs(): number {
  if (!_active) return 0;
  // Subtract any time spent paused so the HUD timer matches the actual
  // recorded duration.
  return Date.now() - _startedAt - _pausedMs - (_paused ? Date.now() - _pausedAt : 0);
}

export function getLastVideoRecording(): VideoRecording | null {
  return _lastRecording;
}

export function clearLastVideoRecording(): void {
  _lastRecording = null;
}

// ── Pause / Resume ───────────────────────────────────────────────────────
// Only the in-page transport supports pause/resume today — the extension's
// MediaRecorder lives in the offscreen doc and would need an additional RPC
// pair to drive it. Pause on the extension path is a no-op for now; the HUD
// button is still wired so the UI is consistent across both transports.

let _paused = false;
let _pausedAt = 0;
let _pausedMs = 0;

export function isVideoPaused(): boolean {
  return _paused;
}

export function pauseVideoRecording(): void {
  if (!_active || _paused) return;
  _paused = true;
  _pausedAt = Date.now();
  if (_recorder && _recorder.state === "recording") {
    try { _recorder.pause(); } catch {}
  }
}

export function resumeVideoRecording(): void {
  if (!_active || !_paused) return;
  _pausedMs += Date.now() - _pausedAt;
  _paused = false;
  _pausedAt = 0;
  if (_recorder && _recorder.state === "paused") {
    try { _recorder.resume(); } catch {}
  }
}

// ── Microphone mute ──────────────────────────────────────────────────────
// Toggling `enabled` on the mic track sends silence downstream without
// detaching the track — resume just flips it back. Works regardless of
// whether the mic came from displayMedia's audio:true or a separately
// captured getUserMedia track.

export function hasMicrophoneTrack(): boolean {
  if (!_stream) return false;
  // Audio tracks from getDisplayMedia's `audio: true` are system/tab audio,
  // not the mic. The mic track is the one we added via getUserMedia in
  // startVideoRecordingInPage and is tagged with label containing
  // "microphone" or kind === "audio" with a non-empty deviceId.
  return _stream.getAudioTracks().length > 0;
}

export function isMicrophoneMuted(): boolean {
  if (!_stream) return false;
  const tracks = _stream.getAudioTracks();
  if (tracks.length === 0) return false;
  return tracks.some(t => !t.enabled);
}

export function setMicrophoneMuted(muted: boolean): void {
  if (!_stream) return;
  _stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
}

// ── Public mutators — dispatch to the right transport ────────────────────

// Coalesces concurrent startVideoRecording() calls (e.g., the SDK listener
// firing twice for some reason, or the popup dispatching the action while
// a previous start is still mid-flight awaiting getDisplayMedia). Without
// this, two concurrent calls each fire their own tb:rec:start RPC and the
// user sees the share-picker twice.
let _startInFlight: Promise<boolean> | null = null;

export async function startVideoRecording(options?: {
  mode?: "rolling" | "standard";
  /** "tab" prefers the current tab silently (extension) or via
   *  `preferCurrentTab` (SDK). "desktop" shows the full screen-picker.
   *  Default "desktop" for backwards compatibility. */
  surfaceMode?: "tab" | "desktop";
  withMicrophone?: boolean;
  onStatus?: (status: "recording" | "stopped" | "error" | "warning", message?: string) => void;
}): Promise<boolean> {
  if (_active) return false;
  if (_startInFlight) return _startInFlight;
  _startInFlight = _startVideoRecordingInner(options).finally(() => { _startInFlight = null; });
  return _startInFlight;
}

async function _startVideoRecordingInner(options?: {
  mode?: "rolling" | "standard";
  surfaceMode?: "tab" | "desktop";
  withMicrophone?: boolean;
  onStatus?: (status: "recording" | "stopped" | "error" | "warning", message?: string) => void;
}): Promise<boolean> {
  _onStatus = options?.onStatus || null;
  const requestedMode = options?.mode === "standard" ? "standard" : "rolling";
  const surfaceMode = options?.surfaceMode === "tab" ? "tab" : "desktop";

  if (isExtensionContext()) {
    const result = await rpcCall<{ ok: boolean; error?: string }>("tb:rec:start", {
      mode: requestedMode,
      surfaceMode,
      withMicrophone: !!options?.withMicrophone,
    }).catch((err) => ({ ok: false, error: (err && err.message) || String(err) }));

    if (!result || !result.ok) {
      if (result?.error === "cancelled") _onStatus?.("stopped", "cancelled");
      else _onStatus?.("error", result?.error || "Could not start screen capture.");
      return false;
    }

    _active = true;
    _startedAt = Date.now();
    _mode = requestedMode;
    _capturesTaken = 0;
    _comments = [];
    _mimeType = "video/webm";
    // Same 2-min cloud-share cap as the in-page path. Previously the extension
    // transport had NO client cap, so a long recording would silently blow past
    // the 50 MB cloud-upload limit. Cleared by finalizeStop on any stop.
    scheduleDurationCap();
    _onStatus?.("recording");
    return true;
  }

  return startVideoRecordingInPage(requestedMode, { ...options, surfaceMode });
}

export function stopVideoRecording(): Promise<VideoRecording | null> {
  if (!_active) return Promise.resolve(null);
  if (isExtensionContext()) {
    return rpcCall<any>("tb:rec:stop").then((rec) => {
      const recording = rec && !rec.error ? hydrateRecording(rec) : null;
      if (recording) revokeAndStash(recording);
      finalizeStop(recording);
      return recording;
    }).catch(() => {
      finalizeStop(null);
      return null;
    });
  }
  return stopVideoRecordingInPage();
}

export function captureRollingBuffer(): Promise<VideoRecording | null> {
  if (!_active) return Promise.resolve(null);
  if (isExtensionContext()) {
    return rpcCall<any>("tb:rec:capture").then((rec) => {
      if (!rec || rec.error) return null;
      const recording = hydrateRecording(rec);
      revokeAndStash(recording);
      _capturesTaken += 1;
      // Comments reset for the next capture (mirroring offscreen behavior).
      _comments = [];
      return recording;
    }).catch(() => null);
  }
  return captureRollingBufferInPage();
}

export function addVideoComment(text: string): VideoComment | null {
  if (!_active) return null;
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const c: VideoComment = { offsetMs: Date.now() - _startedAt, text: trimmed };
  _comments.push(c);
  if (isExtensionContext()) {
    // Fire-and-forget — local update is authoritative for the HUD.
    rpcCall("tb:rec:comment", { text: trimmed }).catch(() => {});
  }
  return c;
}

/** Drop the cached recording and revoke its blob URL. */
export function clearVideoRecording(): void {
  if (_lastRecording) {
    try { URL.revokeObjectURL(_lastRecording.url); } catch {}
    _lastRecording = null;
  }
}

/** Force-stop without resolving a recording (used in destroy()). */
export function abortVideoRecording(): void {
  if (isExtensionContext()) {
    if (_active) rpcCall("tb:rec:stop").catch(() => {});
  } else {
    if (_recorder && _recorder.state !== "inactive") {
      try { _recorder.stop(); } catch {}
    }
    _stream?.getTracks().forEach(t => t.stop());
    _recorder = null;
    _stream = null;
    _chunks = [];
  }
  _active = false;
  _comments = [];
  _capturesTaken = 0;
  _startedAt = 0;
  _mode = "rolling";
  _paused = false;
  _pausedAt = 0;
  _pausedMs = 0;
}

/** Trigger a browser download of the video blob. */
export function downloadVideoRecording(recording: VideoRecording, filename = "tracebug-recording.webm"): void {
  const a = document.createElement("a");
  a.href = recording.url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Restore state on page load (extension mode only) ─────────────────────
// Called by the SDK init. Pings the offscreen for status; if a recording is
// active it bootstraps shadow state so the HUD can be re-mounted seamlessly.

export async function restoreFromOffscreenIfActive(): Promise<boolean> {
  if (!isExtensionContext()) return false;
  const status = await rpcCall<any>("tb:rec:status").catch(() => null);
  if (!status || !status.active) return false;

  _active = true;
  _mode = status.mode === "standard" ? "standard" : "rolling";
  _capturesTaken = status.capturesTaken || 0;
  _comments = Array.isArray(status.comments) ? status.comments.slice() : [];
  _mimeType = status.mimeType || "video/webm";
  _startedAt = status.startedAt || (Date.now() - (status.elapsedMs || 0));
  return true;
}

/**
 * Ask the offscreen document for its last-finalized recording. Used when the
 * page-side `_lastRecording` is null (e.g., lost to a page reload between
 * Stop and modal mount). Stashes the recording so getLastVideoRecording()
 * returns it for the rest of the page's lifetime.
 *
 * Returns the recovered recording, or null if the offscreen has no
 * recording to give (e.g., never started, already cleared, RPC failed).
 */
export async function restoreLastRecordingFromOffscreen(): Promise<VideoRecording | null> {
  if (!isExtensionContext()) return null;
  if (isUsableRecording(_lastRecording)) return _lastRecording;
  try {
    const raw = await rpcCall<any>("tb:rec:last-recording").catch(() => null);
    if (!raw) return null;
    const recording = hydrateRecording(raw);
    if (isUsableRecording(recording)) {
      revokeAndStash(recording);
      return recording;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Auto-stop subscription (extension mode only) ─────────────────────────
// Wired once at init. Listens for the content-script's auto-stop relay.

let _autoStopWired = false;
export function wireAutoStopListener(): void {
  if (_autoStopWired || typeof window === "undefined") return;
  _autoStopWired = true;
  window.addEventListener("tracebug-rec-auto-stopped", async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    const recRaw = detail?.recording;
    let recording = recRaw ? hydrateRecording(recRaw) : null;
    // The broadcast can carry an empty stub if the offscreen finalized
    // before any chunks flushed, or if the IPC dropped the dataUrl. Fall
    // back to a direct RPC pull so the modal still gets the real video.
    if (!isUsableRecording(recording)) {
      try {
        const raw = await rpcCall<any>("tb:rec:last-recording").catch(() => null);
        const pulled = raw ? hydrateRecording(raw) : null;
        if (isUsableRecording(pulled)) recording = pulled;
      } catch {}
    }
    if (recording && isUsableRecording(recording)) revokeAndStash(recording);
    finalizeStop(recording);
    _onAutoStop?.(recording);
  });
}

// ── Recording-started subscription (extension mode only) ─────────────────
// Mirror of wireAutoStopListener: the offscreen broadcasts tb:rec:started the
// moment capture begins; the content-script relays it as `tracebug-rec-started`.
// We flip the page-side recording state (in case the start RPC reported
// cancelled by mistake) and let the SDK mount the HUD. Idempotent — the HUD
// guards double-mounts and we no-op if already active.

let _onStarted: (() => void) | null = null;
export function setStartedHandler(cb: (() => void) | null): void { _onStarted = cb; }

let _startedWired = false;
export function wireStartedListener(): void {
  if (_startedWired || typeof window === "undefined") return;
  _startedWired = true;
  window.addEventListener("tracebug-rec-started", (e: Event) => {
    const d = ((e as CustomEvent).detail || {}) as {
      startedAt?: number; mode?: string; mimeType?: string;
      micRequested?: boolean; micIncluded?: boolean;
    };
    if (!_active) {
      _active = true;
      _startedAt = typeof d.startedAt === "number" ? d.startedAt : Date.now();
      _mode = d.mode === "standard" ? "standard" : "rolling";
      _mimeType = typeof d.mimeType === "string" && d.mimeType ? d.mimeType : "video/webm";
    }
    // Mic was requested but the extension lacks microphone permission (an
    // offscreen document can't prompt). Tell the user where to grant it.
    if (d.micRequested && d.micIncluded === false) {
      const root = document.getElementById("tracebug-root");
      if (root) {
        import("./ui/toast")
          .then((m) => m.showToast("Recording without mic — turn on the microphone toggle in the TraceBug extension popup (it'll ask for permission), then record again.", root))
          .catch(() => {});
      }
    }
    _onStarted?.();
  });
}

// ── In-page transport (preserved unchanged) ──────────────────────────────

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const MR = (window as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  for (const t of candidates) {
    if (MR.isTypeSupported(t)) return t;
  }
  return "";
}

async function startVideoRecordingInPage(
  requestedMode: "rolling" | "standard",
  options?: { withMicrophone?: boolean; surfaceMode?: "tab" | "desktop" }
): Promise<boolean> {
  if (!isVideoSupported()) {
    _onStatus?.("error", "Screen recording is not supported in this browser.");
    return false;
  }

  let displayStream: MediaStream;
  try {
    // For surfaceMode === "tab" we hint the browser to pre-select the
    // current tab. These constraints are best-effort — the spec only
    // recently added them and older Chromium silently ignores unknown
    // keys, so falling back to the standard picker is automatic.
    const constraints: any = {
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    };
    if (options?.surfaceMode === "tab") {
      constraints.preferCurrentTab = true;
      constraints.selfBrowserSurface = "include";
      constraints.surfaceSwitching = "exclude";
      constraints.systemAudio = "exclude";
    }
    displayStream = await navigator.mediaDevices.getDisplayMedia(constraints as MediaStreamConstraints);
  } catch (err: any) {
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
      _onStatus?.("stopped", "cancelled");
      return false;
    }
    _onStatus?.("error", err?.message || "Could not start screen capture.");
    return false;
  }

  if (options?.withMicrophone) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStream.getAudioTracks().forEach(t => displayStream.addTrack(t));
    } catch {}
  }

  _stream = displayStream;
  _chunks = [];
  _comments = [];
  _startedAt = Date.now();
  _mimeType = pickMimeType();
  _mode = requestedMode;
  _capturesTaken = 0;

  try {
    _recorder = _mimeType
      ? new MediaRecorder(displayStream, { mimeType: _mimeType })
      : new MediaRecorder(displayStream);
  } catch (err: any) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
    _onStatus?.("error", err?.message || "MediaRecorder could not be created.");
    return false;
  }

  _recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data && e.data.size > 0) _chunks.push(e.data);
  };

  // Native "Stop sharing" → finalize the recording AND fire the auto-stop
  // callback so the SDK's host (toolbar) can reset its button state, hide
  // the recording HUD, and open the bug ticket modal. Without this, the
  // toolbar stays "recording…" forever from the user's POV.
  displayStream.getVideoTracks().forEach(track => {
    track.addEventListener("ended", async () => {
      // Ignore the `ended` we trigger ourselves by calling track.stop() during
      // a normal stop — only the user's native "Stop sharing" should auto-stop.
      if (!_active || _stopping) return;
      try {
        const recording = await stopVideoRecording();
        _onAutoStop?.(recording);
      } catch {
        _onAutoStop?.(null);
      }
    });
  });

  _recorder.start(1000);
  _active = true;
  _paused = false;
  _pausedMs = 0;
  _pausedAt = 0;

  // Page-reload safety net: warn the user, and finalize chunks on pagehide.
  installInPageReloadGuards();

  // Schedule the 2-min cloud-share cap — warnings at 1:30 / 1:55, auto-stop
  // at 2:00. Cleared on any stop path so manual stops don't double-fire.
  scheduleDurationCap();

  _onStatus?.("recording");
  return true;
}

function stopVideoRecordingInPage(): Promise<VideoRecording | null> {
  return new Promise((resolve) => {
    if (!_recorder || _recorder.state === "inactive") {
      finalizeStop(null);
      resolve(null);
      return;
    }
    _stopping = true;
    const recorder = _recorder;
    const stream = _stream;
    const startedAt = _startedAt;
    const mimeType = _mimeType || "video/webm";
    const comments = _comments.slice();

    recorder.onstop = async () => {
      const blob = new Blob(_chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      // Encode to base64 dataUrl so revokeAndStash()'s isUsableRecording
      // check passes AND the HTML exporter has a stable string source that
      // survives modal close / re-open / page reload (blob URLs get revoked).
      let dataUrl: string | undefined;
      try { dataUrl = await blobToDataUrl(blob); } catch { dataUrl = undefined; }
      const recording: VideoRecording = {
        url, blob, dataUrl,
        durationMs: Date.now() - startedAt,
        mimeType,
        sizeBytes: blob.size,
        comments,
        startedAt,
      };

      revokeAndStash(recording);
      stream?.getTracks().forEach(t => t.stop());
      _recorder = null;
      _stream = null;
      _chunks = [];
      finalizeStop(recording);
      _onStatus?.("stopped");
      resolve(recording);
    };

    try { recorder.stop(); } catch { resolve(null); }
  });
}

// FileReader-based blob → base64 dataUrl. Returns a Promise so the in-page
// recording path can await it before stashing.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

function captureRollingBufferInPage(): Promise<VideoRecording | null> {
  return new Promise((resolve) => {
    if (!_recorder || _recorder.state !== "recording") {
      resolve(null);
      return;
    }

    const recorder = _recorder;
    const startedAt = _startedAt;
    const mimeType = _mimeType || "video/webm";
    const commentsCopy = _comments.slice();
    const originalOnData = recorder.ondataavailable;

    const flushOnce = async (e: BlobEvent) => {
      if (originalOnData) originalOnData.call(recorder, e);
      recorder.ondataavailable = originalOnData;

      const blob = new Blob(_chunks.slice(), { type: mimeType });
      const url = URL.createObjectURL(blob);
      // Same rationale as stopVideoRecordingInPage — generate dataUrl so
      // revokeAndStash() accepts the recording and the exporter can embed it.
      let dataUrl: string | undefined;
      try { dataUrl = await blobToDataUrl(blob); } catch { dataUrl = undefined; }
      const recording: VideoRecording = {
        url, blob, dataUrl,
        durationMs: Date.now() - startedAt,
        mimeType,
        sizeBytes: blob.size,
        comments: commentsCopy,
        startedAt,
      };

      revokeAndStash(recording);
      _capturesTaken += 1;
      _comments = [];
      resolve(recording);
    };
    recorder.ondataavailable = flushOnce;

    try { recorder.requestData(); }
    catch { recorder.ondataavailable = originalOnData; resolve(null); }
  });
}

// ── In-page reload guards (Option A — graceful fallback) ────────────────
// Browsers won't let us preserve a MediaStream across reload from page JS,
// so the best we can do is:
//   1. Warn before reload via beforeunload (browser shows native confirm).
//   2. On pagehide, finalize whatever's in the buffer + auto-download. The
//      user still has to re-pick the screen after reload, but they don't
//      silently lose the footage they captured before.
// Only installed in in-page mode; the extension transport doesn't need it.

let _reloadGuardsInstalled = false;
function installInPageReloadGuards(): void {
  if (_reloadGuardsInstalled) return;
  _reloadGuardsInstalled = true;

  window.addEventListener("beforeunload", (e) => {
    if (!_active || isExtensionContext()) return;
    e.preventDefault();
    // Modern browsers ignore custom strings; the prompt is a generic "Reload?"
    e.returnValue = "Recording in progress. Reload anyway? (Your video will be auto-saved.)";
  });

  window.addEventListener("pagehide", () => {
    if (!_active || isExtensionContext()) return;
    if (!_recorder || _recorder.state === "inactive") return;
    try { _recorder.requestData(); } catch {}
    // Synchronous-ish: assemble the chunks we already have and trigger a
    // download. The browser keeps the page alive long enough for the click().
    try {
      const blob = new Blob(_chunks.slice(), { type: _mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tracebug-recording-interrupted-${stamp}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {}
  });
}

// ── Shared finalization helpers ──────────────────────────────────────────

function finalizeStop(_recording: VideoRecording | null): void {
  _active = false;
  _stopping = false;
  _comments = [];
  _capturesTaken = 0;
  _startedAt = 0;
  _mode = "rolling";
  // Clear duration-cap timers so a stop-then-restart sequence doesn't fire
  // stale warnings on the new recording.
  clearDurationCapTimers();
}

function isUsableRecording(rec: VideoRecording | null | undefined): rec is VideoRecording {
  // A recording is only useful if it carries real bytes. Empty dataUrl
  // means the offscreen flushed no chunks (broadcast race, recorder
  // started/stopped instantly, IPC drop). Treat as missing so the
  // recovery path can pull a better one from the offscreen.
  if (!rec) return false;
  if (typeof rec.dataUrl !== "string" || !rec.dataUrl.startsWith("data:")) return false;
  const comma = rec.dataUrl.indexOf(",");
  // "data:video/webm;base64," with no payload is ~30 chars. Real recordings
  // are tens of KB minimum even for a single frame.
  if (comma < 0 || rec.dataUrl.length - comma - 1 < 100) return false;
  return true;
}

function revokeAndStash(recording: VideoRecording): void {
  if (!isUsableRecording(recording)) return; // never let an empty stub overwrite a real one
  if (_lastRecording && _lastRecording.url !== recording.url) {
    try { URL.revokeObjectURL(_lastRecording.url); } catch {}
  }
  _lastRecording = recording;
}

/**
 * Reconstruct a VideoRecording from the offscreen document's wire format
 * (which uses base64 dataUrl since Blob doesn't survive chrome.runtime
 * messaging). Decodes back to a Blob + creates a fresh Blob URL.
 */
function hydrateRecording(raw: any): VideoRecording {
  const dataUrl: string = raw?.dataUrl || "";
  const mimeType: string = raw?.mimeType || "video/webm";
  const blob = dataUrlToBlob(dataUrl, mimeType);
  // If atob couldn't decode the body, blob is empty (0 bytes). The dataUrl
  // itself still works as a <video src=...> source, so fall back to using
  // it directly instead of producing a broken blob URL. The exporter
  // reads recording.dataUrl, not recording.url, so this only affects
  // in-modal playback.
  const url = blob.size > 0
    ? URL.createObjectURL(blob)
    : (dataUrl && dataUrl.startsWith("data:") ? dataUrl : URL.createObjectURL(blob));
  return {
    url,
    blob,
    dataUrl,
    durationMs: Number(raw?.durationMs) || 0,
    mimeType,
    sizeBytes: typeof raw?.sizeBytes === "number" ? raw.sizeBytes : blob.size,
    comments: Array.isArray(raw?.comments) ? raw.comments.slice() : [],
    startedAt: Number(raw?.startedAt) || Date.now(),
  };
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  if (!dataUrl) return new Blob([], { type: fallbackMime });
  // Locate the `;base64,` marker — splitting on the FIRST `,` is wrong
  // because the mime type itself can contain commas (e.g.
  // `video/webm;codecs=vp9,opus`). The base64 body always starts right
  // after the literal `;base64,` separator.
  const marker = ";base64,";
  const markerIdx = dataUrl.indexOf(marker);
  let meta: string;
  let body: string;
  if (markerIdx >= 0) {
    meta = dataUrl.slice(0, markerIdx);
    body = dataUrl.slice(markerIdx + marker.length).replace(/\s+/g, "");
  } else {
    // URL-encoded data URL (not base64). We don't emit these for video,
    // but degrade gracefully — fallback to last-comma split.
    const comma = dataUrl.lastIndexOf(",");
    if (comma < 0) return new Blob([], { type: fallbackMime });
    meta = dataUrl.slice(0, comma);
    body = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  }
  // mime type sits between `data:` and the first `;` or `,` after it.
  const mime = (meta.match(/^data:([^;,]+)/)?.[1]) || fallbackMime;
  try {
    const binary = atob(body);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (err) {
    // atob fails on non-base64 input. We don't actually need the bytes
    // for the export (the dataUrl gets embedded as-is), and the dataUrl
    // still works as a media src for in-modal playback when the page's
    // CSP allows it. Log and return an empty blob so the caller's flow
    // doesn't throw.
    console.warn("[TraceBug] dataUrlToBlob: atob failed, falling back to empty blob. body len =", body.length, "err =", (err as Error)?.message);
    return new Blob([], { type: mime });
  }
}

// ── RPC helper (page → content script → background → offscreen) ─────────

let _rpcCounter = 0;

function rpcCall<T = unknown>(type: string, data?: any, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = `tb_rpc_${++_rpcCounter}_${Date.now().toString(36)}`;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.id !== id) return;
      window.removeEventListener("tracebug-rec-response", handler);
      clearTimeout(timer);
      if (detail.error) reject(new Error(detail.error));
      else resolve(detail.result as T);
    };
    window.addEventListener("tracebug-rec-response", handler);

    const timer = setTimeout(() => {
      window.removeEventListener("tracebug-rec-response", handler);
      reject(new Error(`RPC timeout: ${type}`));
    }, timeoutMs);

    window.dispatchEvent(new CustomEvent("tracebug-rec-request", {
      detail: { id, type, data },
    }));
  });
}
