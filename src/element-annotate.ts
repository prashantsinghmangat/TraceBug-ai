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
let _modeBanner: HTMLElement | null = null;
let _counter = 0;
let _onUpdate: (() => void) | null = null;
let _onDeactivate: (() => void) | null = null;
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
  onUpdate?: () => void,
  onDeactivate?: () => void
): void {
  if (_active) return;
  _active = true;
  _onUpdate = onUpdate || null;
  _onDeactivate = onDeactivate || null;
  _badgeRoot = root;
  _counter = 0;
  _selectedElements.clear();

  // ── Mode banner — persistent indicator at top ──────────────────────
  _modeBanner = document.createElement("div");
  _modeBanner.id = "tracebug-annotate-banner";
  _modeBanner.dataset.tracebug = "annotate-banner";
  _modeBanner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    background: linear-gradient(90deg, var(--tb-gradient-start, #7B61FF), var(--tb-gradient-end, #5B3FDF)); color: #fff;
    padding: 10px 20px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 13px; display: flex; align-items: center; justify-content: space-between;
    box-shadow: 0 2px 12px rgba(123, 97, 255, 0.3);
    animation: tracebug-slide-down 0.2s ease;
  `;
  _modeBanner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:8px;height:8px;border-radius:50%;background:#fff;animation:tracebug-pulse 1.5s infinite"></div>
      <span style="font-weight:600">Annotate Mode</span>
      <span style="opacity:0.7;font-size:12px">Click an element to annotate it. Hold Shift to select multiple.</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="opacity:0.5;font-size:11px">Esc to exit</span>
      <button id="tracebug-annotate-exit" data-tracebug="annotate-exit" style="
        background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3);
        color: #fff; padding: 5px 14px; border-radius: 6px; cursor: pointer;
        font-size: 12px; font-family: inherit; font-weight: 500;
      ">Exit</button>
    </div>
  `;
  // Add keyframe animations
  const styleTag = document.createElement("style");
  styleTag.id = "tracebug-annotate-styles";
  styleTag.dataset.tracebug = "annotate-styles";
  styleTag.textContent = `
    @keyframes tracebug-slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
    @keyframes tracebug-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  `;
  document.head.appendChild(styleTag);
  root.appendChild(_modeBanner);

  // Exit button in banner
  _modeBanner.querySelector("#tracebug-annotate-exit")!.addEventListener("click", (e) => {
    e.stopPropagation();
    deactivateElementAnnotateMode();
  });

  // ── Hover highlight overlay ────────────────────────────────────────
  _highlightOverlay = document.createElement("div");
  _highlightOverlay.id = "tracebug-element-highlight";
  _highlightOverlay.dataset.tracebug = "element-highlight";
  _highlightOverlay.style.cssText = `
    position: fixed; pointer-events: none; z-index: 2147483646;
    border: 2px solid ${HIGHLIGHT_COLOR}; background: rgba(123, 97, 255, 0.08);
    border-radius: 3px; transition: all 0.08s ease; display: none;
  `;
  root.appendChild(_highlightOverlay);

  // ── Freeze scroll ──────────────────────────────────────────────────
  const savedOverflowHtml = document.documentElement.style.overflow;
  const savedOverflowBody = document.body.style.overflow;
  const savedScrollY = window.scrollY;
  const savedScrollX = window.scrollX;
  document.documentElement.style.setProperty("overflow", "hidden", "important");
  document.body.style.setProperty("overflow", "hidden", "important");

  const preventScroll = (e: Event) => { e.preventDefault(); };
  window.addEventListener("wheel", preventScroll, { passive: false, capture: true });
  window.addEventListener("touchmove", preventScroll, { passive: false, capture: true });

  // ── Mousemove — highlight hovered element ──────────────────────────
  const onMouseMove = (e: MouseEvent) => {
    if (!_active || !_highlightOverlay) return;
    if (_popover) return;

    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!el || _isOurElement(el)) {
      _highlightOverlay.style.display = "none";
      document.body.style.cursor = "default";
      return;
    }

    document.body.style.cursor = "crosshair";
    const rect = el.getBoundingClientRect();
    _highlightOverlay.style.display = "block";
    _highlightOverlay.style.left = rect.left + "px";
    _highlightOverlay.style.top = rect.top + "px";
    _highlightOverlay.style.width = rect.width + "px";
    _highlightOverlay.style.height = rect.height + "px";
  };

  // ── Click — select element ─────────────────────────────────────────
  const onClick = (e: MouseEvent) => {
    if (!_active) return;

    const target = e.target as HTMLElement;
    if (target && _isOurElement(target)) return;

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
      if (!_selectedElements.has(selector)) {
        _counter++;
        _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
        _renderSelectionOverlay(el, _counter, root);
        _updateBannerCount();
      }
    } else {
      _clearSelections();
      _counter++;
      _selectedElements.set(selector, { element: el, rect: el.getBoundingClientRect(), index: _counter });
      _renderSelectionOverlay(el, _counter, root);
      _showFeedbackPopover(el, root);
    }
  };

  // ── Right-click — show popover for multi-selected elements ─────────
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

  // ── Escape key — exit mode ─────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (_popover) {
        _popover.remove();
        _popover = null;
        _clearSelections();
      } else {
        deactivateElementAnnotateMode();
      }
    }
  };

  document.addEventListener("mousemove", onMouseMove, { capture: true });
  document.addEventListener("click", onClick, { capture: true });
  document.addEventListener("contextmenu", onContext, { capture: true });
  document.addEventListener("keydown", onKeyDown, { capture: true });

  _cleanup = () => {
    _active = false;
    document.removeEventListener("mousemove", onMouseMove, { capture: true });
    document.removeEventListener("click", onClick, { capture: true });
    document.removeEventListener("contextmenu", onContext, { capture: true });
    document.removeEventListener("keydown", onKeyDown, { capture: true });
    window.removeEventListener("wheel", preventScroll, { capture: true } as any);
    window.removeEventListener("touchmove", preventScroll, { capture: true } as any);

    // Restore scroll & cursor
    document.documentElement.style.overflow = savedOverflowHtml;
    document.body.style.overflow = savedOverflowBody;
    document.body.style.cursor = "";
    window.scrollTo(savedScrollX, savedScrollY);

    // Clean up UI
    _highlightOverlay?.remove();
    _highlightOverlay = null;
    _modeBanner?.remove();
    _modeBanner = null;
    document.getElementById("tracebug-annotate-styles")?.remove();
    _clearSelections();
    _popover?.remove();
    _popover = null;
    _onUpdate = null;

    // Refresh persistent badges
    if (_badgeRoot) _refreshPersistentBadges(_badgeRoot);
    if (_onDeactivate) _onDeactivate();
    _onDeactivate = null;
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

    // Numbered badge — clickable to show annotation details
    const badge = document.createElement("div");
    badge.dataset.tracebug = "annotation-badge";
    badge.title = `Click to view: ${a.intent.toUpperCase()} — ${a.comment.slice(0, 60)}`;
    badge.style.cssText = `
      position: fixed; z-index: 2147483645; pointer-events: auto; cursor: pointer;
      left: ${rect.right - 10}px; top: ${rect.top - 10}px;
      width: 20px; height: 20px; border-radius: 50%;
      background: ${_intentColor(a.intent)}; color: #fff;
      font-size: 10px; font-weight: 700; font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 6px rgba(0,0,0,0.4);
      transition: transform 0.15s;
    `;
    badge.textContent = String(i + 1);
    badge.addEventListener("mouseenter", () => { badge.style.transform = "scale(1.2)"; });
    badge.addEventListener("mouseleave", () => { badge.style.transform = "scale(1)"; });
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      _showBadgePopover(a, badge, root);
    });
    root.appendChild(badge);
    _persistentBadges.push(badge);
  }
}

export function showAnnotationBadges(root: HTMLElement): void {
  _badgeRoot = root;
  _refreshPersistentBadges(root);
}

export function clearAnnotationBadges(): void {
  _persistentBadges.forEach(b => b.remove());
  _persistentBadges = [];
}

// ── Badge popover (shows annotation details when badge clicked) ──────────

function _showBadgePopover(a: ElementAnnotation, badge: HTMLElement, root: HTMLElement): void {
  // Remove any existing popover
  const existing = document.getElementById("tracebug-badge-popover");
  if (existing) existing.remove();

  const intentColor = _intentColor(a.intent);
  const sevColor = a.severity === "critical" ? "#ef4444" : a.severity === "major" ? "#f97316" : a.severity === "minor" ? "#3b82f6" : "#888";
  const badgeRect = badge.getBoundingClientRect();

  const popover = document.createElement("div");
  popover.id = "tracebug-badge-popover";
  popover.dataset.tracebug = "badge-popover";

  // Position below the badge, or above if near bottom
  const posBelow = badgeRect.bottom + 8;
  const posAbove = badgeRect.top - 8;
  const fitsBelow = posBelow + 180 < window.innerHeight;

  popover.style.cssText = `
    position: fixed; z-index: 2147483647; pointer-events: auto;
    left: ${Math.max(8, Math.min(badgeRect.left - 120, window.innerWidth - 280))}px;
    ${fitsBelow ? `top: ${posBelow}px` : `bottom: ${window.innerHeight - posAbove}px`};
    width: 270px;
    background: var(--tb-bg-secondary, #1a1a2e);
    border: 1px solid var(--tb-border-hover, #3a3a5e);
    border-radius: var(--tb-radius-lg, 12px);
    padding: 14px;
    font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif);
    font-size: 12px;
    color: var(--tb-text-primary, #e0e0e0);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: tracebug-tooltip-in 0.15s ease;
  `;

  // Build safe text content using DOM APIs instead of innerHTML for user data
  const intentLabel = a.intent.charAt(0).toUpperCase() + a.intent.slice(1);
  const sevLabel = a.severity.charAt(0).toUpperCase() + a.severity.slice(1);

  // Header row
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:10px";

  const intentBadge = document.createElement("span");
  intentBadge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:4px;background:${intentColor}22;color:${intentColor};border:1px solid ${intentColor}44;font-weight:600;text-transform:uppercase`;
  intentBadge.textContent = intentLabel;

  const sevBadge = document.createElement("span");
  sevBadge.style.cssText = `font-size:10px;padding:2px 8px;border-radius:4px;background:${sevColor}15;color:${sevColor};font-weight:500`;
  sevBadge.textContent = sevLabel;

  const closeBtn = document.createElement("button");
  closeBtn.dataset.action = "close";
  closeBtn.style.cssText = "margin-left:auto;background:none;border:none;color:var(--tb-text-muted, #666);cursor:pointer;font-size:14px;padding:0 4px";
  closeBtn.textContent = "\u2715";
  closeBtn.title = "Close";

  header.append(intentBadge, sevBadge, closeBtn);

  // Comment
  const commentEl = document.createElement("div");
  commentEl.style.cssText = "font-size:13px;color:var(--tb-text-primary, #e0e0e0);line-height:1.5;word-break:break-word";
  commentEl.textContent = a.comment;

  popover.append(header, commentEl);

  root.appendChild(popover);

  // Close button
  popover.querySelector('[data-action="close"]')!.addEventListener("click", () => popover.remove());

  // Close on click outside
  const closeHandler = (ev: MouseEvent) => {
    if (!popover.contains(ev.target as Node) && ev.target !== badge) {
      popover.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 10);

  // Close on Escape
  const escHandler = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") { popover.remove(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _updateBannerCount(): void {
  if (!_modeBanner) return;
  const count = _selectedElements.size;
  if (count > 1) {
    const textEl = _modeBanner.querySelector("span:nth-child(3)") as HTMLElement;
    if (textEl) textEl.textContent = `${count} elements selected. Right-click to add feedback.`;
  }
}

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

  const box = document.createElement("div");
  box.dataset.tracebug = "selection-overlay";
  box.style.cssText = `
    position: fixed; z-index: 2147483645; pointer-events: none;
    left: ${rect.left - 2}px; top: ${rect.top - 2}px;
    width: ${rect.width + 4}px; height: ${rect.height + 4}px;
    border: 2px solid ${SELECTION_COLOR}; border-radius: 3px;
    background: rgba(0, 229, 255, 0.06);
    animation: tracebug-slide-down 0.15s ease;
  `;

  const badge = document.createElement("div");
  badge.dataset.tracebug = "selection-badge";
  badge.style.cssText = `
    position: absolute; top: -10px; right: -10px;
    width: 22px; height: 22px; border-radius: 50%;
    background: ${SELECTION_COLOR}; color: #000;
    font-size: 11px; font-weight: 700; font-family: system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
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

  // Smart positioning: below element, fallback above, then center
  let top = rect.bottom + 10;
  let left = Math.max(12, Math.min(rect.left, window.innerWidth - 330));
  if (top + 360 > window.innerHeight) {
    top = Math.max(50, rect.top - 370);
  }
  if (top < 50) top = 50; // Don't overlap banner

  popover.style.cssText = `
    position: fixed; z-index: 2147483647;
    left: ${left}px; top: ${top}px; width: 310px;
    background: #1a1a2e; border: 1px solid #3a3a5e; border-radius: 12px;
    padding: 18px; font-family: var(--tb-font-family, system-ui, -apple-system, sans-serif); font-size: 13px;
    color: #e0e0e0; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    animation: tracebug-slide-down 0.15s ease;
  `;

  const tagText = targetEl.tagName.toLowerCase();
  const previewText = (targetEl.innerText || "").slice(0, 40);
  const selectedCount = _selectedElements.size;
  const selectorText = _computeSelector(targetEl);

  popover.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px">
        ${selectedCount > 1 ? `${selectedCount} elements selected` : "Annotate Element"}
      </div>
      <div style="font-size:11px;color:var(--tb-text-muted, #666);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${selectorText}">
        &lt;${tagText}&gt;${previewText ? ` "${previewText}"` : ""}
      </div>
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#999;margin-bottom:6px;font-weight:500">What needs to happen?</div>
      <div style="display:flex;gap:5px" id="tracebug-intent-btns">
        <button data-intent="fix" title="This element has a bug that needs fixing" style="${_intentBtnStyle("fix", true)}">Bug Fix</button>
        <button data-intent="redesign" title="This element needs a design or UX change" style="${_intentBtnStyle("redesign", false)}">Redesign</button>
        <button data-intent="remove" title="This element should be removed" style="${_intentBtnStyle("remove", false)}">Remove</button>
        <button data-intent="question" title="I have a question about this element" style="${_intentBtnStyle("question", false)}">Question</button>
      </div>
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:#999;margin-bottom:6px;font-weight:500">Priority</div>
      <select id="tracebug-sev-select" style="width:100%;background:#0f0f1a;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-primary, #e0e0e0);padding:8px 10px;border-radius:var(--tb-radius-md, 8px);font-size:13px;font-family:inherit;cursor:pointer">
        <option value="critical">Critical - Blocks users</option>
        <option value="major">Major - Significant issue</option>
        <option value="minor" selected>Minor - Small improvement</option>
        <option value="info">Info - Just a note</option>
      </select>
    </div>

    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:#999;font-weight:500">Describe the issue</span>
        <span id="tracebug-char-count" style="font-size:10px;color:#555">0 / 500</span>
      </div>
      <textarea id="tracebug-ann-comment" rows="4" maxlength="500" placeholder="What's wrong? What should change?&#10;e.g. 'Button text is misleading — should say Save instead of Submit'" style="width:100%;background:#0f0f1a;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-primary, #e0e0e0);padding:10px;border-radius:var(--tb-radius-md, 8px);font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;line-height:1.4"></textarea>
      <div id="tracebug-comment-error" style="font-size:11px;color:#ef4444;margin-top:4px;display:none">Please describe the issue before saving.</div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="tracebug-ann-cancel" style="background:#ffffff08;border:1px solid var(--tb-border-hover, #3a3a5e);color:var(--tb-text-secondary, #aaa);padding:8px 16px;border-radius:var(--tb-radius-md, 8px);cursor:pointer;font-size:12px;font-family:inherit">Cancel</button>
      <button id="tracebug-ann-save" style="background:#7B61FF;border:none;color:#fff;padding:8px 18px;border-radius:var(--tb-radius-md, 8px);cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;box-shadow:0 2px 8px rgba(123,97,255,0.3)">Save Annotation</button>
    </div>
  `;

  root.appendChild(popover);
  _popover = popover;

  // Focus & character count
  const commentEl = popover.querySelector("#tracebug-ann-comment") as HTMLTextAreaElement;
  const charCount = popover.querySelector("#tracebug-char-count") as HTMLElement;
  const errorEl = popover.querySelector("#tracebug-comment-error") as HTMLElement;
  setTimeout(() => commentEl?.focus(), 50);

  commentEl.addEventListener("input", () => {
    charCount.textContent = `${commentEl.value.length} / 500`;
    if (commentEl.value.trim()) {
      commentEl.style.borderColor = "#3a3a5e";
      errorEl.style.display = "none";
    }
  });

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
      errorEl.style.display = "block";
      commentEl.focus();
      return;
    }

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
    _refreshPersistentBadges(root);
    if (_onUpdate) _onUpdate();
  });

  // Prevent clicks inside popover from triggering element selection
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());
}

function _intentBtnStyle(intent: AnnotationIntent, active: boolean): string {
  const color = _intentColor(intent);
  if (active) {
    return `background:${color}33;color:${color};border:1px solid ${color};border-radius:var(--tb-radius-md, 8px);padding:6px 11px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit;transition:all 0.15s;`;
  }
  return `background:#ffffff06;color:#999;border:1px solid #33333366;border-radius:var(--tb-radius-md, 8px);padding:6px 11px;cursor:pointer;font-size:11px;font-family:inherit;transition:all 0.15s;`;
}

function _intentColor(intent: AnnotationIntent): string {
  switch (intent) {
    case "fix": return "#ef4444";
    case "redesign": return "#7B61FF";
    case "remove": return "#f97316";
    case "question": return "#3b82f6";
  }
}
