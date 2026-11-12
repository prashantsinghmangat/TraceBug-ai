// ── Keyboard pass (Accessibility Audit, plan §4a) ──────────────────────────
// A small, read-only addition to axe: the Tab order is read from the DOM and
// the page's own stylesheets. Nothing is focused, clicked or typed.
//
//   kbd/positive-tabindex       tabindex > 0 reorders Tab away from reading order
//   kbd/focusable-invisible     in the Tab order but drawn as nothing (0×0 or
//                               opacity 0): focus lands somewhere the user can't see
//   kbd/focus-outline-removed   a :focus rule removes the outline and draws no
//                               other indicator (box-shadow / border / background)
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
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden";
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
        "Keyboard users reach this element before everything in reading order. Use tabindex=\"0\" (or none) and move the element in the DOM instead.", el));
    }
    if (invisible < MAX_PER_RULE) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const zero = r.width === 0 && r.height === 0;
      const transparent = cs.opacity === "0";
      if ((zero || transparent) && el.tagName !== "IFRAME") {
        invisible++;
        findings.push(kbdFinding("kbd/focusable-invisible", "serious", "Keyboard focus lands on something invisible",
          `This element is in the Tab order but is drawn ${zero ? "0×0" : "fully transparent"}, so a keyboard user's focus disappears. Remove it from the Tab order (tabindex="-1", disabled or hidden) or make it visible when focused.`, el));
      }
    }
  }

  // :focus rules that remove the outline and draw nothing else.
  let unreadableSheets = 0;
  let removed = 0;
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (removed >= MAX_PER_RULE) return;
      const grouping = rule as CSSGroupingRule;
      if (grouping.cssRules && !(rule as CSSStyleRule).selectorText) { visit(grouping.cssRules); continue; }
      const style = rule as CSSStyleRule;
      const sel = style.selectorText || "";
      if (!/:focus(?!-within)/.test(sel)) continue;
      const st = style.style;
      const outline = (st.getPropertyValue("outline-style") || st.getPropertyValue("outline") || "").trim();
      const width = st.getPropertyValue("outline-width").trim();
      const removesOutline = /^(none|0(px)?)\b/.test(outline) || width === "0" || width === "0px";
      if (!removesOutline) continue;
      // outline-color is not a replacement: browsers expand `outline: none` into it.
      const replaced = ["box-shadow", "border-color", "border", "border-bottom", "background", "background-color", "text-decoration"]
        .some((p) => { const v = st.getPropertyValue(p).trim(); return v && !/^(none|0|initial|unset|inherit|revert)$/.test(v); });
      if (replaced) continue;
      if (sel.includes("tracebug")) continue;
      removed++;
      findings.push(kbdFinding("kbd/focus-outline-removed", "serious", `"${sel.slice(0, 80)}" hides the focus outline`,
        "This CSS rule removes the focus outline and draws no other focus indicator, so keyboard users can't see where they are. Keep the outline, or replace it (box-shadow, border or background) — :focus-visible lets mouse users keep a clean look.",
        null, { evidence: { text: sel.slice(0, 80), hints: [sel.split(",")[0].replace(/:focus.*/, "").trim()].filter(Boolean) } }));
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    const owner = sheet.ownerNode as Element | null;
    if (owner && isTraceBugUi(owner)) continue;
    let rules: CSSRuleList | null = null;
    try { rules = sheet.cssRules; } catch { unreadableSheets++; continue; }
    if (rules) visit(rules);
  }

  return { findings, unreadableSheets };
}
