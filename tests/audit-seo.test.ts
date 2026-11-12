import { describe, it, expect } from 'vitest';
import { detectSeoFindings, SEO_LIMITS, robotsAllows, detectCrawlFindings } from '../src/audit/detectors/seo';
import { imageWeightFindings } from '../src/audit/detectors/performance';
import { vi, afterEach } from 'vitest';

// SEO checks read only the document, so they run in jsdom.

const doc = (head: string, body = '<h1>Checkout</h1>'): Document =>
  new DOMParser().parseFromString(`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`, 'text/html');

const GOOD_HEAD =
  '<title>Checkout — Acme store</title>' +
  '<meta name="description" content="Review your cart, apply a coupon and place your order securely with Acme in under a minute.">' +
  '<link rel="canonical" href="https://acme.example/checkout">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<meta property="og:title" content="Checkout"><meta property="og:description" content="Pay securely">' +
  '<meta property="og:image" content="https://acme.example/og.png"><meta name="twitter:card" content="summary_large_image">';

const rules = (d: Document) => detectSeoFindings(d).map((f) => f.ruleId).sort();

describe('detectSeoFindings', () => {
  it('a well-formed page has no findings', () => {
    expect(rules(doc(GOOD_HEAD))).toEqual([]);
  });

  it('every finding is a well-formed audit finding', () => {
    for (const f of detectSeoFindings(doc(''))) {
      expect(f.category).toBe('seo');
      expect(f.detector).toBe('audit-seo');
      expect(f.ruleId).toMatch(/^seo\//);
      expect(['critical', 'serious', 'moderate', 'minor']).toContain(f.severity);
      expect(f.title.length).toBeGreaterThan(0);
    }
  });

  it('flags a page with nothing in <head>', () => {
    expect(rules(doc(''))).toEqual(['seo/missing-canonical', 'seo/missing-description', 'seo/missing-title', 'seo/missing-viewport', 'seo/og-image-missing', 'seo/og-text-missing']);
  });

  it('title and description length, with the measured length as evidence', () => {
    const longTitle = 'x'.repeat(SEO_LIMITS.titleMax + 5);
    const shortDesc = 'Too short.';
    const d = doc(GOOD_HEAD.replace('Checkout — Acme store', longTitle).replace(/content="Review[^"]*"/, `content="${shortDesc}"`));
    const found = detectSeoFindings(d);
    expect(found.map((f) => f.ruleId).sort()).toEqual(['seo/description-length', 'seo/title-length']);
    expect(found.find((f) => f.ruleId === 'seo/title-length')!.evidence!.metrics!.length).toBe(longTitle.length);
  });

  it('H1: none, and more than one', () => {
    expect(rules(doc(GOOD_HEAD, '<h2>x</h2>'))).toEqual(['seo/missing-h1']);
    expect(rules(doc(GOOD_HEAD, '<h1>a</h1><h1>b</h1>'))).toEqual(['seo/multiple-h1']);
  });

  it('ignores TraceBug\'s own headings', () => {
    expect(rules(doc(GOOD_HEAD, '<h1>Page</h1><div id="tracebug-root"><h1>TraceBug</h1></div>'))).toEqual([]);
  });

  it('two canonical links conflict', () => {
    expect(rules(doc(GOOD_HEAD + '<link rel="canonical" href="https://acme.example/other">'))).toEqual(['seo/multiple-canonical']);
  });

  it('noindex in robots or googlebot meta', () => {
    expect(rules(doc(GOOD_HEAD + '<meta name="robots" content="noindex, follow">'))).toEqual(['seo/noindex']);
    expect(rules(doc(GOOD_HEAD + '<meta name="googlebot" content="NOINDEX">'))).toEqual(['seo/noindex']);
    expect(rules(doc(GOOD_HEAD + '<meta name="robots" content="index, follow">'))).toEqual([]);
  });

  it('an empty description counts as missing', () => {
    expect(rules(doc(GOOD_HEAD.replace(/content="Review[^"]*"/, 'content="  "')))).toEqual(['seo/missing-description']);
  });
});

describe('social preview tags', () => {
  const base = GOOD_HEAD.replace(/<meta property="og:[^>]+>|<meta name="twitter:card"[^>]+>/g, '');
  it('reports a missing og:image, missing text tags and a missing twitter:card — only what is missing', () => {
    expect(rules(doc(base))).toEqual(['seo/og-image-missing', 'seo/og-text-missing']);
    expect(rules(doc(base + '<meta property="og:image" content="https://a.example/x.png">'))).toEqual(['seo/og-text-missing', 'seo/twitter-card-missing']);
  });
  it('flags a relative og:image', () => {
    expect(rules(doc(GOOD_HEAD.replace('https://acme.example/og.png', '/og.png')))).toEqual(['seo/og-image-relative']);
  });
});

describe('structured data', () => {
  it('reports JSON-LD that does not parse, and items without @type; valid blocks pass', () => {
    const ld = (j: string) => `<script type="application/ld+json">${j}</script>`;
    expect(rules(doc(GOOD_HEAD + ld('{"@context":"https://schema.org","@type":"Organization","name":"Acme"}')))).toEqual([]);
    expect(rules(doc(GOOD_HEAD + ld('{"@type":"FAQPage", }')))).toEqual(['seo/structured-data-invalid']);
    expect(rules(doc(GOOD_HEAD + ld('{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"name":"x"}]}')))).toEqual(['seo/structured-data-untyped']);
  });
});

describe('robots.txt', () => {
  it('follows Google: longest match wins, Allow wins ties, wildcards and $, specific agent group first', () => {
    const txt = `User-agent: *
Disallow: /admin
Disallow: /*.pdf$
Allow: /admin/public

User-agent: Googlebot
Disallow: /beta/`;
    expect(robotsAllows(txt, '/admin/x', 'bingbot')).toEqual({ allowed: false, rule: 'Disallow: /admin' });
    expect(robotsAllows(txt, '/admin/public/a', 'bingbot').allowed).toBe(true);
    expect(robotsAllows(txt, '/docs/a.pdf', 'bingbot').allowed).toBe(false);
    expect(robotsAllows(txt, '/docs/a.pdf?x=1', 'bingbot').allowed).toBe(true);
    // Googlebot has its own group, so the * group does not apply to it.
    expect(robotsAllows(txt, '/admin/x').allowed).toBe(true);
    expect(robotsAllows(txt, '/beta/x').allowed).toBe(false);
    expect(robotsAllows(`User-agent: *
Disallow:`, '/anything').allowed).toBe(true);
    expect(robotsAllows(`User-agent: *
Disallow: /`, '/').allowed).toBe(false);
    expect(robotsAllows('', '/').allowed).toBe(true);
  });

  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = (files: Record<string, [number, string]>) => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      const [status, body] = files[new URL(url).pathname] ?? [404, ''];
      return { ok: status === 200, status, text: async () => body } as Response;
    });
    return calls;
  };
  const loc = { origin: 'https://acme.example', pathname: '/shop', search: '' };

  it('reports a page blocked by robots.txt as critical; reads only this site', async () => {
    const calls = stubFetch({ '/robots.txt': [200, `User-agent: *
Disallow: /shop
Sitemap: https://acme.example/sitemap.xml`] });
    const r = await detectCrawlFindings(loc);
    expect(r.checked).toBe(true);
    expect(r.findings.map((f) => [f.ruleId, f.severity])).toEqual([['seo/robots-blocked', 'critical']]);
    expect(calls).toEqual(['https://acme.example/robots.txt']); // sitemap declared → not fetched
  });

  it('reports a missing sitemap only when robots.txt names none and /sitemap.xml is 404', async () => {
    stubFetch({ '/robots.txt': [200, `User-agent: *
Allow: /`] });
    expect((await detectCrawlFindings(loc)).findings.map((f) => f.ruleId)).toEqual(['seo/no-sitemap']);
    stubFetch({ '/robots.txt': [404, ''], '/sitemap.xml': [200, '<urlset/>'] });
    expect((await detectCrawlFindings(loc)).findings).toEqual([]);
  });

  it('says it could not check when robots.txt is unreachable', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('network'); });
    expect(await detectCrawlFindings(loc)).toEqual({ findings: [], checked: false });
  });
});

describe('image weight', () => {
  const img = (o: Partial<Parameters<typeof imageWeightFindings>[0][0]>) => ({ src: 'https://a.example/hero.jpg', bytes: 0, naturalW: 800, naturalH: 600, drawnW: 800, drawnH: 600, ...o });
  const ids = (s: ReturnType<typeof img>[], dpr = 1) => imageWeightFindings(s, dpr).map((f) => f.ruleId);
  it('flags an image with 4×+ the pixels needed, only when it is at least 50 KB', () => {
    expect(ids([img({ naturalW: 2400, naturalH: 1800, drawnW: 600, drawnH: 450, bytes: 60_000 })])).toEqual(['perf/image-oversized']);
    expect(ids([img({ naturalW: 2400, naturalH: 1800, drawnW: 600, drawnH: 450, bytes: 30_000 })])).toEqual([]);
    // A 1200×900 file for a 600×450 slot is a 2× (retina) asset: right, even audited on a 1× screen (GitHub does this).
    expect(ids([img({ naturalW: 1200, naturalH: 900, drawnW: 600, drawnH: 450, bytes: 90_000 })], 1)).toEqual([]);
    // A 3× screen needs 1800×1350: a 2400×1800 file is under 4× of that.
    expect(ids([img({ naturalW: 2400, naturalH: 1800, drawnW: 600, drawnH: 450, bytes: 90_000 })], 3)).toEqual([]);
  });
  it('flags JPEG/PNG of 100 KB+ for WebP/AVIF; not WebP, SVG, or small files; unknown size is skipped', () => {
    expect(ids([img({ bytes: 150_000 })])).toEqual(['perf/image-format']);
    expect(ids([img({ src: 'https://a.example/x.webp', bytes: 150_000 })])).toEqual([]);
    expect(ids([img({ src: 'https://a.example/x', contentType: 'image/png', bytes: 150_000 })])).toEqual(['perf/image-format']);
    // An image CDN sending WebP behind a .jpg URL, or a type the browser exposes but leaves blank: skipped.
    expect(ids([img({ contentType: 'image/webp', bytes: 150_000 })])).toEqual([]);
    expect(ids([img({ contentType: '', bytes: 150_000 })])).toEqual([]);
    expect(ids([img({ bytes: 60_000 })])).toEqual([]);
    expect(ids([img({ bytes: 0 })])).toEqual([]);
  });
  it('the tracebug.dev demo poster (1280×720 shown at 1086×610, ~60 KB JPEG) is fine', () => {
    expect(ids([img({ naturalW: 1280, naturalH: 720, drawnW: 1086, drawnH: 610, bytes: 61_000 })])).toEqual([]);
  });
});
