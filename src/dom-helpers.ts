// ── Shared DOM helpers ─────────────────────────────────────────────────────
// One implementation of "is this element part of TraceBug's own injected UI?"
// for the in-page mode tools (annotate / blur / inspect) — they must never
// target the widget itself. Each tool used to carry its own near-identical
// ancestor walk, and the prefix sets had drifted (one matched `tb-qb`/`tb-hud`,
// another bare `tb-`, another `bt-`). This is the union of all of them.
//
// Excluding MORE of our own UI is always safe for a UI-targeting tool, so a
// superset can't cause a tool to wrongly act on the widget. It is the *inverse*
// risk from the capture path — so the event collectors keep their own,
// separately-tested `isTraceBugElement` (collectors.ts): broadening THAT could
// wrongly drop host-page events, which is why it is intentionally not merged.

// Widget CLASS prefixes only. Deliberately NOT bare `tb-`: `tb-mask` and
// `tb-block` are redaction markers TraceBug applies to HOST-PAGE content, so a
// bare `tb-` match would wrongly treat a blurred/masked page element as our own
// UI — e.g. a second click on a blurred element (which carries `tb-mask`) would
// fail to unblur it. Every in-page widget container also has a `tracebug-` id,
// so the ancestor walk catches children of the modal/HUD via that id anyway;
// these class prefixes are belt-and-suspenders for the modal/HUD/scrubber.
const TB_WIDGET_CLASSES = ["tracebug-", "tb-qb", "tb-hud", "tb-rs"];

/** True when `el` (or any ancestor) is part of TraceBug's injected UI. */
export function isTraceBugUiElement(el: Element | null): boolean {
  let node: Element | null = el;
  while (node) {
    const h = node as HTMLElement;
    const id = h.id || "";
    // #tracebug-root and every tb widget id start with these.
    if (id.startsWith("tracebug-") || id.startsWith("bt-")) return true;
    const cn = typeof h.className === "string" ? h.className : "";
    if (cn && TB_WIDGET_CLASSES.some((p) => cn.includes(p))) return true;
    if (h.dataset?.tracebug) return true;
    node = node.parentElement;
  }
  return false;
}
