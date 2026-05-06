// ── Scanner helpers ───────────────────────────────────────────────────────
// Shared utilities for detectors: stable issue IDs, robust CSS selectors,
// severity coercion.

import { IssueDetector, IssueSeverity } from "../types";

let _issueCounter = 0;

/** Stable, unique issue ID across detectors and runs. */
export function makeIssueId(detector: IssueDetector): string {
  _issueCounter += 1;
  return `${detector}_${Date.now().toString(36)}_${_issueCounter}`;
}

/**
 * Build a "good enough" CSS selector for an element. Prefers id, then
 * data-testid, then a tag+nth-of-type chain bounded to depth 5. Not
 * guaranteed unique on pathological pages but unique enough for clicking
 * back to the offending node.
 */
export function buildSelector(el: Element): string {
  if (!el || el.nodeType !== 1) return "";
  if (el.id) return `#${cssEscape(el.id)}`;

  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id");
  if (testId) return `[data-testid="${cssEscape(testId)}"]`;

  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && cur.tagName !== "BODY" && depth < 5) {
    const tag = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
    if (siblings.length > 1) {
      const idx = siblings.indexOf(cur) + 1;
      parts.unshift(`${tag}:nth-of-type(${idx})`);
    } else {
      parts.unshift(tag);
    }
    cur = parent;
    depth += 1;
  }
  return parts.join(" > ");
}

/**
 * Map axe-core's impact strings to our IssueSeverity enum. Axe's "serious"
 * is our highest non-critical bucket.
 */
export function coerceSeverity(impact: string | null | undefined): IssueSeverity {
  switch ((impact || "").toLowerCase()) {
    case "critical": return "critical";
    case "serious": return "serious";
    case "moderate": return "moderate";
    case "minor": return "minor";
    default: return "minor";
  }
}

/**
 * Minimal CSS.escape polyfill — needed when an id contains characters that
 * would break a selector (colons, brackets, dots in framework-generated ids).
 */
function cssEscape(value: string): string {
  if (typeof (window as any).CSS?.escape === "function") {
    return (window as any).CSS.escape(value);
  }
  return value.replace(/[^\w-]/g, ch => `\\${ch}`);
}
