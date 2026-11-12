// ── Evidence from a DOM element ────────────────────────────────────────────
// What an agent needs to find the element in source: a short HTML snippet, its
// visible text, and grep-able hints (id, data-testid, aria-label, stable class
// names, text). buildAuditRun redacts and bounds all of it afterwards; this
// only gathers, and keeps the raw strings short so huge containers don't
// allocate megabytes on the way.

import type { AuditEvidence } from "../../types";

const RAW_HTML_LIMIT = 1200;

/** The element's opening tag plus the start of its content — never the whole subtree. */
export function htmlSnippet(el: Element): string {
  const outer = el.outerHTML || "";
  return outer.length > RAW_HTML_LIMIT ? outer.slice(0, RAW_HTML_LIMIT) : outer;
}

export function visibleText(el: Element): string {
  const t = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return t.replace(/\s+/g, " ").trim().slice(0, 200);
}

// Generated class names are useless for grepping source (they don't appear in it).
const GENERATED = /^(css|sc|jsx|svelte|emotion)-|__[a-z0-9]{4,}$|^(?=(?:.*\d){2})(?=.*[a-z])[a-z0-9]{6,}$/i;

export function elementEvidence(el: Element, extra?: Partial<AuditEvidence>): AuditEvidence {
  const hints: string[] = [];
  if (el.id) hints.push("#" + el.id);
  for (const attr of ["data-testid", "data-test-id", "data-cy", "name", "aria-label"]) {
    const v = el.getAttribute(attr);
    if (v) hints.push(`${attr}="${v}"`);
  }
  const classes = Array.from(el.classList).filter((c) => !GENERATED.test(c)).slice(0, 3);
  for (const c of classes) hints.push("." + c);
  const text = visibleText(el);
  if (text) hints.push(text.slice(0, 40));
  return { html: htmlSnippet(el), text, hints, ...extra };
}

/** True for TraceBug's own UI, which every audit must ignore. */
export function isTraceBugUi(el: Element): boolean {
  return !!el.closest("#tracebug-root, [id^='tracebug-']");
}

/** Rendered and on screen in the layout sense: has a box, not display:none / visibility:hidden. */
export function isRendered(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden" && cs.visibility !== "collapse" && cs.opacity !== "0";
}
