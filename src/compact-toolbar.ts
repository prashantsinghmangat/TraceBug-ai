// ── Compact Toolbar ───────────────────────────────────────────────────────
// Minimal vertical rail on the right edge of the screen.
// Replaces the old 48px floating bug button.
// Primary actions as small icons, settings in a pop-out card.

import { activateElementAnnotateMode, deactivateElementAnnotateMode, isElementAnnotateActive } from "./element-annotate";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "./draw-mode";
import { getAnnotationCount, clearAllAnnotations, exportAsJSON, exportAsMarkdown, copyToClipboard, getElementAnnotations, getDrawRegions } from "./annotation-store";
import { captureScreenshot, getScreenshots, downloadScreenshot } from "./screenshot";
import { getAllSessions, clearAllSessions as clearAllSessionsFn } from "./storage";
import { replayOnboarding } from "./onboarding";

const TOOLBAR_ID = "tracebug-compact-toolbar";
const SETTINGS_ID = "tracebug-settings-card";
const DRAG_POS_KEY = "tracebug_toolbar_pos";

export type ToolbarPosition = "right" | "left" | "bottom-right" | "bottom-left";

let _isRecording = true;
let _onToggleRecording: (() => void) | null = null;
let _renderPanel: ((panel: HTMLElement) => void) | null = null;
let _panelEl: HTMLElement | null = null;
let _panelOpen = false;
let _annotationViewOpen = false;
let _toolbar: HTMLElement | null = null;
let _position: ToolbarPosition = "right";
let _isMobile = false;
let _fabExpanded = false;

// ── Wiring from SDK ───────────────────────────────────────────────────────

export function setToolbarRecordingState(isRecording: boolean, onToggle: () => void): void {
  _isRecording = isRecording;
  _onToggleRecording = onToggle;
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
  position: ToolbarPosition = "right"
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

  // TraceBug logo button (opens panel)
  toolbar.appendChild(_createToolbarBtn(
    "TraceBug Dashboard",
    _logoSvg(),
    () => _togglePanel(panel, toolbar, showToast),
    "tracebug-toolbar-panel-btn"
  ));

  // Recording indicator dot
  const recDot = document.createElement("div");
  recDot.id = "tracebug-toolbar-rec-dot";
  recDot.dataset.tracebug = "rec-dot";
  recDot.style.cssText = `
    width: 6px; height: 6px; border-radius: 50%; margin: -1px 0 2px 0;
    background: ${_isRecording ? "var(--tb-success, #22c55e)" : "var(--tb-error, #ef4444)"};
    animation: ${_isRecording ? "bt-pulse 2s infinite" : "none"};
  `;
  toolbar.appendChild(recDot);

  // Divider
  toolbar.appendChild(_divider());

  // Element Annotate button
  const annotateBtn = _createToolbarBtn(
    "Annotate Elements (Ctrl+Shift+A)",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>`,
    () => {
      if (isElementAnnotateActive()) {
        deactivateElementAnnotateMode();
        _updateActiveStates(toolbar);
      } else {
        if (isDrawModeActive()) deactivateDrawMode();
        activateElementAnnotateMode(root, () => {
          _updateAnnotationCount(toolbar);
          showToast("Annotation saved", root);
        }, () => {
          _updateActiveStates(toolbar);
        });
        _updateActiveStates(toolbar);
      }
    },
    "tracebug-toolbar-annotate-btn"
  );
  toolbar.appendChild(annotateBtn);

  // Draw Mode button
  const drawBtn = _createToolbarBtn(
    "Draw Regions (Ctrl+Shift+D)",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>`,
    () => {
      if (isDrawModeActive()) {
        deactivateDrawMode();
        _updateActiveStates(toolbar);
      } else {
        if (isElementAnnotateActive()) deactivateElementAnnotateMode();
        activateDrawMode(root, () => {
          _updateAnnotationCount(toolbar);
          showToast("Region saved", root);
        }, () => {
          _updateActiveStates(toolbar);
        });
        _updateActiveStates(toolbar);
      }
    },
    "tracebug-toolbar-draw-btn"
  );
  toolbar.appendChild(drawBtn);

  // Screenshot button
  toolbar.appendChild(_createToolbarBtn(
    "Screenshot (Ctrl+Shift+S)",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/></svg>`,
    async () => {
      showToast("Capturing...", root);
      try {
        const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
        const lastEvent = sessions[0]?.events[sessions[0].events.length - 1] || null;
        const ss = await captureScreenshot(lastEvent);
        downloadScreenshot(ss.dataUrl, ss.filename);
        showToast(`Screenshot saved: ${ss.filename}`, root);
      } catch {
        showToast("Screenshot failed", root);
      }
    },
    "tracebug-toolbar-screenshot-btn"
  ));

  // Divider
  toolbar.appendChild(_divider());

  // Annotation list button (with count badge)
  const listBtn = _createToolbarBtn(
    "Annotation List",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
    () => {
      if (_annotationViewOpen && _panelOpen) {
        _togglePanel(panel, toolbar, showToast);
        _annotationViewOpen = false;
      } else {
        if (!_panelOpen) _togglePanel(panel, toolbar, showToast);
        renderAnnotationList(panel);
        _annotationViewOpen = true;
      }
    },
    "tracebug-toolbar-list-btn"
  );
  // Badge
  const badge = document.createElement("div");
  badge.id = "tracebug-toolbar-badge";
  badge.dataset.tracebug = "toolbar-badge";
  badge.style.cssText = `
    position: absolute; top: -2px; right: -2px;
    min-width: 14px; height: 14px; border-radius: 7px;
    background: var(--tb-accent, #7B61FF); color: #fff; font-size: 9px; font-weight: 700;
    font-family: var(--tb-font-family, system-ui, sans-serif);
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
  `;
  const count = getAnnotationCount();
  badge.textContent = String(count);
  badge.style.display = count > 0 ? "flex" : "none";
  listBtn.style.position = "relative";
  listBtn.appendChild(badge);
  toolbar.appendChild(listBtn);

  // Divider
  toolbar.appendChild(_divider());

  // Settings button
  toolbar.appendChild(_createToolbarBtn(
    "Settings",
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    (e) => _toggleSettingsCard(e, root, toolbar, showToast),
    "tracebug-toolbar-settings-btn"
  ));

  // Help button — replays onboarding tour
  toolbar.appendChild(_createToolbarBtn(
    "Help — replay tour",
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    () => replayOnboarding(root),
    "tracebug-toolbar-help-btn"
  ));

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

  // Keyboard shortcuts
  const keyHandler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === "A") {
      e.preventDefault();
      (toolbar.querySelector("#tracebug-toolbar-annotate-btn") as HTMLElement)?.click();
    }
    if (e.ctrlKey && e.shiftKey && e.key === "D") {
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
        <span style="font-size:12px;color:var(--tb-text-muted, #888)">${getScreenshots().length}</span>
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

  card.querySelector("#tracebug-settings-clear-ann")!.addEventListener("click", () => {
    clearAllAnnotations();
    _updateAnnotationCount(toolbar);
    showToast("Annotations cleared", root);
    card.remove();
  });

  card.querySelector("#tracebug-settings-clear-all")!.addEventListener("click", () => {
    if (confirm("Delete all TraceBug data?")) {
      clearAllSessionsFn();
      clearAllAnnotations();
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
