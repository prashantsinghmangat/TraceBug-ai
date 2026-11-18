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
