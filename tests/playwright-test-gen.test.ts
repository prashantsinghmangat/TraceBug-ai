import { describe, it, expect } from 'vitest';
import { generatePlaywrightTest, playwrightTestFilename } from '../src/exporters/playwright-test';
import type { BugReport, TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, ts: number, page = '/checkout'): TraceBugEvent {
  return { id: 'e' + ts, sessionId: 's', projectId: 'p', type, page, timestamp: ts, data };
}

function report(events: TraceBugEvent[], overrides: Partial<BugReport> = {}): BugReport {
  return {
    title: 'Checkout: "Place order" fails — 404', summary: '', steps: '',
    environment: { url: 'https://shop.example.com/checkout' },
    consoleErrors: [], networkErrors: [], networkRequests: [], sessionSteps: [],
    actionChips: [], clickedElement: null, rootCause: null, severity: 'high',
    priority: 'p1', annotations: [], screenshots: [], timeline: [],
    voiceTranscripts: [], context: {}, generatedAt: 1751790000000,
    session: { sessionId: 'sess-abc-123', projectId: 'p', createdAt: 0, updatedAt: 1, events, annotations: [] },
    ...overrides,
  } as unknown as BugReport;
}

describe('generatePlaywrightTest', () => {
  it('returns null when the session has no replayable actions', () => {
    expect(generatePlaywrightTest(report([]))).toBeNull();
    expect(generatePlaywrightTest(report([ev('route_change', { to: '/x' }, 1)]))).toBeNull();
  });

  it('prefers testId > id > aria-label > role+text > css selector for clicks', () => {
    const spec = generatePlaywrightTest(report([
      ev('click', { element: { testId: 'submit-btn', id: 'sb', text: 'Submit' } }, 1),
      ev('click', { element: { id: 'cancel', text: 'Cancel' } }, 2),
      ev('click', { element: { ariaLabel: 'Close dialog' } }, 3),
      ev('click', { element: { tag: 'button', text: 'Place order' } }, 4),
      ev('click', { element: { tag: 'div', selector: '.card > .row:nth-of-type(2)' } }, 5),
    ]))!;
    expect(spec).toContain("page.getByTestId('submit-btn').click()");
    expect(spec).toContain("page.locator('#cancel').click()");
    expect(spec).toContain("page.getByLabel('Close dialog').click()");
    expect(spec).toContain("page.getByRole('button', { name: 'Place order' }).click()");
    expect(spec).toContain("page.locator('.card > .row:nth-of-type(2)').click()");
  });

  it('fills inputs, uses a TODO placeholder for redacted values', () => {
    const spec = generatePlaywrightTest(report([
      ev('input', { element: { name: 'coupon', type: 'text', value: 'SAVE20', selector: '#coupon' } }, 1),
      ev('input', { element: { name: 'password', type: 'password', value: '[REDACTED]' } }, 2),
      ev('click', { element: { id: 'go' } }, 3),
    ]))!;
    expect(spec).toContain("page.locator('#coupon').fill('SAVE20')");
    expect(spec).toContain("fill('TODO-redacted-value')");
    expect(spec).toContain('value was masked at capture');
  });

  it('dedupes consecutive identical clicks (rage clicks)', () => {
    const spec = generatePlaywrightTest(report([
      ev('click', { element: { id: 'save' } }, 1),
      ev('click', { element: { id: 'save' } }, 2),
      ev('click', { element: { id: 'save' } }, 3),
    ]))!;
    expect(spec.match(/#save/g)!.length).toBe(1);
  });

  it('asserts on the captured network failure, skipping noise requests', () => {
    const spec = generatePlaywrightTest(report(
      [ev('click', { element: { id: 'order' } }, 1)],
      {
        networkErrors: [
          { method: 'GET', url: 'https://img.shields.io/badge/x.svg', status: 404, duration: 5, timestamp: 1 },
          { method: 'POST', url: 'https://shop.example.com/api/orders?token=[REDACTED]', status: 404, duration: 80, timestamp: 2 },
        ],
      } as any
    ))!;
    expect(spec).toContain("f.includes('/api/orders')");
    expect(spec).not.toContain('shields.io');
    expect(spec).toContain('failedRequests');
    expect(spec).toContain("toEqual([])");
  });

  it('falls back to console-error assertion when no request failed', () => {
    const spec = generatePlaywrightTest(report(
      [ev('click', { element: { id: 'order' } }, 1)],
      { consoleErrors: [{ message: "TypeError: Cannot read properties of undefined (reading 'discount')", timestamp: 2 }] } as any
    ))!;
    expect(spec).toContain('pageerror');
    expect(spec).toContain("e.includes('TypeError: Cannot read properties of undefined (reading");
  });

  it('uses the captured origin and start path, overridable via BASE_URL env', () => {
    const spec = generatePlaywrightTest(report([ev('click', { element: { id: 'x' } }, 1, '/checkout')]))!;
    expect(spec).toContain("process.env.BASE_URL || 'https://shop.example.com'");
    expect(spec).toContain("page.goto(BASE_URL + '/checkout')");
  });

  it('escapes quotes in titles and text safely', () => {
    const spec = generatePlaywrightTest(report(
      [ev('click', { element: { tag: 'button', text: "Bob's \"deal\"" } }, 1)],
      { title: "It's broken" } as any
    ))!;
    expect(spec).toContain("test('It\\'s broken'");
    expect(spec).toContain("Bob\\'s");
  });
});

describe('playwrightTestFilename', () => {
  it('slugifies the title into a .spec.ts name', () => {
    expect(playwrightTestFilename(report([], { title: 'Checkout: "Place order" fails — 404' } as any)))
      .toBe('checkout-place-order-fails-404.spec.ts');
  });

  it('falls back for empty titles', () => {
    expect(playwrightTestFilename(report([], { title: '' } as any))).toBe('tracebug-bug.spec.ts');
  });
});
