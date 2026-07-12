import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildReplayHtml, type BundlePayload } from '../src/exporters/html-template';
import {
  parseReportFile,
  scanReportFiles,
  toolListBugReports,
  toolGetBugReport,
  toolGetConsoleErrors,
  toolGetNetworkActivity,
  toolGetReproSteps,
  toolGetScreenshot,
  callTool,
  handleMessage,
  TOOL_DEFINITIONS,
  PROMPT_DEFINITIONS,
  buildInvestigationGuide,
  buildDebugPrompt,
  knownReportDirs,
} from '../cli/mcp-server';

// 1×1 transparent PNG
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function fixturePayload(): BundlePayload {
  return {
    meta: {
      title: 'Vendor Update Fails — TypeError',
      severity: 'critical',
      priority: 'High',
      summary: 'Clicking Save on the vendor form throws a TypeError after a 500 from /api/vendors.',
      rootCause: 'PUT /api/vendors returned 500 right before the error',
      page: '/vendors/42',
      generatedAt: 1751790000000,
      sessionId: 'sess_test_1',
      environment: 'Chrome 126 · Windows 11 · 1920×1080',
      durationMs: 42000,
    },
    description: 'Repro: edit any vendor and hit Save.',
    events: [
      { timestamp: 1751789990000, type: 'click', description: "Clicked 'Save' button", elapsed: '0:32', isError: false },
      { timestamp: 1751789991000, type: 'error', description: 'TypeError: cannot read undefined', elapsed: '0:33', isError: true },
    ],
    screenshots: [
      { timestamp: 1751789990500, dataUrl: `data:image/png;base64,${TINY_PNG}`, filename: '01_click_save.png' },
    ],
    consoleErrors: [
      { message: 'TypeError: cannot read undefined', stack: 'at save (vendor.ts:88)', timestamp: 1751789991000 },
    ],
    consoleLogs: [
      { level: 'warn', message: 'deprecated prop', timestamp: 1751789980000 },
      { level: 'error', message: 'TypeError: cannot read undefined', stack: 'at save (vendor.ts:88)', timestamp: 1751789991000 },
    ],
    networkErrors: [
      { method: 'PUT', url: '/api/vendors/42', status: 500, duration: 312, timestamp: 1751789990800, response: '{"error":"boom"}' },
    ],
    networkRequests: [
      { method: 'GET', url: '/api/vendors/42', status: 200, duration: 120, timestamp: 1751789960000 },
      { method: 'PUT', url: '/api/vendors/42', status: 500, duration: 312, timestamp: 1751789990800, response: '{"error":"boom"}' },
    ],
    actions: ['1. Open /vendors/42', "2. Click 'Save'"],
    actionChips: [
      { verb: 'Clicked', kind: 'click', nounLabel: "'Save' button", timestamp: 1751789990000, isError: true, frustration: 'rage' },
    ],
    annotations: [{ severity: 'high', text: 'Blocks vendor onboarding' }],
    rootCauseHint: { hint: 'PUT /api/vendors/42 returned 500 right before the TypeError', confidence: 'HIGH' },
  };
}

let tmpDir: string;
let reportPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-mcp-'));
  reportPath = path.join(tmpDir, 'bug-report.html');
  fs.writeFileSync(reportPath, buildReplayHtml(fixturePayload()), 'utf8');
  // Decoys the scanner must ignore
  fs.writeFileSync(path.join(tmpDir, 'not-a-report.html'), '<html><body>hello</body></html>', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'random.json'), '{"foo": 1}', 'utf8');
  fs.mkdirSync(path.join(tmpDir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'node_modules', 'x', 'trap.html'), buildReplayHtml(fixturePayload()), 'utf8');
  fs.mkdirSync(path.join(tmpDir, 'nested'));
  fs.writeFileSync(path.join(tmpDir, 'nested', 'second-report.html'), buildReplayHtml(fixturePayload()), 'utf8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseReportFile', () => {
  it('round-trips a real buildReplayHtml export', () => {
    const p = parseReportFile(reportPath);
    expect(p).not.toBeNull();
    expect(p!.meta.title).toBe('Vendor Update Fails — TypeError');
    expect(p!.meta.sessionId).toBe('sess_test_1');
    expect(p!.consoleLogs).toHaveLength(2);
  });

  it('survives </script> content inside the payload (escape round-trip)', () => {
    const payload = fixturePayload();
    payload.consoleErrors![0].message = 'injected </script><script>alert(1)</script> text';
    const file = path.join(tmpDir, 'escaped.html');
    fs.writeFileSync(file, buildReplayHtml(payload), 'utf8');
    const parsed = parseReportFile(file);
    expect(parsed).not.toBeNull();
    expect(parsed!.consoleErrors![0].message).toContain('</script>');
    fs.rmSync(file);
  });

  it('returns null for non-TraceBug files and missing files', () => {
    expect(parseReportFile(path.join(tmpDir, 'not-a-report.html'))).toBeNull();
    expect(parseReportFile(path.join(tmpDir, 'random.json'))).toBeNull();
    expect(parseReportFile(path.join(tmpDir, 'does-not-exist.html'))).toBeNull();
  });
});

describe('auto-discovery outside --dir', () => {
  it('resolves a report in ~/Downloads by bare filename even when baseDir has none', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-home-'));
    const downloads = path.join(fakeHome, 'Downloads');
    fs.mkdirSync(downloads);
    // Export naming (tracebug-*) matters: shared folders are name-prefiltered.
    fs.writeFileSync(path.join(downloads, 'tracebug-replay-zzz.html'), buildReplayHtml(fixturePayload()), 'utf8');
    const emptyBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-empty-'));
    // os.homedir() reads USERPROFILE (Windows) / HOME (POSIX); can't spy in ESM.
    const orig = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    try {
      if (os.homedir() !== fakeHome) return; // platform ignores the env override — skip
      // baseDir has no reports — requireReport falls back to ~/Downloads.
      expect(toolGetBugReport(emptyBase, { file: 'tracebug-replay-zzz.html' }).title)
        .toBe('Vendor Update Fails — TypeError');
      // …and by a bare fragment of the filename.
      expect(toolGetBugReport(emptyBase, { file: 'zzz' }).title)
        .toBe('Vendor Update Fails — TypeError');
      expect(knownReportDirs(emptyBase)).toContain(downloads);
    } finally {
      for (const k of ['HOME', 'USERPROFILE'] as const) {
        if (orig[k] === undefined) delete process.env[k]; else process.env[k] = orig[k];
      }
      fs.rmSync(fakeHome, { recursive: true, force: true });
      fs.rmSync(emptyBase, { recursive: true, force: true });
    }
  });
});

describe('scanReportFiles', () => {
  it('finds reports recursively but skips node_modules and decoys', () => {
    const files = scanReportFiles(tmpDir);
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('bug-report.html'))).toBe(true);
    expect(files.some((f) => f.includes('nested'))).toBe(true);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });
});

describe('tool handlers', () => {
  it('list_bug_reports summarizes with counts', () => {
    const r = toolListBugReports(tmpDir, {});
    expect(r.count).toBe(2);
    const report = r.reports.find((x) => x.file === 'bug-report.html')!;
    expect(report.title).toContain('Vendor Update Fails');
    expect(report.severity).toBe('critical');
    expect(report.counts).toEqual({
      consoleErrors: 1,
      networkFailures: 1,
      userActions: 1,
      screenshots: 1,
      hasVideo: false,
    });
  });

  it('get_bug_report returns overview without base64 blobs', () => {
    const r = toolGetBugReport(tmpDir, { file: 'bug-report.html' });
    expect(r.title).toContain('Vendor Update Fails');
    expect(r.rootCause).toEqual({ hint: expect.stringContaining('500'), confidence: 'HIGH' });
    expect(r.annotations).toHaveLength(1);
    expect(JSON.stringify(r)).not.toContain(TINY_PNG);
  });

  it('get_bug_report includes a prioritized investigation guide', () => {
    const r = toolGetBugReport(tmpDir, { file: 'bug-report.html' });
    const guide = r.investigationGuide;
    expect(guide.length).toBeGreaterThanOrEqual(4);
    // Root-cause hint blames a request → network leads, console second.
    expect(guide[0]).toContain('[HIGH] get_network_activity');
    expect(guide[0]).toContain('1 failed request');
    expect(guide[1]).toContain('[HIGH] get_console_errors');
    // Rage click in the fixture → repro steps flagged HIGH with signal count.
    expect(guide.find((s) => s.includes('get_repro_steps'))).toContain('[HIGH]');
    expect(guide.find((s) => s.includes('get_screenshot'))).toContain('1 screenshot');
    expect(guide[guide.length - 1]).toContain('cross-reference');
  });

  it('investigation guide adapts to what the report contains', () => {
    const quiet = fixturePayload();
    quiet.consoleErrors = [];
    quiet.consoleLogs = [];
    quiet.networkErrors = [];
    quiet.rootCauseHint = undefined;
    quiet.actionChips = [{ verb: 'Clicked', kind: 'click', timestamp: 1751789990000 }];
    const guide = buildInvestigationGuide(quiet as any);
    expect(guide.join('\n')).not.toContain('get_console_errors');
    expect(guide.join('\n')).not.toContain('get_network_activity');
    // No errors captured → visuals are promoted to a primary source.
    expect(guide.find((s) => s.includes('get_screenshot'))).toContain('[HIGH]');
    expect(guide.find((s) => s.includes('get_repro_steps'))).toContain('[MEDIUM]');
  });

  it('resolves reports by nested filename and by title fragment', () => {
    // Bare filename of a report one level deep — previously needed 'nested/'.
    const byName = toolGetBugReport(tmpDir, { file: 'second-report.html' });
    expect(byName.title).toContain('Vendor Update Fails');
    // Case-insensitive title fragment.
    const byTitle = toolGetBugReport(tmpDir, { file: 'vendor update' });
    expect(byTitle.title).toContain('Vendor Update Fails');
  });

  it('unresolvable file errors list the available reports', () => {
    const r = callTool(tmpDir, 'get_bug_report', { file: 'zzz-no-such-thing' });
    expect(r.isError).toBe(true);
    expect(r.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('bug-report.html') });
  });

  it('get_console_errors prefers full consoleLogs', () => {
    const r = toolGetConsoleErrors(tmpDir, { file: 'bug-report.html' });
    expect(r.count).toBe(2);
    expect(r.entries[0].level).toBe('warn');
    expect(r.entries[1].stack).toContain('vendor.ts:88');
  });

  it('get_network_activity defaults to failures, expands on request', () => {
    const failures = toolGetNetworkActivity(tmpDir, { file: 'bug-report.html' });
    expect(failures.requests).toHaveLength(1);
    expect(failures.requests[0].status).toBe(500);
    expect(failures.requests[0].responseSnippet).toContain('boom');

    const all = toolGetNetworkActivity(tmpDir, { file: 'bug-report.html', failuresOnly: false });
    expect(all.requests).toHaveLength(2);
  });

  it('get_repro_steps includes frustration signals and timeline', () => {
    const r = toolGetReproSteps(tmpDir, { file: 'bug-report.html' });
    expect(r.steps).toHaveLength(2);
    expect(r.actions[0].frustrationSignal).toBe('rage');
    expect(r.actions[0].causedError).toBe(true);
    expect(r.timeline.some((t) => t.isError)).toBe(true);
  });

  it('get_screenshot returns decodable image data and bounds-checks index', () => {
    const r = toolGetScreenshot(tmpDir, { file: 'bug-report.html' });
    expect(r.image.mimeType).toBe('image/png');
    expect(r.image.base64).toBe(TINY_PNG);
    expect(r.filename).toBe('01_click_save.png');
    expect(() => toolGetScreenshot(tmpDir, { file: 'bug-report.html', index: 5 })).toThrow(/out of range/);
  });

  it('callTool wraps errors instead of throwing', () => {
    const r = callTool(tmpDir, 'get_bug_report', { file: 'does-not-exist.html' });
    expect(r.isError).toBe(true);
    const r2 = callTool(tmpDir, 'nope', {});
    expect(r2.isError).toBe(true);
  });
});

describe('MCP protocol (handleMessage)', () => {
  it('answers initialize with capabilities and echoes protocol version', () => {
    const res = handleMessage(tmpDir, {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26' },
    }) as Record<string, any>;
    expect(res.result.protocolVersion).toBe('2025-03-26');
    expect(res.result.capabilities.tools).toEqual({});
    expect(res.result.serverInfo.name).toBe('tracebug');
  });

  it('lists all six tools with schemas', () => {
    const res = handleMessage(tmpDir, { jsonrpc: '2.0', id: 2, method: 'tools/list' }) as Record<string, any>;
    expect(res.result.tools).toHaveLength(6);
    expect(TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      'list_bug_reports', 'get_bug_report', 'get_console_errors',
      'get_network_activity', 'get_repro_steps', 'get_screenshot',
    ]);
    for (const t of res.result.tools) expect(t.inputSchema.type).toBe('object');
  });

  it('executes tools/call end-to-end', () => {
    const res = handleMessage(tmpDir, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'list_bug_reports', arguments: {} },
    }) as Record<string, any>;
    const body = JSON.parse(res.result.content[0].text);
    expect(body.count).toBe(2);
  });

  it('ignores notifications and rejects unknown methods', () => {
    expect(handleMessage(tmpDir, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    const err = handleMessage(tmpDir, { jsonrpc: '2.0', id: 4, method: 'bogus/method' }) as Record<string, any>;
    expect(err.error.code).toBe(-32601);
  });

  it('responds to ping', () => {
    const res = handleMessage(tmpDir, { jsonrpc: '2.0', id: 5, method: 'ping' }) as Record<string, any>;
    expect(res.result).toEqual({});
  });

  it('advertises and serves the debug_bug_report prompt', () => {
    const init = handleMessage(tmpDir, { jsonrpc: '2.0', id: 6, method: 'initialize', params: {} }) as Record<string, any>;
    expect(init.result.capabilities.prompts).toEqual({});

    const list = handleMessage(tmpDir, { jsonrpc: '2.0', id: 7, method: 'prompts/list' }) as Record<string, any>;
    expect(list.result.prompts).toEqual(PROMPT_DEFINITIONS);
    expect(list.result.prompts[0].name).toBe('debug_bug_report');

    const get = handleMessage(tmpDir, {
      jsonrpc: '2.0', id: 8, method: 'prompts/get',
      params: { name: 'debug_bug_report', arguments: { file: 'bug-report.html' } },
    }) as Record<string, any>;
    const text = get.result.messages[0].content.text;
    expect(text).toContain('get_bug_report("bug-report.html")');
    expect(text).toContain('investigation guide');
    expect(text).toContain('root cause');

    const unknown = handleMessage(tmpDir, {
      jsonrpc: '2.0', id: 9, method: 'prompts/get', params: { name: 'nope' },
    }) as Record<string, any>;
    expect(unknown.error.code).toBe(-32602);
  });

  it('debug prompt falls back to list_bug_reports when no file is given', () => {
    expect(buildDebugPrompt()).toContain('list_bug_reports');
    expect(buildDebugPrompt('  ')).toContain('list_bug_reports');
  });
});
