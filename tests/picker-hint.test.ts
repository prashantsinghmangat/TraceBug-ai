// Phase 4: the one line shown before the browser's share dialog opens.
//
// The dialog is the browser's own and offers three surfaces with no hint of
// which one a bug report wants. Picking "Entire screen" records the tester's
// whole desktop; picking the wrong tab records the wrong page. Neither is
// recoverable after the fact, and neither is undoable mid-recording.
//
// The copy has to match what the dialog will actually look like, which depends
// on the mode: "Current tab" passes preferCurrentTab and collapses the dialog
// to a one-click confirm, so telling that user to "pick this tab from the list"
// would describe a list they aren't looking at.
import { describe, it, expect, afterEach } from 'vitest';
import { showPickerHint, hidePickerHint } from '../src/ui/pre-record';

const HINT = '#tracebug-picker-hint';
const hint = () => document.querySelector(HINT);

afterEach(() => {
  hidePickerHint();
  document.body.innerHTML = '';
});

describe('showPickerHint', () => {
  it('mounts one line', () => {
    showPickerHint('desktop');
    expect(hint()).toBeTruthy();
    expect(hint()!.textContent).toBeTruthy();
  });

  it('tells a desktop-picker user to pick this tab', () => {
    showPickerHint('desktop');
    expect(hint()!.textContent).toMatch(/pick this tab/i);
  });

  it('tells a current-tab user to confirm, not to pick from a list', () => {
    // preferCurrentTab collapses the dialog; there is no list to pick from.
    showPickerHint('tab');
    const text = hint()!.textContent!;
    expect(text).toMatch(/already set to this tab/i);
    expect(text).not.toMatch(/pick this tab/i);
  });

  it('defaults to the full-picker wording when the mode is unknown', () => {
    // The safer default: describing a list that turns out to be collapsed is a
    // smaller failure than telling someone to confirm a dialog that is asking
    // them to choose.
    showPickerHint(undefined);
    expect(hint()!.textContent).toMatch(/pick this tab/i);
  });

  it('never stacks two hints', () => {
    showPickerHint('tab');
    showPickerHint('desktop');
    expect(document.querySelectorAll(HINT)).toHaveLength(1);
    expect(hint()!.textContent).toMatch(/pick this tab/i);
  });

  it('cannot be hidden or restyled by the host page', () => {
    // It mounts into a page whose CSS we do not control, so the positioning and
    // visibility have to be !important or a hostile/greedy stylesheet wins.
    //
    // This used to assert style.setProperty(el, 'position', 'fixed',
    // 'important') directly on the element, on the theory that the CSSOM API
    // survives a strict CSP where the attribute/cssText form doesn't. That
    // theory was wrong — confirmed on a real page, not assumed: a style-src
    // CSP with a nonce and no 'unsafe-inline' blocks ANY inline style
    // mutation, .style.setProperty() included, with no nonce/hash escape for
    // style attributes at all (that's spec'd). The fix moved this into a
    // real <style> tag instead — a nonce can authorize THAT, so this now
    // asserts the stylesheet actually carries the rule, not a direct
    // property read that a strict-CSP page would silently never have set.
    showPickerHint('tab');
    const styleEl = document.getElementById('tracebug-pre-record-styles');
    expect(styleEl).toBeTruthy();
    expect(styleEl!.tagName).toBe('STYLE');
    const css = styleEl!.textContent || '';
    expect(css).toMatch(/#tracebug-picker-hint\s*\{[^}]*position:\s*fixed\s*!important/);
    expect(css).toMatch(/#tracebug-picker-hint\s*\{[^}]*z-index:\s*2147483647\s*!important/);
  });

  it('does not take clicks away from the page', () => {
    // It sits top-centre over the page for a second or two while the dialog
    // opens; it must not eat a click meant for the app underneath. Same CSP
    // reasoning as above — asserted against the stylesheet, not a direct
    // .style read.
    showPickerHint('tab');
    const styleEl = document.getElementById('tracebug-pre-record-styles');
    const css = styleEl!.textContent || '';
    expect(css).toMatch(/#tracebug-picker-hint\s*\{[^}]*pointer-events:\s*none\s*!important/);
  });

  it('is announced to screen readers', () => {
    showPickerHint('tab');
    expect(hint()!.getAttribute('role')).toBe('status');
    expect(hint()!.getAttribute('aria-live')).toBe('polite');
  });
});

describe('hidePickerHint', () => {
  it('removes it', () => {
    showPickerHint('tab');
    hidePickerHint();
    expect(hint()).toBeNull();
  });

  it('is safe when nothing is showing', () => {
    expect(() => { hidePickerHint(); hidePickerHint(); }).not.toThrow();
  });
});
