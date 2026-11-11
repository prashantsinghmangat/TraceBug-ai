// The ticket description is markdown. The exported .html shows it as a
// reading view (rendered in the page by renderMarkdown) with a toggle back
// to the raw markdown, which stays in the page for copying.
import { describe, it, expect } from 'vitest';
import { buildReplayBlob } from '../src/exporters/html-replay';
import type { BugReport } from '../src/types';

const env = {
  browser: 'Chrome', browserVersion: '157', os: 'Windows', viewport: '1600x732',
  screenResolution: '1600x732', language: 'en', timezone: 'UTC', userAgent: 'x',
  url: 'http://localhost/r/x', deviceType: 'desktop', connectionType: '4g', timestamp: 1,
};
const report = {
  title: 'T', summary: '', steps: '', environment: env, consoleErrors: [], networkErrors: [],
  networkRequests: [], sessionSteps: [], actionChips: [], clickedElement: null, rootCause: null,
  severity: 'medium', priority: 'p2', annotations: [], screenshots: [], timeline: [],
  voiceTranscripts: [], context: {}, generatedAt: 1,
  session: { sessionId: 'sess-1234', projectId: 'p', createdAt: 0, updatedAt: 1, events: [], annotations: [], environment: env },
} as unknown as BugReport;

describe('exported description', () => {
  it('ships a reading view, a raw-markdown toggle and the raw text', async () => {
    const desc = '**Summary:** Checkout fails\n\n**Expected:** _(what should happen)_';
    const html = await (await buildReplayBlob(report.session as never, report, { descriptionOverride: desc })).text();
    expect(html).toContain('id="desc-md"');
    expect(html).toContain('id="desc-toggle"');
    expect(html).toContain('function renderMarkdown(src)');
    const json = /<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
    expect(JSON.parse(json).description).toBe(desc);
  });
});
