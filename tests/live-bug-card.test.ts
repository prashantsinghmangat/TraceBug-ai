// T-06 (docs/audit/product-review.md): while a capture is already running,
// the error-detected card must not offer its own Capture Bug button — the
// running capture already covers the error, and a second "start a capture"
// action is either redundant or confusing. Outside a capture, the button
// stays exactly as it was. index.ts enforces the gate (passes no onCapture
// while this.isRecording()); this pins the card's own contract: no handler
// in, no button out.
import { describe, it, expect, afterEach } from 'vitest';
import { showLiveBugCard, hideLiveBugCard } from '../src/ui/live-bug-card';

afterEach(() => {
  hideLiveBugCard();
  document.body.innerHTML = '';
});

function mountRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

const captureBtn = () => document.querySelector('[data-action="capture"]');

describe('Live Bug Card — Capture Bug button', () => {
  it('shows the button when onCapture is provided (no capture running)', () => {
    showLiveBugCard(mountRoot(), { message: 'TypeError: x is undefined', onCapture: () => {} });
    expect(captureBtn()).toBeTruthy();
  });

  it('omits the button entirely when onCapture is not provided (a capture is running)', () => {
    showLiveBugCard(mountRoot(), { message: 'TypeError: x is undefined' });
    expect(captureBtn()).toBeFalsy();
    // The card itself still shows — only the button is gone.
    expect(document.querySelector('.tb-lbc-title')?.textContent).toContain('TypeError');
  });

  it('dismiss still works with no Capture Bug button present', () => {
    showLiveBugCard(mountRoot(), { message: 'boom' });
    const dismiss = document.querySelector<HTMLButtonElement>('[data-action="dismiss"]');
    expect(dismiss).toBeTruthy();
    dismiss!.click();
    expect(document.getElementById('tracebug-live-bug-card')).toBeFalsy();
  });
});
