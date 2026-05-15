// ── HTML Replay Exporter ──────────────────────────────────────────────────
// Bundles a session into a single self-contained `.html` file. Recipient
// opens the file offline → full interactive replay. Zero dependencies, zero
// network requests.
//
// Inputs reuse what's already in memory: events from the session, screenshots
// (already base64 dataUrls), the optional video Blob, and the BugReport.

import { BugReport, StoredSession } from "../types";
import { buildTimeline } from "../timeline-builder";
import { buildReplayHtml, BundlePayload } from "./html-template";

export interface HtmlReplayOptions {
  /** Include the video blob in the bundle (can be 50+ MB). Default: true if present. */
  includeVideo?: boolean;
  /** Override the default filename pattern. */
  filename?: string;
  /** Additional description (markdown) to prepend to the report panel. */
  descriptionOverride?: string;
}

export interface ExportedReplay {
  filename: string;
  blob: Blob;
  url: string;
  sizeBytes: number;
}

/**
 * Generate the replay-as-HTML and trigger a browser download. Returns the
 * blob + URL so the caller can also inspect or pipe elsewhere.
 *
 * Caller passes the already-built `BugReport` so we don't double-compute.
 */
export async function exportSessionAsHtml(
  session: StoredSession,
  report: BugReport,
  options?: HtmlReplayOptions
): Promise<ExportedReplay> {
  const includeVideo = options?.includeVideo ?? !!report.video;

  // Build a timeline that mirrors the live scrubber's marker logic.
  const timeline = buildTimeline(session.events).map(t => ({
    timestamp: t.timestamp,
    type: t.type,
    description: t.description,
    elapsed: t.elapsed,
    isError: t.isError,
  }));

  // Encode the video to a data URL for embedding. Prefer the raw base64
  // data URL we kept on the recording — it's still valid even if the
  // in-memory blob URL got revoked (page reload, modal re-open). Falls
  // back to fetching the blob URL only if we don't have the data URL,
  // which happens for legacy recordings.
  let videoPayload: BundlePayload["video"] | undefined;
  if (includeVideo && report.video) {
    try {
      const v = report.video;
      let dataUrl: string | null = (v.dataUrl && typeof v.dataUrl === "string" && v.dataUrl.startsWith("data:"))
        ? v.dataUrl
        : null;
      if (!dataUrl && v.url) {
        dataUrl = await blobUrlToDataUrl(v.url, v.mimeType);
      }
      if (dataUrl) {
        videoPayload = {
          dataUrl,
          mimeType: v.mimeType,
          durationMs: v.durationMs,
          sizeBytes: v.sizeBytes,
          startedAt: v.startedAt,
          comments: v.comments.slice(),
        };
      } else {
        console.warn("[TraceBug] Video data URL unavailable at export time — recording will be missing from the .html");
      }
    } catch (err) {
      console.warn("[TraceBug] Failed to encode video for export:", err);
    }
  }

  // Build the kv pairs for the Info tab — environment + custom context.
  const env = report.environment;
  // Render kv pairs for the Info tab. Each value optionally carries an
  // icon for the OS / browser / device / connection / etc. — same set
  // the modal uses, kept inline so the export stays self-contained.
  function browserIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("chrome")) return "🔵";
    if (n.includes("edge")) return "🔷";
    if (n.includes("firefox")) return "🦊";
    if (n.includes("safari")) return "🧭";
    if (n.includes("opera")) return "🎭";
    if (n.includes("brave")) return "🦁";
    return "🌐";
  }
  function osIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("mac") || n.includes("darwin")) return "🍎";
    if (n.includes("windows") || n.includes("win")) return "🪟";
    if (n.includes("linux")) return "🐧";
    if (n.includes("ios") || n.includes("iphone") || n.includes("ipad")) return "📱";
    if (n.includes("android")) return "🤖";
    return "💻";
  }
  function deviceIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n === "tablet" || n === "mobile") return "📱";
    return "🖥";
  }
  function connectionIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("wifi")) return "📶";
    if (n.includes("ethernet")) return "🔌";
    if (n.includes("5g") || n.includes("4g") || n.includes("3g") || n.includes("cellular")) return "📡";
    return "🌐";
  }
  const info: Array<{ k: string; v: string; i?: string }> = [
    { k: "URL", v: env.url, i: "🔗" },
    { k: "Timestamp", v: new Date(env.timestamp || report.generatedAt).toLocaleString(), i: "🕒" },
    { k: "OS", v: env.os, i: osIcon(env.os) },
    { k: "Browser", v: `${env.browser} ${env.browserVersion}`.trim(), i: browserIcon(env.browser) },
    { k: "Viewport", v: env.viewport, i: "📐" },
    { k: "Screen", v: env.screenResolution, i: "🖼" },
    { k: "Device", v: env.deviceType, i: deviceIcon(env.deviceType) },
    { k: "Language", v: env.language, i: "🗣" },
    { k: "Timezone", v: env.timezone, i: "🌍" },
    { k: "Connection", v: env.connectionType, i: connectionIcon(env.connectionType) },
    { k: "Session", v: session.sessionId.slice(0, 12), i: "🆔" },
    { k: "Severity", v: report.severity },
  ];
  if (report.context) {
    for (const k of Object.keys(report.context)) {
      info.push({ k, v: String(report.context[k]) });
    }
  }

  const payload: BundlePayload = {
    meta: {
      title: report.title,
      severity: report.severity,
      summary: report.summary || "",
      rootCause: report.rootCause?.hint || "",
      page: report.environment?.url || session.events[0]?.page || "",
      generatedAt: report.generatedAt,
      sessionId: session.sessionId,
      environment: formatEnv(report),
      durationMs: estimateDuration(session, report),
    },
    description: options?.descriptionOverride ?? report.steps ?? "",
    events: timeline,
    screenshots: report.screenshots.map(s => ({
      timestamp: s.timestamp,
      // Prefer the un-highlighted version when available so the replay shows
      // the actual page state, not the smart-screenshot annotation.
      dataUrl: s.originalDataUrl || s.dataUrl,
      filename: s.filename,
    })),
    video: videoPayload,
    info,
    consoleErrors: report.consoleErrors.map(e => ({
      message: e.message,
      stack: e.stack,
      timestamp: e.timestamp,
    })),
    consoleLogs: report.consoleLogs ? report.consoleLogs.slice() : undefined,
    networkErrors: report.networkErrors.slice(),
    networkRequests: (report.networkRequests || report.networkErrors).slice(),
    actions: report.sessionSteps.slice(),
    actionChips: (report.actionChips || []).slice(),
    annotations: (report.annotations || []).map(a => ({
      severity: a.severity,
      text: a.text,
      expected: a.expected,
      actual: a.actual,
    })),
    rootCauseHint: report.rootCause ? {
      hint: report.rootCause.hint,
      confidence: report.rootCause.confidence,
    } : undefined,
  };

  const html = buildReplayHtml(payload);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const filename = options?.filename || defaultFilename(session.sessionId);
  triggerDownload(url, filename);

  return { filename, blob, url, sizeBytes: blob.size };
}

function defaultFilename(sessionId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `tracebug-replay-${sessionId.slice(0, 8)}-${stamp}.html`;
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Don't immediately revokeObjectURL — some browsers (Firefox) need the URL
  // alive briefly for the download to complete. Revoke after a 30s buffer.
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 30000);
}

function formatEnv(report: BugReport): string {
  const e = report.environment;
  if (!e) return "";
  return `${e.browser} ${e.browserVersion} · ${e.os} · ${e.viewport}`;
}

function estimateDuration(session: StoredSession, report: BugReport): number {
  // Use the widest of: event stream, screenshots, optional video. Otherwise
  // a session with a single click + one auto-screenshot reads as 0ms even
  // though several seconds elapsed between the click and the capture.
  const tss: number[] = [];
  for (const e of session.events) tss.push(e.timestamp);
  for (const s of report.screenshots) tss.push(s.timestamp);
  if (report.video) {
    tss.push(report.video.startedAt);
    tss.push(report.video.startedAt + report.video.durationMs);
  }
  if (tss.length === 0) return 0;
  return Math.max(...tss) - Math.min(...tss);
}

/**
 * Resolve a `blob:` URL back into a base64 data URL. Used to embed the
 * recording into the HTML bundle. Same-origin only — `blob:` URLs always
 * are. Returns null on failure.
 */
async function blobUrlToDataUrl(blobUrl: string, fallbackMime: string): Promise<string | null> {
  try {
    const res = await fetch(blobUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = reject;
      // Some browsers drop the mime on the FileReader output — restore it.
      const restore = (s: string) =>
        s.startsWith("data:;") ? s.replace("data:;", `data:${fallbackMime};`) : s;
      reader.readAsDataURL(blob);
      reader.onloadend = () => resolve(restore(typeof reader.result === "string" ? reader.result : ""));
    });
  } catch {
    return null;
  }
}
