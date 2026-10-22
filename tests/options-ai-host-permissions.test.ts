// A custom Ollama/OpenAI-compatible base URL is the one place the settings
// page still asks for `<all_urls>` (docs/launch/store-submission-pack.md
// §7b, docs/chrome-extension.md): `chrome.permissions.request()` can only
// grant an origin that is a subset of something already declared, and an
// arbitrary remote host isn't a subset of any of the fixed provider origins
// or the two hardcoded localhost patterns.
//
// What these tests pin down: the exact pattern requested for a custom host
// (match patterns cannot carry a port — Chrome drops it on purpose, so the
// pattern is `<scheme>://<host>/*`, never `<scheme>://<host>:<port>/*`), that
// changing or clearing a custom host releases the ONE-OFF permission it was
// granted (never a fixed/localhost origin, even if the old and new values
// happen to share one), and that saving with no custom host — the common
// case — never asks for, or releases, anything beyond the protected set.
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const HTML = readFileSync(join(extDir, 'options.html'), 'utf8');
const JS = readFileSync(join(extDir, 'options.js'), 'utf8');

const AI_KEY = 'tb_ai_config_v1';

interface Loaded {
  window: any;
  calls: { request: string[][]; remove: string[][] };
  store: Record<string, unknown>;
}

/** Let queued microtasks and the mocked permission callbacks drain. */
function settle(ms = 20): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function load(initial?: { provider: string; apiKey?: string; baseUrl?: string }): Loaded {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/options.html' });
  const window = dom.window as any;

  const store: Record<string, unknown> = {};
  if (initial) store[AI_KEY] = initial;

  const calls = { request: [] as string[][], remove: [] as string[][] };
  const granted = new Set<string>();

  window.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (keys: string | string[], cb: (r: Record<string, unknown>) => void) => {
          const ks = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of ks) if (k in store) out[k] = store[k];
          cb(out);
        },
        set: (obj: Record<string, unknown>, cb?: () => void) => {
          Object.assign(store, obj);
          cb && cb();
        },
        remove: (key: string, cb?: () => void) => {
          delete store[key];
          cb && cb();
        },
      },
    },
    permissions: {
      request: (opts: { origins: string[] }, cb: (ok: boolean) => void) => {
        calls.request.push(opts.origins);
        opts.origins.forEach((o) => granted.add(o));
        cb(true);
      },
      remove: (opts: { origins: string[] }, cb: (ok: boolean) => void) => {
        calls.remove.push(opts.origins);
        opts.origins.forEach((o) => granted.delete(o));
        cb(true);
      },
      contains: (opts: { origins: string[] }, cb: (ok: boolean) => void) => {
        cb(opts.origins.every((o) => granted.has(o)));
      },
    },
  };
  // jsdom has no navigator.permissions; initMicrophoneCard()'s boot-time
  // refresh() would otherwise reject with an uncaught TypeError.
  window.navigator.permissions = { query: () => Promise.resolve({ state: 'prompt' }) };

  const ctx = createContext(window);
  runInContext(JS, ctx, { filename: 'options.js' });
  return { window, calls, store };
}

function clickSave(window: any, provider: string, baseUrl: string) {
  window.document.getElementById('aiProvider').value = provider;
  window.document.getElementById('aiBaseUrl').value = baseUrl;
  window.document.getElementById('aiSave').dispatchEvent(new window.Event('click'));
}

describe('a custom AI base URL and <all_urls>', () => {
  it('requests exactly <scheme>://<host>/*, dropping any port', async () => {
    const { window, calls } = load();
    clickSave(window, 'ollama', 'http://ai.example.com:8080/v1');
    await settle();
    expect(calls.request).toEqual([['http://ai.example.com/*']]);
    expect(calls.remove).toEqual([]);
  });

  it('changing the host releases the old origin and requests only the new one', async () => {
    const { window, calls, store } = load({ provider: 'ollama', baseUrl: 'http://old.example.com' });
    clickSave(window, 'ollama', 'http://new.example.com');
    await settle();
    expect(calls.remove).toEqual([['http://old.example.com/*']]);
    expect(calls.request).toEqual([['http://new.example.com/*']]);
    expect((store[AI_KEY] as { baseUrl?: string }).baseUrl).toBe('http://new.example.com');
  });

  it('clearing the base URL (back to the local default) releases the old custom origin', async () => {
    const { window, calls } = load({ provider: 'ollama', baseUrl: 'http://old.example.com' });
    clickSave(window, 'ollama', '');
    await settle();
    expect(calls.remove).toEqual([['http://old.example.com/*']]);
    // The default localhost patterns ARE requested (same as any Ollama save
    // with no custom host) — but never appear in a remove call, anywhere.
    expect(calls.request).toEqual([['http://localhost/*', 'http://127.0.0.1/*']]);
    expect(calls.remove.flat()).not.toContain('http://localhost/*');
    expect(calls.remove.flat()).not.toContain('http://127.0.0.1/*');
  });

  it('removing the AI key (Remove key) also releases a configured custom origin', async () => {
    const { window, calls, store } = load({ provider: 'ollama', baseUrl: 'http://old.example.com' });
    window.document.getElementById('aiClear').dispatchEvent(new window.Event('click'));
    await settle();
    expect(calls.remove).toEqual([['http://old.example.com/*']]);
    expect(store[AI_KEY]).toBeUndefined();
  });

  it('localhost requests nothing new: saving with no custom host never requests or removes a one-off origin', async () => {
    const { window, calls } = load({ provider: 'ollama', baseUrl: '' });
    clickSave(window, 'ollama', 'http://localhost:11434');
    await settle();
    // Same protected pattern before and after — nothing to release.
    expect(calls.remove).toEqual([]);
    expect(calls.request).toEqual([['http://localhost/*', 'http://127.0.0.1/*']]);
  });

  it('switching away from Ollama entirely releases its custom origin, never a fixed provider origin', async () => {
    const { window, calls } = load({ provider: 'ollama', baseUrl: 'http://old.example.com' });
    window.document.getElementById('aiKey').value = 'sk-test';
    clickSave(window, 'anthropic', '');
    await settle();
    expect(calls.remove).toEqual([['http://old.example.com/*']]);
    expect(calls.request).toEqual([['https://api.anthropic.com/*']]);
  });
});
