// Tab mode (chrome.tabCapture, no share dialog) falls back to the share dialog
// when it can't run, and the page says why.
import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadBackground, type ChromeMock } from './helpers/chrome-mock';
import { explainTabModeFallback } from '../src/video-recorder';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type Resolve = (tabId: number) => Promise<{ streamId?: string; reason?: string }>;

describe('resolveTabCaptureStreamId says why Tab mode is unavailable', () => {
  let mock: ChromeMock;
  let bg: Record<string, unknown>;
  let granted: boolean;
  beforeEach(() => {
    mock = createChromeMock();
    granted = true;
    (mock.chrome.permissions as Record<string, unknown>).contains =
      (_q: unknown, cb: (g: boolean) => void) => cb(granted);
    bg = loadBackground(mock);
  });
  const resolve = (id = 7) => (bg.resolveTabCaptureStreamId as Resolve)(id);

  it('returns the stream id when Chrome issues one', async () => {
    (mock.chrome as Record<string, unknown>).tabCapture = {
      getMediaStreamId: (o: { targetTabId: number }, cb: (id: string) => void) => cb(`sid-${o.targetTabId}`),
    };
    expect(await resolve()).toEqual({ streamId: 'sid-7' });
  });

  it('"permission" when tabCapture is not granted', async () => {
    granted = false;
    expect(await resolve()).toEqual({ reason: 'permission' });
  });

  it('"not-allowed" when Chrome refuses the tab', async () => {
    (mock.chrome as Record<string, unknown>).tabCapture = {
      getMediaStreamId: (_o: unknown, cb: (id?: string) => void) => cb(undefined),
    };
    expect(await resolve()).toEqual({ reason: 'not-allowed' });
  });

  it('"unavailable" when there is no tabCapture API', async () => {
    expect(await resolve()).toEqual({ reason: 'unavailable' });
  });
});

describe('explainTabModeFallback', () => {
  it('names each reason, and says the share dialog was used', () => {
    expect(explainTabModeFallback('permission')).toMatch(/permission was declined/);
    expect(explainTabModeFallback('expired')).toMatch(/expired/);
    expect(explainTabModeFallback('not-allowed')).toMatch(/doesn't allow recording this page/);
    expect(explainTabModeFallback(undefined)).toMatch(/isn't available/);
    for (const r of ['permission', 'expired', 'not-allowed', undefined]) {
      expect(explainTabModeFallback(r)).toMatch(/share dialog instead/);
    }
  });
});

// A runtime (optional) grant can never record the tab it was granted on: Chrome
// only issues a tab stream id for a tab the extension was invoked on while it
// already held tabCapture. So it is a required Chrome permission — gated with
// offscreen on the video build — and absent from the shared base (Firefox).
describe('tabCapture is a required Chrome permission', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
  const json = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

  it('is required in the unpacked manifest, never optional', () => {
    const m = json('manifest.json');
    expect(m.permissions).toContain('tabCapture');
    expect(m.optional_permissions ?? []).not.toContain('tabCapture');
  });

  it('is left out of the base manifest the Firefox build uses', () => {
    const base = json('build/manifest.base.json');
    expect(base.permissions).not.toContain('tabCapture');
    expect(base.optional_permissions).toBeUndefined();
  });

  it('is added by the Chrome build alongside offscreen', () => {
    const src = readFileSync(join(root, 'build', 'build-ext.mjs'), 'utf8');
    expect(src).toContain('...(VIDEO_ON ? ["offscreen", "tabCapture"] : [])');
  });
});
