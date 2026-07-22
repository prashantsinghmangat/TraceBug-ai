import { describe, it, expect, afterEach } from 'vitest';
import { isTraceBugUiElement } from '../src/dom-helpers';

function el(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap.firstElementChild as HTMLElement;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('isTraceBugUiElement (unified mode-tool exclusion)', () => {
  it('matches every prefix set the three tools used to check separately', () => {
    expect(isTraceBugUiElement(el('<div id="tracebug-root"></div>'))).toBe(true);   // annotate + all
    expect(isTraceBugUiElement(el('<div id="bt-toolbar"></div>'))).toBe(true);       // annotate (bt-)
    expect(isTraceBugUiElement(el('<div class="tracebug-panel"></div>'))).toBe(true);
    expect(isTraceBugUiElement(el('<div class="tb-qb-btn"></div>'))).toBe(true);     // blur
    expect(isTraceBugUiElement(el('<div class="tb-hud"></div>'))).toBe(true);        // blur
    expect(isTraceBugUiElement(el('<div class="tb-rs-root"></div>'))).toBe(true);    // scrubber
    expect(isTraceBugUiElement(el('<div data-tracebug="x"></div>'))).toBe(true);     // blur/annotate
  });

  it('does NOT match host content carrying our redaction markers (tb-mask/tb-block)', () => {
    // These classes are applied to the USER's page elements (blur/redact), not
    // our widget — a bare `tb-` match here broke second-click-to-unblur.
    expect(isTraceBugUiElement(el('<p class="tb-mask">secret</p>'))).toBe(false);
    expect(isTraceBugUiElement(el('<div class="tb-block"></div>'))).toBe(false);
  });

  it('matches when an ANCESTOR is ours (walks up the tree)', () => {
    const child = el('<div id="tracebug-root"><span><b id="deep">x</b></span></div>')
      .querySelector('#deep') as HTMLElement;
    expect(isTraceBugUiElement(child)).toBe(true);
  });

  it('leaves genuine page elements alone', () => {
    expect(isTraceBugUiElement(el('<button class="btn primary">Buy</button>'))).toBe(false);
    expect(isTraceBugUiElement(el('<div id="checkout"></div>'))).toBe(false);
    expect(isTraceBugUiElement(el('<input name="coupon" />'))).toBe(false);
    expect(isTraceBugUiElement(null)).toBe(false);
  });
});
