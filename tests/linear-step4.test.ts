// Phase 13 step 4: Linear one-click sign-in (PKCE, public client) and
// attachments, with Linear's API stubbed. The client id is mocked here — the
// shipped one stays a placeholder until the owner pastes the real id.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../src/providers/oauth-clients', async (orig) => {
  const real = await orig<typeof import('../src/providers/oauth-clients')>();
  const OAUTH_CLIENTS = { ...real.OAUTH_CLIENTS, linear: 'lin_client_TEST' };
  return { ...real, OAUTH_CLIENTS, hasOAuthClient: (t: keyof typeof OAUTH_CLIENTS) => !!OAUTH_CLIENTS[t] && OAUTH_CLIENTS[t] !== real.TODO_OWNER_CLIENT_ID };
});

import { linear, uploadLinearFiles, linearDescription, revokeLinearToken, LINEAR_UPLOAD_ORIGINS, LINEAR_ATTACH_LIMITS } from '../src/providers/trackers';
import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '../src/providers/oauth';

afterEach(() => { vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const OAUTH = { via: 'oauth' as const, token: 'lin_oauth_ACCESS' };
const STORE = 'https://storage.googleapis.com';
const bytes = (n: number) => new Uint8Array(n).fill(7);
const TEAM = '9c7f2a1e-1111-4222-8333-444455556666';

/** Answer Linear GraphQL by what the query asks for; record everything. */
function linearStub(handlers: { graphql?: (q: string, v: Record<string, unknown>) => unknown; put?: (url: string, init: RequestInit) => Response }) {
  const calls: Array<{ url: string; init: RequestInit; query?: string; variables?: Record<string, unknown> }> = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const i = (init || {}) as RequestInit;
    if (url === 'https://api.linear.app/graphql') {
      const b = JSON.parse(String(i.body));
      calls.push({ url, init: i, query: b.query, variables: b.variables });
      return json({ data: handlers.graphql ? handlers.graphql(b.query, b.variables || {}) : {} });
    }
    calls.push({ url, init: i });
    if (handlers.put) return handlers.put(url, i);
    throw new Error('unrouted ' + url);
  });
  return { calls, spy };
}

describe('Linear sign-in (PKCE, no secret)', () => {
  it('offers PKCE with the client id, Linear\'s endpoints and read,write', () => {
    const c = linear.connect();
    expect(c).toMatchObject({ flow: 'pkce', hosts: ['https://api.linear.app/*'] });
    expect(c!.spec).toMatchObject({ clientId: 'lin_client_TEST', authorizeUrl: 'https://linear.app/oauth/authorize', tokenUrl: 'https://api.linear.app/oauth/token', scope: 'read,write' });
  });

  it('builds the authorize URL with an S256 challenge and state, no secret', () => {
    const u = new URL(buildAuthorizeUrl(linear.connect()!.spec, { redirectUri: 'https://ext.chromiumapp.org/', state: 'st8', challenge: 'chal' }));
    expect(u.origin + u.pathname).toBe('https://linear.app/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: 'lin_client_TEST', redirect_uri: 'https://ext.chromiumapp.org/', response_type: 'code',
      state: 'st8', code_challenge: 'chal', code_challenge_method: 'S256', scope: 'read,write',
    });
    expect(u.searchParams.has('client_secret')).toBe(false);
  });

  it('exchanges the code with the verifier and refreshes with only the client id (Linear: secret optional with PKCE)', async () => {
    const bodies: URLSearchParams[] = [];
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(new URLSearchParams(String(init?.body)));
      return json({ access_token: 'a1', refresh_token: 'r1', expires_in: 86399, token_type: 'Bearer' });
    }) as unknown as typeof fetch;
    const spec = linear.connect()!.spec;
    const t = await exchangeCode(spec, { code: 'c0de', verifier: 'v3r', redirectUri: 'https://ext.chromiumapp.org/' }, 0, f);
    expect(t).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', expiresAt: 86_399_000 });
    expect(Object.fromEntries(bodies[0])).toMatchObject({ grant_type: 'authorization_code', code: 'c0de', code_verifier: 'v3r', client_id: 'lin_client_TEST' });
    await refreshTokens(spec, 'r1', 0, f);
    expect(Object.fromEntries(bodies[1])).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r1', client_id: 'lin_client_TEST' });
    expect(bodies.every((b) => !b.has('client_secret'))).toBe(true);
  });

  it('revokes on Disconnect with the token alone (form post, no secret)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    expect(await revokeLinearToken('r1', 'refresh_token')).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.linear.app/oauth/revoke');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({ token: 'r1', token_type_hint: 'refresh_token' });
  });

  it('a failed revoke never throws (the local sign-in is gone either way)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await revokeLinearToken('a1', 'access_token')).toBe(false);
  });
});

describe('Linear fields', () => {
  it('lists team + workspace labels, active members, priority, open projects', async () => {
    const { calls } = linearStub({
      graphql: () => ({
        team: {
          members: { nodes: [{ id: 'u1', displayName: 'ana', active: true }, { id: 'u2', displayName: 'gone', active: false }] },
          projects: { nodes: [{ id: 'p1', name: 'Web' }, { id: 'p2', name: 'Old', completedAt: '2025-01-01' }] },
        },
        issueLabels: { nodes: [{ id: 'l1', name: 'Bug' }, { id: 'l2', name: 'ui' }] },
      }),
    });
    const fields = await linear.listFields(OAUTH, TEAM);
    expect(fields.map((f) => [f.key, f.kind])).toEqual([['labels', 'multi'], ['assignee', 'single'], ['priority', 'single'], ['project', 'single']]);
    expect(fields[0].options).toEqual([{ id: 'l1', label: 'Bug' }, { id: 'l2', label: 'ui' }]);
    expect(fields[1].options).toEqual([{ id: 'u1', label: 'ana' }]);
    expect(fields[2].options.map((o) => o.id)).toEqual(['1', '2', '3', '4']);
    expect(fields[3].options).toEqual([{ id: 'p1', label: 'Web' }]);
    expect(calls[0].variables).toEqual({ team: TEAM });
    expect(calls[0].query).toContain('{ team: { null: true } }');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer lin_oauth_ACCESS');
  });

  it('never queries for a team id that isn\'t one', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await linear.listFields(OAUTH, '") { x }')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('files with the picked labels, assignee, priority and project — malformed ids dropped', async () => {
    const { calls } = linearStub({
      graphql: () => ({ issueCreate: { success: true, issue: { url: 'https://linear.app/acme/issue/ENG-7', identifier: 'ENG-7' } } }),
    });
    const r = await linear.createIssue(OAUTH, TEAM, { labels: ['l1', 'bad id!'], assignee: 'u1', priority: '2', project: 'p1' },
      { title: 'T', body: 'B', sendId: '6f1c2a4e-9b3d-4c8e-a1f2-0d9e8c7b6a51' });
    expect(r).toMatchObject({ ref: 'ENG-7', attached: 0 });
    const input = calls[0].variables!.input as Record<string, unknown>;
    expect(input).toMatchObject({ teamId: TEAM, title: 'T', description: 'B', labelIds: ['l1'], assigneeId: 'u1', priority: 2, projectId: 'p1', id: '6f1c2a4e-9b3d-4c8e-a1f2-0d9e8c7b6a51' });
  });

  it('leaves priority out when none is picked', async () => {
    const { calls } = linearStub({ graphql: () => ({ issueCreate: { success: true, issue: { url: 'https://linear.app/x/issue/E-1', identifier: 'E-1' } } }) });
    await linear.createIssue(OAUTH, TEAM, {}, { title: 'T', body: 'B' });
    expect((calls[0].variables!.input as Record<string, unknown>).priority).toBeUndefined();
  });
});

describe('Linear attachments', () => {
  const gqlUpload = (n: number) => (q: string, v: Record<string, unknown>) => {
    if (q.includes('fileUpload')) {
      return { fileUpload: { success: true, uploadFile: {
        uploadUrl: `${STORE}/linear-uploads/${n}/${v.filename}?sig=1`,
        assetUrl: `https://uploads.linear.app/a/b/${v.filename}`,
        headers: [{ key: 'x-goog-content-length-range', value: `${v.size},${v.size}` }],
      } } };
    }
    return { issueCreate: { success: true, issue: { url: 'https://linear.app/acme/issue/ENG-8', identifier: 'ENG-8' } } };
  };

  it('ships with no upload origin until the owner confirms it — files are reported, the issue is filed', async () => {
    expect(LINEAR_UPLOAD_ORIGINS).toEqual([]);
    const { calls } = linearStub({ graphql: gqlUpload(1) });
    const r = await linear.createIssue(OAUTH, TEAM, {}, { title: 'T', body: 'B', attachments: [{ name: 'shot.png', type: 'image/png', data: bytes(10) }] });
    expect(r.ref).toBe('ENG-8');
    expect(r.notAttached).toEqual([{ name: 'shot.png', reason: "attachments to Linear aren't set up yet" }]);
    expect(calls.some((c) => c.query && c.query.includes('fileUpload'))).toBe(false);
  });

  it('asks Linear for a signed upload, PUTs the exact bytes with its headers, and links the asset', async () => {
    const { calls } = linearStub({ graphql: gqlUpload(1), put: () => new Response('', { status: 200 }) });
    const up = await uploadLinearFiles(OAUTH, [
      { name: 'shot.png', type: 'image/png', data: bytes(1234) },
      { name: 'report.html', type: 'text/html', data: bytes(50) },
    ], undefined, [STORE]);
    expect(up.failed).toEqual([]);
    expect(up.links).toEqual([
      { name: 'shot.png', type: 'image/png', url: 'https://uploads.linear.app/a/b/shot.png' },
      { name: 'report.html', type: 'text/html', url: 'https://uploads.linear.app/a/b/report.html' },
    ]);
    const ask = calls.find((c) => c.query && c.query.includes('fileUpload'))!;
    expect(ask.variables).toEqual({ contentType: 'image/png', filename: 'shot.png', size: 1234 });
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url.startsWith(`${STORE}/linear-uploads/`)).toBe(true);
    const h = put.init.headers as Record<string, string>;
    expect(h['content-type']).toBe('image/png');
    expect(h['x-goog-content-length-range']).toBe('1234,1234');
    expect((put.init.body as Blob).size).toBe(1234);
    expect(linearDescription('Body', up.links)).toBe(
      'Body\n\n**Attachments**\n\n![shot.png](https://uploads.linear.app/a/b/shot.png)\n[report.html](https://uploads.linear.app/a/b/report.html)');
  });

  it('refuses an upload address outside the approved origin', async () => {
    const { calls } = linearStub({ graphql: gqlUpload(1), put: () => new Response('', { status: 200 }) });
    const up = await uploadLinearFiles(OAUTH, [{ name: 'shot.png', type: 'image/png', data: bytes(5) }], undefined, ['https://elsewhere.test']);
    expect(up.failed).toEqual([{ name: 'shot.png', reason: 'unexpected upload address' }]);
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
  });

  it('skips a file over the cap and keeps going', async () => {
    linearStub({ graphql: gqlUpload(1), put: () => new Response('', { status: 200 }) });
    const up = await uploadLinearFiles(OAUTH, [
      { name: 'huge.html', type: 'text/html', data: bytes(LINEAR_ATTACH_LIMITS.fileBytes + 1) },
      { name: 'shot.png', type: 'image/png', data: bytes(5) },
    ], undefined, [STORE]);
    expect(up.failed[0]).toMatchObject({ name: 'huge.html' });
    expect(up.failed[0].reason).toMatch(/too large/);
    expect(up.links.map((l) => l.name)).toEqual(['shot.png']);
  });

  it('a refused upload still files the issue and says what wasn\'t attached', async () => {
    const { calls } = linearStub({ graphql: gqlUpload(1), put: () => new Response('denied', { status: 403 }) });
    const files = [{ name: 'shot.png', type: 'image/png', data: bytes(5) }];
    const up = await uploadLinearFiles(OAUTH, files, undefined, [STORE]);
    expect(up.failed).toEqual([{ name: 'shot.png', reason: 'upload refused (HTTP 403)' }]);
    expect(up.links).toEqual([]);
    expect(calls.filter((c) => c.init.method === 'PUT')).toHaveLength(1);
  });

  it('keeps the description within Linear\'s limit with the links at the end', () => {
    const d = linearDescription('x'.repeat(70_000), [{ name: 'a.png', type: 'image/png', url: 'https://uploads.linear.app/a.png' }]);
    expect(d.length).toBeLessThanOrEqual(65536);
    expect(d.endsWith('![a.png](https://uploads.linear.app/a.png)')).toBe(true);
  });
});

// The worker's gate for what the page may send as files.
const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const sandbox: Record<string, unknown> = { URL };
runInContext(readFileSync(join(extDir, 'provider-bridge.js'), 'utf8'), createContext(sandbox));
const B = (sandbox as { TraceBugProviderBridge: {
  validatePayload: (t: string, p: unknown) => { ok: boolean; error?: string; payload?: { attachments?: unknown[] } };
} }).TraceBugProviderBridge;

describe('attachments from the page (provider-bridge.js)', () => {
  const ok = { name: 'shot.png', type: 'image/png', data: 'AAAA' };
  it('accepts screenshots and the report for GitHub and Linear, rebuilt', () => {
    const r = B.validatePayload('linear', { title: 'T', body: 'B', attachments: [ok, { name: 'tracebug-report-1.html', type: 'text/html', data: 'PGh0bWw+' }] });
    expect(r.ok).toBe(true);
    expect(r.payload!.attachments).toHaveLength(2);
    expect(B.validatePayload('github', { title: 'T', body: 'B', attachments: [ok] }).ok).toBe(true);
  });
  it('refuses them for Slack and the AI', () => {
    expect(B.validatePayload('slack', { text: 'x', attachments: [ok] }).ok).toBe(false);
    expect(B.validatePayload('llm', { prompt: 'x', attachments: [ok] }).ok).toBe(false);
  });
  it('refuses odd names, types, extra keys, non-base64 and too many', () => {
    const bad = [
      { ...ok, name: '../../x.png' },
      { ...ok, name: 'x.exe' },
      { ...ok, type: 'application/octet-stream' },
      { ...ok, name: 'x.html' },
      { ...ok, data: 'not base64!' },
      { ...ok, extra: 1 },
    ];
    for (const a of bad) expect(B.validatePayload('linear', { title: 'T', body: 'B', attachments: [a] }).ok).toBe(false);
    expect(B.validatePayload('linear', { title: 'T', body: 'B', attachments: Array(7).fill(ok) }).ok).toBe(false);
  });
  it('refuses a file over 20 MB', () => {
    const big = 'A'.repeat(Math.ceil((20 * 1024 * 1024 + 3) / 3) * 4);
    expect(B.validatePayload('linear', { title: 'T', body: 'B', attachments: [{ ...ok, data: big }] }).error).toMatch(/too large/);
  });
});
