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
import { elementEvidence, isRendered, isTraceBugUi, isVisuallyHidden } from "./evidence";

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
    if (!isRendered(el) || clippedByAncestor(el) || isVisuallyHidden(el)) continue;
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

/** The element under a point, or null when the point is outside the window (elementFromPoint can't see it). */
function hitAt(x: number, y: number): Element | null {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null;
  return document.elementFromPoint(x, y);
}

/**
 * A control is only reported when another control really takes its clicks:
 * the overlap covers at least a quarter of it AND, at its own centre, the
 * topmost element belongs to the other control. A small overlap at an edge,
 * a stacked card link that still receives clicks, or a skip link parked under
 * the header is not a bug. Only overlaps inside the window can be checked.
 */
function overlapFindings(): Issue[] {
  const out: Issue[] = [];
  const controls = Array.from(document.querySelectorAll(INTERACTIVE))
    .filter((el) => !isTraceBugUi(el) && isRendered(el) && !isVisuallyHidden(el))
    .slice(0, 400);
  const rects = controls.map((el) => el.getBoundingClientRect());
  const MIN = 8;
  const reported = new Set<Element>();
  for (let i = 0; i < controls.length && out.length < MAX_PER_RULE; i++) {
    for (let j = i + 1; j < controls.length && out.length < MAX_PER_RULE; j++) {
      const a = controls[i], b = controls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = rects[i], rb = rects[j];
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w < MIN || h < MIN) continue;
      for (const [covered, coveredRect, other] of [[a, ra, b], [b, rb, a]] as const) {
        if (reported.has(covered)) continue;
        if (w * h < 0.25 * coveredRect.width * coveredRect.height) continue;
        const hit = hitAt(coveredRect.left + coveredRect.width / 2, coveredRect.top + coveredRect.height / 2);
        if (!hit || covered === hit || covered.contains(hit) || !(other === hit || other.contains(hit))) continue;
        reported.add(covered);
        out.push(elementFinding(covered, "ui/overlap", "serious", "A control is covered and can't be clicked",
          `Another clickable element (${buildSelector(other)}) sits on top of this one: clicking its centre activates the other element. They overlap by ${Math.round(w)}×${Math.round(h)}px.`,
          { overlapWidth: Math.round(w), overlapHeight: Math.round(h) }));
        break;
      }
    }
  }
  return out;
}

const CONTROL_TEXT = "a, button, label, input, select, textarea, th, td, summary, [role=button], [role=tab], [role=menuitem], h1, h2, h3, h4, h5, h6";

function clippedTextFindings(): Issue[] {
  const out: Issue[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (out.length >= MAX_PER_RULE) break;
    if (isTraceBugUi(el)) continue;
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 2);
    if (!hasOwnText) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis") continue; // truncation on purpose
    if (cs.webkitLineClamp && cs.webkitLineClamp !== "none") continue; // line clamp: on purpose
    const he = el as HTMLElement;
    // A few px of overflow is font metrics, not a cut word.
    const clipsX = (cs.overflowX === "hidden" || cs.overflowX === "clip") && he.scrollWidth > he.clientWidth + 4;
    // Vertical clipping of a paragraph is usually a teaser on purpose; for a label,
    // button, link or heading a cut-off line is a bug.
    const clipsY = (cs.overflowY === "hidden" || cs.overflowY === "clip") && he.scrollHeight > he.clientHeight + 4 && el.matches(CONTROL_TEXT);
    if (!clipsX && !clipsY) continue;
    if (!isRendered(el) || isVisuallyHidden(el)) continue; // sr-only text, skip links, image replacement
    if (he.clientWidth < 8 || he.clientHeight < 8) continue;
    out.push(elementFinding(el, "ui/text-clipped", "moderate", "Text is cut off",
      `The text needs ${clipsX ? he.scrollWidth + "px of width" : he.scrollHeight + "px of height"} but the box is ${clipsX ? he.clientWidth : he.clientHeight}px with overflow hidden, and there is no ellipsis to show it was cut.`,
      { needed: clipsX ? he.scrollWidth : he.scrollHeight, available: clipsX ? he.clientWidth : he.clientHeight }));
  }
  return out;
}

/** Style rules that set a height or aspect-ratio, flattened once per run. null = some stylesheet
 *  could not be read (another origin), so "no rule sets a height" can't be proven. */
function heightRules(): CSSStyleRule[] | null {
  const out: CSSStyleRule[] = [];
  let unreadable = false;
  const visit = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      const g = rule as CSSGroupingRule;
      if (g.cssRules && !(rule as CSSStyleRule).selectorText) { visit(g.cssRules); continue; }
      const st = (rule as CSSStyleRule).style;
      if (!st) continue;
      const h = st.getPropertyValue("height").trim(), ar = st.getPropertyValue("aspect-ratio").trim();
      if ((h && h !== "auto") || (ar && ar !== "auto")) out.push(rule as CSSStyleRule);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { visit(sheet.cssRules); } catch { unreadable = true; }
  }
  return unreadable ? null : out;
}

function imageFindings(): Issue[] {
  const out: Issue[] = [];
  let noDims = 0, broken = 0;
  let sized: CSSStyleRule[] | null | undefined;
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
    // CSS that fixes both width and height (e.g. w-12 h-12, object-fit) reserves the space too. The
    // tell: the drawn shape differs from the file's shape. Only a box that follows the file's own
    // proportions moves the page when it loads.
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const drawn = r.width / r.height, natural = img.naturalWidth / img.naturalHeight;
      if (Math.abs(drawn - natural) / natural > 0.02) continue;
    }
    // Inside a box with a fixed height or aspect-ratio, the image can't push content down.
    const parent = img.parentElement;
    if (parent) {
      const pcs = getComputedStyle(parent);
      if (pcs.aspectRatio !== "auto" || (pcs.position === "relative" && cs.position === "absolute")) continue;
    }
    // Does any stylesheet give it a height? If a sheet can't be read we can't prove it doesn't: skip.
    if (sized === undefined) sized = heightRules();
    if (sized === null) continue;
    if (sized.some((rule) => { try { return img.matches(rule.selectorText); } catch { return false; } })) continue;
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
