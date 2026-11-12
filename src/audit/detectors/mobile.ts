// ── Phone width (390 × 844) ────────────────────────────────────────────────
// Most layout bugs only show on a phone: a code block that scrolls sideways, a
// banner wider than the screen, a label cut in half. A page can't resize the
// browser window, so the audit loads THIS page once more in a hidden, same-site
// frame that is 390 px wide (an iPhone-sized viewport) and runs the layout
// checks there, plus one keyboard check that matters most on narrow screens:
// a scrolling box keyboard users can't reach.
//
// Only problems that the normal (current-width) run did NOT already report are
// kept, so nothing is listed twice. Honest limits, shown in the panel:
//   - it is a second page load (page scripts and analytics run again)
//   - not a real phone: no touch, no mobile browser UI, and sites that pick a
//     mobile layout by user agent (not by width) are not covered
//   - sites that forbid framing (X-Frame-Options / CSP frame-ancestors) can't
//     be checked; the category then says "not run", never "no problems"

import type { Issue } from "../../types";
import { buildSelector, makeIssueId } from "../../scanner/helpers";
import { detectUiFindings } from "./ui";
import { elementEvidence, isRendered, isTraceBugUi, isVisuallyHidden, styleOf } from "./evidence";

export const PHONE = { width: 390, height: 844 };
export const MOBILE_LIMITATION =
  `Loads this page once more in a hidden ${PHONE.width}×${PHONE.height} frame (like opening it in another tab, so page scripts and analytics run again) and checks layout and keyboard reach there. Not a real phone: no touch, no mobile browser bars, and sites that choose a mobile layout by device rather than by width aren't covered.`;

const FRAME_ID = "tracebug-phone-frame";
const FOCUSABLE = "a[href], area[href], button, input:not([type=hidden]), select, textarea, iframe, summary, [tabindex], [contenteditable=''], [contenteditable='true']";

/** WCAG mapping for the phone-width rules. 1.4.10 Reflow is about exactly this: no sideways scrolling on narrow screens. */
const WCAG: Record<string, string[]> = {
  "mobile/horizontal-overflow": ["1.4.10"],
  "mobile/off-screen": ["1.4.10"],
  "mobile/scroll-not-focusable": ["2.1.1"],
};

function focusable(el: Element): boolean {
  const t = el.getAttribute("tabindex");
  if (t !== null) return Number(t) >= 0;
  return el.matches(FOCUSABLE);
}

/** A label that says what the scrolling box holds: code, a table, or else a placeholder to fill in. */
export function scrollBoxLabel(el: Element): string {
  if (el.matches("pre, code") || el.querySelector("pre, code")) return "Code example";
  if (el.matches("table, [role=table], [role=grid]") || el.querySelector("table, [role=table], [role=grid], [class*='grid-cols']")) return "Table";
  if (el.querySelector("img, picture, video")) return "Image gallery";
  return "<what this box contains>";
}

/**
 * A box that scrolls (content wider/taller than the box, overflow auto/scroll)
 * but that a keyboard user can't get into: not focusable and nothing focusable
 * inside. Safari users can't scroll it without a mouse; Chrome 130+ and Firefox
 * now focus such boxes themselves, which the description says.
 */
export function scrollableNotFocusable(doc: Document, limit = 6000): Issue[] {
  const out: Issue[] = [];
  const els = doc.body ? doc.body.getElementsByTagName("*") : [];
  for (let i = 0; i < els.length && i < limit && out.length < 10; i++) {
    const el = els[i] as HTMLElement;
    if (isTraceBugUi(el)) continue;
    const cs = styleOf(el);
    const sx = (cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2;
    const sy = (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
    if (!sx && !sy) continue;
    if (!isRendered(el) || isVisuallyHidden(el)) continue;
    if (focusable(el) || el.querySelector(FOCUSABLE)) continue;
    const dir = sx ? "sideways" : "up and down";
    out.push({
      id: makeIssueId("audit-mobile"), detector: "audit-mobile", category: "mobile", ruleId: "mobile/scroll-not-focusable", severity: "moderate",
      title: `A box scrolls ${dir} but keyboard users can't reach it`,
      description: `At ${(doc.defaultView || window).innerWidth}px wide, this ${el.tagName.toLowerCase()} scrolls ${dir} (${sx ? `${el.scrollWidth}px of content in ${el.clientWidth}px` : `${el.scrollHeight}px of content in ${el.clientHeight}px`}), but it isn't focusable and has nothing focusable inside, so keyboard users can't scroll it in Safari. Chrome 130+ and Firefox now make such boxes focusable on their own.`,
      selector: buildSelector(el), page: location.href, detectedAt: Date.now(),
      fix: `Add tabindex="0", role="region" and aria-label="${scrollBoxLabel(el)}" to this ${el.tagName.toLowerCase()} so keyboard users can focus and scroll it${sx ? ", or let its content wrap at narrow widths so it doesn't scroll at all" : ""}.`,
      evidence: { ...elementEvidence(el), metrics: sx ? { contentWidth: el.scrollWidth, boxWidth: el.clientWidth } : { contentHeight: el.scrollHeight, boxHeight: el.clientHeight } },
    });
  }
  return out;
}

/** Re-label phone-width findings and drop the ones the current-width run already has. Pure; tested. */
export function toMobileFindings(raw: Issue[], desktop: Issue[], width = PHONE.width): Issue[] {
  const tail = (id: string | undefined) => (id || "").replace(/^(ui|mobile)\//, "");
  const seen = new Set(desktop.filter((f) => f.ruleId?.startsWith("ui/")).map((f) => `${tail(f.ruleId)}|${f.selector || ""}`));
  const desktopOverflow = desktop.some((f) => f.ruleId === "ui/horizontal-overflow");
  const out: Issue[] = [];
  for (const f of raw) {
    const t = tail(f.ruleId);
    if (seen.has(`${t}|${f.selector || ""}`)) continue;
    if (t === "horizontal-overflow" && desktopOverflow) continue;
    const ruleId = `mobile/${t}`;
    out.push({
      ...f,
      id: makeIssueId("audit-mobile"),
      detector: "audit-mobile",
      category: "mobile",
      ruleId,
      title: f.ruleId?.startsWith("mobile/") ? f.title : `At ${width}px: ${f.title.charAt(0).toLowerCase()}${f.title.slice(1)}`,
      description: f.ruleId?.startsWith("mobile/") ? f.description : `${f.description} Only at phone width (${width}px); fine at your current window size.`,
      ...(WCAG[ruleId] ? { wcag: WCAG[ruleId] } : {}),
    });
  }
  return out;
}

export interface MobileAuditResult { ran: boolean; limitation: string; findings: Issue[] }

/** Load this page in a hidden phone-width frame, check it, remove the frame. Never throws. */
export async function detectMobileFindings(desktop: Issue[], timeoutMs = 15000): Promise<MobileAuditResult> {
  if (window.innerWidth <= PHONE.width + 90) {
    return { ran: false, limitation: "Your window is already phone-sized, so the layout checks above already ran at this width.", findings: [] };
  }
  const notRun = (why: string): MobileAuditResult => ({ ran: false, limitation: why, findings: [] });
  document.getElementById(FRAME_ID)?.remove();
  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.title = "TraceBug phone-width check";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed!important;left:-${PHONE.width + 200}px!important;top:0!important;width:${PHONE.width}px!important;height:${PHONE.height}px!important;border:0!important;opacity:0!important;pointer-events:none!important;z-index:-1!important;`;
  try {
    const loaded = new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      frame.addEventListener("load", () => { clearTimeout(t); resolve(true); }, { once: true });
    });
    frame.src = location.href.replace(/#.*$/, "");
    (document.getElementById("tracebug-root") || document.body).appendChild(frame);
    if (!(await loaded)) return notRun("The page took too long to load at phone width, so it wasn't checked.");
    let doc: Document | null = null;
    try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc || !doc.body || doc.location.href === "about:blank") {
      return notRun("This site doesn't allow itself to be shown in a frame (X-Frame-Options or CSP frame-ancestors), so phone width couldn't be checked here. Resize the window to about 390px wide and run Auto Review.");
    }
    await new Promise((r) => setTimeout(r, 1200)); // let the app render and fonts settle
    const width = doc.documentElement.clientWidth;
    const raw = [...detectUiFindings(doc, ["overflow", "overlap", "clipped"]), ...scrollableNotFocusable(doc)];
    return { ran: true, limitation: MOBILE_LIMITATION, findings: toMobileFindings(raw, desktop, width || PHONE.width) };
  } catch (err) {
    console.warn("[TraceBug] phone-width check failed:", err);
    return notRun("The phone-width check failed on this page, so it wasn't run.");
  } finally {
    frame.remove();
  }
}
