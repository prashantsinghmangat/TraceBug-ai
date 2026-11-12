import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { isFailedRequest, requestStatusLabel } from '../src/request-status';
import { collectApiRequests, clearNetworkFailures } from '../src/collectors';
import { buildReport, generateRootCauseHint } from '../src/report-builder';
import { generateBugTitle } from '../src/title-generator';
import { generateReproSteps } from '../src/repro-generator';
import type { StoredSession, TraceBugEvent } from '../src/types';

// 1.12 item 1: status 0 used to mean "failed" everywhere, so a Firefox or
// cross-origin Resource Timing row, an aborted fetch and an opaque no-cors
// response all became "API … failed with Network Error" at high confidence.

describe('isFailedRequest / requestStatusLabel', () => {
  it.each([
    [{ status: 500 }, true, '500'],
    [{ status: 404 }, true, '404'],
    [{ status: 200 }, false, '200'],
    [{ status: 0 }, true, 'Network Error'],                       // fetch rejected: a real network error
    [{ statusCode: 0 }, true, 'Network Error'],                   // event shape
    [{ status: 0, source: 'resource-timing' }, false, 'status unknown'],
    [{ status: 0, statusUnknown: true }, false, 'status unknown'],
    [{ status: 0, aborted: true }, false, 'aborted'],
    [{ status: 0, opaque: true }, false, 'opaque'],
    [{ status: 503, source: 'resource-timing' }, true, '503'],    // a known timing status still counts
  ])('%j → failed=%s, label=%s', (row, failed, label) => {
    expect(isFailedRequest(row)).toBe(failed);
    expect(requestStatusLabel(row)).toBe(label);
  });

  it('null is not a failure', () => {
    expect(isFailedRequest(null)).toBe(false);
  });
});

describe('fetch capture tags aborted and opaque requests', () => {
  const realFetch = window.fetch;
  afterEach(() => { window.fetch = realFetch; });

  function capture(impl: () => Promise<Response>) {
    window.fetch = vi.fn(impl) as unknown as typeof fetch;
    const emitted: Array<{ type: string; data: any }> = [];
    const stop = collectApiRequests((type: any, data: any) => emitted.push({ type, data }));
    return { emitted, stop };
  }

  it('an AbortError is recorded as aborted, not a failure', async () => {
    const { emitted, stop } = capture(() => Promise.reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
    await expect(window.fetch('/api/search?q=k')).rejects.toThrow();
    stop();
    expect(emitted[0].data.request).toMatchObject({ statusCode: 0, aborted: true });
    expect(isFailedRequest(emitted[0].data.request)).toBe(false);
  });

  it('a network error stays a failure', async () => {
    const { emitted, stop } = capture(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(window.fetch('/api/orders')).rejects.toThrow();
    stop();
    expect(emitted[0].data.request.aborted).toBeUndefined();
    expect(isFailedRequest(emitted[0].data.request)).toBe(true);
  });

  it('an opaque no-cors response is recorded as opaque, not a failure', async () => {
    const { emitted, stop } = capture(() => Promise.resolve({ status: 0, type: 'opaque', clone: () => ({}) } as unknown as Response));
    await window.fetch('https://cdn.example.com/pixel', { mode: 'no-cors' });
    stop();
    expect(emitted[0].data.request).toMatchObject({ statusCode: 0, opaque: true });
    expect(isFailedRequest(emitted[0].data.request)).toBe(false);
  });
});

describe('reports no longer invent network failures', () => {
  // The fetch tests above leave real failures in the in-memory buffer, which
  // buildReport merges into any report; start each report clean.
  beforeEach(() => clearNetworkFailures());
  const t = 1_750_000_000_000;
  const ev = (type: TraceBugEvent['type'], data: Record<string, any>, ts: number): TraceBugEvent =>
    ({ id: String(ts), sessionId: 's', projectId: 'p', type, page: '/', timestamp: ts, data });
  const session = (events: TraceBugEvent[]): StoredSession => ({
    sessionId: 's', projectId: 'p', createdAt: t, updatedAt: t, errorMessage: null, errorStack: null,
    reproSteps: null, errorSummary: null, events, annotations: [],
  } as unknown as StoredSession);

  // A Firefox session: every request has a timing row with status 0.
  const events = [
    ev('click', { element: { tag: 'button', text: 'Load cart', selector: '#load' } }, t),
    ev('api_request', { request: { url: 'https://api.example.com/cart', statusCode: 0, durationMs: 40,
      source: 'resource-timing', initiatorType: 'fetch', startedAt: t + 5 } }, t + 60),
    ev('api_request', { request: { method: 'GET', url: '/api/search', statusCode: 0, durationMs: 3, aborted: true } }, t + 70),
  ];

  it('no failure in the report, the hint, the title or the steps', () => {
    const report = buildReport(session(events));
    expect(report.networkErrors).toHaveLength(0);
    expect(report.networkRequests.find((r) => r.url.includes('cart'))?.statusUnknown).toBe(true);
    expect(generateRootCauseHint(report).hint).not.toMatch(/failed with Network Error/);
    expect(generateBugTitle(session(events))).not.toMatch(/API|Network Error/);
    expect(generateReproSteps(events, '').reproSteps).not.toMatch(/API call fails/);
  });

  it('a real failure next to them is still found', () => {
    const withReal = [...events,
      ev('api_request', { request: { method: 'POST', url: '/api/orders', statusCode: 500, durationMs: 9 } }, t + 90)];
    const report = buildReport(session(withReal));
    expect(report.networkErrors.map((r) => r.url)).toEqual(['/api/orders']);
    expect(generateRootCauseHint(report).hint).toMatch(/POST \/api\/orders failed with 500/);
  });
});
