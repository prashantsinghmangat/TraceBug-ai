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
    showPickerHint('tab');
    const style = hint()!.getAttribute('style')!;
    expect(style).toMatch(/position:fixed!important/);
    expect(style).toMatch(/z-index:2147483647!important/);
  });

  it('does not take clicks away from the page', () => {
    // It sits top-centre over the page for a second or two while the dialog
    // opens; it must not eat a click meant for the app underneath.
    showPickerHint('tab');
    expect(hint()!.getAttribute('style')).toMatch(/pointer-events:none!important/);
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
