// GitHub hardening 6: the body of an issue TraceBug FILES through GitHub's API
// must not promise an attachment or link that isn't there. Nothing can be
// attached that way, so it names what was captured and points the reader to
// the reporter. Copy-as-markdown (the reporter pastes it and drops the files
// in) keeps its drag-and-drop instructions. The duplicate marker stays.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateGitHubIssue } from '../src/github-issue';
import { buildReport } from '../src/report-builder';
import { postGitHubIssue } from '../src/providers/api';
import type { StoredSession, EnvironmentInfo, ScreenshotData } from '../src/types';

const env: EnvironmentInfo = {
  browser: 'Chrome', browserVersion: '149', os: 'Windows', viewport: '1280x720', screenResolution: '1920x1080',
  language: 'en', timezone: 'UTC', userAgent: 'x', url: 'http://localhost/checkout', deviceType: 'desktop',
  connectionType: '4g', timestamp: Date.now(),
};
const session: StoredSession = {
  sessionId: 'abcdef1234', projectId: 'p', createdAt: Date.now(), updatedAt: Date.now(),
  errorMessage: 'TypeError: x is undefined', errorStack: null, reproSteps: null, errorSummary: null,
  events: [], annotations: [], environment: env,
};
const shot = (n: number): ScreenshotData => ({
  id: 's' + n, timestamp: Date.now(), dataUrl: 'data:image/png;base64,AAAA', page: '/checkout',
  eventContext: 'click', filename: `01_click_checkout_${n}.png`, width: 10, height: 10,
} as unknown as ScreenshotData);

function report() {
  const r = buildReport(session, [shot(1), shot(2)]);
  r.video = { mimeType: 'video/webm', startedAt: Date.now(), durationMs: 65_000, sizeBytes: 2 * 1024 * 1024, comments: [] } as never;
  return r;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('a filed GitHub issue promises nothing it does not carry', () => {
  const body = generateGitHubIssue(report(), { filed: true });

  it('no "drag and drop", no file names presented as attached, no "attached" claim', () => {
    expect(body).not.toMatch(/drag and drop/i);
    expect(body).not.toMatch(/01_click_checkout_1\.png/);
    expect(body).not.toMatch(/screenshot attached|is attached|are attached|attached below/i);
  });

  it('names what was captured and points the reader to the reporter', () => {
    expect(body).toMatch(/2 screenshots were captured\. They aren't attached here/);
    expect(body).toMatch(/A screen recording was captured \(01:05 · 2\.0 MB\)\. It isn't attached here — ask the reporter for it\./);
    expect(body).toMatch(/### Full Repro Replay\n\n> Not attached\. The reporter can export an offline replay/);
    expect(body).toMatch(/`\.html` file, or a `\.zip`/);
    expect(body).toMatch(/Ask them for it/);
  });

  it('copy-as-markdown keeps its drag-and-drop instructions', () => {
    const md = generateGitHubIssue(report());
    expect(md).toMatch(/Drag and drop the downloaded screenshot files below/);
    expect(md).toMatch(/Drag and drop the TraceBug `\.zip` export here/);
  });

  it('the duplicate marker still ends the body sent to GitHub', async () => {
    let sent = '';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)).body;
      return new Response(JSON.stringify({ html_url: 'https://github.com/a/b/issues/1', number: 1 }), { status: 201 });
    }));
    await postGitHubIssue({ token: 't', repo: 'a/b' }, { title: 'x', body, sendId: '1d36a089-7f37-495c-b4af-285a107048a0' });
    expect(sent.trimEnd().endsWith('<!-- tracebug:1d36a089-7f37-495c-b4af-285a107048a0 -->')).toBe(true);
  });
});
