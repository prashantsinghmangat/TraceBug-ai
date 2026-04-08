// ── Screenshot manager ────────────────────────────────────────────────────
// Captures page screenshots using html2canvas (bundled — no CDN fetch).
// Falls back to a DOM snapshot if html2canvas is unavailable.
// Screenshots stored in memory (not localStorage) to avoid quota issues.

import { ScreenshotData, TraceBugEvent } from "./types";

// Lazy-load html2canvas — only fetched when user takes a screenshot
let _html2canvas: typeof import('html2canvas').default | null = null;
async function getHtml2Canvas() {
  if (!_html2canvas) {
    try {
      const mod = await import('html2canvas');
      _html2canvas = mod.default;
    } catch {}
  }
  return _html2canvas;
}

const PANEL_ID = "tracebug-dashboard-panel";
const BTN_ID = "tracebug-dashboard-btn";

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

export async function captureScreenshot(
  lastEvent?: TraceBugEvent | null
): Promise<ScreenshotData> {
  screenshotCounter++;

  const eventContext = lastEvent
    ? buildEventLabel(lastEvent)
    : "manual_capture";

  const filename = `${String(screenshotCounter).padStart(2, "0")}_${sanitizeFilename(eventContext)}.png`;

  // Hide TraceBug UI before capturing
  const panel = document.getElementById(PANEL_ID);
  const btn = document.getElementById(BTN_ID);
  const root = document.getElementById("tracebug-root");
  if (root) root.style.display = "none";

  let dataUrl: string;
  let width = window.innerWidth;
  let height = window.innerHeight;

  try {
    const renderer = await getHtml2Canvas();
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
      });
      dataUrl = canvas.toDataURL("image/png", 0.8);
      width = canvas.width;
      height = canvas.height;
    } else {
      // Fallback: capture a simple snapshot marker
      dataUrl = await captureViaCanvas();
    }
  } catch {
    dataUrl = await captureViaCanvas();
  }

  // Restore TraceBug UI
  if (root) root.style.display = "";

  const screenshot: ScreenshotData = {
    id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    dataUrl,
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
  const ctx = canvas.getContext("2d")!;
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
