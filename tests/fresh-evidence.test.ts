import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendEvent, getAllSessions, clearAllSessions, flushPendingEvents, saveEnvironment,
  saveStorageSnapshot, attachResponseSnippet, updateSessionError,
} from '../src/storage';
import { buildReport } from '../src/report-builder';
import { clearNetworkFailures } from '../src/collectors';
import type { TraceBugEvent, EnvironmentInfo, StorageSnapshot } from '../src/types';

// 1.12 item 4: build every report from fresh, durable evidence.

let n = 0;
function ev(sid: string, over: Partial<TraceBugEvent>): TraceBugEvent {
  n++;
  return {
    id: 'e' + n, sessionId: sid, projectId: 'p', type: 'click', page: '/',
    timestamp: Date.now() + n, data: { element: { tag: 'button', text: 'Btn' + n } }, ...over,
  };
}
const add = (sid: string, e: TraceBugEvent) => appendEvent(sid, e, 500, 50);
const session = (sid: string) => getAllSessions().find((s) => s.sessionId === sid)!;

beforeEach(() => {
  clearAllSessions();
  localStorage.clear();
  clearNetworkFailures();
});

describe('reads see unflushed events', () => {
  it('getAllSessions includes an event appended a moment ago', () => {
    add('s1', ev('s1', {}));
    flushPendingEvents();
    add('s1', ev('s1', { data: { element: { tag: 'button', text: 'Apply coupon' } } }));
    // No flush: storage is behind, but the read must not be.
    expect(session('s1').events).toHaveLength(2);
  });

  it('returns a copy, so a caller sorting or editing it does not touch the live session', () => {
    add('s1', ev('s1', {}));
    const copy = getAllSessions();
    copy[0].events.length = 0;
    expect(session('s1').events).toHaveLength(1);
  });
});

describe('repro steps are rebuilt from the events', () => {
  it('a step recorded after the stored steps were made still appears', () => {
    add('s1', ev('s1', { data: { element: { tag: 'button', text: 'Open cart' } } }));
    updateSessionError('s1', 'TypeError: x', undefined, '1. Click "Open cart"', 'x');
    add('s1', ev('s1', { data: { element: { tag: 'button', text: 'Apply coupon' } } }));
    const r = buildReport(session('s1'));
    expect(r.steps).toContain('Apply coupon');
  });
});

describe('failure response snippets persist on the request event', () => {
  it('attaches to the matching request and the report reads it with the buffer cleared', () => {
    const t = Date.now();
    add('s1', ev('s1', { type: 'api_request', timestamp: t, data: { request: { url: '/api/orders', method: 'POST', statusCode: 422, durationMs: 5 } } }));
    expect(attachResponseSnippet('s1', { url: '/api/orders', method: 'POST', status: 422, response: '{"error":"qty"}', timestamp: t + 20 })).toBe(true);
    flushPendingEvents();
    clearNetworkFailures(); // as after a reload
    const r = buildReport(session('s1'));
    expect(r.networkErrors[0].response).toBe('{"error":"qty"}');
  });

  it('does not attach to a different request or a timing row', () => {
    const t = Date.now();
    add('s1', ev('s1', { type: 'api_request', timestamp: t, data: { request: { url: '/api/orders', method: 'GET', statusCode: 422 } } }));
    add('s1', ev('s1', { type: 'api_request', timestamp: t, data: { request: { url: '/api/orders', method: 'POST', statusCode: 422, source: 'resource-timing' } } }));
    expect(attachResponseSnippet('s1', { url: '/api/orders', method: 'POST', status: 422, response: 'x', timestamp: t })).toBe(false);
  });
});

describe('storage snapshot is kept from the first error / stop', () => {
  const snap = (v: string): StorageSnapshot => ({ local: [{ key: 'cart', value: v }], session: [] } as StorageSnapshot);

  it('the report uses the saved snapshot, not the storage of today', () => {
    add('s1', ev('s1', {}));
    saveStorageSnapshot('s1', snap('at-bug'));
    saveStorageSnapshot('s1', snap('later')); // first one wins
    localStorage.setItem('cart', 'today');
    const r = buildReport(session('s1'));
    expect(r.storage?.local.find((e) => e.key === 'cart')?.value).toBe('at-bug');
  });
});

describe('the report URL is the page the bug happened on', () => {
  const env = { url: 'https://shop.test/?ref=mail', browser: 'Chrome' } as EnvironmentInfo;

  it('uses the first failure page and keeps the start page', () => {
    add('s1', ev('s1', { page: '/' }));
    saveEnvironment('s1', env);
    add('s1', ev('s1', { page: '/checkout' }));
    add('s1', ev('s1', { type: 'error', page: '/checkout', data: { error: { message: 'TypeError: x' } } }));
    add('s1', ev('s1', { page: '/thanks' }));
    const r = buildReport(session('s1'));
    expect(r.environment.url).toBe('https://shop.test/checkout');
    expect(r.environment.startUrl).toBe('https://shop.test/?ref=mail');
  });

  it('leaves the URL alone when the bug is on the start page', () => {
    add('s1', ev('s1', { page: '/' }));
    saveEnvironment('s1', env);
    const r = buildReport(session('s1'));
    expect(r.environment.url).toBe('https://shop.test/?ref=mail');
    expect(r.environment.startUrl).toBeUndefined();
  });
});
