// Phase 2b: the page→service-worker provider bridge.
//
// This is the security boundary of the whole phase. Phase 2a stopped a hostile
// page READING the user's GitHub token; these tests are about stopping it
// SPENDING one — filing issues in the user's repo, posting to their Slack,
// burning their LLM credits — by relaying a well-formed message.
//
// Tests the real shipped decision layer from
// tracebug-extension/provider-bridge.js, evaluated in a vm sandbox the same
// way the browser evaluates it (same pattern as secret-migration.test.ts), so
// this covers the artifact rather than a copy of it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const sandbox: Record<string, unknown> = {};
const ctx = createContext(sandbox);
runInContext(readFileSync(join(extDir, 'provider-bridge.js'), 'utf8'), ctx);

interface Verdict { ok: boolean; error?: string; payload?: Record<string, string>; viaStorage?: boolean; bytes?: number; kind?: string; target?: string }
interface Rate { allow: boolean; state: Record<string, number[]>; error?: string }

const B = sandbox.TraceBugProviderBridge as {
  VERBS: string[];
  RATE_MAX: number;
  RATE_WINDOW_MS: number;
  MAX_PENDING_TOTAL: number;
  CONFIRM_TIMEOUT_MS: number;
  VIA_STORAGE_BYTES: number;
  isVerb: (v: string) => boolean;
  validateSender: (s: unknown, id: string) => boolean;
  validateConfirmSender: (s: unknown, id: string, url: string) => boolean;
  validatePayload: (target: string, payload: unknown) => Verdict;
  validateRequest: (verb: string, data: unknown, id: string, sender: unknown) => Verdict;
  rateLimit: (origin: string, now: number, state: unknown) => Rate;
  canQueue: (pending: unknown, tabId: number, now: number) => { ok: boolean; error?: string };
  reapExpired: (pending: unknown, now: number) => string[];
  destinationLabel: (target: string, cfg: unknown) => string;
  previewWarnings: (text: string) => string[];
};

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const CONFIRM_URL = `chrome-extension://${EXT_ID}/confirm-send.html`;

/** A message that really did come from our content script in a page's top frame. */
const pageSender = (over: Record<string, unknown> = {}) => ({
  id: EXT_ID,
  tab: { id: 7 },
  frameId: 0,
  url: 'https://example.com/app',
  origin: 'https://example.com',
  ...over,
});

const goodIssue = { title: 'Login fails', body: 'Steps: 1. click' };

describe('verb allowlist', () => {
  it('allows exactly the two provider verbs', () => {
    expect(B.VERBS).toEqual(['tb:provider:send', 'tb:llm:analyze']);
  });

  it.each([
    'CAPTURE_SCREENSHOT',
    'TB_OPEN_OPTIONS',
    'tb:rec:start',
    'tb:confirm:decide',
    'tb:provider:send2',
    'TB_START_RECORDING',
    '',
  ])('rejects %s', (verb) => {
    expect(B.isVerb(verb)).toBe(false);
    const v = B.validateRequest(verb, { provider: 'github', payload: goodIssue }, EXT_ID, pageSender());
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/unsupported/i);
  });

  it('rejects a verb the page nearly guessed, before looking at the payload', () => {
    // Order matters: an unknown verb must never reach payload parsing.
    const v = B.validateRequest('tb:provider:SEND', { provider: 'github', payload: goodIssue }, EXT_ID, pageSender());
    expect(v.error).toMatch(/unsupported/i);
  });
});

describe('sender validation', () => {
  it('accepts our own content script in a top-level frame', () => {
    expect(B.validateSender(pageSender(), EXT_ID)).toBe(true);
  });

  it('rejects a message claiming to be from another extension', () => {
    expect(B.validateSender(pageSender({ id: 'someotherextensionidxxxxxxxxxxxx' }), EXT_ID)).toBe(false);
  });

  it('rejects a message with no tab — i.e. from an extension page', () => {
    // The popup, the options page and the confirm window all have no tab.
    // None of them may drive a page-originated send.
    expect(B.validateSender(pageSender({ tab: undefined }), EXT_ID)).toBe(false);
  });

  it('rejects a subframe', () => {
    // A hostile ad iframe must not be able to file an issue that looks like it
    // came from the page under test.
    expect(B.validateSender(pageSender({ frameId: 3 }), EXT_ID)).toBe(false);
  });

  it('rejects junk', () => {
    expect(B.validateSender(null, EXT_ID)).toBe(false);
    expect(B.validateSender(pageSender({ tab: { id: -1 } }), EXT_ID)).toBe(false);
    expect(B.validateSender(pageSender(), '')).toBe(false);
  });

  it('a wrong sender fails the whole request even with a perfect payload', () => {
    const v = B.validateRequest('tb:provider:send', { provider: 'github', payload: goodIssue }, EXT_ID,
      pageSender({ frameId: 9 }));
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/rejected/i);
  });
});

describe('confirm-window sender validation', () => {
  const confirmSender = (over: Record<string, unknown> = {}) => ({
    id: EXT_ID,
    url: `${CONFIRM_URL}?id=abc`,
    ...over,
  });

  it('accepts our own confirm window', () => {
    expect(B.validateConfirmSender(confirmSender(), EXT_ID, CONFIRM_URL)).toBe(true);
  });

  it('accepts it when shown in a popup window, which HAS a tab', () => {
    // An extension page in a popup window gets a sender.tab, so "no tab"
    // cannot be the discriminator — it would reject our own window. The URL
    // is what the browser sets and the page cannot choose.
    expect(B.validateConfirmSender(
      confirmSender({ tab: { id: 12 }, frameId: 0 }), EXT_ID, CONFIRM_URL,
    )).toBe(true);
  });

  it('rejects an approve sent from a content script', () => {
    // The whole point: a page script that gets {type:"tb:confirm:decide",
    // approved:true} relayed from a content script must not be able to
    // approve its own send. A content script keeps the HOST PAGE's url.
    expect(B.validateConfirmSender(pageSender(), EXT_ID, CONFIRM_URL)).toBe(false);
    expect(B.validateConfirmSender(
      pageSender({ url: 'https://example.com/confirm-send.html' }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
  });

  it('rejects another extension page of ours', () => {
    // Only confirm-send.html may decide — not options.html or popup.html.
    expect(B.validateConfirmSender(
      confirmSender({ url: `chrome-extension://${EXT_ID}/options.html` }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
  });

  it('rejects a path that merely starts with the confirm page name', () => {
    expect(B.validateConfirmSender(
      confirmSender({ url: `${CONFIRM_URL}.evil` }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
    expect(B.validateConfirmSender(
      confirmSender({ url: `${CONFIRM_URL}x?id=1` }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
  });

  it('rejects a web page that merely puts the URL in a string', () => {
    expect(B.validateConfirmSender(
      confirmSender({ tab: { id: 2 }, url: `https://evil.example/${CONFIRM_URL}` }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
    expect(B.validateConfirmSender(
      confirmSender({ url: `https://evil.example/#${CONFIRM_URL}` }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
  });

  it('rejects an extension subframe', () => {
    expect(B.validateConfirmSender(
      confirmSender({ frameId: 4 }), EXT_ID, CONFIRM_URL,
    )).toBe(false);
  });

  it('rejects another extension', () => {
    expect(B.validateConfirmSender(confirmSender({ id: 'x'.repeat(32) }), EXT_ID, CONFIRM_URL)).toBe(false);
  });
});

describe('payload validation', () => {
  it('accepts exactly the per-provider shape', () => {
    expect(B.validatePayload('github', goodIssue).ok).toBe(true);
    expect(B.validatePayload('linear', goodIssue).ok).toBe(true);
    expect(B.validatePayload('slack', { text: 'hi' }).ok).toBe(true);
    expect(B.validatePayload('llm', { prompt: 'why' }).ok).toBe(true);
  });

  it('rebuilds the payload rather than passing the page object through', () => {
    const v = B.validatePayload('github', goodIssue);
    expect(Object.keys(v.payload!).sort()).toEqual(['body', 'title']);
  });

  it.each([
    ['repo', { ...goodIssue, repo: 'attacker/evil' }],
    ['token', { ...goodIssue, token: 'ghp_stolen' }],
    ['apiKey', { ...goodIssue, apiKey: 'sk-ant-x' }],
    ['webhookUrl', { ...goodIssue, webhookUrl: 'https://hooks.slack.com/services/x' }],
    ['baseUrl', { ...goodIssue, baseUrl: 'https://evil.example' }],
    ['labels', { ...goodIssue, labels: 'p0' }],
    ['teamId', { ...goodIssue, teamId: 'ENG' }],
  ])('rejects a page-supplied %s instead of silently dropping it', (field, payload) => {
    const v = B.validatePayload('github', payload);
    expect(v.ok).toBe(false);
    // Named, so a page probing the bridge and a developer after a refactor
    // both get told which field.
    expect(v.error).toContain(field);
  });

  it('ignores a page-supplied destination at the request level too', () => {
    const v = B.validateRequest('tb:provider:send',
      { provider: 'github', payload: { ...goodIssue, repo: 'attacker/evil' } }, EXT_ID, pageSender());
    expect(v.ok).toBe(false);
    expect(v.error).toContain('repo');
  });

  it('rejects an unknown provider', () => {
    const v = B.validateRequest('tb:provider:send', { provider: 'jira', payload: goodIssue }, EXT_ID, pageSender());
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/unknown provider/i);
  });

  it('rejects a provider swapped in on the llm verb', () => {
    // tb:llm:analyze takes no provider — the worker picks it from storage.
    const v = B.validateRequest('tb:llm:analyze',
      { provider: 'github', payload: { prompt: 'x' } }, EXT_ID, pageSender());
    expect(v.ok).toBe(true);
    expect(v.target).toBe('llm');
    expect(v.payload).toEqual({ prompt: 'x' });
  });

  it('requires strings, and rejects empty required fields', () => {
    expect(B.validatePayload('github', { title: 1, body: 'x' }).error).toMatch(/must be a string/);
    expect(B.validatePayload('github', { title: '  ', body: 'x' }).error).toMatch(/is empty/);
    // A body may legitimately be empty — a one-line bug report is still a bug.
    expect(B.validatePayload('github', { title: 'has title', body: '' }).ok).toBe(true);
  });

  it('rejects arrays and non-objects', () => {
    expect(B.validatePayload('github', null).ok).toBe(false);
    expect(B.validatePayload('github', [1, 2]).ok).toBe(false);
    expect(B.validatePayload('github', 'title').ok).toBe(false);
  });

  it('caps a single oversized field with a plain message', () => {
    const v = B.validatePayload('github', { title: 'x', body: 'y'.repeat(3 * 1024 * 1024) });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/too large to file/i);
  });

  it('caps the total even when each field is under the per-field cap', () => {
    const big = 'z'.repeat(1.9 * 1024 * 1024);
    const v = B.validatePayload('github', { title: big, body: big });
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/too large to file/i);
  });

  it('flags a large-but-legal payload for the storage route', () => {
    const small = B.validatePayload('github', goodIssue);
    expect(small.viaStorage).toBe(false);
    const big = B.validatePayload('github', { title: 'x', body: 'y'.repeat(B.VIA_STORAGE_BYTES + 10) });
    expect(big.ok).toBe(true);
    expect(big.viaStorage).toBe(true);
  });
});

describe('rate limiting', () => {
  const ORIGIN = 'https://example.com';

  it('allows RATE_MAX in a window and rejects the next', () => {
    let state: Record<string, number[]> = {};
    const t0 = 1_000_000;
    for (let i = 0; i < B.RATE_MAX; i++) {
      const r = B.rateLimit(ORIGIN, t0 + i * 10, state);
      expect(r.allow).toBe(true);
      state = r.state;
    }
    const blocked = B.rateLimit(ORIGIN, t0 + 500, state);
    expect(blocked.allow).toBe(false);
    expect(blocked.error).toMatch(/too many/i);
    // The message tells the user how long to wait — "try again later" is not
    // actionable.
    expect(blocked.error).toMatch(/\d+s/);
  });

  it('recovers once the window has passed', () => {
    let state: Record<string, number[]> = {};
    const t0 = 2_000_000;
    for (let i = 0; i < B.RATE_MAX; i++) state = B.rateLimit(ORIGIN, t0 + i, state).state;
    expect(B.rateLimit(ORIGIN, t0 + 100, state).allow).toBe(false);
    expect(B.rateLimit(ORIGIN, t0 + B.RATE_WINDOW_MS + 1, state).allow).toBe(true);
  });

  it('counts per origin, so one noisy site cannot block another', () => {
    let state: Record<string, number[]> = {};
    const t0 = 3_000_000;
    for (let i = 0; i < B.RATE_MAX; i++) state = B.rateLimit(ORIGIN, t0 + i, state).state;
    expect(B.rateLimit(ORIGIN, t0 + 50, state).allow).toBe(false);
    expect(B.rateLimit('https://other.example', t0 + 50, state).allow).toBe(true);
  });

  it('forgets origins with no recent hits, so the state cannot grow forever', () => {
    let state: Record<string, number[]> = {};
    state = B.rateLimit('https://a.example', 1000, state).state;
    state = B.rateLimit('https://b.example', 1000, state).state;
    state = B.rateLimit('https://c.example', 1000 + B.RATE_WINDOW_MS + 1, state).state;
    expect(Object.keys(state)).toEqual(['https://c.example']);
  });

  it('survives a malformed stored state', () => {
    expect(B.rateLimit(ORIGIN, 1000, null).allow).toBe(true);
    expect(B.rateLimit(ORIGIN, 1000, { [ORIGIN]: 'nope' }).allow).toBe(true);
  });
});

describe('pending-confirmation limits', () => {
  const now = 10_000;
  const pend = (tabId: number, expiresAt = now + 60_000) => ({ tabId, expiresAt });

  it('allows one pending confirmation per tab', () => {
    expect(B.canQueue({}, 7, now).ok).toBe(true);
    const r = B.canQueue({ a: pend(7) }, 7, now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already waiting/i);
  });

  it('lets a different tab queue', () => {
    expect(B.canQueue({ a: pend(7) }, 8, now).ok).toBe(true);
  });

  it('caps the total across all tabs', () => {
    const full: Record<string, unknown> = {};
    for (let i = 0; i < B.MAX_PENDING_TOTAL; i++) full['k' + i] = pend(100 + i);
    const r = B.canQueue(full, 999, now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too many/i);
  });

  it('does not count an expired entry against either limit', () => {
    const stale = { a: pend(7, now - 1) };
    expect(B.canQueue(stale, 7, now).ok).toBe(true);
    expect(B.reapExpired(stale, now)).toEqual(['a']);
    expect(B.reapExpired({ a: pend(7) }, now)).toEqual([]);
  });
});

describe('destination label', () => {
  const cfg = {
    github: { token: 'ghp_SECRET', repo: 'acme/widgets' },
    linear: { apiKey: 'lin_api_SECRET', teamId: 'ENG' },
    slack: { webhookUrl: 'https://hooks.slack.com/services/T1/B2/SECRETPATH' },
  };

  it('shows what the user needs in order to spot a redirected send', () => {
    expect(B.destinationLabel('github', cfg)).toBe('acme/widgets');
    expect(B.destinationLabel('linear', cfg)).toBe('team ENG');
  });

  it('never prints the Slack webhook — that URL IS the credential', () => {
    const label = B.destinationLabel('slack', cfg);
    expect(label).not.toContain('SECRETPATH');
    expect(label).not.toContain('hooks.slack.com/services');
    expect(label).toMatch(/slack/i);
  });

  it('never prints a token for any provider', () => {
    for (const target of ['github', 'linear', 'slack']) {
      const label = B.destinationLabel(target, cfg);
      expect(label).not.toContain('ghp_SECRET');
      expect(label).not.toContain('lin_api_SECRET');
    }
  });

  it('says so when the destination is missing rather than rendering undefined', () => {
    expect(B.destinationLabel('github', {})).toMatch(/no repository/i);
    expect(B.destinationLabel('linear', {})).toMatch(/no team/i);
  });
});

describe('preview warnings', () => {
  it('flags a remote image', () => {
    const w = B.previewWarnings('see ![shot](https://evil.example/pixel.png)');
    expect(w.join(' ')).toMatch(/remote image/i);
  });

  it('flags a remote image in raw HTML too', () => {
    const w = B.previewWarnings('<img src="https://evil.example/p.gif">');
    expect(w.join(' ')).toMatch(/remote image/i);
  });

  it('does not flag a data: or relative image', () => {
    expect(B.previewWarnings('![x](data:image/png;base64,AAA)')).toEqual([]);
    expect(B.previewWarnings('![x](./local.png)')).toEqual([]);
  });

  it('flags @mentions and names them', () => {
    const w = B.previewWarnings('cc @channel and @alice please look');
    expect(w.join(' ')).toMatch(/@mention/i);
    expect(w.join(' ')).toContain('@channel');
    expect(w.join(' ')).toContain('@alice');
  });

  it('does not treat an email address as a mention', () => {
    expect(B.previewWarnings('contact qa@example.com for details')).toEqual([]);
  });

  it('says nothing about an ordinary report', () => {
    expect(B.previewWarnings('TypeError: cannot read property of undefined at line 3')).toEqual([]);
  });

  it('reports both when both are present', () => {
    expect(B.previewWarnings('@here ![p](https://x.example/p.png)')).toHaveLength(2);
  });
});

describe('happy path', () => {
  it('accepts a real tracker send and reports what the worker needs', () => {
    const v = B.validateRequest('tb:provider:send',
      { provider: 'slack', payload: { text: 'Bug: login fails' } }, EXT_ID, pageSender());
    expect(v).toMatchObject({ ok: true, kind: 'tracker', target: 'slack' });
    expect(v.payload).toEqual({ text: 'Bug: login fails' });
  });

  it('accepts a real analysis request', () => {
    const v = B.validateRequest('tb:llm:analyze', { payload: { prompt: 'why did this fail' } }, EXT_ID, pageSender());
    expect(v).toMatchObject({ ok: true, kind: 'llm', target: 'llm' });
  });

  it('gives the user two minutes to decide', () => {
    expect(B.CONFIRM_TIMEOUT_MS).toBe(120_000);
  });
});
