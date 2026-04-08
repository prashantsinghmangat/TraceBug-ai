// ── Compact Toolbar ───────────────────────────────────────────────────────
// Minimal vertical rail on the right edge of the screen.
// Replaces the old 48px floating bug button.
// Primary actions as small icons, settings in a pop-out card.

import { activateElementAnnotateMode, deactivateElementAnnotateMode, isElementAnnotateActive } from "./element-annotate";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "./draw-mode";
import { getAnnotationCount, clearAllAnnotations, exportAsJSON, exportAsMarkdown, copyToClipboard, getElementAnnotations, getDrawRegions } from "./annotation-store";
import { captureScreenshot, getScreenshots } from "./screenshot";
import { getAllSessions, clearAllSessions as clearAllSessionsFn } from "./storage";

const TOOLBAR_ID = "tracebug-compact-toolbar";
const SETTINGS_ID = "tracebug-settings-card";

let _isRecording = true;
let _onToggleRecording: (() => void) | null = null;
let _renderPanel: ((panel: HTMLElement) => void) | null = null;
let _panelEl: HTMLElement | null = null;
let _panelOpen = false;
let _annotationViewOpen = false;
let _toolbar: HTMLElement | null = null;

// ── Wiring from SDK ───────────────────────────────────────────────────────

export function setToolbarRecordingState(isRecording: boolean, onToggle: () => void): void {
  _isRecording = isRecording;
  _onToggleRecording = onToggle;
}

export function updateToolbarRecordingState(isRecording: boolean): void {
  _isRecording = isRecording;
  const dot = document.getElementById("tracebug-toolbar-rec-dot");
  if (dot) {
    dot.style.background = isRecording ? "#22c55e" : "#ef4444";
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
  renderAnnotationList: (panel: HTMLElement) => void
): () => void {
  _panelEl = panel;

  const toolbar = document.createElement("div");
  toolbar.id = TOOLBAR_ID;
  toolbar.dataset.tracebug = "compact-toolbar";
  _toolbar = toolbar;

  toolbar.style.cssText = `
    position: fixed; right: 12px; top: 50%; transform: translateY(-50%);
    z-index: 2147483647; display: flex; flex-direction: column;
    align-items: center; gap: 3px; padding: 8px 6px;
    background: #0f0f1aee; border: 1px solid #2a2a3e;
    border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    transition: right 0.3s ease;
  `;

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
    background: ${_isRecording ? "#22c55e" : "#ef4444"};
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
        });
        _updateActiveStates(toolbar);
        showToast("Annotate mode: Click elements to annotate. Shift+click for multi-select.", root);
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
        });
        _updateActiveStates(toolbar);
        showToast("Draw mode: Drag to draw rectangles or ellipses.", root);
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
        showToast(`Screenshot: ${ss.filename}`, root);
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
    background: #7B61FF; color: #fff; font-size: 9px; font-weight: 700;
    font-family: system-ui, sans-serif;
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

  root.appendChild(toolbar);

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
  btn.innerHTML = iconHtml;
  btn.style.cssText = `
    width: 32px; height: 32px; border-radius: 8px; border: none;
    background: transparent; color: #888; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; transition: all 0.15s;
  `;
  btn.addEventListener("mouseenter", () => {
    if (!btn.classList.contains("tb-active")) {
      btn.style.background = "#ffffff11";
      btn.style.color = "#e0e0e0";
    }
  });
  btn.addEventListener("mouseleave", () => {
    if (!btn.classList.contains("tb-active")) {
      btn.style.background = "transparent";
      btn.style.color = "#888";
    }
  });
  btn.addEventListener("click", onClick);
  return btn;
}

function _divider(): HTMLElement {
  const d = document.createElement("div");
  d.dataset.tracebug = "toolbar-divider";
  d.style.cssText = "width:20px;height:1px;background:#2a2a3e;margin:2px 0";
  return d;
}

function _togglePanel(
  panel: HTMLElement,
  toolbar: HTMLElement,
  showToast: (msg: string, root: HTMLElement) => void
): void {
  _panelOpen = !_panelOpen;
  panel.style.right = _panelOpen ? "0" : "-480px";
  toolbar.style.right = _panelOpen ? "482px" : "12px";

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
    annotateBtn.style.background = active ? "#7B61FF33" : "transparent";
    annotateBtn.style.color = active ? "#7B61FF" : "#888";
  }
  if (drawBtn) {
    const active = isDrawModeActive();
    drawBtn.classList.toggle("tb-active", active);
    drawBtn.style.background = active ? "#7B61FF33" : "transparent";
    drawBtn.style.color = active ? "#7B61FF" : "#888";
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
    width: 220px; background: #1a1a2e; border: 1px solid #3a3a5e;
    border-radius: 12px; padding: 16px;
    font-family: system-ui, sans-serif; font-size: 13px; color: #e0e0e0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;

  const sessions = getAllSessions();
  const errorCount = sessions.filter(s => s.errorMessage).length;

  card.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      Settings
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#aaa">Recording</span>
        <button id="tracebug-settings-rec" style="
          background:${_isRecording ? "#22c55e22" : "#ef444422"};
          color:${_isRecording ? "#22c55e" : "#ef4444"};
          border:1px solid ${_isRecording ? "#22c55e44" : "#ef444444"};
          border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;font-family:inherit
        ">${_isRecording ? "Pause" : "Resume"}</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#aaa">Sessions</span>
        <span style="font-size:12px;color:#888">${sessions.length} (${errorCount} errors)</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#aaa">Annotations</span>
        <span style="font-size:12px;color:#888">${getAnnotationCount()}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:#aaa">Screenshots</span>
        <span style="font-size:12px;color:#888">${getScreenshots().length}</span>
      </div>
      <div style="border-top:1px solid #2a2a3e;padding-top:10px;display:flex;gap:6px">
        <button id="tracebug-settings-clear-ann" style="flex:1;background:#f9731622;color:#f97316;border:1px solid #f9731644;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear Annotations</button>
        <button id="tracebug-settings-clear-all" style="flex:1;background:#ef444422;color:#ef4444;border:1px solid #ef444444;border-radius:6px;padding:4px;cursor:pointer;font-size:10px;font-family:inherit">Clear All Data</button>
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

function _logoSvg(): string {
  return `<svg width="18" height="18" viewBox="0 0 96 96" fill="none"><defs><linearGradient id="tb-cr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#9B7DFF"/><stop offset="50%" stop-color="#7B61FF"/><stop offset="100%" stop-color="#00E5FF"/></linearGradient></defs><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#tb-cr)" opacity="0.18"/><path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#tb-cr)" stroke-width="2.5"/><circle cx="48" cy="41" r="5" fill="url(#tb-cr)"/><circle cx="48" cy="41" r="2.2" fill="white"/></svg>`;
}
