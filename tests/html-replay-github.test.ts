import { describe, it, expect } from 'vitest';
import { buildReplayBlob } from '../src/exporters/html-replay';
import type { BugReport } from '../src/types';

function report(): BugReport {
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
    voiceTranscripts: [], context: {}, generatedAt: 1,
    session: { sessionId: 'sess-1234', projectId: 'p', createdAt: 0, updatedAt: 1, events: [], annotations: [], environment: env },
  } as unknown as BugReport;
}

describe('exported viewer issue actions', () => {
  it('embeds a prefilled GitHub issue URL when githubRepo is set', async () => {
    const blob = await buildReplayBlob(report().session as any, report(), { githubRepo: 'acme/shop' });
    const html = await blob.text();
    expect(html).toContain('https://github.com/acme/shop/issues/new');
    expect(html).toContain('id="gh-open"');
    expect(html).toContain('id="gh-copy"');
  });

  it('embeds copyable issue markdown even without a repo', async () => {
    const blob = await buildReplayBlob(report().session as any, report(), {});
    const html = await blob.text();
    expect(html).not.toContain('/issues/new');
    // Markdown body is embedded in the payload for the copy button.
    expect(html).toContain('Steps to Reproduce');
    expect(html).toContain('Full Repro Replay');
  });

  it('marks severity as auto-classified in the Info rows', async () => {
    const blob = await buildReplayBlob(report().session as any, report(), {});
    const html = await blob.text();
    expect(html).toContain('Severity (auto)');
  });
});
