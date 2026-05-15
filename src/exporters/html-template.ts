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
export function buildReplayHtml(payload: BundlePayload): string {
  const dataJson = JSON.stringify(payload).replace(/<\/script>/gi, "<\\/script>");
  // The renderer below is written defensively — it reads `tb-data` and renders
  // the report + scrubber + screenshot preview. Self-contained, no externals.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TraceBug Replay — ${escapeHtml(payload.meta.title)}</title>
<style>${REPLAY_CSS}</style>
</head>
<body>
<header class="tb-vh">
  <div class="tb-vh-row">
    <span class="tb-vh-logo">🐞</span>
    <span class="tb-vh-title" id="title"></span>
    <span class="tb-vh-sev" id="sev"></span>
    <button class="tb-vh-toggle" id="compact-toggle" title="Toggle compact mode (F)" aria-label="Toggle compact mode">⛶</button>
    <button class="tb-vh-toggle" id="theme-toggle" title="Toggle theme (auto / light / dark)" aria-label="Toggle theme">🌗</button>
    <button class="tb-vh-toggle" id="help-toggle" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button>
  </div>
  <div class="tb-vh-meta" id="meta"></div>
</header>
<main class="tb-vmain">
  <section class="tb-vleft">
    <h2 class="tb-vh2">Replay</h2>
    <div class="tb-vpreview" id="preview-wrap">
      <video id="video" controls playsinline style="display:none"></video>
      <img id="ssimg" alt="Session screenshot" />
      <div id="empty" class="tb-vempty" style="display:none">No screenshots captured.</div>
      <button id="play-overlay" class="tb-vplay-overlay" style="display:none" aria-label="Play recording (Space)">
        <span class="tb-vplay-icon">▶</span>
        <span class="tb-vplay-label">Play recording</span>
        <span class="tb-vplay-sub" id="play-overlay-sub"></span>
      </button>
    </div>
    <div id="scrubber"></div>
    <div class="tb-vss-meta" id="ssmeta"></div>
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
      <button data-tab="notes" class="tb-vtab" role="tab">Notes <span class="tb-vtab-badge" id="badge-notes"></span></button>
      <button data-tab="events" class="tb-vtab" role="tab">Events <span class="tb-vtab-badge" id="badge-events"></span></button>
      <button data-tab="desc" class="tb-vtab" role="tab">Description</button>
    </div>
    <div class="tb-vtabpanels">
      <div data-panel="info" class="tb-vpanel tb-vpanel-active" id="panel-info"></div>
      <div data-panel="console" class="tb-vpanel" id="panel-console" hidden></div>
      <div data-panel="network" class="tb-vpanel" id="panel-network" hidden></div>
      <div data-panel="actions" class="tb-vpanel" id="panel-actions" hidden></div>
      <div data-panel="ai" class="tb-vpanel" id="panel-ai" hidden></div>
      <div data-panel="notes" class="tb-vpanel" id="panel-notes" hidden></div>
      <div data-panel="events" class="tb-vpanel" id="panel-events"><ol class="tb-vevents" id="events"></ol></div>
      <div data-panel="desc" class="tb-vpanel" id="panel-desc" hidden><pre class="tb-vdesc" id="desc"></pre></div>
    </div>
  </section>
</main>
<footer class="tb-vf">
  Generated by <a href="https://github.com/prashantsinghmangat/tracebug-ai" target="_blank" rel="noopener">TraceBug</a> · works offline · no network requests
</footer>
<!-- Help overlay: keyboard shortcut cheat sheet -->
<div id="help-overlay" class="tb-vhelp" style="display:none">
  <div class="tb-vhelp-card">
    <div class="tb-vhelp-title">Keyboard shortcuts</div>
    <div class="tb-vhelp-row"><kbd>Space</kbd><span>Play / pause recording</span></div>
    <div class="tb-vhelp-row"><kbd>←</kbd> <kbd>→</kbd><span>Step previous / next event</span></div>
    <div class="tb-vhelp-row"><kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd><span>Rewind 5s / pause / fast-forward 5s</span></div>
    <div class="tb-vhelp-row"><kbd>E</kbd><span>Jump to first error</span></div>
    <div class="tb-vhelp-row"><kbd>F</kbd><span>Toggle compact mode</span></div>
    <div class="tb-vhelp-row"><kbd>1</kbd>–<kbd>8</kbd><span>Switch tabs</span></div>
    <div class="tb-vhelp-row"><kbd>T</kbd><span>Cycle theme (light / dark / auto)</span></div>
    <div class="tb-vhelp-row"><kbd>?</kbd> <kbd>Esc</kbd><span>Toggle / close this overlay</span></div>
    <button class="tb-vhelp-close" id="help-close" aria-label="Close">Close</button>
  </div>
</div>
<script id="tb-data" type="application/json">${dataJson}</script>
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
  --tb-bg-2: #fafafa;
  --tb-bg-3: #ffffff;
  --tb-text: #09090b;
  --tb-text-2: #52525b;
  --tb-text-3: #a1a1aa;
  --tb-accent: #7c3aed;
  --tb-accent-2: #6d28d9;
  --tb-accent-soft: #7c3aed14;
  --tb-border: #e4e4e7;
  --tb-border-sub: #f4f4f5;
  --tb-border-hover: #d4d4d8;
  --tb-error: #dc2626;
  --tb-error-bg: #fef2f2;
  --tb-warning: #d97706;
  --tb-warning-bg: #fffbeb;
  --tb-success: #059669;
  --tb-success-bg: #ecfdf5;
  --tb-info: #2563eb;
  --tb-info-bg: #eff6ff;
  --tb-code-bg: #f4f4f5;
  --tb-code-text: #27272a;
  --tb-code-tag: #be185d;
  --tb-code-attr-name: #a16207;
  --tb-code-attr-val: #15803d;
  --tb-radius-sm: 6px;
  --tb-radius-md: 10px;
  --tb-shadow-md: 0 4px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04);
  --tb-font: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --tb-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
}
:root[data-theme="dark"], html[data-theme="dark"] body {
  --tb-bg: #0a0a0c;
  --tb-bg-2: #18181b;
  --tb-bg-3: #27272a;
  --tb-text: #fafafa;
  --tb-text-2: #a1a1aa;
  --tb-text-3: #71717a;
  --tb-accent: #8b5cf6;
  --tb-accent-2: #a78bfa;
  --tb-accent-soft: #8b5cf61f;
  --tb-border: #27272a;
  --tb-border-sub: #1f1f23;
  --tb-border-hover: #3f3f46;
  --tb-error: #ef4444;
  --tb-error-bg: #ef44441a;
  --tb-warning: #f59e0b;
  --tb-warning-bg: #f59e0b1a;
  --tb-success: #10b981;
  --tb-success-bg: #10b9811a;
  --tb-info: #3b82f6;
  --tb-info-bg: #3b82f61a;
  --tb-code-bg: #09090b;
  --tb-code-text: #d4d4d8;
  --tb-code-tag: #f472b6;
  --tb-code-attr-name: #fcd34d;
  --tb-code-attr-val: #86efac;
  --tb-shadow-md: 0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25);
}

/* ── Base ─────────────────────────────────────────── */
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--tb-bg); color: var(--tb-text); font-family: var(--tb-font); -webkit-font-smoothing: antialiased; }
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
.tb-vh-meta { font-size: 11px; color: var(--tb-text-3); margin-top: 6px; max-width: 1400px; margin-left: auto; margin-right: auto; font-weight: 500; }
.tb-vh-toggle { background: transparent; border: 1px solid var(--tb-border); color: var(--tb-text-2); cursor: pointer; font-size: 14px; width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; transition: all .15s; }
.tb-vh-toggle:hover { background: var(--tb-bg-3); border-color: var(--tb-border-hover); color: var(--tb-text); }

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
.tb-vkv-icon { font-size: 13px; line-height: 1; flex-shrink: 0; }
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
  }
  var metaParts = [
    "Session " + (data.meta.sessionId || "").slice(0, 8),
    "Page " + (data.meta.page || ""),
    "Generated " + new Date(data.meta.generatedAt || Date.now()).toLocaleString(),
    data.meta.environment || ""
  ].filter(Boolean);
  metaEl.textContent = metaParts.join(" · ");

  // ── Summary box + Description tab ──────────────────────
  document.getElementById("summary").textContent = data.meta.summary || "(no summary)";
  document.getElementById("desc").textContent = data.description || "(no description)";

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
        var iconHtml = r.i ? '<span class="tb-vkv-icon">' + esc(r.i) + '</span>' : '';
        return '<div class="tb-vkv"><span class="tb-vkv-k">' + esc(r.k) + '</span><span class="tb-vkv-v">' + iconHtml + esc(r.v) + '</span></div>';
      }).join("");
  document.getElementById("panel-info").innerHTML = infoHtml;

  // Console tab — full DevTools-like log list with level filter
  var consoleLogs = data.consoleLogs || [];
  // Backward compat: older bundles only have consoleErrors. Promote them to
  // the level-aware shape so the rendering pipeline doesn't need two paths.
  if (consoleLogs.length === 0) {
    consoleLogs = (data.consoleErrors || []).map(function(e){
      return { level: "error", message: e.message, stack: e.stack, timestamp: e.timestamp };
    });
  }
  setBadge("badge-console", consoleLogs.length);
  if (consoleLogs.length === 0) {
    document.getElementById("panel-console").innerHTML = '<div class="tb-vempty-tab">No console output recorded</div>';
  } else {
    var conRows = consoleLogs.map(function(e){
      var stackStr = e.stack ? e.stack.split("\\n").slice(0, 5).join("\\n") : "";
      var hay = ((e.message || "") + " " + stackStr + " " + (e.level || "")).toLowerCase();
      var stackHtml = stackStr ? '<pre class="tb-vlog-stack">' + esc(stackStr) + '</pre>' : '';
      var lvl = e.level || "log";
      return '<div class="tb-vlog tb-vlog-' + esc(lvl) + '" data-con-row data-level="' + esc(lvl) + '" data-search="' + esc(hay) + '">' +
        '<div class="tb-vlog-head">' +
          '<span class="tb-vlog-lvl tb-vlog-lvl-' + esc(lvl) + '">' + esc(lvl) + '</span>' +
          '<span class="tb-vlog-msg">' + esc(e.message || "") + '</span>' +
        '</div>' +
        stackHtml +
        '<div class="tb-vlog-ts">' + new Date(e.timestamp).toLocaleTimeString() + '</div>' +
      '</div>';
    }).join("");
    document.getElementById("panel-console").innerHTML =
      '<div class="tb-vcon-toolbar">' +
        '<input id="vcon-search" type="search" placeholder="Filter messages" class="tb-vnet-search" />' +
        '<label class="tb-vnet-err-toggle"><input id="vcon-errors-only" type="checkbox" /> Errors only</label>' +
        '<span class="tb-vcon-count">' + consoleLogs.length + '</span>' +
      '</div>' +
      conRows;
    (function(){
      var panel = document.getElementById("panel-console");
      var searchEl = panel.querySelector("#vcon-search");
      var errOnly = panel.querySelector("#vcon-errors-only");
      function apply(){
        var q = (searchEl.value || "").trim().toLowerCase();
        var eo = errOnly.checked;
        panel.querySelectorAll("[data-con-row]").forEach(function(row){
          var hay = row.getAttribute("data-search") || "";
          var lvl = row.getAttribute("data-level") || "";
          var qMatch = q.length === 0 || hay.indexOf(q) !== -1;
          var lvlMatch = !eo || lvl === "error";
          row.style.display = (qMatch && lvlMatch) ? "" : "none";
        });
      }
      searchEl.addEventListener("input", apply);
      errOnly.addEventListener("change", apply);
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
  document.getElementById("panel-ai").innerHTML = aiHtml;

  // Notes tab
  var notes = data.annotations || [];
  setBadge("badge-notes", notes.length);
  var notesHtml = notes.length === 0
    ? '<div class="tb-vempty-tab">No tester notes</div>'
    : notes.map(function(a){
        var exp = a.expected ? '<div class="tb-vnote-line"><strong>Expected:</strong> ' + esc(a.expected) + '</div>' : '';
        var act = a.actual ? '<div class="tb-vnote-line"><strong>Actual:</strong> ' + esc(a.actual) + '</div>' : '';
        return '<div class="tb-vnote tb-vnote-' + esc(a.severity || "info") + '"><div class="tb-vnote-sev">' + esc(a.severity || "info") + '</div><div class="tb-vnote-text">' + esc(a.text || "") + '</div>' + exp + act + '</div>';
      }).join("");
  document.getElementById("panel-notes").innerHTML = notesHtml;

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

  function formatBytes(b) {
    if (!b) return "";
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
  }

  if (hasVideo) {
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
    ssMeta.textContent = screenshots[0].filename + " · " + new Date(screenshots[0].timestamp).toLocaleTimeString();
  } else {
    img.style.display = "none";
    emptyMsg.style.display = "block";
  }

  // Decode the base64 data URL into a Blob URL only when the user actually
  // wants to play. Keeps initial load fast.
  var videoLoaded = false;
  function loadVideo(autoplay) {
    if (videoLoaded || !hasVideo) { if (autoplay) try { video.play(); } catch(e) {} return; }
    videoLoaded = true;
    try {
      var match = /^data:([^;]+);base64,(.*)$/.exec(data.video.dataUrl);
      if (!match) { video.src = data.video.dataUrl; }
      else {
        var mime = match[1];
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
  }
  if (playOverlay) {
    playOverlay.addEventListener("click", function(){ loadVideo(true); });
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
  scrubberHost.innerHTML = '<div class="tb-rs-root" tabindex="0"><div class="tb-rs-header"><span class="tb-rs-label">Replay</span><span class="tb-rs-time" id="tb-rs-time">00:00 / ' + fmtElapsed(span) + '</span><button class="tb-rs-jump" id="tb-rs-jump" type="button" style="display:' + (errorMarkers.length ? "inline-block" : "none") + '">Jump to error</button></div><div class="tb-rs-track" id="tb-rs-track"><div class="tb-rs-fill" id="tb-rs-fill"></div><div class="tb-rs-markers" id="tb-rs-markers"></div><div class="tb-rs-handle" id="tb-rs-handle"></div></div></div>';

  var trackEl = document.getElementById("tb-rs-track");
  var fillEl = document.getElementById("tb-rs-fill");
  var handleEl = document.getElementById("tb-rs-handle");
  var timeEl = document.getElementById("tb-rs-time");
  var markersEl = document.getElementById("tb-rs-markers");
  var jumpEl = document.getElementById("tb-rs-jump");

  var COLORS = { click: "#7B61FF", input: "#7B61FF", select_change: "#7B61FF", form_submit: "#7B61FF", route_change: "#22d3ee", api_request: "#facc15" };
  // Cap markers
  var MAX = 200;
  var visible = events.length <= MAX ? events : sample(events, MAX);
  visible.forEach(function(ev) {
    var m = document.createElement("div");
    m.className = ev.isError ? "tb-rs-marker tb-rs-error" : "tb-rs-marker";
    var leftPct = ((ev.timestamp - startedAt) / span) * 100;
    m.style.left = Math.max(0, Math.min(100, leftPct)) + "%";
    m.style.background = ev.isError ? "#ef4444" : (COLORS[ev.type] || "#7B61FF");
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
    current = Math.max(startedAt, Math.min(endedAt, ts));
    renderHandle();
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
    if (errorMarkers.length) scrubberSeek(errorMarkers[0].timestamp);
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
    if (errorMarkers.length) scrubberSeek(errorMarkers[0].timestamp);
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
  var TAB_KEYS = ["info","console","network","actions","ai","notes","events","desc"];

  document.addEventListener("keydown", function(e) {
    if (isTyping(e.target)) return;
    // Help overlay open: only Escape / ? closes it.
    var helpOpen = document.getElementById("help-overlay").style.display !== "none";
    if (helpOpen) {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); toggleHelp(false); }
      return;
    }
    if (e.key === " " || e.code === "Space") { e.preventDefault(); togglePlayback(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); jumpEvent(-1); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); jumpEvent(1); return; }
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
