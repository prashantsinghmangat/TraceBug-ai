// Phase 4 Step D: telling an updating user what changed, without stealing a tab.
//
// The split matters. background.js records WHICH VERSION landed and holds no
// copy; popup.js holds the copy, keyed per version and literal. So:
//
//   • an update to a version with copy  → the card appears, once
//   • an update to a version without it → nothing, and the stale flag is dropped
//   • a fresh install                   → nothing (they just saw the welcome page)
//
// The last two are the ones worth testing. A release that forgets to add an
// entry must show no card at all, not an empty indigo box, and the flag must
// not sit in storage being reconsidered on every popup open.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createChromeMock, loadBackground, settle, type ChromeMock } from './helpers/chrome-mock';

const KEY = 'tb_whats_new';
const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const POPUP = readFileSync(join(extDir, 'popup.js'), 'utf8');
const HTML = readFileSync(join(extDir, 'popup.html'), 'utf8');

describe('the worker records which version landed', () => {
  let mock: ChromeMock;
  const boot = (version?: string) => {
    mock = createChromeMock(version ? { version } : {});
    loadBackground(mock);
    return mock;
  };

  beforeEach(() => { boot(); });

  it('flags the new version on update', async () => {
    mock.events.onInstalled.emit({ reason: 'update' });
    await settle();
    expect(mock.localStore[KEY]).toBe('1.11.0');
  });

  it('flags whatever version is actually running, not a literal', async () => {
    // The worker must never hardcode a version — it reports the manifest's.
    const m = boot('1.12.3');
    m.events.onInstalled.emit({ reason: 'update' });
    await settle();
    expect(m.localStore[KEY]).toBe('1.12.3');
  });

  it('does not flag on a fresh install', async () => {
    // They have just been shown the welcome page. "What changed since a
    // version you never ran" is noise.
    mock.events.onInstalled.emit({ reason: 'install' });
    await settle();
    expect(mock.localStore[KEY]).toBeUndefined();
  });

  it('does not flag on a browser update', async () => {
    mock.events.onInstalled.emit({ reason: 'chrome_update' });
    await settle();
    expect(mock.localStore[KEY]).toBeUndefined();
  });

  it('opens no tab on update — the card is the whole point', async () => {
    mock.events.onInstalled.emit({ reason: 'update' });
    await settle();
    expect(mock.createdTabs).toHaveLength(0);
  });

  it('holds no copy of its own', () => {
    // The worker's job is the version stamp. Copy in the worker would mean two
    // places to edit, and the worker cannot render it anyway.
    const bg = readFileSync(join(extDir, 'background.js'), 'utf8');
    expect(bg).not.toContain('New in 1.11');
    expect(bg).not.toMatch(/revoke and re-create/i);
  });
});

// ── The popup side ─────────────────────────────────────────────────────────
// popup.js is one DOMContentLoaded closure over the whole popup DOM, so the
// renderer is sliced out of the shipped file and run against a minimal fake
// document — the same approach as tests/record-opts.test.ts.
function sliceFunction(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`not found in popup.js: ${declaration}`);
  const end = source.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`could not find the end of ${declaration}`);
  return source.slice(start, end + 3);
}

describe('the popup shows the card only when it has copy', () => {
  const BODY = sliceFunction(POPUP, 'async function initWhatsNew() {');
  // The copy table is a top-level const, so it slices cleanly too.
  const TABLE = POPUP.slice(POPUP.indexOf('const WHATS_NEW = {'), POPUP.indexOf('const SVG_NS'));

  /** Minimal element stand-in: enough for textContent, display and append. */
  function el(id: string) {
    const node: Record<string, unknown> = {
      id, textContent: '', innerHTML: '', className: '',
      style: { display: 'none' },
      children: [] as unknown[],
      firstChild: { _icon: true },
      listeners: {} as Record<string, () => void>,
    };
    node.appendChild = (c: unknown) => { (node.children as unknown[]).push(c); return c; };
    node.append = (...cs: unknown[]) => { (node.children as unknown[]).push(...cs); };
    node.addEventListener = (ev: string, fn: () => void) => {
      (node.listeners as Record<string, () => void>)[ev] = fn;
    };
    return node;
  }

  /** Run the real initWhatsNew against a given stored version. */
  async function render(stored: string | undefined) {
    const store: Record<string, unknown> = {};
    if (stored !== undefined) store[KEY] = stored;
    const removed: string[] = [];
    const nodes: Record<string, Record<string, unknown>> = {};
    for (const id of ['whatsNew', 'whatsNewLabel', 'whatsNewList', 'whatsNewWarn', 'whatsNewGot']) {
      nodes[id] = el(id);
    }
    const sandbox = {
      WHATS_NEW_KEY: KEY,
      document: {
        getElementById: (id: string) => nodes[id] ?? null,
        createElement: (tag: string) => el(tag),
      },
      chrome: {
        storage: { local: {
          get: async (k: string) => (k in store ? { [k]: store[k] } : {}),
          remove: async (k: string) => { removed.push(k); delete store[k]; },
        } },
      },
      console: { warn: () => {} },
      result: undefined as unknown,
    };
    const ctx = createContext(sandbox);
    runInContext(`${TABLE}\nfunction wnCheckIcon() { return { _icon: true }; }\n${BODY}\nresult = initWhatsNew();`, ctx);
    await (sandbox.result as Promise<void>);
    return { nodes, removed, store };
  }

  it('is actually there', () => {
    expect(BODY).toContain('initWhatsNew');
    expect(TABLE).toContain('"1.11.0"');
    expect(POPUP).toContain('const WHATS_NEW_KEY = "tb_whats_new"');
  });

  it('renders the 1.11.0 card with all four lines and the warning', async () => {
    const { nodes } = await render('1.11.0');
    expect(nodes.whatsNew.style).toMatchObject({ display: '' });
    expect(nodes.whatsNewLabel.textContent).toBe('New in 1.11');
    expect((nodes.whatsNewList.children as unknown[])).toHaveLength(4);
    expect(nodes.whatsNewWarn.textContent).toMatch(/revoke and re-create/i);
    expect(nodes.whatsNewWarn.style).toMatchObject({ display: '' });
  });

  it('shows nothing for a version it has no copy for', async () => {
    // The release-forgot-an-entry case. An empty indigo box would be worse
    // than silence.
    const { nodes } = await render('1.12.0');
    expect(nodes.whatsNew.style).toMatchObject({ display: 'none' });
    expect(nodes.whatsNewLabel.textContent).toBe('');
  });

  it('drops the stale flag for a version with no copy', async () => {
    // Otherwise every popup open re-reads and re-decides it, forever.
    const { removed, store } = await render('1.12.0');
    expect(removed).toContain(KEY);
    expect(store[KEY]).toBeUndefined();
  });

  it('shows nothing, and removes nothing, when no update was flagged', async () => {
    const { nodes, removed } = await render(undefined);
    expect(nodes.whatsNew.style).toMatchObject({ display: 'none' });
    expect(removed).toHaveLength(0);
  });

  it('"Got it" hides the card and clears the flag for good', async () => {
    const { nodes, removed, store } = await render('1.11.0');
    (nodes.whatsNewGot.listeners as Record<string, () => void>).click();
    expect(nodes.whatsNew.style).toMatchObject({ display: 'none' });
    expect(removed).toContain(KEY);
    expect(store[KEY]).toBeUndefined();
  });

  it('phrases the capture line as an invitation, not an announcement', async () => {
    // This card is only ever shown on UPDATE, and an updating user keeps video
    // ON. "Captures no longer share your screen" would be false for every
    // person who reads it — see background.js seedRecordOptsDefault.
    const { nodes } = await render('1.11.0');
    const first = (nodes.whatsNewList.children as Array<Record<string, unknown>>)[0];
    const text = (first.children as Array<Record<string, unknown>>)
      .map((c) => String(c.textContent ?? '')).join('');
    expect(text).toMatch(/Turn off Record video too/);
    expect(text).not.toMatch(/no longer (share|asks)/i);
  });

  it('never touches innerHTML, for the copy or the icon', () => {
    // The lines are literals today, but a card that renders anything as markup
    // is one careless edit away from being an injection point — and web-ext
    // flags it as UNSAFE_VAR_ASSIGNMENT, which the warning baseline catches.
    // Comments stripped: both functions explain why they avoid innerHTML, and
    // saying so is not doing it.
    const noComments = (s: string) =>
      s.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(BODY).toContain('.textContent = line');
    expect(noComments(BODY)).not.toContain('innerHTML');
    const icon = POPUP.slice(POPUP.indexOf('function wnCheckIcon'), POPUP.indexOf('async function initWhatsNew'));
    expect(icon).toContain('createElementNS');
    expect(noComments(icon)).not.toContain('innerHTML');
  });
});

describe('the popup markup carries no copy', () => {
  it('ships the card empty, filled by popup.js', () => {
    expect(HTML).toContain('id="whatsNew"');
    expect(HTML).toContain('id="whatsNewGot"');
    // Every line must come from the per-version table, or there are two places
    // to edit and they will disagree.
    expect(HTML).not.toContain('New in 1.11');
    expect(HTML).not.toMatch(/revoke and re-create/i);
  });

  it('starts hidden', () => {
    const card = HTML.slice(HTML.indexOf('id="whatsNew"') - 60, HTML.indexOf('id="whatsNew"') + 60);
    expect(card).toContain('display:none');
  });
});
