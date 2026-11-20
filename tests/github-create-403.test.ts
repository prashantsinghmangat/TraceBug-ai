// A fine-grained token can pass the save-time check (it sees the repository)
// and still lack Issues: write. The first Create's 403 must say so plainly,
// naming the repository — and a rate-limit 403 must not be mistaken for it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { postGitHubIssue } from '../src/providers/api';

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('GitHub create: a 403 without issue write access', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('names the repository and the permission to add', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'Resource not accessible by personal access token' })));
    await expect(postGitHubIssue({ token: 'github_pat_x', repo: 'acme/api' }, { title: 't', body: 'b' }))
      .rejects.toThrow("This token can't create issues in acme/api. Give it Issues: Read and write.");
  });

  it('a rate-limit 403 keeps the generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' })));
    await expect(postGitHubIssue({ token: 'github_pat_x', repo: 'acme/api' }, { title: 't', body: 'b' }))
      .rejects.toThrow(/rate limit/);
  });
});
