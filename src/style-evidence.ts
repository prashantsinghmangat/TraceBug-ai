// ── Style evidence ────────────────────────────────────────────────────────
// "The button looks wrong" is the visual-bug version of "checkout is
// broken". This module snapshots a curated set of computed styles for an
// element at annotation time, so a design-QA report carries the receipts:
// exact typography, colors (as hex), box model, and a WCAG contrast verdict
// an agent can diff against the design tokens in the codebase.
//
// Curated ~20 properties, not all 300 — evidence, not a style dump.

export interface StyleEvidence {
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    textAlign: string;
  };
  colors: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    opacity: string;
  };
  box: {
    width: string;
    height: string;
    margin: string;
    padding: string;
    border: string;
    borderRadius: string;
    boxSizing: string;
  };
  layout: {
    display: string;
    position: string;
    zIndex: string;
    overflow: string;
  };
  /** WCAG text contrast — omitted when the element has no visible text. */
  contrast?: {
    ratio: number;
    /** Passes AA for normal text (≥ 4.5). */
    aa: boolean;
    /** Passes AA for large text (≥ 3; large = ≥24px, or ≥18.66px bold). */
    aaLarge: boolean;
    foreground: string;
    background: string;
  };
}

// ── Color helpers (exported for tests) ────────────────────────────────────

/** Parse a computed CSS color (rgb/rgba) into [r,g,b,a]. Null for none/invalid. */
export function parseCssColor(css: string): [number, number, number, number] | null {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(css || "");
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}

/** Computed rgb()/rgba() → #rrggbb (alpha appended as /NN% only when < 1). */
export function cssColorToHex(css: string): string {
  const c = parseCssColor(css);
  if (!c) return css || "";
  const hex = "#" + [c[0], c[1], c[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
  return c[3] < 1 ? `${hex} / ${Math.round(c[3] * 100)}%` : hex;
}

/** WCAG relative luminance for an [r,g,b] in 0–255. */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two computed CSS colors (1–21). */
export function contrastRatio(fg: string, bg: string): number | null {
  const f = parseCssColor(fg);
  const b = parseCssColor(bg);
  if (!f || !b) return null;
  const lf = relativeLuminance([f[0], f[1], f[2]]);
  const lb = relativeLuminance([b[0], b[1], b[2]]);
  const [hi, lo] = lf >= lb ? [lf, lb] : [lb, lf];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Collapse four longhand sides into CSS shorthand ("8px", "8px 12px", …). */
export function collapseSides(top: string, right: string, bottom: string, left: string): string {
  if (top === right && right === bottom && bottom === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  return `${top} ${right} ${bottom} ${left}`;
}

// ── Capture ───────────────────────────────────────────────────────────────

/** Walk up from `el` to the first ancestor with a non-transparent background —
 *  the effective backdrop for contrast. Falls back to white. */
function effectiveBackground(el: Element): string {
  let node: Element | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const parsed = parseCssColor(bg);
    if (parsed && parsed[3] > 0) return bg;
    node = node.parentElement;
  }
  return "rgb(255, 255, 255)";
}

/** Snapshot the curated computed-style evidence for an element. */
export function captureStyleEvidence(el: Element): StyleEvidence {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  const evidence: StyleEvidence = {
    typography: {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textAlign: cs.textAlign,
    },
    colors: {
      color: cssColorToHex(cs.color),
      backgroundColor: cssColorToHex(cs.backgroundColor),
      borderColor: cssColorToHex(cs.borderTopColor),
      opacity: cs.opacity,
    },
    box: {
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      margin: collapseSides(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft),
      padding: collapseSides(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft),
      border: cs.borderTopWidth === "0px" ? "none" : `${cs.borderTopWidth} ${cs.borderTopStyle} ${cssColorToHex(cs.borderTopColor)}`,
      borderRadius: cs.borderRadius,
      boxSizing: cs.boxSizing,
    },
    layout: {
      display: cs.display,
      position: cs.position,
      zIndex: cs.zIndex,
      overflow: cs.overflow,
    },
  };

  // Contrast only when the element actually shows text.
  const text = (el as HTMLElement).innerText?.trim();
  if (text) {
    const bg = effectiveBackground(el);
    const ratio = contrastRatio(cs.color, bg);
    if (ratio !== null) {
      const px = parseFloat(cs.fontSize) || 16;
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const isLarge = px >= 24 || (px >= 18.66 && bold);
      evidence.contrast = {
        ratio,
        aa: ratio >= 4.5,
        aaLarge: ratio >= 3,
        foreground: cssColorToHex(cs.color),
        background: cssColorToHex(bg),
      };
      // For large text the effective AA bar is 3.0 — reflect that in `aa`
      // so consumers can show one verdict without re-deriving size rules.
      if (isLarge) evidence.contrast.aa = ratio >= 3;
    }
  }

  return evidence;
}

/** One-line human summary — used in tooltips, markdown, and MCP output. */
export function formatStyleSummary(s: StyleEvidence): string {
  const parts = [
    `${s.typography.fontSize}/${s.typography.lineHeight} ${s.typography.fontWeight} ${s.typography.fontFamily.split(",")[0].trim()}`,
    `color ${s.colors.color} on ${s.colors.backgroundColor}`,
    `${s.box.width}×${s.box.height}`,
    `pad ${s.box.padding}`,
  ];
  if (s.contrast) {
    parts.push(`contrast ${s.contrast.ratio}:1${s.contrast.aa ? "" : " ⚠ fails AA"}`);
  }
  return parts.join(" · ");
}
