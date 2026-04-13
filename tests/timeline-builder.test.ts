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
