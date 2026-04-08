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

const COLORS = ["#7B61FF", "#ef4444", "#eab308", "#22c55e", "#3b82f6"];
const MAX_CANVAS_DIM = 32767; // Browser canvas pixel limit

// ── Public API ────────────────────────────────────────────────────────────

export function isDrawModeActive(): boolean {
  return _active;
}

export function activateDrawMode(root: HTMLElement, onUpdate?: () => void): void {
  if (_active) return;
  _active = true;
  _onUpdate = onUpdate || null;

  // Full-document canvas overlay
  const docW = Math.min(document.documentElement.scrollWidth, MAX_CANVAS_DIM);
  const docH = Math.min(document.documentElement.scrollHeight, MAX_CANVAS_DIM);

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

  // Shape toolbar — small floating bar at top center
  const toolbar = _createToolbar(root);
  root.appendChild(toolbar);

  const ctx = canvas.getContext("2d")!;

  // Render existing regions for this page
  _redrawAllRegions(ctx, docW, docH);

  let isDrawing = false;
  let startX = 0, startY = 0;

  const onMouseDown = (e: MouseEvent) => {
    if (!_active) return;
    if ((e.target as HTMLElement)?.closest("#tracebug-draw-toolbar")) return;

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

    // Redraw all + preview
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

    // Skip tiny drags
    if (Math.abs(w) < 10 && Math.abs(h) < 10) {
      _redrawAllRegions(ctx, docW, docH);
      return;
    }

    // Normalize negative dimensions
    const normX = w < 0 ? startX + w : startX;
    const normY = h < 0 ? startY + h : startY;
    const normW = Math.abs(w);
    const normH = Math.abs(h);

    // Show inline comment input
    _showCommentInput(normX, normY, normW, normH, root, ctx, docW, docH);
  };

  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);

  // Resize observer to handle dynamic page height
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
    resizeObserver.disconnect();
    canvas.remove();
    toolbar.remove();
    _onUpdate = null;
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
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 2147483647; display: flex; align-items: center; gap: 6px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 10px;
    padding: 8px 14px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;

  // Shape buttons
  const shapes: Array<{ shape: "rect" | "ellipse"; label: string; icon: string }> = [
    { shape: "rect", label: "Rectangle", icon: "▭" },
    { shape: "ellipse", label: "Ellipse", icon: "○" },
  ];

  for (const s of shapes) {
    const btn = document.createElement("button");
    btn.dataset.tracebug = "draw-tool-btn";
    btn.title = s.label;
    btn.textContent = s.icon;
    btn.style.cssText = _toolBtnStyle(s.shape === _currentShape);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      _currentShape = s.shape;
      bar.querySelectorAll("[data-tracebug='draw-tool-btn']").forEach(b => {
        const isActive = (b as HTMLElement).title === shapes.find(sh => sh.shape === _currentShape)?.label;
        (b as HTMLElement).style.cssText = _toolBtnStyle(isActive || false);
      });
    });
    bar.appendChild(btn);
  }

  // Separator
  const sep = document.createElement("div");
  sep.style.cssText = "width:1px;height:20px;background:#3a3a5e;margin:0 4px";
  bar.appendChild(sep);

  // Color buttons
  for (const color of COLORS) {
    const btn = document.createElement("button");
    btn.dataset.tracebug = "draw-color-btn";
    btn.style.cssText = `
      width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
      background: ${color}; border: 2px solid ${color === _currentColor ? "#fff" : color};
      padding: 0; margin: 0;
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      _currentColor = color;
      bar.querySelectorAll("[data-tracebug='draw-color-btn']").forEach(b => {
        const bg = (b as HTMLElement).style.background;
        (b as HTMLElement).style.borderColor = bg === _currentColor ? "#fff" : bg;
      });
      // Simpler: just reset all then highlight current
      bar.querySelectorAll("[data-tracebug='draw-color-btn']").forEach(b => {
        (b as HTMLElement).style.borderColor = (b as HTMLElement).style.background;
      });
      btn.style.borderColor = "#fff";
    });
    bar.appendChild(btn);
  }

  // Separator
  const sep2 = document.createElement("div");
  sep2.style.cssText = "width:1px;height:20px;background:#3a3a5e;margin:0 4px";
  bar.appendChild(sep2);

  // Done button
  const doneBtn = document.createElement("button");
  doneBtn.dataset.tracebug = "draw-done-btn";
  doneBtn.textContent = "Done";
  doneBtn.style.cssText = `
    background: #22c55e33; color: #22c55e; border: 1px solid #22c55e;
    border-radius: 6px; padding: 4px 12px; cursor: pointer;
    font-size: 12px; font-weight: 600; font-family: inherit;
  `;
  doneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deactivateDrawMode();
  });
  bar.appendChild(doneBtn);

  return bar;
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

    // Number label
    ctx.font = "bold 12px system-ui, sans-serif";
    const label = String(i + 1);
    const metrics = ctx.measureText(label);
    const lx = r.x + 4;
    const ly = r.y + 4;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#000";
    ctx.fillRect(lx - 2, ly - 2, metrics.width + 10, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = r.color;
    ctx.fillText(label, lx + 3, ly + 12);

    // Comment label (if exists)
    if (r.comment) {
      const cLabel = r.comment.slice(0, 30) + (r.comment.length > 30 ? "..." : "");
      const cMetrics = ctx.measureText(cLabel);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#000";
      ctx.fillRect(lx + metrics.width + 14, ly - 2, cMetrics.width + 8, 18);
      ctx.globalAlpha = 1;
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#e0e0e0";
      ctx.fillText(cLabel, lx + metrics.width + 18, ly + 12);
    }
  }
}

// ── Comment Input ─────────────────────────────────────────────────────────

function _showCommentInput(
  x: number, y: number, w: number, h: number,
  root: HTMLElement,
  ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number
): void {
  // Show shape immediately with dashed style
  _redrawAllRegions(ctx, canvasW, canvasH);
  ctx.setLineDash([6, 4]);
  _drawShape(ctx, _currentShape, _currentColor, x, y, w, h, 0.15);
  ctx.setLineDash([]);

  // Floating input near the shape
  const input = document.createElement("div");
  input.dataset.tracebug = "draw-comment-input";
  input.style.cssText = `
    position: absolute; z-index: 2147483647;
    left: ${x}px; top: ${y + h + 8}px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 8px;
    padding: 10px; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    display: flex; gap: 6px; align-items: center;
  `;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Add comment (optional)...";
  textInput.style.cssText = `
    background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0;
    padding: 6px 10px; border-radius: 6px; font-size: 12px;
    font-family: inherit; width: 200px; outline: none;
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Add";
  saveBtn.dataset.tracebug = "draw-save-btn";
  saveBtn.style.cssText = `
    background: #7B61FF; border: none; color: #fff; padding: 6px 12px;
    border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;
    font-family: inherit;
  `;

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Skip";
  cancelBtn.dataset.tracebug = "draw-cancel-btn";
  cancelBtn.style.cssText = `
    background: none; border: 1px solid #3a3a5e; color: #888;
    padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
    font-family: inherit;
  `;

  input.appendChild(textInput);
  input.appendChild(saveBtn);
  input.appendChild(cancelBtn);
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

  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    save(""); // Save without comment
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
    return `background:#7B61FF33;color:#7B61FF;border:1px solid #7B61FF;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px;font-family:inherit;`;
  }
  return `background:#22222244;color:#888;border:1px solid #33333344;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:14px;font-family:inherit;`;
}
