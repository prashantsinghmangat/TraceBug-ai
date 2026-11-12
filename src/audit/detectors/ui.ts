// ── UI / layout checks ─────────────────────────────────────────────────────
// docs/audit-quality/implementation-plan.md §4. Deterministic, read-only, at
// the current viewport only — no design judgement:
//
//   ui/horizontal-overflow   the page is wider than the viewport (sideways scroll)
//   ui/off-screen            elements that cause it (stick out past the right edge)
//   ui/overlap               two visible controls overlap (one can cover the other)
//   ui/text-clipped          text cut off by overflow:hidden with no ellipsis
//   ui/img-no-dimensions     an image with no width/height (layout shift while loading)
//   ui/broken-image          an image that failed to load
//
// Tap-target size is left to axe's `target-size` rule (WCAG 2.2) so it is
// reported once. Needs real layout: covered by e2e, not jsdom.

import type { Issue, IssueSeverity } from "../../types";
import { buildSelector, makeIssueId } from "../../scanner/helpers";
import { elementEvidence, isRendered, isTraceBugUi } from "./evidence";

const MAX_PER_RULE = 15;
const INTERACTIVE = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [tabindex]:not([tabindex='-1'])";

function uiFinding(ruleId: string, severity: IssueSeverity, title: string, description: string, extra: Partial<Issue> = {}): Issue {
  return {
    id: makeIssueId("audit-ui"),
    detector: "audit-ui",
    category: "ui",
    ruleId,
    severity,
    title,
    description,
    page: location.href,
    detectedAt: Date.now(),
    ...extra,
  };
}

const elementFinding = (el: Element, ruleId: string, severity: IssueSeverity, title: string, description: string, metrics?: Record<string, number | string>) =>
  uiFinding(ruleId, severity, title, description, { selector: buildSelector(el), evidence: elementEvidence(el, metrics ? { metrics } : undefined) });

/** An ancestor clips horizontally, so sticking out past it is invisible, not overflow. */
function clippedByAncestor(el: Element): boolean {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const ox = getComputedStyle(p).overflowX;
    if (ox === "hidden" || ox === "clip" || ox === "auto" || ox === "scroll") return true;
  }
  return false;
}

function overflowFindings(): Issue[] {
  const out: Issue[] = [];
  const vw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  if (sw <= vw + 1) return out;

  out.push(uiFinding("ui/horizontal-overflow", "serious", `Page scrolls sideways by ${sw - vw}px`,
    `At ${vw}px wide the page is ${sw}px wide, so it scrolls horizontally. Usually one element with a fixed width or a long unbroken string causes it.`,
    { evidence: { metrics: { viewportWidth: vw, pageWidth: sw } } }));

  // The culprits: the outermost elements that stick out (not every descendant of one).
  const culprits: Element[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (culprits.length >= MAX_PER_RULE) break;
    if (isTraceBugUi(el) || culprits.some((c) => c.contains(el))) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 || r.width === 0) continue;
    if (!isRendered(el) || clippedByAncestor(el)) continue;
    if (getComputedStyle(el).position === "fixed") continue;
    culprits.push(el);
  }
  for (const el of culprits) {
    const r = el.getBoundingClientRect();
    out.push(elementFinding(el, "ui/off-screen", "moderate", `Element extends ${Math.round(r.right - vw)}px past the right edge`,
      `This ${el.tagName.toLowerCase()} ends at ${Math.round(r.right)}px; the viewport is ${vw}px. It is a likely cause of the sideways scroll.`,
      { right: Math.round(r.right), viewportWidth: vw }));
  }
  return out;
}

function overlapFindings(): Issue[] {
  const out: Issue[] = [];
  const controls = Array.from(document.querySelectorAll(INTERACTIVE))
    .filter((el) => !isTraceBugUi(el) && isRendered(el))
    .slice(0, 400);
  const rects = controls.map((el) => el.getBoundingClientRect());
  const MIN = 4; // px of overlap in both directions before it counts
  for (let i = 0; i < controls.length && out.length < MAX_PER_RULE; i++) {
    for (let j = i + 1; j < controls.length && out.length < MAX_PER_RULE; j++) {
      const a = controls[i], b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rects[i], rb = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w < MIN || h < MIN) continue;
      // Which one is on top at the centre of the overlap?
      const cx = Math.max(ra.left, rb.left) + w / 2, cy = Math.max(ra.top, rb.top) + h / 2;
      const top = document.elementFromPoint(cx, cy);
      const covered = top && (a === top || a.contains(top)) ? b : a;
      out.push(elementFinding(covered, "ui/overlap", "moderate", "Control is covered by another control",
        `Two clickable elements overlap by ${Math.round(w)}×${Math.round(h)}px. Clicks in that area reach only the one on top (${buildSelector(covered === a ? b : a)}).`,
        { overlapWidth: Math.round(w), overlapHeight: Math.round(h) }));
    }
  }
  return out;
}

function clippedTextFindings(): Issue[] {
  const out: Issue[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (out.length >= MAX_PER_RULE) break;
    if (isTraceBugUi(el)) continue;
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 2);
    if (!hasOwnText) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") continue; // truncation on purpose
    const he = el as HTMLElement;
    const clipsX = (cs.overflowX === "hidden" || cs.overflowX === "clip") && he.scrollWidth > he.clientWidth + 1;
    const clipsY = (cs.overflowY === "hidden" || cs.overflowY === "clip") && he.scrollHeight > he.clientHeight + 2 && cs.webkitLineClamp === "none";
    if (!clipsX && !clipsY) continue;
    if (!isRendered(el)) continue;
    out.push(elementFinding(el, "ui/text-clipped", "moderate", "Text is cut off",
      `The text needs ${clipsX ? he.scrollWidth + "px of width" : he.scrollHeight + "px of height"} but the box is ${clipsX ? he.clientWidth : he.clientHeight}px with overflow hidden, and there is no ellipsis to show it was cut.`,
      { needed: clipsX ? he.scrollWidth : he.scrollHeight, available: clipsX ? he.clientWidth : he.clientHeight }));
  }
  return out;
}

function imageFindings(): Issue[] {
  const out: Issue[] = [];
  let noDims = 0, broken = 0;
  for (const img of Array.from(document.images)) {
    if (isTraceBugUi(img)) continue;
    const src = img.currentSrc || img.src;
    if (img.complete && img.naturalWidth === 0 && src && broken < MAX_PER_RULE) {
      broken++;
      out.push(uiFinding("ui/broken-image", "moderate", "Image failed to load",
        "The browser tried to load this image and got an error or a non-image response.",
        { selector: buildSelector(img), url: src, evidence: elementEvidence(img) }));
      continue;
    }
    if (noDims >= MAX_PER_RULE) continue;
    const hasAttrs = img.hasAttribute("width") && img.hasAttribute("height");
    const cs = getComputedStyle(img);
    const sizedByCss = cs.aspectRatio !== "auto" || (img.style.width !== "" && img.style.height !== "");
    const r = img.getBoundingClientRect();
    if (hasAttrs || sizedByCss || r.width < 32 || r.height < 32 || !isRendered(img)) continue;
    noDims++;
    out.push(elementFinding(img, "ui/img-no-dimensions", "minor", "Image has no width and height",
      "Without width and height (or CSS aspect-ratio), the page reserves no space for the image and content jumps when it loads (layout shift).",
      { renderedWidth: Math.round(r.width), renderedHeight: Math.round(r.height) }));
  }
  return out;
}

export function detectUiFindings(): Issue[] {
  const runs = [overflowFindings, overlapFindings, clippedTextFindings, imageFindings];
  const out: Issue[] = [];
  for (const run of runs) {
    try { out.push(...run()); } catch (err) { console.warn("[TraceBug] UI check failed:", err); }
  }
  return out;
}
