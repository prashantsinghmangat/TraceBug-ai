// ADR 010: the common tracker interface (src/providers/trackers.ts) — what the
// Create panel lists and how an issue is filed, with fetch mocked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { github, linear, nextLink, isTrustedIssueUrl, trackerAdapter, MAX_CONTAINERS } from '../src/providers/trackers';
import { PROVIDER_BODY_LIMITS } from '../src/providers/api';

afterEach(() => { vi.restoreAllMocks(); });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const PAT = { via: 'token' as const, token: 'ghp_PAT' };
const OAUTH = { via: 'oauth' as const, token: 'tok_OAUTH' };

describe('nextLink', () => {
  it('finds rel="next" among several links', () => {
    expect(nextLink('<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=9>; rel="last"'))
      .toBe('https://api.github.com/x?page=2');
    expect(nextLink('<https://api.github.com/x?page=1>; rel="prev"')).toBeNull();
    expect(nextLink(null)).toBeNull();
  });
});

describe('GitHub', () => {
  it('lists repos across pages, skipping archived ones', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([{ full_name: 'a/one', private: true }, { full_name: 'a/old', archived: true }], 200,
        { link: '<https://api.github.com/user/repos?page=2>; rel="next"' }))
      .mockResolvedValueOnce(json([{ full_name: 'b/two' }]));
    const items = await github.listContainers(PAT);
    expect(items).toEqual([{ id: 'a/one', label: 'a/one', detail: 'private' }, { id: 'b/two', label: 'b/two', detail: undefined }]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer ghp_PAT' });
  });

  it('never follows a Link header off the API host', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([{ full_name: 'a/one' }], 200, { link: '<https://evil.test/steal>; rel="next"' }));
    await github.listContainers(PAT);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it(`stops at ${MAX_CONTAINERS} repos`, async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(Array.from({ length: 100 }, () => ({ full_name: `o/r${n++}` })), 200,
        { link: '<https://api.github.com/user/repos?page=n>; rel="next"' }));
    expect((await github.listContainers(PAT)).length).toBe(MAX_CONTAINERS);
  });

  /** Answers by URL, so parallel field requests don't depend on call order. */
  function byUrl(routes: Record<string, () => Response>) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const hit = Object.keys(routes).find((k) => url.includes(k));
      if (!hit) throw new Error('unrouted ' + url);
      return routes[hit]();
    });
  }

  it('loads labels, assignee and milestone fields; no push note when the user can push', async () => {
    const spy = byUrl({
      '/labels': () => json([{ name: 'bug' }, { name: 'ui' }]),
      '/assignees': () => json([{ login: 'octo' }, { login: 'hubot' }]),
      '/milestones': () => json([{ number: 3, title: 'v2' }]),
      'repos/acme/web': () => json({ permissions: { push: true } }),
    });
    const fields = await github.listFields(PAT, 'acme/web');
    expect(spy.mock.calls.map((c) => String(c[0]))).toContain('https://api.github.com/repos/acme/web/labels?per_page=100');
    expect(fields.map((f) => [f.key, f.kind])).toEqual([['labels', 'multi'], ['assignee', 'single'], ['milestone', 'single']]);
    expect(fields[0].options).toEqual([{ id: 'bug', label: 'bug' }, { id: 'ui', label: 'ui' }]);
    expect(fields[2].options).toEqual([{ id: '3', label: 'v2' }]);
    expect(fields.some((f) => f.note)).toBe(false);
  });

  it('adds the push note only when the repo says the user cannot push', async () => {
    byUrl({
      '/labels': () => json([{ name: 'bug' }]),
      '/assignees': () => json([]),
      '/milestones': () => json([]),
      'repos/acme/web': () => json({ permissions: { push: false } }),
    });
    const fields = await github.listFields(PAT, 'acme/web');
    expect(fields[fields.length - 1].note).toMatch(/push/);
  });

  it('no push note when the permission is unknown (repo lookup failed)', async () => {
    byUrl({
      '/labels': () => json([{ name: 'bug' }]),
      '/assignees': () => json([]),
      '/milestones': () => json([]),
    });
    const fields = await github.listFields(PAT, 'acme/web');
    expect(fields.some((f) => f.note)).toBe(false);
  });

  it('finds an issue it already filed by its hidden marker', async () => {
    const spy = byUrl({
      '/issues?': () => json([
        { number: 7, html_url: 'https://github.com/acme/web/issues/7', body: 'other' },
        { number: 6, html_url: 'https://github.com/acme/web/issues/6', body: 'x\n\n<!-- tracebug:req_1 -->' },
      ]),
    });
    const hit = await github.findIssueByMarker!(OAUTH, 'acme/web', 'tracebug:req_1');
    expect(hit).toMatchObject({ url: 'https://github.com/acme/web/issues/6', ref: '#6' });
    expect(String(spy.mock.calls[0][0])).toContain('/repos/acme/web/issues?state=all&sort=created&direction=desc');
    expect(await github.findIssueByMarker!(OAUTH, 'acme/web', 'tracebug:nope')).toBeNull();
  });

  it('refuses a malformed marker or repo without a request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await github.findIssueByMarker!(OAUTH, 'acme/web', 'tracebug:<x>')).toBeNull();
    expect(await github.findIssueByMarker!(OAUTH, '../../x', 'tracebug:ok')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves out assignees/milestones the user may not list (403), keeps labels', async () => {
    byUrl({
      '/labels': () => json([{ name: 'bug' }]),
      '/assignees': () => json({ message: 'Must have push access' }, 403),
      '/milestones': () => json({ message: 'Not Found' }, 404),
    });
    const fields = await github.listFields(PAT, 'acme/web');
    expect(fields.map((f) => f.key)).toEqual(['labels']);
  });

  it('still fails loudly when the token is rejected', async () => {
    byUrl({
      '/labels': () => json({ message: 'Bad credentials' }, 401),
      '/assignees': () => json({ message: 'Bad credentials' }, 401),
      '/milestones': () => json([]),
    });
    await expect(github.listFields(PAT, 'acme/web')).rejects.toMatchObject({ status: 401 });
  });

  it('with a GitHub App sign-in, lists repos from the app installations', async () => {
    const spy = byUrl({
      '/user/installations?': () => json({ total_count: 2, installations: [{ id: 11 }, { id: 22 }] }),
      '/user/installations/11/repositories': () => json({ total_count: 1, repositories: [{ full_name: 'me/app', private: true }] }),
      '/user/installations/22/repositories': () => json({ total_count: 2, repositories: [{ full_name: 'org/site' }, { full_name: 'me/app' }] }),
    });
    const items = await github.listContainers(OAUTH);
    expect(items).toEqual([
      { id: 'me/app', label: 'me/app', detail: 'private' },
      { id: 'org/site', label: 'org/site', detail: undefined },
    ]);
    expect(spy.mock.calls.some((c) => String(c[0]).includes('/user/repos'))).toBe(false);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok_OAUTH' });
  });

  it('files the picked assignee and milestone number', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ html_url: 'https://github.com/acme/web/issues/8', number: 8 }));
    await github.createIssue(OAUTH, 'acme/web', { labels: [], assignee: 'octo', milestone: '3' }, { title: 'T', body: 'B' });
    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.assignees).toEqual(['octo']);
    expect(sent.milestone).toBe(3);
    expect(sent.labels).toBeUndefined();
  });

  it('never sends a non-numeric milestone', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ html_url: 'https://github.com/a/b/issues/1', number: 1 }));
    await github.createIssue(OAUTH, 'a/b', { milestone: 'v2; drop' }, { title: 'T', body: 'B' });
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).milestone).toBeUndefined();
  });

  it('refuses to build a URL from a malformed repo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect(await github.listFields(PAT, '../../user')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('files with the picked repo and labels, body capped', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ html_url: 'https://github.com/acme/web/issues/7', number: 7 }));
    const r = await github.createIssue(OAUTH, 'acme/web', { labels: ['bug', 'ui'] },
      { title: 'T', body: 'x'.repeat(PROVIDER_BODY_LIMITS.github + 50) });
    expect(r).toMatchObject({ provider: 'github', url: 'https://github.com/acme/web/issues/7', ref: '#7' });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/acme/web/issues');
    const sent = JSON.parse(String(init.body));
    expect(sent.labels).toEqual(['bug', 'ui']);
    expect(sent.body.length).toBeLessThanOrEqual(PROVIDER_BODY_LIMITS.github);
  });

  it('ends the body with the hidden marker, still within the limit', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ html_url: 'https://github.com/acme/web/issues/8', number: 8 }))
      .mockResolvedValueOnce(json({ html_url: 'https://github.com/acme/web/issues/9', number: 9 }));
    await github.createIssue(OAUTH, 'acme/web', {}, { title: 'T', body: 'hello', marker: 'tracebug:req_1' });
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).body).toBe('hello\n\n<!-- tracebug:req_1 -->');
    await github.createIssue(OAUTH, 'acme/web', {},
      { title: 'T', body: 'x'.repeat(PROVIDER_BODY_LIMITS.github + 50), marker: 'tracebug:req_2' });
    const long = JSON.parse(String((spy.mock.calls[1][1] as RequestInit).body)).body as string;
    expect(long.length).toBeLessThanOrEqual(PROVIDER_BODY_LIMITS.github);
    expect(long.endsWith('<!-- tracebug:req_2 -->')).toBe(true);
  });

  it('carries the HTTP status on failure, so the store can tell a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: 'Bad credentials' }, 401));
    await expect(github.listContainers(PAT)).rejects.toMatchObject({ status: 401 });
  });

  it('offers device-flow Connect for GitHub with no secret, and none for Linear yet', () => {
    const c = github.connect();
    expect(c).not.toBeNull();
    expect(c!.flow).toBe('device');
    expect(c!.spec.clientId).toMatch(/^Iv23/);
    expect(c!.spec.deviceCodeUrl).toBe('https://github.com/login/device/code');
    expect(JSON.stringify(c)).not.toMatch(/secret/i);
    expect(c!.hosts).toEqual(['https://github.com/*', 'https://api.github.com/*']);
    expect(linear.connect()).toBeNull();
  });

  it('every host Connect requests is declared as an optional host permission', async () => {
    const { readFileSync } = await import('node:fs');
    const base = JSON.parse(readFileSync('tracebug-extension/build/manifest.base.json', 'utf8'));
    const dev = JSON.parse(readFileSync('tracebug-extension/manifest.json', 'utf8'));
    for (const h of github.connect()!.hosts) {
      expect(base.optional_host_permissions).toContain(h);
      expect(dev.optional_host_permissions).toContain(h);
    }
    expect(base.host_permissions ?? []).not.toContain('https://github.com/*');
  });
});

describe('Linear', () => {
  it('sends a pasted API key verbatim and an OAuth token as Bearer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: { teams: { nodes: [{ id: 't1', key: 'ENG', name: 'Engineering' }] } } }))
      .mockResolvedValueOnce(json({ data: { teams: { nodes: [] } } }));
    expect(await linear.listContainers({ via: 'token', token: 'lin_api_x' }))
      .toEqual([{ id: 't1', label: 'Engineering', detail: 'ENG' }]);
    await linear.listContainers(OAUTH);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'lin_api_x' });
    expect((spy.mock.calls[1][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok_OAUTH' });
  });

  it('surfaces a GraphQL error sent with a 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ errors: [{ message: 'Authentication required' }] }));
    await expect(linear.listContainers(PAT)).rejects.toThrow('Authentication required');
  });

  it('files into the picked team', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({
      data: { issueCreate: { success: true, issue: { url: 'https://linear.app/acme/issue/ENG-1', identifier: 'ENG-1' } } },
    }));
    const r = await linear.createIssue(OAUTH, 't1', {}, { title: 'T', body: 'B' });
    expect(r).toMatchObject({ url: 'https://linear.app/acme/issue/ENG-1', ref: 'ENG-1' });
    const sent = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(sent.variables.input).toMatchObject({ teamId: 't1', title: 'T', description: 'B' });
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok_OAUTH' });
  });
});

describe('opening the created issue', () => {
  it('opens only https URLs on the tracker\'s own host', () => {
    expect(isTrustedIssueUrl('github', 'https://github.com/a/b/issues/1')).toBe(true);
    expect(isTrustedIssueUrl('linear', 'https://linear.app/a/issue/X-1')).toBe(true);
    expect(isTrustedIssueUrl('github', 'http://github.com/a/b/issues/1')).toBe(false);
    expect(isTrustedIssueUrl('github', 'https://github.com.evil.test/x')).toBe(false);
    expect(isTrustedIssueUrl('github', 'javascript:alert(1)')).toBe(false);
    expect(isTrustedIssueUrl('linear', 'https://github.com/a/b/issues/1')).toBe(false);
  });

  it('looks adapters up by own property only', () => {
    expect(trackerAdapter('github')).toBe(github);
    expect(trackerAdapter('constructor')).toBeNull();
    expect(trackerAdapter('slack')).toBeNull();
  });
});

describe('the new token shapes are redacted from captured text (ADR 010)', () => {
  it('masks GitHub App user/refresh tokens and Linear OAuth tokens', async () => {
    const { sanitizeTokenShapes } = await import('../src/sanitize/cloud-upload');
    const ghu = 'ghu_' + 'A1b2C3d4'.repeat(5);
    const ghr = 'ghr_' + 'Z9y8X7w6'.repeat(9);
    const lin = 'lin_oauth_' + 'f0e1d2c3'.repeat(8);
    const out = sanitizeTokenShapes(`token=${ghu} refresh=${ghr} linear ${lin}`);
    for (const t of [ghu, ghr, lin]) expect(out).not.toContain(t);
  });
});
