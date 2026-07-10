// ── Draw Mode ─────────────────────────────────────────────────────────────
// Draw rectangles, ellipses, freehand pen strokes, or redact blocks on the
// live page. In the default (persistent) mode each shape opens a comment
// prompt and is saved to the annotation store. In ephemeral mode (used
// during screen recording) shapes auto-fade after `ephemeralMs` and are
// emitted as TraceBug.mark events instead of stored, so the markup ends up
// in the recorded video without cluttering the page afterward.

import { DrawRegion } from "./types";
import { addDrawRegion, getDrawRegions } from "./annotation-store";

type DrawShape = "rect" | "ellipse" | "pen" | "redact";

interface DrawModeOptions {
  /**
   * When set, drawings fade out after this many ms instead of opening a
   * comment input. Each shape is emitted as a TraceBug.mark event so the
   * Console / Actions timeline can show it. Use this while recording.
   */
  ephemeralMs?: number;
}

interface EphemeralShape {
  shape: DrawShape;
  color: string;
  expiresAt: number;
  // bounding-box shapes
  x: number; y: number; w: number; h: number;
  // pen path (absolute coords)
  points?: Array<{ x: number; y: number }>;
}

let _active = false;
let _cleanup: (() => void) | null = null;
let _currentShape: DrawShape = "rect";
let _currentColor = "#7C5CFF";
let _onUpdate: (() => void) | null = null;
let _onDeactivate: (() => void) | null = null;

const COLORS: { value: string; label: string }[] = [
  { value: "#7C5CFF", label: "Purple" },
  { value: "#ef4444", label: "Red" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#3b82f6", label: "Blue" },
];
const MAX_CANVAS_DIM = 32767;

// ── Public API ────────────────────────────────────────────────────────────

export function isDrawModeActive(): boolean {
  return _active;
}

export function activateDrawMode(
  root: HTMLElement,
  onUpdate?: () => void,
  onDeactivate?: () => void,
  options?: DrawModeOptions,
): void {
  if (_active) return;
  _active = true;
  _onUpdate = onUpdate || null;
  _onDeactivate = onDeactivate || null;
  const ephemeralMs = options?.ephemeralMs && options.ephemeralMs > 0 ? options.ephemeralMs : 0;
  const ephemerals: EphemeralShape[] = [];
  let rafId: number | null = null;
  // Recording flow defaults to the pen — most QA's "draw an arrow here"
  // gesture. Persistent flow keeps whatever the user last chose.
  if (ephemeralMs) _currentShape = "pen";

  const docW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
  const docH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);

  // ── Full-document canvas overlay ───────────────────────────────────
  // Appended to document.body, NOT tracebug-root. The root is
  // position: fixed, which would anchor the canvas to the viewport.
  // Anchoring to the body means the canvas scrolls with the page — so
  // strokes stored in document coords land where the user actually sees
  // them, and drawing keeps working after the user scrolls.
  const canvas = document.createElement("canvas");
  canvas.id = "tracebug-draw-canvas";
  canvas.dataset.tracebug = "draw-canvas";
  canvas.width = docW;
  canvas.height = docH;
  canvas.style.cssText = `
    position: absolute !important; top: 0 !important; left: 0 !important;
    z-index: 2147483645 !important;
    width: ${docW}px !important; height: ${docH}px !important;
    cursor: crosshair !important; pointer-events: auto !important;
    margin: 0 !important; padding: 0 !important;
  `;
  document.body.appendChild(canvas);

  // Toolbar stays in the TraceBug root (it's a fixed pill that follows
  // the viewport, which is what we want).

  // ── Mode banner + toolbar at top ───────────────────────────────────
  const toolbar = _createToolbar(root);
  root.appendChild(toolbar);

  const ctx = canvas.getContext("2d")!;
  _redrawAllRegions(ctx, docW, docH);

  let isDrawing = false;
  let startX = 0, startY = 0;
  let penPoints: Array<{ x: number; y: number }> = [];

  // Combined redraw — persistent regions first, then any in-flight or
  // ephemeral shapes on top with their current opacity.
  const redrawAll = (preview?: { shape: DrawShape; color: string; x: number; y: number; w: number; h: number; points?: Array<{ x: number; y: number }> }) => {
    _redrawAllRegions(ctx, docW, docH);
    const now = Date.now();
    // Ephemeral overlays (fade based on time-to-expiry).
    for (const s of ephemerals) {
      const ttl = s.expiresAt - now;
      if (ttl <= 0) continue;
      // Fade over the last 600 ms.
      const opacity = Math.min(1, ttl / 600) * 0.85;
      if (s.shape === "pen" && s.points) {
        _drawPath(ctx, s.color, s.points, opacity);
      } else {
        _drawShape(ctx, s.shape, s.color, s.x, s.y, s.w, s.h, opacity);
      }
    }
    if (preview) {
      if (preview.shape === "pen" && preview.points) {
        _drawPath(ctx, preview.color, preview.points, 0.6);
      } else {
        _drawShape(ctx, preview.shape, preview.color, preview.x, preview.y, preview.w, preview.h, 0.3);
      }
    }
  };

  const startFadeLoop = () => {
    if (rafId !== null) return;
    const tick = () => {
      const now = Date.now();
      // Drop expired ephemerals.
      for (let i = ephemerals.length - 1; i >= 0; i--) {
        if (ephemerals[i].expiresAt <= now) ephemerals.splice(i, 1);
      }
      redrawAll();
      if (ephemerals.length > 0 && _active) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    };
    rafId = requestAnimationFrame(tick);
  };

  // Convert a mouse event's viewport-space coords to canvas-space coords.
  // The canvas is appended to <body> with position:absolute, so its rect
  // already reflects the page's scroll position — adding window.scrollX/Y
  // on top would double-count and put strokes off-screen after scrolling.
  const toCanvasCoords = (e: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!_active) return;
    if ((e.target as HTMLElement)?.closest("#tracebug-draw-toolbar")) return;
    if ((e.target as HTMLElement)?.closest("[data-tracebug='draw-comment-input']")) return;

    const p = toCanvasCoords(e);
    startX = p.x;
    startY = p.y;
    isDrawing = true;
    if (_currentShape === "pen") {
      penPoints = [{ x: startX, y: startY }];
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !_active) return;
    const p = toCanvasCoords(e);
    if (_currentShape === "pen") {
      penPoints.push({ x: p.x, y: p.y });
      redrawAll({ shape: "pen", color: _currentColor, x: 0, y: 0, w: 0, h: 0, points: penPoints });
    } else {
      redrawAll({ shape: _currentShape, color: _currentColor, x: startX, y: startY, w: p.x - startX, h: p.y - startY });
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isDrawing || !_active) return;
    isDrawing = false;

    const p = toCanvasCoords(e);
    const endX = p.x;
    const endY = p.y;
    const w = endX - startX;
    const h = endY - startY;

    // Pen — commit the path. Skip if too short to be meaningful.
    if (_currentShape === "pen") {
      const pts = penPoints.slice();
      penPoints = [];
      if (pts.length < 3) { redrawAll(); return; }
      if (ephemeralMs) {
        ephemerals.push({ shape: "pen", color: _currentColor, expiresAt: Date.now() + ephemeralMs, x: 0, y: 0, w: 0, h: 0, points: pts });
        _emitDrawMark("pen", _currentColor, { points: pts.length });
        startFadeLoop();
        redrawAll();
      } else {
        // Persistent pen — store the path's bounding box as a region with
        // the points encoded in the comment field (simplest path; the full
        // path renderer in _redrawAllRegions handles "pen" shape).
        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        const maxX = Math.max(...xs), maxY = Math.max(...ys);
        const region: DrawRegion = {
          id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          shape: "pen" as any,
          x: minX, y: minY, width: maxX - minX, height: maxY - minY,
          comment: "",
          color: _currentColor,
          page: window.location.pathname,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          points: pts,
        } as any;
        addDrawRegion(region);
        redrawAll();
        if (_onUpdate) _onUpdate();
      }
      return;
    }

    if (Math.abs(w) < 10 && Math.abs(h) < 10) {
      redrawAll();
      return;
    }

    const normX = w < 0 ? startX + w : startX;
    const normY = h < 0 ? startY + h : startY;
    const normW = Math.abs(w);
    const normH = Math.abs(h);

    // Ephemeral mode (used during recording) — show, fade, emit a mark.
    if (ephemeralMs) {
      ephemerals.push({ shape: _currentShape, color: _currentColor, expiresAt: Date.now() + ephemeralMs, x: normX, y: normY, w: normW, h: normH });
      _emitDrawMark(_currentShape, _currentColor, { x: Math.round(normX), y: Math.round(normY), w: Math.round(normW), h: Math.round(normH) });
      startFadeLoop();
      redrawAll();
      return;
    }

    if (_currentShape === "redact") {
      // Redact regions skip the comment prompt — they exist purely to hide
      // content, so there's nothing to caption.
      const region: DrawRegion = {
        id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        shape: "redact",
        x: normX, y: normY, width: normW, height: normH,
        comment: "",
        color: _currentColor,
        page: window.location.pathname,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
      addDrawRegion(region);
      _redrawAllRegions(ctx, docW, docH);
      if (_onUpdate) _onUpdate();
      return;
    }

    _showCommentInput(normX, normY, normW, normH, root, ctx, docW, docH);
  };

  // Escape key to exit
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      deactivateDrawMode();
    }
  };

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keydown", onKeyDown, { capture: true });

  // ResizeObserver is Safari 13.1+ / Firefox 69+ — fall back to window
  // resize events so draw mode still works (canvas just won't track
  // content-driven height changes) instead of throwing on older browsers.
  const onCanvasResize = () => {
    const newW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
    const newH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
      canvas.style.width = newW + "px";
      canvas.style.height = newH + "px";
      _redrawAllRegions(ctx, newW, newH);
    }
  };
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onCanvasResize);
    resizeObserver.observe(document.body);
  } else {
    window.addEventListener("resize", onCanvasResize);
  }

  _cleanup = () => {
    _active = false;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    if (resizeObserver) resizeObserver.disconnect();
    else window.removeEventListener("resize", onCanvasResize);
    canvas.remove();
    toolbar.remove();
    _onUpdate = null;
    if (_onDeactivate) _onDeactivate();
    _onDeactivate = null;
  };
}

// ── Emit helpers ─────────────────────────────────────────────────────────

/**
 * Push a draw action onto the timeline via `TraceBug.mark` so the user can
 * see when annotations happened relative to their recording. We don't want
 * to take a hard dependency on the SDK module from draw-mode (circular
 * imports), so we read `window.TraceBug` defensively.
 */
function _emitDrawMark(shape: DrawShape, color: string, extra: Record<string, unknown>): void {
  try {
    const tb = (window as any).TraceBug;
    if (tb && typeof tb.mark === "function") {
      tb.mark(`Drew ${shape}`, { shape, color, ...extra });
    }
  } catch {}
}

function _drawPath(
  ctx: CanvasRenderingContext2D,
  color: string,
  points: Array<{ x: number; y: number }>,
  opacity: number,
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function deactivateDrawMode(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}

// ── Toolbar ───────────────────────────────────────────────────────────────

function _createToolbar(root: HTMLElement): HTMLElement {
  const bar = document.createElement("div");
  bar.id = "tracebug-draw-toolbar";
  bar.dataset.tracebug = "draw-toolbar";
  // Floating pill near the top-center — far narrower than the old
  // full-width strip so the page content stays visible. Drops the giant
  // gradient bar in favor of the same dark pill style as the recording HUD.
  // When the recording HUD is showing (also top-center), drop below it so the
  // two pills don't overlap and both stay usable.
  const topPx = document.getElementById("tracebug-recording-hud") ? 64 : 12;
  bar.style.cssText = `
    position: fixed; top: ${topPx}px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647; display: inline-flex; align-items: center; gap: 4px;
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-accent, #7C5CFF);
    border-radius: 999px;
    padding: 5px 8px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: tracebug-draw-slide 0.2s ease;
    color: var(--tb-text-primary, #e0e0e0);
  `;

  // Add animation
  const styleTag = document.createElement("style");
  styleTag.id = "tracebug-draw-styles";
  styleTag.dataset.tracebug = "draw-styles";
  styleTag.textContent = `
    @keyframes tracebug-draw-slide { from { opacity:0; transform: translate(-50%, -8px); } to { opacity:1; transform: translate(-50%, 0); } }
  `;
  document.head.appendChild(styleTag);

  // Shape buttons — icon-only, tooltip on hover. No mode label, no
  // separators. Keeps the bar small enough to stay out of the page.
  const shapes: Array<{ shape: DrawShape; label: string; icon: string }> = [
    { shape: "pen", label: "Pen", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>` },
    { shape: "rect", label: "Rectangle", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>` },
    { shape: "ellipse", label: "Ellipse", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>` },
    // "Redact" removed from the palette — superseded by the Blur tool. The
    // shape rendering code is kept for backward-compat with old saved regions.
  ];

  for (const s of shapes) {
    const btn = document.createElement("button");
    btn.dataset.tracebug = "draw-tool-btn";
    btn.dataset.shape = s.shape;
    btn.title = s.label;
    btn.setAttribute("aria-label", s.label);
    btn.innerHTML = s.icon;
    btn.style.cssText = _toolBtnStyle(s.shape === _currentShape);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      _currentShape = s.shape;
      bar.querySelectorAll("[data-tracebug='draw-tool-btn']").forEach(b => {
        (b as HTMLElement).style.cssText = _toolBtnStyle((b as HTMLElement).dataset.shape === _currentShape);
      });
    });
    bar.appendChild(btn);
  }

  bar.appendChild(_sep());

  // Color buttons with tooltips
  for (const c of COLORS) {
    const btn = document.createElement("button");
    btn.dataset.tracebug = "draw-color-btn";
    btn.dataset.color = c.value;
    btn.title = c.label;
    btn.style.cssText = `
      width: 18px; height: 18px; border-radius: 50%; cursor: pointer;
      background: ${c.value}; padding: 0; margin: 0; transition: all 0.15s;
      border: 2px solid ${c.value === _currentColor ? "#fff" : "transparent"};
      box-shadow: ${c.value === _currentColor ? "0 0 0 2px rgba(255,255,255,0.3)" : "none"};
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      _currentColor = c.value;
      bar.querySelectorAll("[data-tracebug='draw-color-btn']").forEach(b => {
        const isActive = (b as HTMLElement).dataset.color === _currentColor;
        (b as HTMLElement).style.borderColor = isActive ? "#fff" : "transparent";
        (b as HTMLElement).style.boxShadow = isActive ? "0 0 0 2px rgba(255,255,255,0.3)" : "none";
      });
    });
    bar.appendChild(btn);
  }

  bar.appendChild(_sep());

  // Done button — icon-only X to keep the bar tight. Esc still works.
  const doneBtn = document.createElement("button");
  doneBtn.dataset.tracebug = "draw-done-btn";
  doneBtn.title = "Exit draw mode (Esc)";
  doneBtn.setAttribute("aria-label", "Exit draw mode");
  doneBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`;
  doneBtn.style.cssText = `
    width: 24px; height: 24px; padding: 0;
    background: transparent; border: 1px solid var(--tb-border, #2a2a3e);
    color: var(--tb-text-muted, #888); border-radius: 999px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: inherit; transition: all 0.15s;
  `;
  doneBtn.addEventListener("mouseenter", () => { doneBtn.style.color = "var(--tb-text-primary, #e0e0e0)"; doneBtn.style.borderColor = "var(--tb-border-hover, #3a3a5e)"; });
  doneBtn.addEventListener("mouseleave", () => { doneBtn.style.color = "var(--tb-text-muted, #888)"; doneBtn.style.borderColor = "var(--tb-border, #2a2a3e)"; });
  doneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deactivateDrawMode();
  });
  bar.appendChild(doneBtn);

  return bar;
}

function _sep(): HTMLElement {
  const d = document.createElement("div");
  d.dataset.tracebug = "draw-sep";
  d.style.cssText = "width:1px;height:18px;background:var(--tb-border, #2a2a3e);margin:0 4px;flex-shrink:0";
  return d;
}

// ── Drawing ───────────────────────────────────────────────────────────────

function _drawShape(
  ctx: CanvasRenderingContext2D,
  shape: DrawShape,
  color: string,
  x: number, y: number, w: number, h: number,
  fillOpacity: number
): void {
  // Pen strokes go through _drawPath, not here. Guard so a misrouted call
  // doesn't draw a stray rectangle.
  if (shape === "pen") return;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;

  if (shape === "rect") {
    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, y, w, h);
  } else if (shape === "redact") {
    // Solid dark block — hides the underlying content. Drawn as a filled
    // rect at full opacity (no preview-vs-final difference because the
    // whole point is to obscure pixels). Diagonal hatching makes it
    // unmistakably a redaction even when the surrounding screenshot is dark.
    const nx = Math.min(x, x + w);
    const ny = Math.min(y, y + h);
    const nw = Math.abs(w);
    const nh = Math.abs(h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(nx, ny, nw, nh);
    // Hatch pattern so it reads as "redacted" not "black rectangle"
    ctx.strokeStyle = "#1f1f1f";
    ctx.lineWidth = 1;
    const step = 8;
    ctx.beginPath();
    for (let i = -nh; i < nw; i += step) {
      ctx.moveTo(nx + i, ny);
      ctx.lineTo(nx + i + nh, ny + nh);
    }
    ctx.stroke();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(nx, ny, nw, nh);
  } else {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = Math.abs(w) / 2;
    const ry = Math.abs(h) / 2;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}

function _redrawAllRegions(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const regions = getDrawRegions();
  const page = window.location.pathname;

  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    if (r.page !== page) continue;

    // Pen strokes render along their captured path rather than as a bbox.
    if ((r.shape as any) === "pen" && (r as any).points?.length >= 2) {
      _drawPath(ctx, r.color, (r as any).points, 0.7);
      continue;
    }
    _drawShape(ctx, r.shape, r.color, r.x, r.y, r.width, r.height, 0.12);

    // Redact regions have no labels — labels would defeat the purpose of
    // hiding the underlying content.
    if (r.shape === "redact") continue;

    // Number label with better readability
    ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
    const label = String(i + 1);
    const metrics = ctx.measureText(label);
    const lx = r.x + 4;
    const ly = r.y + 4;

    // Background pill
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = r.color;
    const pillW = metrics.width + 12;
    _roundRect(ctx, lx, ly, pillW, 20, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(label, lx + 6, ly + 14);

    // Comment label
    if (r.comment) {
      const cLabel = r.comment.slice(0, 40) + (r.comment.length > 40 ? "..." : "");
      ctx.font = "11px system-ui, -apple-system, sans-serif";
      const cMetrics = ctx.measureText(cLabel);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#000";
      _roundRect(ctx, lx + pillW + 6, ly, cMetrics.width + 12, 20, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(cLabel, lx + pillW + 12, ly + 14);
    }
  }
}

function _roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Comment Input ─────────────────────────────────────────────────────────

function _showCommentInput(
  x: number, y: number, w: number, h: number,
  root: HTMLElement,
  ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number
): void {
  _redrawAllRegions(ctx, canvasW, canvasH);
  ctx.setLineDash([6, 4]);
  _drawShape(ctx, _currentShape, _currentColor, x, y, w, h, 0.15);
  ctx.setLineDash([]);

  // Smart positioning — prefer below shape, fallback above
  let inputTop = y + h + 10;
  const inputLeft = x;
  if (inputTop + 60 > canvasH || (inputTop - window.scrollY + 60 > window.innerHeight)) {
    inputTop = Math.max(10, y - 60);
  }

  const input = document.createElement("div");
  input.dataset.tracebug = "draw-comment-input";
  input.style.cssText = `
    position: absolute; z-index: 2147483647;
    left: ${inputLeft}px; top: ${inputTop}px;
    background: var(--tb-bg-secondary, #11151A); border: 1px solid var(--tb-border, #1F2630); border-radius: var(--tb-radius-md, 12px);
    padding: 12px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    box-shadow: var(--tb-shadow-lg, 0 8px 24px rgba(0,0,0,0.5));
    display: flex; gap: 8px; align-items: center;
    animation: tracebug-draw-slide 0.15s ease;
  `;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Describe this region (optional)";
  textInput.style.cssText = `
    background: var(--tb-bg-primary, #0B0D10); border: 1px solid var(--tb-border-hover, #2A3441); color: var(--tb-text-primary, #E6EDF3);
    padding: 8px 12px; border-radius: var(--tb-radius-sm, 8px); font-size: 13px;
    font-family: inherit; width: 240px; outline: none;
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.dataset.tracebug = "draw-save-btn";
  saveBtn.style.cssText = `
    background: #7C5CFF; border: none; color: #fff; padding: 8px 14px;
    border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit; box-shadow: 0 2px 6px rgba(123,97,255,0.3);
    transition: all 0.15s; white-space: nowrap;
  `;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "No comment";
  skipBtn.dataset.tracebug = "draw-cancel-btn";
  skipBtn.style.cssText = `
    background: none; border: 1px solid var(--tb-border-hover, #2A3441); color: var(--tb-text-secondary, #94A3B8);
    padding: 8px 12px; border-radius: var(--tb-radius-sm, 8px); cursor: pointer; font-size: 12px;
    font-family: inherit; transition: all 0.15s; white-space: nowrap;
  `;

  input.appendChild(textInput);
  input.appendChild(saveBtn);
  input.appendChild(skipBtn);
  root.appendChild(input);

  setTimeout(() => textInput.focus(), 50);

  const save = (comment: string) => {
    const region: DrawRegion = {
      id: `dr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      // save() runs only for region shapes — pen strokes have their own path and
      // never reach here — so _currentShape is always a DrawRegion["shape"].
      shape: _currentShape as DrawRegion["shape"],
      x, y, width: w, height: h,
      comment,
      color: _currentColor,
      page: window.location.pathname,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };
    addDrawRegion(region);
    input.remove();
    _redrawAllRegions(ctx, canvasW, canvasH);
    if (_onUpdate) _onUpdate();
  };

  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    save(textInput.value.trim());
  });

  skipBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    save("");
  });

  textInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") save(textInput.value.trim());
    if (e.key === "Escape") {
      input.remove();
      _redrawAllRegions(ctx, canvasW, canvasH);
    }
  });
}

function _toolBtnStyle(active: boolean): string {
  const base = `width:26px;height:26px;padding:0;border-radius:999px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;transition:all 0.15s;`;
  if (active) {
    return base + `background:var(--tb-accent, #7C5CFF);color:#fff;border:1px solid var(--tb-accent, #7C5CFF);`;
  }
  return base + `background:transparent;color:var(--tb-text-secondary, #aaa);border:1px solid var(--tb-border, #2a2a3e);`;
}
