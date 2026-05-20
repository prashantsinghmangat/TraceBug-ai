// ── Compact Toolbar ───────────────────────────────────────────────────────
// Minimal vertical rail on the right edge of the screen.
// Replaces the old 48px floating bug button.
// Primary actions as small icons, settings in a pop-out card.

import { activateElementAnnotateMode, deactivateElementAnnotateMode, isElementAnnotateActive, clearAnnotationBadges } from "./element-annotate";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "./draw-mode";
import { getAnnotationCount, clearAllAnnotations, exportAsJSON, exportAsMarkdown, copyToClipboard, getElementAnnotations, getDrawRegions } from "./annotation-store";
import { clearScreenshots } from "./screenshot";
import { clearVoiceTranscripts } from "./voice-recorder";
import { clearNetworkFailures } from "./collectors";
import { captureScreenshot, getScreenshots } from "./screenshot";
import { captureRegionScreenshot } from "./region-screenshot";
import { isPremium, FREE_LIMITS } from "./plan";
import { showUpgradeModal } from "./ui/upgrade-modal";
import { getAllSessions, clearAllSessions as clearAllSessionsFn } from "./storage";
import { replayOnboarding } from "./onboarding";
import { showQuickBugCapture, isQuickBugOpen, refreshQuickBugCapture } from "./ui/quick-bug";
import { showIssuesPanel, isIssuesPanelOpen } from "./ui/issues-panel";
import { matchesShortcut } from "./ui/helpers";
import { startVideoRecording, stopVideoRecording, isVideoRecording, isVideoSupported, captureRollingBuffer, getCaptureCount } from "./video-recorder";
import { showRecordingHUD, hideRecordingHUD, flashRecordingHUD } from "./ui/recording-hud";

const TOOLBAR_ID = "tracebug-compact-toolbar";
const SETTINGS_ID = "tracebug-settings-card";
const DRAG_POS_KEY = "tracebug_toolbar_pos";

export type ToolbarPosition = "right" | "left" | "bottom-right" | "bottom-left";

let _isRecording = true;
let _onToggleRecording: (() => void) | null = null;
let _onSessionStart: (() => void) | null = null;
let _onSessionEnd: (() => void) | null = null;
let _renderPanel: ((panel: HTMLElement) => void) | null = null;
let _panelEl: HTMLElement | null = null;
let _panelOpen = false;
let _annotationViewOpen = false;
let _toolbar: HTMLElement | null = null;
let _position: ToolbarPosition = "right";
let _isMobile = false;
const _fabExpanded = false;

// ── Wiring from SDK ───────────────────────────────────────────────────────

export function setToolbarRecordingState(isRecording: boolean, onToggle: () => void): void {
  _isRecording = isRecording;
  _onToggleRecording = onToggle;
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

export function updateToolbarRecordingState(isRecording: boolean): void {
  _isRecording = isRecording;
  const dot = document.getElementById("tracebug-toolbar-rec-dot");
  if (dot) {
    dot.style.background = isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)";
    dot.style.animation = isRecording ? "bt-pulse 2s infinite" : "none";
  }
}

export function setRenderPanel(fn: (panel: HTMLElement) => void): void {
  _renderPanel = fn;
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

  // Drag handle support
  _initDrag(toolbar);

  // (The hexagon panel-toggle + divider were removed — the floating
  // "TraceBug AI" panel duplicated the bug ticket modal and the cloud
  // dashboard at /dashboard, so we cut it. The panel container in the
  // DOM is now orphaned but harmless; left in for any plugin that might
  // still reach for `_renderPanel`.)
  void panel;

  // ⚡ Quick Bug Capture — the daily-use one-shot button
  const quickBugBtn = _createToolbarBtn(
    "Quick Bug Capture (Ctrl+Shift+B)",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    () => {
      if (!isQuickBugOpen()) {
        showQuickBugCapture(root).catch(() => showToast("Quick capture failed", root));
      }
    },
    "tracebug-toolbar-quickbug-btn"
  );
  // Make it stand out with accent color
  quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
  quickBugBtn.addEventListener("mouseenter", () => {
    quickBugBtn.style.background = "var(--tb-accent-subtle, #7B61FF33)";
    quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
  });
  quickBugBtn.addEventListener("mouseleave", () => {
    quickBugBtn.style.background = "transparent";
    quickBugBtn.style.color = "var(--tb-accent, #7B61FF)";
  });
  toolbar.appendChild(quickBugBtn);

  // Scan Page — runs auto-detectors (a11y, broken images, mixed content,
  // failed/slow APIs, JS errors) and opens the issues panel.
  const scanBtn = _createToolbarBtn(
    "Scan page for issues",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    () => {
      if (!isIssuesPanelOpen()) {
        showIssuesPanel(root).catch((err) => {
          console.warn("[TraceBug] Scan failed:", err);
          showToast("Scan failed", root);
        });
      }
    },
    "tracebug-toolbar-scan-btn"
  );
  toolbar.appendChild(scanBtn);

  // Divider
  toolbar.appendChild(_divider());

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

  // Screenshot button — adds to the active ticket; downloads happen on export.
  // Auto-opens the bug ticket modal after capture so the user sees where the
  // screenshot landed. If the modal is already open, just refreshes it.
  toolbar.appendChild(_createToolbarBtn(
    "Screenshot (Ctrl+Shift+S) — added to ticket",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
    async () => {
      if (!_checkLimit()) return;
      showToast("Capturing…", root);
      try {
        const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
        const lastEvent = sessions[0]?.events[sessions[0].events.length - 1] || null;
        await captureScreenshot(lastEvent);
        const n = getScreenshots().length;
        const cap = isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`;
        showToast(`✓ Screenshot ${n}${cap} added to ticket`, root);
        await _openOrRefreshTicket(root);
      } catch {
        showToast("Screenshot failed", root);
      }
    },
    "tracebug-toolbar-screenshot-btn"
  ));

  // Region (snipping-tool) screenshot button — adds to the active ticket.
  toolbar.appendChild(_createToolbarBtn(
    "Region Screenshot — drag to select, added to ticket",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M9 9h6v6H9z"/></svg>`,
    async () => {
      if (!_checkLimit()) return;
      try {
        const ss = await captureRegionScreenshot();
        if (!ss) { showToast("Cancelled", root); return; }
        const n = getScreenshots().length;
        const cap = isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`;
        showToast(`✓ Region ${n}${cap} added to ticket`, root);
        await _openOrRefreshTicket(root);
      } catch {
        showToast("Region screenshot failed", root);
      }
    },
    "tracebug-toolbar-region-btn"
  ));

  // Events-only Record button — clipboard icon makes it visually obvious this
  // is the "no-video" capture mode. Arms a TraceBug session (events +
  // screenshots) WITHOUT a screen-share prompt. Stop opens the ticket modal.
  const eventsRecordBtn = _createToolbarBtn(
    "Start session (events + screenshots) — no video, no screen prompt",
    _eventsRecordIconSvg(false),
    () => _toggleEventsRecording(root, eventsRecordBtn, showToast),
    "tracebug-toolbar-events-record-btn"
  );
  toolbar.appendChild(eventsRecordBtn);

  // Video recording button — film/camera icon. Triggers the screen-share
  // picker, then captures events + screenshots + video into one ticket. Stop
  // opens the ticket modal with everything embedded.
  const recordBtn = _createToolbarBtn(
    "Record session WITH video (asks to share screen)",
    _recordIconSvg(false),
    () => _toggleVideoRecording(root, recordBtn, showToast),
    "tracebug-toolbar-record-btn"
  );
  if (!isVideoSupported()) {
    recordBtn.style.opacity = "0.4";
    recordBtn.style.cursor = "not-allowed";
    recordBtn.title = "Screen recording not supported in this browser";
  }
  toolbar.appendChild(recordBtn);

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
    document.removeEventListener("keydown", keyHandler);
    window.removeEventListener("resize", resizeHandler);
    deactivateElementAnnotateMode();
    deactivateDrawMode();
    const settingsCard = document.getElementById(SETTINGS_ID);
    settingsCard?.remove();
    _toolbar = null;
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

// ── Events-only recording icon + toggle ─────────────────────────────────

function _eventsRecordIconSvg(active: boolean): string {
  if (active) {
    // Solid red square — universal "stop" affordance. Clearly different from
    // the video button's stop state (round filled circle).
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--tb-error, #ef4444)" stroke="var(--tb-error, #ef4444)" stroke-width="1.5" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
  }
  // Clipboard icon — "capture a session of steps". Pairs with the camera icon
  // on the video button so the two affordances are immediately distinguishable.
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>`;
}

/**
 * Toggle events-only session recording. Arms the same session lifecycle as
 * the video button (so events + screenshots accumulate under one session id)
 * but skips getDisplayMedia and the HUD entirely.
 */
async function _toggleEventsRecording(
  root: HTMLElement,
  btn: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): Promise<void> {
  // The button's active state mirrors the SDK's `recording` flag, which the
  // session-lifecycle hook keeps in sync. We treat the toolbar class as the
  // source of truth for the toggle since the SDK doesn't expose recording
  // state directly to this module.
  const isActive = btn.classList.contains("tb-active");

  if (isActive) {
    // Stop: end the session and open the ticket modal.
    showToast("Stopping recording...", root);
    btn.innerHTML = _eventsRecordIconSvg(false);
    btn.classList.remove("tb-active");
    btn.style.color = "var(--tb-btn-text, #aaa)";
    try { _onSessionEnd?.(); } catch (err) { console.warn("[TraceBug] Session end hook failed:", err); }
    try {
      if (!isQuickBugOpen()) await showQuickBugCapture(root);
    } catch (err) {
      console.warn("[TraceBug] Failed to open ticket review after recording:", err);
    }
    return;
  }

  // Start: arm the session. No screen picker, no video.
  try { _onSessionStart?.(); } catch (err) { console.warn("[TraceBug] Session start hook failed:", err); }
  btn.innerHTML = _eventsRecordIconSvg(true);
  btn.classList.add("tb-active");
  btn.style.color = "var(--tb-error, #ef4444)";
  showToast("Recording — events + screenshots will be captured", root);
}

// ── Video recording icon + toggle ────────────────────────────────────────

function _recordIconSvg(active: boolean): string {
  if (active) {
    // Solid red CIRCLE for stop — distinct from the events-only stop state
    // which uses a square. This way the active states also stay distinguishable.
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--tb-error, #ef4444)" stroke="var(--tb-error, #ef4444)" stroke-width="1.5"><circle cx="12" cy="12" r="6"/></svg>`;
  }
  // Video camera icon — instantly readable as "screen recording" and clearly
  // different from the events-only clipboard.
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
}

async function _toggleVideoRecording(
  root: HTMLElement,
  btn: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): Promise<void> {
  if (!isVideoSupported()) {
    showToast("Screen recording not supported in this browser", root);
    return;
  }

  if (isVideoRecording()) {
    const captures = getCaptureCount();
    showToast("Stopping recording...", root);
    await stopVideoRecording();
    hideRecordingHUD();
    btn.innerHTML = _recordIconSvg(false);
    btn.classList.remove("tb-active");
    btn.style.color = "var(--tb-btn-text, #aaa)";
    // Finalize the TraceBug session: clears the active-session flag so the
    // next Record click starts fresh and stops the event collectors.
    try { _onSessionEnd?.(); } catch (err) { console.warn("[TraceBug] Session end hook failed:", err); }
    if (captures > 0) {
      showToast(`Recording stopped · ${captures} bug${captures === 1 ? "" : "s"} captured`, root);
    }
    // Always open the ticket modal on stop. Earlier we skipped this when
    // rolling captures had already been filed, but users were left without a
    // visible "result" of stopping — they expect a ticket every time. Open the
    // ticket for the most recent session so the recording, replay, and
    // screenshots are immediately reviewable.
    try {
      if (!isQuickBugOpen()) await showQuickBugCapture(root);
    } catch (err) {
      console.warn("[TraceBug] Failed to open ticket review after recording:", err);
    }
    return;
  }

  showToast("Pick a screen, window, or tab to record", root);
  const ok = await startVideoRecording({
    mode: "rolling",
    onStatus: (status, message) => {
      if (status === "error" && message) showToast(`Recording error: ${message}`, root);
      else if (status === "warning" && message) showToast(message, root);
    },
  });
  if (!ok) {
    showToast("Recording cancelled", root);
    return;
  }

  // Arm the TraceBug session in the same gesture as starting the video so
  // events, screenshots, and the recording all land under one session id.
  // Fires before the HUD mounts so the active-session flag is already
  // persisted when the first event arrives.
  try { _onSessionStart?.(); } catch (err) { console.warn("[TraceBug] Session start hook failed:", err); }

  btn.innerHTML = _recordIconSvg(true);
  btn.classList.add("tb-active");
  btn.style.color = "var(--tb-error, #ef4444)";
  showRecordingHUD(root, {
    onStop: () => { _toggleVideoRecording(root, btn, showToast).catch(() => {}); },
  });
  showToast("Recording started — hit Stop to file a ticket", root);
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
 * Snapshot the in-flight rolling recording, open the ticket modal so the
 * user can edit + export, and let the recorder keep rolling so the same
 * arm session can produce more tickets.
 */
async function _captureRollingFromHUD(
  root: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): Promise<void> {
  if (isQuickBugOpen()) {
    showToast("A ticket is already open — close it first", root);
    return;
  }
  const recording = await captureRollingBuffer();
  if (!recording) {
    showToast("Capture failed — recording may have ended", root);
    return;
  }
  flashRecordingHUD();
  showToast("Captured — review the ticket", root);
  try {
    await showQuickBugCapture(root);
  } catch (err) {
    console.warn("[TraceBug] Failed to open ticket modal after rolling capture:", err);
  }
}

function _togglePanel(
  panel: HTMLElement,
  toolbar: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): void {
  _panelOpen = !_panelOpen;

  if (_isMobile) {
    // Mobile: slide panel up from bottom
    panel.style.bottom = _panelOpen ? "0" : "-85vh";
  } else {
    const isLeft = _position === "left" || _position === "bottom-left";
    if (isLeft) {
      panel.style.left = _panelOpen ? "0" : "-480px";
      panel.style.right = "auto";
      // Only move toolbar if no custom drag position
      if (!localStorage.getItem(DRAG_POS_KEY)) {
        toolbar.style.left = _panelOpen ? "482px" : "12px";
      }
    } else {
      panel.style.right = _panelOpen ? "0" : "-480px";
      // Only move toolbar if no custom drag position
      if (!localStorage.getItem(DRAG_POS_KEY)) {
        toolbar.style.right = _panelOpen ? "482px" : "12px";
      }
    }
  }

  if (_panelOpen && _renderPanel) {
    _annotationViewOpen = false;
    _renderPanel(panel);
  }
}

function _updateActiveStates(toolbar: HTMLElement): void {
  const annotateBtn = toolbar.querySelector("#tracebug-toolbar-annotate-btn") as HTMLElement;
  const drawBtn = toolbar.querySelector("#tracebug-toolbar-draw-btn") as HTMLElement;

  if (annotateBtn) {
    const active = isElementAnnotateActive();
    annotateBtn.classList.toggle("tb-active", active);
    annotateBtn.style.background = active ? "var(--tb-accent-subtle, #7B61FF33)" : "transparent";
    annotateBtn.style.color = active ? "var(--tb-accent, #7B61FF)" : "var(--tb-text-muted, #888)";
  }
  if (drawBtn) {
    const active = isDrawModeActive();
    drawBtn.classList.toggle("tb-active", active);
    drawBtn.style.background = active ? "var(--tb-accent-subtle, #7B61FF33)" : "transparent";
    drawBtn.style.color = active ? "var(--tb-accent, #7B61FF)" : "var(--tb-text-muted, #888)";
  }
}

function _updateAnnotationCount(toolbar: HTMLElement): void {
  const badge = toolbar.querySelector("#tracebug-toolbar-badge") as HTMLElement;
  if (badge) {
    const count = getAnnotationCount();
    badge.textContent = String(count);
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

function _toggleSettingsCard(
  e: MouseEvent,
  root: HTMLElement,
  toolbar: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): void {
  e.stopPropagation();
  const existing = document.getElementById(SETTINGS_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const card = document.createElement("div");
  card.id = SETTINGS_ID;
  card.dataset.tracebug = "settings-card";

  // Position to the left of the toolbar
  const toolbarRect = toolbar.getBoundingClientRect();
  card.style.cssText = `
    position: fixed; z-index: 2147483647;
    right: ${window.innerWidth - toolbarRect.left + 8}px;
    top: ${toolbarRect.top + toolbarRect.height - 220}px;
    width: 220px; background: var(--tb-bg-secondary, #1a1a2e); border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px); padding: 16px;
    font-family: var(--tb-font-family, system-ui, sans-serif); font-size: 13px; color: var(--tb-text-primary, #e0e0e0);
    box-shadow: var(--tb-shadow-lg, 0 8px 32px rgba(0,0,0,0.5));
  `;

  const sessions = getAllSessions();
  const errorCount = sessions.filter(s => s.errorMessage).length;

  card.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      Settings
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Recording</span>
        <button id="tracebug-settings-rec" style="
          background:${_isRecording ? "var(--tb-success-bg, #22c55e22)" : "var(--tb-error-bg, #ef444422)"};
          color:${_isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)"};
          border:1px solid ${_isRecording ? "var(--tb-success, #22c55e)44" : "var(--tb-error, #ef4444)44"};
          border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;font-family:inherit
        ">${_isRecording ? "Pause" : "Resume"}</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Sessions</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${sessions.length} (${errorCount} errors)</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Annotations</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${getAnnotationCount()}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Screenshots</span>
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${getScreenshots().length}${isPremium() ? "" : ` / ${FREE_LIMITS.screenshots}`}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--tb-text-secondary, #aaa)">Plan</span>
        <span id="tracebug-settings-plan-badge" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;${isPremium() ? "background:var(--tb-accent, #7B61FF);color:#fff" : "background:var(--tb-border, #2a2a3e);color:var(--tb-text-secondary, #aaa)"}">${isPremium() ? "✨ Premium" : "Free Plan"}</span>
      </div>
      <div style="border-top:1px solid var(--tb-border, #2a2a3e);padding-top:10px;display:flex;gap:6px">
        <button id="tracebug-settings-clear-ann" style="flex:1;background:var(--tb-warning-bg, #f9731622);color:var(--tb-warning, #f97316);border:1px solid var(--tb-warning, #f97316)44;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear Annotations</button>
        <button id="tracebug-settings-clear-all" style="flex:1;background:var(--tb-error-bg, #ef444422);color:var(--tb-error, #ef4444);border:1px solid var(--tb-error, #ef4444)44;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear All Data</button>
      </div>
    </div>
  `;

  root.appendChild(card);

  card.querySelector("#tracebug-settings-rec")!.addEventListener("click", () => {
    if (_onToggleRecording) _onToggleRecording();
    card.remove();
  });

  // Plan badge — opens the upgrade modal (which exposes the dev toggle).
  const planBadge = card.querySelector("#tracebug-settings-plan-badge") as HTMLElement | null;
  if (planBadge) {
    planBadge.style.cursor = "pointer";
    planBadge.title = "View plan / upgrade";
    planBadge.addEventListener("click", () => {
      card.remove();
      showUpgradeModal({
        feature: isPremium() ? "Premium plan" : "Premium plan",
        message: isPremium()
          ? "You're on Premium. Use the dev toggle below to switch back to Free for testing."
          : "Unlock unlimited screenshots, PDF export, Jira tickets, advanced metadata, and custom branding.",
      }, root);
    });
  }

  card.querySelector("#tracebug-settings-clear-ann")!.addEventListener("click", () => {
    clearAllAnnotations();
    _updateAnnotationCount(toolbar);
    showToast("Annotations cleared", root);
    card.remove();
  });

  card.querySelector("#tracebug-settings-clear-all")!.addEventListener("click", () => {
    if (confirm("Delete all TraceBug data? This clears sessions, screenshots, voice notes, annotations, and the network failure buffer.")) {
      // Comprehensive wipe — nothing stale leaks into future reports.
      try { clearAllSessionsFn(); } catch {}
      try { clearScreenshots(); } catch {}
      try { clearVoiceTranscripts(); } catch {}
      try { clearAllAnnotations(); } catch {}
      try { clearAnnotationBadges(); } catch {}
      try { clearNetworkFailures(); } catch {}
      _updateAnnotationCount(toolbar);
      showToast("All data cleared", root);
      card.remove();
    }
  });

  // Close on click outside
  const closeHandler = (ev: MouseEvent) => {
    if (!card.contains(ev.target as Node) && ev.target !== e.target) {
      card.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 10);
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

function _initDrag(toolbar: HTMLElement): void {
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

  toolbar.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  // Touch support for mobile drag
  toolbar.addEventListener("touchstart", (e) => {
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
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
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
  }, { passive: true });

  document.addEventListener("touchend", () => {
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
  });
}

// ── Mobile FAB ──────────────────────────────────────────────────────────

function _convertToFab(
  toolbar: HTMLElement,
  root: HTMLElement,
  panel: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
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

function _logoSvg(): string {
  return `<svg width="18" height="18" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="tb-cr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#9B7DFF"/><stop offset="50%" stop-color="#7B61FF"/><stop offset="100%" stop-color="#00E5FF"/></linearGradient></defs><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#tb-cr)" opacity="0.18"/><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#tb-cr)" stroke-width="2.5"/><circle cx="48" cy="41" r="5" fill="url(#tb-cr)"/><circle cx="48" cy="41" r="2.2" fill="white"/></svg>`;
}
