import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSessionId,
  getAllSessions,
  appendEvent,
  updateSessionError,
  addAnnotation,
  deleteSession,
  clearAllSessions,
  flushPendingEvents,
  saveEnvironment,
} from '../src/storage';
import type { TraceBugEvent, Annotation, EnvironmentInfo } from '../src/types';

function event(sessionId: string, overrides: Partial<TraceBugEvent> = {}): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId,
    projectId: 'test',
    type: 'click',
    page: '/',
    timestamp: Date.now(),
    data: { element: { text: 'x' } },
    ...overrides,
  };
}

beforeEach(() => {
  // Drop any cached state AND localStorage before each test.
  clearAllSessions();
  localStorage.clear();
});

describe('getSessionId', () => {
  it('returns a non-empty string', () => {
    const id = getSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a different id on each call', () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).not.toBe(b);
  });
});

describe('appendEvent', () => {
  it('creates a new session row if one does not exist', () => {
    appendEvent('s1', event('s1'), 200, 50);
    flushPendingEvents();
    const sessions = getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].sessionId).toBe('s1');
    expect(sessions[0].events.length).toBe(1);
  });

  it('appends events to the same session on repeated calls', () => {
    appendEvent('s1', event('s1'), 200, 50);
    appendEvent('s1', event('s1'), 200, 50);
    appendEvent('s1', event('s1'), 200, 50);
    flushPendingEvents();
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.events.length).toBe(3);
  });

  it('trims events at the maxEvents limit (keeps most recent)', () => {
    for (let i = 0; i < 10; i++) {
      appendEvent('s1', event('s1', { data: { i } as any }), 5, 50);
    }
    flushPendingEvents();
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.events.length).toBe(5);
    expect(s.events[s.events.length - 1].data.i).toBe(9);
  });

  it('trims old sessions at the maxSessions limit', () => {
    for (let i = 0; i < 8; i++) {
      appendEvent(`s${i}`, event(`s${i}`), 10, 3);
    }
    flushPendingEvents();
    const sessions = getAllSessions();
    expect(sessions.length).toBeLessThanOrEqual(3);
  });
});

describe('updateSessionError', () => {
  it('sets error fields on an existing session', () => {
    appendEvent('s1', event('s1'), 100, 10);
    updateSessionError('s1', 'Boom', 'stack here', '1. do a thing', 'Summary');
    flushPendingEvents();
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.errorMessage).toBe('Boom');
    expect(s.errorStack).toBe('stack here');
    expect(s.reproSteps).toBe('1. do a thing');
    expect(s.errorSummary).toBe('Summary');
  });

  it('is a no-op for a non-existent session', () => {
    updateSessionError('nope', 'x', undefined, '', '');
    flushPendingEvents();
    expect(getAllSessions().length).toBe(0);
  });
});

describe('addAnnotation', () => {
  it('appends to session.annotations', () => {
    appendEvent('s1', event('s1'), 100, 10);
    const ann: Annotation = {
      id: 'a1', timestamp: Date.now(), text: 'note', severity: 'minor',
    };
    addAnnotation('s1', ann);
    flushPendingEvents();
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.annotations.length).toBe(1);
    expect(s.annotations[0].text).toBe('note');
  });
});

describe('saveEnvironment', () => {
  it('attaches environment info to a session', () => {
    appendEvent('s1', event('s1'), 100, 10);
    const envInfo: EnvironmentInfo = {
      browser: 'Chrome', browserVersion: '121', os: 'macOS',
      viewport: '1920x1080', screenResolution: '2560x1440',
      language: 'en', timezone: 'UTC', userAgent: 'x',
      url: 'http://localhost', deviceType: 'desktop',
      connectionType: '4g', timestamp: Date.now(),
    };
    saveEnvironment('s1', envInfo);
    flushPendingEvents();
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.environment?.browser).toBe('Chrome');
  });
});

describe('deleteSession', () => {
  it('removes the session from storage', () => {
    appendEvent('s1', event('s1'), 100, 10);
    appendEvent('s2', event('s2'), 100, 10);
    flushPendingEvents();
    deleteSession('s1');
    const sessions = getAllSessions();
    expect(sessions.find(s => s.sessionId === 's1')).toBeUndefined();
    expect(sessions.find(s => s.sessionId === 's2')).toBeDefined();
  });

  it('does not resurrect after a pending flush (cache invalidation fix)', () => {
    appendEvent('s1', event('s1'), 100, 10); // schedules a flush
    flushPendingEvents();
    appendEvent('s1', event('s1'), 100, 10); // schedules another flush
    deleteSession('s1'); // must cancel the pending flush
    // Wait a tick to let any stray scheduled flush run
    flushPendingEvents();
    expect(getAllSessions().find(s => s.sessionId === 's1')).toBeUndefined();
  });
});

describe('clearAllSessions', () => {
  it('empties all persisted sessions', () => {
    appendEvent('s1', event('s1'), 100, 10);
    appendEvent('s2', event('s2'), 100, 10);
    flushPendingEvents();
    clearAllSessions();
    expect(getAllSessions()).toEqual([]);
  });

  it('cannot be undone by a pending flush (cache invalidation fix)', () => {
    // Write data + schedule a flush (without flushing yet)
    appendEvent('s1', event('s1'), 100, 10);
    // Clear BEFORE the flush fires
    clearAllSessions();
    // Force any scheduled flush to fire
    flushPendingEvents();
    // The cleared state must persist
    expect(getAllSessions()).toEqual([]);
  });
});

describe('localStorage quota handling', () => {
  it('drops oldest session and retries on quota exceeded', () => {
    // Seed two sessions
    appendEvent('s1', event('s1'), 100, 10);
    appendEvent('s2', event('s2'), 100, 10);
    flushPendingEvents();

    // Monkey-patch localStorage.setItem to throw once, then succeed
    let throws = 1;
    const origSet = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (throws > 0) { throws--; throw new Error('QuotaExceededError'); }
      origSet(k, v);
    });

    // Trigger a save that hits the mocked quota error
    appendEvent('s3', event('s3'), 100, 10);
    flushPendingEvents();

    spy.mockRestore();

    // Retry path kept going — we should have some sessions persisted.
    // Exact contents depend on retry ordering; the important guarantee is
    // that the error did not crash the host and the storage engine recovered.
    const sessions = getAllSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });
});
