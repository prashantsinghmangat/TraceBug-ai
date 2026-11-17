// ── Video trim (ticket modal) ─────────────────────────────────────────────
// A trim bar under the recording in the ticket modal, and the cut itself.
//
// The cut is a real cut — the downloaded .webm and the .html export lose the
// trimmed parts — done with zero dependencies: the kept range is played in a
// hidden <video> and re-recorded through captureStream() (mozCaptureStream()
// in Firefox) into a MediaRecorder. That runs in real time (a 40 s clip takes
// ~40 s), shown with a progress bar and a Cancel. Cutting the WebM container
// directly would be instant but MediaRecorder output has no reliable
// keyframes after the first frame, so a start cut would leave undecodable
// video; re-encoding is the safe way.
//
// The trimmed copy replaces the page's in-memory recording for this ticket
// (download, export, Grab frame). It is not written back to the extension's
// stored copy: a page reload before export brings the full recording back.
//
// On sites whose CSP blocks in-page video (GitHub), the ticket plays the
// recording in the extension's player frame; the trim bar then drives that
// frame (TrimMedia) and the cut runs inside it (player.js, same method).

import { setInnerHTML } from "./helpers";
import type { VideoComment } from "../video-recorder";

/** Shortest clip we let the user keep. */
export const MIN_KEEP_S = 0.5;

/** Clamp a [start, end] selection to the clip, keeping at least MIN_KEEP_S. */
export function clampTrim(start: number, end: number, duration: number, moving: "start" | "end"): { start: number; end: number } {
  const d = Math.max(0, duration);
  let s = Math.min(Math.max(0, start), d);
  let e = Math.min(Math.max(0, end), d);
  const gap = Math.min(MIN_KEEP_S, d);
  if (e - s < gap) {
    if (moving === "start") s = Math.max(0, e - gap);
    else e = Math.min(d, s + gap);
  }
  return { start: s, end: e };
}

/** True when the selection keeps the whole clip (nothing to cut). */
export function isWholeClip(start: number, end: number, duration: number): boolean {
  return start <= 0.05 && end >= duration - 0.05;
}

/** Comments re-timed to the trimmed clip; those outside it are dropped. */
export function trimComments(comments: VideoComment[], startS: number, endS: number): VideoComment[] {
  const a = startS * 1000, b = endS * 1000;
  return comments
    .filter((c) => c.offsetMs >= a && c.offsetMs <= b)
    .map((c) => ({ ...c, offsetMs: Math.round(c.offsetMs - a) }));
}

export function formatClock(s: number): string {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1)}`;
}

// ── Cut ──────────────────────────────────────────────────────────────────

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

/** Can this browser cut a recording? (captureStream + MediaRecorder) */
export function canCutVideo(): boolean {
  if (typeof MediaRecorder === "undefined" || typeof document === "undefined") return false;
  const proto = HTMLMediaElement.prototype as unknown as CapturableVideo;
  return typeof proto.captureStream === "function" || typeof proto.mozCaptureStream === "function";
}

export interface CutOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Re-record [startS, endS] of `blob` into a new Blob of the same type. */
export async function cutVideo(blob: Blob, mimeType: string, startS: number, endS: number, opts: CutOptions = {}): Promise<Blob> {
  if (!canCutVideo()) throw new Error("This browser can't cut video");
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video") as CapturableVideo;
  v.dataset.tracebug = "trim-encoder";
  v.playsInline = true;
  v.preload = "auto";
  // In the page but invisible: some engines throttle detached media.
  v.setAttribute("style", "position:fixed!important;left:0!important;top:0!important;width:2px!important;height:2px!important;opacity:0!important;pointer-events:none!important;z-index:-1!important");
  document.body.appendChild(v);
  let raf = 0;
  const cleanup = () => {
    if (raf) cancelAnimationFrame(raf);
    try { v.pause(); } catch {}
    v.removeAttribute("src");
    try { v.load(); } catch {}
    v.remove();
    URL.revokeObjectURL(url);
  };
  try {
    v.src = url;
    await _once(v, "loadedmetadata", opts.signal);
    v.currentTime = startS;
    await _once(v, "seeked", opts.signal);

    // Firefox's mozCaptureStream routes the audio into the stream instead of
    // the speakers; Chrome's captureStream keeps the element's own output, so
    // drop that to silence (volume does not reach the captured track).
    const stream = typeof v.captureStream === "function" ? v.captureStream() : v.mozCaptureStream!();
    v.volume = 0;
    const type = mimeType && MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
    const chunks: Blob[] = [];

    await v.play();
    // Tracks join the captured stream once frames flow.
    const t0 = performance.now();
    while (stream.getVideoTracks().length === 0 && performance.now() - t0 < 3000) {
      if (opts.signal?.aborted) throw _abortError();
      await new Promise((r) => requestAnimationFrame(r));
    }
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
    rec.start(1000);

    await new Promise<void>((resolve, reject) => {
      const span = Math.max(0.001, endS - startS);
      const finish = () => { v.pause(); if (rec.state !== "inactive") rec.stop(); resolve(); };
      const tick = () => {
        raf = 0;
        if (opts.signal?.aborted) { v.pause(); if (rec.state !== "inactive") rec.stop(); reject(_abortError()); return; }
        const t = v.currentTime;
        opts.onProgress?.(Math.min(1, Math.max(0, (t - startS) / span)));
        if (t >= endS || v.ended) { finish(); return; }
        raf = requestAnimationFrame(tick);
      };
      v.addEventListener("ended", finish, { once: true });
      v.addEventListener("error", () => reject(new Error("The recording could not be decoded")), { once: true });
      raf = requestAnimationFrame(tick);
    });
    await stopped;
    opts.onProgress?.(1);
    const out = new Blob(chunks, { type });
    if (out.size === 0) throw new Error("The cut produced no video");
    return out;
  } finally {
    cleanup();
  }
}

function _abortError(): Error {
  const e = new Error("Cancelled");
  e.name = "AbortError";
  return e;
}

function _once(target: EventTarget, type: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(_abortError()); return; }
    const done = () => { target.removeEventListener(type, done); signal?.removeEventListener("abort", abort); resolve(); };
    const abort = () => { target.removeEventListener(type, done); reject(_abortError()); };
    target.addEventListener(type, done);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// ── Trim bar ─────────────────────────────────────────────────────────────

/**
 * What the trim bar needs from a player. A page <video> (mediaOfVideo), or
 * the extension's player frame on sites whose CSP blocks in-page video
 * (quick-bug.ts builds that one over postMessage).
 */
export interface TrimMedia {
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  pause(): void;
  seek(seconds: number): void;
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export function mediaOfVideo(v: HTMLVideoElement): TrimMedia {
  return {
    get currentTime() { return v.currentTime; },
    get duration() { return v.duration; },
    get paused() { return v.paused; },
    pause: () => v.pause(),
    seek: (t) => { v.currentTime = t; },
    addEventListener: (t, f) => v.addEventListener(t, f),
    removeEventListener: (t, f) => v.removeEventListener(t, f),
  };
}

export interface TrimBarHandle {
  destroy(): void;
  /** Show cut progress (0..1) or clear it with null. */
  setBusy(fraction: number | null): void;
  setError(message: string | null): void;
}

/**
 * Mount the trim bar into `host` for `video`. Dragging a handle previews that
 * frame; playback stays inside the kept range. `onCut(start, end)` runs when
 * the user confirms; `onCancel` when they cancel a cut in progress.
 */
export function mountTrimBar(
  host: HTMLElement,
  player: HTMLVideoElement | TrimMedia,
  durationS: number,
  handlers: { onCut: (startS: number, endS: number) => void; onCancel: () => void },
): TrimBarHandle {
  const video: TrimMedia = typeof HTMLVideoElement !== "undefined" && player instanceof HTMLVideoElement ? mediaOfVideo(player) : (player as TrimMedia);
  const canCut = canCutVideo();
  let duration = durationS > 0 ? durationS : 0;
  let start = 0, end = duration;
  let busy = false;

  setInnerHTML(host, `
    <div class="tb-trim-head">
      <span class="tb-trim-title">Trim</span>
      <span class="tb-trim-label" data-tb-trim="label"></span>
    </div>
    <div class="tb-trim-track" data-tb-trim="track">
      <div class="tb-trim-out" data-tb-trim="out-l"></div>
      <div class="tb-trim-keep" data-tb-trim="keep"></div>
      <div class="tb-trim-out" data-tb-trim="out-r"></div>
      <div class="tb-trim-head-line" data-tb-trim="playhead"></div>
      <button type="button" class="tb-trim-handle" data-tb-trim="h-start" role="slider" aria-label="Keep from"></button>
      <button type="button" class="tb-trim-handle" data-tb-trim="h-end" role="slider" aria-label="Keep until"></button>
    </div>
    <div class="tb-trim-foot">
      <span class="tb-trim-hint" data-tb-trim="hint">Drag the handles to keep only the part that shows the bug.</span>
      <span class="tb-trim-actions">
        <button type="button" class="tb-trim-btn" data-tb-trim="reset" disabled>Reset</button>
        <button type="button" class="tb-trim-btn tb-trim-btn-primary" data-tb-trim="cut" disabled>Cut</button>
      </span>
    </div>
    <div class="tb-trim-progress" data-tb-trim="progress" hidden><span data-tb-trim="bar"></span></div>
  `);
  host.classList.add("tb-trim");
  const q = <T extends HTMLElement>(k: string) => host.querySelector<T>(`[data-tb-trim="${k}"]`)!;
  const track = q("track"), keep = q("keep"), outL = q("out-l"), outR = q("out-r"), playhead = q("playhead");
  const hStart = q<HTMLButtonElement>("h-start"), hEnd = q<HTMLButtonElement>("h-end");
  const label = q("label"), hint = q("hint"), progress = q("progress"), bar = q("bar");
  const resetBtn = q<HTMLButtonElement>("reset"), cutBtn = q<HTMLButtonElement>("cut");

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const render = () => {
    const a = pct(start), b = pct(end);
    outL.style.width = `${a}%`;
    outR.style.left = `${b}%`;
    outR.style.width = `${100 - b}%`;
    keep.style.left = `${a}%`;
    keep.style.width = `${b - a}%`;
    hStart.style.left = `${a}%`;
    hEnd.style.left = `${b}%`;
    hStart.setAttribute("aria-valuenow", start.toFixed(1));
    hEnd.setAttribute("aria-valuenow", end.toFixed(1));
    hStart.setAttribute("aria-valuetext", formatClock(start));
    hEnd.setAttribute("aria-valuetext", formatClock(end));
    hStart.setAttribute("aria-valuemax", duration.toFixed(1));
    hEnd.setAttribute("aria-valuemax", duration.toFixed(1));
    const whole = isWholeClip(start, end, duration);
    label.textContent = whole
      ? `${formatClock(duration)} · nothing cut`
      : `Keep ${formatClock(start)}–${formatClock(end)} · ${formatClock(end - start)} of ${formatClock(duration)}`;
    resetBtn.disabled = busy || whole;
    cutBtn.disabled = busy || whole || !canCut;
    hStart.disabled = hEnd.disabled = busy;
  };
  const renderPlayhead = () => {
    playhead.style.left = `${pct(Math.min(video.currentTime || 0, duration))}%`;
  };

  const set = (which: "start" | "end", t: number) => {
    const r = clampTrim(which === "start" ? t : start, which === "end" ? t : end, duration, which);
    start = r.start; end = r.end;
    render();
  };
  const seekPreview = (t: number) => { try { video.pause(); video.seek(Math.min(Math.max(0, t), Math.max(0, duration - 0.04))); } catch {} };
  const timeAt = (clientX: number) => {
    const r = track.getBoundingClientRect();
    return r.width > 0 ? ((clientX - r.left) / r.width) * duration : 0;
  };

  // Handle drag (pointer events + capture — works for mouse, pen and touch).
  const bindHandle = (h: HTMLButtonElement, which: "start" | "end") => {
    h.addEventListener("pointerdown", (e) => {
      if (busy || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { h.setPointerCapture(e.pointerId); } catch {}
      h.focus();
      const move = (ev: PointerEvent) => { set(which, timeAt(ev.clientX)); seekPreview(which === "start" ? start : end); };
      const up = () => {
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
        h.removeEventListener("pointercancel", up);
      };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
      h.addEventListener("pointercancel", up);
    });
    h.addEventListener("keydown", (e) => {
      if (busy) return;
      const step = e.shiftKey ? 1 : 0.1;
      const cur = which === "start" ? start : end;
      let next: number | null = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = duration;
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      set(which, next);
      seekPreview(which === "start" ? start : end);
    });
  };
  bindHandle(hStart, "start");
  bindHandle(hEnd, "end");

  // Click the track to move the playhead (inside the kept range).
  track.addEventListener("pointerdown", (e) => {
    if (busy || (e.target as HTMLElement).closest(".tb-trim-handle")) return;
    seekPreview(Math.min(Math.max(timeAt(e.clientX), start), end));
  });

  // Playback stays inside the kept range while a trim is pending.
  const onTime = () => {
    renderPlayhead();
    if (busy || isWholeClip(start, end, duration)) return;
    if (!video.paused && video.currentTime >= end) { video.pause(); try { video.seek(end); } catch {} }
  };
  const onPlay = () => {
    if (busy || isWholeClip(start, end, duration)) return;
    if (video.currentTime < start - 0.05 || video.currentTime >= end - 0.05) { try { video.seek(start); } catch {} }
  };
  // The real duration can arrive late (MediaRecorder WebM has no header).
  const onMeta = () => {
    const d = video.duration;
    if (isFinite(d) && d > 0 && Math.abs(d - duration) > 0.25 && d < duration * 4 + 5) {
      const wasWhole = isWholeClip(start, end, duration);
      duration = d;
      if (wasWhole) { start = 0; end = d; }
      else { const r = clampTrim(start, end, d, "end"); start = r.start; end = r.end; }
      render();
    }
  };
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("seeked", onTime);
  video.addEventListener("play", onPlay);
  video.addEventListener("durationchange", onMeta);

  resetBtn.addEventListener("click", () => { start = 0; end = duration; render(); });
  cutBtn.addEventListener("click", () => {
    if (busy || isWholeClip(start, end, duration)) return;
    handlers.onCut(start, end);
  });

  if (!canCut) hint.textContent = "This browser can't cut video here — download the .webm and trim it in any editor.";

  render();
  renderPlayhead();

  let cancelBtn: HTMLButtonElement | null = null;
  return {
    destroy() {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("seeked", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("durationchange", onMeta);
      host.remove();
    },
    setBusy(fraction) {
      busy = fraction !== null;
      progress.hidden = !busy;
      if (busy) {
        bar.style.width = `${Math.round((fraction as number) * 100)}%`;
        hint.textContent = `Cutting… ${Math.round((fraction as number) * 100)}% (plays the kept part once, in real time)`;
        if (!cancelBtn) {
          cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "tb-trim-btn";
          cancelBtn.dataset.tbTrim = "cancel";
          cancelBtn.textContent = "Cancel";
          cancelBtn.addEventListener("click", () => handlers.onCancel());
          q("reset").parentElement!.prepend(cancelBtn);
        }
      } else {
        cancelBtn?.remove();
        cancelBtn = null;
        hint.textContent = "Drag the handles to keep only the part that shows the bug.";
      }
      render();
    },
    setError(message) {
      if (message) { hint.textContent = message; hint.dataset.tbError = "1"; }
      else { delete hint.dataset.tbError; }
    },
  };
}

/** Styles for the trim bar, scoped under the modal id. */
export function trimBarCss(scope: string): string {
  const S = `${scope} .tb-trim`;
  return `
    ${S} { margin: -4px 0 14px; user-select: none; }
    ${S} .tb-trim-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; font-size:11px; }
    ${S} .tb-trim-title { font-weight:600; color:var(--tb-text-secondary); text-transform:uppercase; letter-spacing:0.04em; font-size:10px; }
    ${S} .tb-trim-label { color:var(--tb-text-muted); font-variant-numeric:tabular-nums; }
    ${S} .tb-trim-track { position:relative; height:28px; border-radius:var(--tb-radius-sm, 8px); background:var(--tb-bg-secondary); border:1px solid var(--tb-border); cursor:pointer; touch-action:none; }
    ${S} .tb-trim-keep { position:absolute; top:0; bottom:0; background:var(--tb-accent-subtle, rgba(255,92,108,0.1)); border-top:2px solid var(--tb-accent); border-bottom:2px solid var(--tb-accent); box-sizing:border-box; }
    ${S} .tb-trim-out { position:absolute; top:0; bottom:0; left:0; background:repeating-linear-gradient(135deg, rgba(127,127,127,0.18) 0 4px, transparent 4px 8px); border-radius:inherit; }
    ${S} .tb-trim-head-line { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; background:var(--tb-text-primary); border-radius:1px; pointer-events:none; }
    ${S} .tb-trim-handle { position:absolute; top:-3px; bottom:-3px; width:12px; margin-left:-6px; padding:0; border:none; border-radius:4px; background:var(--tb-accent); cursor:ew-resize; box-shadow:0 1px 3px rgba(0,0,0,0.3); }
    ${S} .tb-trim-handle::after { content:""; position:absolute; left:5px; top:30%; bottom:30%; width:2px; border-radius:1px; background:var(--tb-on-accent, #fff); opacity:0.8; }
    ${S} .tb-trim-handle:focus-visible { outline:2px solid var(--tb-ring, var(--tb-accent)); outline-offset:2px; }
    ${S} .tb-trim-handle:disabled { cursor:default; opacity:0.6; }
    ${S} .tb-trim-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:8px; font-size:11px; }
    ${S} .tb-trim-hint { color:var(--tb-text-muted); }
    ${S} .tb-trim-hint[data-tb-error="1"] { color:var(--tb-error); }
    ${S} .tb-trim-actions { display:inline-flex; gap:6px; flex-shrink:0; }
    ${S} .tb-trim-btn { font-weight:600; font-size:11px; font-family:inherit; padding:5px 10px; border-radius:var(--tb-radius-sm, 8px); border:1px solid var(--tb-border); background:transparent; color:var(--tb-text-secondary); cursor:pointer; }
    ${S} .tb-trim-btn:hover:not(:disabled) { color:var(--tb-text-primary); border-color:var(--tb-border-hover); }
    ${S} .tb-trim-btn:disabled { opacity:0.45; cursor:default; }
    ${S} .tb-trim-btn-primary { background:var(--tb-accent); border-color:var(--tb-accent); color:var(--tb-on-accent); }
    ${S} .tb-trim-btn-primary:hover:not(:disabled) { color:var(--tb-on-accent); filter:brightness(1.08); }
    ${S} .tb-trim-progress { height:3px; margin-top:8px; border-radius:2px; background:var(--tb-bg-secondary); overflow:hidden; }
    ${S} .tb-trim-progress > span { display:block; height:100%; width:0; background:var(--tb-accent); transition:width 0.2s linear; }
  `;
}
