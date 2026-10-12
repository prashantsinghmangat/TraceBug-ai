// Phase 4: what the extension's recorder actually asks the browser for.
//
// The offscreen document is where getDisplayMedia is called, and it is not
// reachable from Playwright (an offscreen document is not a page), so a real
// browser cannot assert on its constraints. This runs the REAL
// tracebug-extension/offscreen.js in a node:vm context with a fake
// navigator.mediaDevices, and asserts on the arguments it passes.
//
// Two things under test, both bugs that were invisible before:
//
//  1. surfaceMode was IGNORED here. The popup persisted it, background.js and
//     content-script.js forwarded it, and this file never read it — so the
//     "Capture: Current tab" dropdown did nothing in the extension, while the
//     npm SDK path honoured it. docs/chrome-extension.md documented the SDK's
//     behaviour as if it were the extension's.
//
//  2. A macOS Screen-Recording denial was reported as "cancelled", i.e. as the
//     user changing their mind, with nothing pointing at System Settings.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const SOURCE = readFileSync(join(extDir, 'offscreen.js'), 'utf8');

interface Harness {
  start: (options?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  calls: Record<string, unknown>[];
  /** What getDisplayMedia should do: return a stream, or throw this error. */
  setOutcome: (fn: () => never) => void;
}

/** Load offscreen.js with just enough browser around it to reach the picker. */
function harness(): Harness {
  const calls: Record<string, unknown>[] = [];
  let outcome: () => never = () => {
    // Default: refuse, so the call stops right after the constraints are
    // recorded. Going further would need a real MediaRecorder.
    const e = new Error('Permission denied');
    (e as Error & { name: string }).name = 'NotAllowedError';
    throw e;
  };

  const sandbox: Record<string, unknown> = {
    location: { search: '' },
    document: { getElementById: () => null, querySelector: () => null, head: { appendChild: () => {} } },
    navigator: {
      mediaDevices: {
        getDisplayMedia: (constraints: Record<string, unknown>) => {
          calls.push(constraints);
          return Promise.resolve().then(() => outcome());
        },
        getUserMedia: () => Promise.reject(new Error('no mic')),
      },
    },
    chrome: {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: (_m: unknown, cb?: (r: unknown) => void) => { cb?.({ ok: true }); },
        lastError: undefined,
      },
    },
    URLSearchParams,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout,
    clearTimeout,
    MediaRecorder: class { static isTypeSupported() { return false; } },
  };
  const ctx = createContext(sandbox);
  runInContext(SOURCE, ctx);
  return {
    start: runInContext('_startRecordingImpl', ctx) as Harness['start'],
    calls,
    setOutcome: (fn) => { outcome = fn; },
  };
}

let h: Harness;
beforeEach(() => { h = harness(); });

describe('surfaceMode reaches getDisplayMedia', () => {
  it('asks for the current tab when the user chose "Current tab"', async () => {
    await h.start({ surfaceMode: 'tab' });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].preferCurrentTab).toBe(true);
  });

  it('does NOT ask for it on the desktop/window picker', async () => {
    // preferCurrentTab collapses the dialog to a one-click confirm, which is
    // exactly wrong for someone who asked to choose a window or a screen.
    await h.start({ surfaceMode: 'desktop' });
    expect(h.calls[0].preferCurrentTab).toBeUndefined();
  });

  it('does not ask for it when no mode was given', async () => {
    await h.start({});
    expect(h.calls[0].preferCurrentTab).toBeUndefined();
  });

  it('keeps surfaceSwitching so a navigation does not end the recording', async () => {
    // A QA flow that clicks through to the next page must not lose its video.
    await h.start({ surfaceMode: 'tab' });
    expect(h.calls[0].surfaceSwitching).toBe('include');
    expect(h.calls[0].selfBrowserSurface).toBe('exclude');
  });
});

describe('a blocked browser is not a cancelled user', () => {
  const throwing = (name: string, message: string) => () => {
    const e = new Error(message);
    (e as Error & { name: string }).name = name;
    throw e;
  };

  it('reports an OS refusal as system-permission', async () => {
    h.setOutcome(throwing('NotAllowedError', 'Permission denied by system'));
    const res = await h.start({ surfaceMode: 'tab' });
    expect(res).toEqual({ ok: false, error: 'system-permission' });
  });

  it('still reports a closed picker as cancelled', async () => {
    // The two arrive under the SAME error name; only the message differs.
    h.setOutcome(throwing('NotAllowedError', 'Permission denied'));
    const res = await h.start({ surfaceMode: 'tab' });
    expect(res).toEqual({ ok: false, error: 'cancelled' });
  });

  it('reports an abort as cancelled', async () => {
    h.setOutcome(throwing('AbortError', 'Starting video failed'));
    expect((await h.start({})).error).toBe('cancelled');
  });

  it('passes an unrelated failure through with its own message', async () => {
    h.setOutcome(throwing('NotReadableError', 'Could not start video source'));
    expect((await h.start({})).error).toBe('Could not start video source');
  });
});
