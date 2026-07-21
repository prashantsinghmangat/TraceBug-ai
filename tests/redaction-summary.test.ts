import { describe, it, expect } from 'vitest';
import { summarizeRedactions, formatRedactionSummary } from '../src/redaction-summary';
import type { BugReport, TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, ts = 1): TraceBugEvent {
  return { id: 'e', sessionId: 's', projectId: 'p', type, page: '/', timestamp: ts, data };
}

function report(overrides: Partial<BugReport> = {}): BugReport {
  return {
    title: 't', summary: '', steps: '', environment: { url: 'http://localhost/' },
    consoleErrors: [], networkErrors: [], networkRequests: [], sessionSteps: [],
    actionChips: [], clickedElement: null, rootCause: null, severity: 'medium',
    priority: 'p2', annotations: [], screenshots: [], timeline: [],
    voiceTranscripts: [], context: {}, generatedAt: 1,
    session: { sessionId: 's', projectId: 'p', createdAt: 0, updatedAt: 1, events: [], annotations: [] },
    ...overrides,
  } as unknown as BugReport;
}

describe('summarizeRedactions', () => {
  it('returns all zeros for a clean report', () => {
    const s = summarizeRedactions(report());
    expect(s.total).toBe(0);
    expect(formatRedactionSummary(s)).toBeNull();
  });

  it('counts masked URL query params across requests and environment', () => {
    const s = summarizeRedactions(report({
      environment: { url: 'http://x/?token=[REDACTED]' } as any,
      networkRequests: [
        { method: 'GET', url: '/api?api_key=[REDACTED]&q=1', status: 200, duration: 1, timestamp: 1 },
        { method: 'GET', url: '/api?a=1&secret=%5BREDACTED%5D', status: 200, duration: 1, timestamp: 2 },
      ],
    }));
    expect(s.urlParams).toBe(3);
    expect(s.total).toBe(3);
  });

  it('does not double-count failures present in both request lists', () => {
    const failed = { method: 'GET', url: '/x?token=[REDACTED]', status: 500, duration: 1, timestamp: 1 };
    const s = summarizeRedactions(report({
      networkRequests: [failed],
      networkErrors: [failed],
    }));
    expect(s.urlParams).toBe(1);
  });

  it('dedupes repeated input events on the same masked field', () => {
    const s = summarizeRedactions(report({
      session: {
        sessionId: 's', projectId: 'p', createdAt: 0, updatedAt: 1, annotations: [],
        events: [
          ev('input', { element: { name: 'password', value: '[REDACTED]' } }, 1),
          ev('input', { element: { name: 'password', value: '[REDACTED]' } }, 2),
          ev('form_submit', { form: { fields: { password: '[REDACTED]', email: 'a@b.c' } } }, 3),
        ],
      } as any,
    }));
    // input:password dedupes to 1; form:password is a distinct capture point
    expect(s.formFields).toBe(2);
  });

  it('counts redacted storage entries across local/session/cookies', () => {
    const s = summarizeRedactions(report({
      storage: {
        local: [{ key: 'auth_token', value: 'eyJh…[REDACTED]…f3Qk', redacted: true }, { key: 'theme', value: 'dark' }],
        session: [{ key: 'jwt', value: '[REDACTED]', redacted: true }],
        cookies: [{ key: 'sid', value: '[REDACTED]', redacted: true }],
      } as any,
    }));
    expect(s.storageKeys).toBe(3);
  });

  it('counts token masks in console output and network response snippets', () => {
    const s = summarizeRedactions(report({
      consoleLogs: [
        { level: 'log', message: 'auth: Bearer [REDACTED]', timestamp: 1 },
        { level: 'error', message: 'boom', stack: 'at eyJh…[REDACTED]…f3Qk', timestamp: 2 },
      ],
      networkRequests: [
        { method: 'POST', url: '/login', status: 500, duration: 1, timestamp: 1, response: '{"token":"sk-a…[REDACTED]…9z"}' },
      ],
    }));
    expect(s.tokens).toBe(3);
  });

  it('falls back to consoleErrors when consoleLogs is absent', () => {
    const s = summarizeRedactions(report({
      consoleErrors: [{ message: 'Bearer [REDACTED]', timestamp: 1 }],
    }));
    expect(s.tokens).toBe(1);
  });
});

describe('formatRedactionSummary', () => {
  it('pluralizes and lists only non-zero categories', () => {
    const text = formatRedactionSummary({ urlParams: 1, formFields: 0, storageKeys: 2, tokens: 1, total: 4 });
    expect(text).toBe('4 sensitive values auto-masked (1 token, 1 URL param, 2 storage values)');
  });

  it('uses singular for a single masked value', () => {
    const text = formatRedactionSummary({ urlParams: 0, formFields: 1, storageKeys: 0, tokens: 0, total: 1 });
    expect(text).toBe('1 sensitive value auto-masked (1 form field)');
  });
});
