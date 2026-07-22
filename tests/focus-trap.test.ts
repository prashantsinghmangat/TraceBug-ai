import { describe, it, expect, beforeEach } from 'vitest';
import { getFocusableElements, trapModalTab } from '../src/ui/quick-bug';

// jsdom: getClientRects returns [] for everything by default, so stub it to
// report a rect for elements not explicitly hidden — mirrors "visible".
function makeModal(html: string): HTMLElement {
  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal);
  for (const el of Array.from(modal.querySelectorAll<HTMLElement>('*'))) {
    const hidden = el.style.display === 'none' || el.closest('[hidden]');
    el.getClientRects = (() => (hidden ? [] : [{ width: 10, height: 10 }])) as any;
  }
  return modal;
}

function tabEvent(shift = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true });
}

describe('getFocusableElements', () => {
  it('returns visible focusables in DOM order, skipping disabled and hidden', () => {
    const modal = makeModal(`
      <button id="a">A</button>
      <input id="b" />
      <button id="c" disabled>C</button>
      <div hidden><button id="d">D</button></div>
      <a href="#" id="e">E</a>
    `);
    const ids = getFocusableElements(modal).map((el) => el.id);
    expect(ids).toEqual(['a', 'b', 'e']);
    document.body.removeChild(modal);
  });
});

describe('trapModalTab', () => {
  let modal: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    modal = makeModal('<button id="first">F</button><input id="mid" /><button id="last">L</button>');
  });

  it('Tab on the last element wraps to the first', () => {
    (modal.querySelector('#last') as HTMLElement).focus();
    const e = tabEvent(false);
    const handled = trapModalTab(e, modal);
    expect(handled).toBe(true);
    expect(document.activeElement).toBe(modal.querySelector('#first'));
  });

  it('Shift+Tab on the first element wraps to the last', () => {
    (modal.querySelector('#first') as HTMLElement).focus();
    const e = tabEvent(true);
    expect(trapModalTab(e, modal)).toBe(true);
    expect(document.activeElement).toBe(modal.querySelector('#last'));
  });

  it('pulls focus back inside when it is outside the modal', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(trapModalTab(tabEvent(false), modal)).toBe(true);
    expect(document.activeElement).toBe(modal.querySelector('#first'));
  });

  it('does not interfere with Tab in the middle of the ring', () => {
    (modal.querySelector('#first') as HTMLElement).focus();
    // forward Tab from first (not last) → not handled, native behavior proceeds
    expect(trapModalTab(tabEvent(false), modal)).toBe(false);
  });

  it('ignores non-Tab keys', () => {
    expect(trapModalTab(new KeyboardEvent('keydown', { key: 'a' }), modal)).toBe(false);
  });
});
