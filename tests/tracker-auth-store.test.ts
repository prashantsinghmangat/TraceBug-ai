// ADR 010: where tracker credentials live and how they stay fresh
// (src/providers/auth-store.ts). The store is injected, so these run against a
// plain object the way the worker runs against chrome.storage.local.
import { describe, it, expect, vi } from 'vitest';
import {
  resolveAuth, withTrackerAuth, describeAuth, saveOAuth, forgetOAuth,
  ReconnectNeededError, NotConnectedError, REFRESH_SKEW_MS,
  type AuthMap, type AuthStorage, type AuthContext,
} from '../src/providers/auth-store';
import { ProviderHttpError } from '../src/providers/api';
import type { OAuthSpec } from '../src/providers/oauth';

const SPEC: OAuthSpec = { label: 'GitHub', clientId: 'cid', tokenUrl: 'https://github.com/login/oauth/access_token' };
const NOW = 1_000_000;

function memStore(initial: AuthMap = {}): AuthStorage & { map: AuthMap } {
  const s = {
    map: JSON.parse(JSON.stringify(initial)) as AuthMap,
    async read() { return JSON.parse(JSON.stringify(s.map)); },
    async write(m: AuthMap) { s.map = JSON.parse(JSON.stringify(m)); },
  };
  return s;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function ctx(store: AuthStorage, extra: Partial<AuthContext> = {}): AuthContext {
  return { store, tracker: 'github', label: 'GitHub', integrations: {}, spec: SPEC, now: () => NOW, ...extra };
}

const fresh = (over: Partial<{ expiresAt: number; refreshToken: string; refreshExpiresAt: number }> = {}): AuthMap => ({
  github: { tokens: { accessToken: 'ghu_live', refreshToken: 'ghr_rt', expiresAt: NOW + 3_600_000, ...over }, account: 'octo', connectedAt: 1 },
});

describe('resolveAuth', () => {
  it('uses a live OAuth token without touching the network', async () => {
    const fetchFn = vi.fn();
    const a = await resolveAuth(ctx(memStore(fresh()), { fetchFn: fetchFn as unknown as typeof fetch }));
    expect(a).toEqual({ via: 'oauth', token: 'ghu_live', account: 'octo' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes inside the skew window and stores the new tokens', async () => {
    const store = memStore(fresh({ expiresAt: NOW + REFRESH_SKEW_MS - 1 }));
    const fetchFn = vi.fn(async () => json({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800 }));
    const a = await resolveAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }));
    expect(a.token).toBe('ghu_new');
    expect(store.map.github?.tokens).toMatchObject({ accessToken: 'ghu_new', refreshToken: 'ghr_new', expiresAt: NOW + 28_800_000 });
  });

  it('marks Reconnect when the refresh token itself has expired', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1, refreshExpiresAt: NOW - 1 }));
    await expect(resolveAuth(ctx(store))).rejects.toBeInstanceOf(ReconnectNeededError);
    expect(store.map.github?.needsReconnect).toBe(true);
  });

  it('marks Reconnect when the vendor refuses the refresh', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 }));
    const fetchFn = vi.fn(async () => json({ error: 'invalid_grant' }, 400));
    await expect(resolveAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }))).rejects.toBeInstanceOf(ReconnectNeededError);
    expect(store.map.github?.needsReconnect).toBe(true);
  });

  it('does NOT sign the user out when the refresh fails offline', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 }));
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(resolveAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }))).rejects.toThrow(/Failed to fetch/);
    expect(store.map.github?.needsReconnect).toBeFalsy();
  });

  it('falls back to a pasted token — configs from before ADR 010 keep working', async () => {
    const a = await resolveAuth(ctx(memStore(), { integrations: { github: { token: 'ghp_pasted', repo: 'a/b' } } }));
    expect(a).toEqual({ via: 'token', token: 'ghp_pasted' });
  });

  it('prefers a pasted token over a sign-in that needs reconnecting', async () => {
    const map = fresh();
    map.github!.needsReconnect = true;
    const a = await resolveAuth(ctx(memStore(map), { integrations: { github: { token: 'ghp_pasted' } } }));
    expect(a.via).toBe('token');
  });

  it('says "not connected" when there is nothing at all', async () => {
    await expect(resolveAuth(ctx(memStore()))).rejects.toBeInstanceOf(NotConnectedError);
  });
});

describe('withTrackerAuth: 401 → one refresh → Reconnect', () => {
  it('refreshes once and retries after a 401', async () => {
    const store = memStore(fresh());
    const fetchFn = vi.fn(async () => json({ access_token: 'ghu_new', expires_in: 28800 }));
    const seen: string[] = [];
    const out = await withTrackerAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }), async (a) => {
      seen.push(a.token);
      if (a.token === 'ghu_live') throw new ProviderHttpError('GitHub rejected the token.', 401);
      return 'filed';
    });
    expect(out).toBe('filed');
    expect(seen).toEqual(['ghu_live', 'ghu_new']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a second 401 marks Reconnect and stops — no loop', async () => {
    const store = memStore(fresh());
    const fetchFn = vi.fn(async () => json({ access_token: 'ghu_new', expires_in: 28800 }));
    const fn = vi.fn(async () => { throw new ProviderHttpError('nope', 401); });
    await expect(withTrackerAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }), fn))
      .rejects.toBeInstanceOf(ReconnectNeededError);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.map.github?.needsReconnect).toBe(true);
  });

  it('never refreshes a pasted token: its 401 goes straight back', async () => {
    const fetchFn = vi.fn();
    const err = new ProviderHttpError('GitHub rejected the token.', 401);
    await expect(withTrackerAuth(
      ctx(memStore(), { integrations: { github: { token: 'ghp_x' } }, fetchFn: fetchFn as unknown as typeof fetch }),
      async () => { throw err; },
    )).rejects.toBe(err);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('leaves non-401 errors alone', async () => {
    const err = new ProviderHttpError('validation', 422);
    await expect(withTrackerAuth(ctx(memStore(fresh())), async () => { throw err; })).rejects.toBe(err);
  });

  it('runs one refresh for parallel callers (rotating refresh tokens)', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 }));
    let resolve!: (r: Response) => void;
    const fetchFn = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    const both = Promise.all([resolveAuth(c), resolveAuth(c)]);
    await new Promise((r) => setTimeout(r, 0));
    resolve(json({ access_token: 'ghu_once', expires_in: 28800 }));
    const [a, b] = await both;
    expect(a.token).toBe('ghu_once');
    expect(b.token).toBe('ghu_once');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('what a settings screen may see', () => {
  it('describeAuth carries no token, refresh token or expiry', async () => {
    const store = memStore();
    await saveOAuth(store, 'github', { accessToken: 'ghu_SECRET', refreshToken: 'ghr_SECRET', expiresAt: 5 }, 'octo', NOW);
    const view = describeAuth('github', store.map, { github: { token: 'ghp_SECRET' } });
    expect(view).toEqual({ connected: true, via: 'oauth', account: 'octo', needsReconnect: false });
    expect(JSON.stringify(view)).not.toMatch(/SECRET/);
  });

  it('reports a pasted token as connected via token', () => {
    expect(describeAuth('linear', {}, { linear: { apiKey: 'lin_api_x' } })).toEqual({ connected: true, via: 'token', needsReconnect: false });
  });

  it('forgetOAuth removes the sign-in', async () => {
    const store = memStore(fresh());
    await forgetOAuth(store, 'github');
    expect(store.map.github).toBeUndefined();
  });
});

// GitHub hardening 1: GitHub replaces the refresh token on every use, so the
// worker must never refresh twice for one expiry — not for parallel calls,
// not for a straggler that arrives just after a refresh — and a dead refresh
// token must end in "Needs reconnect", never in a loop.
describe('GitHub sign-in refresh: one at a time, never a loop', () => {
  const refreshReply = () => json({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800, refresh_token_expires_in: 15897600 });
  const isRefresh = (url: unknown) => String(url).includes('/login/oauth/access_token');

  it('8 h expiry: an expired access token is refreshed before the call, then used', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 })); // 8 h after sign-in
    const seen: string[] = [];
    const fetchFn = vi.fn(async () => refreshReply());
    const out = await withTrackerAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }), async (a) => { seen.push(a.token); return 'ok'; });
    expect(out).toBe('ok');
    expect(seen).toEqual(['ghu_new']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.map.github?.tokens.refreshToken).toBe('ghr_new');
  });

  it('two parallel API calls with an expired token: one refresh, both succeed', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 }));
    const fetchFn = vi.fn(async (url: unknown) => (isRefresh(url) ? refreshReply() : json({})));
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    const call = (n: number) => withTrackerAuth(c, async (a) => `${n}:${a.token}`);
    expect(await Promise.all([call(1), call(2)])).toEqual(['1:ghu_new', '2:ghu_new']);
    expect(fetchFn.mock.calls.filter(([u]) => isRefresh(u)).length).toBe(1);
  });

  it('two parallel calls that both get a 401 (revoked early): one refresh, both retried and succeed', async () => {
    const store = memStore(fresh()); // the clock says it's live; GitHub says 401
    let refreshes = 0;
    const fetchFn = vi.fn(async () => { refreshes++; await new Promise((r) => setTimeout(r, 5)); return refreshReply(); });
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    const api = async (a: { token: string }) => {
      if (a.token === 'ghu_live') throw new ProviderHttpError('Bad credentials', 401);
      return a.token;
    };
    expect(await Promise.all([withTrackerAuth(c, api), withTrackerAuth(c, api)])).toEqual(['ghu_new', 'ghu_new']);
    expect(refreshes).toBe(1);
  });

  it('a straggler whose 401 arrives after the refresh finished uses the new token — no second refresh', async () => {
    const store = memStore(fresh());
    const fetchFn = vi.fn(async () => refreshReply());
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    let aDone!: () => void;
    const aFinished = new Promise<void>((r) => { aDone = r; });
    // A: fails at once with the old token, refreshes, retries.
    const a = withTrackerAuth(c, async (t) => {
      if (t.token === 'ghu_live') throw new ProviderHttpError('Bad credentials', 401);
      return t.token;
    }).finally(() => aDone());
    // B: read the OLD token before A's refresh, gets its 401 only after A is done.
    const b = withTrackerAuth(c, async (t) => {
      if (t.token === 'ghu_live') { await aFinished; throw new ProviderHttpError('Bad credentials', 401); }
      return t.token;
    });
    expect(await Promise.all([a, b])).toEqual(['ghu_new', 'ghu_new']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.map.github?.tokens.refreshToken).toBe('ghr_new');
  });

  it('a revoked refresh token → Needs reconnect; the next call asks nothing of GitHub (no loop)', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1 }));
    const fetchFn = vi.fn(async () => json({ error: 'bad_refresh_token', error_description: 'The refresh token passed is incorrect or expired.' }));
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    await expect(withTrackerAuth(c, async () => 'x')).rejects.toBeInstanceOf(ReconnectNeededError);
    expect(store.map.github?.needsReconnect).toBe(true);
    await expect(withTrackerAuth(c, async () => 'x')).rejects.toBeInstanceOf(ReconnectNeededError);
    await expect(withTrackerAuth(c, async () => 'x')).rejects.toBeInstanceOf(ReconnectNeededError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('an expired refresh token (6 months) → Needs reconnect without any request', async () => {
    const store = memStore(fresh({ expiresAt: NOW - 1, refreshExpiresAt: NOW - 1 }));
    const fetchFn = vi.fn();
    await expect(withTrackerAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }), async () => 'x'))
      .rejects.toBeInstanceOf(ReconnectNeededError);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(store.map.github?.needsReconnect).toBe(true);
  });

  it('a refreshed token that still gets 401 → Needs reconnect after one retry, no further refresh', async () => {
    const store = memStore(fresh());
    const fetchFn = vi.fn(async () => refreshReply());
    const c = ctx(store, { fetchFn: fetchFn as unknown as typeof fetch });
    await expect(withTrackerAuth(c, async () => { throw new ProviderHttpError('Bad credentials', 401); }))
      .rejects.toBeInstanceOf(ReconnectNeededError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.map.github?.needsReconnect).toBe(true);
  });
});

describe('a rotated refresh token is stored before anything else', () => {
  it('the write is the first storage call after GitHub answers (no read in between)', async () => {
    const log: string[] = [];
    const base = memStore(fresh({ expiresAt: NOW - 1 }));
    const store: AuthStorage = {
      async read() { log.push('read'); return base.read(); },
      async write(m) { log.push('write:' + (m.github?.tokens.refreshToken || '')); return base.write(m); },
    };
    const fetchFn = vi.fn(async () => { log.push('github'); return json({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800 }); });
    await resolveAuth(ctx(store, { fetchFn: fetchFn as unknown as typeof fetch }));
    const after = log.slice(log.indexOf('github') + 1);
    expect(after[0]).toBe('write:ghr_new');
  });
});
