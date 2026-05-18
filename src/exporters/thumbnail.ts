// ── Cloud-share thumbnail generator ───────────────────────────────────────
// Produces a small JPEG (~5-10 KB at 320x180) for the dashboard card. Same
// content the user already captured — just resized so the dashboard loads
// fast and free-tier Postgres covers thousands of users.
//
// Priority order:
//   1. If the report has a video, capture a frame at ~10% into the recording
//   2. Otherwise, downscale the first screenshot
//   3. If neither exists, return null (dashboard falls back to gradient)

import type { BugReport } from "../types";

const THUMB_W = 320;
const THUMB_H = 180;
const THUMB_QUALITY = 0.7;

export async function generateThumbnail(report: BugReport): Promise<string | null> {
  if (typeof document === "undefined") return null;

  // Try video first — a video frame conveys more about the bug than a static
  // screenshot.
  if (report.video?.dataUrl && report.video.dataUrl.startsWith("data:")) {
    try {
      const dataUrl = await captureVideoFrame(report.video.dataUrl);
      if (dataUrl) return dataUrl;
    } catch {
      // Fall through to screenshot path.
    }
  }

  if (report.screenshots && report.screenshots.length > 0) {
    const src = report.screenshots[0].originalDataUrl || report.screenshots[0].dataUrl;
    if (src && src.startsWith("data:")) {
      try {
        return await downscaleImage(src);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function captureVideoFrame(videoDataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = videoDataUrl;

    const cleanup = () => {
      try { video.removeAttribute("src"); video.load(); } catch {}
    };

    let settled = false;
    const finish = (out: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(out);
    };

    const timer = setTimeout(() => finish(null), 8000);

    video.onloadedmetadata = () => {
      const target = Math.min(1, Math.max(0, (video.duration || 0) * 0.1));
      try { video.currentTime = target; } catch { finish(null); }
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_W;
        canvas.height = THUMB_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { clearTimeout(timer); finish(null); return; }

        const { sx, sy, sw, sh } = fitCover(video.videoWidth || THUMB_W, video.videoHeight || THUMB_H);
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
        clearTimeout(timer);
        finish(canvas.toDataURL("image/jpeg", THUMB_QUALITY));
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    };

    video.onerror = () => { clearTimeout(timer); finish(null); };
  });
}

function downscaleImage(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = THUMB_W;
        canvas.height = THUMB_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        const { sx, sy, sw, sh } = fitCover(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, THUMB_W, THUMB_H);
        resolve(canvas.toDataURL("image/jpeg", THUMB_QUALITY));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Cover-fit crop: pick the slice of source image that fills 16:9 without
// letterboxing. Same math as CSS `object-fit: cover`.
function fitCover(srcW: number, srcH: number) {
  const targetRatio = THUMB_W / THUMB_H;
  const srcRatio = srcW / srcH;
  let sw: number, sh: number, sx: number, sy: number;
  if (srcRatio > targetRatio) {
    sh = srcH;
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW / targetRatio;
    sx = 0;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}
