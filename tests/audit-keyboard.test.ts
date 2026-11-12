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

  it('does not flag a skip link moved off-screen', () => {
    expect(rules('<a href="#main" class="skip" style="position:absolute;left:-9999px">Skip to content</a>')).toEqual([]);
  });

  it('flags a :focus rule that removes the outline with nothing in its place', () => {
    expect(rules('<button>A</button>', 'button:focus { outline: none; }')).toEqual(['kbd/focus-outline-removed']);
    expect(rules('<button>A</button>', '.btn:focus { outline: 0 }')).toEqual(['kbd/focus-outline-removed']);
  });

  it('accepts a replacement indicator and ignores :focus-within', () => {
    expect(rules('<button>A</button>', 'button:focus { outline: none; box-shadow: 0 0 0 3px #36f; }')).toEqual([]);
    expect(rules('<button>A</button>', 'form:focus-within { outline: none; }')).toEqual([]);
  });

  it('reads rules inside @media', () => {
    expect(rules('<button>A</button>', '@media (min-width: 1px) { a:focus { outline: none } }')).toEqual(['kbd/focus-outline-removed']);
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
    expect(AUDIT_SCANS['auto-review'].categories).toEqual(['ui', 'runtime']);
    expect(AUDIT_SCANS.accessibility.categories).toEqual(['accessibility']);
    expect(AUDIT_SCANS['performance-seo'].categories).toEqual(['performance', 'seo']);
    expect(AUDIT_SCANS.full.categories).toHaveLength(5);
  });

  it('only known scan names pass', () => {
    expect(isAuditScan('accessibility')).toBe(true);
    expect(isAuditScan('toString')).toBe(false);
    expect(isAuditScan(undefined)).toBe(false);
  });
});
