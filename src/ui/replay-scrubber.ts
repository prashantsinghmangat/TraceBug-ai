// ── Replay Scrubber ───────────────────────────────────────────────────────
// Event-driven horizontal timeline. Drag the handle (or click any marker) to
// "seek" through the session — the caller's `onSeek` callback receives the
// timestamp closest to the position so it can swap the screenshot preview
// and seek any attached video.
//
// Designed self-contained: no SDK imports beyond the TimelineEntry type so
// the same code can be inlined into the standalone HTML Replay Viewer.
//
// Marker color/shape mapping:
//   solid blue dot   → click / input / select / form_submit
//   solid cyan dot   → route_change
//   solid yellow dot → api_request (success)
//   red ⚠ flag       → error / unhandled_rejection / console_error / failed api
//   purple diamond   → mark (developer breadcrumb — Phase II A.3, future)

import { TimelineEntry } from "../types";

export interface ScrubberMarker {
  /** Absolute event timestamp (ms). */
  timestamp: number;
  /** Timeline entry behind this marker. */
  entry: TimelineEntry;
}

export interface MountReplayScrubberOptions {
  /** Timeline entries from `buildTimeline(events)`. */
  timeline: TimelineEntry[];
  /** Optional screenshots — used to show "preview swaps to nearest screenshot". */
  screenshots?: { timestamp: number; dataUrl: string }[];
  /** Optional video element to seek as the scrubber moves. */
  videoEl?: HTMLVideoElement | null;
  /** Called on every seek with the timestamp closest to the scrubber position. */
  onSeek?: (timestamp: number, marker?: ScrubberMarker) => void;
  /** Optional explicit start/end. Defaults to first/last marker timestamps. */
  startedAt?: number;
  endedAt?: number;
}

export interface ScrubberHandle {
  /** Move the scrubber to a specific timestamp. Triggers onSeek. */
  seek: (timestamp: number) => void;
  /** Tear down the scrubber and remove DOM listeners. */
  destroy: () => void;
}

const STYLE_ID = "tracebug-replay-scrubber-styles";

const MARKER_COLORS: Record<string, string> = {
  click: "#7B61FF",
  input: "#7B61FF",
  select_change: "#7B61FF",
  form_submit: "#7B61FF",
  route_change: "#22d3ee",
  api_request: "#facc15",
  error: "#ef4444",
  unhandled_rejection: "#ef4444",
  console_error: "#ef4444",
  mark: "#a855f7",
};

/**
 * Mount the scrubber inside `container`. Returns a handle for programmatic
 * seeking + cleanup. Safe to call multiple times — re-mount unmounts first.
 */
export function mountReplayScrubber(
  container: HTMLElement,
  options: MountReplayScrubberOptions
): ScrubberHandle {
  _injectStyles();

  // Tear down any prior mount inside the container.
  container.innerHTML = "";

  const timeline = options.timeline.slice().sort((a, b) => a.timestamp - b.timestamp);
  if (timeline.length === 0) {
    container.innerHTML = `<div class="tb-rs-empty">No events recorded yet.</div>`;
    return { seek: () => {}, destroy: () => { container.innerHTML = ""; } };
  }

  const screenshots = (options.screenshots || [])
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  // Compute span from events + screenshots + video so single-event sessions
  // (e.g. one click + one auto-captured screenshot taken several seconds
  // later) still show a meaningful timeline. Otherwise span === 1ms and the
  // scrubber renders "00:00 / 00:00".
  const allTs: number[] = [];
  for (const t of timeline) allTs.push(t.timestamp);
  for (const s of screenshots) allTs.push(s.timestamp);
  if (options.videoEl?.dataset.tbStartTs) {
    const v = Number(options.videoEl.dataset.tbStartTs);
    if (!isNaN(v)) allTs.push(v);
  }

  const minTs = allTs.length ? Math.min(...allTs) : timeline[0].timestamp;
  const maxTs = allTs.length ? Math.max(...allTs) : timeline[timeline.length - 1].timestamp;
  const startedAt = options.startedAt ?? minTs;
  const endedAt = options.endedAt ?? Math.max(maxTs, startedAt + 1000);
  // Floor at 1s so single-action sessions still show a draggable timeline.
  const span = Math.max(1000, endedAt - startedAt);
  const errorMarkers = timeline.filter(t => t.isError);

  // ── Build DOM ───────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.className = "tb-rs-root";
  root.dataset.tracebug = "replay-scrubber";
  root.tabIndex = 0;
  root.setAttribute("role", "slider");
  root.setAttribute("aria-label", "Session replay scrubber");

  const header = document.createElement("div");
  header.className = "tb-rs-header";
  const playBtn = document.createElement("button");
  playBtn.className = "tb-rs-play";
  playBtn.type = "button";
  playBtn.setAttribute("aria-label", "Play / pause (Space)");
  playBtn.title = "Play (Space)";
  playBtn.textContent = "▶";
  const time = document.createElement("span");
  time.className = "tb-rs-time";
  time.textContent = `00:00 / ${formatElapsed(span)}`;
  const speedSel = document.createElement("select");
  speedSel.className = "tb-rs-speed";
  speedSel.setAttribute("aria-label", "Playback speed");
  speedSel.title = "Playback speed";
  ["0.5", "1", "1.5", "2"].forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v + "×";
    if (v === "1") opt.selected = true;
    speedSel.appendChild(opt);
  });
  const jumpBtn = document.createElement("button");
  jumpBtn.className = "tb-rs-jump";
  jumpBtn.type = "button";
  jumpBtn.textContent = "Jump to error";
  jumpBtn.style.display = errorMarkers.length > 0 ? "inline-block" : "none";
  jumpBtn.title = errorMarkers.length === 1 ? "Seek to the error" : `Seek to first of ${errorMarkers.length} errors`;
  header.appendChild(playBtn);
  header.appendChild(time);
  header.appendChild(speedSel);
  header.appendChild(jumpBtn);

  const track = document.createElement("div");
  track.className = "tb-rs-track";

  const fill = document.createElement("div");
  fill.className = "tb-rs-fill";
  track.appendChild(fill);

  const markersLayer = document.createElement("div");
  markersLayer.className = "tb-rs-markers";
  track.appendChild(markersLayer);

  const handle = document.createElement("div");
  handle.className = "tb-rs-handle";
  handle.setAttribute("aria-hidden", "true");
  track.appendChild(handle);

  const tooltip = document.createElement("div");
  tooltip.className = "tb-rs-tooltip";
  tooltip.setAttribute("role", "tooltip");
  track.appendChild(tooltip);

  root.appendChild(header);
  root.appendChild(track);

  // ── Render markers ──────────────────────────────────────────────────────
  // Cap markers at 200 to avoid DOM thrash on long sessions; bucket the rest.
  const MAX_MARKERS = 200;
  const visible = timeline.length <= MAX_MARKERS
    ? timeline
    : evenSample(timeline, MAX_MARKERS);

  for (const entry of visible) {
    const m = document.createElement("div");
    const isError = entry.isError;
    const isMark = entry.type === "mark";
    m.className = isError
      ? "tb-rs-marker tb-rs-error"
      : isMark ? "tb-rs-marker tb-rs-mark" : "tb-rs-marker";
    m.style.left = `${pct(entry.timestamp, startedAt, span)}%`;
    m.style.background = isError ? MARKER_COLORS.error : (MARKER_COLORS[entry.type] || "#7B61FF");
    m.dataset.ts = String(entry.timestamp);
    m.dataset.desc = `${entry.elapsed} · ${entry.description}`;
    if (isError) m.textContent = "!";
    markersLayer.appendChild(m);
  }

  container.appendChild(root);

  // ── Seek state + helpers ────────────────────────────────────────────────
  let currentTs = startedAt;
  const fmtTime = (ts: number) => `${formatElapsed(ts - startedAt)} / ${formatElapsed(span)}`;

  const findClosestScreenshot = (ts: number) => {
    if (screenshots.length === 0) return null;
    let best = screenshots[0];
    let bestDelta = Math.abs(best.timestamp - ts);
    for (const s of screenshots) {
      const d = Math.abs(s.timestamp - ts);
      if (d < bestDelta) { best = s; bestDelta = d; }
    }
    return best;
  };

  const findClosestMarker = (ts: number): ScrubberMarker | undefined => {
    if (timeline.length === 0) return undefined;
    let best = timeline[0];
    let bestDelta = Math.abs(best.timestamp - ts);
    for (const e of timeline) {
      const d = Math.abs(e.timestamp - ts);
      if (d < bestDelta) { best = e; bestDelta = d; }
    }
    return { timestamp: best.timestamp, entry: best };
  };

  const renderHandle = () => {
    const p = pct(currentTs, startedAt, span);
    handle.style.left = `${p}%`;
    fill.style.width = `${p}%`;
    time.textContent = fmtTime(currentTs);
  };

  const seek = (ts: number, opts?: { snap?: boolean }) => {
    let next = Math.max(startedAt, Math.min(endedAt, ts));
    let marker: ScrubberMarker | undefined;
    if (opts?.snap !== false) {
      marker = findClosestMarker(next);
      if (marker) next = marker.timestamp;
    }
    currentTs = next;
    renderHandle();

    // Sync video time if attached.
    if (options.videoEl) {
      try {
        const vidStart = options.videoEl.dataset.tbStartTs
          ? Number(options.videoEl.dataset.tbStartTs)
          : startedAt;
        options.videoEl.currentTime = Math.max(0, (currentTs - vidStart) / 1000);
      } catch {}
    }

    options.onSeek?.(currentTs, marker);
  };

  // Initial position at first marker
  seek(timeline[0].timestamp);

  // ── Drag handling ───────────────────────────────────────────────────────
  let dragging = false;
  const trackToTs = (clientX: number): number => {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return startedAt + ratio * span;
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    seek(trackToTs(e.clientX), { snap: false });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging) seek(trackToTs(e.clientX), { snap: false });
    // Hover tooltip when not dragging
    const target = e.target as HTMLElement;
    if (!dragging && target?.classList?.contains("tb-rs-marker")) {
      tooltip.textContent = target.dataset.desc || "";
      tooltip.style.left = target.style.left;
      tooltip.style.opacity = "1";
    } else if (!dragging) {
      tooltip.style.opacity = "0";
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch {}
    // Snap to nearest marker on release
    seek(currentTs, { snap: true });
  };
  track.addEventListener("pointerdown", onPointerDown);
  track.addEventListener("pointermove", onPointerMove);
  track.addEventListener("pointerup", onPointerUp);
  track.addEventListener("pointerleave", () => { tooltip.style.opacity = "0"; });

  // Click on a marker → seek there
  markersLayer.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("tb-rs-marker")) return;
    const ts = Number(target.dataset.ts);
    if (!Number.isNaN(ts)) seek(ts, { snap: true });
  });

  // ── Play / pause + speed control ────────────────────────────────────────
  // Two modes:
  //   1. If a video element is attached, hand control over to it — the
  //      scrubber follows video.timeupdate so the dev gets buttery smooth
  //      replay at native browser frame rate.
  //   2. No video: simulate playback by stepping through events at the
  //      timing they originally fired, scaled by the speed multiplier.
  let isPlaying = false;
  let playTimer: ReturnType<typeof setTimeout> | null = null;
  let videoTickHandler: (() => void) | null = null;
  let speed = 1;

  const setPlayIcon = (playing: boolean) => {
    playBtn.textContent = playing ? "⏸" : "▶";
    playBtn.title = playing ? "Pause (Space)" : "Play (Space)";
    isPlaying = playing;
  };

  const stopPlay = () => {
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    if (options.videoEl && videoTickHandler) {
      options.videoEl.removeEventListener("timeupdate", videoTickHandler);
      options.videoEl.removeEventListener("pause", stopPlay);
      videoTickHandler = null;
    }
    setPlayIcon(false);
  };

  const playEvents = () => {
    // Advance through the timeline at real-time pace (scaled by speed).
    // Each event becomes a setTimeout that fires the seek + queues the next.
    const startIdx = timeline.findIndex(t => t.timestamp > currentTs);
    if (startIdx < 0 || startIdx >= timeline.length) { stopPlay(); return; }
    const tick = (i: number) => {
      if (!isPlaying || i >= timeline.length) { stopPlay(); return; }
      seek(timeline[i].timestamp, { snap: false });
      if (i + 1 >= timeline.length) { stopPlay(); return; }
      const wait = Math.max(60, (timeline[i + 1].timestamp - timeline[i].timestamp) / speed);
      playTimer = setTimeout(() => tick(i + 1), wait);
    };
    tick(startIdx);
  };

  const playFromVideo = () => {
    const v = options.videoEl!;
    const vidStart = v.dataset.tbStartTs ? Number(v.dataset.tbStartTs) : startedAt;
    v.playbackRate = speed;
    videoTickHandler = () => {
      const ts = vidStart + v.currentTime * 1000;
      currentTs = Math.max(startedAt, Math.min(endedAt, ts));
      renderHandle();
      const marker = findClosestMarker(currentTs);
      options.onSeek?.(currentTs, marker);
    };
    v.addEventListener("timeupdate", videoTickHandler);
    v.addEventListener("pause", stopPlay);
    // .play() returns a Promise that rejects if the media can't be loaded
    // (no supported sources, decode error, etc.). A sync try/catch doesn't
    // catch async rejections, so attach a .catch() and gracefully fall
    // back to event-only playback when the video itself won't play.
    const p = v.play();
    if (p && typeof p.then === "function") {
      p.catch(() => {
        try {
          v.removeEventListener("timeupdate", videoTickHandler!);
          v.removeEventListener("pause", stopPlay);
        } catch {}
        videoTickHandler = null;
        playEvents();
      });
    }
  };

  const togglePlay = () => {
    if (isPlaying) { stopPlay(); if (options.videoEl) try { options.videoEl.pause(); } catch {} ; return; }
    setPlayIcon(true);
    if (currentTs >= endedAt - 50) seek(startedAt, { snap: false });
    if (options.videoEl) playFromVideo();
    else playEvents();
  };
  playBtn.addEventListener("click", togglePlay);

  speedSel.addEventListener("change", () => {
    speed = Number(speedSel.value) || 1;
    if (isPlaying) {
      if (options.videoEl) options.videoEl.playbackRate = speed;
      else { stopPlay(); setPlayIcon(true); playEvents(); }
    }
  });

  // ── Hover thumbnail preview ─────────────────────────────────────────────
  // Shown when the user hovers over the scrubber track and we have at least
  // one screenshot to render. Positioned absolutely above the cursor.
  let hoverEl: HTMLDivElement | null = null;
  if (screenshots.length > 0) {
    hoverEl = document.createElement("div");
    hoverEl.className = "tb-rs-hover-thumb";
    hoverEl.innerHTML = `<img alt="" /><div class="tb-rs-hover-time"></div>`;
    hoverEl.style.display = "none";
    root.appendChild(hoverEl);
  }

  const showHoverThumb = (clientX: number) => {
    if (!hoverEl) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ts = startedAt + ratio * span;
    const ss = findClosestScreenshot(ts);
    if (!ss) { hoverEl.style.display = "none"; return; }
    const img = hoverEl.querySelector("img") as HTMLImageElement;
    const tEl = hoverEl.querySelector(".tb-rs-hover-time") as HTMLDivElement;
    img.src = ss.dataUrl;
    tEl.textContent = formatElapsed(ts - startedAt);
    hoverEl.style.display = "block";
    // Position relative to the root, with the cursor.
    const rootRect = root.getBoundingClientRect();
    const thumbRect = hoverEl.getBoundingClientRect();
    let left = clientX - rootRect.left - thumbRect.width / 2;
    left = Math.max(4, Math.min(rootRect.width - thumbRect.width - 4, left));
    hoverEl.style.left = left + "px";
    hoverEl.style.bottom = (rootRect.bottom - rect.top + 6) + "px";
  };

  track.addEventListener("mousemove", (e) => showHoverThumb((e as MouseEvent).clientX));
  track.addEventListener("mouseleave", () => { if (hoverEl) hoverEl.style.display = "none"; });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const idx = timeline.findIndex(t => t.timestamp >= currentTs);
      let nextIdx = idx;
      if (e.key === "ArrowRight") nextIdx = Math.min(timeline.length - 1, idx + 1 < 0 ? 0 : idx + 1);
      else nextIdx = Math.max(0, (idx > 0 ? idx : timeline.length) - 1);
      seek(timeline[nextIdx].timestamp, { snap: false });
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Jump between errors
      if (errorMarkers.length === 0) return;
      e.preventDefault();
      const errIdx = errorMarkers.findIndex(m => m.timestamp >= currentTs);
      let nextErr;
      if (e.key === "ArrowDown") nextErr = Math.min(errorMarkers.length - 1, (errIdx < 0 ? errorMarkers.length : errIdx) + (errIdx === -1 ? -1 : 1));
      else nextErr = Math.max(0, (errIdx > 0 ? errIdx : errorMarkers.length) - 1);
      seek(errorMarkers[nextErr].timestamp, { snap: false });
    }
  };
  root.addEventListener("keydown", onKey);

  // Jump-to-error
  jumpBtn.addEventListener("click", () => {
    if (errorMarkers.length === 0) return;
    seek(errorMarkers[0].timestamp, { snap: true });
  });

  return {
    seek: (ts: number) => seek(ts, { snap: true }),
    destroy: () => {
      stopPlay();
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("keydown", onKey);
      container.innerHTML = "";
    },
  };

  // ── Local helpers used by the closure above ─────────────────────────────
  // (Hoisted as inner functions for clarity; closure scope only.)
  function pct(ts: number, start: number, range: number): number {
    return Math.max(0, Math.min(100, ((ts - start) / range) * 100));
  }
  function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  function evenSample<T>(arr: T[], n: number): T[] {
    if (arr.length <= n) return arr;
    const out: T[] = [];
    const step = arr.length / n;
    for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  // findClosestScreenshot is intentionally exposed to the caller via onSeek's
  // marker — host code calls it themselves if they want preview swap.
  // (Helper retained for potential future use.)
  void findClosestScreenshot;
}

/** Stylesheet — !important everywhere to defeat host-page resets. */
function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tb-rs-root {
      box-sizing: border-box !important;
      font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      padding: 10px 12px !important;
      background: var(--tb-bg-primary, #0f0f1a) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: var(--tb-radius-md, 6px) !important;
      outline: none !important;
    }
    .tb-rs-root:focus-visible { box-shadow: 0 0 0 2px var(--tb-accent, #7B61FF) !important; }
    .tb-rs-root *, .tb-rs-root *::before, .tb-rs-root *::after { box-sizing: border-box !important; }
    .tb-rs-empty {
      font-size: 11px; color: var(--tb-text-muted, #888);
      padding: 12px; text-align: center;
    }
    .tb-rs-header {
      display: flex !important; align-items: center !important; gap: 10px !important;
      margin-bottom: 8px !important;
    }
    .tb-rs-label { font-size: 11px !important; font-weight: 600 !important; color: var(--tb-text-muted, #888) !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
    .tb-rs-time { font-size: 11px !important; font-variant-numeric: tabular-nums !important; color: var(--tb-text-secondary, #aaa) !important; flex: 1 !important; }
    .tb-rs-jump {
      background: transparent !important; color: var(--tb-error, #ef4444) !important;
      border: 1px solid var(--tb-error, #ef4444) !important; border-radius: 4px !important;
      padding: 3px 9px !important; font-size: 10px !important; font-weight: 600 !important;
      font-family: inherit !important; cursor: pointer !important;
    }
    .tb-rs-jump:hover { background: rgba(239, 68, 68, 0.12) !important; }
    .tb-rs-track {
      position: relative !important;
      height: 28px !important;
      background: var(--tb-bg-secondary, #1a1a2e) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: 999px !important;
      cursor: pointer !important;
      touch-action: none !important;
      user-select: none !important;
    }
    .tb-rs-fill {
      position: absolute !important; top: 0 !important; left: 0 !important;
      height: 100% !important; width: 0% !important;
      background: linear-gradient(90deg, rgba(123,97,255,0.18), rgba(123,97,255,0.08)) !important;
      border-radius: 999px !important;
      pointer-events: none !important;
    }
    .tb-rs-markers { position: absolute !important; inset: 0 !important; pointer-events: none !important; }
    .tb-rs-marker {
      position: absolute !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 10px !important; height: 10px !important;
      border-radius: 50% !important;
      background: #7B61FF !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.4) !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      transition: transform 0.12s !important;
    }
    .tb-rs-marker:hover { transform: translate(-50%, -50%) scale(1.4) !important; }
    .tb-rs-error {
      width: 14px !important; height: 14px !important;
      border-radius: 3px !important;
      color: #fff !important;
      font-size: 10px !important; font-weight: 800 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      animation: tb-rs-pulse 1.6s infinite !important;
    }
    .tb-rs-mark {
      width: 12px !important; height: 12px !important;
      border-radius: 2px !important;
      transform: translate(-50%, -50%) rotate(45deg) !important;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 0 2px rgba(168, 85, 247, 0.25) !important;
    }
    .tb-rs-mark:hover { transform: translate(-50%, -50%) rotate(45deg) scale(1.4) !important; }
    .tb-rs-handle {
      position: absolute !important;
      top: 50% !important;
      width: 16px !important; height: 16px !important;
      transform: translate(-50%, -50%) !important;
      background: #fff !important;
      border: 3px solid var(--tb-accent, #7B61FF) !important;
      border-radius: 50% !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
      pointer-events: none !important;
    }
    .tb-rs-tooltip {
      position: absolute !important;
      bottom: calc(100% + 6px) !important;
      transform: translateX(-50%) !important;
      background: var(--tb-bg-secondary, #1a1a2e) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: 4px !important;
      padding: 4px 8px !important;
      font-size: 11px !important;
      white-space: nowrap !important;
      pointer-events: none !important;
      opacity: 0 !important;
      transition: opacity 0.12s !important;
      z-index: 2 !important;
    }
    @keyframes tb-rs-pulse {
      0%, 100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.4), 0 0 0 0 rgba(239,68,68,0.5); }
      50% { box-shadow: 0 0 0 1px rgba(239,68,68,0.4), 0 0 0 6px rgba(239,68,68,0); }
    }
    /* Play button + speed selector */
    .tb-rs-play {
      width: 28px !important; height: 28px !important;
      background: var(--tb-accent, #7B61FF) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      font-size: 12px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      font-family: inherit !important;
      transition: transform 0.12s !important;
    }
    .tb-rs-play:hover { transform: scale(1.08) !important; }
    .tb-rs-speed {
      background: var(--tb-bg-secondary, #1a1a2e) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: var(--tb-radius-sm, 6px) !important;
      padding: 3px 6px !important;
      font-size: 10px !important;
      font-family: inherit !important;
      cursor: pointer !important;
      outline: none !important;
    }
    .tb-rs-speed:hover { border-color: var(--tb-border-hover, #3f3f46) !important; }
    /* Hover thumbnail */
    .tb-rs-hover-thumb {
      position: absolute !important;
      z-index: 10 !important;
      background: var(--tb-bg-primary, #0a0a0c) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: var(--tb-radius-sm, 6px) !important;
      padding: 4px !important;
      pointer-events: none !important;
      box-shadow: 0 6px 24px rgba(0,0,0,0.4) !important;
    }
    .tb-rs-hover-thumb img {
      display: block !important;
      max-width: 200px !important;
      max-height: 130px !important;
      border-radius: 3px !important;
    }
    .tb-rs-hover-time {
      font-size: 10px !important;
      color: var(--tb-text-muted, #71717a) !important;
      margin-top: 3px !important;
      text-align: center !important;
      font-family: var(--tb-font-mono, ui-monospace, monospace) !important;
    }
  `;
  document.head.appendChild(style);
}

/** Helper for callers that want to find the screenshot closest to a timestamp. */
export function findClosestScreenshot<T extends { timestamp: number }>(
  screenshots: T[],
  ts: number
): T | null {
  if (!screenshots || screenshots.length === 0) return null;
  let best = screenshots[0];
  let bestDelta = Math.abs(best.timestamp - ts);
  for (const s of screenshots) {
    const d = Math.abs(s.timestamp - ts);
    if (d < bestDelta) { best = s; bestDelta = d; }
  }
  return best;
}
