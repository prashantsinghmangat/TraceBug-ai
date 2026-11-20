// GitHub hardening (first tracker release): single sign-on, Issues turned off
// or archived, and rate limits — each becomes a plain message the user can act
// on, from GitHub's own headers. The adapter and api.ts run against a stubbed
// fetch, the way the worker runs them.
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  postGitHubIssue, githubSpecialError, isGitHubPageUrl, localHHMM,
  GitHubSsoError, GitHubRateLimitError, mapProviderError,
} from '../src/providers/api';
import { github } from '../src/providers/trackers';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const auth = { via: 'oauth' as const, token: 'ghu_test' };
const create = () => postGitHubIssue({ token: 'ghu_test', repo: 'acme/api' }, { title: 't', body: 'b' });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('SAML single sign-on', () => {
  const SSO = 'https://github.com/orgs/acme/sso?authorization_request=AbC123';

  it('"required; url=…" → GitHubSsoError with the org and GitHub\'s own link', () => {
    const e = githubSpecialError(reply(403, { message: 'Resource protected by organization SAML enforcement.' }, { 'x-github-sso': `required; url=${SSO}` }), {});
    expect(e).toBeInstanceOf(GitHubSsoError);
    expect((e as GitHubSsoError).url).toBe(SSO);
    expect((e as GitHubSsoError).org).toBe('acme');
    expect(e!.message).toMatch(/^Authorise TraceBug for acme/);
  });

  it('a link that isn\'t https://github.com/… is refused (no URL kept)', () => {
    for (const bad of ['https://evil.example/orgs/acme/sso', 'http://github.com/orgs/acme/sso', 'https://github.com.evil.example/x', 'javascript:alert(1)']) {
      const e = githubSpecialError(reply(403, {}, { 'x-github-sso': `required; url=${bad}` }), {}) as GitHubSsoError;
      expect(e).toBeInstanceOf(GitHubSsoError);
      expect(e.url).toBe('');
      expect(isGitHubPageUrl(bad)).toBe(false);
    }
    expect(isGitHubPageUrl(SSO)).toBe(true);
  });

  it('a Create blocked by SSO throws the SSO error — nothing is filed', async () => {
    const f = vi.fn(async () => reply(403, { message: 'Resource protected by organization SAML enforcement.' }, { 'x-github-sso': `required; url=${SSO}` }));
    vi.stubGlobal('fetch', f);
    const err = await create().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubSsoError);
    expect(mapProviderError(err, 'GitHub')).toMatch(/Authorise TraceBug for acme/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('"partial-results; organizations=…" keeps the list and adds an authorise link per org', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/user/installations?')) return reply(200, { installations: [{ id: 7 }] }, { 'x-github-sso': 'partial-results; organizations=21955855' });
      if (url.includes('/user/installations/7/repositories')) return reply(200, { repositories: [{ full_name: 'me/app' }] });
      if (url.endsWith('/organizations/21955855')) return reply(200, { login: 'acme' });
      return reply(404, {});
    }));
    const list = await github.listContainers(auth) as Awaited<ReturnType<typeof github.listContainers>> & { ssoPartial?: unknown };
    expect(list.map((c) => c.id)).toEqual(['me/app']);
    expect(list.ssoPartial).toEqual([{ org: 'acme', url: 'https://github.com/orgs/acme/sso' }]);
  });
});

describe('repositories that can\'t take issues', () => {
  it('archived and Issues-off repositories stay listed, marked unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, [
      { full_name: 'acme/live' },
      { full_name: 'acme/old', archived: true },
      { full_name: 'acme/noissues', has_issues: false },
    ])));
    const list = await github.listContainers({ via: 'token', token: 'ghp_x' });
    expect(list.map((c) => [c.id, c.unavailable || ''])).toEqual([
      ['acme/live', ''], ['acme/old', 'Archived'], ['acme/noissues', 'Issues are turned off'],
    ]);
  });

  it('Create on a repo with Issues turned off (410) says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(410, { message: 'Issues are disabled for this repo' })));
    await expect(create()).rejects.toThrow('Issues are turned off in acme/api, so it can\'t take new issues. Pick another repository.');
  });

  it('Create on an archived repo (403) says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'Repository was archived so is read-only.' })));
    await expect(create()).rejects.toThrow('acme/api is archived, so it can\'t take new issues. Pick another repository.');
  });
});

describe('rate limits: "try again after HH:MM", local time', () => {
  it('primary: x-ratelimit-remaining 0 + x-ratelimit-reset', async () => {
    const reset = Math.floor(NOW / 1000) + 25 * 60;
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'API rate limit exceeded for user.' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })));
    const err = await create().catch((e) => e);
    expect(err).toBeInstanceOf(GitHubRateLimitError);
    expect(err.message).toBe(`GitHub rate limit: try again after ${localHHMM(reset * 1000)}.`);
  });

  it('secondary: retry-after seconds', () => {
    const e = githubSpecialError(reply(429, { message: 'You have exceeded a secondary rate limit.' }, { 'retry-after': '120' }), {}, NOW);
    expect(e).toBeInstanceOf(GitHubRateLimitError);
    expect(e!.message).toBe(`GitHub rate limit: try again after ${localHHMM(NOW + 120_000)}.`);
  });

  it('secondary: a 403 "secondary rate limit" with no header waits at least a minute', () => {
    const e = githubSpecialError(reply(403, {}), { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' }, NOW);
    expect(e).toBeInstanceOf(GitHubRateLimitError);
    expect((e as GitHubRateLimitError).resetAt).toBe(NOW + 60_000);
  });

  it('a 403 for a missing permission keeps its own message (not a rate limit)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'Resource not accessible by integration' }, { 'x-ratelimit-remaining': '4999' })));
    await expect(create()).rejects.toThrow("This token can't create issues in acme/api. Give it Issues: Read and write.");
  });

  it('a list hitting the limit surfaces the same message', async () => {
    const reset = Math.floor(NOW / 1000) + 600;
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })));
    await expect(github.listContainers({ via: 'token', token: 'ghp_x' })).rejects.toThrow(`GitHub rate limit: try again after ${localHHMM(reset * 1000)}.`);
  });
});
