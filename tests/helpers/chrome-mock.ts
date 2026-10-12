// A recording fake `chrome`, enough of one to run the real background.js.
//
// Why this exists: every decision in tracebug-extension/background.js — which
// tab to re-inject, whether a tab is orphaned, whether to defer a reload mid
// recording — had no automated coverage, because the file is a service worker
// with no exports. The repo's answer so far was to extract pure decisions into
// their own file (provider-bridge.js, page-support.js) and test those. That
// does not work for the tab lifecycle: the behaviour under test IS the
// sequence of chrome.* calls the listeners make.
//
// So: load the shipped background.js in a node:vm context with this fake in
// place of `chrome`, capture the listeners it registers, invoke them, and
// assert on the calls. The same pattern as tests/provider-bridge.test.ts, one
// level up — the artifact is the real file, not a copy of its logic.
//
// Deliberately NOT a general-purpose polyfill. It implements only what
// background.js actually reaches for, and anything missing surfaces as a loud
// TypeError in the test rather than a silent wrong answer.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tracebug-extension');

export interface ScriptInjection {
  target: { tabId: number };
  files: string[];
  world?: string;
}

export interface SentMessage {
  tabId: number;
  message: Record<string, unknown>;
  options?: Record<string, unknown>;
}

type Listener = (...args: unknown[]) => unknown;

/** A chrome.*.onX event that records its listeners so a test can fire them. */
class FakeEvent {
  listeners: Listener[] = [];
  addListener = (fn: Listener) => { this.listeners.push(fn); };
  removeListener = (fn: Listener) => {
    this.listeners = this.listeners.filter((l) => l !== fn);
  };
  hasListener = (fn: Listener) => this.listeners.includes(fn);
  /** Fire every listener and return their results (for onMessage's `true`). */
  emit(...args: unknown[]): unknown[] {
    return this.listeners.map((l) => l(...args));
  }
}

export interface ChromeMockOptions {
  /** Granted permission patterns. Default: none — the withheld-access state. */
  grantedOrigins?: string[];
  /** Seed chrome.storage.session, e.g. a persisted tb_sw_state_v1. */
  session?: Record<string, unknown>;
  /** Seed chrome.storage.local. */
  local?: Record<string, unknown>;
  /** Keyboard commands chrome.commands.getAll() reports. */
  commands?: Array<{ name: string; shortcut: string; description?: string }>;
}

export function createChromeMock(opts: ChromeMockOptions = {}) {
  const injections: ScriptInjection[] = [];
  const sent: SentMessage[] = [];
  const badge: Array<Record<string, unknown>> = [];
  const titles: Array<Record<string, unknown>> = [];
  const createdTabs: Array<Record<string, unknown>> = [];
  const reloadedTabs: number[] = [];
  let runtimeReloads = 0;

  const sessionStore: Record<string, unknown> = { ...(opts.session || {}) };
  const localStore: Record<string, unknown> = { ...(opts.local || {}) };
  const granted = new Set(opts.grantedOrigins || []);

  /**
   * Which tabs answer a message. A tab NOT in this set behaves exactly like an
   * orphaned one: the callback fires with undefined and lastError is set,
   * which is the only signal the real worker gets.
   */
  const liveTabs = new Map<number, { alive: boolean; pageSdk: boolean }>();
  /** Files whose injection should fail, by tabId — simulates a restricted page. */
  const injectionFailures = new Map<number, string>();
  /**
   * Tabs where injecting the bridge does NOT bring it back to life. The real
   * shape of this: executeScript resolves, but the page never runs the script
   * (a document that is navigating away, a frame the browser walls off after
   * the fact). It is the state that has to produce "Reload this tab".
   */
  const neverRevive = new Set<number>();

  let lastError: { message: string } | undefined;

  const events = {
    onInstalled: new FakeEvent(),
    onMessage: new FakeEvent(),
    onUpdateAvailable: new FakeEvent(),
    onTabUpdated: new FakeEvent(),
    onTabRemoved: new FakeEvent(),
    onTabActivated: new FakeEvent(),
    onCommand: new FakeEvent(),
    onPermissionsAdded: new FakeEvent(),
    onPermissionsRemoved: new FakeEvent(),
    onAlarm: new FakeEvent(),
    onStorageChanged: new FakeEvent(),
    onWindowRemoved: new FakeEvent(),
  };

  const chrome = {
    runtime: {
      id: 'abcdefghijklmnopabcdefghijklmnop',
      // A getter so a handler reading it right after a failed call sees the
      // flag the real runtime would have set, then clears it like Chrome does.
      get lastError() {
        const e = lastError;
        lastError = undefined;
        return e;
      },
      getURL: (p: string) => `chrome-extension://abcdefghijklmnopabcdefghijklmnop/${p}`,
      getManifest: () => ({ version: '1.11.0' }),
      onInstalled: events.onInstalled,
      onMessage: events.onMessage,
      onUpdateAvailable: events.onUpdateAvailable,
      reload: () => { runtimeReloads += 1; },
      openOptionsPage: () => {},
      setUninstallURL: () => {},
      getContexts: async () => [],
      sendMessage: (_m: unknown, cb?: (r: unknown) => void) => { if (cb) cb(undefined); },
    },

    tabs: {
      onUpdated: events.onTabUpdated,
      onRemoved: events.onTabRemoved,
      onActivated: events.onTabActivated,
      query: async () => [{ id: 7, windowId: 1 }],
      create: (info: Record<string, unknown>) => { createdTabs.push(info); },
      reload: (tabId: number) => { reloadedTabs.push(tabId); },
      captureVisibleTab: (_w: unknown, _o: unknown, cb: (d?: string) => void) => cb('data:image/png;base64,AA'),
      sendMessage: (
        tabId: number,
        message: Record<string, unknown>,
        a?: unknown,
        b?: unknown,
      ) => {
        // Chrome's signature is (tabId, message, options?, callback?) and the
        // worker uses both shapes, so normalise before recording.
        const options = typeof a === 'function' ? undefined : (a as Record<string, unknown> | undefined);
        const cb = (typeof a === 'function' ? a : b) as ((r: unknown) => void) | undefined;
        sent.push({ tabId, message, options });

        const live = liveTabs.get(tabId);
        if (!live?.alive) {
          lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
          if (cb) { cb(undefined); return undefined; }
          // Promise form: the real API rejects.
          return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
        }

        const reply = message.type === 'TB_PING'
          ? { alive: true, pageSdk: live.pageSdk }
          : { ok: true };
        if (cb) { cb(reply); return undefined; }
        return Promise.resolve(reply);
      },
    },

    scripting: {
      executeScript: async (inj: ScriptInjection) => {
        injections.push(inj);
        const fail = injectionFailures.get(inj.target.tabId);
        if (fail) throw new Error(fail);
        // Injecting the bridge is what brings a tab back to life — the whole
        // point of the repair path, so the fake has to model it.
        if (inj.files.includes('content-script.js') && !neverRevive.has(inj.target.tabId)) {
          const prev = liveTabs.get(inj.target.tabId);
          liveTabs.set(inj.target.tabId, { alive: true, pageSdk: prev?.pageSdk ?? false });
        }
        if (inj.files.includes('tracebug-init.js') && !neverRevive.has(inj.target.tabId)) {
          const prev = liveTabs.get(inj.target.tabId);
          liveTabs.set(inj.target.tabId, { alive: prev?.alive ?? true, pageSdk: true });
        }
        return [{ result: undefined }];
      },
    },

    action: {
      setBadgeText: async (d: Record<string, unknown>) => { badge.push(d); },
      setBadgeBackgroundColor: async () => {},
      setTitle: async (d: Record<string, unknown>) => { titles.push(d); },
    },

    permissions: {
      contains: (q: { origins?: string[] }, cb: (g: boolean) => void) => {
        cb((q.origins || []).every((o) => granted.has(o)));
      },
      request: (_q: unknown, cb: (g: boolean) => void) => cb(false),
      onAdded: events.onPermissionsAdded,
      onRemoved: events.onPermissionsRemoved,
    },

    commands: {
      onCommand: events.onCommand,
      getAll: (cb?: (c: unknown[]) => void) => {
        const list = opts.commands || [];
        if (cb) { cb(list); return undefined; }
        return Promise.resolve(list);
      },
    },

    storage: {
      session: makeArea(sessionStore),
      local: makeArea(localStore),
      sync: makeArea({}),
      onChanged: events.onStorageChanged,
    },

    alarms: {
      create: () => {},
      clear: (_n: string, cb?: (b: boolean) => void) => { if (cb) cb(true); },
      onAlarm: events.onAlarm,
    },

    windows: {
      create: async () => ({ id: 99 }),
      remove: async () => {},
      onRemoved: events.onWindowRemoved,
    },

    offscreen: {
      createDocument: async () => {},
      closeDocument: async () => {},
    },
  };

  function makeArea(store: Record<string, unknown>) {
    const read = (keys: unknown) => {
      if (keys == null) return { ...store };
      const list = Array.isArray(keys) ? keys : [keys as string];
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in store) out[k as string] = store[k as string];
      return out;
    };
    return {
      get: (keys: unknown, cb?: (r: unknown) => void) => {
        const out = read(keys);
        if (cb) { cb(out); return undefined; }
        return Promise.resolve(out);
      },
      set: (items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(store, items);
        if (cb) { cb(); return undefined; }
        return Promise.resolve();
      },
      remove: (keys: unknown, cb?: () => void) => {
        const list = Array.isArray(keys) ? keys : [keys as string];
        for (const k of list) delete store[k as string];
        if (cb) { cb(); return undefined; }
        return Promise.resolve();
      },
    };
  }

  return {
    chrome,
    events,
    /** Recorded calls, in order. */
    injections,
    sent,
    badge,
    titles,
    createdTabs,
    reloadedTabs,
    sessionStore,
    localStore,
    get runtimeReloads() { return runtimeReloads; },

    /** Mark a tab as having a live content script (and optionally a page SDK). */
    setTabLive(tabId: number, alive: boolean, pageSdk = false) {
      liveTabs.set(tabId, { alive, pageSdk });
    },
    /** Make every executeScript for this tab reject with `message`. */
    failInjection(tabId: number, message: string) {
      injectionFailures.set(tabId, message);
    },
    clearInjectionFailure(tabId: number) {
      injectionFailures.delete(tabId);
    },
    /** executeScript resolves for this tab, but it still never answers a ping. */
    setNeverRevive(tabId: number) {
      neverRevive.add(tabId);
    },
    /** Only the injections that targeted the MAIN (page) world. */
    pageWorldInjections() {
      return injections.filter((i) => i.world === 'MAIN');
    },
    /** Messages of a given type, in order. */
    sentOfType(type: string) {
      return sent.filter((s) => s.message?.type === type);
    },
  };
}

export type ChromeMock = ReturnType<typeof createChromeMock>;

/**
 * Load the real background.js into a vm context driven by `mock`.
 *
 * The worker-side scripts are evaluated first, the way Firefox's
 * background.scripts array does it (background.js's own importScripts call is
 * guarded by `typeof importScripts === "function"`, which is false here).
 */
export function loadBackground(mock: ChromeMock) {
  const sandbox: Record<string, unknown> = {
    chrome: mock.chrome,
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    URL,
    TextEncoder,
    TextDecoder,
    fetch: async () => { throw new Error('no network in this test'); },
    Date,
    Math,
    JSON,
    Set,
    Map,
    Error,
    Blob: globalThis.Blob,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    crypto: globalThis.crypto,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = createContext(sandbox);
  for (const f of ['tracebug-provider-api.js', 'provider-bridge.js', 'page-support.js']) {
    try {
      runInContext(readFileSync(join(extDir, f), 'utf8'), ctx, { filename: f });
    } catch (e) {
      // tracebug-provider-api.js is a generated bundle; if it cannot run in a
      // bare vm that must not take the tab-lifecycle tests down with it.
      if (f !== 'tracebug-provider-api.js') throw e;
    }
  }
  runInContext(readFileSync(join(extDir, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });
  return sandbox;
}

/** Let queued microtasks and the ping timeout drain. */
export function settle(ms = 400): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
