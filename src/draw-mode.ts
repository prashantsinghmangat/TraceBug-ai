// ── Draw Mode ─────────────────────────────────────────────────────────────
// Draw rectangles or ellipses directly on the live page to mark
// layout, spacing, or alignment regions. Each shape gets a comment.

import { DrawRegion } from "./types";
import { addDrawRegion, getDrawRegions } from "./annotation-store";

let _active = false;
let _cleanup: (() => void) | null = null;
let _currentShape: "rect" | "ellipse" = "rect";
let _currentColor = "#7B61FF";
let _onUpdate: (() => void) | null = null;
let _onDeactivate: (() => void) | null = null;

const COLORS: { value: string; label: string }[] = [
  { value: "#7B61FF", label: "Purple" },
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
  onDeactivate?: () => void
): void {
  if (_active) return;
  _active = true;
  _onUpdate = onUpdate || null;
  _onDeactivate = onDeactivate || null;

  const docW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
  const docH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);

  // ── Full-document canvas overlay ───────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.id = "tracebug-draw-canvas";
  canvas.dataset.tracebug = "draw-canvas";
  canvas.width = docW;
  canvas.height = docH;
  canvas.style.cssText = `
    position: absolute; top: 0; left: 0; z-index: 2147483645;
    width: ${docW}px; height: ${docH}px;
    cursor: crosshair; pointer-events: auto;
  `;
  root.appendChild(canvas);

  // ── Mode banner + toolbar at top ───────────────────────────────────
  const toolbar = _createToolbar(root);
  root.appendChild(toolbar);

  const ctx = canvas.getContext("2d")!;
  _redrawAllRegions(ctx, docW, docH);

  let isDrawing = false;
  let startX = 0, startY = 0;

  const onMouseDown = (e: MouseEvent) => {
    if (!_active) return;
    if ((e.target as HTMLElement)?.closest("#tracebug-draw-toolbar")) return;
    if ((e.target as HTMLElement)?.closest("[data-tracebug='draw-comment-input']")) return;

    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left + window.scrollX;
    startY = e.clientY - rect.top + window.scrollY;
    isDrawing = true;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !_active) return;
    const rect = canvas.getBoundingClientRect();
    const curX = e.clientX - rect.left + window.scrollX;
    const curY = e.clientY - rect.top + window.scrollY;

    _redrawAllRegions(ctx, docW, docH);
    _drawShape(ctx, _currentShape, _currentColor, startX, startY, curX - startX, curY - startY, 0.3);
  };

  const onMouseUp = (e: MouseEvent) => {
    if (!isDrawing || !_active) return;
    isDrawing = false;

    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left + window.scrollX;
    const endY = e.clientY - rect.top + window.scrollY;
    const w = endX - startX;
    const h = endY - startY;

    if (Math.abs(w) < 10 && Math.abs(h) < 10) {
      _redrawAllRegions(ctx, docW, docH);
      return;
    }

    const normX = w < 0 ? startX + w : startX;
    const normY = h < 0 ? startY + h : startY;
    const normW = Math.abs(w);
    const normH = Math.abs(h);

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

  const resizeObserver = new ResizeObserver(() => {
    const newW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
    const newH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);
    if (canvas.width !== newW || canvas.height !== newH) {
      canvas.width = newW;
      canvas.height = newH;
      canvas.style.width = newW + "px";
      canvas.style.height = newH + "px";
      _redrawAllRegions(ctx, newW, newH);
    }
  });
  resizeObserver.observe(document.body);

  _cleanup = () => {
    _active = false;
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    resizeObserver.disconnect();
    canvas.remove();
    toolbar.remove();
    _onUpdate = null;
    if (_onDeactivate) _onDeactivate();
    _onDeactivate = null;
  };
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
  bar.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0;
    z-index: 2147483647; display: flex; align-items: center; gap: 8px;
    background: linear-gradient(90deg, #7B61FF, #5B3FDF);
    padding: 10px 20px; font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 2px 12px rgba(123, 97, 255, 0.3);
    animation: tracebug-draw-slide 0.2s ease;
  `;

  // Add animation
  const styleTag = document.createElement("style");
  styleTag.id = "tracebug-draw-styles";
  styleTag.dataset.tracebug = "draw-styles";
  styleTag.textContent = `
    @keyframes tracebug-draw-slide { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  `;
  document.head.appendChild(styleTag);

  // Mode indicator
  const modeLabel = document.createElement("div");
  modeLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-right:8px";
  modeLabel.innerHTML = `
    <div style="width:8px;height:8px;border-radius:50%;background:#fff;animation:tracebug-pulse 1.5s infinite"></div>
    <span style="color:#fff;font-weight:600;font-size:13px">Draw Mode</span>
  `;
  // Reuse pulse animation from annotate
  if (!document.getElementById("tracebug-annotate-styles")) {
    const pulseStyle = document.createElement("style");
    pulseStyle.id = "tracebug-draw-pulse";
    pulseStyle.textContent = `@keyframes tracebug-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`;
    document.head.appendChild(pulseStyle);
  }
  bar.appendChild(modeLabel);

  // Separator
  bar.appendChild(_sep());

  // Shape buttons with labels
  const shapes: Array<{ shape: "rect" | "ellipse"; label: string; icon: string }> = [
    { shape: "rect", label: "Rectangle", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>` },
    { shape: "ellipse", label: "Ellipse", icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>` },
  ];

  for (const s of shapes) {
    const btn = document.createElement("button");
    btn.dataset.tracebug = "draw-tool-btn";
    btn.dataset.shape = s.shape;
    btn.title = s.label;
    btn.innerHTML = `${s.icon}<span style="margin-left:4px;font-size:11px">${s.label}</span>`;
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
      width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
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

  // Spacer
  const spacer = document.createElement("div");
  spacer.style.flex = "1";
  bar.appendChild(spacer);

  // Hint
  const hint = document.createElement("span");
  hint.style.cssText = "color:rgba(255,255,255,0.5);font-size:11px;margin-right:8px";
  hint.textContent = "Drag to draw. Esc to exit.";
  bar.appendChild(hint);

  // Done button
  const doneBtn = document.createElement("button");
  doneBtn.dataset.tracebug = "draw-done-btn";
  doneBtn.textContent = "Done";
  doneBtn.style.cssText = `
    background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
    color: #fff; border-radius: 6px; padding: 6px 16px; cursor: pointer;
    font-size: 12px; font-weight: 500; font-family: inherit; transition: all 0.15s;
  `;
  doneBtn.addEventListener("mouseenter", () => { doneBtn.style.background = "rgba(255,255,255,0.25)"; });
  doneBtn.addEventListener("mouseleave", () => { doneBtn.style.background = "rgba(255,255,255,0.15)"; });
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
  d.style.cssText = "width:1px;height:22px;background:rgba(255,255,255,0.2);margin:0 4px;flex-shrink:0";
  return d;
}

// ── Drawing ───────────────────────────────────────────────────────────────

function _drawShape(
  ctx: CanvasRenderingContext2D,
  shape: "rect" | "ellipse",
  color: string,
  x: number, y: number, w: number, h: number,
  fillOpacity: number
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;

  if (shape === "rect") {
    ctx.globalAlpha = fillOpacity;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, y, w, h);
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

    _drawShape(ctx, r.shape, r.color, r.x, r.y, r.width, r.height, 0.12);

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
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 10px;
    padding: 12px; font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    display: flex; gap: 8px; align-items: center;
    animation: tracebug-draw-slide 0.15s ease;
  `;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Describe this region (optional)";
  textInput.style.cssText = `
    background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0;
    padding: 8px 12px; border-radius: 8px; font-size: 13px;
    font-family: inherit; width: 240px; outline: none;
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.dataset.tracebug = "draw-save-btn";
  saveBtn.style.cssText = `
    background: #7B61FF; border: none; color: #fff; padding: 8px 14px;
    border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit; box-shadow: 0 2px 6px rgba(123,97,255,0.3);
    transition: all 0.15s; white-space: nowrap;
  `;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "No comment";
  skipBtn.dataset.tracebug = "draw-cancel-btn";
  skipBtn.style.cssText = `
    background: none; border: 1px solid #3a3a5e; color: #999;
    padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
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
      shape: _currentShape,
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
  if (active) {
    return `background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;transition:all 0.15s;`;
  }
  return `background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;display:flex;align-items:center;transition:all 0.15s;`;
}
