import { describe, it, expect } from 'vitest';
import { generateBugTitle, generateFlowSummary } from '../src/title-generator';
import type { StoredSession, TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, page = '/'): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 'test-session',
    projectId: 'test-app',
    type,
    page,
    timestamp: Date.now(),
    data,
  };
}

function session(events: TraceBugEvent[], overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: 's1',
    projectId: 'test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    errorMessage: null,
    errorStack: null,
    reproSteps: null,
    errorSummary: null,
    events,
    annotations: [],
    environment: null,
    ...overrides,
  };
}

describe('generateBugTitle', () => {
  it('produces "Page: Action Fails — TypeError" for a TypeError after a click', () => {
    const events = [
      ev('click', { element: { tag: 'button', text: 'Update' } }, '/vendor'),
      ev('error', { error: { message: "TypeError: Cannot read 'status' of undefined" } }, '/vendor'),
    ];
    const title = generateBugTitle(session(events));
    expect(title).toContain('TypeError');
    expect(title).toMatch(/Vendor/i);
  });

  it('classifies ReferenceError correctly', () => {
    const events = [
      ev('click', { element: { text: 'Go' } }, '/'),
      ev('error', { error: { message: 'ReferenceError: foo is not defined' } }, '/'),
    ];
    expect(generateBugTitle(session(events))).toContain('ReferenceError');
  });

  it('includes API status code when there is a network failure but no JS error', () => {
    const events = [
      ev('click', { element: { text: 'Save' } }, '/checkout'),
      ev('api_request', { request: { method: 'POST', url: '/api/orders', statusCode: 500, durationMs: 100 } }, '/checkout'),
    ];
    const title = generateBugTitle(session(events));
    expect(title).toMatch(/500|API/);
  });

  it('falls back to a flow summary when there are no errors or failures', () => {
    const events = [
      ev('click', { element: { text: 'Button A' } }),
      ev('click', { element: { text: 'Button B' } }),
    ];
    const title = generateBugTitle(session(events));
    expect(title).toMatch(/Session|Click|Button/);
  });

  it('returns the empty-session fallback when no events exist', () => {
    const title = generateBugTitle(session([]));
    expect(title).toMatch(/Empty Session/i);
  });

  it('truncates long element text in titles', () => {
    const longText = 'a'.repeat(100);
    const events = [
      ev('click', { element: { text: longText, tag: 'button' } }, '/p'),
      ev('error', { error: { message: 'TypeError: x' } }, '/p'),
    ];
    const title = generateBugTitle(session(events));
    expect(title.length).toBeLessThan(160);
  });

  it('extracts the error type from a message prefix like "SyntaxError: ..."', () => {
    const events = [
      ev('error', { error: { message: 'SyntaxError: Unexpected token' } }),
    ];
    expect(generateBugTitle(session(events))).toContain('SyntaxError');
  });
});

describe('generateFlowSummary', () => {
  it('joins multiple actions with " → "', () => {
    const events = [
      ev('click', { element: { text: 'Login' } }),
      ev('route_change', { from: '/', to: '/home' }),
      ev('click', { element: { text: 'Submit' } }),
    ];
    const flow = generateFlowSummary(events);
    expect(flow).toContain('→');
    expect(flow.split('→').length).toBeGreaterThanOrEqual(3);
  });

  it('returns the no-interactions fallback for empty events', () => {
    expect(generateFlowSummary([])).toBe('No user interactions recorded');
  });

  it('only considers the last few actions (not every event ever)', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      ev('click', { element: { text: `btn-${i}` } })
    );
    const flow = generateFlowSummary(events);
    expect(flow).toContain('btn-19');
    expect(flow).not.toContain('btn-0');
  });
});

describe('generateBugTitle — asset-noise filtering (camo badge regression)', () => {
  const CAMO_URL =
    'https://camo.githubusercontent.com/7201bf24b202a60bfb5d8e83c47b2fe353cc8a693cfc106b0b02a0d9763042f0/68747470733a2f2f696d672e736869656c64732e696f2f';

  it('a session where ONLY a badge image failed gets a flow title, not "API Failure: <hex>"', () => {
    const events = [
      ev('click', { element: { text: 'Star' } }, '/repo'),
      ev('api_request', { request: { method: 'GET', url: CAMO_URL, statusCode: 404, durationMs: 12 } }, '/repo'),
    ];
    const title = generateBugTitle(session(events));
    expect(title).not.toContain('API Failure');
    expect(title).not.toContain('7201bf24b202a60bfb5d8e83c47b2fe353cc8a693cfc106b0b02a0d9763042f0');
  });

  it('a real API failure still titles as API even when asset noise failed first', () => {
    const events = [
      ev('api_request', { request: { method: 'GET', url: CAMO_URL, statusCode: 404, durationMs: 12 } }, '/checkout'),
      ev('api_request', { request: { method: 'POST', url: '/api/orders', statusCode: 500, durationMs: 90 } }, '/checkout'),
    ];
    const title = generateBugTitle(session(events));
    expect(title).toMatch(/500|API/);
    expect(title).not.toContain('camo');
  });

  it('bug titles never exceed a sane length even with pathological URLs', () => {
    const events = [
      ev('api_request', { request: { method: 'GET', url: '/x/' + 'a'.repeat(500), statusCode: 500, durationMs: 5 } }, '/'),
    ];
    expect(generateBugTitle(session(events)).length).toBeLessThan(120);
  });
});
