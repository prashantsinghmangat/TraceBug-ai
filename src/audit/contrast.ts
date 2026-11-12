// ── Contrast fix suggestion ────────────────────────────────────────────────
// Given axe's measured text and background colours and the ratio it expects,
// find the closest text colour that passes: same hue, moved toward black or
// white only as far as needed. Uses the WCAG 2 relative-luminance formula, the
// one axe uses, and re-checks the result so the suggestion is never a near miss.
// Pure and dependency-free.

export type RGB = [number, number, number];

export function parseHex(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex(c: RGB): string {
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: RGB): number {
  return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** "4.5:1" or 4.5 → 4.5; null when unreadable. */
export function parseExpectedRatio(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 1 && n <= 21 ? n : null;
}

const mix = (c: RGB, target: number, t: number): RGB => [c[0] + (target - c[0]) * t, c[1] + (target - c[1]) * t, c[2] + (target - c[2]) * t];

/**
 * The nearest passing text colour, or null when none exists (for example a
 * mid-grey background where neither black nor white text reaches the ratio).
 * Tries darker and lighter; picks the smaller change. The returned colour's
 * ratio, after rounding to hex, is >= `expected`.
 */
export function suggestTextColor(fgHex: string, bgHex: string, expected: number): { color: string; ratio: number } | null {
  const fg = parseHex(fgHex), bg = parseHex(bgHex);
  if (!fg || !bg || !(expected > 1)) return null;
  if (contrastRatio(fg, bg) >= expected) return null; // already passes
  const candidates: Array<{ color: string; ratio: number; t: number }> = [];
  for (const target of [0, 255]) {
    if (contrastRatio(mix(fg, target, 1), bg) < expected) continue;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (contrastRatio(mix(fg, target, mid), bg) >= expected) hi = mid; else lo = mid;
    }
    // Walk forward in small steps until the ROUNDED hex passes too.
    let t = hi;
    let rgb = parseHex(toHex(mix(fg, target, t)))!;
    while (contrastRatio(rgb, bg) < expected && t < 1) {
      t = Math.min(1, t + 0.002);
      rgb = parseHex(toHex(mix(fg, target, t)))!;
    }
    const ratio = contrastRatio(rgb, bg);
    if (ratio >= expected) candidates.push({ color: toHex(rgb), ratio, t });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.t - b.t);
  return { color: candidates[0].color, ratio: Math.floor(candidates[0].ratio * 100) / 100 };
}
