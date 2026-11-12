// A screen recording must reach the exported .html even when the DOM replay
// does too. Every video recording also carries rrweb events
// (src/video-recorder.ts), and the exporter used to drop the video whenever
// rrweb was present — so a recording with microphone narration or tab audio
// exported as a silent DOM replay. The video is the only surface with sound.
import { describe, it, expect } from 'vitest';
import { buildReplayBlob } from '../src/exporters/html-replay';
import type { BugReport } from '../src/types';

const meta = { type: 4, data: { href: 'http://localhost/checkout', width: 1440, height: 900 }, timestamp: 1 };
const fullSnapshot = { type: 2, data: { node: {}, initialOffset: { top: 0, left: 0 } }, timestamp: 2 };
// A data URL with a codecs list: the shape MediaRecorder gives a recording with audio.
const VIDEO_DATA_URL = 'data:video/webm;codecs=vp9,opus;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKChHdlYm0=';

function report(video?: Record<string, unknown>): BugReport {
  const env = {
    browser: 'Chrome', browserVersion: '150', os: 'Windows', viewport: '1440x900',
    screenResolution: '1440x900', language: 'en', timezone: 'UTC', userAgent: 'x',
    url: 'http://localhost/checkout', deviceType: 'desktop', connectionType: '4g', timestamp: 1,
  };
  return {
    title: 'Checkout fails', summary: '', steps: 'Click "Pay"', environment: env,
    consoleErrors: [], networkErrors: [], networkRequests: [], sessionSteps: [],
    actionChips: [], clickedElement: null, rootCause: null, severity: 'medium',
    priority: 'p2', annotations: [], screenshots: [], timeline: [],
    voiceTranscripts: [], context: {}, generatedAt: 1, video,
    session: { sessionId: 'sess-1234', projectId: 'p', createdAt: 0, updatedAt: 1, events: [], annotations: [], environment: env },
  } as unknown as BugReport;
}

const recording = () => ({
  url: '', dataUrl: VIDEO_DATA_URL, mimeType: 'video/webm;codecs=vp9,opus', sizeBytes: 29,
  durationMs: 6000, comments: [], startedAt: 0, rrwebEvents: [meta, fullSnapshot],
});

async function payload(r: BugReport, options = {}) {
  const html = await (await buildReplayBlob(r.session as never, r, options)).text();
  const json = /<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
  return { html, data: JSON.parse(json) };
}

describe('a recorded video reaches the export', () => {
  it('embeds the video (and so its audio) alongside the DOM replay', async () => {
    const { data } = await payload(report(recording()));
    expect(data.video?.dataUrl).toBe(VIDEO_DATA_URL);
    expect(data.rrwebEventsGz || data.rrwebEvents).toBeTruthy();
  });

  it('keeps an events-only capture video-free', async () => {
    const replayOnly = { ...recording(), dataUrl: '', mimeType: '', sizeBytes: 0 };
    const { data } = await payload(report(replayOnly));
    expect(data.video).toBeUndefined();
    expect(data.rrwebEventsGz || data.rrwebEvents).toBeTruthy();
  });

  it('still lets a caller leave the video out', async () => {
    const { data } = await payload(report(recording()), { includeVideo: false });
    expect(data.video).toBeUndefined();
  });

  it('offers a switch between the video and the page replay', async () => {
    const { html, data } = await payload(report(recording()));
    expect(html).toContain('Page replay');
    // The switch labels the video by whether its codecs include audio.
    expect(data.video.mimeType).toContain('opus');
    expect(html).toContain('"Video with audio" : "Video"');
  });
});
