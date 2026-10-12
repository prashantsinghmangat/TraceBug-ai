// Phase 4: the first capture records events, not video.
//
// The popup's Capture Bug no longer opens a screen-share picker — it runs an
// events-only capture (console, network, actions, DOM replay). That meant the
// DOM replay needed somewhere to live, because until now `rrwebEvents` only
// ever rode along on a VideoRecording.
//
// What these tests pin down:
//   1. A replay-only `report.video` is built from the stash when the session
//      has no video, and it carries the events but NO video data.
//   2. It obeys the same session-ownership rule as a real video, so a replay
//      from an abandoned capture cannot bleed into a later ticket.
//   3. The .html exporter takes the rrweb branch and emits no `video` key —
//      the thing that would otherwise ship an empty <video> to the user.
//   4. share-link / ai-prompt stop treating "there is a video object" as
//      "there is a video".
import { describe, it, expect, beforeEach } from 'vitest';
import { buildReport } from '../src/report-builder';
import { stashDomReplay, clearStashedDomReplay, getStashedDomReplay } from '../src/rrweb-recorder';
import { clearNetworkFailures } from '../src/collectors';
import { clearScreenshots } from '../src/screenshot';
import { clearVoiceTranscripts } from '../src/voice-recorder';
import { buildReplayBlob } from '../src/exporters/html-replay';
import { generateAIPrompt } from '../src/exporters/ai-prompt';
import type { StoredSession, TraceBugEvent, EnvironmentInfo } from '../src/types';

function ev(type: TraceBugEvent['type'], data: Record<string, any>, ts?: number): TraceBugEvent {
  return {
    id: Math.random().toString(36).slice(2, 10),
    sessionId: 's1',
    projectId: 'p',
    type,
    page: '/',
    timestamp: ts || Date.now(),
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

function session(overrides: Partial<StoredSession> = {}): StoredSession {
  return {
    sessionId: 's1',
    projectId: 'p',
    createdAt: Date.now() - 10_000,
    updatedAt: Date.now(),
    errorMessage: null,
    errorStack: null,
    reproSteps: null,
    errorSummary: null,
    environment: baseEnv(),
    events: [ev('click', { selector: '#pay', text: 'Pay' })],
    ...overrides,
  };
}

/** A minimal but structurally valid rrweb stream: meta, full snapshot, mutation. */
function domEvents() {
  return [
    { type: 4, timestamp: 1, data: { href: 'http://localhost/checkout', width: 1280, height: 800 } },
    { type: 2, timestamp: 2, data: { node: { id: 1, type: 0, childNodes: [] } } },
    { type: 3, timestamp: 900, data: { source: 2, type: 1, id: 7 } },
  ];
}

beforeEach(() => {
  clearStashedDomReplay();
  clearNetworkFailures();
  clearScreenshots();
  clearVoiceTranscripts();
});

describe('stashDomReplay', () => {
  it('parks a stream with its start time and duration', () => {
    stashDomReplay(domEvents(), 1_000, 4_200);
    expect(getStashedDomReplay()).toMatchObject({ startedAt: 1_000, durationMs: 4_200 });
    expect(getStashedDomReplay()!.events).toHaveLength(3);
  });

  it('treats an empty stream as nothing stashed', () => {
    // rrweb unavailable (import failure, or a capture stopped before it loaded)
    // must not leave an empty replay behind that reports a 0-event DOM replay.
    stashDomReplay([], 1_000, 4_200);
    expect(getStashedDomReplay()).toBeNull();
  });

  it('keeps only the newest capture', () => {
    stashDomReplay(domEvents(), 1_000, 1_000);
    stashDomReplay(domEvents().slice(0, 2), 5_000, 2_000);
    expect(getStashedDomReplay()!.startedAt).toBe(5_000);
    expect(getStashedDomReplay()!.events).toHaveLength(2);
  });

  it('clears', () => {
    stashDomReplay(domEvents(), 1_000, 1_000);
    clearStashedDomReplay();
    expect(getStashedDomReplay()).toBeNull();
  });
});

describe('buildReport with an events-only capture', () => {
  it('carries the DOM replay as a replay-only video object', () => {
    const s = session();
    stashDomReplay(domEvents(), s.createdAt + 50, 3_000);
    const report = buildReport(s);

    expect(report.video).toBeDefined();
    expect(report.video!.rrwebEvents).toHaveLength(3);
    expect(report.video!.durationMs).toBe(3_000);
    // The whole point: no video bytes anywhere on it.
    expect(report.video!.dataUrl).toBe('');
    expect(report.video!.url).toBe('');
    expect(report.video!.sizeBytes).toBe(0);
    expect(report.video!.comments).toEqual([]);
  });

  it('is absent when nothing was captured', () => {
    expect(buildReport(session()).video).toBeUndefined();
  });

  it('rejects a replay that started before this session', () => {
    // Same ownership rule as getSessionVideo: a replay left behind by an
    // abandoned capture must not be attached to a later ticket.
    const s = session({ createdAt: Date.now() });
    stashDomReplay(domEvents(), s.createdAt - 60_000, 3_000);
    expect(buildReport(s).video).toBeUndefined();
  });

  it('accepts a replay stamped just inside the grace window', () => {
    // The extension stamps a capture's start slightly before the page can arm
    // the session, so a strict >= would reject the session's own replay.
    const s = session({ createdAt: Date.now() });
    stashDomReplay(domEvents(), s.createdAt - 2_000, 3_000);
    expect(buildReport(s).video).toBeDefined();
  });
});

describe('exports from an events-only capture', () => {
  it('.html embeds the DOM replay and no video', async () => {
    const s = session();
    stashDomReplay(domEvents(), s.createdAt + 50, 3_000);
    const report = buildReport(s);

    const blob = await buildReplayBlob(s, report);
    const html = await blob.text();

    // The payload is a JSON blob inside the page; assert on it rather than on
    // rendered markup so this test fails for the right reason.
    expect(html).toContain('rrwebEvents');
    // An empty data URL must never reach the file — that is what would render
    // a broken <video> for the person who opens the report.
    expect(html).not.toContain('"dataUrl":""');
    expect(html).not.toContain('data:video/webm');
  });

  it('the AI prompt calls it a DOM replay, not a video recording', () => {
    const s = session();
    stashDomReplay(domEvents(), s.createdAt + 50, 3_000);
    const report = buildReport(s);

    const prompt = generateAIPrompt(report);
    expect(prompt).toContain('interactive DOM replay available');
    expect(prompt).not.toContain('video recording available');
  });
});
