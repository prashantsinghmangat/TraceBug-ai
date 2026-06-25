import { describe, it, expect, beforeEach } from 'vitest';
import { derivePriorityFromSeverity, priorityLabel, buildReport, trimStaleEvents } from '../src/report-builder';
import { clearNetworkFailures } from '../src/collectors';
import { clearScreenshots } from '../src/screenshot';
import { clearVoiceTranscripts } from '../src/voice-recorder';
import type { StoredSession, TraceBugEvent, EnvironmentInfo } from '../src/types';

function baseEnv(): EnvironmentInfo {
  return {
    browser: 'Chrome', browserVersion: '121', os: 'macOS',
    viewport: '1920x1080', screenResolution: '2560x1440',
    language: 'en', timezone: 'UTC', userAgent: 'x',
    url: 'http://localhost/checkout', deviceType: 'desktop',
    connectionType: '4g', timestamp: Date.now(),
  };
}

function ev(type: TraceBugEvent['type'], data: Record<string, any>): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 's1', projectId: 'p', type, page: '/', timestamp: Date.now(), data,
  };
}

function session(events: TraceBugEvent[], overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: 's1', projectId: 'p', createdAt: Date.now(), updatedAt: Date.now(),
    errorMessage: null, errorStack: null, reproSteps: null, errorSummary: null,
    events, annotations: [], environment: baseEnv(), ...overrides,
  };
}

beforeEach(() => {
  clearNetworkFailures();
  clearScreenshots();
  clearVoiceTranscripts();
  localStorage.clear();
  sessionStorage.clear();
});

describe('derivePriorityFromSeverity', () => {
  it('maps severity to a default priority', () => {
    expect(derivePriorityFromSeverity('critical')).toBe('high');
    expect(derivePriorityFromSeverity('high')).toBe('high');
    expect(derivePriorityFromSeverity('medium')).toBe('medium');
    expect(derivePriorityFromSeverity('low')).toBe('low');
  });
});

describe('priorityLabel', () => {
  it('title-cases the priority', () => {
    expect(priorityLabel('high')).toBe('High');
    expect(priorityLabel('medium')).toBe('Medium');
    expect(priorityLabel('low')).toBe('Low');
  });
});

describe('trimStaleEvents', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_700_000_000_000;

  it('drops events from long before the capture anchor', () => {
    const stale = ev('click', {}); stale.timestamp = now - 3 * HOUR;
    const fresh = ev('click', {}); fresh.timestamp = now - 5_000;
    const out = trimStaleEvents([stale, fresh], now);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(fresh);
  });

  it('returns empty when every event is stale (capture has no fresh events)', () => {
    const a = ev('click', {}); a.timestamp = now - 3 * HOUR;
    const b = ev('click', {}); b.timestamp = now - 3 * HOUR + 1000;
    expect(trimStaleEvents([a, b], now)).toHaveLength(0);
  });

  it('keeps recent events within the lookback window', () => {
    const a = ev('click', {}); a.timestamp = now - 10 * 60 * 1000; // 10 min before
    const b = ev('click', {}); b.timestamp = now - 1000;
    expect(trimStaleEvents([a, b], now)).toHaveLength(2);
  });

  it('anchors to the newest event when no capture time is given', () => {
    const old = ev('click', {}); old.timestamp = now - 3 * HOUR;
    const recent = ev('click', {}); recent.timestamp = now;
    expect(trimStaleEvents([old, recent], 0)).toEqual([recent]);
  });
});

describe('buildReport priority', () => {
  it('defaults priority from a derived critical severity', () => {
    // A TypeError drives severity to "critical" → priority "high".
    const s = session([ev('error', { error: { message: 'TypeError: x is undefined' } })]);
    const report = buildReport(s);
    expect(report.severity).toBe('critical');
    expect(report.priority).toBe('high');
  });

  it('defaults priority to low for a no-signal session', () => {
    const s = session([ev('click', { selector: '#save', text: 'Save' })]);
    const report = buildReport(s);
    expect(report.priority).toBe('low');
  });

  it('honors a tester-set priority over the derived default', () => {
    // Severity would derive "high", but the tester explicitly set "low".
    const s = session(
      [ev('error', { error: { message: 'TypeError: boom' } })],
      { priority: 'low' },
    );
    const report = buildReport(s);
    expect(report.severity).toBe('critical');
    expect(report.priority).toBe('low');
  });
});
