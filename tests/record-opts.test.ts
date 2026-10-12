// Phase 4: who owns "record video?", and what happens to the answer across an
// update.
//
// The pref used to live in the popup's own localStorage, which a service
// worker can neither read nor write. That left one question unanswerable:
// has this user chosen whether to record video, or have they simply never
// been asked? The popup saw a missing field, and a missing field is not a
// choice — so Phase 4 flipped a 1.10 user's always-video habit to no-video
// silently, with nothing recording that it had happened.
//
// Now the blob lives in chrome.storage.local under `tb_record_opts` with an
// explicit `videoSetBy` discriminator, the worker seeds the default on
// install AND update, and the popup migrates the legacy localStorage copy on
// first open. The failure mode this file guards is the ordering: onInstalled
// runs before the popup is ever opened, so the seed is ALWAYS already present
// by migration time, and a naive "only migrate when the key is absent" rule
// would throw away the choice of a user who had turned video on.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createChromeMock, loadBackground, settle, type ChromeMock } from './helpers/chrome-mock';

const KEY = 'tb_record_opts';
const LEGACY_KEY = 'tracebug_record_opts';
const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');

/** Fire runtime.onInstalled the way Chrome does, and let the seed settle. */
async function install(mock: ChromeMock, reason: string) {
  mock.events.onInstalled.emit({ reason });
  await settle();
  return mock.localStore[KEY] as Record<string, unknown> | undefined;
}

describe('the worker seeds the no-video default', () => {
  let mock: ChromeMock;
  beforeEach(() => {
    mock = createChromeMock();
    loadBackground(mock);
  });

  it('writes video off on a fresh install', async () => {
    expect(await install(mock, 'install')).toMatchObject({ video: false, videoSetBy: 'default' });
  });

  it('writes video off on an update from a build that had no such option', async () => {
    // The whole reason the update branch exists. A 1.10 user recorded video
    // every time because there was no way not to; they have no stored choice,
    // so they get the new default — deliberately, and recorded as such.
    expect(await install(mock, 'update')).toMatchObject({ video: false, videoSetBy: 'default' });
  });

  it('does NOT overwrite a user who turned video on', async () => {
    mock.localStore[KEY] = { video: true, videoSetBy: 'user', surfaceMode: 'desktop' };
    expect(await install(mock, 'update')).toMatchObject({ video: true, videoSetBy: 'user' });
  });

  it('keeps the other options when it seeds over its own earlier default', async () => {
    // A re-seed must not reset the surface or the delay — they are not the
    // thing being defaulted.
    mock.localStore[KEY] = { video: false, videoSetBy: 'default', surfaceMode: 'desktop', delaySec: 3 };
    expect(await install(mock, 'update')).toMatchObject({ surfaceMode: 'desktop', delaySec: 3 });
  });

  it('leaves the pref alone on a plain reload', async () => {
    // chrome_update / browser_update fire onInstalled too, and neither is a
    // moment to touch the user's settings.
    await install(mock, 'chrome_update');
    expect(mock.localStore[KEY]).toBeUndefined();
  });

  it('still opens the welcome page on install, and only on install', async () => {
    await install(mock, 'install');
    expect(mock.createdTabs).toHaveLength(1);
    await install(mock, 'update');
    expect(mock.createdTabs).toHaveLength(1);
  });
});

// ── The popup's migration ───────────────────────────────────────────────────
// popup.js is one DOMContentLoaded closure over the whole popup DOM, so it
// cannot be evaluated here the way offscreen.js can (tests/capture-errors).
// Instead this slices the REAL `loadRecordOpts` out of the shipped file and
// runs that text. The precedence rules are what's under test, and a rename or
// a move fails the slice loudly rather than passing against a stale copy.
function extractLoadRecordOpts(source: string): string {
  const start = source.indexOf('  async function loadRecordOpts() {');
  if (start < 0) throw new Error('loadRecordOpts not found in popup.js — did it move or get renamed?');
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error('could not find the end of loadRecordOpts in popup.js');
  return source.slice(start, end + 4);
}

describe('popup.js migrates the legacy localStorage blob', () => {
  const SOURCE = readFileSync(join(extDir, 'popup.js'), 'utf8');
  const BODY = extractLoadRecordOpts(SOURCE);

  /** Run the real function against a given storage + localStorage state. */
  async function migrate(
    stored: Record<string, unknown> | undefined,
    legacy: Record<string, unknown> | null,
  ) {
    const store: Record<string, unknown> = {};
    if (stored) store[KEY] = stored;
    const local = new Map<string, string>();
    if (legacy) local.set(LEGACY_KEY, JSON.stringify(legacy));
    const sandbox = {
      // The two key constants are declared above the function in popup.js, so
      // the slice does not carry them. Asserted against the real source in
      // "uses the key names this file tests" below, so they cannot drift.
      OPTS_KEY: KEY,
      LEGACY_OPTS_KEY: LEGACY_KEY,
      chrome: {
        storage: {
          local: {
            get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
            set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
          },
        },
      },
      localStorage: {
        getItem: (k: string) => local.get(k) ?? null,
        removeItem: (k: string) => { local.delete(k); },
      },
      JSON,
      result: undefined as unknown,
    };
    const ctx = createContext(sandbox);
    runInContext(BODY.trim() + '\nresult = loadRecordOpts();', ctx);
    const opts = await (sandbox.result as Promise<Record<string, unknown>>);
    return { opts, store, legacyLeft: local.has(LEGACY_KEY) };
  }

  it('is actually there', () => {
    expect(BODY).toContain('chrome.storage.local.get(OPTS_KEY)');
    expect(BODY).toContain('localStorage.getItem(LEGACY_OPTS_KEY)');
  });

  it('uses the key names this file tests', () => {
    // The slice runs with OPTS_KEY / LEGACY_OPTS_KEY injected, so the real
    // literals have to be pinned here or a renamed key would pass silently.
    expect(SOURCE).toContain('const OPTS_KEY = "' + KEY + '"');
    expect(SOURCE).toContain('const LEGACY_OPTS_KEY = "' + LEGACY_KEY + '"');
  });

  it('keeps an explicit "video on" from the legacy blob, past the seed', async () => {
    // The ordering bug this file exists for: the worker's seed is already in
    // place, and it must not win over an answer the user actually gave.
    const { opts } = await migrate(
      { video: false, videoSetBy: 'default' },
      { video: true, surfaceMode: 'desktop', delaySec: 2, blurFirst: true },
    );
    expect(opts).toMatchObject({ video: true, videoSetBy: 'user' });
  });

  it('treats an explicit "video off" as an answer too', async () => {
    const { opts } = await migrate({ video: false, videoSetBy: 'default' }, { video: false });
    expect(opts).toMatchObject({ video: false, videoSetBy: 'user' });
  });

  it('leaves a pre-option blob on the default', async () => {
    // No `video` field at all: this user was never asked, so the seed stands
    // and a later seed may still change it.
    const { opts } = await migrate({ video: false, videoSetBy: 'default' }, { surfaceMode: 'desktop' });
    expect(opts).toMatchObject({ video: false, videoSetBy: 'default' });
  });

  it('carries the other options across', async () => {
    const { opts } = await migrate(undefined, { surfaceMode: 'desktop', delaySec: 3, blurFirst: true });
    expect(opts).toMatchObject({ surfaceMode: 'desktop', delaySec: 3, blurFirst: true });
  });

  it('never lets the legacy copy overwrite a choice already stored here', async () => {
    const { opts } = await migrate({ video: true, videoSetBy: 'user' }, { video: false });
    expect(opts).toMatchObject({ video: true, videoSetBy: 'user' });
  });

  it('drops the legacy copy once the new one is committed', async () => {
    const { legacyLeft, store } = await migrate(undefined, { video: true });
    expect(legacyLeft).toBe(false);
    expect(store[KEY]).toMatchObject({ video: true });
  });

  it('does nothing when there is no legacy blob', async () => {
    const { opts, store } = await migrate({ video: true, videoSetBy: 'user' }, null);
    expect(opts).toMatchObject({ video: true, videoSetBy: 'user' });
    expect(store[KEY]).toMatchObject({ videoSetBy: 'user' });
  });

  it('survives a corrupt legacy blob', async () => {
    const store: Record<string, unknown> = { [KEY]: { video: true, videoSetBy: 'user' } };
    const sandbox = {
      OPTS_KEY: KEY,
      LEGACY_OPTS_KEY: LEGACY_KEY,
      chrome: { storage: { local: {
        get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
        set: async () => {},
      } } },
      localStorage: { getItem: () => '{not json', removeItem: () => {} },
      JSON,
      result: undefined as unknown,
    };
    const ctx = createContext(sandbox);
    runInContext(BODY.trim() + '\nresult = loadRecordOpts();', ctx);
    await expect(sandbox.result as Promise<unknown>).resolves.toMatchObject({ video: true });
  });
});
