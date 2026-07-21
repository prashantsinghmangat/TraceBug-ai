import { describe, it, expect } from 'vitest';
import { buildTimeline, formatTimelineText } from '../src/timeline-builder';
import type { TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, timestamp: number, page = '/'): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 's',
    projectId: 'p',
    type,
    page,
    timestamp,
    data,
  };
}

describe('buildTimeline', () => {
  it('returns an empty array for empty events', () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it('formats elapsed time as MM:SS.ms relative to first event', () => {
    const start = 1_700_000_000_000;
    const events = [
      ev('click', { element: { text: 'A' } }, start),
      ev('click', { element: { text: 'B' } }, start + 1500),
    ];
    const t = buildTimeline(events);
    expect(t[0].elapsed).toMatch(/^00:00\.\d{2}$/);
    expect(t[1].elapsed).toMatch(/^00:01\.\d{2}$/);
  });

  it('describes click events with the element text', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'Place Order', tag: 'button' } }, 1),
    ]);
    expect(t[0].description).toContain('Place Order');
  });

  it('describes API requests with method, URL pathname, and status', () => {
    const t = buildTimeline([
      ev('api_request', { request: { method: 'POST', url: 'https://example.com/api/orders', statusCode: 500, durationMs: 200 } }, 1),
    ]);
    expect(t[0].description).toContain('POST');
    expect(t[0].description).toContain('500');
    expect(t[0].description).toContain('/api/orders');
  });

  it('marks error events with isError=true', () => {
    const t = buildTimeline([
      ev('error', { error: { message: 'Boom' } }, 1),
    ]);
    expect(t[0].isError).toBe(true);
  });

  it('marks failed API requests with isError=true', () => {
    const t = buildTimeline([
      ev('api_request', { request: { method: 'GET', url: '/x', statusCode: 404, durationMs: 10 } }, 1),
    ]);
    expect(t[0].isError).toBe(true);
  });

  it('does not mark successful API requests as errors', () => {
    const t = buildTimeline([
      ev('api_request', { request: { method: 'GET', url: '/x', statusCode: 200, durationMs: 10 } }, 1),
    ]);
    expect(t[0].isError).toBe(false);
  });

  it('deduplicates consecutive identical entries', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'Save' } }, 1),
      ev('click', { element: { text: 'Save' } }, 2),
      ev('click', { element: { text: 'Save' } }, 3),
    ]);
    expect(t.length).toBe(1);
  });

  it('preserves distinct consecutive entries', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'A' } }, 1),
      ev('click', { element: { text: 'B' } }, 2),
    ]);
    expect(t.length).toBe(2);
  });

  it('surfaces the route_change from → to description', () => {
    const t = buildTimeline([
      ev('route_change', { from: '/', to: '/checkout' }, 1),
    ]);
    expect(t[0].description).toContain('/');
    expect(t[0].description).toContain('/checkout');
  });
});

describe('buildTimeline — console levels (PH feedback: warn/info in the timeline)', () => {
  it('renders console_warn as its message, not a JSON dump', () => {
    const t = buildTimeline([
      ev('console_warn', { error: { message: 'cart state stale after coupon apply' } }, 1),
    ]);
    expect(t[0].description).toContain('cart state stale after coupon apply');
    expect(t[0].description).not.toContain('{"error"');
    expect(t[0].isError).toBe(false);
  });

  it('renders console_info as its message', () => {
    const t = buildTimeline([
      ev('console_info', { error: { message: 'checkout step 2 mounted' } }, 1),
    ]);
    expect(t[0].description).toContain('checkout step 2 mounted');
    expect(t[0].description).not.toContain('{"error"');
  });

  it('renders console_log as its message', () => {
    const t = buildTimeline([
      ev('console_log', { error: { message: 'payload received' } }, 1),
    ]);
    expect(t[0].description).toContain('payload received');
    expect(t[0].description).not.toContain('{"error"');
  });

  it('truncates long console messages at 80 chars', () => {
    const long = 'x'.repeat(200);
    const t = buildTimeline([ev('console_warn', { error: { message: long } }, 1)]);
    expect(t[0].description.length).toBeLessThanOrEqual(84); // "⚠ " prefix + 80
  });
});

describe('formatTimelineText', () => {
  it('returns the empty-session fallback when no entries', () => {
    expect(formatTimelineText([])).toBe('(empty session)');
  });

  it('includes elapsed time and description on each line', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'Save' } }, 1_700_000_000_000),
    ]);
    const text = formatTimelineText(t);
    expect(text).toMatch(/00:00/);
    expect(text).toContain('Save');
  });

  it('marks error entries with "!!"', () => {
    const t = buildTimeline([
      ev('error', { error: { message: 'Boom' } }, 1),
    ]);
    const text = formatTimelineText(t);
    expect(text).toContain('!!');
  });

  it('does not prefix normal entries with "!!"', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'X' } }, 1),
    ]);
    const text = formatTimelineText(t);
    expect(text).not.toContain('!!');
  });
});

describe('buildTimeline — story vs page mechanics (githubassets regression)', () => {
  it('drops successful static-asset loads from the timeline', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'Star' } }, 0),
      ev('api_request', { request: { method: 'GET', url: 'https://github.githubassets.com/assets/43223-d8967b.js', statusCode: 200, durationMs: 5 } }, 1),
      ev('api_request', { request: { method: 'GET', url: '/api/orders', statusCode: 200, durationMs: 90 } }, 2),
    ]);
    const descs = t.map(e => e.description).join('\n');
    expect(descs).not.toContain('githubassets');
    expect(descs).toContain('/api/orders');
  });

  it('drops analytics beacons even when they failed (ad-blocker noise)', () => {
    const t = buildTimeline([
      ev('click', { element: { text: 'Star' } }, 0),
      ev('api_request', { request: { method: 'GET', url: 'https://collector.github.com/github/collect', statusCode: 0, durationMs: 1 } }, 1),
    ]);
    expect(t.map(e => e.description).join('\n')).not.toContain('collect');
  });

  it('keeps FAILED first-party script loads — a broken chunk is a real signal', () => {
    const t = buildTimeline([
      ev('api_request', { request: { method: 'GET', url: '/assets/chunk-89194.js', statusCode: 404, durationMs: 8 } }, 0),
    ]);
    expect(t.map(e => e.description).join('\n')).toContain('chunk-89194');
  });
});
