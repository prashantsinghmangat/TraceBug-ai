// 1.11.2 restores screen recording in the extension — see
// docs/launch/video-1.11.1.md ("Flipping the switch"). This file replaces
// tests/video-paused-1-11.test.ts, which pinned the OPPOSITE behaviour for
// 1.11/1.11.1. Per that doc's own instruction ("Replace it, don't weaken it"),
// this pins the restored behaviour rather than just deleting the old pin.
//
// Bug 1 (recording lost on stop) was re-verified in a real browser — see
// e2e/ext-video-recording.e2e.mjs — and did not reproduce; the quick-bug.ts
// stash-then-refresh rework (commit dda5ac8) looks to have already fixed the
// race the doc's hypothesis described. Bug 4 (HUD mic-mute wired to a stream
// the extension page doesn't own) was fixed properly in 1.11.3 via an
// offscreen RPC (`tb:rec:mic-mute` + `micIncluded`/`micMuted` on
// `tb:rec:status`/`tb:rec:started`) rather than left disabled — see the "no
// mic control" describe block below for what's still pinned there, and
// docs/audit/capture-flow-1.11.3.md for the fix.
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

  it('is on for 1.11.2', () => {
    expect(VIDEO_ENABLED_IN_EXTENSION).toBe(true);
  });

  it('lives in exactly one place, and points at the write-up', () => {
    // One switch to flip. If this count grows, flipping it stops being reliable.
    const vr = src('video-recorder.ts');
    expect((vr.match(/VIDEO_ENABLED_IN_EXTENSION\s*=/g) ?? [])).toHaveLength(1);
    expect(vr).toContain('docs/launch/video-1.11.1.md');
  });

  it('is offered everywhere now — page and extension alike', () => {
    asExtension(false);
    expect(isVideoOffered()).toBe(true);   // SDK: records in the page, owns its stream
    asExtension(true);
    expect(isVideoOffered()).toBe(true);   // extension: restored in 1.11.2
  });
});

describe('starting a video recording in extension mode reaches the offscreen bridge', () => {
  beforeEach(() => asExtension(true));
  afterEach(() => { asExtension(false); vi.restoreAllMocks(); });

  it('dispatches tb:rec:start over the RPC bridge instead of refusing', async () => {
    // The transport chokepoint. Everything funnels here: the popup message,
    // the Alt+B command path, the toolbar button, a replayed message. In
    // jsdom there is no real content script to answer, so we answer the
    // CustomEvent ourselves — the point of this test is only that the call
    // REACHES the bridge, not what the offscreen document does with it
    // (that needs a real browser — see e2e/ext-video-recording.e2e.mjs).
    const seen: Array<{ type: string; data?: unknown }> = [];
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; type: string; data?: unknown };
      seen.push({ type: detail.type, data: detail.data });
      window.dispatchEvent(new CustomEvent('tracebug-rec-response', {
        detail: { id: detail.id, result: { ok: true } },
      }));
    };
    window.addEventListener('tracebug-rec-request', onRequest);
    try {
      const ok = await startVideoRecording({ surfaceMode: 'desktop' });
      expect(ok).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].type).toBe('tb:rec:start');
    } finally {
      window.removeEventListener('tracebug-rec-request', onRequest);
    }
  });
});

describe('a stored video:true is honoured again', () => {
  it('prepareRecording starts a video recording when the stored pref says so', () => {
    // The popup path: tracebug-init dispatches `record` with the stored
    // `video` flag, which reaches prepareRecording.
    const index = src('index.ts');
    const i = index.indexOf('prepareRecording(opts: {');
    const body = index.slice(i, i + 1200);
    expect(body).toContain('if (!opts.video || !isVideoOffered())');
    expect(body).toContain('startEventsCapture');
    expect(body).toContain('startVideoRecording');
  });

  it('nothing clears or rewrites the stored preference', () => {
    const popup = ext('popup.js');
    const bg = ext('background.js');
    expect(popup).not.toMatch(/storage\.local\.remove\(\s*\[?\s*["'`]tb_record_opts/);
    expect(bg).not.toMatch(/storage\.local\.remove\(\s*\[?\s*["'`]tb_record_opts/);
    expect(bg).toContain('seedRecordOptsDefault');
  });

  it('the popup checkbox drives the video flag again', () => {
    const popup = ext('popup.js');
    expect(popup).toContain('video: videoCb ? !!videoCb.checked : false');
  });
});

describe('video and mic controls render in extension mode again', () => {
  it('the popup has a video checkbox and a microphone row', () => {
    const html = ext('popup.html');
    const visible = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(visible).toContain('id="optVideo"');
    expect(visible).toContain('id="micOpt"');
    expect(visible).toMatch(/Record video too/);
  });

  it('the toolbar record button renders — isVideoOffered() is true', () => {
    const tb = src('compact-toolbar.ts');
    expect(tb).toContain('if (isVideoOffered()) {');
    const i = tb.indexOf('if (isVideoOffered()) {');
    expect(tb.slice(i, i + 700)).toContain('tracebug-toolbar-record-btn');
  });

  it('the HUD mic-mute button works in extension mode — Bug 4 is fixed via RPC (1.11.3)', () => {
    // hasMicrophoneTrack()/isMicrophoneMuted()/setMicrophoneMuted() used to
    // read page-side `_stream` unconditionally, which the extension transport
    // never sets (the stream lives in the offscreen document, not the page) —
    // permanently false, a dead button. They now branch on isExtensionContext()
    // first and mirror state forwarded from offscreen.js over tb:rec:started /
    // tb:rec:status, and setMicrophoneMuted forwards the mute to offscreen.js
    // over a new tb:rec:mic-mute RPC. See src/ui/recording-hud.ts's
    // micAvailable computation, which is unchanged and now reflects real state.
    const hud = src('ui/recording-hud.ts');
    expect(hud).toContain('isVideoOffered() && hasMicrophoneTrack()');
    const vr = src('video-recorder.ts');
    const i = vr.indexOf('export function hasMicrophoneTrack()');
    expect(vr.slice(i, i + 200)).toContain('if (isExtensionContext()) return _extMicIncluded;');
    expect(vr.slice(i, i + 200)).toContain('if (!_stream) return false;');
    expect(vr).toContain('rpcCall("tb:rec:mic-mute", { muted })');
    const off = ext('offscreen.js');
    expect(off).toContain('case "tb:rec:mic-mute":');
  });

  it('the preflight surface choice stays gated — current-tab still needs tabCapture', () => {
    // Unrelated to the four video bugs: "This tab" needs chrome.tabCapture,
    // which was dropped in 1.10.1 to lose the browsing-history install
    // warning. Restoring it is a product decision, not part of this fix.
    const tb = src('compact-toolbar.ts');
    expect(tb).toContain('const showSurfaceChoice = !isExtensionMode();');
  });
});
