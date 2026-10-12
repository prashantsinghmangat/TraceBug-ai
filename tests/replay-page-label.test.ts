// Phase 4: the exported .html must not imply the DOM replay covers the whole
// session.
//
// rrweb is started fresh on every document (src/rrweb-recorder.ts
// `startDomRecording`), while an events capture deliberately SURVIVES a
// navigation (src/index.ts `startEventsCapture`). So after one navigation the
// console, network and action lists in the export span the whole capture and
// the replay beside them covers only the page it ended on. A heading that
// just says "Replay" invites the recipient — usually not the person who
// captured it — to conclude the earlier pages simply had nothing on them.
import { describe, it, expect } from 'vitest';
import { buildReplayBlob } from '../src/exporters/html-replay';
import type { BugReport } from '../src/types';

/** The rrweb Meta event: type 4, carrying the document's href. */
const meta = (href: string) => ({ type: 4, data: { href, width: 1440, height: 900 }, timestamp: 1 });
/** Any non-Meta event, so the stream is more than its header. */
const fullSnapshot = { type: 2, data: { node: {}, initialOffset: { top: 0, left: 0 } }, timestamp: 2 };

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

/** A replay-only `report.video`, the shape report-builder makes for an
 *  events capture: every video field empty, the rrweb stream present. */
function replayOnly(href: string) {
  return {
    url: '', dataUrl: '', mimeType: '', sizeBytes: 0, durationMs: 4000,
    comments: [], startedAt: 0, rrwebEvents: [meta(href), fullSnapshot],
  };
}

async function exportHtml(r: BugReport): Promise<string> {
  const blob = await buildReplayBlob(r.session as never, r, {});
  return blob.text();
}

describe('the replay heading names the page it covers', () => {
  it('says "Replay of the last page" with the path, for an events capture', async () => {
    const html = await exportHtml(report(replayOnly('http://localhost/checkout/payment')));
    expect(html).toContain('Replay of the last page');
    expect(html).toContain('(/checkout/payment)');
  });

  it('keeps the query string — it is often the whole repro', async () => {
    const html = await exportHtml(report(replayOnly('http://localhost/search?q=widget&page=2')));
    // Escaped, because it is interpolated into the heading markup.
    expect(html).toContain('(/search?q=widget&amp;page=2)');
  });

  it('falls back to a plain "Replay" when the path says nothing', async () => {
    // A capture on the site root. "(/)" is noise next to the origin the Info
    // tab already shows.
    const html = await exportHtml(report(replayOnly('http://localhost/')));
    expect(html).toContain('<h2 class="tb-vh2">Replay</h2>');
    expect(html).not.toContain('Replay of the last page');
  });

  it('falls back when the stream has no readable Meta event', async () => {
    const v = replayOnly('http://localhost/checkout');
    v.rrwebEvents = [fullSnapshot];
    const html = await exportHtml(report(v));
    expect(html).toContain('<h2 class="tb-vh2">Replay</h2>');
    expect(html).not.toContain('Replay of the last page');
  });

  it('does NOT claim "last page" on the video path', async () => {
    // A screen recording keeps rolling across navigations, so there the label
    // would be the inaccuracy. `includeVideo` forces the video in alongside
    // the DOM stream.
    const r = report({
      url: '', dataUrl: 'data:video/webm;base64,AAAA', mimeType: 'video/webm',
      sizeBytes: 4, durationMs: 4000, comments: [], startedAt: 0,
      rrwebEvents: [meta('http://localhost/checkout/payment'), fullSnapshot],
    });
    const blob = await buildReplayBlob(r.session as never, r, { includeVideo: true });
    const html = await blob.text();
    expect(html).not.toContain('Replay of the last page');
  });

  it('does not name a page when there is no DOM replay at all', async () => {
    const html = await exportHtml(report());
    expect(html).toContain('<h2 class="tb-vh2">Replay</h2>');
    expect(html).not.toContain('Replay of the last page');
  });

  it('leaves the timeline scrubber label alone', async () => {
    // The scrubber is built from the session's events and really does span the
    // whole capture — renaming it would trade one inaccuracy for another.
    const html = await exportHtml(report(replayOnly('http://localhost/checkout/payment')));
    expect(html).toContain('tb-rs-label">Replay<');
  });
});
