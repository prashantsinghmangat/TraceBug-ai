import { describe, it, expect, afterEach } from 'vitest';
import { clickContextFields, collectClicks } from '../src/collectors';

afterEach(() => { document.body.innerHTML = ''; });

describe('clickContextFields', () => {
  it('reports a value typed before the capture next to the clicked button', () => {
    document.body.innerHTML = `
      <div class="card"><div class="row">
        <input id="coupon" value="SAVE20"><button id="applyBtn">Apply coupon</button>
      </div></div>`;
    const fields = clickContextFields(document.getElementById('applyBtn')!);
    expect(fields).toMatchObject([{ name: 'coupon', value: 'SAVE20' }]);
  });

  it('uses the whole form when the button is inside one', () => {
    document.body.innerHTML = `
      <form id="f">
        <div><input name="city" value="Pune"></div>
        <div><textarea name="note">leave at door</textarea></div>
        <div><button type="submit">Save</button></div>
      </form>`;
    const names = clickContextFields(document.querySelector('button')!).map((f) => f.name);
    expect(names).toEqual(['city', 'note']);
  });

  it('leaves out sensitive, personal and empty fields entirely', () => {
    document.body.innerHTML = `
      <form>
        <input type="password" name="pw" value="hunter2">
        <input name="api_token" value="abc">
        <input type="email" name="mail" value="a@b.co">
        <input type="tel" name="phone" value="123">
        <input name="card" autocomplete="cc-number" value="4111111111111111">
        <input name="otp" autocomplete="one-time-code" value="123456">
        <input type="hidden" name="csrf" value="x">
        <input name="empty" value="">
        <input name="ok" value="kept">
        <button>Go</button>
      </form>`;
    const fields = clickContextFields(document.querySelector('button')!);
    expect(fields.map((f) => f.name)).toEqual(['ok']);
    expect(JSON.stringify(fields)).not.toContain('hunter2');
  });

  it('returns nothing for a click that is not on a button or link', () => {
    document.body.innerHTML = `<div><input id="q" value="x"><span id="s">text</span></div>`;
    expect(clickContextFields(document.getElementById('s')!)).toEqual([]);
  });

  it('caps the number of fields', () => {
    document.body.innerHTML = `<form>${Array.from({ length: 9 }, (_, i) => `<input name="f${i}" value="v${i}">`).join('')}<button>Go</button></form>`;
    expect(clickContextFields(document.querySelector('button')!)).toHaveLength(5);
  });
});

describe('collectClicks', () => {
  it('attaches the click-context fields to the click event', () => {
    document.body.innerHTML = `<div><input id="coupon" value="SAVE20"><button id="applyBtn">Apply coupon</button></div>`;
    const emitted: Array<{ type: string; data: any }> = [];
    const stop = collectClicks((type: any, data: any) => emitted.push({ type, data }));
    try {
      document.getElementById('applyBtn')!.click();
    } finally { stop(); }
    expect(emitted[0].type).toBe('click');
    expect(emitted[0].data.fields).toMatchObject([{ name: 'coupon', value: 'SAVE20' }]);
  });
});
