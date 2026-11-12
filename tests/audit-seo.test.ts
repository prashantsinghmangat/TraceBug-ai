import { describe, it, expect } from 'vitest';
import { detectSeoFindings, SEO_LIMITS } from '../src/audit/detectors/seo';

// SEO checks read only the document, so they run in jsdom.

const doc = (head: string, body = '<h1>Checkout</h1>'): Document =>
  new DOMParser().parseFromString(`<!doctype html><html lang="en"><head>${head}</head><body>${body}</body></html>`, 'text/html');

const GOOD_HEAD =
  '<title>Checkout — Acme store</title>' +
  '<meta name="description" content="Review your cart, apply a coupon and place your order securely with Acme in under a minute.">' +
  '<link rel="canonical" href="https://acme.example/checkout">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">';

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
    expect(rules(doc(''))).toEqual(['seo/missing-canonical', 'seo/missing-description', 'seo/missing-title', 'seo/missing-viewport']);
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
