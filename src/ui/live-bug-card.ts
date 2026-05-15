// ── Live Bug Card ─────────────────────────────────────────────────────────
// Slide-in overlay shown the moment a JS error fires. Surfaces the error
// message, the failing line of code (parsed from the stack, fetched from
// the same origin only), the last user action, and one-click capture.
//
// Replaces the older "error detected" toast with something that's actually
// legible. Within 200ms of the error, the dev sees:
//   - error type + message
//   - file:line and a 5-line source preview (when same-origin source fetches succeed)
//   - the user's most recent click/input
//   - [Capture] [Open in editor] [Dismiss]
//
// All fetches are same-origin only. No external network calls. CSP-friendly.

const CARD_ID = "tracebug-live-bug-card";
const STYLE_ID = "tracebug-live-bug-card-styles";
const _sourceCache = new Map<string, string[]>(); // file URL → split lines
const _sourceFetchInflight = new Map<string, Promise<string[] | null>>();

export interface LiveBugCardOptions {
  /** Error message (e.g. "TypeError: Cannot read 'status'"). */
  message: string;
  /** Optional stack trace string. */
  stack?: string;
  /** Optional last user action description, e.g. 'clicked "Update" button'. */
  lastAction?: string;
  /** Click handler for the primary "Capture" button. */
  onCapture: () => void;
  /** Optional dismiss callback (separate from internal close). */
  onDismiss?: () => void;
  /**
   * Whether to expose an "Open in editor" button that uses the `vscode://`
   * URL scheme to jump into the source. Default: false (off — the browser
   * "Open external app?" prompt is annoying without explicit opt-in).
   */
  enableEditorJump?: boolean;
}

let _currentRoot: HTMLElement | null = null;

/**
 * Show the Live Bug Card. If a card is already visible, replace it (latest
 * error wins — throttling lives upstream).
 */
export function showLiveBugCard(root: HTMLElement, options: LiveBugCardOptions): void {
  _injectStyles();
  hideLiveBugCard();

  const overlay = document.createElement("div");
  overlay.id = CARD_ID;
  overlay.dataset.tracebug = "live-bug-card";
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-live", "assertive");

  const parsed = parseTopFrame(options.stack || "");
  const errorTitle = options.message || "Unknown error";
  const truncatedTitle = errorTitle.length > 120 ? errorTitle.slice(0, 117) + "…" : errorTitle;

  // Initial render — source preview placeholder; fills async.
  const sourceBlockId = `tb-lbc-src-${Date.now()}`;
  overlay.innerHTML = `
    <div class="tb-lbc-card">
      <div class="tb-lbc-head">
        <span class="tb-lbc-icon">💥</span>
        <span class="tb-lbc-title">${escapeHtml(truncatedTitle)}</span>
        <button class="tb-lbc-close" data-action="dismiss" aria-label="Dismiss">&times;</button>
      </div>
      ${parsed ? `
        <div class="tb-lbc-loc">at <span class="tb-lbc-file">${escapeHtml(parsed.shortFile)}:${parsed.line}</span></div>
        <div class="tb-lbc-source" id="${sourceBlockId}">
          <span class="tb-lbc-loading">Loading source…</span>
        </div>
      ` : `<div class="tb-lbc-loc tb-lbc-no-source">Stack trace unavailable</div>`}
      ${options.lastAction ? `<div class="tb-lbc-action">Last action: ${escapeHtml(options.lastAction)}</div>` : ""}
      <div class="tb-lbc-buttons">
        <button class="tb-lbc-btn tb-lbc-primary" data-action="capture">📸 Capture Bug</button>
        ${options.enableEditorJump && parsed ? `<button class="tb-lbc-btn tb-lbc-editor" data-action="editor">Open in editor</button>` : ""}
        <button class="tb-lbc-btn tb-lbc-ghost" data-action="dismiss">Dismiss</button>
      </div>
    </div>
  `;

  root.appendChild(overlay);
  _currentRoot = overlay;

  // Wire actions
  overlay.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "capture") {
        try { options.onCapture(); } finally { hideLiveBugCard(); }
      } else if (action === "dismiss") {
        try { options.onDismiss?.(); } finally { hideLiveBugCard(); }
      } else if (action === "editor" && parsed) {
        // VS Code URL scheme — browser will prompt; OK if VS Code isn't installed.
        try { window.location.href = `vscode://file/${parsed.absPath}:${parsed.line}`; } catch {}
      }
    });
  });

  // Auto-dismiss after 12s if untouched.
  const auto = setTimeout(() => hideLiveBugCard(), 12000);
  overlay.addEventListener("mouseenter", () => clearTimeout(auto));

  // Escape key dismisses.
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape" && _currentRoot === overlay) {
      try { options.onDismiss?.(); } finally { hideLiveBugCard(); }
    }
  };
  document.addEventListener("keydown", esc);
  overlay.addEventListener("tracebug:hide", () => document.removeEventListener("keydown", esc));

  // Async source fetch (same-origin only)
  if (parsed) {
    fetchSourceWindow(parsed.fileUrl, parsed.line, parsed.column)
      .then(html => {
        if (_currentRoot !== overlay) return; // card already replaced/dismissed
        const block = overlay.querySelector(`#${sourceBlockId}`);
        if (block) block.innerHTML = html;
      })
      .catch(() => {
        const block = overlay.querySelector(`#${sourceBlockId}`);
        if (block) block.innerHTML = `<span class="tb-lbc-no-source">Source not available (cross-origin or 404)</span>`;
      });
  }
}

/** Hide the card if visible. Safe to call repeatedly. */
export function hideLiveBugCard(): void {
  if (!_currentRoot) return;
  const ev = new CustomEvent("tracebug:hide");
  _currentRoot.dispatchEvent(ev);
  _currentRoot.remove();
  _currentRoot = null;
}

/** True if a card is currently visible. */
export function isLiveBugCardVisible(): boolean {
  return _currentRoot !== null;
}

// ── Stack frame parser ──────────────────────────────────────────────────
// Handles V8 ("at func (file:line:col)") and SpiderMonkey ("func@file:line:col")
// stack frame formats. Returns null if no parseable frame is found.

interface ParsedFrame {
  fileUrl: string;     // full URL (used for fetch)
  shortFile: string;   // last segment for display
  absPath: string;     // local-ish path for vscode:// (best-effort)
  line: number;
  column: number;
}

function parseTopFrame(stack: string): ParsedFrame | null {
  if (!stack) return null;
  const lines = stack.split("\n").map(l => l.trim());
  // Pick the first frame that looks like user code (not the SDK itself).
  for (const line of lines) {
    // V8: "at func (https://app.example.com/foo.js:42:13)" or "at https://.../foo.js:42:13"
    let m = line.match(/at\s+(?:[^()]+\s+)?\(?(https?:\/\/[^):\s]+):(\d+):(\d+)\)?$/);
    if (!m) {
      // SpiderMonkey: "func@https://.../foo.js:42:13"
      m = line.match(/@(https?:\/\/[^):\s]+):(\d+):(\d+)$/);
    }
    if (m) {
      const fileUrl = m[1];
      // Skip TraceBug's own frames so the card points at the user's code.
      if (/tracebug-sdk|tracebug\.|\/tracebug\//i.test(fileUrl)) continue;
      const url = new URL(fileUrl, window.location.origin);
      return {
        fileUrl,
        shortFile: url.pathname.split("/").pop() || url.pathname,
        absPath: url.pathname,
        line: Number(m[2]),
        column: Number(m[3]),
      };
    }
  }
  return null;
}

// ── Same-origin source fetch ───────────────────────────────────────────
// Fetches the source file once per URL, caches the split lines, and renders
// a 5-line window centered on the failing line with that line highlighted.

async function fetchSourceLines(fileUrl: string): Promise<string[] | null> {
  // Cross-origin? Refuse — respects the no-egress pact.
  try {
    const u = new URL(fileUrl, window.location.origin);
    if (u.origin !== window.location.origin) return null;
  } catch { return null; }

  if (_sourceCache.has(fileUrl)) return _sourceCache.get(fileUrl)!;
  if (_sourceFetchInflight.has(fileUrl)) return _sourceFetchInflight.get(fileUrl)!;

  const p = (async () => {
    try {
      const res = await fetch(fileUrl, { credentials: "same-origin", cache: "force-cache" });
      if (!res.ok) return null;
      const text = await res.text();
      const lines = text.split("\n");
      _sourceCache.set(fileUrl, lines);
      return lines;
    } catch {
      return null;
    } finally {
      _sourceFetchInflight.delete(fileUrl);
    }
  })();
  _sourceFetchInflight.set(fileUrl, p);
  return p;
}

async function fetchSourceWindow(fileUrl: string, line: number, _column: number): Promise<string> {
  const lines = await fetchSourceLines(fileUrl);
  if (!lines) {
    return `<span class="tb-lbc-no-source">Source not available (cross-origin or 404)</span>`;
  }

  const target = Math.max(1, Math.min(lines.length, line));
  const from = Math.max(1, target - 2);
  const to = Math.min(lines.length, target + 2);

  const parts: string[] = [];
  for (let i = from; i <= to; i++) {
    const isTarget = i === target;
    const num = String(i).padStart(3, " ");
    const arrow = isTarget ? "→" : " ";
    const cls = isTarget ? "tb-lbc-line tb-lbc-line-hot" : "tb-lbc-line";
    parts.push(`<div class="${cls}"><span class="tb-lbc-arrow">${arrow}</span><span class="tb-lbc-num">${num}</span><span class="tb-lbc-code">${escapeHtml(lines[i - 1] || "")}</span></div>`);
  }
  return parts.join("");
}

// ── Styles ─────────────────────────────────────────────────────────────

function _injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes tb-lbc-in {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    #${CARD_ID} {
      position: fixed !important;
      bottom: 16px !important;
      right: 16px !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      animation: tb-lbc-in 0.18s ease !important;
    }
    #${CARD_ID} .tb-lbc-card {
      box-sizing: border-box !important;
      max-width: 460px !important;
      min-width: 340px !important;
      background: var(--tb-bg-secondary, #1a1a2e) !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
      font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif) !important;
      border: 1px solid var(--tb-error, #ef4444) !important;
      border-left: 4px solid var(--tb-error, #ef4444) !important;
      border-radius: 10px !important;
      padding: 12px 14px !important;
      box-shadow: 0 12px 36px rgba(0,0,0,0.45) !important;
    }
    #${CARD_ID} .tb-lbc-card *, #${CARD_ID} .tb-lbc-card *::before, #${CARD_ID} .tb-lbc-card *::after {
      box-sizing: border-box !important;
    }
    #${CARD_ID} .tb-lbc-head {
      display: flex !important; align-items: flex-start !important; gap: 8px !important;
      margin-bottom: 8px !important;
    }
    #${CARD_ID} .tb-lbc-icon { font-size: 16px !important; line-height: 1.2 !important; flex-shrink: 0 !important; }
    #${CARD_ID} .tb-lbc-title {
      flex: 1 !important; font-size: 13px !important; font-weight: 600 !important;
      color: var(--tb-error, #ef4444) !important; line-height: 1.35 !important; word-break: break-word !important;
    }
    #${CARD_ID} .tb-lbc-close {
      background: none !important; border: none !important; color: var(--tb-text-muted, #888) !important;
      font-size: 20px !important; line-height: 1 !important; cursor: pointer !important;
      padding: 0 4px !important; font-family: inherit !important;
    }
    #${CARD_ID} .tb-lbc-loc {
      font-size: 11px !important; color: var(--tb-text-muted, #888) !important;
      font-family: var(--tb-font-mono, ui-monospace, monospace) !important;
      margin-bottom: 4px !important;
    }
    #${CARD_ID} .tb-lbc-file { color: var(--tb-text-secondary, #aaa) !important; }
    #${CARD_ID} .tb-lbc-no-source { font-style: italic !important; color: var(--tb-text-muted, #666) !important; }
    #${CARD_ID} .tb-lbc-source {
      background: var(--tb-bg-primary, #0f0f1a) !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: 6px !important;
      padding: 8px !important; margin: 6px 0 !important;
      font-family: var(--tb-font-mono, ui-monospace, monospace) !important;
      font-size: 11px !important;
      max-height: 110px !important; overflow: hidden !important;
    }
    #${CARD_ID} .tb-lbc-loading {
      font-style: italic !important; color: var(--tb-text-muted, #666) !important;
    }
    #${CARD_ID} .tb-lbc-line {
      display: flex !important; gap: 8px !important; line-height: 1.45 !important;
      white-space: pre !important; color: var(--tb-text-secondary, #aaa) !important;
    }
    #${CARD_ID} .tb-lbc-line-hot {
      color: var(--tb-text-primary, #fff) !important; font-weight: 600 !important;
      background: rgba(239, 68, 68, 0.12) !important;
      margin: 0 -8px !important; padding: 0 8px !important;
    }
    #${CARD_ID} .tb-lbc-arrow { color: var(--tb-error, #ef4444) !important; width: 10px !important; flex-shrink: 0 !important; }
    #${CARD_ID} .tb-lbc-num { color: var(--tb-text-muted, #555) !important; user-select: none !important; flex-shrink: 0 !important; }
    #${CARD_ID} .tb-lbc-code { color: inherit !important; flex: 1 !important; }
    #${CARD_ID} .tb-lbc-action {
      font-size: 11px !important; color: var(--tb-text-muted, #888) !important;
      margin-bottom: 10px !important;
    }
    #${CARD_ID} .tb-lbc-buttons {
      display: flex !important; gap: 6px !important; flex-wrap: wrap !important;
    }
    #${CARD_ID} .tb-lbc-btn {
      font-family: inherit !important;
      border: 1px solid var(--tb-border, #2a2a3e) !important;
      border-radius: 6px !important;
      padding: 6px 12px !important;
      font-size: 12px !important; font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.12s !important;
    }
    #${CARD_ID} .tb-lbc-primary {
      background: var(--tb-accent, #7B61FF) !important;
      color: #fff !important;
      border-color: transparent !important;
    }
    #${CARD_ID} .tb-lbc-primary:hover { opacity: 0.9 !important; }
    #${CARD_ID} .tb-lbc-editor {
      background: transparent !important;
      color: var(--tb-text-primary, #e0e0e0) !important;
    }
    #${CARD_ID} .tb-lbc-editor:hover { background: var(--tb-btn-hover, #ffffff15) !important; }
    #${CARD_ID} .tb-lbc-ghost {
      background: transparent !important;
      color: var(--tb-text-muted, #888) !important;
    }
    #${CARD_ID} .tb-lbc-ghost:hover { color: var(--tb-text-primary, #e0e0e0) !important; }
  `;
  document.head.appendChild(style);
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
