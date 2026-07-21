// ── HTML Replay Viewer Template ───────────────────────────────────────────
// A self-contained HTML scaffold + inlined renderer. The bundler embeds the
// session JSON (events, screenshots-as-base64, optional video-as-base64,
// metadata) into a single `.html` file the recipient opens offline.
//
// The renderer is written inline as a string so the output file has zero
// dependencies. It re-implements a slim version of the replay scrubber
// (no SDK imports — must be self-contained when run from `file://`).

export interface BundlePayload {
  meta: {
    title: string;
    severity: string;
    /** Tester-assigned priority label (e.g. "High") — shown in the header. */
    priority?: string;
    summary: string;
    rootCause: string;
    page: string;
    generatedAt: number;
    sessionId: string;
    environment: string;
    durationMs: number;
  };
  description: string;       // markdown-ish description body for the report panel
  events: Array<{
    timestamp: number;
    type: string;
    description: string;
    elapsed: string;
    isError: boolean;
  }>;
  screenshots: Array<{
    timestamp: number;
    dataUrl: string;
    filename: string;
  }>;
  video?: {
    dataUrl: string;
    mimeType: string;
    durationMs: number;
    sizeBytes: number;
    startedAt: number;
    comments: Array<{ offsetMs: number; text: string }>;
  };
  /** rrweb DOM-replay event stream. When present (with the player runtime
   *  inlined), the export renders an interactive DOM replay instead of the
   *  base64 video — KB instead of MB, and inspectable. */
  rrwebEvents?: unknown[];
  /** gzip(JSON of rrwebEvents) → base64. The DOM stream is repetitive text and
   *  compresses ~8–12×, so when the exporting browser has `CompressionStream`
   *  we ship this instead of the raw `rrwebEvents` array — the whole file drops
   *  ~4×. The viewer inflates it with the native `DecompressionStream` at load.
   *  `rrwebEvents` is the uncompressed fallback for old browsers on either end. */
  rrwebEventsGz?: string;
  /** Precomputed issue-filing helpers — the file's recipient is often the
   *  person who files the ticket. Only token-free actions belong in a
   *  shareable file: a prefilled github.com URL and copyable markdown.
   *  Generated at export time so no issue-builder code ships in the viewer. */
  github?: { repo?: string; issueUrl?: string; markdown?: string };
  // Tabbed-viewer data — populated in html-replay.ts from BugReport.
  info?: Array<{ k: string; v: string; i?: string }>;
  consoleErrors?: Array<{ message: string; stack?: string; timestamp: number }>;
  /** Full console capture across all levels (error / warn / log / info).
   *  When present, the Console tab renders this instead of the errors-only
   *  list — matches Jam's DevTools-like view. */
  consoleLogs?: Array<{ level: "error" | "warn" | "log" | "info"; message: string; stack?: string; timestamp: number }>;
  networkErrors?: Array<{
    method: string;
    url: string;
    status: number;
    duration: number;
    timestamp: number;
    response?: string;
  }>;
  /** Full request list — when present, rendered in the Network tab. Falls
   *  back to `networkErrors` (failures-only) when absent for backward compat. */
  networkRequests?: Array<{
    method: string;
    url: string;
    status: number;
    duration: number;
    timestamp: number;
    response?: string;
  }>;
  actions?: string[];
  /** Action chips for the Actions tab. When present, rendered instead of
   *  the plain `actions` strings (which stay as a fallback for older bundles). */
  actionChips?: Array<{
    verb: string;
    kind: string;
    target?: string;
    nounLabel?: string;
    element?: {
      tag: string;
      attrs: Array<{ name: string; value: string }>;
      moreCount: number;
    };
    detail?: string;
    frustration?: "rage" | "dead" | "abandon";
    timestamp: number;
    isError?: boolean;
  }>;
  annotations?: Array<{
    severity: string;
    text: string;
    expected?: string;
    actual?: string;
  }>;
  rootCauseHint?: { hint: string; confidence: string };
}

/**
 * Build the full HTML document for a single-file replay export.
 *
 * Output is one self-contained `.html` file. Opens offline. Zero requests.
 */
export function buildReplayHtml(
  payload: BundlePayload,
  extras?: { rrwebJs?: string; rrwebCss?: string },
): string {
  const dataJson = JSON.stringify(payload).replace(/<\/script>/gi, "<\\/script>");
  // DOM-replay export: inline rrweb's core Replayer runtime + its CSS, and add
  // the replay stage + a small control bar. Only active when the exporter passed
  // both the events (in payload) and the runtime (in extras).
  const hasRrwebData =
    (Array.isArray(payload.rrwebEvents) && payload.rrwebEvents.length > 0) ||
    (typeof payload.rrwebEventsGz === "string" && payload.rrwebEventsGz.length > 0);
  const hasRrweb = hasRrwebData && !!extras?.rrwebJs;
  const rrwebCssTag = hasRrweb && extras?.rrwebCss ? `<style>${extras.rrwebCss}</style>` : "";
  const rrwebJsTag = hasRrweb && extras?.rrwebJs ? `<script>${extras.rrwebJs}</script>` : "";
  const rrwebBlock = hasRrweb
    ? `<div class="tb-vpreview tb-vrrweb" id="rrweb-wrap" style="display:none">
      <div id="rrweb-root" class="tb-vrrweb-stage"></div>
      <div id="rrweb-ctrl" class="tb-vrrweb-ctrl" style="display:none">
        <button id="rr-play" class="tb-vrrweb-btn" aria-label="Play / pause replay (Space)">▶</button>
        <input id="rr-seek" class="tb-vrrweb-seek" type="range" min="0" max="1000" value="0" aria-label="Seek replay" />
        <span id="rr-time" class="tb-vrrweb-time">0:00 / 0:00</span>
      </div>
    </div>`
    : "";
  // The renderer below is written defensively — it reads `tb-data` and renders
  // the report + scrubber + screenshot preview. Self-contained, no externals.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TraceBug Replay — ${escapeHtml(payload.meta.title)}</title>
<style>${REPLAY_CSS}</style>
${rrwebCssTag}
<style>
.tb-vrrweb{display:block;padding:10px;min-height:0}
.tb-vrrweb-stage{position:relative;width:100%;overflow:hidden;background:#fff;border:1px solid var(--tb-border);border-radius:var(--tb-radius-sm)}
.tb-vrrweb-stage .replayer-wrapper{position:relative;transform-origin:top left}
.tb-vrrweb-stage iframe{border:0;background:#fff}
.tb-vrrweb-ctrl{display:flex;align-items:center;gap:10px;margin-top:8px}
.tb-vrrweb-btn{background:var(--tb-accent,#6366F1);color:#fff;border:0;border-radius:6px;width:36px;height:30px;cursor:pointer;font-size:12px;line-height:1;flex-shrink:0}
.tb-vrrweb-btn:hover{filter:brightness(1.08)}
.tb-vrrweb-seek{flex:1;accent-color:var(--tb-accent,#6366F1);cursor:pointer}
.tb-vrrweb-time{font-family:var(--tb-mono);font-size:12px;color:var(--tb-text-3);min-width:92px;text-align:right;flex-shrink:0}
</style>
</head>
<body>
<header class="tb-vh">
  <div class="tb-vh-row">
    <span class="tb-vh-logo">🐞</span>
    <span class="tb-vh-title" id="title"></span>
    <span class="tb-vh-sev" id="sev"></span>
    <span class="tb-vh-sev tb-vh-prio" id="prio" style="display:none"></span>
    <a class="tb-vh-issue" id="gh-open" style="display:none" target="_blank" rel="noopener noreferrer" title="Open a prefilled GitHub issue — opens github.com in a new tab; nothing is uploaded from this file">Open GitHub issue</a>
    <button class="tb-vh-issue" id="gh-copy" style="display:none" title="Copy this report as issue markdown — paste into GitHub, GitLab, Jira, anywhere">Copy issue markdown</button>
    <button class="tb-vh-toggle" id="compact-toggle" title="Toggle compact mode (F)" aria-label="Toggle compact mode">⛶</button>
    <button class="tb-vh-toggle" id="theme-toggle" title="Toggle theme (auto / light / dark)" aria-label="Toggle theme">🌗</button>
    <button class="tb-vh-toggle" id="help-toggle" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
  </div>
  <div class="tb-vh-meta" id="meta"></div>
</header>
<main class="tb-vmain">
  <section class="tb-vleft">
    <h2 class="tb-vh2">Replay</h2>
    ${rrwebBlock}
    <div class="tb-vpreview" id="preview-wrap">
      <video id="video" controls playsinline style="display:none"></video>
      <img id="ssimg" alt="Session screenshot" />
      <div id="empty" class="tb-vempty" style="display:none">No screenshots captured.</div>
      <button id="play-overlay" class="tb-vplay-overlay" style="display:none" aria-label="Play recording (Space)">
        <span class="tb-vplay-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
        <span class="tb-vplay-label">Play recording</span>
        <span class="tb-vplay-sub" id="play-overlay-sub"></span>
      </button>
    </div>
    <div id="scrubber"></div>
    <div class="tb-vss-meta" id="ssmeta"></div>
    <div id="ss-gallery" class="tb-vss-gallery" style="display:none"></div>
    <div id="desc-wrap" style="display:none">
      <h2 class="tb-vh2">Description</h2>
      <pre class="tb-vdesc" id="desc"></pre>
    </div>
    <div id="hover-thumb" class="tb-vhover-thumb" style="display:none">
      <img id="hover-thumb-img" alt="" />
      <div id="hover-thumb-time"></div>
    </div>
  </section>
  <section class="tb-vright">
    <div class="tb-vsummary-box">
      <div class="tb-vsummary" id="summary"></div>
    </div>
    <div class="tb-vtabstrip" role="tablist">
      <button data-tab="info" class="tb-vtab tb-vtab-active" role="tab">Info</button>
      <button data-tab="console" class="tb-vtab" role="tab">Console <span class="tb-vtab-badge" id="badge-console"></span></button>
      <button data-tab="network" class="tb-vtab" role="tab">Network <span class="tb-vtab-badge" id="badge-network"></span></button>
      <button data-tab="actions" class="tb-vtab" role="tab">Actions <span class="tb-vtab-badge" id="badge-actions"></span></button>
      <button data-tab="ai" class="tb-vtab" role="tab">AI</button>
      <button data-tab="events" class="tb-vtab" role="tab">Events <span class="tb-vtab-badge" id="badge-events"></span></button>
    </div>
    <div class="tb-vtabpanels">
      <div data-panel="info" class="tb-vpanel tb-vpanel-active" id="panel-info"></div>
      <div data-panel="console" class="tb-vpanel" id="panel-console" hidden></div>
      <div data-panel="network" class="tb-vpanel" id="panel-network" hidden></div>
      <div data-panel="actions" class="tb-vpanel" id="panel-actions" hidden></div>
      <div data-panel="ai" class="tb-vpanel" id="panel-ai" hidden></div>
      <div data-panel="events" class="tb-vpanel" id="panel-events"><ol class="tb-vevents" id="events"></ol></div>
    </div>
  </section>
</main>
<footer class="tb-vf">
  Generated by <a href="https://github.com/prashantsinghmangat/tracebug-ai" target="_blank" rel="noopener">TraceBug</a> · works offline · no network requests
  <span class="tb-vf-fb">· Did this report give your dev / AI agent what they needed?
    <a href="https://tracebug.dev/feedback?type=other&amp;area=not-sure&amp;msg=${encodeURIComponent("Report verdict 👍 — my dev/AI agent got what they needed from the exported report.")}" target="_blank" rel="noopener" title="Yes">👍</a>
    <a href="https://tracebug.dev/feedback?type=bug&amp;area=not-sure&amp;msg=${encodeURIComponent("Report verdict 👎 — the exported report was missing: ")}" target="_blank" rel="noopener" title="No — tell us what was missing">👎</a>
  </span>
</footer>
<!-- Help overlay: keyboard shortcut cheat sheet -->
<div id="help-overlay" class="tb-vhelp" style="display:none">
  <div class="tb-vhelp-card">
    <div class="tb-vhelp-title">Keyboard shortcuts</div>
    <div class="tb-vhelp-row"><kbd>Space</kbd><span>Play / pause recording</span></div>
    <div class="tb-vhelp-row"><kbd>←</kbd> <kbd>→</kbd><span>Seek &minus;5s / +5s</span></div>
    <div class="tb-vhelp-row"><kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd><span>Rewind 5s / pause / fast-forward 5s</span></div>
    <div class="tb-vhelp-row"><kbd>0</kbd><span>Jump to start</span></div>
    <div class="tb-vhelp-row"><kbd>E</kbd><span>Jump to first error</span></div>
    <div class="tb-vhelp-row"><kbd>F</kbd><span>Toggle compact mode</span></div>
    <div class="tb-vhelp-row"><kbd>1</kbd>–<kbd>6</kbd><span>Switch tabs</span></div>
    <div class="tb-vhelp-row"><kbd>T</kbd><span>Cycle theme (light / dark / auto)</span></div>
    <div class="tb-vhelp-row"><kbd>?</kbd> <kbd>Esc</kbd><span>Toggle / close this overlay</span></div>
    <button class="tb-vhelp-close" id="help-close" aria-label="Close">Close</button>
  </div>
</div>
<script id="tb-data" type="application/json">${dataJson}</script>
${rrwebJsTag}
<script>
${REPLAY_RUNTIME}
</script>
</body>
</html>`;
}

// ── Escape helper for the title in <head> ───────────────────────────────
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Stylesheet (single-file inline) ─────────────────────────────────────
// Self-contained styling for the viewer. Both light and dark palettes are
// embedded; the runtime picks one via prefers-color-scheme (default) and
// the header toggle lets the recipient override.

const REPLAY_CSS = `
/* ── Theme tokens ─────────────────────────────────── */
/* Light is the unconditional default. Dark requires an explicit
 * data-theme="dark" attribute, set by the in-header toggle. The previous
 * prefers-color-scheme auto-switch was removed in favor of this. */
:root {
  --tb-bg: #ffffff;
  --tb-bg-2: #FAFAFA;
  --tb-bg-3: #F4F4F5;
  --tb-text: #111113;
  --tb-text-2: #52525B;
  --tb-text-3: #82828C;
  --tb-accent: #4F46E5;
  --tb-accent-2: #4338CA;
  --tb-accent-soft: #4F46E514;
  --tb-ring: rgba(79, 70, 229, 0.5);
  --tb-border: #E4E4E7;
  --tb-border-sub: #F4F4F5;
  --tb-border-hover: #D4D4D8;
  --tb-error: #DC2626;
  --tb-error-bg: #fef2f2;
  --tb-warning: #D97706;
  --tb-warning-bg: #fffbeb;
  --tb-success: #16A34A;
  --tb-success-bg: #ecfdf5;
  --tb-info: #2563eb;
  --tb-info-bg: #eff6ff;
  --tb-code-bg: #F4F4F5;
  --tb-code-text: #26262E;
  --tb-code-tag: #be185d;
  --tb-code-attr-name: #a16207;
  --tb-code-attr-val: #15803d;
  --tb-radius-sm: 10px;
  --tb-radius-md: 12px;
  --tb-shadow-md: 0 4px 16px rgba(16,24,40,0.08), 0 2px 4px rgba(16,24,40,0.04);
  --tb-font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --tb-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
}
:root[data-theme="dark"], html[data-theme="dark"] body {
  --tb-bg: #0B0B10;
  --tb-bg-2: #16161D;
  --tb-bg-3: #1E1E26;
  --tb-text: #FAFAFA;
  --tb-text-2: #A1A1AA;
  --tb-text-3: #71717A;
  --tb-accent: #6366F1;
  --tb-accent-2: #818CF8;
  --tb-accent-soft: #6366F11f;
  --tb-ring: rgba(99, 102, 241, 0.5);
  --tb-border: #26262E;
  --tb-border-sub: #1E1E24;
  --tb-border-hover: #2A2A35;
  --tb-error: #EF4444;
  --tb-error-bg: #EF444419;
  --tb-warning: #F59E0B;
  --tb-warning-bg: #F59E0B1a;
  --tb-success: #22C55E;
  --tb-success-bg: #22C55E1a;
  --tb-info: #3B82F6;
  --tb-info-bg: #3B82F619;
  --tb-code-bg: #14141F;
  --tb-code-text: #d4d4d8;
  --tb-code-tag: #f472b6;
  --tb-code-attr-name: #fcd34d;
  --tb-code-attr-val: #86efac;
  --tb-shadow-md: 0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25);
}

/* ── Base ─────────────────────────────────────────── */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--tb-bg); color: var(--tb-text); font-family: var(--tb-font); -webkit-font-smoothing: antialiased; }
/* Focus ring — shadcn new-york (ring-2 ring-primary/60 ring-offset-2). Keyboard
   focus only; matches the injected widget's ring for a consistent product feel. */
button:focus-visible, a:focus-visible, input:focus-visible,
select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--tb-bg), 0 0 0 4px var(--tb-ring);
  border-radius: var(--tb-radius-sm);
}
body { min-height: 100vh; }
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: var(--tb-border); border-radius: 4px; }
*::-webkit-scrollbar-thumb:hover { background: var(--tb-border-hover); }

/* ── Header ───────────────────────────────────────── */
.tb-vh { padding: 18px 24px; background: var(--tb-bg-2); border-bottom: 1px solid var(--tb-border); position: sticky; top: 0; z-index: 10; }
.tb-vh-row { display: flex; align-items: center; gap: 12px; max-width: 1400px; margin: 0 auto; }
.tb-vh-logo { font-size: 20px; }
.tb-vh-title { font-size: 15px; font-weight: 600; flex: 1; word-break: break-word; letter-spacing: -0.01em; }
.tb-vh-sev { font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 999px; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
.tb-vh-prio { background: var(--tb-bg-2); color: var(--tb-text-2); border: 1px solid var(--tb-border); }
.tb-vh-meta { font-size: 11px; color: var(--tb-text-3); margin-top: 6px; max-width: 1400px; margin-left: auto; margin-right: auto; font-weight: 500; }
.tb-vh-toggle { background: transparent; border: 1px solid var(--tb-border); color: var(--tb-text-2); cursor: pointer; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; transition: all .15s; }
.tb-vh-toggle:hover { background: var(--tb-bg-3); border-color: var(--tb-border-hover); color: var(--tb-text); }
.tb-vh-issue { background: transparent; border: 1px solid var(--tb-border); color: var(--tb-text-2); cursor: pointer; font: inherit; font-size: 12px; font-weight: 600; padding: 0 12px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; text-decoration: none; white-space: nowrap; transition: all .15s; }
.tb-vh-issue:hover { background: var(--tb-bg-3); border-color: var(--tb-border-hover); color: var(--tb-text); }

/* ── Layout ───────────────────────────────────────── */
.tb-vmain { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 22px; padding: 22px 24px; max-width: 1400px; margin: 0 auto; }
@media (max-width: 900px) { .tb-vmain { grid-template-columns: 1fr; } }
.tb-vh2 { font-size: 10px; color: var(--tb-text-3); text-transform: uppercase; letter-spacing: .6px; margin: 14px 0 10px; font-weight: 700; }
.tb-vh2:first-child { margin-top: 0; }
.tb-vleft { min-width: 0; }

/* ── Replay preview ─────────────────────────────── */
.tb-vpreview { background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); padding: 10px; min-height: 260px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tb-vpreview img, .tb-vpreview video { max-width: 100%; max-height: 60vh; border-radius: var(--tb-radius-sm); display: block; margin: 0 auto; }
.tb-vss-meta { font-size: 11px; color: var(--tb-text-3); margin-top: 8px; font-family: var(--tb-mono); }
.tb-vempty { color: var(--tb-text-3); font-size: 12px; }

/* ── Right pane: summary + tabs ─────────────────── */
.tb-vsummary-box { margin-bottom: 14px; }
.tb-vsummary { font-size: 13px; line-height: 1.55; padding: 12px 14px; background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); color: var(--tb-text); }
.tb-vdesc { font-size: 12px; line-height: 1.6; padding: 12px; background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); max-height: 360px; overflow: auto; white-space: pre-wrap; word-wrap: break-word; font-family: var(--tb-mono); margin: 0; color: var(--tb-text); }
.tb-vtabstrip { display: flex; gap: 0; background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md) var(--tb-radius-md) 0 0; padding: 0 8px; overflow-x: auto; }
.tb-vtab { background: transparent; border: none; color: var(--tb-text-3); padding: 11px 13px; font-size: 12px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; transition: color .15s, border-color .15s; margin-bottom: -1px; letter-spacing: -0.01em; }
.tb-vtab:hover { color: var(--tb-text); }
.tb-vtab-active { color: var(--tb-text); border-bottom-color: var(--tb-accent); }
.tb-vtab-badge { font-size: 10px; font-weight: 700; background: var(--tb-accent-soft); color: var(--tb-accent); padding: 1px 7px; border-radius: 999px; line-height: 1.4; min-width: 18px; text-align: center; }
.tb-vtab-active .tb-vtab-badge { background: var(--tb-accent); color: #fff; }
.tb-vtab-badge:empty { display: none; }
.tb-vtabpanels { background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-top: none; border-radius: 0 0 var(--tb-radius-md) var(--tb-radius-md); padding: 14px; max-height: 500px; overflow-y: auto; }
.tb-vpanel { display: none; }
.tb-vpanel-active { display: block; }
.tb-vempty-tab { font-size: 13px; color: var(--tb-text-3); padding: 32px 16px; text-align: center; border: 1px dashed var(--tb-border); border-radius: var(--tb-radius-md); }

/* ── Tab content ─────────────────────────────────── */
.tb-vsec-head { font-size: 10px; color: var(--tb-text-3); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin: 14px 0 8px; }
.tb-vsec-head:first-child { margin-top: 0; }
.tb-vkv { display: flex; gap: 12px; padding: 8px 12px; background: var(--tb-bg); border: 1px solid var(--tb-border-sub); border-radius: var(--tb-radius-sm); margin-bottom: 4px; transition: border-color .15s; }
.tb-vkv:hover { border-color: var(--tb-border); }
.tb-vkv-k { font-size: 11px; color: var(--tb-text-3); min-width: 100px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; flex-shrink: 0; }
.tb-vkv-v { font-size: 12px; color: var(--tb-text); word-break: break-word; flex: 1; font-family: var(--tb-mono); display: flex; align-items: center; gap: 6px; }
.tb-vkv-icon { display: inline-flex; align-items: center; line-height: 1; flex-shrink: 0; color: var(--tb-text-3); }
.tb-vlu { width: 14px; height: 14px; display: inline-block; vertical-align: middle; flex-shrink: 0; }
.tb-vlog { padding: 10px 12px; margin-bottom: 8px; background: var(--tb-bg); border: 1px solid var(--tb-border); border-left: 3px solid var(--tb-border-hover); border-radius: var(--tb-radius-sm); }
.tb-vlog-error { border-left-color: var(--tb-error); }
.tb-vlog-warn { border-left-color: var(--tb-warning); }
.tb-vlog-log, .tb-vlog-info { border-left-color: var(--tb-info); }
.tb-vlog-head { display: flex; align-items: flex-start; gap: 8px; }
.tb-vlog-lvl { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: var(--tb-radius-sm); text-transform: uppercase; letter-spacing: 0.4px; flex-shrink: 0; line-height: 1.35; }
.tb-vlog-lvl-error { background: var(--tb-error-bg); color: var(--tb-error); }
.tb-vlog-lvl-warn { background: var(--tb-warning-bg); color: var(--tb-warning); }
.tb-vlog-lvl-log, .tb-vlog-lvl-info { background: var(--tb-info-bg); color: var(--tb-info); }
.tb-vlog-msg { font-size: 12px; color: var(--tb-text); font-family: var(--tb-mono); word-break: break-word; line-height: 1.5; flex: 1; min-width: 0; }
.tb-vlog-error .tb-vlog-msg { color: var(--tb-error); }
.tb-vlog-stack { font-size: 10px; color: var(--tb-text-3); font-family: var(--tb-mono); margin: 8px 0 0; padding: 8px 10px; background: var(--tb-code-bg); border-radius: var(--tb-radius-sm); max-height: 120px; overflow: auto; white-space: pre-wrap; }
.tb-vlog-ts { font-size: 10px; color: var(--tb-text-3); margin-top: 6px; font-family: var(--tb-mono); }
.tb-vnet { padding: 10px 12px; margin-bottom: 6px; background: var(--tb-bg); border-radius: var(--tb-radius-sm); border: 1px solid var(--tb-border); transition: border-color .15s; }
.tb-vnet:hover { border-color: var(--tb-border-hover); }
.tb-vnet-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.tb-vnet-method { font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: var(--tb-radius-sm); background: var(--tb-bg-3); color: var(--tb-text); font-family: var(--tb-mono); letter-spacing: 0.5px; }
.tb-vnet-status { font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: var(--tb-radius-sm); color: #fff; font-family: var(--tb-mono); background: #16a34a; }
.tb-vnet-status.s2 { background: #16a34a; }
.tb-vnet-status.s3 { background: #0891b2; }
.tb-vnet-status.s4 { background: #d97706; }
.tb-vnet-status.s5 { background: #dc2626; }
.tb-vnet-status.serr { background: #7f1d1d; }
.tb-vnet-time { font-size: 11px; color: var(--tb-text-3); margin-left: auto; font-family: var(--tb-mono); }
/* ── DevTools-style Network refactor ───────────────── */
.tb-vnet-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.tb-vnet-search { flex: 1; min-width: 0; background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); color: var(--tb-text); padding: 6px 10px; font-size: 12px; font-family: inherit; outline: none; transition: border-color .15s; }
.tb-vnet-search:focus { border-color: var(--tb-accent); box-shadow: 0 0 0 3px var(--tb-accent-soft); }
.tb-vnet-err-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--tb-text-2); cursor: pointer; white-space: nowrap; }
.tb-vnet-err-toggle input { accent-color: var(--tb-accent); cursor: pointer; }
.tb-vcon-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.tb-vcon-count { font-size: 10px; color: var(--tb-text-3); white-space: nowrap; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; }
.tb-vnet-pills { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px; }
.tb-vnet-pill { background: var(--tb-bg); border: 1px solid var(--tb-border); color: var(--tb-text-2); padding: 4px 11px; font-size: 11px; font-weight: 600; border-radius: 999px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
.tb-vnet-pill:hover { border-color: var(--tb-border-hover); color: var(--tb-text); }
.tb-vnet-pill-active { background: var(--tb-text); color: var(--tb-bg); border-color: var(--tb-text); }
.tb-vnet-pill-n { background: rgba(0,0,0,0.15); padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; }

/* Unified Console feed (Jam-style) */
.tb-vfeed-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.tb-vfeed-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.tb-vfeed-pill { background: var(--tb-bg); border: 1px solid var(--tb-border); color: var(--tb-text-2); padding: 5px 12px; font-size: 11px; font-weight: 600; border-radius: 999px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
.tb-vfeed-pill:hover { border-color: var(--tb-border-hover); color: var(--tb-text); }
.tb-vfeed-pill-active { background: var(--tb-text); color: var(--tb-bg); border-color: var(--tb-text); }
.tb-vfeed-pill-n { background: rgba(0,0,0,0.15); padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 700; min-width: 14px; text-align: center; }
.tb-vfeed-pill-active .tb-vfeed-pill-n { background: rgba(255,255,255,0.22); }
.tb-vfeed-list { display: flex; flex-direction: column; }
.tb-vfeed-row { display: grid; grid-template-columns: 48px 24px 1fr; align-items: flex-start; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--tb-border); transition: background .12s; cursor: pointer; }
.tb-vfeed-row:hover { background: var(--tb-bg-2); }
.tb-vfeed-row-active { background: var(--tb-accent-soft) !important; box-shadow: inset 3px 0 0 var(--tb-accent); }
.tb-vfeed-row:focus { outline: 2px solid var(--tb-accent); outline-offset: -2px; }
.tb-vfeed-time { font-family: var(--tb-mono); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--tb-text-3); padding-top: 3px; }
.tb-vfeed-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; color: var(--tb-text-2); border-radius: var(--tb-radius-sm); flex-shrink: 0; }
.tb-vfeed-body { min-width: 0; }
.tb-vfeed-msg { font-family: var(--tb-mono); font-size: 12px; color: var(--tb-text); word-break: break-word; line-height: 1.5; }
.tb-vfeed-stack { font-family: var(--tb-mono); font-size: 10px; color: var(--tb-text-3); margin: 6px 0 0; padding: 6px 8px; background: var(--tb-code-bg); border-radius: var(--tb-radius-sm); max-height: 120px; overflow: auto; white-space: pre-wrap; }
.tb-vfeed-navigation { background: var(--tb-info-bg); }
.tb-vfeed-navigation .tb-vfeed-icon { color: var(--tb-info); }
.tb-vfeed-network-error { background: var(--tb-error-bg); }
.tb-vfeed-network-error .tb-vfeed-icon { color: var(--tb-error); }
.tb-vfeed-network-error .tb-vfeed-msg { color: var(--tb-error); }
.tb-vfeed-video .tb-vfeed-icon { color: var(--tb-accent); }
.tb-vfeed-lvl-error .tb-vfeed-icon { color: var(--tb-error); }
.tb-vfeed-lvl-error .tb-vfeed-msg { color: var(--tb-error); }
.tb-vfeed-lvl-warn .tb-vfeed-icon { color: var(--tb-warning); }
.tb-vfeed-lvl-warn .tb-vfeed-msg { color: var(--tb-warning); }
.tb-vnet-pill-active .tb-vnet-pill-n { background: rgba(255,255,255,0.2); }
.tb-vnet-table { font-family: var(--tb-mono); font-size: 11px; }
.tb-vnet-row { display: grid; grid-template-columns: 28px 1.4fr 56px 50px 1.1fr 60px 56px 2fr; align-items: center; gap: 8px; padding: 0; background: transparent; border: none; }
.tb-vnet-row.tb-vnet-head { padding: 6px 8px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--tb-text-3); border-bottom: 1px solid var(--tb-border); }
details.tb-vnet-row { display: block; border-bottom: 1px solid var(--tb-border-sub); }
details.tb-vnet-row:hover { background: var(--tb-bg-2); }
.tb-vnet-summary { display: grid; grid-template-columns: 28px 1.4fr 56px 50px 1.1fr 60px 56px 2fr; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; list-style: none; min-height: 24px; }
.tb-vnet-summary::-webkit-details-marker { display: none; }
.tb-vnet-c-n { color: var(--tb-text-3); text-align: right; }
.tb-vnet-c-name { color: var(--tb-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tb-vnet-c-meth { color: var(--tb-text-2); font-weight: 600; font-size: 10px; letter-spacing: 0.4px; }
.tb-vnet-c-stat { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: var(--tb-radius-sm); color: #fff; text-align: center; }
.tb-vnet-c-stat.s2 { background: #16a34a; }
.tb-vnet-c-stat.s3 { background: #0891b2; }
.tb-vnet-c-stat.s4 { background: #d97706; }
.tb-vnet-c-stat.s5 { background: #dc2626; }
.tb-vnet-c-stat.serr { background: #7f1d1d; }
.tb-vnet-c-dom { color: var(--tb-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tb-vnet-c-type { color: var(--tb-text-3); font-size: 10px; }
.tb-vnet-c-time { color: var(--tb-text-2); text-align: right; font-size: 10px; }
.tb-vnet-c-wf { position: relative; height: 14px; background: var(--tb-bg-2); border-radius: 3px; overflow: hidden; }
.tb-vnet-wf-bar { position: absolute; top: 3px; height: 8px; border-radius: 2px; background: var(--tb-accent); }
.tb-vnet-wf-bar.s4 { background: #d97706; }
.tb-vnet-wf-bar.s5 { background: #dc2626; }
.tb-vnet-wf-bar.serr { background: #7f1d1d; }
.tb-vnet-detail { padding: 0 8px 10px 36px; }
.tb-vnet-detail-url { font-size: 11px; color: var(--tb-text-2); word-break: break-all; padding-bottom: 6px; }
.tb-vnet-snippet pre { margin: 0; padding: 8px; background: var(--tb-code-bg); border-radius: var(--tb-radius-sm); font-size: 10px; color: var(--tb-code-text); max-height: 120px; overflow: auto; white-space: pre-wrap; }
/* Tab notification dots */
.tb-vtab-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--tb-accent); margin-left: 4px; vertical-align: middle; }
.tb-vnet-url { font-size: 12px; color: var(--tb-text-2); font-family: var(--tb-mono); word-break: break-all; line-height: 1.5; }
.tb-vnet-snippet { font-size: 10px; color: var(--tb-text-3); font-family: var(--tb-mono); margin: 8px 0 0; padding: 8px 10px; background: var(--tb-code-bg); border-radius: var(--tb-radius-sm); max-height: 96px; overflow: auto; white-space: pre-wrap; }
.tb-vsteps { margin: 0; padding-left: 24px; font-size: 13px; color: var(--tb-text); line-height: 1.7; }
.tb-vsteps li { margin-bottom: 5px; }
.tb-vnote { padding: 10px 12px; margin-bottom: 8px; background: var(--tb-bg); border-radius: var(--tb-radius-sm); border: 1px solid var(--tb-border-sub); border-left: 3px solid var(--tb-border); }
.tb-vnote-critical { border-left-color: var(--tb-error); }
.tb-vnote-major { border-left-color: var(--tb-warning); }
.tb-vnote-minor { border-left-color: #ca8a04; }
.tb-vnote-info { border-left-color: var(--tb-info); }
.tb-vnote-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: var(--tb-text-3); margin-bottom: 5px; }
.tb-vnote-text { font-size: 13px; color: var(--tb-text); line-height: 1.5; }
.tb-vnote-line { font-size: 11px; color: var(--tb-text-2); margin-top: 5px; }
.tb-vai-card { padding: 14px; background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); margin-bottom: 10px; }
.tb-vai-head { font-size: 11px; color: var(--tb-text-3); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.tb-vai-conf { font-size: 9px; padding: 2px 8px; border-radius: 999px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; }
.tb-vai-conf-high { background: var(--tb-success-bg); color: var(--tb-success); }
.tb-vai-conf-medium { background: var(--tb-warning-bg); color: var(--tb-warning); }
.tb-vai-conf-low { background: var(--tb-info-bg); color: var(--tb-info); }
.tb-vai-body { font-size: 13px; color: var(--tb-text); line-height: 1.6; }
.tb-vai-empty .tb-vai-body { color: var(--tb-text-2); }
.tb-vai-prompt { margin: 10px 0 0; padding: 10px 12px; background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-sm); font-family: var(--tb-mono); font-size: 11px; line-height: 1.55; color: var(--tb-text-2); white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
.tb-vai-copy { margin-top: 10px; padding: 8px 14px; background: var(--tb-accent); color: #fff; border: 0; border-radius: var(--tb-radius-sm); cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; }
.tb-vai-copy:hover { filter: brightness(1.1); }

/* Actions tab — chips */
.tb-vchips { display: flex; flex-direction: column; gap: 5px; }
.tb-vchip { display: flex; align-items: flex-start; gap: 12px; padding: 9px 12px; background: var(--tb-bg); border: 1px solid var(--tb-border-sub); border-radius: var(--tb-radius-sm); border-left: 3px solid transparent; font-size: 12px; line-height: 1.5; transition: border-color .15s; }
.tb-vchip:hover { border-color: var(--tb-border); }
.tb-vchip-err { border-left-color: var(--tb-error); }
.tb-vchip-verb { font-size: 10px; font-weight: 700; color: var(--tb-text-3); text-transform: uppercase; letter-spacing: 0.5px; min-width: 66px; flex-shrink: 0; padding-top: 2px; }
.tb-vchip-verb-click { color: var(--tb-accent); }
.tb-vchip-verb-input { color: var(--tb-success); }
.tb-vchip-verb-select { color: #0891b2; }
.tb-vchip-verb-submit { color: var(--tb-info); }
.tb-vchip-verb-navigate { color: #a855f7; }
.tb-vchip-verb-api { color: var(--tb-warning); }
.tb-vchip-verb-error { color: var(--tb-error); }
.tb-vchip-verb-mark { color: #ea580c; }
.tb-vchip-body { flex: 1; min-width: 0; word-break: break-word; }
.tb-vchip-det { display: inline-block; margin-left: 6px; color: var(--tb-text); font-family: var(--tb-mono); }
.tb-vchip-det-err { color: var(--tb-error); }
.tb-vel { font-family: var(--tb-mono); font-size: 12px; color: var(--tb-code-text); }
.tb-vel-tag { color: var(--tb-code-tag); }
.tb-vel-an { color: var(--tb-code-attr-name); }
.tb-vel-av { color: var(--tb-code-attr-val); }
.tb-vel-more { color: var(--tb-text-3); font-style: italic; font-size: 10px; }
/* Human-readable target + frustration glyph */
.tb-vchip-tgt { display: inline-block; margin-right: 8px; font-size: 12px; color: var(--tb-text); }
.tb-vchip-tgt-name { font-weight: 600; }
.tb-vchip-tgt-noun { color: var(--tb-text-2); font-weight: 500; }
.tb-vchip-frust { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
.tb-vchip-frust-rage { background: rgba(239,68,68,0.18); color: #ef4444; }
.tb-vchip-frust-dead { background: rgba(245,158,11,0.18); color: #f59e0b; }
.tb-vchip-frust-abandon { background: rgba(59,130,246,0.18); color: #3b82f6; }

/* Events list */
.tb-vevents { font-size: 12px; line-height: 1.6; padding-left: 24px; margin: 0; max-height: 380px; overflow: auto; color: var(--tb-text); }
.tb-vevents li { margin-bottom: 3px; color: var(--tb-text-2); cursor: pointer; transition: color .15s; }
.tb-vevents li:hover { color: var(--tb-text); }
.tb-vevents li.tb-ve-error { color: var(--tb-error); }
.tb-vevents .tb-ve-time { display: inline-block; min-width: 60px; color: var(--tb-text-3); font-family: var(--tb-mono); font-size: 11px; }

/* ── Footer ───────────────────────────────────────── */
.tb-vf { padding: 18px 24px; text-align: center; font-size: 11px; color: var(--tb-text-3); border-top: 1px solid var(--tb-border); background: var(--tb-bg-2); }
.tb-vf a { color: var(--tb-accent); text-decoration: none; font-weight: 500; }
.tb-vf-fb a { text-decoration: none; margin-left: 3px; opacity: 0.8; display: inline-block; transition: transform .15s, opacity .15s; }
.tb-vf-fb a:hover { opacity: 1; transform: scale(1.2); }
.tb-vf a:hover { color: var(--tb-accent-2); }

/* ── Severity pills ───────────────────────────────── */
.tb-sev-critical { background: var(--tb-error-bg); color: var(--tb-error); border: 1px solid var(--tb-error); }
.tb-sev-high { background: var(--tb-warning-bg); color: var(--tb-warning); border: 1px solid var(--tb-warning); }
.tb-sev-medium { background: var(--tb-warning-bg); color: #ca8a04; border: 1px solid #ca8a04; }
.tb-sev-low { background: var(--tb-success-bg); color: var(--tb-success); border: 1px solid var(--tb-success); }

/* ── Inline scrubber ──────────────────────────────── */
.tb-rs-root { padding: 12px 14px; background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); outline: none; }
.tb-rs-root:focus-visible { box-shadow: 0 0 0 3px var(--tb-accent-soft); border-color: var(--tb-accent); }
.tb-rs-empty { font-size: 12px; color: var(--tb-text-3); padding: 14px; text-align: center; }
.tb-rs-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.tb-rs-label { font-size: 10px; font-weight: 700; color: var(--tb-text-3); text-transform: uppercase; letter-spacing: 0.6px; }
.tb-rs-time { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--tb-text-2); flex: 1; font-family: var(--tb-mono); }
.tb-rs-jump { background: transparent; color: var(--tb-error); border: 1px solid var(--tb-error); border-radius: var(--tb-radius-sm); padding: 4px 10px; font-size: 10px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background .15s; }
.tb-rs-jump:hover { background: var(--tb-error-bg); }
.tb-rs-dl { background: var(--tb-accent); color: #fff; border: 1px solid var(--tb-accent); border-radius: var(--tb-radius-sm); padding: 4px 10px; font-size: 10px; font-weight: 600; font-family: inherit; cursor: pointer; transition: filter .15s; display: inline-flex; align-items: center; gap: 5px; }
.tb-rs-dl:hover { filter: brightness(1.1); }
.tb-rs-track { position: relative; height: 30px; background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: 999px; cursor: pointer; touch-action: none; user-select: none; }
.tb-rs-fill { position: absolute; top: 0; left: 0; height: 100%; width: 0%; background: linear-gradient(90deg, var(--tb-accent-soft), transparent); border-radius: 999px; pointer-events: none; }
.tb-rs-markers { position: absolute; inset: 0; pointer-events: none; }
.tb-rs-marker { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 10px; height: 10px; border-radius: 50%; background: var(--tb-accent); box-shadow: 0 0 0 1px var(--tb-bg-2); pointer-events: auto; cursor: pointer; transition: transform .12s; }
.tb-rs-marker:hover { transform: translate(-50%, -50%) scale(1.4); }
.tb-rs-error { width: 14px; height: 14px; border-radius: 3px; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.tb-rs-handle { position: absolute; top: 50%; width: 18px; height: 18px; transform: translate(-50%, -50%); background: var(--tb-bg); border: 3px solid var(--tb-accent); border-radius: 50%; box-shadow: var(--tb-shadow-md); pointer-events: none; }

/* ── Play overlay (lazy video load) ───────────────── */
.tb-vpreview { position: relative; }
.tb-vplay-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: rgba(0,0,0,0.55); color: #fff; border: none; cursor: pointer; font-family: inherit; transition: background .15s; border-radius: var(--tb-radius-md); }
.tb-vplay-overlay:hover { background: rgba(0,0,0,0.7); }
.tb-vplay-icon { width: 64px; height: 64px; border-radius: 50%; background: var(--tb-accent); display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); transition: transform .15s; }
.tb-vplay-overlay:hover .tb-vplay-icon { transform: scale(1.06); }
.tb-vplay-label { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.tb-vplay-sub { font-size: 11px; color: rgba(255,255,255,0.7); }

/* ── Compact mode (collapses the right pane) ──────── */
:root[data-compact="1"] .tb-vmain { grid-template-columns: 1fr !important; }
:root[data-compact="1"] .tb-vright { display: none !important; }
:root[data-compact="1"] .tb-vpreview img,
:root[data-compact="1"] .tb-vpreview video { max-height: 75vh; }

/* ── Screenshot gallery (shown when there's no video) ──────── */
.tb-vss-gallery { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.tb-vss-thumb { position: relative; padding: 0; border: 2px solid var(--tb-border); border-radius: var(--tb-radius-sm); overflow: hidden; cursor: pointer; background: var(--tb-bg); width: 150px; height: 96px; transition: border-color .12s, transform .12s; }
.tb-vss-thumb:hover { transform: translateY(-1px); }
.tb-vss-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tb-vss-thumb span { position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.72); color: #fff; font-size: 11px; font-weight: 700; line-height: 1; padding: 3px 6px; border-radius: 4px; }
.tb-vss-thumb.active { border-color: var(--tb-accent, #6366F1); }

/* ── Hover thumbnail on scrubber ──────────────────── */
.tb-vhover-thumb { position: fixed; pointer-events: none; z-index: 50; background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-sm); padding: 4px; box-shadow: var(--tb-shadow-md); }
.tb-vhover-thumb img { display: block; max-width: 220px; max-height: 140px; border-radius: 3px; }
.tb-vhover-thumb > div { font-size: 10px; color: var(--tb-text-3); margin-top: 4px; text-align: center; font-family: var(--tb-mono); }

/* ── Help overlay ─────────────────────────────────── */
.tb-vhelp { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
.tb-vhelp-card { background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-md); box-shadow: var(--tb-shadow-md); padding: 24px 28px; max-width: 460px; width: 100%; }
.tb-vhelp-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; color: var(--tb-text); letter-spacing: -0.01em; }
.tb-vhelp-row { display: flex; align-items: center; gap: 12px; padding: 7px 0; font-size: 13px; color: var(--tb-text); border-bottom: 1px solid var(--tb-border-sub); }
.tb-vhelp-row:last-of-type { border-bottom: none; }
.tb-vhelp-row span { color: var(--tb-text-2); flex: 1; }
.tb-vhelp-row kbd { background: var(--tb-bg-2); border: 1px solid var(--tb-border); border-radius: var(--tb-radius-sm); padding: 2px 8px; font-family: var(--tb-mono); font-size: 11px; color: var(--tb-text); margin-right: 4px; }
.tb-vhelp-close { margin-top: 14px; width: 100%; padding: 9px; background: var(--tb-accent); color: #fff; border: none; border-radius: var(--tb-radius-sm); cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; transition: background .15s; }
.tb-vhelp-close:hover { background: var(--tb-accent-2); }

/* ── Marker types ─────────────────────────────────── */
.tb-rs-marker-frust { background: var(--tb-warning); }
.tb-rs-marker-mark { background: #ea580c; border-radius: 2px; transform: translate(-50%, -50%) rotate(45deg); }
.tb-rs-marker-net-err { background: var(--tb-error); }
`;

// ── Inlined renderer (runs on the recipient's machine, file:// origin) ──
// Defensive: no module imports, no fetch (data is embedded), no eval, no
// external resources. Keep it small — it's bytes the user pays for.

const REPLAY_RUNTIME = `(function(){
  var data;
  try { data = JSON.parse(document.getElementById("tb-data").textContent); }
  catch (e) { document.body.innerHTML = "<p style=padding:20px;color:#ef4444>Failed to parse embedded session data.</p>"; return; }

  // ── Theme toggle (auto → light → dark → auto) ─────────
  // Persists per-file in localStorage. Without a saved pref the CSS uses
  // prefers-color-scheme to auto-pick. Recipients can override either way.
  var THEME_KEY = "tracebug_replay_theme";
  function loadPref() {
    try { var v = localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" || v === "auto" ? v : "auto"; } catch (e) { return "auto"; }
  }
  function savePref(v) { try { localStorage.setItem(THEME_KEY, v); } catch (e) {} }
  function applyTheme(pref) {
    if (pref === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", pref);
  }
  function themeIcon(pref) { return pref === "auto" ? "🌗" : pref === "dark" ? "🌙" : "☀"; }
  var currentPref = loadPref();
  applyTheme(currentPref);
  var toggleBtn = document.getElementById("theme-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = themeIcon(currentPref);
    toggleBtn.addEventListener("click", function(){
      currentPref = currentPref === "auto" ? "light" : currentPref === "light" ? "dark" : "auto";
      savePref(currentPref);
      applyTheme(currentPref);
      toggleBtn.textContent = themeIcon(currentPref);
    });
  }

  // ── Header ─────────────────────────────────────────────
  var titleEl = document.getElementById("title");
  var sevEl = document.getElementById("sev");
  var metaEl = document.getElementById("meta");
  var SEV = { critical: "🔴 Critical", high: "🟠 High", medium: "🟡 Medium", low: "🟢 Low" };
  titleEl.textContent = data.meta.title || "Untitled bug";
  if (data.meta.severity) {
    sevEl.textContent = SEV[data.meta.severity] || data.meta.severity;
    sevEl.className = "tb-vh-sev tb-sev-" + data.meta.severity;
    sevEl.title = "Severity (auto) — classified from session signals, not a tester's triage call";
  }
  // Tester-assigned priority — their triage call, distinct from auto severity.
  if (data.meta.priority) {
    var prioEl = document.getElementById("prio");
    if (prioEl) {
      prioEl.textContent = "🚩 " + data.meta.priority + " priority";
      prioEl.style.display = "";
    }
  }

  // Issue actions — precomputed at export time, no issue-builder code here.
  // Token-free only: a prefilled github.com URL (explicit navigation, nothing
  // uploaded) and clipboard markdown that pastes into any tracker.
  if (data.github && data.github.issueUrl) {
    var ghOpen = document.getElementById("gh-open");
    if (ghOpen) { ghOpen.href = data.github.issueUrl; ghOpen.style.display = ""; }
  }
  if (data.github && data.github.markdown) {
    var ghCopy = document.getElementById("gh-copy");
    if (ghCopy) {
      ghCopy.style.display = "";
      ghCopy.addEventListener("click", function () {
        var done = function (ok) {
          ghCopy.textContent = ok ? "✓ Copied" : "Copy failed";
          setTimeout(function () { ghCopy.textContent = "Copy issue markdown"; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(data.github.markdown).then(function () { done(true); }, function () { done(false); });
        } else {
          // file:// in older browsers — execCommand fallback.
          try {
            var ta = document.createElement("textarea");
            ta.value = data.github.markdown;
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand("copy");
            document.body.removeChild(ta);
            done(ok);
          } catch (e) { done(false); }
        }
      });
    }
  }
  var metaParts = [
    "Session " + (data.meta.sessionId || "").slice(0, 8),
    "Page " + (data.meta.page || ""),
    "Generated " + new Date(data.meta.generatedAt || Date.now()).toLocaleString(),
    data.meta.environment || ""
  ].filter(Boolean);
  metaEl.textContent = metaParts.join(" · ");

  // ── Summary box + Description (below the replay, mirrors the ticket modal) ──
  document.getElementById("summary").textContent = data.meta.summary || "(no summary)";
  if (data.description) {
    document.getElementById("desc").textContent = data.description;
    document.getElementById("desc-wrap").style.display = "";
  }

  // ── Tabs: populate counts + content ─────────────────────
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function setBadge(id, n) {
    var el = document.getElementById(id);
    if (el) el.textContent = n > 0 ? String(n) : "";
    // Mirror the count as a small notification dot on the parent tab — like
    // Jam's green-dot indicator. Removed when the user clicks the tab.
    var btn = el && el.closest && el.closest("[data-tab]");
    if (btn) {
      var existing = btn.querySelector(".tb-vtab-dot");
      if (n > 0 && !existing) {
        var dot = document.createElement("span");
        dot.className = "tb-vtab-dot";
        btn.appendChild(dot);
      } else if (n === 0 && existing) {
        existing.remove();
      }
    }
  }

  // Info tab — render kv pairs from data.info (server-side built)
  var info = data.info || [];
  var infoHtml = info.length === 0
    ? '<div class="tb-vempty-tab">No info captured</div>'
    : info.map(function(r){
        // r.i is a trusted inline Lucide <svg> built by html-replay.ts (never
        // user data), so it is injected raw — escaping it would print the markup.
        var iconHtml = r.i ? '<span class="tb-vkv-icon">' + r.i + '</span>' : '';
        return '<div class="tb-vkv"><span class="tb-vkv-k">' + esc(r.k) + '</span><span class="tb-vkv-v">' + iconHtml + esc(r.v) + '</span></div>';
      }).join("");
  document.getElementById("panel-info").innerHTML = infoHtml;

  // Console tab — unified event feed (Jam-style): console logs + page
  // navigations + network errors + user activity + video markers, all
  // chronologically ordered with category-filter pills.
  var feedConsole = (data.consoleLogs && data.consoleLogs.length) ? data.consoleLogs :
    (data.consoleErrors || []).map(function(e){ return { level: "error", message: e.message, stack: e.stack, timestamp: e.timestamp }; });
  var feedEvents = data.events || [];
  var feedVideo = data.video || null;
  var feedStartTs = (feedEvents[0] && feedEvents[0].timestamp) || (feedConsole[0] && feedConsole[0].timestamp) || 0;

  var FEED_ICONS = {
    videoStart: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    videoStop:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
    click:      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9l5 12 1.8-5.2L21 14z"/><path d="M7.2 2.2l1 2.4M2.2 7.2l2.4 1M4.6 4.6l1.8 1.8"/></svg>',
    nav:        '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"/></svg>',
    netErr:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16M4 12l4-4M4 12l4 4"/></svg>',
    console:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
  };
  function fmtFeedTime(ms){
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  var feed = [];
  for (var i = 0; i < feedEvents.length; i++) {
    var t = feedEvents[i];
    var elapsedMs = t.timestamp - feedStartTs;
    if (t.type === "route_change") {
      feed.push({ ts: t.timestamp, el: elapsedMs, cat: "navigation", lvl: "", icon: FEED_ICONS.nav,
        msg: "Navigated to " + (String(t.description).split("→").pop() || t.description).trim() });
    } else if (t.type === "api_request" && t.isError) {
      feed.push({ ts: t.timestamp, el: elapsedMs, cat: "network-error", lvl: "", icon: FEED_ICONS.netErr, msg: t.description });
    } else if (t.type === "click") {
      feed.push({ ts: t.timestamp, el: elapsedMs, cat: "user-activity", lvl: "", icon: FEED_ICONS.click,
        msg: String(t.description).replace(/^click /, "Clicked ") });
    } else if (t.type === "input" || t.type === "select_change" || t.type === "form_submit") {
      feed.push({ ts: t.timestamp, el: elapsedMs, cat: "user-activity", lvl: "", icon: FEED_ICONS.click, msg: t.description });
    }
  }
  for (var j = 0; j < feedConsole.length; j++) {
    var l = feedConsole[j];
    feed.push({ ts: l.timestamp, el: l.timestamp - feedStartTs, cat: "console", lvl: l.level || "log",
      icon: FEED_ICONS.console, msg: l.message || "", stack: l.stack });
  }
  if (feedVideo) {
    var vs = feedVideo.startedAt;
    feed.push({ ts: vs, el: vs - feedStartTs, cat: "video", lvl: "", icon: FEED_ICONS.videoStart, msg: "Video started" });
    var ve = vs + (feedVideo.durationMs || 0);
    feed.push({ ts: ve, el: ve - feedStartTs, cat: "video", lvl: "", icon: FEED_ICONS.videoStop, msg: "Video stopped" });
  }
  feed.sort(function(a, b){ return a.ts - b.ts; });
  setBadge("badge-console", feed.length);

  if (feed.length === 0) {
    document.getElementById("panel-console").innerHTML = '<div class="tb-vempty-tab">No events recorded</div>';
  } else {
    var counts = { all: feed.length, console: 0, navigation: 0, "network-error": 0, "user-activity": 0, video: 0 };
    for (var k = 0; k < feed.length; k++) counts[feed[k].cat] = (counts[feed[k].cat] || 0) + 1;
    function feedPill(key, label){
      var c = counts[key] || 0;
      if (key !== "all" && c === 0) return "";
      return '<button class="tb-vfeed-pill' + (key === "all" ? " tb-vfeed-pill-active" : "") + '" data-cat="' + key + '">' +
        label + (c > 0 ? '<span class="tb-vfeed-pill-n">' + c + '</span>' : '') + '</button>';
    }
    var feedRows = feed.map(function(e){
      var hay = ((e.msg || "") + " " + (e.stack || "")).toLowerCase();
      var isErr = e.cat === "network-error" || e.lvl === "error";
      var stackStr = e.stack ? String(e.stack).split("\\n").slice(0, 5).join("\\n") : "";
      var stackHtml = stackStr ? '<pre class="tb-vfeed-stack">' + esc(stackStr) + '</pre>' : '';
      return '<div class="tb-vfeed-row tb-vfeed-' + e.cat + (isErr ? ' tb-vfeed-err' : '') + (e.lvl ? ' tb-vfeed-lvl-' + e.lvl : '') +
        '" data-cat="' + e.cat + '" data-lvl="' + (e.lvl || "") + '" data-err="' + (isErr ? "1" : "0") + '" data-ts="' + e.ts + '" data-search="' + esc(hay) + '" tabindex="0" role="button" title="Click to seek video to this moment">' +
        '<span class="tb-vfeed-time">' + fmtFeedTime(e.el) + '</span>' +
        '<span class="tb-vfeed-icon">' + e.icon + '</span>' +
        '<span class="tb-vfeed-body"><span class="tb-vfeed-msg">' + esc(e.msg) + '</span>' + stackHtml + '</span>' +
        '</div>';
    }).join("");
    document.getElementById("panel-console").innerHTML =
      '<div class="tb-vfeed-toolbar">' +
        '<input id="vcon-search" type="search" placeholder="Filter" class="tb-vnet-search" />' +
        '<label class="tb-vnet-err-toggle"><input id="vcon-errors-only" type="checkbox" /> Errors only</label>' +
      '</div>' +
      '<div class="tb-vfeed-pills">' +
        feedPill("all", "All") + feedPill("console", "Console") +
        feedPill("navigation", "Page navigations") + feedPill("network-error", "Network errors") +
        feedPill("user-activity", "User activity") + feedPill("video", "Video") +
      '</div>' +
      '<div class="tb-vfeed-list">' + feedRows + '</div>';
    (function(){
      var panel = document.getElementById("panel-console");
      var searchEl = panel.querySelector("#vcon-search");
      var errOnly = panel.querySelector("#vcon-errors-only");
      var pills = panel.querySelectorAll(".tb-vfeed-pill");
      var activeCat = "all";
      function apply(){
        var q = (searchEl.value || "").trim().toLowerCase();
        var eo = errOnly.checked;
        panel.querySelectorAll(".tb-vfeed-row").forEach(function(row){
          var cat = row.getAttribute("data-cat") || "";
          var hay = row.getAttribute("data-search") || "";
          var isErr = row.getAttribute("data-err") === "1";
          var catMatch = activeCat === "all" || cat === activeCat;
          var qMatch = q.length === 0 || hay.indexOf(q) !== -1;
          var errMatch = !eo || isErr;
          row.style.display = (catMatch && qMatch && errMatch) ? "" : "none";
        });
      }
      searchEl.addEventListener("input", apply);
      errOnly.addEventListener("change", apply);
      pills.forEach(function(p){
        p.addEventListener("click", function(){
          activeCat = p.getAttribute("data-cat") || "all";
          pills.forEach(function(q){ q.classList.toggle("tb-vfeed-pill-active", q === p); });
          apply();
        });
      });
      // Click a Console row to seek the video / scrubber to that moment.
      panel.addEventListener("click", function(e){
        var row = e.target.closest ? e.target.closest(".tb-vfeed-row") : null;
        if (!row) return;
        var ts = Number(row.getAttribute("data-ts"));
        if (!isFinite(ts)) return;
        try { if (typeof scrubberSeek === "function") scrubberSeek(ts); } catch(_e){}
      });
    })();
  }

  // Network tab — DevTools-style table with type pills, filter search,
  // Errors-only toggle, waterfall column.
  var netReqs = data.networkRequests || data.networkErrors || [];
  setBadge("badge-network", netReqs.length);

  function classifyRequest(url) {
    if (!url) return "other";
    if (url.indexOf("ws://") === 0 || url.indexOf("wss://") === 0) return "ws";
    var pathname = url;
    try { pathname = new URL(url, "http://_").pathname; } catch (e) {}
    var ext = (pathname.toLowerCase().split(".").pop() || "").split("?")[0];
    if (["js","mjs","cjs"].indexOf(ext) !== -1) return "js";
    if (["css","scss"].indexOf(ext) !== -1) return "css";
    if (["png","jpg","jpeg","gif","webp","avif","ico","svg","mp4","webm","mp3","wav","ogg","m4a","mov"].indexOf(ext) !== -1) return "media";
    if (["woff","woff2","ttf","otf","eot"].indexOf(ext) !== -1) return "font";
    if (["html","htm"].indexOf(ext) !== -1) return "doc";
    return "fetch";
  }
  function extractDomain(url) {
    try { return new URL(url, "http://_").hostname; } catch (e) {}
    return "";
  }
  function shortName(url) {
    try {
      var u = new URL(url, "http://_");
      var parts = u.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || u.hostname;
    } catch (e) {
      return (url.split("/").filter(Boolean).pop() || url);
    }
  }

  if (netReqs.length === 0) {
    document.getElementById("panel-network").innerHTML = '<div class="tb-vempty-tab">No network requests recorded</div>';
  } else {
    var minTs = Math.min.apply(null, netReqs.map(function(r){ return r.timestamp; }));
    var maxEnd = Math.max.apply(null, netReqs.map(function(r){ return r.timestamp + (r.duration || 0); }));
    var span = Math.max(1, maxEnd - minTs);

    var typeCounts = { all: netReqs.length, fetch:0, ws:0, js:0, css:0, media:0, font:0, doc:0, other:0 };
    var classified = netReqs.map(function(n){
      var t = classifyRequest(n.url);
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      return { n: n, t: t, dom: extractDomain(n.url), name: shortName(n.url) };
    });

    function pillHtml(key, label) {
      var c = typeCounts[key] || 0;
      if (key !== "all" && c === 0) return "";
      return '<button class="tb-vnet-pill' + (key === "all" ? " tb-vnet-pill-active" : "") + '" data-type="' + key + '">' + label + (c > 0 ? '<span class="tb-vnet-pill-n">' + c + '</span>' : '') + '</button>';
    }

    var rowsHtml = classified.map(function(item, i){
      var n = item.n;
      var statusTxt = n.status === 0 ? "ERR" : String(n.status);
      var statusCls =
        n.status === 0 ? "serr" :
        n.status >= 500 ? "s5" :
        n.status >= 400 ? "s4" :
        n.status >= 300 ? "s3" :
        n.status >= 200 ? "s2" : "";
      var isErr = n.status === 0 || n.status >= 400;
      var leftPct = ((n.timestamp - minTs) / span) * 100;
      var widthPct = Math.max(0.5, ((n.duration || 0) / span) * 100);
      var hay = (n.method + ' ' + n.url + ' ' + statusTxt + ' ' + item.dom).toLowerCase();
      var snippet = n.response ? '<div class="tb-vnet-snippet"><pre>' + esc(n.response.slice(0, 240)) + '</pre></div>' : '';
      return '<details class="tb-vnet-row" data-type="' + item.t + '" data-err="' + (isErr ? '1' : '0') + '" data-search="' + esc(hay) + '">' +
        '<summary class="tb-vnet-summary">' +
          '<span class="tb-vnet-c-n">' + (i + 1) + '</span>' +
          '<span class="tb-vnet-c-name" title="' + esc(n.url) + '">' + esc(item.name) + '</span>' +
          '<span class="tb-vnet-c-meth">' + esc(n.method) + '</span>' +
          '<span class="tb-vnet-c-stat ' + statusCls + '">' + statusTxt + '</span>' +
          '<span class="tb-vnet-c-dom" title="' + esc(item.dom) + '">' + esc(item.dom) + '</span>' +
          '<span class="tb-vnet-c-type">' + item.t + '</span>' +
          '<span class="tb-vnet-c-time">' + (n.duration || 0) + ' ms</span>' +
          '<span class="tb-vnet-c-wf"><span class="tb-vnet-wf-bar ' + statusCls + '" style="left:' + leftPct.toFixed(1) + '%;width:' + widthPct.toFixed(1) + '%"></span></span>' +
        '</summary>' +
        '<div class="tb-vnet-detail"><div class="tb-vnet-detail-url">' + esc(n.url) + '</div>' + snippet + '</div>' +
      '</details>';
    }).join("");

    document.getElementById("panel-network").innerHTML =
      '<div class="tb-vnet-toolbar">' +
        '<input id="vnet-search" type="search" placeholder="Filter requests" class="tb-vnet-search" />' +
        '<label class="tb-vnet-err-toggle"><input id="vnet-errors-only" type="checkbox" /> Errors only</label>' +
      '</div>' +
      '<div class="tb-vnet-pills">' +
        pillHtml("all","All") + pillHtml("fetch","Fetch/XHR") + pillHtml("ws","WS") +
        pillHtml("js","JS") + pillHtml("css","CSS") + pillHtml("media","Media") +
        pillHtml("font","Font") + pillHtml("doc","Doc") + pillHtml("other","Other") +
      '</div>' +
      '<div class="tb-vnet-table">' +
        '<div class="tb-vnet-row tb-vnet-head">' +
          '<span class="tb-vnet-c-n">#</span>' +
          '<span class="tb-vnet-c-name">Name</span>' +
          '<span class="tb-vnet-c-meth">Method</span>' +
          '<span class="tb-vnet-c-stat">Status</span>' +
          '<span class="tb-vnet-c-dom">Domain</span>' +
          '<span class="tb-vnet-c-type">Type</span>' +
          '<span class="tb-vnet-c-time">Time</span>' +
          '<span class="tb-vnet-c-wf">Waterfall</span>' +
        '</div>' +
        rowsHtml +
      '</div>';

    // Wire filter interactivity
    (function(){
      var panel = document.getElementById("panel-network");
      var searchEl = panel.querySelector("#vnet-search");
      var errOnlyEl = panel.querySelector("#vnet-errors-only");
      var pills = panel.querySelectorAll(".tb-vnet-pill");
      var activeType = "all";
      function apply() {
        var q = (searchEl.value || "").trim().toLowerCase();
        var errOnly = errOnlyEl.checked;
        panel.querySelectorAll(".tb-vnet-row").forEach(function(row){
          if (row.classList.contains("tb-vnet-head")) return;
          var t = row.getAttribute("data-type") || "";
          var isErr = row.getAttribute("data-err") === "1";
          var hay = row.getAttribute("data-search") || "";
          var typeMatch = activeType === "all" || t === activeType;
          var errMatch = !errOnly || isErr;
          var searchMatch = q.length === 0 || hay.indexOf(q) !== -1;
          row.style.display = (typeMatch && errMatch && searchMatch) ? "" : "none";
        });
      }
      searchEl.addEventListener("input", apply);
      errOnlyEl.addEventListener("change", apply);
      pills.forEach(function(p){
        p.addEventListener("click", function(){
          activeType = p.getAttribute("data-type") || "all";
          pills.forEach(function(q){ q.classList.toggle("tb-vnet-pill-active", q === p); });
          apply();
        });
      });
    })();
  }

  // Actions tab — prefer action chips, fall back to plain text steps
  var chips = data.actionChips || [];
  var actions = data.actions || [];
  setBadge("badge-actions", chips.length || actions.length);
  var actionsHtml;
  if (chips.length > 0) {
    actionsHtml = '<div class="tb-vchips">' + chips.map(function(c){
      var elHtml = "";
      if (c.element) {
        var attrsHtml = (c.element.attrs || []).map(function(a){
          if (a.value === "") return '<span class="tb-vel-an">' + esc(a.name) + '</span>';
          return '<span class="tb-vel-an">' + esc(a.name) + '</span>=<span class="tb-vel-av">"' + esc(a.value) + '"</span>';
        }).join(" ");
        var more = c.element.moreCount > 0 ? ' <span class="tb-vel-more">+' + c.element.moreCount + ' more</span>' : "";
        elHtml = '<span class="tb-vel">&lt;<span class="tb-vel-tag">' + esc(c.element.tag) + '</span>' + (attrsHtml ? ' ' : '') + attrsHtml + more + '&gt;</span>';
      }
      // Human-readable target + noun ("Checkout" button)
      var tgt = "";
      if (c.target) {
        var nounHtml = c.nounLabel ? ' <span class="tb-vchip-tgt-noun">' + esc(c.nounLabel) + '</span>' : '';
        tgt = '<span class="tb-vchip-tgt"><span class="tb-vchip-tgt-name">“' + esc(c.target) + '”</span>' + nounHtml + '</span>';
      }
      // Frustration glyph prefix
      var frust = "";
      if (c.frustration) {
        var sym = c.frustration === "rage" ? "⚡" : c.frustration === "dead" ? "✕" : "↩";
        var title = c.frustration === "rage" ? "Rage click — multiple rapid clicks on the same element" :
                    c.frustration === "dead" ? "Dead click — no visible response within 1.5s" :
                    "Form abandoned — filled but never submitted";
        frust = '<span class="tb-vchip-frust tb-vchip-frust-' + esc(c.frustration) + '" title="' + esc(title) + '">' + sym + '</span>';
      }
      var det = c.detail ? '<span class="tb-vchip-det' + (c.isError ? ' tb-vchip-det-err' : '') + '">' + esc(c.detail) + '</span>' : "";
      var errCls = (c.isError || c.frustration) ? ' tb-vchip-err' : '';
      return '<div class="tb-vchip' + errCls + '">' +
        frust +
        '<span class="tb-vchip-verb tb-vchip-verb-' + esc(c.kind || 'click') + '">' + esc(c.verb || '') + '</span>' +
        '<span class="tb-vchip-body">' + tgt + elHtml + det + '</span>' +
      '</div>';
    }).join("");
    actionsHtml += '</div>';
  } else if (actions.length === 0) {
    actionsHtml = '<div class="tb-vempty-tab">No actions recorded</div>';
  } else {
    actionsHtml = '<ol class="tb-vsteps">' + actions.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join("") + '</ol>';
  }
  document.getElementById("panel-actions").innerHTML = actionsHtml;

  // AI tab — show deterministic root-cause hint, with a note about LLM
  var rc = data.rootCauseHint;
  var aiHtml = '';
  if (rc && rc.hint) {
    aiHtml += '<div class="tb-vai-card"><div class="tb-vai-head">Pattern-based hint <span class="tb-vai-conf tb-vai-conf-' + esc(rc.confidence || "low") + '">' + esc(rc.confidence || "low") + '</span></div><div class="tb-vai-body">' + esc(rc.hint) + '</div></div>';
  }
  aiHtml += '<div class="tb-vai-card tb-vai-empty"><div class="tb-vai-head">LLM analysis</div><div class="tb-vai-body">Open this report in the TraceBug UI to run LLM-based root-cause analysis (BYO API key).</div></div>';

  // Agent hand-off — this file IS the MCP artifact, so hand the recipient the
  // exact prompt to paste into Claude Code / Cursor. Filename is recovered
  // from the file:// URL at view time so the prompt survives renames.
  var mcpFile = "";
  try { mcpFile = decodeURIComponent(location.pathname.split(/[\\\\/]/).pop() || ""); } catch (e) {}
  if (!mcpFile || !/\\.html?$/i.test(mcpFile)) mcpFile = "<this .html export>";
  var mcpPrompt = 'This is a TraceBug bug report export: ' + mcpFile + '\\n\\n' +
    '1. Call get_bug_report("' + mcpFile + '") to load the report overview and its investigation guide.\\n' +
    '2. Follow the investigation guide to gather the relevant data (console errors, network failures, repro steps, screenshots).\\n' +
    '3. Cross-reference the findings with this codebase to identify the root cause and propose a fix.\\n\\n' +
    'If the tracebug MCP server is not connected yet, register it first (point --dir at the folder containing this file):\\n' +
    'claude mcp add tracebug -- npx -y tracebug mcp --dir <reports-folder>';
  aiHtml += '<div class="tb-vai-card"><div class="tb-vai-head">Debug with a coding agent (MCP)</div>' +
    '<div class="tb-vai-body">Paste this prompt into Claude Code or Cursor opened in the codebase that owns the bug. The agent reads this file through TraceBug\\u2019s local MCP server \\u2014 nothing is uploaded.</div>' +
    '<pre class="tb-vai-prompt">' + esc(mcpPrompt) + '</pre>' +
    '<button class="tb-vai-copy" id="mcp-prompt-copy" type="button">Copy prompt</button></div>';
  document.getElementById("panel-ai").innerHTML = aiHtml;

  var mcpCopyBtn = document.getElementById("mcp-prompt-copy");
  if (mcpCopyBtn) mcpCopyBtn.addEventListener("click", function(){
    var done = function(){ mcpCopyBtn.textContent = "Copied \\u2713"; setTimeout(function(){ mcpCopyBtn.textContent = "Copy prompt"; }, 1100); };
    // file:// pages don't always get the async clipboard API — textarea fallback.
    var fallbackCopy = function(){
      var ta = document.createElement("textarea");
      ta.value = mcpPrompt;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(mcpPrompt).then(done, fallbackCopy);
    } else fallbackCopy();
  });

  setBadge("badge-events", (data.events || []).length);

  // Tab switching
  var tabButtons = document.querySelectorAll(".tb-vtab");
  var tabPanels = document.querySelectorAll(".tb-vpanel");
  tabButtons.forEach(function(btn){
    btn.addEventListener("click", function(){
      var which = btn.getAttribute("data-tab");
      tabButtons.forEach(function(b){ b.classList.toggle("tb-vtab-active", b === btn); });
      tabPanels.forEach(function(p){
        var active = p.getAttribute("data-panel") === which;
        p.classList.toggle("tb-vpanel-active", active);
        if (active) p.removeAttribute("hidden"); else p.setAttribute("hidden", "");
      });
      // Clear the "new content" dot once the user opens the tab.
      var d = btn.querySelector(".tb-vtab-dot");
      if (d) d.remove();
    });
  });

  // ── Preview wiring ─────────────────────────────────────
  var img = document.getElementById("ssimg");
  var video = document.getElementById("video");
  var ssMeta = document.getElementById("ssmeta");
  var emptyMsg = document.getElementById("empty");
  var screenshots = (data.screenshots || []).slice().sort(function(a, b){ return a.timestamp - b.timestamp; });

  // ── Preview wiring + lazy video load ──────────────────
  // For files with embedded video we DON'T decode the data URL upfront —
  // a 50MB recording would force the browser to parse base64 + allocate a
  // huge blob just to show a Play button. Instead we paint a poster image
  // (latest screenshot, or first if no error) and a "Play recording"
  // overlay. The first overlay click decodes base64 -> Blob ->
  // ObjectURL, sets it as the video src, then plays. Opens-in-100ms feel
  // even for fat recordings.
  var playOverlay = document.getElementById("play-overlay");
  var playOverlaySub = document.getElementById("play-overlay-sub");
  var hasVideo = !!(data.video && data.video.dataUrl);
  var hasReplayer = !!(window.rrweb && window.rrweb.Replayer);
  var hasRrwebData = !!((data.rrwebEvents && data.rrwebEvents.length) || data.rrwebEventsGz);
  var hasRrweb = hasRrwebData && hasReplayer;

  // Inflate the gzip+base64 DOM stream using the browser's native
  // DecompressionStream (no bundled library, works offline from file://).
  // Returns the parsed rrweb event array. Rejects on any unsupported/failed
  // path so the caller can fall back to the screenshot preview.
  function inflateRrweb(b64) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof DecompressionStream === "undefined" || typeof Response === "undefined")
          return reject(new Error("DecompressionStream unavailable"));
        var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        new Response(stream).text().then(function (txt) {
          resolve(JSON.parse(txt));
        }).catch(reject);
      } catch (e) { reject(e); }
    });
  }

  function formatBytes(b) {
    if (!b) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  // Mount rrweb's core Replayer over the DOM event stream, wrapped in our own
  // small control bar (play/pause + seek). The Replayer renders the recorded DOM
  // into an iframe at its original size, so we scale it to fit the stage width.
  // On any failure we fall back to the screenshot/video preview.
  function mountRrwebPlayer() {
    try {
      var R = window.rrweb && window.rrweb.Replayer;
      var wrap = document.getElementById("rrweb-wrap");
      var stage = document.getElementById("rrweb-root");
      var pv = document.getElementById("preview-wrap");
      if (!R || !wrap || !stage) throw new Error("replayer/stage missing");
      if (pv) pv.style.display = "none";
      wrap.style.display = "block";
      // rrweb owns the timeline now — hide the legacy event scrubber that only
      // drove the video/screenshot preview.
      var oldScrub = document.getElementById("scrubber");
      if (oldScrub) oldScrub.style.display = "none";

      var evs = data.rrwebEvents, recW = 1280, recH = 800;
      for (var i = 0; i < evs.length; i++) {
        var ev = evs[i];
        if (ev && ev.type === 4 && ev.data && ev.data.width) { recW = ev.data.width; recH = ev.data.height || recH; break; }
      }

      var replayer = new R(evs, { root: stage, mouseTail: false, skipInactive: true, speed: 1 });
      var meta = replayer.getMetaData();
      var total = Math.max(1, meta.totalTime || (meta.endTime - meta.startTime) || 1);

      // Scale the recorded viewport down to the stage width.
      function fit() {
        var wr = stage.querySelector(".replayer-wrapper");
        if (!wr) return;
        var avail = stage.clientWidth || wrap.clientWidth || 720;
        var scale = Math.min(1, avail / recW);
        wr.style.transform = "scale(" + scale + ")";
        stage.style.height = Math.round(recH * scale) + "px";
      }
      fit();
      window.addEventListener("resize", fit);

      var ctrl = document.getElementById("rrweb-ctrl");
      var playBtn = document.getElementById("rr-play");
      var seek = document.getElementById("rr-seek");
      var timeEl = document.getElementById("rr-time");
      if (ctrl) ctrl.style.display = "flex";
      var playing = false;
      function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
      function setBtn(p) { playing = p; if (playBtn) playBtn.textContent = p ? "❚❚" : "▶"; }
      function loop() {
        if (!playing) return;
        var t = replayer.getCurrentTime();
        if (t >= total) { if (seek) seek.value = "1000"; if (timeEl) timeEl.textContent = fmt(total) + " / " + fmt(total); setBtn(false); return; }
        if (seek) seek.value = String(Math.round(t / total * 1000));
        if (timeEl) timeEl.textContent = fmt(t) + " / " + fmt(total);
        requestAnimationFrame(loop);
      }
      if (timeEl) timeEl.textContent = "0:00 / " + fmt(total);
      if (playBtn) playBtn.addEventListener("click", function () {
        if (playing) { replayer.pause(); setBtn(false); }
        else { var off = seek ? (seek.value / 1000) * total : 0; if (off >= total) off = 0; replayer.play(off); setBtn(true); loop(); }
      });
      if (seek) seek.addEventListener("input", function () {
        var t = (seek.value / 1000) * total;
        replayer.pause(); setBtn(false); replayer.play(t); replayer.pause();
        if (timeEl) timeEl.textContent = fmt(t) + " / " + fmt(total);
      });
      // Bridge so Console/Network/Events "click to seek" can drive the replay.
      window.__rrwebSeekAbs = function (absTs) {
        var off = absTs - meta.startTime; if (off < 0) off = 0; if (off > total) off = total;
        replayer.pause(); replayer.play(off); replayer.pause(); setBtn(false);
        if (seek) seek.value = String(Math.round(off / total * 1000));
        if (timeEl) timeEl.textContent = fmt(off) + " / " + fmt(total);
      };
    } catch (e) {
      hasRrweb = false;
      var w2 = document.getElementById("rrweb-wrap"); if (w2) w2.style.display = "none";
      var p2 = document.getElementById("preview-wrap"); if (p2) p2.style.display = "";
      if (screenshots.length > 0) { img.src = screenshots[0].dataUrl; img.style.display = "block"; buildScreenshotGallery(); }
      if (typeof console !== "undefined") console.warn("[TraceBug] rrweb replay mount failed:", e && e.message);
    }
  }

  if (hasRrweb && data.rrwebEvents && data.rrwebEvents.length) {
    mountRrwebPlayer();
  } else if (hasRrweb && data.rrwebEventsGz) {
    // Compressed stream: inflate off the raw base64, then mount. Cheap
    // (~10ms for a few hundred KB) so no spinner; on failure fall back.
    inflateRrweb(data.rrwebEventsGz).then(function (evs) {
      data.rrwebEvents = evs;
      mountRrwebPlayer();
    }).catch(function (e) {
      hasRrweb = false;
      if (typeof console !== "undefined") console.warn("[TraceBug] replay decompress failed:", e && e.message);
      var pv = document.getElementById("preview-wrap"); if (pv) pv.style.display = "";
      if (screenshots.length > 0) { img.src = screenshots[0].dataUrl; img.style.display = "block"; buildScreenshotGallery(); }
      else { img.style.display = "none"; emptyMsg.style.display = "block"; }
    });
  } else if (hasVideo) {
    // Show poster (best screenshot) + Play overlay; defer base64 decode.
    if (screenshots.length > 0) {
      img.src = screenshots[0].dataUrl;
      img.style.display = "block";
    } else {
      img.style.display = "none";
    }
    if (playOverlay) {
      playOverlay.style.display = "flex";
      if (playOverlaySub) {
        var sz = formatBytes(data.video.sizeBytes || 0);
        var dur = data.video.durationMs ? fmtElapsed(data.video.durationMs) : "";
        playOverlaySub.textContent = [dur, sz].filter(Boolean).join(" · ");
      }
    }
  } else if (screenshots.length > 0) {
    img.src = screenshots[0].dataUrl;
    img.style.display = "block";
    ssMeta.textContent = screenshots[0].filename + " · " + new Date(screenshots[0].timestamp).toLocaleTimeString();
  } else {
    img.style.display = "none";
    emptyMsg.style.display = "block";
  }

  // Screenshot gallery — with no video/DOM-replay, show ALL screenshots as
  // clickable thumbnails and hide the scrubber. For a screenshots-only report
  // the timeline just spans the minutes between captures, which isn't useful;
  // the user wants to browse the shots. Clicking a thumb shows it full-size.
  // Extracted to a function (idempotent via data-built) so the rrweb-failure
  // fallback paths can also render the full gallery, not just screenshots[0].
  function buildScreenshotGallery() {
    var ssGallery = document.getElementById("ss-gallery");
    if (!ssGallery || screenshots.length === 0) return;
    if (ssGallery.getAttribute("data-built") === "1") return;
    ssGallery.setAttribute("data-built", "1");
    for (var gi = 0; gi < screenshots.length; gi++) {
      (function (s, idx) {
        var t = document.createElement("button");
        t.className = "tb-vss-thumb" + (idx === 0 ? " active" : "");
        t.type = "button";
        var im = document.createElement("img");
        im.src = s.dataUrl; im.alt = "Screenshot " + (idx + 1);
        var num = document.createElement("span");
        num.textContent = String(idx + 1);
        t.appendChild(im); t.appendChild(num);
        t.addEventListener("click", function () {
          img.src = s.dataUrl;
          img.style.display = "block";
          if (ssMeta) ssMeta.textContent = s.filename + " · " + new Date(s.timestamp).toLocaleTimeString();
          var all = ssGallery.querySelectorAll(".tb-vss-thumb");
          for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
          t.classList.add("active");
        });
        ssGallery.appendChild(t);
      })(screenshots[gi], gi);
    }
    ssGallery.style.display = "flex";
    var scEl = document.getElementById("scrubber");
    if (scEl) scEl.style.display = "none";
  }
  if (!hasVideo && !hasRrweb) buildScreenshotGallery();

  // Decode the base64 data URL into a Blob URL only when the user actually
  // wants to play. Keeps initial load fast.
  var videoLoaded = false;
  function loadVideo(autoplay) {
    if (videoLoaded || !hasVideo) { if (autoplay) try { video.play(); } catch(e) {} return; }
    videoLoaded = true;
    try {
      // Non-greedy capture for the mime because the mime can itself contain
      // commas (e.g. "video/webm;codecs=vp9,opus") — a no-semicolon group
      // would truncate the prefix before the base64 marker and decode garbage.
      var match = /^data:(.*?);base64,(.*)$/.exec(data.video.dataUrl);
      if (!match) { video.src = data.video.dataUrl; }
      else {
        var mime = (match[1].split(";")[0]) || "video/webm";
        var bin = atob(match[2]);
        var len = bin.length;
        var bytes = new Uint8Array(len);
        for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        var blob = new Blob([bytes], { type: mime });
        video.src = URL.createObjectURL(blob);
      }
      video.style.display = "block";
      img.style.display = "none";
      if (playOverlay) playOverlay.style.display = "none";
      if (autoplay) try { video.play(); } catch(e) {}
    } catch (err) {
      // Fallback to direct data URL if decoding fails.
      video.src = data.video.dataUrl;
      video.style.display = "block";
      img.style.display = "none";
      if (playOverlay) playOverlay.style.display = "none";
      if (autoplay) try { video.play(); } catch(e) {}
    }
    // A fresh load always plays from 0:00 — snap the scrubber to the video's
    // start so the readout and handle move WITH playback instead of visibly
    // walking backward from wherever the event-init seek left them.
    if (data.video && data.video.startedAt) {
      current = Math.max(startedAt, Math.min(endedAt, data.video.startedAt));
      renderHandle();
    }
  }
  if (playOverlay) {
    playOverlay.addEventListener("click", function(){ loadVideo(true); });
  }

  // ── Auto-pause-at-error + console-sync (driven by video.timeupdate) ───
  // While the video plays, push the scrubber along, highlight the
  // matching Console row, and pause the video the first time we cross
  // each error marker. _visitedErrors is reset on manual seek so the
  // user can re-trigger the pause by scrubbing backward.
  var _visitedErrors = {};
  if (video) {
    video.addEventListener("timeupdate", function(){
      if (!data.video || !data.video.startedAt) return;
      if (dragging) return; // user owns the handle mid-drag — don't fight them
      var ts = data.video.startedAt + video.currentTime * 1000;
      var prevTs = current;
      current = Math.max(startedAt, Math.min(endedAt, ts));
      renderHandle();
      _syncConsoleFeed(current);
      // Auto-pause ONCE at the first unvisited error crossed, then mark every
      // error visited. Pausing at each of N clustered markers made playback
      // feel broken ("the video keeps stopping"); one stop tells the story,
      // and "Jump to error" re-arms it for deliberate error-hopping.
      var em = data.events || [];
      for (var i = 0; i < em.length; i++) {
        if (!em[i].isError) continue;
        var et = em[i].timestamp;
        if (_visitedErrors[et]) continue;
        if (et >= prevTs && et <= current + 250) {
          for (var k = 0; k < em.length; k++) { if (em[k].isError) _visitedErrors[em[k].timestamp] = true; }
          try { video.pause(); } catch(_e){}
          _flashErrorToast(em[i]);
          break;
        }
      }
    });
  }

  function _syncConsoleFeed(ts) {
    var panel = document.getElementById("panel-console");
    if (!panel) return;
    var rows = panel.querySelectorAll(".tb-vfeed-row");
    if (rows.length === 0) return;
    var activeRow = null, activeTs = -Infinity;
    for (var i = 0; i < rows.length; i++) {
      var rt = Number(rows[i].getAttribute("data-ts"));
      if (!isFinite(rt)) continue;
      if (rt <= ts && rt > activeTs) { activeTs = rt; activeRow = rows[i]; }
    }
    if (!activeRow) return;
    if (panel._lastActiveTs === activeTs) return;
    panel._lastActiveTs = activeTs;
    for (var j = 0; j < rows.length; j++) {
      rows[j].classList.toggle("tb-vfeed-row-active", rows[j] === activeRow);
    }
    var panelRect = panel.getBoundingClientRect();
    var rowRect = activeRow.getBoundingClientRect();
    if (rowRect.top < panelRect.top || rowRect.bottom > panelRect.bottom) {
      activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function _flashErrorToast(marker) {
    var existing = document.querySelector(".tb-rs-err-toast");
    if (existing) existing.remove();
    var t = document.createElement("div");
    t.className = "tb-rs-err-toast";
    t.textContent = "⏸ Paused at error — " + String(marker.description || "").slice(0, 60);
    var host = document.getElementById("scrubber");
    if (host) host.appendChild(t);
    setTimeout(function(){ try { t.remove(); } catch(_e){} }, 2500);
  }

  function findClosest(list, ts) {
    if (!list || !list.length) return null;
    var best = list[0], bestD = Math.abs(best.timestamp - ts);
    for (var i = 1; i < list.length; i++) {
      var d = Math.abs(list[i].timestamp - ts);
      if (d < bestD) { best = list[i]; bestD = d; }
    }
    return best;
  }

  // ── Events list ────────────────────────────────────────
  var events = (data.events || []).slice().sort(function(a, b){ return a.timestamp - b.timestamp; });
  var eventsEl = document.getElementById("events");
  events.forEach(function(ev, i) {
    var li = document.createElement("li");
    if (ev.isError) li.className = "tb-ve-error";
    li.innerHTML = '<span class="tb-ve-time">' + (ev.elapsed || "") + '</span>' + escapeHtml(ev.description || ev.type);
    li.dataset.ts = String(ev.timestamp);
    li.addEventListener("click", function(){ scrubberSeek(ev.timestamp); });
    eventsEl.appendChild(li);
  });

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Scrubber (slim, self-contained) ───────────────────
  // Span computed from events + screenshots + video so single-event
  // sessions still get a meaningful timeline (otherwise span = 1ms and
  // the readout shows "00:00 / 00:00").
  var allTs = [];
  for (var ti = 0; ti < events.length; ti++) allTs.push(events[ti].timestamp);
  for (var si = 0; si < screenshots.length; si++) allTs.push(screenshots[si].timestamp);
  if (data.video && data.video.startedAt) {
    allTs.push(data.video.startedAt);
    if (data.video.durationMs) allTs.push(data.video.startedAt + data.video.durationMs);
  }
  var minTs = allTs.length ? Math.min.apply(null, allTs) : 0;
  var maxTs = allTs.length ? Math.max.apply(null, allTs) : minTs + 1;
  var startedAt = minTs;
  var endedAt = Math.max(maxTs, startedAt + 1000);
  var span = Math.max(1000, endedAt - startedAt); // floor 1s so scrubber is usable
  var errorMarkers = events.filter(function(e){ return e.isError; });
  var scrubberHost = document.getElementById("scrubber");
  // Download button surfaces only when a video is embedded — gives the
  // viewer a one-click way to grab the .webm to drag into Jira / GitHub /
  // Slack etc. instead of having to right-click → Save Video As.
  var dlBtnHtml = hasVideo
    ? '<button class="tb-rs-dl" id="tb-rs-dl" type="button" title="Download recording">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M5 13l7 7 7-7M4 21h16"/></svg>' +
        '<span>Download</span>' +
      '</button>'
    : '';
  scrubberHost.innerHTML = '<div class="tb-rs-root" tabindex="0"><div class="tb-rs-header"><span class="tb-rs-label">Replay</span><span class="tb-rs-time" id="tb-rs-time">00:00 / ' + fmtElapsed(span) + '</span><button class="tb-rs-jump" id="tb-rs-jump" type="button" style="display:' + (errorMarkers.length ? "inline-block" : "none") + '">Jump to error</button>' + dlBtnHtml + '</div><div class="tb-rs-track" id="tb-rs-track"><div class="tb-rs-fill" id="tb-rs-fill"></div><div class="tb-rs-markers" id="tb-rs-markers"></div><div class="tb-rs-handle" id="tb-rs-handle"></div></div></div>';

  if (hasVideo) {
    var dlBtn = document.getElementById("tb-rs-dl");
    if (dlBtn) dlBtn.addEventListener("click", function(){
      // Decode the base64 dataUrl into a blob (avoids the gigantic
      // chrome://about-blank "Save target as" prompt browsers throw at
      // multi-MB data: URLs).
      try {
        var m = /^data:(.*?);base64,(.*)$/.exec(data.video.dataUrl || "");
        var mime = (m && m[1].split(";")[0]) || "video/webm";
        var bytes;
        if (m) {
          var bin = atob(m[2]);
          bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }
        var blob = bytes ? new Blob([bytes], { type: mime }) : null;
        var url = blob ? URL.createObjectURL(blob) : data.video.dataUrl;
        var ext = mime.indexOf("mp4") >= 0 ? "mp4" : "webm";
        var sid = (data.meta && data.meta.sessionId ? data.meta.sessionId.slice(0, 8) : "session");
        var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        var a = document.createElement("a");
        a.href = url;
        a.download = "tracebug-recording-" + sid + "-" + stamp + "." + ext;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (blob) setTimeout(function(){ try { URL.revokeObjectURL(url); } catch(_e){} }, 30000);
      } catch (err) {
        // Fallback: open the dataUrl in a new tab; user can Save As.
        try { window.open(data.video.dataUrl, "_blank"); } catch(_e){}
      }
    });
  }

  var trackEl = document.getElementById("tb-rs-track");
  var fillEl = document.getElementById("tb-rs-fill");
  var handleEl = document.getElementById("tb-rs-handle");
  var timeEl = document.getElementById("tb-rs-time");
  var markersEl = document.getElementById("tb-rs-markers");
  var jumpEl = document.getElementById("tb-rs-jump");

  var COLORS = { click: "#6366F1", input: "#6366F1", select_change: "#6366F1", form_submit: "#6366F1", route_change: "#3B82F6", api_request: "#F59E0B" };
  // Cap markers
  var MAX = 200;
  var visible = events.length <= MAX ? events : sample(events, MAX);
  visible.forEach(function(ev) {
    var m = document.createElement("div");
    m.className = ev.isError ? "tb-rs-marker tb-rs-error" : "tb-rs-marker";
    var leftPct = ((ev.timestamp - startedAt) / span) * 100;
    m.style.left = Math.max(0, Math.min(100, leftPct)) + "%";
    m.style.background = ev.isError ? "#ef4444" : (COLORS[ev.type] || "#6366F1");
    m.dataset.ts = String(ev.timestamp);
    if (ev.isError) m.textContent = "!";
    m.title = (ev.elapsed || "") + " · " + (ev.description || ev.type);
    markersEl.appendChild(m);
  });

  var current = startedAt;
  function renderHandle() {
    var p = ((current - startedAt) / span) * 100;
    var clamped = Math.max(0, Math.min(100, p));
    handleEl.style.left = clamped + "%";
    fillEl.style.width = clamped + "%";
    timeEl.textContent = fmtElapsed(current - startedAt) + " / " + fmtElapsed(span);
  }
  function scrubberSeek(ts) {
    // When the DOM replay is active, clicks on Console/Network/Events rows (and
    // the legacy scrubber) drive the rrweb replay to that moment.
    if (hasRrweb && window.__rrwebSeekAbs) { try { window.__rrwebSeekAbs(ts); } catch (_e) {} }
    current = Math.max(startedAt, Math.min(endedAt, ts));
    renderHandle();
    // NOTE: deliberately does NOT re-arm the error auto-pause. Every drag /
    // track click used to reset it, so any mouse interaction mid-playback
    // caused a surprise pause moments later. Re-arming now happens only on
    // the explicit "Jump to error" and restart (0) actions.
    // Swap screenshot preview
    var ss = findClosest(screenshots, current);
    if (ss && img.style.display !== "none") {
      img.src = ss.dataUrl;
      ssMeta.textContent = ss.filename + " · " + new Date(ss.timestamp).toLocaleTimeString();
    }
    // Sync video
    if (data.video && data.video.startedAt) {
      try { video.currentTime = Math.max(0, (current - data.video.startedAt) / 1000); } catch(e) {}
    }
    // Sync Console feed highlight.
    try { _syncConsoleFeed(current); } catch(_e){}
  }

  // Init
  if (events.length) scrubberSeek(events[0].timestamp);

  // Drag
  var dragging = false;
  function tsFromEvent(clientX) {
    var rect = trackEl.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return startedAt + ratio * span;
  }
  trackEl.addEventListener("pointerdown", function(e) {
    dragging = true;
    trackEl.setPointerCapture(e.pointerId);
    scrubberSeek(tsFromEvent(e.clientX));
  });
  trackEl.addEventListener("pointermove", function(e) {
    if (dragging) scrubberSeek(tsFromEvent(e.clientX));
  });
  trackEl.addEventListener("pointerup", function(e) {
    dragging = false;
    try { trackEl.releasePointerCapture(e.pointerId); } catch(err) {}
  });
  markersEl.addEventListener("click", function(e) {
    var t = e.target;
    if (!t || !t.classList.contains("tb-rs-marker")) return;
    var ts = Number(t.dataset.ts);
    if (!isNaN(ts)) scrubberSeek(ts);
  });
  if (jumpEl) jumpEl.addEventListener("click", function() {
    if (errorMarkers.length) { _visitedErrors = {}; scrubberSeek(errorMarkers[0].timestamp); }
  });
  // ── Keyboard shortcuts ──────────────────────────────
  // Bound at document level, but skipped when the user is typing in an
  // input/textarea/contenteditable so we don't hijack search boxes.
  function isTyping(t) {
    if (!t) return false;
    var tag = (t.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || t.isContentEditable;
  }
  function jumpEvent(dir) {
    var idx = -1;
    for (var i = 0; i < events.length; i++) {
      if (events[i].timestamp >= current) { idx = i; break; }
    }
    var nextIdx;
    if (dir === 1) nextIdx = Math.min(events.length - 1, (idx < 0 ? events.length - 1 : idx + 1));
    else nextIdx = Math.max(0, (idx > 0 ? idx : events.length) - 1);
    if (events[nextIdx]) scrubberSeek(events[nextIdx].timestamp);
  }
  function jumpToFirstError() {
    if (errorMarkers.length) { _visitedErrors = {}; scrubberSeek(errorMarkers[0].timestamp); }
  }
  function togglePlayback() {
    if (!hasVideo) {
      // No video — fall back to "advance one event"
      jumpEvent(1);
      return;
    }
    if (!videoLoaded) { loadVideo(true); return; }
    if (video.paused) try { video.play(); } catch(e) {} else video.pause();
  }
  function nudgeVideo(deltaSec) {
    if (!hasVideo) return;
    if (!videoLoaded) loadVideo(false);
    try { video.currentTime = Math.max(0, video.currentTime + deltaSec); } catch(e) {}
  }
  function setTab(which) {
    var btn = document.querySelector('[data-tab="' + which + '"]');
    if (btn) btn.click();
  }
  var TAB_KEYS = ["info","console","network","actions","ai","events"];

  document.addEventListener("keydown", function(e) {
    if (isTyping(e.target)) return;
    // Help overlay open: only Escape / ? closes it.
    var helpOpen = document.getElementById("help-overlay").style.display !== "none";
    if (helpOpen) {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); toggleHelp(false); }
      return;
    }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); togglePlayback(); return; }
    // Arrows now seek ±5s on the video (matches the modal). J/K/L stays
    // for power users. Without a video, arrows still step events.
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (hasVideo) { nudgeVideo(-5); } else { jumpEvent(-1); }
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (hasVideo) { nudgeVideo(5); } else { jumpEvent(1); }
      return;
    }
    if (e.key === "0") { e.preventDefault(); _visitedErrors = {}; scrubberSeek(startedAt); return; }
    if (e.key === "j" || e.key === "J") { e.preventDefault(); nudgeVideo(-5); return; }
    if (e.key === "l" || e.key === "L") { e.preventDefault(); nudgeVideo(5); return; }
    if (e.key === "k" || e.key === "K") { e.preventDefault(); togglePlayback(); return; }
    if (e.key === "e" || e.key === "E") { e.preventDefault(); jumpToFirstError(); return; }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleCompact(); return; }
    if (e.key === "t" || e.key === "T") { e.preventDefault(); cycleTheme(); return; }
    if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); toggleHelp(); return; }
    // Number keys 1-8 switch tabs
    var n = parseInt(e.key, 10);
    if (!isNaN(n) && n >= 1 && n <= TAB_KEYS.length) {
      e.preventDefault();
      setTab(TAB_KEYS[n - 1]);
      return;
    }
  });

  // ── Compact mode toggle ─────────────────────────────
  function toggleCompact() {
    var cur = document.documentElement.getAttribute("data-compact") === "1";
    if (cur) document.documentElement.removeAttribute("data-compact");
    else document.documentElement.setAttribute("data-compact", "1");
  }
  var compactBtn = document.getElementById("compact-toggle");
  if (compactBtn) compactBtn.addEventListener("click", toggleCompact);

  // ── Cycle theme via T key + button ──────────────────
  function cycleTheme() {
    var current = loadPref();
    var next = current === "auto" ? "light" : current === "light" ? "dark" : "auto";
    savePref(next);
    applyTheme(next);
    if (toggleBtn) toggleBtn.textContent = themeIcon(next);
  }

  // ── Help overlay ────────────────────────────────────
  function toggleHelp(force) {
    var el = document.getElementById("help-overlay");
    var open = force !== undefined ? force : el.style.display === "none";
    el.style.display = open ? "flex" : "none";
  }
  var helpBtn = document.getElementById("help-toggle");
  var helpClose = document.getElementById("help-close");
  if (helpBtn) helpBtn.addEventListener("click", function(){ toggleHelp(true); });
  if (helpClose) helpClose.addEventListener("click", function(){ toggleHelp(false); });
  // Click-out closes
  var helpEl = document.getElementById("help-overlay");
  if (helpEl) helpEl.addEventListener("click", function(e){
    if (e.target === helpEl) toggleHelp(false);
  });

  // ── Hover thumbnail on scrubber ─────────────────────
  var hoverEl = document.getElementById("hover-thumb");
  var hoverImg = document.getElementById("hover-thumb-img");
  var hoverTime = document.getElementById("hover-thumb-time");
  if (trackEl && hoverEl && screenshots.length > 0) {
    trackEl.addEventListener("mousemove", function(e) {
      var rect = trackEl.getBoundingClientRect();
      var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      var ts = startedAt + ratio * span;
      var ss = findClosest(screenshots, ts);
      if (!ss) { hoverEl.style.display = "none"; return; }
      hoverImg.src = ss.dataUrl;
      hoverTime.textContent = fmtElapsed(ts - startedAt);
      hoverEl.style.display = "block";
      // Position above the track, centered on the cursor.
      var thumbRect = hoverEl.getBoundingClientRect();
      var left = e.clientX - thumbRect.width / 2;
      left = Math.max(8, Math.min(window.innerWidth - thumbRect.width - 8, left));
      hoverEl.style.left = left + "px";
      hoverEl.style.top = (rect.top - thumbRect.height - 8) + "px";
    });
    trackEl.addEventListener("mouseleave", function() {
      hoverEl.style.display = "none";
    });
  }

  function sample(arr, n) {
    if (arr.length <= n) return arr;
    var out = [], step = arr.length / n;
    for (var i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  function fmtElapsed(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(total / 60).toString().padStart(2, "0");
    var s = (total % 60).toString().padStart(2, "0");
    return m + ":" + s;
  }
})();`;
