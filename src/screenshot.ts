// ── Screenshot manager ────────────────────────────────────────────────────
// Captures page screenshots using html2canvas, loaded lazily only when the
// user actually takes a screenshot. Keeps the base bundle small for every
// page load that never hits the screenshot path.
// Falls back to a DOM snapshot if html2canvas cannot be loaded.
// Screenshots stored in memory (not localStorage) to avoid quota issues.

import type html2canvasStatic from "html2canvas";
import { ScreenshotData, TraceBugEvent } from "./types";

// Lazy-loaded html2canvas. Cached after first load so subsequent screenshots
// are instant. Never loaded in Chrome Extension context (uses chrome.tabs
// capture instead). Never loaded at init — only on first captureScreenshot call.
let _html2canvasPromise: Promise<typeof html2canvasStatic | null> | null = null;

// Exposed so region-screenshot.ts can capture only the selected region
// (passing html2canvas's native x/y/width/height) instead of capturing the
// full viewport and cropping afterward — which broke when the page was
// scrolled because the crop math assumed viewport-aligned source.
export function loadHtml2CanvasShared(): Promise<typeof html2canvasStatic | null> {
  return loadHtml2Canvas();
}

function loadHtml2Canvas(): Promise<typeof html2canvasStatic | null> {
  if (_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = import("html2canvas")
    .then((mod) => {
      const fn = (mod as any).default || (mod as any);
      return typeof fn === "function" ? (fn as typeof html2canvasStatic) : null;
    })
    .catch(() => null);
  return _html2canvasPromise;
}

/**
 * Invisible <link> tags (preload/prefetch/etc.) that html2canvas would otherwise
 * clone into its offscreen render iframe — where the browser logs warnings like
 * "<link rel=preload> must have a valid `as` value". They contribute nothing to
 * the rendered pixels, so we skip cloning them. Used by every html2canvas
 * `ignoreElements` callback in the SDK.
 */
export function isNonRenderingLink(el: Element): boolean {
  if (el.tagName !== "LINK") return false;
  const rel = (el.getAttribute("rel") || "").toLowerCase();
  return /(^|\s)(preload|prefetch|modulepreload|preconnect|dns-prefetch)(\s|$)/.test(rel);
}

/**
 * When running inside a Chrome Extension, html2canvas fails due to CORS.
 * Use chrome.tabs.captureVisibleTab instead, routed through a CustomEvent
 * to the content script → background script.
 */
export function isExtensionContext(): boolean {
  return !!(window as any).__TRACEBUG_INITIALIZED__;
}

function captureViaExtension(): Promise<string | null> {
  return new Promise((resolve) => {
    const handler = (e: Event) => {
      window.removeEventListener("tracebug-ext-screenshot-result", handler);
      const dataUrl = (e as CustomEvent).detail?.dataUrl;
      resolve(dataUrl || null);
    };
    window.addEventListener("tracebug-ext-screenshot-result", handler);
    // Ask the content script to request a screenshot from background
    window.dispatchEvent(new CustomEvent("tracebug-request-screenshot"));
    // Timeout after 3s
    setTimeout(() => {
      window.removeEventListener("tracebug-ext-screenshot-result", handler);
      resolve(null);
    }, 3000);
  });
}

const MAX_SCREENSHOTS = 50;
let screenshotCounter = 0;
const screenshots: ScreenshotData[] = [];

export function getScreenshots(): ScreenshotData[] {
  return [...screenshots];
}

export function clearScreenshots(): void {
  screenshots.length = 0;
  screenshotCounter = 0;
}

/** Remove a single screenshot from the active ticket by id. Returns true on hit. */
export function removeScreenshot(id: string): boolean {
  const idx = screenshots.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  screenshots.splice(idx, 1);
  return true;
}

/** Push a pre-built screenshot into the active-ticket store. Used by
 *  region-screenshot.ts which captures via html2canvas's x/y bounds and
 *  doesn't go through the normal captureScreenshot() pipeline. */
export function pushScreenshot(ss: ScreenshotData): void {
  screenshots.push(ss);
  if (screenshots.length > MAX_SCREENSHOTS) {
    screenshots.splice(0, screenshots.length - MAX_SCREENSHOTS);
  }
}

/** Replace a screenshot's pixel data + filename (used by the annotation editor
 *  after the user saves an annotated version). Other fields preserved. */
export function updateScreenshot(
  id: string,
  patch: { dataUrl?: string; filename?: string; width?: number; height?: number },
): boolean {
  const ss = screenshots.find((s) => s.id === id);
  if (!ss) return false;
  if (patch.dataUrl !== undefined) ss.dataUrl = patch.dataUrl;
  if (patch.filename !== undefined) ss.filename = patch.filename;
  if (patch.width !== undefined) ss.width = patch.width;
  if (patch.height !== undefined) ss.height = patch.height;
  return true;
}

// Serialize captures. Each one hides the SDK UI → renders → restores it; two
// concurrent calls (toolbar + HUD + error-prompt) would interleave those steps
// and either capture the toolbar or leave the page UI hidden. Chaining makes
// each capture atomic.
let _captureLock: Promise<unknown> = Promise.resolve();

export function captureScreenshot(
  lastEvent?: TraceBugEvent | null,
  options?: { includeAnnotations?: boolean; highlightClicked?: boolean }
): Promise<ScreenshotData> {
  const run = _captureLock.then(() => _captureScreenshotImpl(lastEvent, options));
  _captureLock = run.catch(() => {}); // a failed capture must not break the chain
  return run;
}

async function _captureScreenshotImpl(
  lastEvent?: TraceBugEvent | null,
  options?: { includeAnnotations?: boolean; highlightClicked?: boolean }
): Promise<ScreenshotData> {
  screenshotCounter++;

  const includeAnnotations = options?.includeAnnotations ?? false;
  // Smart-screenshot: when set and the last event is a click with a
  // boundingBox, draw a translucent ring + arrow at the clicked element.
  const highlightClicked = options?.highlightClicked ?? false;

  const eventContext = lastEvent
    ? buildEventLabel(lastEvent)
    : includeAnnotations ? "annotated_capture" : "manual_capture";

  const filename = `${String(screenshotCounter).padStart(2, "0")}_${sanitizeFilename(eventContext)}.png`;

  // Hide TraceBug UI before capturing — but keep annotations if requested
  const root = document.getElementById("tracebug-root");
  const hiddenEls: HTMLElement[] = [];

  if (root) {
    if (includeAnnotations) {
      // Hide only the toolbar, panel, settings — keep annotation badges/outlines
      for (const child of Array.from(root.children) as HTMLElement[]) {
        const tag = child.dataset?.tracebug || child.id || "";
        const isAnnotation = tag === "annotation-badge" || tag === "annotation-outline";
        if (!isAnnotation) {
          child.style.display = "none";
          hiddenEls.push(child);
        }
      }
    } else {
      // Hide everything
      root.style.display = "none";
    }
  }

  let dataUrl: string;
  let width = window.innerWidth;
  let height = window.innerHeight;

  try {
    // Chrome Extension context: use chrome.tabs.captureVisibleTab via message bridge
    if (isExtensionContext()) {
      const extDataUrl = await captureViaExtension();
      if (extDataUrl) {
        dataUrl = extDataUrl;
      } else {
        dataUrl = await captureViaCanvas();
      }
    } else {
      // Normal SDK context: lazy-load html2canvas on first use.
      // The dynamic import keeps html2canvas out of the base bundle (~240KB win).
      const renderer = await loadHtml2Canvas();
      if (renderer) {
        const canvas = await renderer(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 1,
          logging: false,
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          ignoreElements: (el: Element) => {
            // Skip invisible preload/prefetch links — avoids a browser warning
            // when html2canvas clones them into its render iframe.
            if (isNonRenderingLink(el)) return true;
            if (includeAnnotations) {
              // Keep annotation badges/outlines, skip everything else from TraceBug
              const tbAttr = (el as HTMLElement).dataset?.tracebug || "";
              if (tbAttr === "annotation-badge" || tbAttr === "annotation-outline") return false;
              // Skip hidden elements (toolbar, panel, etc.)
              if (hiddenEls.includes(el as HTMLElement)) return true;
              // Don't skip #tracebug-root itself — it contains visible annotations
              if (el.id === "tracebug-root") return false;
              // Skip other TraceBug elements that aren't annotations
              if (tbAttr) return true;
            } else {
              if (el.id === "tracebug-root") return true;
              if ((el as HTMLElement).dataset?.tracebug) return true;
            }
            return false;
          },
        });
        dataUrl = canvas.toDataURL("image/png", 0.8);
        width = canvas.width;
        height = canvas.height;
      } else {
        dataUrl = await captureViaCanvas();
      }
    }
  } catch (err) {
    console.warn("[TraceBug] Screenshot capture error:", err);
    dataUrl = await captureViaCanvas();
  } finally {
    // Restore TraceBug UI — in finally so a capture failure can never leave the
    // page UI hidden.
    if (includeAnnotations) {
      hiddenEls.forEach(el => el.style.display = "");
    } else {
      if (root) root.style.display = "";
    }
  }

  // Smart-screenshot post-processing: draw a click highlight if requested
  // AND we have a boundingBox AND the element is in the viewport. We always
  // keep the original dataUrl alongside so the modal can offer an "original"
  // toggle without re-capturing.
  let originalDataUrl: string | undefined;
  if (highlightClicked && lastEvent?.type === "click") {
    const bbox = lastEvent?.data?.element?.boundingBox;
    if (bbox && isBoundingBoxInViewport(bbox)) {
      try {
        const highlighted = await drawClickHighlight(dataUrl, bbox);
        if (highlighted) {
          originalDataUrl = dataUrl;
          dataUrl = highlighted;
        }
      } catch (err) {
        if (typeof console !== "undefined") console.warn("[TraceBug] Click highlight failed:", err);
      }
    }
  }

  const screenshot: ScreenshotData = {
    id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    dataUrl,
    originalDataUrl,
    filename,
    eventContext,
    page: window.location.pathname,
    width,
    height,
  };

  screenshots.push(screenshot);

  // Cap screenshots to prevent unbounded memory growth (each is a full data URL)
  if (screenshots.length > MAX_SCREENSHOTS) {
    screenshots.splice(0, screenshots.length - MAX_SCREENSHOTS);
  }

  return screenshot;
}

// Simple canvas fallback — captures visible viewport info as text
async function captureViaCanvas(): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  // getContext can return null under memory pressure / blocked canvas. This
  // is already the fallback path, so degrade to a tiny valid PNG rather than
  // throwing into the caller.
  if (!ctx) {
    try { return canvas.toDataURL("image/png"); } catch { return ""; }
  }
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, 400, 200);
  ctx.fillStyle = "#e0e0e0";
  ctx.font = "14px monospace";
  ctx.fillText("Screenshot (html2canvas unavailable)", 20, 40);
  ctx.fillStyle = "#888";
  ctx.font = "12px monospace";
  ctx.fillText(`Page: ${window.location.pathname}`, 20, 70);
  ctx.fillText(`Time: ${new Date().toLocaleTimeString()}`, 20, 90);
  ctx.fillText(`Viewport: ${window.innerWidth}x${window.innerHeight}`, 20, 110);
  return canvas.toDataURL("image/png");
}

function buildEventLabel(event: TraceBugEvent): string {
  switch (event.type) {
    case "click": {
      const el = event.data.element;
      const target = el?.text?.trim() || el?.id || el?.ariaLabel || el?.tag || "element";
      return `click_${target}`;
    }
    case "input": {
      const name = event.data.element?.name || event.data.element?.id || "field";
      return `enter_${name}`;
    }
    case "select_change": {
      const name = event.data.element?.name || "dropdown";
      const val = event.data.element?.selectedText || "";
      return `select_${name}_${val}`;
    }
    case "form_submit":
      return `submit_${event.data.form?.id || "form"}`;
    case "route_change":
      return `navigate_${event.data.to || "page"}`;
    case "api_request":
      return `api_${event.data.request?.method}_${event.data.request?.statusCode}`;
    case "error":
    case "unhandled_rejection":
      return "error_occurred";
    default:
      return event.type;
  }
}

/** Download all captured screenshots as individual PNG files */
export function downloadAllScreenshots(): void {
  for (const ss of screenshots) {
    downloadDataUrl(ss.dataUrl, ss.filename);
  }
}

/** Download a single dataUrl as a file */
export function downloadScreenshot(dataUrl: string, filename: string): void {
  downloadDataUrl(dataUrl, filename);
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

// ── Smart-screenshot click highlight ─────────────────────────────────────
// Loads the captured dataUrl into a canvas, scales the click bounding-box
// by DPR, draws a translucent purple ring + arrow at the clicked element,
// and returns the re-encoded PNG dataUrl. Returns null if anything fails so
// the caller falls back to the un-highlighted screenshot.

interface BBox { x: number; y: number; width: number; height: number; }

function isBoundingBoxInViewport(bbox: BBox): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Skip if the box is entirely outside the viewport, sized 0, or negative.
  if (bbox.width <= 0 || bbox.height <= 0) return false;
  if (bbox.x + bbox.width < 0 || bbox.y + bbox.height < 0) return false;
  if (bbox.x > vw || bbox.y > vh) return false;
  return true;
}

async function drawClickHighlight(dataUrl: string, bbox: BBox): Promise<string | null> {
  const img = await loadImage(dataUrl);
  if (!img) return null;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Polyfill roundRect on contexts without it (older Chromium/Firefox).
  if (typeof (ctx as any).roundRect !== "function") {
    (ctx as any).roundRect = function (x: number, y: number, w: number, h: number, r: number) {
      const rad = Math.min(r, w / 2, h / 2);
      this.moveTo(x + rad, y);
      this.lineTo(x + w - rad, y);
      this.quadraticCurveTo(x + w, y, x + w, y + rad);
      this.lineTo(x + w, y + h - rad);
      this.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      this.lineTo(x + rad, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - rad);
      this.lineTo(x, y + rad);
      this.quadraticCurveTo(x, y, x + rad, y);
      this.closePath();
    };
  }

  ctx.drawImage(img, 0, 0);

  // DPR scaling — the captured image's pixel dims may differ from CSS px.
  const scaleX = canvas.width / window.innerWidth;
  const scaleY = canvas.height / window.innerHeight;
  const x = bbox.x * scaleX;
  const y = bbox.y * scaleY;
  const w = bbox.width * scaleX;
  const h = bbox.height * scaleY;
  const padding = 8 * Math.max(scaleX, 1);

  // Cap ring at 80% of canvas to avoid drawing absurdly large highlights.
  const maxW = canvas.width * 0.8;
  const maxH = canvas.height * 0.8;
  const ringW = Math.min(w + padding * 2, maxW);
  const ringH = Math.min(h + padding * 2, maxH);
  const ringX = x - padding;
  const ringY = y - padding;
  const ringR = Math.min(ringW, ringH) / 2 + 4;

  // Subtle outer dim — focuses attention on the highlighted region.
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Punch a hole back to original at the highlighted area.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.roundRect(ringX, ringY, ringW, ringH, Math.min(12 * scaleX, ringR));
  ctx.fill();
  ctx.restore();

  // Re-draw the original image at the cleared region so the highlighted
  // area shows the source pixels (not white).
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ringX, ringY, ringW, ringH, Math.min(12 * scaleX, ringR));
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // Translucent purple ring around the element.
  ctx.strokeStyle = "rgba(123, 97, 255, 0.85)";
  ctx.lineWidth = Math.max(4 * scaleX, 3);
  ctx.beginPath();
  ctx.roundRect(ringX, ringY, ringW, ringH, Math.min(12 * scaleX, ringR));
  ctx.stroke();

  // Arrow from the nearest screen edge pointing into the ring.
  drawArrowToBox(ctx, canvas.width, canvas.height, ringX, ringY, ringW, ringH, scaleX);

  try {
    return canvas.toDataURL("image/png", 0.85);
  } catch {
    return null;
  }
}

function drawArrowToBox(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  scale: number
): void {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;

  // Pick the nearest edge.
  const distLeft = rx;
  const distRight = cw - (rx + rw);
  const distTop = ry;
  const distBottom = ch - (ry + rh);
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);

  let startX: number, startY: number, endX: number, endY: number;
  const margin = 24 * scale;
  if (minDist === distLeft) {
    startX = Math.max(8 * scale, rx - margin - 60 * scale);
    startY = cy;
    endX = rx - 6 * scale;
    endY = cy;
  } else if (minDist === distRight) {
    startX = Math.min(cw - 8 * scale, rx + rw + margin + 60 * scale);
    startY = cy;
    endX = rx + rw + 6 * scale;
    endY = cy;
  } else if (minDist === distTop) {
    startX = cx;
    startY = Math.max(8 * scale, ry - margin - 60 * scale);
    endX = cx;
    endY = ry - 6 * scale;
  } else {
    startX = cx;
    startY = Math.min(ch - 8 * scale, ry + rh + margin + 60 * scale);
    endX = cx;
    endY = ry + rh + 6 * scale;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(123, 97, 255, 0.95)";
  ctx.fillStyle = "rgba(123, 97, 255, 0.95)";
  ctx.lineWidth = Math.max(3 * scale, 2);
  ctx.lineCap = "round";

  // Shaft
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Arrow head
  const angle = Math.atan2(endY - startY, endX - startX);
  const head = 14 * scale;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(angle - Math.PI / 6), endY - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - head * Math.cos(angle + Math.PI / 6), endY - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
