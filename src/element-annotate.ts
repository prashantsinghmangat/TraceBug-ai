// ── Element Annotate Mode ─────────────────────────────────────────────────
// Click any element on the page to select it, attach structured feedback.
// Shift+click for multi-select. Page freezes during annotation.

import { ElementAnnotation, AnnotationIntent } from "./types";
import { addElementAnnotation, getElementAnnotations } from "./annotation-store";

let _active = false;
let _cleanup: (() => void) | null = null;
let _selectedElements: Map<string, { element: Element; rect: DOMRect; index: number }> = new Map();
let _highlightOverlay: HTMLElement | null = null;
let _selectionOverlays: HTMLElement[] = [];
let _popover: HTMLElement | null = null;
let _counter = 0;
let _onUpdate: (() => void) | null = null;
let _persistentBadges: HTMLElement[] = [];
let _badgeRoot: HTMLElement | null = null;

const HIGHLIGHT_COLOR = "#7B61FF";
const SELECTION_COLOR = "#00E5FF";

// ── Public API ────────────────────────────────────────────────────────────

export function isElementAnnotateActive(): boolean {
  return _active;
}

export function activateElementAnnotateMode(
  root: HTMLElement,
  onUpdate?: () => void
): void {
  if (_active) return;
  _active = true;
  _onUpdate = onUpdate || null;
  _badgeRoot = root;
  _counter = 0;
  _selectedElements.clear();

  // Create hover highlight overlay
  _highlightOverlay = document.createElement("div");
  _highlightOverlay.id = "tracebug-element-highlight";
  _highlightOverlay.dataset.tracebug = "element-highlight";
  _highlightOverlay.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483646;
    border: 2px solid ${HIGHLIGHT_COLOR}; background: rgba(123, 97, 255, 0.08);
    border-radius: 3px; transition: all 0.05s ease; display: none;
  `;
  root.appendChild(_highlightOverlay);

  // Freeze scroll
  const savedOverflowHtml = document.documentElement.style.overflow;
  const savedOverflowBody = document.body.style.overflow;
  const savedScrollY = window.scrollY;
  const savedScrollX = window.scrollX;
  document.documentElement.style.setProperty("overflow", "hidden", "important");
  document.body.style.setProperty("overflow", "hidden", "important");

  const preventScroll = (e: Event) => { e.preventDefault(); };
  window.addEventListener("wheel", preventScroll, { passive: false, capture: true });
  window.addEventListener("touchmove", preventScroll, { passive: false, capture: true });

  // Mousemove — highlight hovered element
  const onMouseMove = (e: MouseEvent) => {
    if (!_active || !_highlightOverlay) return;
    if (_popover) return; // Don't update highlight while popover is open

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || _isOurElement(el)) {
      _highlightOverlay.style.display = "none";
      return;
    }

    const rect = el.getBoundingClientRect();
    _highlightOverlay.style.display = "block";
    _highlightOverlay.style.left = rect.left + "px";
    _highlightOverlay.style.top = rect.top + "px";
    _highlightOverlay.style.width = rect.width + "px";
    _highlightOverlay.style.height = rect.height + "px";
  };

  // Click — select element
  const onClick = (e: MouseEvent) => {
    if (!_active) return;

    // Let clicks on TraceBug UI through (toolbar, popover, etc.)
    const target = e.target as HTMLElement;
    if (target && _isOurElement(target)) return;

    // If popover is open and click is outside it, close it
    if (_popover) {
      _popover.remove();
      _popover = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || _isOurElement(el)) return;

    const selector = _computeSelector(el);

    if (e.shiftKey) {
      // Multi-select: add to selection
      if (!_selectedElements.has(selector)) {
        _counter++;
        _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
        _renderSelectionOverlay(el, _counter, root);
      }
    } else {
      // Single select: clear previous, select new
      _clearSelections();
      _counter++;
      _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
      _renderSelectionOverlay(el, _counter, root);
      // Show feedback popover
      _showFeedbackPopover(el, root);
    }
  };

  // Right-click — show popover for multi-selected elements
  const onContext = (e: MouseEvent) => {
    if (!_active) return;
    if (_selectedElements.size > 0) {
      e.preventDefault();
      const firstEntry = _selectedElements.values().next().value;
      if (firstEntry) {
        _showFeedbackPopover(firstEntry.element as HTMLElement, root);
      }
    }
  };

  document.addEventListener("mousemove", onMouseMove, { capture: true });
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("contextmenu", onContext, { capture: true });

  _cleanup = () => {
    _active = false;
    document.removeEventListener("mousemove", onMouseMove, { capture: true });
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("contextmenu", onContext, { capture: true });
    window.removeEventListener("wheel", preventScroll, { capture: true } as any);
    window.removeEventListener("touchmove", preventScroll, { capture: true } as any);

    // Restore scroll
    document.documentElement.style.overflow = savedOverflowHtml;
    document.body.style.overflow = savedOverflowBody;
    window.scrollTo(savedScrollX, savedScrollY);

    // Clean up overlays
    _highlightOverlay?.remove();
    _highlightOverlay = null;
    _clearSelections();
    _popover?.remove();
    _popover = null;
    _onUpdate = null;

    // Refresh persistent badges so they stay visible after exiting annotate mode
    if (_badgeRoot) _refreshPersistentBadges(_badgeRoot);
  };
}

export function deactivateElementAnnotateMode(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}

// ── Persistent annotation badges on page ──────────────────────────────────

function _refreshPersistentBadges(root: HTMLElement): void {
  // Clear old badges
  _persistentBadges.forEach(b => b.remove());
  _persistentBadges = [];

  const annotations = getElementAnnotations();
  const page = window.location.pathname;
  const pageAnnotations = annotations.filter(a => a.page === page);

  for (let i = 0; i < pageAnnotations.length; i++) {
    const a = pageAnnotations[i];
    const el = document.querySelector(a.selector);
    if (!el) continue;

    const rect = el.getBoundingClientRect();

    // Outline around the annotated element
    const outline = document.createElement("div");
    outline.dataset.tracebug = "annotation-outline";
    outline.style.cssText = `
      position: fixed; z-index: 2147483644; pointer-events: none;
      left: ${rect.left - 2}px; top: ${rect.top - 2}px;
      width: ${rect.width + 4}px; height: ${rect.height + 4}px;
      border: 2px dashed ${_intentColor(a.intent)}80;
      border-radius: 3px;
    `;
    root.appendChild(outline);
    _persistentBadges.push(outline);

    // Numbered badge
    const badge = document.createElement("div");
    badge.dataset.tracebug = "annotation-badge";
    badge.style.cssText = `
      position: fixed; z-index: 2147483645; pointer-events: none;
      left: ${rect.right - 10}px; top: ${rect.top - 10}px;
      width: 20px; height: 20px; border-radius: 50%;
      background: ${_intentColor(a.intent)}; color: #fff;
      font-size: 10px; font-weight: 700; font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    `;
    badge.textContent = String(i + 1);
    root.appendChild(badge);
    _persistentBadges.push(badge);
  }
}

/** Show/refresh annotation badges on the page. Call after page load or annotation changes. */
export function showAnnotationBadges(root: HTMLElement): void {
  _badgeRoot = root;
  _refreshPersistentBadges(root);
}

/** Remove all persistent badges from the page */
export function clearAnnotationBadges(): void {
  _persistentBadges.forEach(b => b.remove());
  _persistentBadges = [];
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _isOurElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.dataset?.tracebug) return true;
  const root = document.getElementById("tracebug-root");
  if (root && root.contains(el)) return true;
  let node: HTMLElement | null = el;
  while (node) {
    if (node.id?.startsWith("tracebug-") || node.id?.startsWith("bt-")) return true;
    const cn = typeof node.className === "string" ? node.className : "";
    if (cn.includes("tracebug-")) return true;
    node = node.parentElement;
  }
  return false;
}

function _computeSelector(el: Element): string {
  if (el.id && !el.id.startsWith("tracebug-") && !el.id.startsWith("bt-")) {
    return `#${CSS.escape(el.id)}`;
  }
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${CSS.escape(testId)}"]`;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    let seg = node.tagName.toLowerCase();
    if (node.id && !node.id.startsWith("tracebug-") && !node.id.startsWith("bt-")) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent) {
      const currentTag = node.tagName;
      const siblings = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
      if (siblings.length > 1) {
        seg += `:nth-child(${Array.from(parent.children).indexOf(node) + 1})`;
      }
    }
    parts.unshift(seg);
    node = parent;
  }
  return parts.join(" > ");
}

function _clearSelections(): void {
  _selectionOverlays.forEach(o => o.remove());
  _selectionOverlays = [];
  _selectedElements.clear();
}

function _renderSelectionOverlay(el: Element, index: number, root: HTMLElement): void {
  const rect = el.getBoundingClientRect();

  // Selection box
  const box = document.createElement("div");
  box.dataset.tracebug = "selection-overlay";
  box.style.cssText = `
    position: fixed; z-index: 2147483645; pointer-events: none;
    left: ${rect.left - 2}px; top: ${rect.top - 2}px;
    width: ${rect.width + 4}px; height: ${rect.height + 4}px;
    border: 2px solid ${SELECTION_COLOR}; border-radius: 3px;
    background: rgba(0, 229, 255, 0.06);
  `;

  // Number badge
  const badge = document.createElement("div");
  badge.dataset.tracebug = "selection-badge";
  badge.style.cssText = `
    position: absolute; top: -10px; right: -10px;
    width: 20px; height: 20px; border-radius: 50%;
    background: ${SELECTION_COLOR}; color: #000;
    font-size: 11px; font-weight: 700; font-family: system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
  `;
  badge.textContent = String(index);
  box.appendChild(badge);

  root.appendChild(box);
  _selectionOverlays.push(box);
}

function _showFeedbackPopover(targetEl: HTMLElement, root: HTMLElement): void {
  if (_popover) {
    _popover.remove();
    _popover = null;
  }

  const rect = targetEl.getBoundingClientRect();
  const popover = document.createElement("div");
  popover.id = "tracebug-annotate-popover";
  popover.dataset.tracebug = "annotate-popover";

  // Position: prefer below the element, fallback to above if near bottom
  let top = rect.bottom + 8;
  let left = Math.max(8, Math.min(rect.left, window.innerWidth - 320));
  if (top + 320 > window.innerHeight) {
    top = Math.max(8, rect.top - 328);
  }

  popover.style.cssText = `
    position: fixed; z-index: 2147483647;
    left: ${left}px; top: ${top}px; width: 300px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 10px;
    padding: 16px; font-family: system-ui, sans-serif; font-size: 13px;
    color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  `;

  const tagText = targetEl.tagName.toLowerCase();
  const previewText = (targetEl.innerText || "").slice(0, 40);
  const selectedCount = _selectedElements.size;

  popover.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#888;margin-bottom:4px">${selectedCount > 1 ? `${selectedCount} elements selected` : `&lt;${tagText}&gt;`}${previewText ? ` "${previewText}"` : ""}</div>
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:#888;margin-bottom:6px">Intent</div>
      <div style="display:flex;gap:4px" id="tracebug-intent-btns">
        <button data-intent="fix" style="${_intentBtnStyle("fix", true)}">Fix</button>
        <button data-intent="redesign" style="${_intentBtnStyle("redesign", false)}">Redesign</button>
        <button data-intent="remove" style="${_intentBtnStyle("remove", false)}">Remove</button>
        <button data-intent="question" style="${_intentBtnStyle("question", false)}">Question</button>
      </div>
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:#888;margin-bottom:6px">Severity</div>
      <select id="tracebug-sev-select" style="width:100%;background:#0f0f1a;border:1px solid #3a3a5e;color:#e0e0e0;padding:6px 8px;border-radius:6px;font-size:12px;font-family:inherit">
        <option value="critical">Critical</option>
        <option value="major">Major</option>
        <option value="minor" selected>Minor</option>
        <option value="info">Info</option>
      </select>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#888;margin-bottom:6px">Comment</div>
      <textarea id="tracebug-ann-comment" rows="3" placeholder="Describe the issue..." style="width:100%;background:#0f0f1a;border:1px solid #3a3a5e;color:#e0e0e0;padding:8px;border-radius:6px;font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="tracebug-ann-cancel" style="background:none;border:1px solid #3a3a5e;color:#888;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">Cancel</button>
      <button id="tracebug-ann-save" style="background:#7B61FF;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">Save</button>
    </div>
  `;

  root.appendChild(popover);
  _popover = popover;

  // Focus comment textarea
  const commentEl = popover.querySelector("#tracebug-ann-comment") as HTMLTextAreaElement;
  setTimeout(() => commentEl?.focus(), 50);

  // Intent buttons
  let selectedIntent: AnnotationIntent = "fix";
  const intentBtns = popover.querySelectorAll("#tracebug-intent-btns button");
  intentBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedIntent = (btn as HTMLElement).dataset.intent as AnnotationIntent;
      intentBtns.forEach(b => {
        const intent = (b as HTMLElement).dataset.intent as AnnotationIntent;
        (b as HTMLElement).style.cssText = _intentBtnStyle(intent, intent === selectedIntent);
      });
    });
  });

  // Cancel
  popover.querySelector("#tracebug-ann-cancel")!.addEventListener("click", (e) => {
    e.stopPropagation();
    popover.remove();
    _popover = null;
    _clearSelections();
  });

  // Save
  popover.querySelector("#tracebug-ann-save")!.addEventListener("click", (e) => {
    e.stopPropagation();
    const severity = (popover.querySelector("#tracebug-sev-select") as HTMLSelectElement).value as ElementAnnotation["severity"];
    const comment = commentEl.value.trim();

    if (!comment) {
      commentEl.style.borderColor = "#ef4444";
      commentEl.focus();
      return;
    }

    // Save annotation for each selected element
    for (const [selector, entry] of _selectedElements) {
      const el = entry.element as HTMLElement;
      const bRect = el.getBoundingClientRect();

      const annotation: ElementAnnotation = {
        id: `ea_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        selector,
        tagName: el.tagName.toLowerCase(),
        innerText: (el.innerText || "").slice(0, 100),
        boundingRect: { x: bRect.x + window.scrollX, y: bRect.y + window.scrollY, width: bRect.width, height: bRect.height },
        intent: selectedIntent,
        severity,
        comment,
        page: window.location.pathname,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };

      addElementAnnotation(annotation);
    }

    popover.remove();
    _popover = null;
    _clearSelections();
    // Show persistent badges for all saved annotations
    _refreshPersistentBadges(root);
    if (_onUpdate) _onUpdate();
  });

  // Prevent clicks inside popover from triggering element selection
  popover.addEventListener("click", (e) => e.stopPropagation());
}

function _intentBtnStyle(intent: AnnotationIntent, active: boolean): string {
  const color = _intentColor(intent);
  if (active) {
    return `background:${color}33;color:${color};border:1px solid ${color};border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;`;
  }
  return `background:#22222244;color:#888;border:1px solid #33333344;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px;font-family:inherit;`;
}

function _intentColor(intent: AnnotationIntent): string {
  switch (intent) {
    case "fix": return "#ef4444";
    case "redesign": return "#7B61FF";
    case "remove": return "#f97316";
    case "question": return "#3b82f6";
  }
}
