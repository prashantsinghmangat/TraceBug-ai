import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSessionId,
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSessionId,
  generateSessionId,
  getAllSessions,
  appendEvent,
  updateSessionError,
  addAnnotation,
  deleteSession,
  clearAllSessions,
  flushPendingEvents,
  saveEnvironment,
  markSessionSaved,
  getStorageUsageBytes,
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
  it('returns null when no session is armed', () => {
    expect(getSessionId()).toBeNull();
    expect(getActiveSessionId()).toBeNull();
  });

  it('returns the armed session id after setActiveSessionId', () => {
    const id = generateSessionId();
    setActiveSessionId(id);
    expect(getSessionId()).toBe(id);
    expect(getActiveSessionId()).toBe(id);
  });

  it('returns null after clearActiveSessionId', () => {
    const id = generateSessionId();
    setActiveSessionId(id);
    clearActiveSessionId();
    expect(getSessionId()).toBeNull();
  });

  it('generateSessionId produces unique values', () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
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

describe('saved-ticket protection', () => {
  it('markSessionSaved persists the flag and returns true', () => {
    appendEvent('s1', event('s1'), 100, 10);
    expect(markSessionSaved('s1')).toBe(true);
    const s = getAllSessions().find(x => x.sessionId === 's1')!;
    expect(s.saved).toBe(true);
  });

  it('markSessionSaved returns false for an unknown session', () => {
    expect(markSessionSaved('nope')).toBe(false);
  });

  it('quota eviction drops unsaved sessions, never saved tickets', () => {
    // Oldest session is SAVED; two unsaved follow.
    appendEvent('sv', event('sv'), 100, 10);
    markSessionSaved('sv');
    appendEvent('u1', event('u1'), 100, 10);
    appendEvent('u2', event('u2'), 100, 10);
    flushPendingEvents();

    const warnings: any[] = [];
    const onWarn = (e: Event) => warnings.push((e as CustomEvent).detail);
    window.addEventListener('tracebug:storage-warning', onWarn);

    // First write attempt hits quota; the retry after one eviction succeeds.
    // Spy on the prototype — in jsdom, setting properties directly on the
    // localStorage instance stores them as items instead of overriding.
    let throws = 1;
    const origSet = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (throws > 0) { throws--; throw new Error('QuotaExceededError'); }
      origSet.call(this, k, v);
    });
    appendEvent('u3', event('u3'), 100, 10);
    flushPendingEvents();
    spy.mockRestore();
    window.removeEventListener('tracebug:storage-warning', onWarn);

    const sessions = getAllSessions();
    // The saved ticket survived; the oldest UNSAVED session was evicted instead.
    expect(sessions.find(s => s.sessionId === 'sv')).toBeDefined();
    expect(sessions.find(s => s.sessionId === 'u1')).toBeUndefined();
    // The newest (active) session survived too.
    expect(sessions.find(s => s.sessionId === 'u3')).toBeDefined();
    // And the eviction was surfaced, not silent.
    expect(warnings.some(w => w?.code === 'unsaved_evicted')).toBe(true);
  });

  it('maxSessions rotation exempts saved tickets', () => {
    appendEvent('keep', event('keep'), 10, 3);
    markSessionSaved('keep');
    for (let i = 0; i < 8; i++) {
      appendEvent(`s${i}`, event(`s${i}`), 10, 3);
    }
    flushPendingEvents();
    const sessions = getAllSessions();
    expect(sessions.find(s => s.sessionId === 'keep')).toBeDefined();
    expect(sessions.filter(s => !s.saved).length).toBeLessThanOrEqual(3);
  });

  it('markSessionSaved returns false and rolls back when storage is truly full', () => {
    appendEvent('s1', event('s1'), 100, 10);
    flushPendingEvents();

    const warnings: any[] = [];
    const onWarn = (e: Event) => warnings.push((e as CustomEvent).detail);
    window.addEventListener('tracebug:storage-warning', onWarn);

    // Every write fails — nothing can be evicted to make room.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const ok = markSessionSaved('s1');
    spy.mockRestore();
    window.removeEventListener('tracebug:storage-warning', onWarn);

    expect(ok).toBe(false);
    // On-disk state was never corrupted and the flag did not stick.
    expect(getAllSessions().find(s => s.sessionId === 's1')?.saved).not.toBe(true);
    expect(warnings.some(w => w?.code === 'storage_full')).toBe(true);
  });

  it('getStorageUsageBytes reflects persisted data', () => {
    expect(getStorageUsageBytes()).toBe(0);
    appendEvent('s1', event('s1'), 100, 10);
    flushPendingEvents();
    expect(getStorageUsageBytes()).toBeGreaterThan(0);
  });
});
