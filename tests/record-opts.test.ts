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
// explicit `videoSetBy` discriminator, and the worker seeds the SAME default
// — video ON — for both install and update: a new user gets the full capture
// (events + video) from their first click, and an upgrading user keeps the
// video they have been getting all along. One failure mode is guarded here:
//
//   • Ordering. onInstalled runs before the popup is ever opened, so the seed
//     is ALWAYS already present by migration time. A naive "only migrate when
//     the key is absent" rule would throw away the choice of a user who had
//     turned video off, and a merge that fell back to a hardcoded `false`
//     would undo the seed on the first popup open.
//   • Re-seeding. A stored `video` boolean (with no user flag) means this
//     build's own install or update seed has already run once, so a later
//     update does not re-apply it and stomp a value storage otherwise holds.
import { describe, it, expect, beforeEach } from 'vitest';
import { readText } from './helpers/read-source';
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

describe('the worker seeds the video default — on, for both install and update', () => {
  let mock: ChromeMock;
  beforeEach(() => {
    mock = createChromeMock();
    loadBackground(mock);
  });

  it('writes video ON on a fresh install', async () => {
    expect(await install(mock, 'install')).toMatchObject({ video: true, videoSetBy: 'default' });
  });

  it('writes video ON for an update from a build that had no such option', async () => {
    // A 1.10 user recorded video on every capture because there was no way
    // not to; switching them to events-only without asking would take away
    // the thing they have been using TraceBug for.
    expect(await install(mock, 'update')).toMatchObject({ video: true, videoSetBy: 'default' });
  });

  it('keeps the other options when it seeds', async () => {
    // A pre-1.11 install can hold a surface and a delay already — those are
    // not the thing being defaulted.
    mock.localStore[KEY] = { surfaceMode: 'desktop', delaySec: 3 };
    expect(await install(mock, 'update')).toMatchObject({
      video: true, videoSetBy: 'default', surfaceMode: 'desktop', delaySec: 3,
    });
  });

  it('does NOT overwrite a user who turned video on', async () => {
    mock.localStore[KEY] = { video: true, videoSetBy: 'user', surfaceMode: 'desktop' };
    expect(await install(mock, 'update')).toMatchObject({ video: true, videoSetBy: 'user' });
  });

  it('does NOT overwrite a user who turned video OFF', async () => {
    // With the default ON, this is the direction that would actually hurt:
    // re-enabling a screen share for someone who went looking for the
    // checkbox to turn it off.
    mock.localStore[KEY] = { video: false, videoSetBy: 'user' };
    expect(await install(mock, 'update')).toMatchObject({ video: false, videoSetBy: 'user' });
  });

  it('does not re-seed a later update over a default already written', async () => {
    // install seeds { video: true, videoSetBy: "default" }. That stored
    // boolean is what tells a later update this build has already decided for
    // this profile — without the check, every update would re-run the seed
    // and could stomp a value storage otherwise holds for other reasons.
    await install(mock, 'install');
    mock.localStore[KEY] = { video: false, videoSetBy: 'default' };
    expect(await install(mock, 'update')).toMatchObject({ video: false, videoSetBy: 'default' });
  });

  it('does not re-seed on a second update either', async () => {
    const first = await install(mock, 'update');
    expect(first).toMatchObject({ video: true });
    mock.localStore[KEY] = { video: false, videoSetBy: 'default' };
    expect(await install(mock, 'update')).toMatchObject({ video: false });
  });

  it('leaves the pref alone on a plain reload', async () => {
    // chrome_update / browser_update fire onInstalled too, and neither is a
    // moment to touch the user's settings.
    await install(mock, 'chrome_update');
    expect(mock.localStore[KEY]).toBeUndefined();
  });

  it('still opens the welcome page on install, and only on install', async () => {
    // The URL is asserted in tests/first-run.test.ts; counting tabs here is
    // about the seed not disturbing the first-run tab, in either direction.
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
function sliceFunction(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`not found in popup.js — did it move or get renamed? ${declaration}`);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`could not find the end of ${declaration} in popup.js`);
  return source.slice(start, end + 4);
}

describe('popup.js migrates the legacy localStorage blob', () => {
  const SOURCE = readText(join(extDir, 'popup.js'));
  const BODY = sliceFunction(SOURCE, '  async function loadRecordOpts() {');

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

  it('keeps the update seed when the legacy blob has no answer in it', async () => {
    // The pairing that actually happens on upgrade from pre-1.11: the worker
    // seeded video ON, and the legacy blob holds a surface but no `video`.
    // A merge that fell back to a literal `false` here would undo the seed on
    // the first popup open and hand the user a silent behaviour change.
    const { opts } = await migrate(
      { video: true, videoSetBy: 'default' },
      { surfaceMode: 'desktop', delaySec: 2 },
    );
    expect(opts).toMatchObject({ video: true, videoSetBy: 'default', surfaceMode: 'desktop' });
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

// ── Who gets to say "the user chose this" ───────────────────────────────────
// `videoSetBy: "user"` is a promise the worker keeps: it is never overwritten
// by a future install or update seed. So stamping it on anything short of a
// real decision freezes someone on a default they never saw — which is why
// clicking Capture Bug must NOT stamp it, even though it saves the options.
describe('popup.js only calls the video setting "chosen" when it was', () => {
  const SOURCE = readText(join(extDir, 'popup.js'));
  const BODY = sliceFunction(SOURCE, '  function saveRecordOpts() {');

  /** Run the real saveRecordOpts with fake controls and a given videoSetBy. */
  function save(videoSetBy: string, checked = false) {
    const written: Record<string, unknown>[] = [];
    const sandbox = {
      OPTS_KEY: KEY,
      videoSetBy,
      videoCb: { checked },
      surfaceMode: 'tab',
      delaySel: { value: '0' },
      blurCb: { checked: false },
      updateOptsState: () => {},
      applyVideoUI: () => {},
      chrome: { storage: { local: {
        set: (items: Record<string, Record<string, unknown>>) => { written.push(items[KEY]); },
      } } },
      result: undefined as unknown,
    };
    const ctx = createContext(sandbox);
    runInContext(BODY.trim() + '\nresult = saveRecordOpts();', ctx);
    return { opts: sandbox.result as Record<string, unknown>, written };
  }

  it('is actually there', () => {
    expect(BODY).toContain('videoSetBy,');
    // The literal is gone from this function — a stamp here would be one.
    expect(BODY).not.toContain('"user"');
  });

  it('leaves videoSetBy alone when the user has not touched the checkbox', () => {
    // Clicking Capture Bug calls this. Accepting a default is not choosing it.
    const { opts, written } = save('default');
    expect(opts).toMatchObject({ videoSetBy: 'default' });
    expect(written[0]).toMatchObject({ videoSetBy: 'default' });
  });

  it('carries a choice already made straight through', () => {
    const { opts } = save('user', true);
    expect(opts).toMatchObject({ video: true, videoSetBy: 'user' });
  });

  it('wires the promotion to the checkbox and to nothing else', () => {
    // The stamp lives in one listener. Assert that listener is the checkbox's,
    // and that the other three controls share the plain handler — adding
    // markVideoChosen to any of them would silently re-freeze users.
    expect(SOURCE).toContain('videoCb.addEventListener("change", () => { markVideoChosen(); saveRecordOpts(); });');
    // delaySel/blurCb share the plain handler and never promote videoSetBy.
    expect(SOURCE).toContain('[delaySel, blurCb].filter(Boolean).forEach((el) => el.addEventListener("change", saveRecordOpts));');
    // The Tab | Desktop switch (1.11.3) is two buttons, not a <select> — each
    // has its own click handler (Tab's also requests the optional tabCapture
    // permission first), but neither promotes videoSetBy either.
    expect(SOURCE).toContain('surfaceDesktopBtn.addEventListener("click", () => {');
    expect(SOURCE).toContain('surfaceTabBtn.addEventListener("click", () => {');
    // The declaration plus exactly one call — proves nothing else in the file,
    // including the two new surface-switch handlers, promotes videoSetBy.
    expect(SOURCE.match(/markVideoChosen\(\)/g) ?? []).toHaveLength(2);
  });

  it('is not called by the Capture Bug handler', () => {
    // The handler saves the options; it must not claim they were chosen.
    const handler = SOURCE.slice(SOURCE.indexOf('btnCaptureBug'));
    const body = handler.slice(0, handler.indexOf('\n  });'));
    expect(body).toContain('saveRecordOpts()');
    expect(body).not.toContain('markVideoChosen');
  });
});
