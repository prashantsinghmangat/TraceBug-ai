import { describe, it, expect } from 'vitest';
import { buildHar } from '../src/exporters/har-export';
import type { BugReport } from '../src/types';

function fakeReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    title: 'Vendor Update Fails',
    summary: 'PUT /api/vendors/42 returns 500',
    severity: 'critical',
    generatedAt: 1751790000000,
    environment: {
      browser: 'Chrome', browserVersion: '126', os: 'Windows 11', viewport: '1920x1080',
      screenResolution: '1920x1080', language: 'en-US', timezone: 'UTC', userAgent: 'UA',
      url: 'https://app.example.com/vendors/42', deviceType: 'desktop', connectionType: '4g',
      timestamp: 1751789990000,
    },
    session: { sessionId: 'abcdef1234567890', events: [] },
    steps: '',
    sessionSteps: [],
    consoleErrors: [],
    consoleLogs: [],
    networkErrors: [
      { method: 'PUT', url: 'https://api.example.com/vendors/42?draft=true&x=1', status: 500, duration: 312, timestamp: 1751789995000, response: '{"error":"taxId is required"}' },
    ],
    networkRequests: [
      { method: 'GET', url: 'https://api.example.com/vendors/42', status: 200, duration: 120, timestamp: 1751789992000 },
      { method: 'PUT', url: 'https://api.example.com/vendors/42?draft=true&x=1', status: 500, duration: 312, timestamp: 1751789995000, response: '{"error":"taxId is required"}' },
    ],
    screenshots: [],
    annotations: [],
    ...overrides,
  } as unknown as BugReport;
}

describe('buildHar', () => {
  it('produces a valid HAR 1.2 envelope', () => {
    const har = buildHar(fakeReport(), '1.6.0');
    expect(har.log.version).toBe('1.2');
    expect(har.log.creator).toEqual({ name: 'TraceBug', version: '1.6.0' });
    expect(har.log.browser).toEqual({ name: 'Chrome', version: '126' });
    expect(har.log.pages).toHaveLength(1);
    expect(har.log.pages[0].id).toBe('page_1');
    expect(har.log.pages[0].title).toBe('https://app.example.com/vendors/42');
    // startedDateTime must be ISO 8601.
    expect(har.log.pages[0].startedDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('maps every request to an entry, chronologically', () => {
    const har = buildHar(fakeReport());
    expect(har.log.entries).toHaveLength(2);
    // Sorted by timestamp: GET (…992) before PUT (…995).
    expect(har.log.entries[0].request.method).toBe('GET');
    expect(har.log.entries[1].request.method).toBe('PUT');
    for (const e of har.log.entries) {
      expect(e.pageref).toBe('page_1');
      expect(e.startedDateTime).toMatch(/Z$/);
      expect(e.request.httpVersion).toBe('HTTP/1.1');
      expect(Array.isArray(e.request.headers)).toBe(true);
      expect(Array.isArray(e.request.cookies)).toBe(true);
      expect(e.request.headersSize).toBe(-1);
      expect(e.response.httpVersion).toBe('HTTP/1.1');
      expect(e.cache).toEqual({});
      expect(e.timings.wait).toBe(e.time);
    }
  });

  it('parses the query string into name/value pairs', () => {
    const har = buildHar(fakeReport());
    const put = har.log.entries[1];
    expect(put.request.queryString).toEqual([
      { name: 'draft', value: 'true' },
      { name: 'x', value: '1' },
    ]);
    // GET has no query string.
    expect(har.log.entries[0].request.queryString).toEqual([]);
  });

  it('includes the failed response body with a guessed mime type and correct status text', () => {
    const har = buildHar(fakeReport());
    const put = har.log.entries[1];
    expect(put.response.status).toBe(500);
    expect(put.response.statusText).toBe('Internal Server Error');
    expect(put.response.content.mimeType).toBe('application/json');
    expect(put.response.content.text).toContain('taxId');
    expect(put.response.content.size).toBe('{"error":"taxId is required"}'.length);
    // The 200 GET has no captured body.
    expect(har.log.entries[0].response.content).toEqual({ size: 0, mimeType: '' });
  });

  it('falls back to networkErrors when networkRequests is empty', () => {
    const har = buildHar(fakeReport({ networkRequests: [] }));
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0].response.status).toBe(500);
  });

  it('handles a report with no network activity', () => {
    const har = buildHar(fakeReport({ networkRequests: [], networkErrors: [] }));
    expect(har.log.entries).toHaveLength(0);
    expect(har.log.version).toBe('1.2'); // still a valid envelope
  });

  it('omits the browser block when environment has none', () => {
    const r = fakeReport();
    (r as unknown as { environment: { browser: string } }).environment.browser = '';
    const har = buildHar(r);
    expect(har.log.browser).toBeUndefined();
  });

  it('serializes to valid JSON', () => {
    const json = JSON.stringify(buildHar(fakeReport()));
    const parsed = JSON.parse(json);
    expect(parsed.log.entries).toHaveLength(2);
  });
});
