// ADR 010: OAuth for public clients — PKCE and the device flow
// (src/providers/oauth.ts). The one rule underneath every test here: no
// request ever carries a client secret, because TraceBug has none.
import { describe, it, expect, vi } from 'vitest';
import {
  pkceChallenge, createPkcePair, buildAuthorizeUrl, parseRedirect, parseTokenResponse,
  exchangeCode, refreshTokens, requestDeviceCode, pollDeviceToken, OAuthError, describeOAuthError,
  type OAuthSpec,
} from '../src/providers/oauth';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const SPEC: OAuthSpec = {
  label: 'Acme',
  clientId: 'cid_123',
  tokenUrl: 'https://acme.test/oauth/token',
  deviceCodeUrl: 'https://acme.test/device/code',
  authorizeUrl: 'https://acme.test/oauth/authorize',
  scope: 'read write',
};

/** A fetch mock that records every form body it was sent. */
function formFetch(...responses: Response[]) {
  const bodies: URLSearchParams[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(new URLSearchParams(String(init?.body ?? '')));
    const r = responses.shift();
    if (!r) throw new Error('unexpected fetch');
    return r;
  });
  return { fn: fn as unknown as typeof fetch, bodies, calls: fn.mock.calls };
}

describe('PKCE', () => {
  it('computes the RFC 7636 appendix B challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))
      .toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('makes a fresh verifier inside the RFC length range each time', async () => {
    const a = await createPkcePair();
    const b = await createPkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.challenge).toBe(await pkceChallenge(a.verifier));
  });

  it('builds an authorize URL with S256, state and redirect — and no secret', () => {
    const u = new URL(buildAuthorizeUrl(SPEC, { redirectUri: 'https://x.chromiumapp.org/', state: 'st', challenge: 'ch' }));
    expect(u.origin + u.pathname).toBe('https://acme.test/oauth/authorize');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBe('ch');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe('https://x.chromiumapp.org/');
    expect(u.searchParams.get('scope')).toBe('read write');
    expect(u.searchParams.has('client_secret')).toBe(false);
  });

  it('accepts a redirect only with the state it sent', () => {
    expect(parseRedirect('https://x.chromiumapp.org/?code=abc&state=st', 'st', 'Acme')).toBe('abc');
    expect(() => parseRedirect('https://x.chromiumapp.org/?code=abc&state=evil', 'st', 'Acme'))
      .toThrow(/could not be verified/);
    expect(() => parseRedirect('https://x.chromiumapp.org/?state=st', 'st', 'Acme')).toThrow(/did not return a code/);
  });

  it('turns a declined consent into a sentence, not a code', () => {
    try {
      parseRedirect('https://x.chromiumapp.org/?error=access_denied&state=st', 'st', 'Acme');
      throw new Error('no throw');
    } catch (e) {
      expect(e).toBeInstanceOf(OAuthError);
      expect((e as OAuthError).code).toBe('access_denied');
      expect((e as Error).message).toMatch(/declined access in Acme/);
    }
  });
});

describe('token endpoint', () => {
  it('stores absolute expiry times', () => {
    const t = parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600, refresh_token_expires_in: 60 }, 1000, 'Acme');
    expect(t).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3600_000, refreshExpiresAt: 1000 + 60_000 });
  });

  it('exchanges a code with the verifier and no secret', async () => {
    const f = formFetch(json({ access_token: 'acc', refresh_token: 'ref', expires_in: 10 }));
    const t = await exchangeCode(SPEC, { code: 'c', verifier: 'v', redirectUri: 'https://x/' }, 0, f.fn);
    expect(t.accessToken).toBe('acc');
    const b = f.bodies[0];
    expect(b.get('grant_type')).toBe('authorization_code');
    expect(b.get('code_verifier')).toBe('v');
    expect(b.get('client_id')).toBe('cid_123');
    expect(b.has('client_secret')).toBe(false);
    expect((f.calls[0][1] as RequestInit).headers).toMatchObject({ accept: 'application/json' });
  });

  it('keeps the old refresh token when the vendor does not rotate', async () => {
    const f = formFetch(json({ access_token: 'new', expires_in: 10 }));
    const t = await refreshTokens(SPEC, 'old-rt', 0, f.fn);
    expect(t).toMatchObject({ accessToken: 'new', refreshToken: 'old-rt' });
    expect(f.bodies[0].get('grant_type')).toBe('refresh_token');
    expect(f.bodies[0].has('client_secret')).toBe(false);
  });

  it('takes the rotated refresh token when there is one', async () => {
    const f = formFetch(json({ access_token: 'new', refresh_token: 'rotated' }));
    expect((await refreshTokens(SPEC, 'old', 0, f.fn)).refreshToken).toBe('rotated');
  });

  it('names an invalid_grant so the store can mark Reconnect', async () => {
    const f = formFetch(json({ error: 'invalid_grant' }, 400));
    await expect(refreshTokens(SPEC, 'rt', 0, f.fn)).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('reports a non-OAuth HTTP failure with its status', async () => {
    const f = formFetch(new Response('nope', { status: 503 }));
    await expect(refreshTokens(SPEC, 'rt', 0, f.fn)).rejects.toMatchObject({ status: 503 });
  });
});

describe('device flow', () => {
  const CODE = { deviceCode: 'dc', interval: 5, expiresAt: 900_000 };

  it('requests a code with only the client id (no secret)', async () => {
    const f = formFetch(json({ device_code: 'dc', user_code: 'ABCD-1234', verification_uri: 'https://acme.test/device', interval: 5, expires_in: 900 }));
    const d = await requestDeviceCode(SPEC, 0, f.fn);
    expect(d).toEqual({ deviceCode: 'dc', userCode: 'ABCD-1234', verificationUri: 'https://acme.test/device', interval: 5, expiresAt: 900_000 });
    expect([...f.bodies[0].keys()].sort()).toEqual(['client_id', 'scope']);
  });

  it('keeps polling on authorization_pending at the same interval', async () => {
    const f = formFetch(json({ error: 'authorization_pending' }));
    expect(await pollDeviceToken(SPEC, CODE, 1000, f.fn)).toEqual({ status: 'pending', interval: 5 });
    expect(f.bodies[0].get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
    expect(f.bodies[0].has('client_secret')).toBe(false);
  });

  it('adds 5 s on slow_down (RFC 8628 §3.5)', async () => {
    const f = formFetch(json({ error: 'slow_down' }));
    expect(await pollDeviceToken(SPEC, CODE, 1000, f.fn)).toEqual({ status: 'pending', interval: 10 });
  });

  it('uses the server interval on slow_down when it is longer', async () => {
    const f = formFetch(json({ error: 'slow_down', interval: 20 }));
    expect(await pollDeviceToken(SPEC, CODE, 1000, f.fn)).toEqual({ status: 'pending', interval: 20 });
  });

  it('stops with a clear message when the code expired', async () => {
    const f = formFetch(json({ error: 'expired_token' }));
    await expect(pollDeviceToken(SPEC, CODE, 1000, f.fn)).rejects.toThrow(/expired before it was entered/);
    // …and does not even ask once the local deadline has passed.
    const g = formFetch();
    await expect(pollDeviceToken(SPEC, CODE, 900_000, g.fn)).rejects.toMatchObject({ code: 'expired_token' });
    expect(g.calls).toHaveLength(0);
  });

  it('says the user declined on access_denied', async () => {
    const f = formFetch(json({ error: 'access_denied' }));
    await expect(pollDeviceToken(SPEC, CODE, 1000, f.fn)).rejects.toThrow(/declined access/);
  });

  it('ends the code with a named, coded OAuthError — and a network failure is not one (the worker keeps polling)', async () => {
    for (const code of ['access_denied', 'expired_token']) {
      const f = formFetch(json({ error: code }));
      await expect(pollDeviceToken(SPEC, CODE, 1000, f.fn)).rejects.toMatchObject({ name: 'OAuthError', code });
    }
    const offline = async () => { throw new TypeError('Failed to fetch'); };
    await expect(pollDeviceToken(SPEC, CODE, 1000, offline as unknown as typeof fetch))
      .rejects.toSatisfy((e: Error) => e.name !== 'OAuthError');
  });

  it('returns the tokens when the user approved', async () => {
    const f = formFetch(json({ access_token: 'ghu_x', refresh_token: 'ghr_y', expires_in: 28800 }));
    const r = await pollDeviceToken(SPEC, CODE, 0, f.fn);
    expect(r).toEqual({ status: 'done', tokens: { accessToken: 'ghu_x', refreshToken: 'ghr_y', expiresAt: 28_800_000 } });
  });

  it('explains a disabled device flow instead of failing vaguely', () => {
    expect(describeOAuthError('device_flow_disabled', 'GitHub')).toMatch(/Use a token/);
  });
});
