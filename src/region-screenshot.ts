// ── Region screenshot (snipping-tool style) ───────────────────────────────
// Shows a fullscreen overlay; user drags a rectangle; returns a cropped
// ScreenshotData. Reuses the existing captureScreenshot() pipeline so we
// inherit the chrome.tabs.captureVisibleTab path in extension context and
// the html2canvas fallback in plain-SDK context — no new heavy deps.

import { ScreenshotData } from "./types";
import { captureScreenshot, loadHtml2CanvasShared, pushScreenshot, isNonRenderingLink } from "./screenshot";

interface Rect { x: number; y: number; w: number; h: number; }

/** Show a fullscreen overlay; user drags a rectangle; returns cropped ScreenshotData. */
export function captureRegionScreenshot(): Promise<ScreenshotData | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.dataset.tracebug = "region-overlay";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "2147483647",
      background: "rgba(0,0,0,0.35)", cursor: "crosshair", userSelect: "none",
    });

    const sel = document.createElement("div");
    sel.dataset.tracebug = "region-overlay";
    Object.assign(sel.style, {
      position: "absolute", border: "2px dashed #7C5CFF",
      background: "rgba(123,97,255,0.15)", display: "none",
      pointerEvents: "none",
    });
    overlay.appendChild(sel);

    const hint = document.createElement("div");
    hint.dataset.tracebug = "region-overlay";
    hint.textContent = "Drag to select an area · Esc to cancel";
    Object.assign(hint.style, {
      position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)",
      padding: "8px 14px", borderRadius: "8px", background: "rgba(20,20,30,0.85)",
      color: "#fff", font: "13px/1.4 system-ui, -apple-system, sans-serif",
      pointerEvents: "none",
    });
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    let sx = 0, sy = 0, dragging = false;

    const onDown = (e: MouseEvent) => {
      dragging = true; sx = e.clientX; sy = e.clientY;
      sel.style.left = `${sx}px`; sel.style.top = `${sy}px`;
      sel.style.width = "0px"; sel.style.height = "0px"; sel.style.display = "block";
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
      Object.assign(sel.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    };

    const cleanup = () => {
      overlay.removeEventListener("mousedown", onDown);
      overlay.removeEventListener("mousemove", onMove);
      overlay.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); cleanup(); resolve(null); }
    };

    const onUp = async (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      const rect: Rect = {
        x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY),
        w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy),
      };
      cleanup();
      if (rect.w < 5 || rect.h < 5) { resolve(null); return; }

      try {
        // Prefer html2canvas directly with the absolute (document-space)
        // selection rect. captureScreenshot+crop didn't survive scrolled
        // pages — html2canvas renders from document origin, not viewport,
        // so a viewport-space crop landed in the wrong place.
        const renderer = await loadHtml2CanvasShared();
        if (renderer) {
          const docX = window.scrollX + rect.x;
          const docY = window.scrollY + rect.y;
          const canvas = await renderer(document.body, {
            useCORS: true,
            allowTaint: true,
            logging: false,
            scale: window.devicePixelRatio || 1,
            x: docX,
            y: docY,
            width: rect.w,
            height: rect.h,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: document.documentElement.scrollHeight,
            ignoreElements: (el: Element) => {
              // Skip invisible preload/prefetch links — avoids a browser warning
              // when html2canvas clones them into its render iframe.
              if (isNonRenderingLink(el)) return true;
              if (el.id === "tracebug-root") return true;
              if ((el as HTMLElement).dataset?.tracebug) return true;
              return false;
            },
          });
          const dataUrl = canvas.toDataURL("image/png", 0.92);
          const ts = Date.now();
          const ss: ScreenshotData = {
            id: `ss_${ts}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: ts,
            dataUrl,
            filename: `region-${new Date(ts).toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`,
            eventContext: "Region screenshot",
            page: location.pathname,
            width: rect.w,
            height: rect.h,
          };
          pushScreenshot(ss);
          resolve(ss);
          return;
        }
        // Fallback (extension-only context, no html2canvas available):
        // use the legacy capture-then-crop path. captureVisibleTab returns
        // the visible viewport so the crop math still aligns. The base
        // captureScreenshot already pushed the full image to the store —
        // overwrite its dataUrl in place so the store reflects the crop.
        const full = await captureScreenshot(null);
        const cropped = await cropDataUrl(full.dataUrl, rect);
        full.dataUrl = cropped;
        full.width = rect.w;
        full.height = rect.h;
        full.filename = full.filename.replace(/\.png$/, "_region.png");
        resolve(full);
      } catch (err) {
        console.warn("[TraceBug] Region screenshot failed:", err);
        resolve(null);
      }
    };

    overlay.addEventListener("mousedown", onDown);
    overlay.addEventListener("mousemove", onMove);
    overlay.addEventListener("mouseup", onUp);
    // Capture-phase so we win against page handlers
    document.addEventListener("keydown", onKey, true);
  });
}

/** Crop a base64 PNG to the given viewport-space rect. Handles DPR scaling. */
function cropDataUrl(dataUrl: string, r: Rect): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // captureVisibleTab returns device pixels; html2canvas at scale:1 returns CSS pixels.
      // Either way, scaling by naturalWidth / innerWidth gives the correct factor.
      const sx = img.naturalWidth / window.innerWidth;
      const sy = img.naturalHeight / window.innerHeight;
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(r.w * sx));
      c.height = Math.max(1, Math.round(r.h * sy));
      const ctx = c.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, r.x * sx, r.y * sy, r.w * sx, r.h * sy, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/png", 0.9));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
