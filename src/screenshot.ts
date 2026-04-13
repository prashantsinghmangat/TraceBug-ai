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
 * When running inside a Chrome Extension, html2canvas fails due to CORS.
 * Use chrome.tabs.captureVisibleTab instead, routed through a CustomEvent
 * to the content script → background script.
 */
function isExtensionContext(): boolean {
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

export async function captureScreenshot(
  lastEvent?: TraceBugEvent | null,
  options?: { includeAnnotations?: boolean }
): Promise<ScreenshotData> {
  screenshotCounter++;

  const includeAnnotations = options?.includeAnnotations ?? false;

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
  }

  // Restore TraceBug UI
  if (includeAnnotations) {
    hiddenEls.forEach(el => el.style.display = "");
  } else {
    if (root) root.style.display = "";
  }

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
