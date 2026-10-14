// 1.11 ships with screen recording PAUSED in the extension.
//
// The guarantee under test is not "the checkbox is hidden" — it is that no
// entry point can start a video recording, including the ones that never touch
// the popup. An updater was seeded `tb_record_opts.video: true` by
// background.js, and that stored value must be ignored rather than deleted, so
// 1.11.1 can honour it again without the user re-choosing.
//
// See docs/launch/video-1.11.1.md and VIDEO_ENABLED_IN_EXTENSION.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { VIDEO_ENABLED_IN_EXTENSION, isVideoOffered, startVideoRecording } from '../src/video-recorder';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ext = (f: string) => readFileSync(join(root, 'tracebug-extension', f), 'utf8');
const src = (f: string) => readFileSync(join(root, 'src', f), 'utf8');

/**
 * Pretend to be the extension.
 *
 * isExtensionContext() reads `window.__TRACEBUG_INITIALIZED__`, which
 * tracebug-init.js sets - NOT the presence of `chrome`. Faking `chrome` looked
 * right and tested nothing, which is how the first run of this file reported
 * "not supported" instead of "paused".
 */
function asExtension(on: boolean) {
  const w = window as Window & { __TRACEBUG_INITIALIZED__?: boolean };
  if (on) w.__TRACEBUG_INITIALIZED__ = true;
  else delete w.__TRACEBUG_INITIALIZED__;
}

describe('the switch itself', () => {
  afterEach(() => asExtension(false));

  it('is off for 1.11', () => {
    expect(VIDEO_ENABLED_IN_EXTENSION).toBe(false);
  });

  it('lives in exactly one place, and points at the write-up', () => {
    // One switch to flip in 1.11.1. If this count grows, flipping it stops
    // being reliable.
    const vr = src('video-recorder.ts');
    expect((vr.match(/VIDEO_ENABLED_IN_EXTENSION\s*=/g) ?? [])).toHaveLength(1);
    expect(vr).toContain('docs/launch/video-1.11.1.md');
  });

  it('gates the EXTENSION only — the npm SDK is untouched', () => {
    asExtension(false);
    expect(isVideoOffered()).toBe(true);   // SDK: records in the page, owns its stream
    asExtension(true);
    expect(isVideoOffered()).toBe(false);  // extension: paused
  });
});

describe('no entry point can start a video recording in extension mode', () => {
  beforeEach(() => asExtension(true));
  afterEach(() => { asExtension(false); vi.restoreAllMocks(); });

  it('startVideoRecording refuses, and says why', async () => {
    // The transport chokepoint. Everything funnels here: the popup message,
    // the Alt+B command path, the toolbar button, a replayed message.
    const statuses: Array<[string, string | undefined]> = [];
    const ok = await startVideoRecording({
      onStatus: (s, m) => statuses.push([s, m]),
    });
    expect(ok).toBe(false);
    expect(statuses[0][0]).toBe('error');
    expect(statuses[0][1]).toMatch(/paused in this version/i);
    // And it says what the user gets instead, rather than just refusing.
    expect(statuses[0][1]).toMatch(/console, network/i);
  });

  it('refuses before reaching the offscreen document', async () => {
    // If it got as far as the RPC, a user would see a share picker open and
    // then fail - worse than never offering it.
    const rpc = vi.fn();
    (globalThis as { chrome?: Record<string, unknown> }).chrome = {
      runtime: { id: 'abc', sendMessage: rpc },
    };
    const ok = await startVideoRecording({ surfaceMode: 'tab' });
    expect(ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    delete (globalThis as { chrome?: unknown }).chrome;
  });
});

describe('a stored video:true is ignored, not obeyed and not erased', () => {
  it('prepareRecording falls through to an events capture', () => {
    // The popup path: tracebug-init dispatches `record` with the stored
    // `video` flag, which reaches prepareRecording. An updater was SEEDED
    // video:true by background.js, so this is the common case, not an edge one.
    const index = src('index.ts');
    const i = index.indexOf('prepareRecording(opts: {');
    const body = index.slice(i, i + 1200);
    expect(body).toContain('if (!opts.video || !isVideoOffered())');
    expect(body).toContain('startEventsCapture');
  });

  it('nothing clears or rewrites the stored preference', () => {
    // 1.11.1 restores video by flipping one constant; the user must not have
    // to re-choose. So no code may remove tb_record_opts or null its `video`.
    const popup = ext('popup.js');
    const bg = ext('background.js');
    expect(popup).not.toMatch(/storage\.local\.remove\(\s*\[?\s*["'`]tb_record_opts/);
    expect(bg).not.toMatch(/storage\.local\.remove\(\s*\[?\s*["'`]tb_record_opts/);
    // The worker still seeds the per-reason default, untouched.
    expect(bg).toContain('seedRecordOptsDefault');
  });

  it('the popup never writes video:true now the control is gone', () => {
    // saveRecordOpts reads the checkbox; with no checkbox it must write false
    // rather than throw or persist a stale true.
    const popup = ext('popup.js');
    expect(popup).toContain('video: videoCb ? !!videoCb.checked : false');
  });
});

describe('no video or mic control renders in extension mode', () => {
  it('the popup has no video checkbox and no microphone row', () => {
    const html = ext('popup.html');
    const visible = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(visible).not.toContain('id="optVideo"');
    expect(visible).not.toContain('id="micOpt"');
    expect(visible).not.toContain('Record video too');
    // And it says what it does instead.
    expect(visible).toMatch(/Screen recording is paused in this version/);
  });

  it('the toolbar record button is absent, not disabled', () => {
    // A disabled button invites a click and then an explanation. An absent one
    // asks nothing.
    const tb = src('compact-toolbar.ts');
    expect(tb).toContain('if (isVideoOffered()) {');
    const i = tb.indexOf('if (isVideoOffered()) {');
    expect(tb.slice(i, i + 700)).toContain('tracebug-toolbar-record-btn');
  });

  it('the HUD mic button cannot render where the page does not own the stream', () => {
    const hud = src('ui/recording-hud.ts');
    expect(hud).toContain('isVideoOffered() && hasMicrophoneTrack()');
  });

  it('the preflight surface choice is gated too', () => {
    const tb = src('compact-toolbar.ts');
    expect(tb).toContain('const showSurfaceChoice = !isExtensionMode();');
  });
});
