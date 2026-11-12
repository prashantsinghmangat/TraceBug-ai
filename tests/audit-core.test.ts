import { describe, it, expect } from 'vitest';
import {
  auditFallbackFingerprint, auditFingerprint, normalizeSelector, stableHash, tagFromHtml, urlPath,
} from '../src/audit/fingerprint';
import { buildAuditRun, MAX_AUDIT_FINDINGS, MAX_EVIDENCE_HTML, MAX_HINTS, userAgentFamily } from '../src/audit/run';
import { compareAudits } from '../src/audit/compare';
import type { AuditCategory, AuditRun, Issue, IssueSeverity } from '../src/types';

// Site Audit core (docs/audit-quality/implementation-plan.md §3, §7).

const finding = (o: Partial<Issue> & { category: AuditCategory; ruleId: string }): Issue => ({
  id: o.id ?? Math.random().toString(36),
  detector: 'a11y',
  severity: (o.severity ?? 'serious') as IssueSeverity,
  title: o.title ?? o.ruleId,
  description: o.description ?? '',
  page: o.page ?? 'https://shop.example/checkout',
  detectedAt: 1,
  ...o,
});

const CTX = {
  url: 'https://shop.example/checkout?session=abc&utm=x',
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  categories: { accessibility: { ran: true }, ui: { ran: true }, seo: { ran: true } },
  now: 1_800_000_000_000,
  id: 'audit-test',
};
const run = (findings: Issue[], over: Partial<typeof CTX> = {}): AuditRun => buildAuditRun(findings, { ...CTX, ...over });

describe('stableHash', () => {
  it('is deterministic, 16 hex chars, and input-sensitive', () => {
    expect(stableHash('a')).toBe(stableHash('a'));
    expect(stableHash('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(stableHash('a')).not.toBe(stableHash('b'));
    expect(stableHash('')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('urlPath', () => {
  it('drops query, hash and trailing slash; keeps root', () => {
    expect(urlPath('https://a.com/checkout?x=1#y')).toBe('/checkout');
    expect(urlPath('https://a.com/checkout/')).toBe('/checkout');
    expect(urlPath('https://a.com/')).toBe('/');
    expect(urlPath('/cart?step=2')).toBe('/cart');
    expect(urlPath(undefined)).toBe('');
  });
});

describe('normalizeSelector', () => {
  it('drops CSS-in-JS, CSS-module and hash-like class names', () => {
    expect(normalizeSelector('div.css-1a2b3c > button.btn')).toBe('div>button.btn');
    expect(normalizeSelector('button.Button_primary__a1B2c')).toBe('button');
    expect(normalizeSelector('span.sc-bdfBwQ.label')).toBe('span.label');
    expect(normalizeSelector('div.a1b2c3 .title')).toBe('div .title');
  });
  it('keeps hand-written classes that contain numbers', () => {
    expect(normalizeSelector('div.col-md-6')).toBe('div.col-md-6');
    expect(normalizeSelector('li.step_2')).toBe('li.step_2');
  });
  it('drops generated ids (React useId, Radix) but keeps real ones', () => {
    expect(normalizeSelector('#\\:r3\\: > input')).toBe('*>input');
    expect(normalizeSelector('#radix-12 button')).toBe('* button');
    expect(normalizeSelector('#coupon')).toBe('#coupon');
  });
  it('is stable under class order, attribute order, spacing and tag case', () => {
    expect(normalizeSelector('BUTTON.b.a[type="submit"][name=x]')).toBe(normalizeSelector('button.a.b[name=x][type="submit"]'));
    expect(normalizeSelector('main   >   form  button')).toBe(normalizeSelector('main>form button'));
  });
  it('keeps structure (nth-of-type) so siblings stay distinct', () => {
    expect(normalizeSelector('ul > li:nth-of-type(2)')).not.toBe(normalizeSelector('ul > li:nth-of-type(3)'));
  });
});

describe('auditFingerprint / auditFallbackFingerprint', () => {
  const base = { category: 'accessibility' as const, ruleId: 'button-name', page: 'https://a.com/checkout', selector: 'form > button.css-9x8y7z' };

  it('survives query strings, hashes and generated class names', () => {
    expect(auditFingerprint(base)).toBe(auditFingerprint({ ...base, page: 'https://a.com/checkout?ref=mail#top', selector: 'form > button.css-1q2w3e' }));
  });
  it('differs by rule, category, page and element', () => {
    const fp = auditFingerprint(base);
    expect(auditFingerprint({ ...base, ruleId: 'color-contrast' })).not.toBe(fp);
    expect(auditFingerprint({ ...base, category: 'ui' })).not.toBe(fp);
    expect(auditFingerprint({ ...base, page: 'https://a.com/cart' })).not.toBe(fp);
    expect(auditFingerprint({ ...base, selector: 'form > a' })).not.toBe(fp);
  });
  it('uses the resource path for request findings, and "page" for page-level ones', () => {
    const a = auditFingerprint({ category: 'performance', ruleId: 'perf/large-resource', page: base.page, url: 'https://cdn.x/app.js?v=1' });
    const b = auditFingerprint({ category: 'performance', ruleId: 'perf/large-resource', page: base.page, url: 'https://cdn.x/app.js?v=2' });
    expect(a).toBe(b);
    expect(auditFingerprint({ category: 'seo', ruleId: 'seo/missing-canonical', page: base.page }))
      .toBe(auditFingerprint({ category: 'seo', ruleId: 'seo/missing-canonical', page: base.page + '?x=1' }));
  });
  it('fallback matches the same element when the selector changed, and is absent with nothing to go on', () => {
    const a = auditFallbackFingerprint({ ...base, html: '<button class="x">Place  order</button>', text: 'Place order' });
    const b = auditFallbackFingerprint({ ...base, selector: 'div > form > button', html: '<BUTTON>Place order</BUTTON>', text: ' place ORDER ' });
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(auditFallbackFingerprint(base)).toBeUndefined();
  });
  it('tagFromHtml reads the first tag', () => {
    expect(tagFromHtml('  <Img src=x>')).toBe('img');
    expect(tagFromHtml('text')).toBe('');
  });
});

describe('buildAuditRun', () => {
  it('redacts the page URL and keeps no full user agent', () => {
    const r = run([]);
    expect(r.url).not.toContain('abc');
    expect(r.url).toContain('/checkout');
    expect(r.userAgentFamily).toBe('Chrome');
    expect(JSON.stringify(r)).not.toContain('Mozilla');
  });

  it('bounds and redacts evidence', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV';
    const r = run([finding({
      category: 'accessibility', ruleId: 'image-alt', selector: 'img',
      evidence: {
        html: `<img src="https://a.com/x.png?token=secret123" data-t="${token}">` + 'x'.repeat(2000),
        text: '  Hello   world  ',
        hints: Array.from({ length: 20 }, (_, i) => `hint-${i}`).concat(['hint-0']),
        metrics: { contrastRatio: 2.9, note: 'n'.repeat(500) },
      },
    })]);
    const e = r.findings[0].evidence!;
    expect(e.html!.length).toBeLessThanOrEqual(MAX_EVIDENCE_HTML);
    expect(e.html).not.toContain('secret123');
    expect(e.html).not.toContain(token);
    expect(e.text).toBe('Hello world');
    expect(e.hints).toHaveLength(MAX_HINTS);
    expect(e.metrics!.contrastRatio).toBe(2.9);
    expect(String(e.metrics!.note).length).toBeLessThanOrEqual(60);
  });

  it('fingerprints every finding and collapses duplicates into occurrences', () => {
    const r = run([
      finding({ category: 'accessibility', ruleId: 'button-name', selector: 'button.css-aa11bb', severity: 'moderate' }),
      finding({ category: 'accessibility', ruleId: 'button-name', selector: 'button.css-cc22dd', severity: 'critical' }),
    ]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].occurrences).toBe(2);
    expect(r.findings[0].severity).toBe('critical');
    expect(r.findings[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('drops scanner output that is not an audit finding', () => {
    const plain = { ...finding({ category: 'ui', ruleId: 'x' }) };
    delete (plain as Partial<Issue>).category;
    expect(run([plain]).findings).toHaveLength(0);
  });

  it('sorts most severe first, caps at MAX_AUDIT_FINDINGS and counts the rest', () => {
    const many = Array.from({ length: MAX_AUDIT_FINDINGS + 25 }, (_, i) =>
      finding({ category: 'ui', ruleId: 'ui/overlap', selector: `div:nth-of-type(${i + 1})`, severity: i === 220 ? 'critical' : 'minor' }));
    const r = run(many);
    expect(r.findings).toHaveLength(MAX_AUDIT_FINDINGS);
    expect(r.truncated).toBe(25);
    expect(r.findings[0].severity).toBe('critical');
    expect(r.categories.find((c) => c.name === 'ui')!.count).toBe(MAX_AUDIT_FINDINGS + 25);
  });

  it('reports a category that could not run as not run, never as passed', () => {
    const r = run([], { categories: { accessibility: { ran: true }, performance: { ran: false, limitation: 'Lab values unavailable in this browser' } } as never });
    const perf = r.categories.find((c) => c.name === 'performance')!;
    expect(perf).toEqual({ name: 'performance', ran: false, count: 0, limitation: 'Lab values unavailable in this browser' });
    expect(r.categories.map((c) => c.name)).toEqual(['accessibility', 'performance']);
  });

  it('userAgentFamily tells Edge from Chrome', () => {
    expect(userAgentFamily('Mozilla/5.0 Chrome/150.0 Safari/537.36 Edg/150.0')).toBe('Edge');
    expect(userAgentFamily('Mozilla/5.0 (X11; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox');
    expect(userAgentFamily('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/18 Safari/605')).toBe('Safari');
    expect(userAgentFamily(undefined)).toBe('Other');
  });
});

describe('compareAudits', () => {
  const contrast = finding({ category: 'accessibility', ruleId: 'color-contrast', selector: 'p.lead', evidence: { html: '<p>Hi</p>', text: 'Hi' } });
  const btnName = finding({ category: 'accessibility', ruleId: 'button-name', selector: 'button.icon', evidence: { html: '<button></button>' } });
  const overflow = finding({ category: 'ui', ruleId: 'ui/horizontal-overflow' });
  const canonical = finding({ category: 'seo', ruleId: 'seo/missing-canonical' });

  it('fixed, still present, new and regressed', () => {
    const before = run([contrast, btnName, overflow]);
    const newA11y = finding({ category: 'accessibility', ruleId: 'label', selector: 'input#q', evidence: { html: '<input id="q">' } });
    const after = run([contrast, newA11y, overflow, canonical]);
    const c = compareAudits(before, after);
    expect(c.comparable).toBe(true);
    expect(c.fixed.map((f) => f.ruleId)).toEqual(['button-name']);
    expect(c.stillPresent.map((p) => p.after.ruleId).sort()).toEqual(['color-contrast', 'ui/horizontal-overflow']);
    expect(c.regressed.map((f) => f.ruleId)).toEqual(['label']);   // new, in a category where something was fixed
    expect(c.new.map((f) => f.ruleId)).toEqual(['seo/missing-canonical']);
  });

  it('matches by fallback when the selector changed but the element did not', () => {
    const moved = { ...contrast, selector: 'main > section > p' };
    const c = compareAudits(run([contrast]), run([moved]));
    expect(c.fixed).toHaveLength(0);
    expect(c.new).toHaveLength(0);
    expect(c.stillPresent[0].matchedBy).toBe('fallback');
  });

  it('never matches one finding twice', () => {
    const twinA = finding({ category: 'ui', ruleId: 'ui/tap-target', selector: 'a:nth-of-type(1)', evidence: { html: '<a>x</a>', text: 'x' } });
    const twinB = finding({ category: 'ui', ruleId: 'ui/tap-target', selector: 'a:nth-of-type(2)', evidence: { html: '<a>x</a>', text: 'x' } });
    const moved = { ...twinA, selector: 'nav a' };
    const c = compareAudits(run([twinA, twinB]), run([moved]));
    expect(c.stillPresent).toHaveLength(1);
    expect(c.fixed).toHaveLength(1);
  });

  it('leaves out categories that did not run in both runs, instead of calling them fixed', () => {
    const before = run([contrast, overflow]);
    const after = run([contrast], { categories: { accessibility: { ran: true }, ui: { ran: false } } as never });
    const c = compareAudits(before, after);
    expect(c.fixed).toHaveLength(0);
    expect(c.skippedCategories).toContain('ui');
  });

  it('refuses to compare different pages', () => {
    const c = compareAudits(run([contrast]), run([contrast], { url: 'https://shop.example/cart' }));
    expect(c.comparable).toBe(false);
    expect(c.reason).toMatch(/Different pages/);
  });

  it('flags a comparison as incomplete when a run hit the cap', () => {
    const before = run([contrast]);
    const after = { ...run([contrast]), truncated: 3 };
    expect(compareAudits(before, after).incomplete).toBe(true);
  });

  it('a clean re-run reports everything fixed and nothing new', () => {
    const c = compareAudits(run([contrast, btnName]), run([]));
    expect(c.fixed).toHaveLength(2);
    expect(c.new).toHaveLength(0);
    expect(c.regressed).toHaveLength(0);
  });
});
