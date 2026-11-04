import { describe, it, expect } from 'vitest';
import { redactUrlsInText, isBrowserFavicon } from '../src/url-hygiene';
import { sanitizeTokenShapes } from '../src/sanitize/cloud-upload';
import { scrubHiddenInputs } from '../src/rrweb-recorder';

// Three leaks/false failures found by e2e/report-quality.e2e.mjs (1.12 benchmark).

describe('URLs inside text', () => {
  it('masks a token in a stack frame and keeps line:col', () => {
    const stack = 'TypeError: x\n    at applyCoupon (http://shop.test/?ref=mail&access_token=abc123:42:7)';
    const out = redactUrlsInText(stack);
    expect(out).not.toContain('abc123');
    expect(out).toContain('access_token=[REDACTED]:42:7)');
    expect(out).toContain('ref=mail');
  });

  it('runs as part of the shared text scrub (stacks, console messages)', () => {
    expect(sanitizeTokenShapes('GET https://api.test/v1?api_key=zzz9 failed')).not.toContain('zzz9');
  });

  it('leaves text without URLs alone', () => {
    expect(redactUrlsInText('token=abc in plain text')).toBe('token=abc in plain text');
  });
});

describe('browser favicon', () => {
  it('matches only the root favicon.ico', () => {
    expect(isBrowserFavicon('http://shop.test/favicon.ico')).toBe(true);
    expect(isBrowserFavicon('/favicon.ico?v=2')).toBe(true);
    expect(isBrowserFavicon('http://shop.test/img/favicon.ico')).toBe(false);
    expect(isBrowserFavicon('/api/favicon')).toBe(false);
  });
});

describe('hidden inputs in the DOM replay', () => {
  const input = (id: number, type: string, value: string) =>
    ({ type: 2, id, tagName: 'input', attributes: { type, value }, childNodes: [] });

  it('drops a hidden input value from a full snapshot, keeps a visible one', () => {
    const ev = { type: 2, data: { node: { type: 0, childNodes: [input(5, 'hidden', 'CSRF1'), input(6, 'text', 'shown')] } } };
    const hidden = new Set<number>();
    scrubHiddenInputs(ev, hidden);
    const kids = (ev.data.node.childNodes as Array<{ attributes: { value: string } }>);
    expect(kids[0].attributes.value).toBe('');
    expect(kids[1].attributes.value).toBe('shown');
    expect(hidden.has(5)).toBe(true);
  });

  it('drops it from added nodes and later attribute changes', () => {
    const hidden = new Set<number>();
    const add = { type: 3, data: { source: 0, adds: [{ node: input(9, 'HIDDEN', 'CSRF2') }], attributes: [] } };
    scrubHiddenInputs(add, hidden);
    expect((add.data.adds[0].node.attributes as { value: string }).value).toBe('');
    const change = { type: 3, data: { source: 0, adds: [], attributes: [{ id: 9, attributes: { value: 'CSRF3' } }] } };
    scrubHiddenInputs(change, hidden);
    expect(change.data.attributes[0].attributes.value).toBe('');
  });
});
