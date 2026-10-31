// The documented onReport / onExport plugin hooks (docs/api-reference.md,
// "Plugin System") used to be registered and then never called. These drive
// them through the real report and export paths, not the runners alone.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildReport } from '../src/report-builder';
import { exportSessionAsHar } from '../src/exporters/har-export';
import { registerPlugin, unregisterPlugin } from '../src/plugin-system';
import { clearNetworkFailures } from '../src/collectors';
import { clearScreenshots } from '../src/screenshot';
import { clearVoiceTranscripts } from '../src/voice-recorder';
import type { StoredSession, EnvironmentInfo } from '../src/types';

function baseEnv(): EnvironmentInfo {
  return {
    browser: 'Chrome', browserVersion: '121', os: 'macOS',
    viewport: '1920x1080', screenResolution: '2560x1440',
    language: 'en', timezone: 'UTC', userAgent: 'x',
    url: 'http://localhost/checkout', deviceType: 'desktop',
    connectionType: '4g', timestamp: Date.now(),
  };
}

function session(): StoredSession {
  return {
    sessionId: 's1', projectId: 'p', createdAt: Date.now(), updatedAt: Date.now(),
    errorMessage: null, errorStack: null, reproSteps: null, errorSummary: null,
    events: [], annotations: [], environment: baseEnv(),
  };
}

const registered: string[] = [];
function use(plugin: Parameters<typeof registerPlugin>[0]) {
  registerPlugin(plugin);
  registered.push(plugin.name);
}

beforeEach(() => {
  clearNetworkFailures();
  clearScreenshots();
  clearVoiceTranscripts();
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  // jsdom has no object URLs; the export only needs a string back.
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  while (registered.length) unregisterPlugin(registered.pop()!);
  vi.restoreAllMocks();
});

describe('onReport', () => {
  it('enriches every report buildReport() returns (the documented example)', () => {
    const plain = buildReport(session()).title;
    use({ name: 'prefix', onReport: (r) => { r.title = `[MyApp] ${r.title}`; return r; } });
    expect(buildReport(session()).title).toBe(`[MyApp] ${plain}`);
  });

  it('chains plugins in registration order', () => {
    use({ name: 'a', onReport: (r) => ({ ...r, title: r.title + ' A' }) });
    use({ name: 'b', onReport: (r) => ({ ...r, title: r.title + ' B' }) });
    expect(buildReport(session()).title).toMatch(/ A B$/);
  });

  it('skips a plugin that throws or returns nothing, keeping the others', () => {
    use({ name: 'boom', onReport: () => { throw new Error('bad plugin'); } });
    use({ name: 'empty', onReport: () => undefined as never });
    use({ name: 'ok', onReport: (r) => ({ ...r, title: 'kept' }) });
    expect(buildReport(session()).title).toBe('kept');
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});

describe('onExport', () => {
  it('transforms a real export (HAR) and receives its format name', async () => {
    const seen: string[] = [];
    use({
      name: 'tag',
      onExport: (format, data) => { seen.push(format); return data.replace('{', '{"_tagged":true,'); },
    });
    const { blob } = exportSessionAsHar(buildReport(session()));
    const har = JSON.parse(await blob.text());
    expect(seen).toEqual(['har']);
    expect(har._tagged).toBe(true);
    expect(har.log).toBeDefined();
  });

  it('ships the export unchanged by a plugin that throws or returns a non-string', async () => {
    const report = buildReport(session());
    const baseline = await exportSessionAsHar(report).blob.text();
    use({ name: 'boom', onExport: () => { throw new Error('bad plugin'); } });
    use({ name: 'num', onExport: () => 42 as never });
    expect(await exportSessionAsHar(report).blob.text()).toBe(baseline);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });
});
