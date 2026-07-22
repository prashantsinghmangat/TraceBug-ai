import { describe, it, expect } from 'vitest';
import {
  parseCssColor,
  cssColorToHex,
  relativeLuminance,
  contrastRatio,
  collapseSides,
  captureStyleEvidence,
  formatStyleSummary,
  type StyleEvidence,
} from '../src/style-evidence';

describe('color helpers', () => {
  it('parses rgb and rgba computed colors', () => {
    expect(parseCssColor('rgb(255, 0, 128)')).toEqual([255, 0, 128, 1]);
    expect(parseCssColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 0.5]);
    expect(parseCssColor('transparent')).toBeNull();
    expect(parseCssColor('')).toBeNull();
  });

  it('converts to hex, appending alpha only when < 1', () => {
    expect(cssColorToHex('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(cssColorToHex('rgba(0, 0, 0, 0.5)')).toBe('#000000 / 50%');
    // Unparseable values pass through untouched.
    expect(cssColorToHex('currentcolor')).toBe('currentcolor');
  });
});

describe('WCAG contrast', () => {
  it('computes luminance extremes', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
  });

  it('black on white is 21:1, same-on-same is 1:1', () => {
    expect(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')).toBe(21);
    expect(contrastRatio('rgb(255, 255, 255)', 'rgb(255, 255, 255)')).toBe(1);
  });

  it('#767676 on white sits at the AA boundary (~4.54)', () => {
    const r = contrastRatio('rgb(118, 118, 118)', 'rgb(255, 255, 255)')!;
    expect(r).toBeGreaterThan(4.5);
    expect(r).toBeLessThan(4.6);
  });

  it('returns null for unparseable colors', () => {
    expect(contrastRatio('transparent', 'rgb(255,255,255)')).toBeNull();
  });
});

describe('collapseSides', () => {
  it('collapses shorthand like CSS', () => {
    expect(collapseSides('8px', '8px', '8px', '8px')).toBe('8px');
    expect(collapseSides('8px', '12px', '8px', '12px')).toBe('8px 12px');
    expect(collapseSides('1px', '2px', '3px', '4px')).toBe('1px 2px 3px 4px');
  });
});

describe('captureStyleEvidence (jsdom smoke)', () => {
  it('captures the curated groups from a styled element', () => {
    const el = document.createElement('button');
    el.style.color = 'rgb(255, 0, 0)';
    el.style.backgroundColor = 'rgb(0, 0, 255)';
    el.style.fontSize = '18px';
    el.style.fontWeight = '700';
    el.style.display = 'inline-block';
    document.body.appendChild(el);
    try {
      const s = captureStyleEvidence(el);
      expect(s.colors.color).toBe('#ff0000');
      expect(s.colors.backgroundColor).toBe('#0000ff');
      expect(s.typography.fontSize).toBe('18px');
      expect(s.typography.fontWeight).toBe('700');
      expect(s.layout.display).toBe('inline-block');
      expect(s.box.width).toMatch(/px$/);
    } finally {
      el.remove();
    }
  });
});

describe('formatStyleSummary', () => {
  const evidence: StyleEvidence = {
    typography: { fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '600', lineHeight: '20px', letterSpacing: 'normal', textAlign: 'center' },
    colors: { color: '#ffffff', backgroundColor: '#6366f1', borderColor: '#6366f1', opacity: '1' },
    box: { width: '120px', height: '36px', margin: '0px', padding: '8px 16px', border: 'none', borderRadius: '8px', boxSizing: 'border-box' },
    layout: { display: 'inline-flex', position: 'static', zIndex: 'auto', overflow: 'visible' },
    contrast: { ratio: 3.9, aa: false, aaLarge: true, foreground: '#ffffff', background: '#6366f1' },
  };

  it('produces the one-line receipt with a contrast warning', () => {
    const line = formatStyleSummary(evidence);
    expect(line).toContain('14px/20px 600 Inter');
    expect(line).toContain('#ffffff on #6366f1');
    expect(line).toContain('120px×36px');
    expect(line).toContain('contrast 3.9:1 ⚠ fails AA');
  });

  it('omits the warning when AA passes', () => {
    const ok = { ...evidence, contrast: { ...evidence.contrast!, ratio: 7.2, aa: true } };
    expect(formatStyleSummary(ok)).toContain('contrast 7.2:1');
    expect(formatStyleSummary(ok)).not.toContain('fails AA');
  });
});
