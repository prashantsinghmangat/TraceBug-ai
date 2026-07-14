// ── Compact Toolbar ───────────────────────────────────────────────────────
// Minimal vertical rail on the right edge of the screen.
// Replaces the old 48px floating bug button.
// Primary actions as small icons, settings in a pop-out card.

import { deactivateElementAnnotateMode } from "./element-annotate";
import { deactivateDrawMode } from "./draw-mode";
import { captureScreenshot, getScreenshots } from "./screenshot";
import { captureRegionScreenshot } from "./region-screenshot";
import { isPremium, FREE_LIMITS } from "./plan";
import { showUpgradeModal } from "./ui/upgrade-modal";
import { getAllSessions, deleteSession, getActiveSessionId, getActiveCaptureMode, setActiveCaptureMode, clearActiveSessionId } from "./storage";
import { showQuickBugCapture, isQuickBugOpen, refreshQuickBugCapture } from "./ui/quick-bug";
// issues-panel imports were removed when the Scan button left the floating bar.
// Scan stays reachable via TraceBug.scanPage() API for plugins / shortcuts.
import { matchesShortcut } from "./ui/helpers";
import { startVideoRecording, stopVideoRecording, isVideoRecording, isVideoSupported, getCaptureCount } from "./video-recorder";
import { showRecordingHUD, hideRecordingHUD } from "./ui/recording-hud";

const TOOLBAR_ID = "tracebug-compact-toolbar";
const SETTINGS_ID = "tracebug-settings-card";
const DRAG_POS_KEY = "tracebug_toolbar_pos";

export type ToolbarPosition = "right" | "left" | "bottom-right" | "bottom-left";

let _onSessionStart: (() => void) | null = null;
let _onSessionEnd: (() => void) | null = null;
let _onNewCapture: (() => void) | null = null;
let _panelEl: HTMLElement | null = null;
const _panelOpen = false;
let _toolbar: HTMLElement | null = null;
let _position: ToolbarPosition = "right";
let _isMobile = false;
const _fabExpanded = false;

// ── Wiring from SDK ───────────────────────────────────────────────────────

export function setToolbarRecordingState(_isRecording: boolean, _onToggle: () => void): void {
  // Recording state now lives on the SDK; the toolbar only mirrors it via
  // updateToolbarRecordingState(). Kept for API compatibility with dashboard.ts.
}

/**
 * Wire the SDK's session-lifecycle hooks. Called once at SDK init so the
 * Record button on the toolbar can arm a TraceBug session (events, env,
 * screenshots) when video recording starts and finalize it when video stops.
 * Without this, video recording and session capture would be independent —
 * which is what caused page reloads to look like "new sessions" (the video
 * survived but no session was ever active).
 */
export function setSessionLifecycleHandlers(
  onStart: () => void,
  onEnd: () => void
): void {
  _onSessionStart = onStart;
  _onSessionEnd = onEnd;
}

/** Called by the SDK so every screenshot/capture button starts a fresh session. */
export function setNewCaptureHandler(fn: () => void): void {
  _onNewCapture = fn;
}

export function updateToolbarRecordingState(isRecording: boolean): void {
  const dot = document.getElementById("tracebug-toolbar-rec-dot");
  if (dot) {
    dot.style.background = isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)";
    dot.style.animation = isRecording ? "bt-pulse 2s infinite" : "none";
  }
}

export function setRenderPanel(_fn: (panel: HTMLElement) => void): void {
  // The floating panel was removed; nothing renders into it anymore.
  // Kept for API compatibility with dashboard.ts.
}

// ── Mount ─────────────────────────────────────────────────────────────────

export function mountCompactToolbar(
  root: HTMLElement,
  panel: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void,
  renderAnnotationList: (panel: HTMLElement) => void,
  position: ToolbarPosition = "right",
  shortcuts?: { annotate?: string; draw?: string; screenshot?: string }
): () => void {
  _panelEl = panel;
  _position = position;
  _isMobile = window.innerWidth < 768;

  const toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.dataset.tracebug = "compact-toolbar";
  _toolbar = toolbar;

  // Apply position-dependent styles
  _applyToolbarPosition(toolbar, position);

  // Drag handle support (returns a teardown for its document-level listeners)
  const dragCleanup = _initDrag(toolbar);

  // (The hexagon panel-toggle + divider were removed — the floating
  // "TraceBug AI" panel duplicated the bug ticket modal and the cloud
  // dashboard at /dashboard, so we cut it. The panel container in the
  // DOM is now orphaned but harmless; left in for any plugin that might
  // still reach for `_renderPanel`.)
  void panel;

  // Quick Bug Capture and Scan buttons were removed from the floating bar.
  // The Quick Bug shortcut (Ctrl+Shift+B) still works and the modal auto-opens
  // after every screenshot / stopped recording — the dedicated button gave
  // no unique value and was easily confused with the screenshot button.
  // Scan stays available via TraceBug.scanPage() API.

  // Annotate + Draw modes were cut from the v1 toolbar — they overlap with
  // the screenshot annotation editor and confused users with two paradigms.
  // The underlying APIs still exist (TraceBug.activateAnnotateMode / activateDrawMode).

  // Free-plan gate: enforce the screenshot limit at capture time.
  const _checkLimit = (): boolean => {
    if (isPremium()) return true;
    if (getScreenshots().length < FREE_LIMITS.screenshots) return true;
    showUpgradeModal({
      feature: "Unlimited screenshots",
      message: `Free plan is capped at ${FREE_LIMITS.screenshots} screenshots per ticket. Upgrade for unlimited captures.`,
    }, root);
    return false;
  };

  // Drag handle — drag already works from any non-button area, but the grip
  // makes it discoverable so users know the bar can be moved anywhere.
  const dragHandle = document.createElement("div");
  dragHandle.dataset.tracebug = "toolbar-handle";
  dragHandle.title = "Drag to move TraceBug";
  dragHandle.setAttribute("aria-label", "Drag to move TraceBug");
  dragHandle.style.cssText =
    "display:flex;align-items:center;justify-content:center;cursor:grab;padding:2px 0 4px;color:rgba(255,255,255,0.45);";
  dragHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.4"/><circle cx="15" cy="5" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="15" cy="19" r="1.4"/></svg>`;
  toolbar.appendChild(dragHandle);

  // Screenshot button — each click starts a fresh ticket.
  toolbar.appendChild(_createToolbarBtn(
    "Screenshot (Ctrl+Shift+S) — new ticket",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
    async () => {
      if (!_checkLimit()) return;
      showToast("Capturing…", root);
      try {
        // While session tracking is on, screenshots join the tracked session
        // instead of resetting to a fresh ticket, and the modal stays closed
        // until the user stops tracking.
        if (!_isTracking) { try { _onNewCapture?.(); } catch {} }
        await captureScreenshot(null);
        if (_isTracking) {
          showToast("✓ Screenshot added to tracked session", root);
        } else {
          showToast("✓ Screenshot captured — review your ticket", root);
          await _openOrRefreshTicket(root);
        }
      } catch {
        showToast("Screenshot failed", root);
      }
    },
    "tracebug-toolbar-screenshot-btn"
  ));

  // Region (snipping-tool) screenshot — each click starts a fresh ticket.
  toolbar.appendChild(_createToolbarBtn(
    "Region Screenshot — drag to select, new ticket",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9h6v6H9z"/></svg>`,
    async () => {
      if (!_checkLimit()) return;
      try {
        if (!_isTracking) { try { _onNewCapture?.(); } catch {} }
        const ss = await captureRegionScreenshot();
        if (!ss) { showToast("Cancelled", root); return; }
        if (_isTracking) {
          showToast("✓ Region added to tracked session", root);
        } else {
          showToast("✓ Region captured — review your ticket", root);
          await _openOrRefreshTicket(root);
        }
      } catch {
        showToast("Region screenshot failed", root);
      }
    },
    "tracebug-toolbar-region-btn"
  ));

  // Divider between capture group (screenshots) and recording group.
  toolbar.appendChild(_divider());

  // Record — one button. A small preflight asks "this tab vs screen / window"
  // and whether to include the mic; the native picker then confirms the
  // surface. (Replaced the old separate tab/desktop buttons — two entry points
  // for the same action just confused people, and the picker already chooses.)
  const recordBtn = _createToolbarBtn(
    "Record (video + session)",
    _recordIconSvg(false),
    () => _toggleRecording(root, recordBtn, showToast),
    "tracebug-toolbar-record-btn"
  );
  if (!isVideoSupported()) {
    recordBtn.style.opacity = "0.4";
    recordBtn.style.cursor = "not-allowed";
    recordBtn.title = "Screen recording not supported in this browser";
  }
  toolbar.appendChild(recordBtn);

  // Track session — event-only capture (no video, no screenshots required).
  // Click to arm a session; every click/input/navigation/API call/console
  // line flows into it. Click again to stop and open the ticket modal, where
  // media can be added optionally. Tickets file fine with events alone.
  const trackBtn = _createToolbarBtn(
    "Track session (events only, no video)",
    _trackIconSvg(false),
    () => { _toggleSessionTracking(root, trackBtn, showToast).catch(() => {}); },
    "tracebug-toolbar-track-btn"
  );
  _trackBtn = trackBtn;
  toolbar.appendChild(trackBtn);

  // Resume the tracking UI after a page navigation: if an event-only session
  // is still armed (the SDK keeps capturing across the load), show the green
  // stop-square so the button reflects reality and a click stops correctly.
  // Video sessions are excluded — the record button owns those.
  try {
    if (!_isTracking && getActiveSessionId() && getActiveCaptureMode() === "events") {
      _isTracking = true;
      trackBtn.innerHTML = _trackIconSvg(true);
      trackBtn.classList.add("tb-active");
      trackBtn.style.color = "var(--tb-success, #22c55e)";
      trackBtn.title = "Stop tracking & file ticket";
    }
  } catch {}

  // View saved tickets — opens the offline Saved Tickets popover.
  toolbar.appendChild(_divider());
  toolbar.appendChild(_createToolbarBtn(
    "View saved tickets",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    () => { _showOfflineTicketList(root); },
    "tracebug-toolbar-tickets-btn"
  ));

  // Close — turn TraceBug off on this page. Re-open from the extension popup.
  toolbar.appendChild(_divider());
  toolbar.appendChild(_createToolbarBtn(
    "Turn off TraceBug on this page",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    () => {
      // Tell the extension background to stop re-injecting on navigation for
      // this tab, then tear down the SDK on the page.
      try { window.dispatchEvent(new CustomEvent("tracebug-disable-tab")); } catch {}
      try {
        const tb = (window as unknown as { TraceBug?: { destroy?: () => void } }).TraceBug;
        if (tb?.destroy) tb.destroy();
        else {
          // No SDK destroy() available (bare toolbar mount) — clear the active
          // session ourselves so an event-only session doesn't silently resume
          // on the next page load after the user turned TraceBug off.
          try { clearActiveSessionId(); } catch {}
          _resetTrackingState();
          _toolbar?.remove(); _panelEl?.remove();
        }
      } catch {
        _toolbar?.remove();
      }
    },
    "tracebug-toolbar-close-btn"
  ));

  // Annotation list, Settings card, and Help button were cut from the v1
  // toolbar — they're configurable via init() and accessible via plugins.

  root.appendChild(toolbar);

  // Mobile: wrap toolbar in FAB on small screens
  if (_isMobile) {
    _convertToFab(toolbar, root, panel, showToast);
  }

  // Responsive: watch for resize
  const resizeHandler = () => {
    const wasMobile = _isMobile;
    _isMobile = window.innerWidth < 768;
    if (wasMobile !== _isMobile) {
      if (_isMobile) {
        _convertToFab(toolbar, root, panel, showToast);
      } else {
        _restoreToolbar(toolbar);
      }
    }
  };
  window.addEventListener("resize", resizeHandler);

  // Keyboard shortcuts — user-configurable via config.shortcuts.
  // Cross-platform: Ctrl on Windows/Linux, Cmd on macOS (both match).
  const annotateShortcut = shortcuts?.annotate || "ctrl+shift+a";
  const drawShortcut = shortcuts?.draw || "ctrl+shift+d";

  const keyHandler = (e: KeyboardEvent) => {
    if (matchesShortcut(e, annotateShortcut)) {
      e.preventDefault();
      (toolbar.querySelector("#tracebug-toolbar-annotate-btn") as HTMLElement)?.click();
    }
    if (matchesShortcut(e, drawShortcut)) {
      e.preventDefault();
      (toolbar.querySelector("#tracebug-toolbar-draw-btn") as HTMLElement)?.click();
    }
  };
  document.addEventListener("keydown", keyHandler);

  return () => {
    toolbar.remove();
    dragCleanup();
    document.removeEventListener("keydown", keyHandler);
    window.removeEventListener("resize", resizeHandler);
    deactivateElementAnnotateMode();
    deactivateDrawMode();
    const settingsCard = document.getElementById(SETTINGS_ID);
    settingsCard?.remove();
    _toolbar = null;
    _isTracking = false;
    _trackBtn = null;
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _createToolbarBtn(
  title: string,
  iconHtml: string,
  onClick: (e: MouseEvent) => void,
  id?: string
): HTMLElement {
  const btn = document.createElement("button");
  if (id) btn.id = id;
  btn.dataset.tracebug = "toolbar-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = iconHtml;
  btn.style.cssText = `
    width: 34px; height: 34px; border-radius: var(--tb-radius-md, 8px); border: none;
    background: transparent; color: var(--tb-btn-text, #aaa); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.15s;
  `;
  btn.addEventListener("mouseenter", () => {
    if (!btn.classList.contains("tb-active")) {
      btn.style.background = "var(--tb-btn-hover, #ffffff15)";
      btn.style.color = "var(--tb-btn-text-hover, #fff)";
    }
  });
  btn.addEventListener("mouseleave", () => {
    if (!btn.classList.contains("tb-active")) {
      btn.style.background = "transparent";
      btn.style.color = "var(--tb-btn-text, #aaa)";
    }
  });
  btn.addEventListener("click", onClick);
  return btn;
}

function _divider(): HTMLElement {
  const d = document.createElement("div");
  d.dataset.tracebug = "toolbar-divider";
  d.style.cssText = "width:20px;height:1px;background:var(--tb-border, #2a2a3e);margin:2px 0";
  return d;
}

// ── Session tracking (events only, no video) ────────────────────────────

let _isTracking = false;
let _trackBtn: HTMLElement | null = null;

// Activity-pulse icon (idle) / green stop square (tracking).
function _trackIconSvg(active: boolean): string {
  if (active) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--tb-success, #22c55e)" stroke="var(--tb-success, #22c55e)" stroke-width="1.5" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
}

/** Reset the track button to idle — used when video recording takes over the
 *  session (its start flow ends any armed session, tracked ones included). */
function _resetTrackingState(): void {
  if (!_isTracking) return;
  _isTracking = false;
  if (_trackBtn) {
    _trackBtn.innerHTML = _trackIconSvg(false);
    _trackBtn.classList.remove("tb-active");
    _trackBtn.style.color = "var(--tb-btn-text, #aaa)";
    _trackBtn.title = "Track session (events only, no video)";
  }
}

async function _toggleSessionTracking(
  root: HTMLElement,
  btn: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void,
): Promise<void> {
  if (_isTracking) {
    // Stop → finalize the session, then open the ticket for review. The
    // ticket is valid with events alone; screenshots can be added from the
    // modal ("Add page shot") if wanted.
    _isTracking = false;
    btn.innerHTML = _trackIconSvg(false);
    btn.classList.remove("tb-active");
    btn.style.color = "var(--tb-btn-text, #aaa)";
    btn.title = "Track session (events only, no video)";
    try { _onSessionEnd?.(); } catch (err) { console.warn("[TraceBug] Session end hook failed:", err); }
    try {
      if (!isQuickBugOpen()) await showQuickBugCapture(root);
    } catch (err) {
      console.warn("[TraceBug] Failed to open ticket after session tracking:", err);
    }
    return;
  }

  if (isVideoRecording()) {
    showToast("Recording already tracks the session — hit Stop to file its ticket", root);
    return;
  }

  _isTracking = true;
  try { _onSessionStart?.(); } catch (err) { console.warn("[TraceBug] Session start hook failed:", err); }
  btn.innerHTML = _trackIconSvg(true);
  btn.classList.add("tb-active");
  btn.style.color = "var(--tb-success, #22c55e)";
  btn.title = "Stop tracking & file ticket";
  showToast("Tracking session — click ■ again to stop & file a ticket", root);
}

// ── Record icon + toggle ────────────────────────────────────────────────

// Unified record icon — a video camera (idle) / red stop square (active).
function _recordIconSvg(active: boolean): string {
  if (active) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--tb-error, #ef4444)" stroke="var(--tb-error, #ef4444)" stroke-width="1.5" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  }
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 9.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2.5l5 3.5V6z"/></svg>`;
}

/** Shared stop-and-finalize path used by both record buttons. */
async function _finishRecording(
  root: HTMLElement,
  btn: HTMLElement,
  iconFn: (active: boolean) => string,
  showToast: (msg: string, root: HTMLElement) => void,
): Promise<void> {
  const captures = getCaptureCount();
  showToast("Stopping recording...", root);
  await stopVideoRecording();
  hideRecordingHUD();
  btn.innerHTML = iconFn(false);
  btn.classList.remove("tb-active");
  btn.style.color = "var(--tb-btn-text, #aaa)";
  try { _onSessionEnd?.(); } catch (err) { console.warn("[TraceBug] Session end hook failed:", err); }
  if (captures > 0) {
    showToast(`Recording stopped · ${captures} bug${captures === 1 ? "" : "s"} captured`, root);
  }
  try {
    if (!isQuickBugOpen()) await showQuickBugCapture(root);
  } catch (err) {
    console.warn("[TraceBug] Failed to open ticket review after recording:", err);
  }
}

async function _toggleRecording(
  root: HTMLElement,
  btn: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): Promise<void> {
  if (!isVideoSupported()) {
    showToast("Screen recording not supported in this browser", root);
    return;
  }

  if (isVideoRecording()) {
    return _finishRecording(root, btn, _recordIconSvg, showToast);
  }

  // One preflight for both modes: pick "this tab" vs "screen / window" and
  // whether to record the mic. The native picker then confirms the surface.
  // (Replaces the old two separate record buttons.)
  const choice = await _showRecordPreflight(root, btn);
  if (!choice) return; // dismissed — don't surface a scary "cancelled" toast

  // Recording owns the session from here — flip the track button back to
  // idle so it doesn't show a stale "tracking" state over the new session.
  _resetTrackingState();

  // Arm the session BEFORE capture starts. The offscreen document stamps the
  // recording's startedAt the moment capture begins — with the old order
  // (session armed after the start RPC resolved) createdAt landed later than
  // startedAt, and the ticket modal's "video belongs to this session" check
  // suppressed the video the user just recorded.
  try { _onSessionStart?.(); } catch (err) { console.warn("[TraceBug] Session start hook failed:", err); }
  // Mark this as a VIDEO session up front — BEFORE awaiting the screen picker,
  // which can sit open for seconds. If the page navigates during the picker,
  // the SDK's restore logic must not mistake this for an event-only session and
  // silently resume it. On cancel below, _onSessionEnd() clears the session
  // (and with it this mode), so a downgrade isn't needed.
  try { setActiveCaptureMode("video"); } catch {}

  const ok = await startVideoRecording({
    mode: "rolling",
    surfaceMode: choice.surface,
    withMicrophone: choice.withMicrophone,
    onStatus: (status, message) => {
      if (status === "error" && message) showToast(`Recording error: ${message}`, root);
      else if (status === "warning" && message) showToast(message, root);
    },
  });
  if (!ok) {
    // The start RPC can report "cancelled" even when the offscreen document
    // actually began capturing (a Chrome AbortError quirk). Give the
    // tb:rec:started broadcast a beat to flip our state before declaring
    // failure — if it really started, the SDK's started-handler already
    // mounted the HUD, so bail quietly instead of showing a false toast.
    await new Promise((r) => setTimeout(r, 400));
    if (isVideoRecording()) return;
    // Cancelled — release the session armed above so the dashboard doesn't
    // accumulate an empty ticket.
    try { _onSessionEnd?.(); } catch {}
    showToast("Recording cancelled", root);
    return;
  }

  btn.innerHTML = _recordIconSvg(true);
  btn.classList.add("tb-active");
  btn.style.color = "var(--tb-error, #ef4444)";
  showRecordingHUD(root, {
    onStop: () => { _toggleRecording(root, btn, showToast).catch(() => {}); },
  });
  showToast(choice.surface === "tab" ? "Recording this tab — hit Stop to file a ticket" : "Recording — hit Stop to file a ticket", root);
}

/**
 * Compact popover anchored under the Record button. Picks the capture surface
 * ("this tab" vs "screen / window") and whether to record the mic, before the
 * native share-picker takes over. Resolves to the choice, or null if dismissed.
 */
function _showRecordPreflight(
  root: HTMLElement,
  anchor: HTMLElement,
): Promise<{ surface: "tab" | "desktop"; withMicrophone: boolean } | null> {
  return new Promise((resolve) => {
    const prior = root.querySelector('[data-tracebug="record-preflight"]');
    if (prior) prior.remove();

    const rect = anchor.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.dataset.tracebug = "record-preflight";
    pop.setAttribute("role", "dialog");
    pop.style.cssText = `
      position:fixed;
      top:${Math.round(rect.bottom + 8)}px;
      left:${Math.round(Math.min(rect.left, window.innerWidth - 290))}px;
      width:262px;
      background:var(--tb-bg-secondary, #1a1a2e);
      border:1px solid var(--tb-border, #2a2a3e);
      border-radius:12px;
      padding:14px;
      box-shadow:0 12px 40px rgba(0,0,0,0.5);
      z-index:2147483647;
      font-family:var(--tb-font-family, system-ui, -apple-system, sans-serif);
      color:var(--tb-text-primary, #e0e0e0);
      font-size:12px;
      animation:tracebug-preflight-in 0.15s ease;
    `;
    if (!document.getElementById("tracebug-preflight-anim")) {
      const st = document.createElement("style");
      st.id = "tracebug-preflight-anim";
      st.textContent = `@keyframes tracebug-preflight-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`;
      document.head.appendChild(st);
    }
    // Use a theme-agnostic translucent fill (not --tb-bg-tertiary, whose dark
    // fallback rendered as an unreadable black block on light pages).
    const segBase = "flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 6px;border-radius:9px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.12s;border:1px solid var(--tb-border, #2a2a3e);background:rgba(127,127,140,0.14);color:var(--tb-text-secondary, #9aa0aa)";
    pop.innerHTML = `
      <div style="font-weight:600;margin-bottom:10px;font-size:12.5px">Start recording</div>
      <div style="display:flex;gap:7px;margin-bottom:10px">
        <button data-tb-pre="surface-tab" style="${segBase}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18"/></svg>
          This tab
        </button>
        <button data-tb-pre="surface-desktop" style="${segBase}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="10" rx="1.5"/><rect x="8" y="10" width="14" height="10" rx="1.5"/></svg>
          Screen / window
        </button>
      </div>
      <label style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer;background:rgba(127,127,140,0.14);user-select:none;margin-bottom:10px">
        <input type="checkbox" data-tb-pre="mic" style="margin:0;cursor:pointer" />
        <span style="display:flex;align-items:center;gap:6px;flex:1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <span>Include microphone</span>
        </span>
      </label>
      <div style="display:flex;gap:6px">
        <button data-tb-pre="cancel" style="flex:1;background:transparent;color:var(--tb-text-muted, #888);border:1px solid var(--tb-border, #2a2a3e);border-radius:8px;padding:8px 10px;cursor:pointer;font-size:11px;font-family:inherit">Cancel</button>
        <button data-tb-pre="start" style="flex:1.6;background:var(--tb-error, #ef4444);color:#fff;border:none;border-radius:8px;padding:8px 10px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">● Start recording</button>
      </div>
    `;

    root.appendChild(pop);

    let surface: "tab" | "desktop" = "tab";
    const tabBtn = pop.querySelector('[data-tb-pre="surface-tab"]') as HTMLButtonElement;
    const deskBtn = pop.querySelector('[data-tb-pre="surface-desktop"]') as HTMLButtonElement;
    const micEl = pop.querySelector('[data-tb-pre="mic"]') as HTMLInputElement;
    const cancelEl = pop.querySelector('[data-tb-pre="cancel"]') as HTMLButtonElement;
    const startEl = pop.querySelector('[data-tb-pre="start"]') as HTMLButtonElement;

    const paintSurface = () => {
      const on = ";border-color:var(--tb-accent, #6366F1);background:var(--tb-accent-subtle, rgba(99,102,241,0.15));color:var(--tb-text-primary, #fff)";
      tabBtn.style.cssText = segBase + (surface === "tab" ? on : "");
      deskBtn.style.cssText = segBase + (surface === "desktop" ? on : "");
    };
    paintSurface();
    tabBtn.addEventListener("click", () => { surface = "tab"; paintSurface(); });
    deskBtn.addEventListener("click", () => { surface = "desktop"; paintSurface(); });

    let settled = false;
    const finish = (value: { surface: "tab" | "desktop"; withMicrophone: boolean } | null) => {
      if (settled) return;
      settled = true;
      pop.remove();
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onOutside, true);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(null); }
      if (e.key === "Enter") { e.preventDefault(); finish({ surface, withMicrophone: micEl.checked }); }
    };
    const onOutside = (e: MouseEvent) => {
      if (!pop.contains(e.target as Node)) finish(null);
    };

    cancelEl.addEventListener("click", () => finish(null));
    startEl.addEventListener("click", () => finish({ surface, withMicrophone: micEl.checked }));
    document.addEventListener("keydown", onKey, true);
    // Slight delay so the toolbar click that opened the popover doesn't
    // immediately register as an outside click.
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    setTimeout(() => startEl.focus(), 0);
  });
}

/**
 * Open the bug-ticket modal if it isn't already, otherwise re-render it so
 * the freshly captured screenshot/video shows up. Single entry point that
 * the screenshot / region / stop-record handlers funnel through, so the
 * user always sees their draft after a capture.
 */
async function _openOrRefreshTicket(root: HTMLElement): Promise<void> {
  try {
    if (isQuickBugOpen()) {
      await refreshQuickBugCapture(root);
    } else {
      await showQuickBugCapture(root);
    }
  } catch (err) {
    console.warn("[TraceBug] Failed to open ticket after capture:", err);
  }
}

/**
 * Offline "Saved Tickets" popover. Lists sessions the user explicitly saved
 * (session.saved === true) with a thumbnail, event/shot counts, and Open /
 * Delete actions. Purely offline — reads from localStorage via getAllSessions.
 */
function _showOfflineTicketList(root: HTMLElement): void {
  const existing = root.querySelector('[data-tracebug="offline-tickets-pop"]');
  if (existing) { existing.remove(); return; }

  // Only sessions the user explicitly saved appear here.
  const sessions = getAllSessions()
    .filter(s => s.saved)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  const pop = document.createElement("div");
  pop.dataset.tracebug = "offline-tickets-pop";
  pop.style.cssText = [
    "position:fixed", "right:16px", "top:80px", "width:290px",
    "background:var(--tb-bg-secondary,#1a1a2e)",
    "border:1px solid var(--tb-border-hover,#3a3a5e)",
    "border-radius:12px", "padding:14px", "z-index:2147483646",
    "font-family:var(--tb-font-family,system-ui,sans-serif)",
    "font-size:12px", "color:var(--tb-text-primary,#e0e0e0)",
    "box-shadow:0 12px 40px rgba(0,0,0,0.5)",
  ].join(";");

  const _fmtTime = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · " +
           d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const hdr = document.createElement("div");
  hdr.style.cssText = "font-weight:600;font-size:13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center";
  const hdrTitle = document.createElement("span");
  hdrTitle.textContent = `Saved Tickets (${sessions.length})`;
  const closeX = document.createElement("button");
  closeX.textContent = "×";
  closeX.style.cssText = "background:none;border:none;color:var(--tb-text-muted,#666);cursor:pointer;font-size:16px;line-height:1;padding:0";
  closeX.addEventListener("click", () => pop.remove());
  hdr.appendChild(hdrTitle);
  hdr.appendChild(closeX);
  pop.appendChild(hdr);

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "text-align:center;padding:16px 0;color:var(--tb-text-muted,#666);font-size:11px;line-height:1.6";
    empty.innerHTML = "No saved tickets yet.<br>Open a ticket and click <strong>Save Ticket</strong> to add it here.";
    pop.appendChild(empty);
  } else {
    sessions.forEach((s) => {
      const evCount = (s.events || []).length;
      const ssArr = s.screenshots || [];
      const card = document.createElement("div");
      card.style.cssText = "display:flex;gap:8px;padding:8px;border-radius:8px;border:1px solid var(--tb-border,#2a2a3e);margin-bottom:8px;background:var(--tb-bg-primary,#12121f);align-items:center";

      const thumb = document.createElement("div");
      thumb.style.cssText = "width:54px;height:38px;border-radius:4px;overflow:hidden;flex-shrink:0;border:1px solid var(--tb-border,#2a2a3e);background:var(--tb-bg-primary,#0d0d1a);display:flex;align-items:center;justify-content:center";
      if (ssArr.length > 0 && ssArr[0].dataUrl) {
        const img = document.createElement("img");
        img.src = ssArr[0].dataUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        thumb.appendChild(img);
      } else {
        thumb.style.fontSize = "20px";
        thumb.textContent = "📋";
      }
      card.appendChild(thumb);

      const info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0";
      const timeEl = document.createElement("div");
      timeEl.style.cssText = "font-size:10px;color:var(--tb-text-secondary,#aaa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      timeEl.textContent = _fmtTime(s.updatedAt || s.createdAt || 0);
      const statsEl = document.createElement("div");
      statsEl.style.cssText = "font-size:11px;margin-top:3px;color:var(--tb-text-primary,#e0e0e0)";
      const parts: string[] = [];
      if (evCount > 0) parts.push(`${evCount} event${evCount !== 1 ? "s" : ""}`);
      if (ssArr.length > 0) parts.push(`${ssArr.length} shot${ssArr.length !== 1 ? "s" : ""}`);
      statsEl.textContent = parts.length > 0 ? parts.join(" · ") : "Empty session";
      info.appendChild(timeEl);
      info.appendChild(statsEl);
      card.appendChild(info);

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-direction:column;gap:4px;flex-shrink:0";
      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.style.cssText = "background:var(--tb-accent,#6366F1);color:#fff;border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;font-family:inherit;white-space:nowrap";
      openBtn.addEventListener("click", () => {
        pop.remove();
        // Close any open modal first so the _isOpen guard doesn't block reopening.
        const tbModal = document.getElementById("tracebug-quick-bug-modal");
        if (tbModal) {
          const tbClose = tbModal.querySelector('[data-action="close"]') as HTMLButtonElement | null;
          if (tbClose) tbClose.click();
        }
        showQuickBugCapture(root, { sessionId: s.sessionId }).catch(() => {});
      });
      const delBtn = document.createElement("button");
      delBtn.textContent = "Delete";
      delBtn.style.cssText = "background:transparent;color:var(--tb-error,#ef4444);border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:3px 6px;cursor:pointer;font-size:10px;font-family:inherit;white-space:nowrap";
      delBtn.addEventListener("click", () => {
        deleteSession(s.sessionId);
        pop.remove();
      });
      actions.appendChild(openBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
      pop.appendChild(card);
    });
  }

  root.appendChild(pop);
  // Close when clicking anywhere outside the popover (but not the toolbar button).
  setTimeout(() => {
    const closeOnOutside = (e: MouseEvent) => {
      if (!pop.contains(e.target as Node) && (e.target as HTMLElement)?.id !== "tracebug-toolbar-tickets-btn") {
        pop.remove();
        document.removeEventListener("mousedown", closeOnOutside);
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
  }, 0);
}

// ── Position & Layout ────────────────────────────────────────────────────

function _applyToolbarPosition(toolbar: HTMLElement, position: ToolbarPosition): void {
  // Check for saved drag position
  let savedPos: { x: number; y: number } | null = null;
  try {
    const raw = localStorage.getItem(DRAG_POS_KEY);
    if (raw) savedPos = JSON.parse(raw);
  } catch {}

  const isBottom = position === "bottom-right" || position === "bottom-left";
  const isLeft = position === "left" || position === "bottom-left";

  if (savedPos) {
    toolbar.style.cssText = `
      position: fixed; left: ${savedPos.x}px; top: ${savedPos.y}px;
      z-index: 2147483647; display: flex; flex-direction: column;
      align-items: center; gap: 3px; padding: 8px 6px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: none; cursor: grab;
    `;
  } else if (isBottom) {
    toolbar.style.cssText = `
      position: fixed; ${isLeft ? "left" : "right"}: 12px; bottom: 12px;
      z-index: 2147483647; display: flex; flex-direction: row;
      align-items: center; gap: 3px; padding: 6px 8px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: all 0.3s ease;
    `;
  } else {
    toolbar.style.cssText = `
      position: fixed; ${isLeft ? "left" : "right"}: 12px; top: 50%; transform: translateY(-50%);
      z-index: 2147483647; display: flex; flex-direction: column;
      align-items: center; gap: 3px; padding: 8px 6px;
      background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
      border-radius: 14px; box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
      transition: ${isLeft ? "left" : "right"} 0.3s ease;
    `;
  }
}

function _initDrag(toolbar: HTMLElement): () => void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let hasMoved = false;

  const onMouseDown = (e: MouseEvent) => {
    // Only drag from the toolbar itself (not buttons)
    if ((e.target as HTMLElement).tagName === "BUTTON" || (e.target as HTMLElement).closest("button")) return;
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = toolbar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    toolbar.style.cursor = "grabbing";
    toolbar.style.transition = "none";
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    if (!hasMoved) return;

    const newLeft = Math.max(0, Math.min(window.innerWidth - 60, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "none";
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    toolbar.style.cursor = "grab";

    if (hasMoved) {
      try {
        localStorage.setItem(DRAG_POS_KEY, JSON.stringify({
          x: parseInt(toolbar.style.left),
          y: parseInt(toolbar.style.top),
        }));
      } catch {}
    }
  };

  // Touch support for mobile drag (named so we can detach on unmount)
  const onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement).tagName === "BUTTON" || (e.target as HTMLElement).closest("button")) return;
    const touch = e.touches[0];
    isDragging = true;
    hasMoved = false;
    startX = touch.clientX;
    startY = touch.clientY;
    const rect = toolbar.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    toolbar.style.transition = "none";
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    if (!hasMoved) return;

    const newLeft = Math.max(0, Math.min(window.innerWidth - 60, startLeft + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));
    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "none";
  };
  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    if (hasMoved) {
      try {
        localStorage.setItem(DRAG_POS_KEY, JSON.stringify({
          x: parseInt(toolbar.style.left),
          y: parseInt(toolbar.style.top),
        }));
      } catch {}
    }
  };

  toolbar.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  toolbar.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd);

  // Teardown: the toolbar element's own listeners die with it, but the
  // document-level ones must be removed explicitly or they leak (+ keep the
  // toolbar closure alive) on every re-mount.
  return () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
  };
}

// ── Mobile FAB ──────────────────────────────────────────────────────────

function _convertToFab(
  toolbar: HTMLElement,
  root: HTMLElement,
  panel: HTMLElement,
  _showToast: (msg: string, root: HTMLElement) => void
): void {
  // Save all children except the logo button
  const buttons = Array.from(toolbar.children);
  buttons.forEach(b => {
    const el = b as HTMLElement;
    if (el.id !== "tracebug-toolbar-panel-btn" &&
        el.id !== "tracebug-toolbar-rec-dot") {
      el.style.display = _fabExpanded ? "" : "none";
    }
  });

  toolbar.style.cssText = `
    position: fixed; right: 12px; bottom: 12px;
    z-index: 2147483647; display: flex; flex-direction: column;
    align-items: center; gap: 3px; padding: ${_fabExpanded ? "8px 6px" : "6px"};
    background: var(--tb-toolbar-bg, #0f0f1aee); border: 1px solid var(--tb-border, #2a2a3e);
    border-radius: ${_fabExpanded ? "14px" : "50%"};
    box-shadow: var(--tb-shadow-md, 0 4px 24px rgba(0,0,0,0.5));
    min-width: 44px; min-height: 44px;
    transition: all 0.2s ease;
  `;

  // Override panel for mobile: full width slide-up
  panel.style.width = "100vw";
  panel.style.height = "80vh";
  panel.style.bottom = _panelOpen ? "0" : "-85vh";
  panel.style.right = "0";
  panel.style.top = "auto";
  panel.style.borderRadius = "16px 16px 0 0";
}

function _restoreToolbar(toolbar: HTMLElement): void {
  const buttons = Array.from(toolbar.children);
  buttons.forEach(b => (b as HTMLElement).style.display = "");
  _applyToolbarPosition(toolbar, _position);

  // Restore panel to desktop layout
  if (_panelEl) {
    _panelEl.style.width = "";
    _panelEl.style.height = "";
    _panelEl.style.bottom = "";
    _panelEl.style.top = "";
    _panelEl.style.borderRadius = "";
    _panelEl.style.right = _panelOpen ? "0" : "-480px";
  }
}
