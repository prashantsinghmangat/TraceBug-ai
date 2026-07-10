// ── HTML Replay Exporter ──────────────────────────────────────────────────
// Bundles a session into a single self-contained `.html` file. Recipient
// opens the file offline → full interactive replay. Zero dependencies, zero
// network requests.
//
// Inputs reuse what's already in memory: events from the session, screenshots
// (already base64 dataUrls), the optional video Blob, and the BugReport.

import { BugReport, StoredSession, StorageEntry } from "../types";
import { buildTimeline } from "../timeline-builder";
import { buildReplayHtml, BundlePayload } from "./html-template";
import { priorityLabel } from "../report-builder";

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
  const { blob } = await buildReplayPayload(session, report, options);
  const url = URL.createObjectURL(blob);
  const filename = options?.filename || defaultFilename(session.sessionId);
  triggerDownload(url, filename);
  return { filename, blob, url, sizeBytes: blob.size };
}

// Same payload assembly, without the download trigger. Used by the cloud
// share path so both code paths stay in lockstep — touching one updates both.
export async function buildReplayBlob(
  session: StoredSession,
  report: BugReport,
  options?: HtmlReplayOptions,
): Promise<Blob> {
  const { blob } = await buildReplayPayload(session, report, options);
  return blob;
}

async function buildReplayPayload(
  session: StoredSession,
  report: BugReport,
  options?: HtmlReplayOptions,
): Promise<{ blob: Blob; html: string }> {
  // DOM replay (rrweb) is the preferred, tiny, inspectable replay surface. When
  // it's present we default the base64 video OFF — that's the whole size win
  // (KB of DOM events vs tens of MB of WebM). A caller can still force the video
  // in alongside it with `includeVideo: true`.
  const rrwebEvents = report.video?.rrwebEvents;
  const hasRrweb = Array.isArray(rrwebEvents) && rrwebEvents.length > 0;
  const includeVideo = options?.includeVideo ?? (hasRrweb ? false : !!report.video);

  // Build a timeline that mirrors the live scrubber's marker logic.
  const timeline = buildTimeline(report.session.events).map(t => ({
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
  // icon for the OS / browser / device / connection / etc. — the SAME Lucide
  // set the Quick Bug modal uses (src/ui/quick-bug.ts `_LU`), kept inline so
  // the export stays self-contained (no external assets, no network).
  const LU: Record<string, string> = {
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    chrome: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" x2="12" y1="8" y2="8"/><line x1="3.95" x2="8.54" y1="6.06" y2="14"/><line x1="10.88" x2="15.46" y1="21.94" y2="14"/>',
    ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
    languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
    wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
    plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  };
  const ic = (name: string): string =>
    `<svg class="tb-vlu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LU[name] || LU.globe}</svg>`;
  function browserIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("chrome") || n.includes("edge") || n.includes("brave")) return ic("chrome");
    return ic("globe");
  }
  function osIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("ios") || n.includes("iphone") || n.includes("ipad") || n.includes("android")) return ic("smartphone");
    return ic("monitor");
  }
  function deviceIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n === "tablet" || n === "mobile") return ic("smartphone");
    return ic("monitor");
  }
  function connectionIcon(n: string): string {
    n = (n || "").toLowerCase();
    if (n.includes("wifi")) return ic("wifi");
    if (n.includes("ethernet")) return ic("plug");
    if (n.includes("5g") || n.includes("4g") || n.includes("3g") || n.includes("cellular")) return ic("signal");
    return ic("globe");
  }
  const info: Array<{ k: string; v: string; i?: string }> = [
    { k: "URL", v: env.url, i: ic("link") },
    { k: "Timestamp", v: new Date(env.timestamp || report.generatedAt).toLocaleString(), i: ic("clock") },
    { k: "OS", v: env.os, i: osIcon(env.os) },
    { k: "Browser", v: `${env.browser} ${env.browserVersion}`.trim(), i: browserIcon(env.browser) },
    { k: "Viewport", v: env.viewport, i: ic("ruler") },
    { k: "Screen", v: env.screenResolution, i: ic("monitor") },
    { k: "Device", v: env.deviceType, i: deviceIcon(env.deviceType) },
    { k: "Language", v: env.language, i: ic("languages") },
    { k: "Timezone", v: env.timezone, i: ic("globe") },
    { k: "Connection", v: env.connectionType, i: connectionIcon(env.connectionType) },
    { k: "Session", v: session.sessionId.slice(0, 12), i: ic("hash") },
    { k: "Severity", v: report.severity },
    // Tester-set only — the severity-derived fallback isn't their triage call.
    ...(session.priority ? [{ k: "Priority", v: priorityLabel(session.priority), i: ic("flag") }] : []),
  ];
  if (report.context) {
    for (const k of Object.keys(report.context)) {
      info.push({ k, v: String(report.context[k]) });
    }
  }

  // Web Storage snapshot — each entry as its own kv row (capped for display).
  // Values are already redacted at capture for sensitive keys.
  const STORAGE_DISPLAY_CAP = 20;
  function pushStorageRows(label: string, entries: StorageEntry[] | undefined, droppedAtCapture?: number) {
    if (!entries || entries.length === 0) return;
    const shown = entries.slice(0, STORAGE_DISPLAY_CAP);
    for (const e of shown) {
      info.push({ k: `${label} · ${e.key}`, v: e.redacted ? `🔒 ${e.value}` : e.value, i: "" });
    }
    const hiddenForDisplay = entries.length - shown.length;
    const totalHidden = hiddenForDisplay + (droppedAtCapture || 0);
    if (totalHidden > 0) info.push({ k: `${label} · …`, v: `+${totalHidden} more`, i: "" });
  }
  if (report.storage) {
    pushStorageRows("localStorage", report.storage.local, report.storage.localTruncated);
    pushStorageRows("sessionStorage", report.storage.session, report.storage.sessionTruncated);
    pushStorageRows("Cookies", report.storage.cookies, report.storage.cookiesTruncated);
  }

  const payload: BundlePayload = {
    meta: {
      title: report.title,
      severity: report.severity,
      priority: session.priority ? priorityLabel(session.priority) : undefined,
      summary: report.summary || "",
      rootCause: report.rootCause?.hint || "",
      page: report.environment?.url || report.session.events[0]?.page || "",
      generatedAt: report.generatedAt,
      sessionId: session.sessionId,
      environment: formatEnv(report),
      durationMs: estimateDuration(report.session, report),
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
    // Set below: compressed when the browser has CompressionStream, else raw.
    rrwebEvents: undefined,
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

  // Compress the DOM-replay stream. It's repetitive text and gzips ~8–12×, so
  // this is the single biggest lever on the file size (the stream is ~89% of a
  // typical export). Prefer the compressed field; keep the raw array only as a
  // fallback when the exporting browser lacks CompressionStream — the viewer
  // then reads whichever one is present.
  if (hasRrweb && rrwebEvents) {
    const gz = await gzipToBase64(JSON.stringify(rrwebEvents));
    if (gz) payload.rrwebEventsGz = gz;
    else payload.rrwebEvents = rrwebEvents;
  }

  // Only pull in the ~137 KB rrweb-player runtime when this export actually
  // carries a DOM-replay stream — lazy import so the SDK core bundle is unaffected.
  let rrwebExtras: { rrwebJs: string; rrwebCss: string } | undefined;
  if (hasRrweb) {
    try {
      const rt = await import("./rrweb-runtime.generated");
      rrwebExtras = { rrwebJs: rt.RRWEB_JS, rrwebCss: rt.RRWEB_CSS };
    } catch (err) {
      console.warn("[TraceBug] Failed to load rrweb replay runtime — export will fall back to screenshots:", err);
    }
  }

  const html = buildReplayHtml(payload, rrwebExtras);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return { blob, html };
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
  // When a video exists, it IS the canonical span — the user is going to
  // scrub the video, not the event stream. Older Chrome sessions sometimes
  // carry forward events from a previous tab, and a Math.max over all
  // event timestamps would produce nonsensical "343 minute" durations.
  if (report.video && report.video.durationMs > 0) {
    return report.video.durationMs;
  }
  // No video → fall back to the event/screenshot span (clamped to a
  // sensible upper bound so stale events can't blow the duration up).
  const tss: number[] = [];
  for (const e of session.events) tss.push(e.timestamp);
  for (const s of report.screenshots) tss.push(s.timestamp);
  if (tss.length === 0) return 0;
  const span = Math.max(...tss) - Math.min(...tss);
  // 4-hour ceiling — anything more than that is almost certainly a stale
  // event timestamp leaking into a fresh session.
  return Math.min(span, 4 * 60 * 60 * 1000);
}

/**
 * gzip a string and return it base64-encoded, using the browser's native
 * `CompressionStream`. Returns null when the API is unavailable (very old
 * browsers, or a non-browser build context) so the caller ships the raw
 * events instead. The viewer inflates this with `DecompressionStream`.
 */
async function gzipToBase64(str: string): Promise<string | null> {
  try {
    const CS = (globalThis as { CompressionStream?: unknown }).CompressionStream;
    if (typeof CS !== "function") return null;
    const stream = new Blob([str]).stream().pipeThrough(new (CS as typeof CompressionStream)("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Build the binary string in chunks — String.fromCharCode.apply blows the
    // argument-count limit on large arrays.
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(bin);
  } catch {
    return null;
  }
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
