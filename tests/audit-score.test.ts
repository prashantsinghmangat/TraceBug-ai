import { describe, it, expect } from 'vitest';
import { scoreAudit, scoreBand, scoreCategory, SCORE_WEIGHTS } from '../src/audit/score';
import { contrastRatio, parseHex, parseExpectedRatio, suggestTextColor } from '../src/audit/contrast';
import { cleanWcag, wcagFromAxeTags, wcagLabel } from '../src/audit/wcag';
import { buildAuditRun, MAX_AUDIT_FINDINGS } from '../src/audit/run';
import { cleanFailureSummary } from '../src/audit/detectors/a11y';
import type { Issue } from '../src/types';

// Audit score, contrast suggestion and WCAG mapping (1.12.0). The score must be
// reproducible by hand from the formula in src/audit/score.ts.

const f = (ruleId: string, severity: Issue['severity'], occurrences = 1) => ({ ruleId, severity, occurrences });

describe('score', () => {
  it('is 100 with no findings', () => {
    expect(scoreCategory([])).toBe(100);
  });

  it('subtracts the severity weight once per distinct rule', () => {
    expect(SCORE_WEIGHTS).toEqual({ critical: 20, serious: 10, moderate: 5, minor: 2 });
    expect(scoreCategory([f('a', 'serious')])).toBe(90);
    expect(scoreCategory([f('a', 'critical'), f('b', 'moderate'), f('c', 'minor')])).toBe(73);
  });

  it('adds a quarter weight per extra element of the same rule, capped at double', () => {
    // 2 elements: 10 × 1.25 = 12.5 → 87.5 → 88
    expect(scoreCategory([f('color-contrast', 'serious'), f('color-contrast', 'serious')])).toBe(88);
    expect(scoreCategory([f('color-contrast', 'serious', 2)])).toBe(88);
    // 5 elements reach the cap: 10 × 2 = 20; 50 elements still 20.
    expect(scoreCategory([f('x', 'serious', 5)])).toBe(80);
    expect(scoreCategory([f('x', 'serious', 50)])).toBe(80);
  });

  it('uses the worst severity among a rule\'s findings', () => {
    expect(scoreCategory([f('x', 'minor'), f('x', 'critical')])).toBe(100 - 20 * 1.25);
  });

  it('never goes below 0', () => {
    const many = Array.from({ length: 10 }, (_, i) => f(`r${i}`, 'critical', 9));
    expect(scoreCategory(many)).toBe(0);
  });

  it('the page from the OverlayQA comparison: 2 contrast + 2 label-in-name (serious), 1 focus-obscured (moderate)', () => {
    // 12.5 + 12.5 + 5 = 30 → 70
    expect(scoreCategory([f('color-contrast', 'serious', 2), f('label-content-name-mismatch', 'serious', 2), f('kbd/focus-obscured', 'moderate')])).toBe(70);
  });

  it('leaves out categories that did not run, and has no overall when none ran', () => {
    const s = scoreAudit(
      [{ name: 'accessibility', ran: true }, { name: 'seo', ran: true }, { name: 'performance', ran: false }],
      [{ category: 'accessibility', ...f('a', 'serious') }, { category: 'performance', ...f('p', 'critical') }],
    );
    expect(s.categories).toEqual({ accessibility: 90, seo: 100 });
    // Overall pools the problems of the categories that ran (the performance one did not run).
    expect(s.overall).toBe(90);
    const two = scoreAudit([{ name: 'accessibility', ran: true }, { name: 'seo', ran: true }],
      [{ category: 'accessibility', ...f('a', 'serious', 2) }, { category: 'seo', ...f('s', 'minor') }]);
    // 100 − 12.5 − 2 = 85.5 → 86 (not the mean of 88 and 98)
    expect(two).toEqual({ overall: 86, categories: { accessibility: 88, seo: 98 } });
    expect(scoreAudit([{ name: 'seo', ran: false }], []).overall).toBeNull();
  });

  it('bands: 90+ good, 50–89 fair, below 50 poor', () => {
    expect([scoreBand(100), scoreBand(90), scoreBand(89), scoreBand(50), scoreBand(49), scoreBand(0)])
      .toEqual(['good', 'good', 'fair', 'fair', 'poor', 'poor']);
  });

  it('buildAuditRun scores ALL findings, not only the ones kept under the cap', () => {
    const findings: Issue[] = Array.from({ length: MAX_AUDIT_FINDINGS + 30 }, (_, i) => ({
      id: `i${i}`, detector: 'axe-a11y', category: 'accessibility', ruleId: `rule-${i}`, severity: 'minor',
      title: 't', description: 'd', selector: `#e${i}`, page: 'https://x.test/', detectedAt: 0,
    } as Issue));
    const run = buildAuditRun(findings, { url: 'https://x.test/', viewport: { width: 1, height: 1 }, categories: { accessibility: { ran: true } } });
    expect(run.truncated).toBe(30);
    expect(run.score?.categories.accessibility).toBe(0); // 230 × 2 points, floored at 0
  });
});

describe('contrast suggestion', () => {
  it('matches axe on the measured pairs', () => {
    expect(contrastRatio(parseHex('#b45309')!, parseHex('#f4eae4')!)).toBeCloseTo(4.24, 2);
    expect(contrastRatio(parseHex('#dc2626')!, parseHex('#faf2f3')!)).toBeCloseTo(4.38, 2);
  });

  it('suggests the nearest passing colour, and the rounded hex really passes', () => {
    for (const [fg, bg] of [['#b45309', '#f4eae4'], ['#dc2626', '#faf2f3'], ['#999999', '#ffffff'], ['#5a5a5a', '#111111']]) {
      const s = suggestTextColor(fg, bg, 4.5)!;
      expect(s).not.toBeNull();
      expect(contrastRatio(parseHex(s.color)!, parseHex(bg)!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(parseHex(s.color)!, parseHex(bg)!)).toBeLessThan(4.75); // nearest, not black/white
    }
  });

  it('goes lighter on a dark background', () => {
    const s = suggestTextColor('#5a5a5a', '#111111', 4.5)!;
    expect(parseHex(s.color)![0]).toBeGreaterThan(0x5a);
  });

  it('returns null when nothing passes or it already passes', () => {
    expect(suggestTextColor('#888888', '#808080', 7)).toBeNull();
    expect(suggestTextColor('#000000', '#ffffff', 4.5)).toBeNull();
    expect(suggestTextColor('nope', '#fff', 4.5)).toBeNull();
  });

  it('reads axe\'s expected ratio', () => {
    expect(parseExpectedRatio('4.5:1')).toBe(4.5);
    expect(parseExpectedRatio(3)).toBe(3);
    expect(parseExpectedRatio('x')).toBeNull();
  });
});

describe('WCAG mapping', () => {
  it('turns axe tags into known criteria', () => {
    expect(wcagFromAxeTags(['cat.color', 'wcag2aa', 'wcag143', 'EN-9.1.4.3'])).toEqual(['1.4.3']);
    expect(wcagFromAxeTags(['wcag1410', 'wcag253'])).toEqual(['1.4.10', '2.5.3']);
    expect(wcagFromAxeTags(['wcag999'])).toEqual([]);
    expect(wcagLabel('1.4.3')).toBe('1.4.3 Contrast (Minimum)');
    expect(wcagLabel('2.4.11')).toBe('2.4.11 Focus Not Obscured (Minimum)');
  });

  it('cleans untrusted lists', () => {
    expect(cleanWcag(['1.4.3', '<b>', 7, '1.4.3'])).toEqual(['1.4.3']);
    expect(cleanWcag('1.4.3')).toBeUndefined();
    expect(cleanWcag([])).toBeUndefined();
  });

  it('cleans axe failure summaries', () => {
    expect(cleanFailureSummary('Fix any of the following:\n  Element has insufficient color contrast of 4.24')).toBe('Element has insufficient color contrast of 4.24');
    expect(cleanFailureSummary('Fix all of the following:\n  A\n  B')).toBe('A B');
    expect(cleanFailureSummary(undefined)).toBeUndefined();
  });
});

describe('default fixes', () => {
  it('every layout, SEO, performance and runtime rule the detectors emit has a fix', async () => {
    const fs = await import('node:fs');
    const { DEFAULT_FIXES, fixFor } = await import('../src/audit/fixes');
    const src = ['ui', 'seo', 'performance'].map((n) => fs.readFileSync(`src/audit/detectors/${n}.ts`, 'utf8')).join('\n');
    const ids = [...new Set([...src.matchAll(/"((?:ui|seo|perf)\/[a-z-]+)"/g)].map((m) => m[1]))];
    expect(ids.length).toBeGreaterThan(20);
    for (const id of ids) expect(DEFAULT_FIXES[id], id).toBeTruthy();
    for (const d of ['console-error', 'failed-request', 'mixed-content', 'frustration-dead', 'frustration-rage']) expect(fixFor(`runtime/${d}`, undefined)).toBeTruthy();
    expect(fixFor('color-contrast', 'own text')).toBe('own text');
    expect(fixFor('__proto__', undefined)).toBeUndefined();
  });
});
