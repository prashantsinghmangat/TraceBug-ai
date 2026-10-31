// Firefox lost every recording made without a microphone. Its getDisplayMedia
// never delivers tab audio, so with the mic off the stream has no audio track;
// the recorder still asked for "video/webm;codecs=vp9,opus", and Firefox's
// MediaRecorder given an audio codec with no audio track emits no data and
// never fires `stop`. Stop on the recording bar then opened an empty ticket
// while the recorder window kept "Recording" and the screen stayed shared.
// Measured in Firefox 158; Chrome tolerates the mismatch.
//
// This runs the REAL tracebug-extension/offscreen.js in a node:vm context
// (same approach as capture-errors.test.ts) and checks both halves of the fix:
// the codec choice, and that a stop can no longer hang when `stop` never fires.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');

function loadOffscreen() {
  // setTimeout callbacks are collected, not run, so the test decides when the
  // stop fallback fires instead of waiting 5 real seconds.
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const sandbox: Record<string, unknown> = {
    location: { search: '' },
    document: { getElementById: () => null, querySelector: () => null },
    navigator: {},
    chrome: { runtime: { onMessage: { addListener: () => {} } } },
    URLSearchParams,
    Blob,
    FileReader: class {
      result: string | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.result = 'data:video/webm;base64,'; queueMicrotask(() => this.onload?.()); }
    },
    MediaRecorder: { isTypeSupported: () => true },
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: () => {},
  };
  sandbox.self = sandbox;
  const ctx = createContext(sandbox);
  runInContext(readFileSync(join(extDir, 'offscreen.js'), 'utf8'), ctx);
  return { ctx, timers };
}

describe('offscreen.js picks a codec the stream can actually fill', () => {
  const { ctx } = loadOffscreen();
  const pick = runInContext('pickMimeType', ctx) as (hasAudio: boolean) => string;

  it('names no audio codec when the stream has no audio track', () => {
    expect(pick(false)).toBe('video/webm;codecs=vp9');
    expect(pick(false)).not.toMatch(/opus/);
  });

  it('still records audio (opus) when there is an audio track', () => {
    expect(pick(true)).toBe('video/webm;codecs=vp9,opus');
  });
});

describe('a stop can no longer hang when MediaRecorder never fires `stop`', () => {
  it('finishes after the fallback, tears down, and returns a recording', async () => {
    const { ctx, timers } = loadOffscreen();
    let stopCalls = 0;
    // A recorder that behaves like Firefox's stalled one: stop() is accepted
    // but `stop` is never dispatched.
    runInContext('_startedAt = Date.now(); _recorder = undefined;', ctx);
    (ctx as Record<string, unknown>).__fakeRecorder = {
      state: 'recording',
      onstop: null,
      requestData() {},
      stop() { stopCalls++; this.state = 'inactive'; },
    };
    runInContext('_recorder = __fakeRecorder;', ctx);

    const stopAndBuild = runInContext('stopAndBuildRecording', ctx) as () => Promise<{ dataUrl: string } | null>;
    let settled = false;
    const result = stopAndBuild().then((r) => { settled = true; return r; });

    await new Promise((r) => setImmediate(r));
    expect(stopCalls).toBe(1);
    expect(settled).toBe(false); // still waiting for an event that will never come

    const fallback = timers.find((t) => t.ms === runInContext('STOP_FALLBACK_MS', ctx));
    expect(fallback).toBeDefined();
    fallback!.fn();

    const rec = await result;
    expect(rec).not.toBeNull();
    expect(rec!.dataUrl).toMatch(/^data:video\/webm/);
    expect(runInContext('_recorder', ctx)).toBeNull(); // torn down: screen share released
  });
});
