import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectKeyboardFindings } from '../src/audit/detectors/keyboard';
import { AUDIT_SCANS, isAuditScan } from '../src/audit/types';

// Accessibility Audit keyboard pass (docs/audit-quality/implementation-plan.md §4a).
// jsdom has no layout, so element boxes are stubbed: 40×20 unless the element
// carries data-zero.

const rules = (html: string, css = '') => {
  document.head.innerHTML = css ? `<style>${css}</style>` : '';
  document.body.innerHTML = html;
  return detectKeyboardFindings(document).findings.map((f) => f.ruleId);
};

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const zero = this.hasAttribute('data-zero');
    return { width: zero ? 0 : 40, height: zero ? 0 : 20, top: 0, left: 0, right: 40, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

describe('keyboard pass', () => {
  it('flags positive tabindex, not 0 or -1', () => {
    expect(rules('<button tabindex="3">A</button><button tabindex="0">B</button><div tabindex="-1">C</div>'))
      .toEqual(['kbd/positive-tabindex']);
  });

  it('flags a focusable element drawn as nothing', () => {
    expect(rules('<a href="/x" data-zero></a>')).toEqual(['kbd/focusable-invisible']);
    expect(rules('<button style="opacity:0">Hidden</button>')).toEqual(['kbd/focusable-invisible']);
  });

  it('does not flag what is out of the Tab order', () => {
    expect(rules('<a href="/x" data-zero tabindex="-1"></a><button disabled data-zero></button><div hidden><a href="/y" data-zero></a></div><a data-zero>no href</a>')).toEqual([]);
  });

  it('does not flag focusables inside a display:none container (a hidden mobile menu)', () => {
    // tracebug.dev at 1422px: the md:hidden nav's buttons were reported as invisible focus targets.
    expect(rules('<div style="display:none"><div><button data-zero>Theme</button><button data-zero aria-label="Toggle menu"></button></div></div>')).toEqual([]);
    expect(rules('<div style="visibility:hidden"><a href="/x" data-zero></a></div>')).toEqual([]);
  });

  it('maps each keyboard rule to a WCAG criterion and says how to fix it', () => {
    document.head.innerHTML = '<style>button:focus { outline: none; }</style>';
    document.body.innerHTML = '<button tabindex="2">A</button><a href="/x" data-zero></a>';
    const out = detectKeyboardFindings(document).findings;
    const by = (id: string) => out.find((f) => f.ruleId === id)!;
    expect(by('kbd/positive-tabindex').wcag).toEqual(['2.4.3']);
    expect(by('kbd/positive-tabindex').fix).toMatch(/tabindex="0"/);
    expect(by('kbd/focusable-invisible').wcag).toEqual(['2.4.7']);
    expect(by('kbd/focus-outline-removed').wcag).toEqual(['2.4.7']);
    expect(out.every((f) => f.fix)).toBe(true);
  });

  it('does not flag a skip link moved off-screen', () => {
    expect(rules('<a href="#main" class="skip" style="position:absolute;left:-9999px">Skip to content</a>')).toEqual([]);
  });

  it('flags a :focus rule that removes the outline with nothing in its place', () => {
    expect(rules('<button>A</button>', 'button:focus { outline: none; }')).toEqual(['kbd/focus-outline-removed']);
    expect(rules('<button class="btn">A</button>', '.btn:focus { outline: 0 }')).toEqual(['kbd/focus-outline-removed']);
  });

  it('accepts a replacement indicator and ignores :focus-within', () => {
    expect(rules('<button>A</button>', 'button:focus { outline: none; box-shadow: 0 0 0 3px #36f; }')).toEqual([]);
    expect(rules('<button>A</button>', 'form:focus-within { outline: none; }')).toEqual([]);
  });

  it('outline removal: real-world patterns that are NOT bugs (from a 10-site noise study)', () => {
    // Tailwind: focus:outline-none + focus:ring-2 (box-shadow in another rule).
    expect(rules('<button class="focus:outline-none focus:ring-2">A</button>',
      '.focus\:outline-none:focus { outline: 2px solid transparent; outline-offset: 2px; outline-style: none } .focus\:ring-2:focus { box-shadow: 0 0 0 2px #36f }')).toEqual([]);
    // :focus-visible replacement in a separate rule.
    expect(rules('<button class="b">A</button>', '.b:focus { outline: none } .b:focus-visible { box-shadow: 0 0 0 3px #36f }')).toEqual([]);
    // Mouse-only removal (GitHub, Primer): keyboard focus keeps the ring.
    expect(rules('<a href="/x">A</a>', 'body a:focus:not(:focus-visible) { outline: none }')).toEqual([]);
    // Focus drawn on a child (GOV.UK accordion).
    expect(rules('<button class="acc"><span class="ring">A</span></button>', '.acc:focus { outline: 0 } .acc:focus .ring { background: #fd0 }')).toEqual([]);
    // Dead CSS: no element on the page uses it.
    expect(rules('<button>A</button>', '.unused:focus { outline: none }')).toEqual([]);
  });

  it('a global :focus-visible outline does not rescue a more specific rule that removes it', () => {
    expect(rules('<button class="b">A</button>', ':focus-visible { outline: 2px solid #36f } .b:focus { outline: none }')).toEqual(['kbd/focus-outline-removed']);
  });

  it('one finding per removing rule, counting the elements it affects', () => {
    document.head.innerHTML = '<style>.x:focus { outline: none }</style>';
    document.body.innerHTML = '<button class="x">A</button><button class="x">B</button><a class="x" href="/c">C</a>';
    const out = detectKeyboardFindings(document).findings.filter((f) => f.ruleId === 'kbd/focus-outline-removed');
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(3);
    expect(out[0].title).toMatch(/3 elements/);
  });

  it('custom checkboxes and skip links are not "invisible focus"', () => {
    expect(rules('<label>Menu <input type="checkbox" style="opacity:0"></label><a href="#main" data-zero>Skip</a>')).toEqual([]);
  });

  it('reads rules inside @media', () => {
    expect(rules('<a href="/x">A</a>', '@media (min-width: 1px) { a:focus { outline: none } }')).toEqual(['kbd/focus-outline-removed']);
  });

  it('ignores TraceBug\'s own UI and styles', () => {
    document.head.innerHTML = '<style id="tracebug-x">button:focus { outline: none }</style>';
    document.body.innerHTML = '<div id="tracebug-root"><button tabindex="5">x</button></div>';
    expect(detectKeyboardFindings(document).findings).toEqual([]);
  });

  it('findings carry evidence and the accessibility category', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '<button id="pay" tabindex="2">Pay</button>';
    const [f] = detectKeyboardFindings(document).findings;
    expect(f).toMatchObject({ category: 'accessibility', detector: 'audit-keyboard', severity: 'serious' });
    expect(f.evidence?.hints).toContain('#pay');
  });
});

describe('scan menu', () => {
  it('maps each scan to its categories', () => {
    expect(AUDIT_SCANS['auto-review'].categories).toEqual(['ui', 'mobile', 'runtime']);
    expect(AUDIT_SCANS.accessibility.categories).toEqual(['accessibility']);
    expect(AUDIT_SCANS['performance-seo'].categories).toEqual(['performance', 'seo']);
    expect(AUDIT_SCANS.full.categories).toHaveLength(6);
  });

  it('only known scan names pass', () => {
    expect(isAuditScan('accessibility')).toBe(true);
    expect(isAuditScan('toString')).toBe(false);
    expect(isAuditScan(undefined)).toBe(false);
  });
});

describe('focus not obscured (WCAG 2.4.11)', () => {
  const page = (html: string, scrolls = true) => {
    document.head.innerHTML = '';
    document.body.innerHTML = html;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrolls ? 4000 : 500, configurable: true });
  };
  beforeEach(() => {
    // A full-width 64px bar at the top for [data-bar]; 40×20 elsewhere.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const bar = this.hasAttribute('data-bar');
      const w = bar ? window.innerWidth : 40, h = bar ? 64 : 20;
      return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
  });
  afterEach(() => { delete (document.documentElement as { scrollHeight?: number }).scrollHeight; });

  it('flags a fixed header on a scrolling page without scroll-padding', async () => {
    const { detectFocusObscured } = await import('../src/audit/detectors/keyboard');
    page('<nav data-bar style="position:fixed;top:0">Menu</nav><main>…</main>');
    const out = detectFocusObscured(document);
    expect(out.map((f) => f.ruleId)).toEqual(['kbd/focus-obscured']);
    expect(out[0].wcag).toEqual(['2.4.11']);
    expect(out[0].severity).toBe('moderate');
    expect(out[0].fix).toContain('scroll-padding-top: 64px');
  });

  it('does not flag a page that does not scroll, or a header that is not fixed', async () => {
    const { detectFocusObscured } = await import('../src/audit/detectors/keyboard');
    page('<nav data-bar style="position:fixed;top:0">Menu</nav>', false);
    expect(detectFocusObscured(document)).toEqual([]);
    page('<nav data-bar>Menu</nav>');
    expect(detectFocusObscured(document)).toEqual([]);
  });
});

describe('transparent text count', () => {
  it('counts text hidden by opacity 0 (scroll-reveal), not display:none and not TraceBug UI', async () => {
    const { countTransparentText } = await import('../src/audit/detectors/a11y');
    document.body.innerHTML = '<section style="opacity:0"><p>Fades in</p><span>Also</span></section><p>Shown</p>' +
      '<div style="display:none"><p>Gone</p></div><div id="tracebug-root" style="opacity:0"><p>ours</p></div>';
    // Below the first screen, like scroll-reveal content; jsdom has no checkVisibility, so this
    // exercises the fallback walk (opacity and display).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 40, height: 20, top: 2000, left: 0, right: 40, bottom: 2020, x: 0, y: 2000, toJSON() {} }) as DOMRect);
    expect(countTransparentText(document)).toBe(2);
    // A popover (absolute) is invisible on purpose, and so is anything on the first screen.
    document.body.innerHTML = '<div style="position:absolute;opacity:0"><p>Menu item</p></div>';
    expect(countTransparentText(document)).toBe(0);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 40, height: 20, top: 10, left: 0, right: 40, bottom: 30, x: 0, y: 10, toJSON() {} }) as DOMRect);
    document.body.innerHTML = '<section style="opacity:0"><p>Hero fading in</p></section>';
    expect(countTransparentText(document)).toBe(0);
  });
});
