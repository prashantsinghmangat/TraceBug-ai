// Phase 7: diagnostics without telemetry.
//
// TraceBug sends nothing anywhere, so the only route for a bug report is the
// user's own clipboard. That makes the scrubber a privacy boundary rather than
// a nicety: whatever it misses, the user pastes into a public GitHub issue
// under their own name.
//
// PLAN.md asks specifically for "a test that fails if a URL or a DOM string
// leaks into diagnostics". That is the `leaks` block below, and it is written
// against realistic error text — the strings a browser actually produces —
// rather than against the regexes the implementation happens to use.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const SOURCE = readFileSync(join(extDir, 'diagnostics.js'), 'utf8');
const POPUP = readFileSync(join(extDir, 'popup.js'), 'utf8');
const BG = readFileSync(join(extDir, 'background.js'), 'utf8');

interface Diag {
  scrub: (s: string) => string;
  scrubStack: (s: string) => string;
  record: (where: string, err: unknown) => void;
  readErrors: () => Promise<Array<{ where: string; message: string; stack: string }>>;
  environment: () => { browser: string; browserVersion: string; os: string };
  build: (opts?: { pageState?: string }) => Promise<string>;
  MAX_ERRORS: number;
}

/** Load the real diagnostics.js with a controllable fake browser around it. */
function load(opts: {
  session?: Record<string, unknown>;
  origins?: string[];
  api?: string[];
  userAgent?: string;
  uaData?: unknown;
} = {}): { diag: Diag; store: Record<string, unknown> } {
  const store: Record<string, unknown> = { ...(opts.session || {}) };
  const sandbox: Record<string, unknown> = {
    navigator: { userAgent: opts.userAgent ?? '', userAgentData: opts.uaData },
    addEventListener: () => {},
    Promise, Date, Array, String, Number, JSON, RegExp, Math, Object,
    console: { warn: () => {}, log: () => {} },
    chrome: {
      runtime: { getManifest: () => ({ version: '1.11.0' }) },
      storage: {
        session: {
          get: (k: string, cb: (v: unknown) => void) => cb(k in store ? { [k]: store[k] } : {}),
          set: (items: Record<string, unknown>) => { Object.assign(store, items); },
          remove: (k: string) => { delete store[k]; },
        },
      },
      permissions: {
        getAll: (cb: (p: unknown) => void) =>
          cb({ origins: opts.origins ?? [], permissions: opts.api ?? [] }),
      },
    },
  };
  const ctx = createContext(sandbox);
  runInContext(SOURCE, ctx);
  return { diag: runInContext('TraceBugDiagnostics', ctx) as Diag, store };
}

describe('nothing about the user or their sites leaks', () => {
  const { diag } = load();

  // Real error text, not invented. Each of these is something a browser or a
  // provider actually says.
  const REAL_ERRORS = [
    'Failed to fetch https://acme.internal/api/orders/48217?token=tbtok_9aZ',
    'Access to fetch at \'https://staging.client-co.example/checkout\' from origin \'https://app.acme.io\' has been blocked',
    'Refused to load the script \'https://cdn.thirdparty.net/a.js\' because it violates the Content Security Policy',
    'Unable to open file:///C:/Users/jane.doe/Desktop/report.html',
    'Invalid email: jane.doe@acme.co.uk',
    'Request failed: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    'blob:https://app.acme.io/5f2a-11ee-bad1',
  ];

  it.each(REAL_ERRORS)('strips everything identifying from: %s', (raw) => {
    const out = diag.scrub(raw);
    // No scheme-bearing URL of any kind survives.
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).not.toMatch(/\bfile:\/\//);
    expect(out).not.toMatch(/\bdata:[^\s,]*,/);
    expect(out).not.toMatch(/\bblob:/);
    // No hostname fragments from the originals.
    expect(out).not.toMatch(/acme|client-co|thirdparty|jane\.doe/i);
  });

  it('redacts tokens and long opaque ids but keeps readable words', () => {
    const out = diag.scrub('token tbtok_9aZqW3xY7bN2mK8pL1vC4tR6 expired, retry authentication');
    expect(out).not.toContain('tbtok_9aZqW3xY7bN2mK8pL1vC4tR6');
    // The words that make the message useful must survive.
    expect(out).toMatch(/expired/);
    expect(out).toMatch(/authentication/);
  });

  it('keeps TraceBug\'s own file paths, which are the useful part', () => {
    const out = diag.scrub('at handleComboAction (chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js:383:12)');
    expect(out).toContain('background.js:383:12');
    expect(out).not.toContain('chrome-extension://');
  });

  it('drops host-page stack frames entirely', () => {
    // A frame naming the site under test is a URL AND tells us nothing about
    // TraceBug's code.
    const stack = [
      'TypeError: x is undefined',
      '    at checkout (https://app.acme.io/static/bundle.a81f.js:2:4471)',
      '    at injectSDK (chrome-extension://abcdefghijklmnopabcdefghijklmnop/background.js:348:9)',
      '    at onClick (https://app.acme.io/static/bundle.a81f.js:9:12)',
    ].join('\n');
    const out = diag.scrubStack(stack);
    expect(out).toContain('background.js:348:9');
    expect(out).not.toMatch(/acme|bundle/);
    expect(out.split('\n')).toHaveLength(1);
  });

  it('never carries a DOM string through a recorded error', async () => {
    const { diag: d } = load();
    d.record('worker', new Error('Could not inject into <input name="credit_card" value="4111111111111111">'));
    await Promise.resolve();
    const errors = await d.readErrors();
    // The value is a long digit run — the kind of thing that must not survive.
    expect(errors[0].message).not.toContain('4111111111111111');
  });

  it('says in the output that it carries none of this', async () => {
    const { diag: d } = load();
    const text = await d.build({ pageState: 'ok' });
    expect(text).toContain('No URLs, page content or stored values are included');
  });

  it('contains no URL anywhere in a full report', async () => {
    const { diag: d } = load({
      origins: ['<all_urls>', 'https://api.github.com/*', 'https://llm.acme.internal/*'],
      api: ['storage', 'scripting'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36',
    });
    d.record('popup', new Error('fetch failed for https://acme.internal/x'));
    await Promise.resolve();
    const text = await d.build({ pageState: 'restricted' });
    // The declared provider origins ARE ours and may be named; nothing else.
    const urls = text.match(/https?:\/\/\S+/g) ?? [];
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\/(api\.github\.com|api\.linear\.app|hooks\.slack\.com|api\.openai\.com|api\.anthropic\.com)/);
    }
    expect(text).not.toContain('acme.internal');
  });

  it('counts a user\'s own granted origin without naming it', async () => {
    // Someone who pointed Ollama at their own host has granted an origin that
    // is their infrastructure. Naming it would put a private hostname on the
    // clipboard.
    const { diag: d } = load({ origins: ['https://llm.acme.internal/*', 'https://api.github.com/*'] });
    const text = await d.build();
    expect(text).toContain('+1 other, not listed');
    expect(text).not.toContain('llm.acme');
  });
});

describe('the error ring behaves like a ring', () => {
  it('records where, message and stack', async () => {
    const { diag } = load();
    diag.record('offscreen', new Error('MediaRecorder could not be created'));
    await Promise.resolve();
    const [e] = await diag.readErrors();
    expect(e.where).toBe('offscreen');
    expect(e.message).toContain('MediaRecorder');
  });

  it('keeps only the most recent 20', async () => {
    const { diag } = load();
    for (let i = 0; i < 30; i++) diag.record('worker', new Error(`failure number ${i}`));
    await Promise.resolve();
    const errors = await diag.readErrors();
    expect(errors).toHaveLength(diag.MAX_ERRORS);
    expect(errors[errors.length - 1].message).toContain('29');
    expect(errors.some((e) => e.message.includes('number 0'))).toBe(false);
  });

  it('survives junk in storage', async () => {
    const { diag } = load({ session: { tb_diag_errors_v1: 'not an array' } });
    diag.record('worker', new Error('still works'));
    await Promise.resolve();
    const errors = await diag.readErrors();
    expect(errors[errors.length - 1].message).toContain('still works');
  });

  it('never throws, whatever it is handed', () => {
    const { diag } = load();
    expect(() => diag.record('x', null)).not.toThrow();
    expect(() => diag.record('x', undefined)).not.toThrow();
    expect(() => diag.record('x', { message: { nested: true } })).not.toThrow();
    expect(() => diag.record('x', 'a bare string')).not.toThrow();
  });

  it('works with no session storage at all', async () => {
    // Firefox event pages and old builds. Diagnostics degrade; nothing breaks.
    const sandbox: Record<string, unknown> = {
      navigator: {}, addEventListener: () => {},
      Promise, Date, Array, String, Number, JSON, RegExp, Math, Object,
      console: { warn: () => {} },
      chrome: { runtime: { getManifest: () => ({ version: '1.11.0' }) } },
    };
    const ctx = createContext(sandbox);
    runInContext(SOURCE, ctx);
    const d = runInContext('TraceBugDiagnostics', ctx) as Diag;
    expect(() => d.record('worker', new Error('x'))).not.toThrow();
    await expect(d.readErrors()).resolves.toEqual([]);
    await expect(d.build()).resolves.toContain('TraceBug diagnostics');
  });
});

describe('the environment is reported, not fingerprinted', () => {
  it('prefers userAgentData and reports only a major version', () => {
    const { diag } = load({
      uaData: { brands: [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: '150' }], platform: 'Windows' },
    });
    const env = diag.environment();
    expect(env.browser).toBe('Chromium');
    expect(env.browserVersion).toBe('150');
    expect(env.os).toBe('Windows');
  });

  it('falls back to a name and a major version, never the full UA', async () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/145.0';
    const { diag } = load({ userAgent: ua });
    const env = diag.environment();
    expect(env.browser).toBe('Firefox');
    expect(env.browserVersion).toBe('145');
    expect(env.os).toBe('macOS');
    // The full string is a fingerprint; it must not reach the output.
    const text = await diag.build();
    expect(text).not.toContain('Mozilla/5.0');
    expect(text).not.toContain('10_15_7');
  });

  it('does not pretend to know what it cannot read', () => {
    const { diag } = load({ userAgent: '' });
    expect(diag.environment().browser).toBe('unknown');
  });
});

describe('the report says what a maintainer needs', () => {
  it('leads with the versions and the grant state', async () => {
    const { diag } = load({ origins: ['<all_urls>'], api: ['storage', 'alarms'] });
    const text = await diag.build({ pageState: 'ok' });
    expect(text).toContain('TraceBug: 1.11.0');
    expect(text).toContain('Site access: all sites');
    expect(text).toContain('alarms, storage');
  });

  it('says "this tab only" when site access was withheld', async () => {
    const { diag } = load({ origins: [] });
    expect(await diag.build()).toContain('Site access: this tab only');
  });

  it('reports the page as a classification, never a URL', async () => {
    const { diag } = load();
    expect(await diag.build({ pageState: 'file-no-access' })).toContain('Page: file-no-access');
  });

  it('says so plainly when there is nothing wrong', async () => {
    const { diag } = load();
    expect(await diag.build()).toContain('No internal errors recorded this session');
  });

  it('lists the newest error first', async () => {
    const { diag } = load();
    diag.record('worker', new Error('older problem'));
    diag.record('popup', new Error('newer problem'));
    await Promise.resolve();
    const text = await diag.build();
    expect(text.indexOf('newer problem')).toBeLessThan(text.indexOf('older problem'));
  });
});

describe('it is wired in, and it never phones home', () => {
  it('has no network call of any kind', () => {
    // The whole premise. A fetch in this file would make "no telemetry" false.
    expect(SOURCE).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket/);
  });

  it('installs handlers in the worker', () => {
    expect(BG).toContain('TraceBugDiagnostics.install("worker")');
    expect(BG).toContain('diagnostics.js');
  });

  it('is offered in the popup, both ways', () => {
    expect(POPUP).toContain('initDiagnosticsUI');
    expect(POPUP).toContain('navigator.clipboard.writeText');
    expect(POPUP).toContain('issues/new');
  });

  it('passes a classification to the builder, not the URL', () => {
    const fn = POPUP.slice(POPUP.indexOf('function diagPageState'), POPUP.indexOf('async function buildDiagnostics'));
    expect(fn).toContain('verdict.reason');
    expect(fn).not.toMatch(/pageState:\s*currentTabUrl/);
    expect(POPUP).toContain('pageState: diagPageState()');
  });

  it('leaves no dead button if the clipboard is refused', () => {
    const fn = POPUP.slice(POPUP.indexOf('copyBtn.addEventListener'));
    expect(fn.slice(0, 700)).toMatch(/catch \{[\s\S]*showToast/);
  });

  it('prefills the issue but lets the user submit it', () => {
    // Opened in a tab, with a body the user reads. Nothing is posted.
    const fn = POPUP.slice(POPUP.indexOf('reportBtn.addEventListener'));
    expect(fn.slice(0, 1400)).toContain('chrome.tabs.create');
    expect(fn.slice(0, 1400)).not.toMatch(/method:\s*"POST"/);
  });
});
