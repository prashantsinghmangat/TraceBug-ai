// ── Keyboard pass (Accessibility Audit, plan §4a) ──────────────────────────
// A small, read-only addition to axe: the Tab order is read from the DOM and
// the page's own stylesheets. Nothing is focused, clicked or typed.
//
//   kbd/positive-tabindex       tabindex > 0 reorders Tab away from reading order
//   kbd/focusable-invisible     in the Tab order but drawn as nothing (0×0 or
//                               opacity 0): focus lands somewhere the user can't see
//   kbd/focus-outline-removed   a :focus rule removes the outline and draws no
//                               other indicator (box-shadow / border / background)
//   kbd/focus-obscured          a fixed/sticky header or bar with no matching
//                               scroll-padding can cover focused elements (2.4.11)
//
// Elements moved off-screen are NOT flagged: that is how skip links work.
// Stylesheets from another origin cannot be read; the limitation says so.

import type { Issue } from "../../types";
import { buildSelector, makeIssueId } from "../../scanner/helpers";
import { elementEvidence, isTraceBugUi } from "./evidence";

const MAX_PER_RULE = 20;

const TABBABLE = "a[href], area[href], button, input:not([type=hidden]), select, textarea, iframe, summary, [tabindex], [contenteditable=''], [contenteditable='true']";

function kbdFinding(ruleId: string, severity: Issue["severity"], title: string, description: string, el: Element | null, extra: Partial<Issue> = {}): Issue {
  return {
    id: makeIssueId("audit-keyboard"),
    detector: "audit-keyboard",
    category: "accessibility",
    ruleId,
    severity,
    title,
    description,
    page: location.href,
    detectedAt: Date.now(),
    ...(el ? { selector: buildSelector(el), evidence: elementEvidence(el) } : {}),
    ...extra,
  };
}

/** In the Tab order: focusable, not disabled, not tabindex=-1, not inside inert/hidden subtrees. */
function inTabOrder(el: Element): boolean {
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.closest("[inert], [hidden]")) return false;
  if (getComputedStyle(el).visibility === "hidden") return false; // inherited, so this covers ancestors
  return isRendered(el);
}

/** False when the element or any ancestor is display:none (e.g. a `md:hidden` mobile menu on a
 *  desktop viewport): such an element is not in the Tab order at all. Found on tracebug.dev, where
 *  the hidden mobile-nav buttons were reported as "focus lands on something invisible". */
function isRendered(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof check === "function") return check.call(el);
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (getComputedStyle(n).display === "none") return false;
  }
  return true;
}

export interface KeyboardAuditResult {
  findings: Issue[];
  /** Cross-origin stylesheets that could not be read for the focus-style check. */
  unreadableSheets: number;
}

export function detectKeyboardFindings(doc: Document = document): KeyboardAuditResult {
  const findings: Issue[] = [];
  const els = Array.from(doc.querySelectorAll(TABBABLE)).filter((el) => !isTraceBugUi(el) && inTabOrder(el));

  let positive = 0;
  let invisible = 0;
  for (const el of els) {
    const tabindex = Number(el.getAttribute("tabindex"));
    if (tabindex > 0 && positive < MAX_PER_RULE) {
      positive++;
      findings.push(kbdFinding("kbd/positive-tabindex", "serious", `tabindex="${tabindex}" changes the Tab order`,
        "Keyboard users reach this element before everything in reading order. Use tabindex=\"0\" (or none) and move the element in the DOM instead.", el,
        { wcag: ["2.4.3"], fix: `Change tabindex="${tabindex}" to tabindex="0" (or remove it), and move the element to where it belongs in the page's source order.` }));
    }
    if (invisible < MAX_PER_RULE && !isCustomControlOrSkipLink(el)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const zero = r.width === 0 && r.height === 0;
      const transparent = cs.opacity === "0";
      if ((zero || transparent) && el.tagName !== "IFRAME") {
        invisible++;
        findings.push(kbdFinding("kbd/focusable-invisible", "serious", "Keyboard focus lands on something invisible",
          `This element is in the Tab order but is drawn ${zero ? "0×0" : "fully transparent"}, so a keyboard user's focus disappears. Remove it from the Tab order (tabindex="-1", disabled or hidden) or make it visible when focused.`, el,
          { wcag: ["2.4.7"], fix: "Take it out of the Tab order (tabindex=\"-1\", the disabled attribute, or display:none), or give it a visible size and a focus style when it receives focus." }));
      }
    }
  }

  const outline = detectOutlineRemoved(doc, els);
  findings.push(...outline.findings);
  findings.push(...detectFocusObscured(doc));
  return { findings, unreadableSheets: outline.unreadableSheets };
}

/** Patterns where a 0×0 or transparent focus target is normal and the user still sees focus:
 *  a native checkbox/radio hidden behind a styled label, and skip links that appear on focus. */
function isCustomControlOrSkipLink(el: Element): boolean {
  if (el instanceof HTMLInputElement && ["checkbox", "radio", "range", "file", "color"].includes(el.type)) return true;
  if (el instanceof HTMLAnchorElement && /^#./.test(el.getAttribute("href") || "")) return true;
  return false;
}

// ── Focus outline removed, with nothing in its place ───────────────────────
// A rule like `.btn:focus { outline: none }` is only a problem when the element
// gets NO other focus indicator from ANY rule: Tailwind's `focus:outline-none`
// is nearly always paired with `focus:ring-*` (a box-shadow in another rule),
// and design systems often style a child on focus. So for each such rule we
// find the elements it applies to (dead CSS is skipped), and report only the
// elements no :focus / :focus-visible rule gives a visible replacement.

type FocusRule = { selector: string; part: string; prefix: string; removes: boolean; indicates: boolean; outlineOnly: boolean; specificity: number };

/** Approximate selector specificity as one number (ids·10000 + classes/attributes/pseudo-classes·100 + types). */
export function specificity(part: string): number {
  const s = part.replace(/::[\w-]+/g, "").replace(/:not\(([^)]*)\)/g, " $1");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.(?:\\.|[\w-])+|\[[^\]]*\]|:[\w-]+/g) || []).length;
  const rest = s.replace(/#[\w-]+|\.(?:\\.|[\w-])+|\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?/g, " ");
  const types = (rest.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + classes * 100 + types;
}

const PSEUDO_STRIP = /:not\(\s*:focus-visible\s*\)|:(?:focus-visible|focus|hover|active)\b/g;

/** The selector part up to and including the compound that carries :focus, without state pseudo-classes. */
function focusPrefix(part: string): string | null {
  const m = /:focus(?:-visible)?(?![-\w])/.exec(part);
  if (!m) return null;
  let end = m.index + m[0].length;
  let depth = 0;
  for (; end < part.length; end++) {
    const c = part[end];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) break;
  }
  return part.slice(0, end).replace(PSEUDO_STRIP, "").trim() || "*";
}

function splitSelectorList(sel: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { out.push(sel.slice(start, i).trim()); start = i + 1; }
  }
  out.push(sel.slice(start).trim());
  return out.filter(Boolean);
}

const NONE = /^(none|0|0px|initial|unset|inherit|revert|transparent|rgba\(0,\s*0,\s*0,\s*0\))$/;

function declares(st: CSSStyleDeclaration, props: string[]): boolean {
  return props.some((p) => { const v = st.getPropertyValue(p).trim(); return !!v && !NONE.test(v); });
}

function readFocusRules(doc: Document): { rules: FocusRule[]; unreadableSheets: number } {
  const rules: FocusRule[] = [];
  let unreadableSheets = 0;
  const visit = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules && !(rule as CSSStyleRule).selectorText) { visit(grouping.cssRules); continue; }
      const style = rule as CSSStyleRule;
      const sel = style.selectorText || "";
      if (!/:focus(?!-within)/.test(sel) || /tracebug/i.test(sel)) continue;
      const st = style.style;
      const outlineStyle = (st.getPropertyValue("outline-style") || "").trim();
      const outlineShort = (st.getPropertyValue("outline") || "").trim();
      const outlineWidth = st.getPropertyValue("outline-width").trim();
      const removes = /^(none|hidden)$/.test(outlineStyle) || /^(none|0(px)?)\b/.test(outlineShort) || outlineWidth === "0" || outlineWidth === "0px";
      // outline-color alone is not an indicator: `outline: none` expands into it.
      const viaOutline = !removes && (/^(solid|dotted|dashed|double|groove|ridge|inset|outset|auto)$/.test(outlineStyle) || /\b(solid|dotted|dashed|double|auto)\b/.test(outlineShort));
      const viaOther = declares(st, ["box-shadow", "border-color", "border-top-color", "border-bottom-color", "border-left-color", "border-right-color", "border-bottom", "border", "background", "background-color", "text-decoration", "text-decoration-line", "--tw-ring-shadow", "--tw-ring-color"]);
      const indicates = viaOutline || viaOther;
      for (const part of splitSelectorList(sel)) {
        const prefix = focusPrefix(part);
        // `:focus:not(:focus-visible) { outline: none }` hides the ring for mouse clicks only —
        // keyboard focus is :focus-visible and keeps it. That is the recommended pattern, not a bug.
        const mouseOnly = /:not\(\s*:focus-visible\s*\)/.test(part);
        if (prefix) rules.push({ selector: sel, part, prefix, removes: removes && !mouseOnly, indicates, outlineOnly: viaOutline && !viaOther, specificity: specificity(part) });
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    const owner = sheet.ownerNode as Element | null;
    if (owner && isTraceBugUi(owner)) continue;
    let list: CSSRuleList | null = null;
    try { list = sheet.cssRules; } catch { unreadableSheets++; continue; }
    if (list) visit(list);
  }
  return { rules, unreadableSheets };
}

const safeMatches = (el: Element, sel: string) => { try { return el.matches(sel); } catch { return false; } };

export function detectOutlineRemoved(doc: Document, tabbables: Element[]): { findings: Issue[]; unreadableSheets: number } {
  const { rules, unreadableSheets } = readFocusRules(doc);
  const removing = rules.filter((r) => r.removes);
  const indicating = rules.filter((r) => r.indicates);
  const findings: Issue[] = [];
  const bySelector = new Map<string, Element[]>();
  for (const el of tabbables) {
    const rule = removing.find((r) => safeMatches(el, r.prefix));
    if (!rule) continue;
    // Another rule draws focus: box-shadow/border/background always shows; an outline only shows
    // when that rule wins the cascade against the one removing it (approximate specificity).
    if (indicating.some((r) => safeMatches(el, r.prefix) && (!r.outlineOnly || r.specificity >= rule.specificity))) continue;
    const list = bySelector.get(rule.part) ?? [];
    list.push(el);
    bySelector.set(rule.part, list);
  }
  for (const [part, els] of bySelector) {
    if (findings.length >= MAX_PER_RULE) break;
    const first = els[0];
    findings.push(kbdFinding("kbd/focus-outline-removed", "serious",
      `No visible focus on ${els.length} element${els.length === 1 ? "" : "s"}: "${part.slice(0, 60)}" removes the outline`,
      `The CSS rule "${part.slice(0, 120)}" removes the focus outline and no other :focus or :focus-visible rule gives ${els.length === 1 ? "this element" : `these ${els.length} elements`} a replacement (box-shadow, border, background or underline), so keyboard users can't see where they are.`,
      first, {
        wcag: ["2.4.7"],
        occurrences: els.length,
        fix: `Delete the outline rule, or keep it only under :focus-visible and add a visible replacement in the same rule, e.g. ${part.replace(/:focus(?:-visible)?\b/, ":focus-visible").slice(0, 80)} { box-shadow: 0 0 0 3px <your accent colour>; }.`,
        evidence: { ...elementEvidence(first), metrics: { elements: els.length } },
      }));
    findings[findings.length - 1].evidence!.hints = [part.replace(PSEUDO_STRIP, "").trim().slice(0, 60), ...(findings[findings.length - 1].evidence!.hints || [])];
  }
  return { findings, unreadableSheets };
}

/**
 * WCAG 2.4.11 Focus Not Obscured (Minimum): a fixed or sticky bar across the top
 * (or bottom) of a scrolling page hides elements that keyboard focus scrolls to,
 * unless the page reserves that space with scroll-padding. Reads layout only.
 */
export function detectFocusObscured(doc: Document = document, limit = 6000): Issue[] {
  const win = doc.defaultView || window;
  const vw = win.innerWidth, vh = win.innerHeight;
  const root = doc.documentElement;
  if (!doc.body || !vw || !vh || root.scrollHeight <= vh + 8) return []; // nothing scrolls under it
  const rootCs = win.getComputedStyle(root);
  const pad = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const padTop = pad(rootCs.scrollPaddingTop), padBottom = pad(rootCs.scrollPaddingBottom);
  const out: Issue[] = [];
  const els = doc.body.getElementsByTagName("*");
  for (let i = 0; i < els.length && i < limit && out.length < 3; i++) {
    const el = els[i];
    if (isTraceBugUi(el)) continue;
    const cs = win.getComputedStyle(el);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.5 || r.height < 24 || r.height > vh * 0.4) continue;
    const h = Math.round(r.height);
    let edge: "top" | "bottom" | null = null;
    if (r.top <= 1 && r.bottom > 0 && padTop < h - 1) edge = "top";
    else if (r.bottom >= vh - 1 && r.top < vh && padBottom < h - 1) edge = "bottom";
    if (!edge) continue;
    const prop = edge === "top" ? "scroll-padding-top" : "scroll-padding-bottom";
    out.push(kbdFinding("kbd/focus-obscured", "moderate", `A ${cs.position} ${edge === "top" ? "header" : "bar"} can hide focused elements`,
      `This ${cs.position}-position element is ${h}px tall at the ${edge} of the window and the page sets ${prop}: ${edge === "top" ? padTop : padBottom}px. When keyboard focus scrolls an element into view, it can end up underneath it.`,
      el, {
        wcag: ["2.4.11"],
        fix: `Add html { ${prop}: ${h}px; } to the page's CSS so elements scrolled into view by keyboard focus stop clear of this ${h}px ${edge === "top" ? "header" : "bar"}.`,
        evidence: { ...elementEvidence(el), metrics: { position: cs.position, heightPx: h, [prop]: edge === "top" ? padTop : padBottom } },
      }));
  }
  return out;
}
