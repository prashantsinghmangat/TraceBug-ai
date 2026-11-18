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
    const page = Array.from({ length: 100 }, (_, i) => ({ full_name: `o/r${i}` }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      json(page, 200, { link: '<https://api.github.com/user/repos?page=n>; rel="next"' }));
    expect((await github.listContainers(PAT)).length).toBe(MAX_CONTAINERS);
  });

  it('loads labels as a multi-select field with the push-access note', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json([{ name: 'bug' }, { name: 'ui' }]));
    const [f] = await github.listFields(PAT, 'acme/web');
    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/repos/acme/web/labels?per_page=100');
    expect(f).toMatchObject({ key: 'labels', kind: 'multi', options: [{ id: 'bug', label: 'bug' }, { id: 'ui', label: 'ui' }] });
    expect(f.note).toMatch(/push/);
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

  it('carries the HTTP status on failure, so the store can tell a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ message: 'Bad credentials' }, 401));
    await expect(github.listContainers(PAT)).rejects.toMatchObject({ status: 401 });
  });

  it('offers no Connect until the owner registers the app', () => {
    expect(github.connect()).toBeNull();
    expect(linear.connect()).toBeNull();
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
