// setInnerHTML (src/ui/helpers.ts) is the fix for a real bug: a host page
// that enforces Trusted Types CSP (require-trusted-types-for 'script' —
// confirmed live on stitch.withgoogle.com's own response headers) throws
// synchronously on a raw `el.innerHTML = html` assignment, partway through
// mounting the dashboard, leaving the toolbar/HUD/ticket modal half-built or
// entirely silent. Every module-level `_ttPolicy` cache is reset between
// tests via `vi.resetModules()` + a fresh dynamic import, since it's a
// one-shot cache that would otherwise leak across cases.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as Window & { trustedTypes?: unknown }).trustedTypes;
});

async function freshSetInnerHTML() {
  const { vi } = await import('vitest');
  vi.resetModules();
  return (await import('../src/ui/helpers')).setInnerHTML;
}

function makeBlockedEl(message = "Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment."): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'innerHTML', {
    set() { throw new TypeError(message); },
    configurable: true,
  });
  return el;
}

/**
 * A real Trusted-Types-enforcing page's native innerHTML setter accepts a
 * TrustedHTML instance and unwraps it, but still throws on a plain string.
 * `makeBlockedEl` can't express that distinction once overridden, so the
 * tier-2 tests use this instead: the setter checks the brand and, when
 * present, writes through to the REAL native setter (so assertions see real
 * DOM, not a second mock).
 */
class FakeTrustedHTML {
  constructor(public readonly value: string) {}
}

function makeTrustedTypesAwareEl(): HTMLElement {
  const el = document.createElement('div');
  const nativeSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!.set!;
  Object.defineProperty(el, 'innerHTML', {
    set(v: unknown) {
      if (v instanceof FakeTrustedHTML) { nativeSetter.call(el, v.value); return; }
      throw new TypeError("Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.");
    },
    configurable: true,
  });
  return el;
}

describe('setInnerHTML — tier 1: the direct assignment', () => {
  it('behaves exactly like el.innerHTML = html on an ordinary page', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = document.createElement('div');
    setInnerHTML(el, '<span class="a">hi</span><button>go</button>');
    expect(el.querySelector('span.a')?.textContent).toBe('hi');
    expect(el.querySelector('button')?.textContent).toBe('go');
  });
});

describe('setInnerHTML — tier 2: our own Trusted Types policy', () => {
  beforeEach(() => {
    // A page enforcing Trusted Types WITHOUT restricting which policy names
    // may be created — the real-world case on stitch.withgoogle.com (its CSP
    // has `require-trusted-types-for 'script'` with no `trusted-types`
    // allow-list directive at all).
    (window as Window & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (_name: string, rules: { createHTML: (s: string) => string }) => ({
        createHTML: (s: string) => new FakeTrustedHTML(rules.createHTML(s)),
      }),
    };
  });

  it('renders the real content via the policy instead of going empty', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = makeTrustedTypesAwareEl();
    setInnerHTML(el, '<span class="a">hi</span><button>go</button>');
    expect(el.querySelector('span.a')?.textContent).toBe('hi');
    expect(el.querySelector('button')?.textContent).toBe('go');
  });

  it('replaces existing children rather than appending to them', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = makeTrustedTypesAwareEl();
    const stale = document.createElement('p');
    stale.textContent = 'old';
    el.appendChild(stale);
    setInnerHTML(el, '<span>new</span>');
    expect(el.children.length).toBe(1);
    expect(el.textContent).toBe('new');
  });

  it('preserves inline SVG content', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = makeTrustedTypesAwareEl();
    setInnerHTML(el, '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.4"/></svg>');
    expect(el.querySelector('svg circle')).not.toBeNull();
  });

  it('creates the policy only once, even across many calls', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    let createCount = 0;
    (window as Window & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: (_name: string, rules: { createHTML: (s: string) => string }) => {
        createCount++;
        return { createHTML: (s: string) => new FakeTrustedHTML(rules.createHTML(s)) };
      },
    };
    setInnerHTML(makeTrustedTypesAwareEl(), '<span>a</span>');
    setInnerHTML(makeTrustedTypesAwareEl(), '<span>b</span>');
    setInnerHTML(makeTrustedTypesAwareEl(), '<span>c</span>');
    expect(createCount).toBe(1);
  });
});

describe('setInnerHTML — tier 3: no usable path at all', () => {
  it('degrades to empty rather than throwing when there is no trustedTypes global', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = makeBlockedEl();
    expect(() => setInnerHTML(el, '<span>x</span>')).not.toThrow();
    expect(el.children.length).toBe(0);
  });

  it('degrades to empty when the site also restricts which policy names are allowed', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    (window as Window & { trustedTypes?: unknown }).trustedTypes = {
      createPolicy: () => { throw new TypeError("Failed to execute 'createPolicy' on 'TrustedTypePolicyFactory': Policy \"tracebug-html\" disallowed."); },
    };
    const el = makeBlockedEl();
    expect(() => setInnerHTML(el, '<span>x</span>')).not.toThrow();
    expect(el.children.length).toBe(0);
  });

  it('clears stale children rather than leaving old markup behind', async () => {
    const setInnerHTML = await freshSetInnerHTML();
    const el = makeBlockedEl();
    const stale = document.createElement('p');
    stale.textContent = 'old';
    el.appendChild(stale);
    setInnerHTML(el, '<span>new</span>');
    expect(el.children.length).toBe(0);
  });
});
