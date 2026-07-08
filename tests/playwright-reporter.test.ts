import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import TraceBugReporter, { traceBugPage, CAPTURE_ATTACHMENT } from '../src/reporters/playwright';
import { parseReportFile, toolGetBugReport, toolListBugReports } from '../cli/mcp-server';

// 1×1 transparent PNG
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const T0 = 1783400000000;

function fakeTest(overrides: Record<string, unknown> = {}) {
  return {
    title: 'vendor can be saved',
    id: 'test-abc-123',
    retries: 0,
    location: { file: 'tests/vendor.spec.ts', line: 42 },
    titlePath: () => ['', 'chromium', 'vendor.spec.ts', 'vendors', 'vendor can be saved'],
    parent: { project: () => ({ name: 'chromium' }) },
    ...overrides,
  };
}

function fakeCapture() {
  return {
    consoleLogs: [
      { level: 'warn', message: 'deprecated prop', timestamp: T0 + 1000 },
      { level: 'error', message: 'TypeError: cannot read undefined', stack: 'at save (vendor.ts:88)', timestamp: T0 + 4000 },
    ],
    requests: [
      { method: 'GET', url: 'http://localhost:3000/api/vendors/42', status: 200, duration: 120, timestamp: T0 + 500 },
      { method: 'PUT', url: 'http://localhost:3000/api/vendors/42', status: 500, duration: 312, timestamp: T0 + 3500, response: '{"error":"taxId is required"}' },
    ],
    navigations: [{ url: 'http://localhost:3000/vendors/42/edit', timestamp: T0 + 200 }],
  };
}

function fakeResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 'failed',
    retry: 0,
    startTime: new Date(T0),
    duration: 5000,
    errors: [
      {
        message: "expect(locator).toHaveText: Timed out waiting for 'Saved'",
        stack: 'at tests/vendor.spec.ts:48',
        snippet: '  47 |   await page.click("text=Save");\n> 48 |   await expect(toast).toHaveText("Saved");',
      },
    ],
    attachments: [
      { name: CAPTURE_ATTACHMENT, contentType: 'application/json', body: Buffer.from(JSON.stringify(fakeCapture())) },
      { name: 'screenshot', contentType: 'image/png', body: Buffer.from(TINY_PNG, 'base64') },
    ],
    steps: [
      { title: "page.goto('http://localhost:3000/vendors/42/edit')", category: 'pw:api', startTime: new Date(T0 + 100), duration: 400 },
      {
        title: 'save the vendor', category: 'test.step', startTime: new Date(T0 + 3000), duration: 2000,
        steps: [{ title: "page.click(\"text=Save\")", category: 'pw:api', startTime: new Date(T0 + 3100), duration: 100 }],
        error: { message: 'boom' },
      },
    ],
    ...overrides,
  };
}

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-pw-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TraceBugReporter', () => {
  it('writes a report for a failed test that the MCP server can read', async () => {
    const dir = path.join(tmpDir, 'run1');
    const reporter = new TraceBugReporter({ outputDir: dir });
    await reporter.onTestEnd(fakeTest() as never, fakeResult() as never);

    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^tracebug-test-vendor-can-be-saved-.*\.html$/);

    // The whole point: the artifact must be a first-class TraceBug export.
    const full = path.join(dir, files[0]);
    const payload = parseReportFile(full);
    expect(payload).not.toBeNull();
    expect(payload!.meta.title).toBe('Test failed: vendor can be saved');
    expect(payload!.meta.severity).toBe('high');
    expect(payload!.meta.page).toBe('http://localhost:3000/vendors/42/edit');
    expect(payload!.meta.environment).toContain('chromium');

    // Console: page capture merged with the runner assertion error.
    const messages = (payload!.consoleLogs ?? []).map((l) => l.message);
    expect(messages.some((m) => m.includes('TypeError'))).toBe(true);
    expect(messages.some((m) => m.includes('toHaveText'))).toBe(true);

    // Network: full list + failures split out with the response body.
    expect(payload!.networkRequests).toHaveLength(2);
    expect(payload!.networkErrors).toHaveLength(1);
    expect(payload!.networkErrors![0].response).toContain('taxId');

    // Steps → repro actions + timeline with the error flagged.
    expect(payload!.actions!.some((a) => a.includes('save the vendor'))).toBe(true);
    expect(payload!.events!.some((e) => e.isError)).toBe(true);

    // Screenshot embedded as a data URL.
    expect(payload!.screenshots).toHaveLength(1);
    expect(payload!.screenshots![0].dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    // Root cause: the 500 wins with high confidence.
    expect(payload!.rootCauseHint!.hint).toContain('500');
    expect(payload!.rootCauseHint!.confidence).toBe('high');

    // And the MCP tools accept it end-to-end.
    const listed = toolListBugReports(dir, {});
    expect(listed.count).toBe(1);
    const report = toolGetBugReport(dir, { file: 'vendor can be saved' }); // fuzzy title
    expect(report.investigationGuide[0]).toContain('get_network_activity');
  });

  it('writes nothing for passing, skipped, or non-final-retry results', async () => {
    const dir = path.join(tmpDir, 'run2');
    const reporter = new TraceBugReporter({ outputDir: dir });
    await reporter.onTestEnd(fakeTest() as never, fakeResult({ status: 'passed' }) as never);
    await reporter.onTestEnd(fakeTest() as never, fakeResult({ status: 'skipped' }) as never);
    // retry 0 of 2 → not the final attempt
    await reporter.onTestEnd(fakeTest({ retries: 2 }) as never, fakeResult({ retry: 0 }) as never);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('degrades gracefully without the capture fixture (reporter-only mode)', async () => {
    const dir = path.join(tmpDir, 'run3');
    const reporter = new TraceBugReporter({ outputDir: dir });
    const bare = fakeResult({ attachments: [] });
    await reporter.onTestEnd(fakeTest() as never, bare as never);

    const files = fs.readdirSync(dir);
    const payload = parseReportFile(path.join(dir, files[0]))!;
    expect(payload.networkRequests).toHaveLength(0);
    // Runner error still present, and root cause falls back to the assertion.
    expect(payload.consoleErrors!.length).toBeGreaterThan(0);
    expect(payload.rootCauseHint!.confidence).toBe('low');
    // Falls back to the test file when no navigation was captured.
    expect(payload.meta.page).toBe('tests/vendor.spec.ts');
  });
});

describe('traceBugPage fixture', () => {
  function fakePage() {
    const handlers: Record<string, (arg: unknown) => void> = {};
    return {
      on(event: string, handler: (arg: unknown) => void) { handlers[event] = handler; },
      emit(event: string, arg: unknown) { handlers[event]?.(arg); },
    };
  }

  it('captures console/network/navigations and attaches on failure', async () => {
    const page = fakePage();
    const attached: Array<{ name: string; body: string | Buffer }> = [];
    const testInfo = {
      status: 'failed',
      expectedStatus: 'passed',
      attach: async (name: string, opts: { body: string | Buffer; contentType: string }) => {
        attached.push({ name, body: opts.body });
      },
    };

    await traceBugPage({ page } as never, async () => {
      page.emit('console', { type: () => 'error', text: () => 'boom from page' });
      page.emit('pageerror', { message: 'Uncaught TypeError', stack: 'at app.js:1' });
      page.emit('framenavigated', { parentFrame: () => null, url: () => 'http://localhost:3000/x' });
      await page.emit('response', {
        status: () => 503,
        url: () => 'http://localhost:3000/api/x',
        text: async () => 'Service Unavailable',
        request: () => ({ method: () => 'GET', timing: () => ({ responseEnd: 45 }) }),
      });
    }, testInfo as never);

    expect(attached).toHaveLength(1);
    expect(attached[0].name).toBe(CAPTURE_ATTACHMENT);
    const data = JSON.parse(String(attached[0].body));
    expect(data.consoleLogs).toHaveLength(2);
    expect(data.requests[0].status).toBe(503);
    expect(data.requests[0].response).toContain('Service Unavailable');
    expect(data.navigations[0].url).toBe('http://localhost:3000/x');
  });

  it('attaches nothing when the test passes', async () => {
    const page = fakePage();
    const attached: string[] = [];
    const testInfo = {
      status: 'passed',
      expectedStatus: 'passed',
      attach: async (name: string) => { attached.push(name); },
    };
    await traceBugPage({ page } as never, async () => { /* test body */ }, testInfo as never);
    expect(attached).toHaveLength(0);
  });
});
