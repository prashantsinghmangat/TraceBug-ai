import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildReport,
  generateSmartSummary,
  generateRootCauseHint,
  formatRootCauseLine,
  generateSessionSteps,
  extractClickedElement,
} from '../src/report-builder';
import { clearNetworkFailures } from '../src/collectors';
import { clearScreenshots } from '../src/screenshot';
import { clearVoiceTranscripts } from '../src/voice-recorder';
import type {
  BugReport, StoredSession, TraceBugEvent, ClickedElementSummary, EnvironmentInfo,
} from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, opts: { page?: string; ts?: number } = {}): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 's1',
    projectId: 'p',
    type,
    page: opts.page || '/',
    timestamp: opts.ts || Date.now(),
    data,
  };
}

function baseEnv(): EnvironmentInfo {
  return {
    browser: 'Chrome', browserVersion: '121', os: 'macOS',
    viewport: '1920x1080', screenResolution: '2560x1440',
    language: 'en', timezone: 'UTC', userAgent: 'x',
    url: 'http://localhost/checkout', deviceType: 'desktop',
    connectionType: '4g', timestamp: Date.now(),
  };
}

function session(events: TraceBugEvent[], overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: 's1',
    projectId: 'p',
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now(),
    errorMessage: null,
    errorStack: null,
    reproSteps: null,
    errorSummary: null,
    events,
    annotations: [],
    environment: baseEnv(),
    ...overrides,
  };
}

beforeEach(() => {
  clearNetworkFailures();
  clearScreenshots();
  clearVoiceTranscripts();
});

describe('buildReport', () => {
  it('populates every required field', () => {
    const r = buildReport(session([
      ev('click', { element: { tag: 'button', text: 'Save' } }),
    ]));
    expect(r.title).toBeTypeOf('string');
    expect(r.summary).toBeTypeOf('string');
    expect(r.rootCause).toHaveProperty('hint');
    expect(r.rootCause).toHaveProperty('confidence');
    expect(r.environment).toBeDefined();
    expect(Array.isArray(r.consoleErrors)).toBe(true);
    expect(Array.isArray(r.networkErrors)).toBe(true);
    expect(Array.isArray(r.sessionSteps)).toBe(true);
    expect(Array.isArray(r.timeline)).toBe(true);
    expect(r.generatedAt).toBeTypeOf('number');
  });

  it('deduplicates console errors by message', () => {
    const events = [
      ev('error', { error: { message: 'Boom' } }),
      ev('error', { error: { message: 'Boom' } }),
      ev('error', { error: { message: 'Different' } }),
    ];
    const r = buildReport(session(events));
    expect(r.consoleErrors.length).toBe(2);
  });

  it('extracts network errors from api_request events with status >= 400', () => {
    const events = [
      ev('api_request', { request: { method: 'GET', url: '/x', statusCode: 200, durationMs: 10 } }),
      ev('api_request', { request: { method: 'POST', url: '/y', statusCode: 500, durationMs: 30 } }),
      ev('api_request', { request: { method: 'GET', url: '/z', statusCode: 0, durationMs: 100 } }),
    ];
    const r = buildReport(session(events));
    expect(r.networkErrors.length).toBe(2);
    expect(r.networkErrors.some(n => n.status === 500)).toBe(true);
    expect(r.networkErrors.some(n => n.status === 0)).toBe(true);
  });
});

describe('generateSmartSummary (priority order)', () => {
  const env = baseEnv();

  function r(overrides: Partial<BugReport>): BugReport {
    return {
      title: 't',
      summary: '',
      steps: '',
      environment: env,
      consoleErrors: [],
      networkErrors: [],
      sessionSteps: [],
      clickedElement: null,
      rootCause: { hint: '', confidence: 'low' },
      annotations: [],
      screenshots: [],
      timeline: [],
      voiceTranscripts: [],
      session: session([]),
      generatedAt: Date.now(),
      ...overrides,
    };
  }

  it('prefers network + click over all other signals', () => {
    const s = generateSmartSummary(r({
      networkErrors: [{ method: 'POST', url: '/api/orders', status: 500, duration: 0, timestamp: 0 }],
      consoleErrors: [{ message: 'TypeError', timestamp: 0 }],
      clickedElement: { tag: 'button', text: 'Place Order', page: '/checkout' } as ClickedElementSummary,
    }));
    expect(s).toContain('POST');
    expect(s).toContain('500');
    expect(s).toContain('Place Order');
  });

  it('uses error + click when network is absent', () => {
    const s = generateSmartSummary(r({
      consoleErrors: [{ message: 'TypeError: x', timestamp: 0 }],
      clickedElement: { tag: 'button', text: 'Save', page: '/' } as ClickedElementSummary,
    }));
    expect(s).toContain('TypeError');
    expect(s).toContain('Save');
  });

  it('uses network alone when click is absent', () => {
    const s = generateSmartSummary(r({
      networkErrors: [{ method: 'GET', url: '/api/users', status: 404, duration: 0, timestamp: 0 }],
    }));
    expect(s).toContain('404');
    expect(s).toContain('/api/users');
  });

  it('uses error alone when nothing else is present', () => {
    const s = generateSmartSummary(r({
      consoleErrors: [{ message: 'TypeError: boom', timestamp: 0 }],
    }));
    expect(s).toContain('TypeError');
    expect(s).toContain('boom');
  });

  it('falls back gracefully with no signals', () => {
    const s = generateSmartSummary(r({}));
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('generateRootCauseHint (confidence tiers)', () => {
  const env = baseEnv();
  function r(overrides: Partial<BugReport>): BugReport {
    return {
      title: 't', summary: '', steps: '', environment: env,
      consoleErrors: [], networkErrors: [], sessionSteps: [],
      clickedElement: null, rootCause: { hint: '', confidence: 'low' },
      annotations: [], screenshots: [], timeline: [], voiceTranscripts: [],
      session: session([]), generatedAt: Date.now(),
      ...overrides,
    };
  }

  it('HIGH confidence when a network failure is present', () => {
    const hint = generateRootCauseHint(r({
      networkErrors: [{ method: 'POST', url: '/o', status: 500, duration: 0, timestamp: 0 }],
    }));
    expect(hint.confidence).toBe('high');
    expect(hint.hint).toContain('500');
  });

  it('MEDIUM confidence when only a runtime error is present', () => {
    const hint = generateRootCauseHint(r({
      consoleErrors: [{ message: 'TypeError: Cannot read prop', timestamp: 0 }],
    }));
    expect(hint.confidence).toBe('medium');
    expect(hint.hint).toMatch(/TypeError|undefined|null/i);
  });

  it('LOW confidence when only a click is recorded', () => {
    const hint = generateRootCauseHint(r({
      clickedElement: { tag: 'button', text: 'Submit', page: '/' } as ClickedElementSummary,
    }));
    expect(hint.confidence).toBe('low');
    expect(hint.hint).toContain('Submit');
  });

  it('link clicks are NOT called "no observable effect" — links navigate', () => {
    const hint = generateRootCauseHint(r({
      clickedElement: { tag: 'a', text: 'Hacker News', page: '/' } as ClickedElementSummary,
    }));
    expect(hint.confidence).toBe('low');
    expect(hint.hint).not.toMatch(/observable effect/i);
    expect(hint.hint).toContain('Hacker News');
    expect(hint.hint).toMatch(/link|navigation/i);
  });

  it('LOW confidence fallback message when no signals exist', () => {
    const hint = generateRootCauseHint(r({}));
    expect(hint.confidence).toBe('low');
    expect(hint.hint.length).toBeGreaterThan(0);
  });

  // Regression: a failed shields.io badge behind GitHub's camo proxy was
  // reported as "API Failure (high confidence)" with a 500-char hex path.
  const CAMO_URL =
    'https://camo.githubusercontent.com/7201bf24b202a60bfb5d8e83c47b2fe353cc8a693cfc106b0b02a0d9763042f0/68747470733a2f2f696d672e736869656c64732e696f2f';

  it('a real API failure outranks earlier asset noise', () => {
    const hint = generateRootCauseHint(r({
      networkErrors: [
        { method: 'GET', url: CAMO_URL, status: 404, duration: 0, timestamp: 0 },
        { method: 'POST', url: '/api/orders', status: 500, duration: 0, timestamp: 1 },
      ],
    }));
    expect(hint.confidence).toBe('high');
    expect(hint.hint).toContain('/api/orders');
    expect(hint.hint).not.toContain('camo');
  });

  it('noise-only failures report LOW confidence as a resource issue, never "API"-high', () => {
    const hint = generateRootCauseHint(r({
      networkErrors: [{ method: 'GET', url: CAMO_URL, status: 404, duration: 0, timestamp: 0 }],
    }));
    expect(hint.confidence).toBe('low');
    expect(hint.hint).toMatch(/resource/i);
    expect(hint.hint.length).toBeLessThan(200); // hex path must be ellipsized
  });

  it('a runtime error outranks noise-only network failures', () => {
    const hint = generateRootCauseHint(r({
      networkErrors: [{ method: 'GET', url: CAMO_URL, status: 404, duration: 0, timestamp: 0 }],
      consoleErrors: [{ message: 'TypeError: Cannot read prop', timestamp: 0 }],
    }));
    expect(hint.confidence).toBe('medium');
  });
});

describe('formatRootCauseLine', () => {
  it('includes the magnifying-glass emoji and confidence', () => {
    const line = formatRootCauseLine({ hint: 'API failed', confidence: 'high' });
    expect(line).toContain('high confidence');
    expect(line).toContain('API failed');
  });

  it('returns empty string for null/empty input', () => {
    expect(formatRootCauseLine(null as any)).toBe('');
    expect(formatRootCauseLine({ hint: '', confidence: 'low' })).toBe('');
  });
});

describe('generateSessionSteps', () => {
  it('maps click events to "Clicked ..." strings', () => {
    const steps = generateSessionSteps([
      ev('click', { element: { tag: 'button', text: 'Login' } }),
    ]);
    expect(steps[0]).toContain('Login');
    expect(steps[0].toLowerCase()).toContain('clicked');
  });

  it('maps route changes to "Navigated to ..."', () => {
    const steps = generateSessionSteps([
      ev('route_change', { from: '/', to: '/dashboard' }),
    ]);
    expect(steps[0]).toContain('/dashboard');
  });

  it('caps output at 10 steps (keeps newest)', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      ev('click', { element: { text: `btn-${i}`, tag: 'button' } })
    );
    const steps = generateSessionSteps(events);
    expect(steps.length).toBe(10);
    expect(steps[steps.length - 1]).toContain('btn-19');
    expect(steps[0]).toContain('btn-10');
  });

  it('skips input events (too noisy)', () => {
    const steps = generateSessionSteps([
      ev('input', { element: { name: 'email', value: 'x' } }),
    ]);
    expect(steps.length).toBe(0);
  });
});

describe('extractClickedElement', () => {
  it('returns the most recent click event', () => {
    const events = [
      ev('click', { element: { tag: 'button', text: 'A' } }),
      ev('click', { element: { tag: 'button', text: 'B' } }),
    ];
    const c = extractClickedElement(events);
    expect(c?.text).toBe('B');
  });

  it('preserves selector, id, ariaLabel, testId', () => {
    const events = [
      ev('click', { element: {
        tag: 'button', text: 'Save', id: 'save-btn',
        selector: '#save-btn', ariaLabel: 'Save order', testId: 'save-cta',
      }}),
    ];
    const c = extractClickedElement(events)!;
    expect(c.id).toBe('save-btn');
    expect(c.selector).toBe('#save-btn');
    expect(c.ariaLabel).toBe('Save order');
    expect(c.testId).toBe('save-cta');
  });

  it('returns null when there are no click events', () => {
    expect(extractClickedElement([
      ev('route_change', { from: '/', to: '/a' }),
    ])).toBeNull();
  });
});
