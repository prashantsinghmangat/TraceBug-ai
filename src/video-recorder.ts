// ── Video Recorder ────────────────────────────────────────────────────────
// Wraps getDisplayMedia + MediaRecorder for screen recording. Captures the
// selected screen/window/tab as a webm Blob; chunks accumulate in memory and
// the final Blob URL is returned on stop. The user picks the surface via the
// browser's native picker — no permission storage needed.
//
// Comments added during recording are timestamped relative to recording start
// so they can be synced to the video on playback in the Quick Bug modal.
//
// No backend. Blob lives in memory only — like screenshots, it dies on page
// reload, so the user must export before navigating away.

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
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  comments: VideoComment[];
  /** Wall-clock timestamp of when recording started. */
  startedAt: number;
}

let _recorder: MediaRecorder | null = null;
let _stream: MediaStream | null = null;
let _chunks: Blob[] = [];
let _startedAt = 0;
let _mimeType = "";
let _comments: VideoComment[] = [];
let _lastRecording: VideoRecording | null = null;
let _onStatus: ((status: "recording" | "stopped" | "error", message?: string) => void) | null = null;

/** True if the browser supports getDisplayMedia + MediaRecorder. */
export function isVideoSupported(): boolean {
  return !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof (window as any).MediaRecorder === "function"
  );
}

/** True while a recording is in progress. */
export function isVideoRecording(): boolean {
  return _recorder !== null && _recorder.state === "recording";
}

/** Milliseconds since recording started, or 0 if not recording. */
export function getVideoElapsedMs(): number {
  return isVideoRecording() ? Date.now() - _startedAt : 0;
}

/** Pick the best supported mime type for MediaRecorder, or "" if none work. */
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

/**
 * Start screen recording. Opens the browser's native picker; if the user
 * cancels, resolves to false silently.
 *
 * Set `withMicrophone: true` to mux a microphone track for narration. System
 * audio capture is opt-in via the picker UI on supported browsers.
 */
export async function startVideoRecording(options?: {
  withMicrophone?: boolean;
  onStatus?: (status: "recording" | "stopped" | "error", message?: string) => void;
}): Promise<boolean> {
  if (isVideoRecording()) return false;
  if (!isVideoSupported()) {
    options?.onStatus?.("error", "Screen recording is not supported in this browser.");
    return false;
  }

  _onStatus = options?.onStatus || null;

  let displayStream: MediaStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    } as MediaStreamConstraints);
  } catch (err: any) {
    // User cancelled the picker — treat as a silent no-op, not an error.
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
      _onStatus?.("stopped", "cancelled");
      return false;
    }
    _onStatus?.("error", err?.message || "Could not start screen capture.");
    return false;
  }

  // Optional: mux mic audio so the user can narrate over the recording.
  if (options?.withMicrophone) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStream.getAudioTracks().forEach(t => displayStream.addTrack(t));
    } catch {
      // Mic denied → continue without narration. Don't block the recording.
    }
  }

  _stream = displayStream;
  _chunks = [];
  _comments = [];
  _startedAt = Date.now();
  _mimeType = pickMimeType();

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

  // If the user clicks the browser's "Stop sharing" button, the track ends.
  // Auto-stop the recorder so we don't leak resources.
  displayStream.getVideoTracks().forEach(track => {
    track.addEventListener("ended", () => {
      if (isVideoRecording()) stopVideoRecording().catch(() => {});
    });
  });

  // Request data every 1s so the in-memory buffer stays small even if the
  // browser delays the final dataavailable event.
  _recorder.start(1000);
  _onStatus?.("recording");
  return true;
}

/**
 * Stop the recording and return the assembled blob + metadata. Resolves to
 * null if no recording is active.
 */
export function stopVideoRecording(): Promise<VideoRecording | null> {
  return new Promise((resolve) => {
    if (!_recorder || _recorder.state === "inactive") {
      resolve(null);
      return;
    }
    const recorder = _recorder;
    const stream = _stream;
    const startedAt = _startedAt;
    const mimeType = _mimeType || "video/webm";
    const comments = _comments.slice();

    recorder.onstop = () => {
      const blob = new Blob(_chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const recording: VideoRecording = {
        url,
        blob,
        durationMs: Date.now() - startedAt,
        mimeType,
        sizeBytes: blob.size,
        comments,
        startedAt,
      };

      // Revoke any previously stored recording's URL to avoid leaks.
      if (_lastRecording && _lastRecording.url !== url) {
        try { URL.revokeObjectURL(_lastRecording.url); } catch {}
      }
      _lastRecording = recording;

      stream?.getTracks().forEach(t => t.stop());
      _recorder = null;
      _stream = null;
      _chunks = [];
      _comments = [];

      _onStatus?.("stopped");
      resolve(recording);
    };

    try {
      recorder.stop();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Add a comment timestamped to the current recording position. No-op when
 * not recording.
 */
export function addVideoComment(text: string): VideoComment | null {
  if (!isVideoRecording()) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const c: VideoComment = { offsetMs: Date.now() - _startedAt, text: trimmed };
  _comments.push(c);
  return c;
}

/** Get the most recently captured recording (or null). */
export function getLastVideoRecording(): VideoRecording | null {
  return _lastRecording;
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
  if (_recorder && _recorder.state !== "inactive") {
    try { _recorder.stop(); } catch {}
  }
  _stream?.getTracks().forEach(t => t.stop());
  _recorder = null;
  _stream = null;
  _chunks = [];
  _comments = [];
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
