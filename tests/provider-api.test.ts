// Phase 2b: the shared provider HTTP layer (src/providers/api.ts).
//
// This module is the one place a provider is called, from BOTH the page-world
// SDK and the extension's background service worker. Two things are tested:
//
//   1. Error mapping. "Failed to fetch" and "HTTP 422" are what users actually
//      report as "it just says it failed", so every status a provider realistically
//      returns has to become a sentence that says what to do.
//   2. The Slack split. The page path must keep `mode: "no-cors"` and its
//      optimistic `opaque: true`; the worker path, which has host access and is
//      not bound by page CORS, must read the REAL response. Getting these
//      backwards would either break page mode or keep lying about delivery.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  friendlyStatus, mapProviderError, PROVIDER_ORIGINS,
  postGitHubIssue, postLinearIssue, postSlackMessage, callLLM,
} from '../src/providers/api';

afterEach(() => { vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('friendlyStatus', () => {
  it('names the credential a tracker user has to re-create', () => {
    expect(friendlyStatus(401, 'GitHub', 'tracker')).toMatch(/rejected the token/i);
    expect(friendlyStatus(401, 'GitHub', 'tracker')).toMatch(/TraceBug settings/);
  });

  it('calls it an API key for an LLM provider', () => {
    expect(friendlyStatus(401, 'Anthropic', 'llm')).toMatch(/rejected the API key/i);
  });

  it('explains 403 as scope-or-rate-limit rather than just "forbidden"', () => {
    const msg = friendlyStatus(403, 'GitHub', 'tracker');
    expect(msg).toMatch(/scope/i);
    expect(msg).toMatch(/rate limit/i);
  });

  it('explains 404 as "cannot see it", which is what a missing scope looks like', () => {
    expect(friendlyStatus(404, 'GitHub', 'tracker')).toMatch(/cannot see it/i);
  });

  it('explains 422 as validation, not as a TraceBug bug', () => {
    expect(friendlyStatus(422, 'GitHub', 'tracker')).toMatch(/validation/i);
  });

  it('tells the user to wait on 429', () => {
    expect(friendlyStatus(429, 'OpenAI')).toMatch(/rate limited/i);
    expect(friendlyStatus(429, 'OpenAI')).toMatch(/retry/i);
  });

  it('mentions Ollama not running, because that is the usual cause', () => {
    expect(friendlyStatus(0, 'Ollama')).toMatch(/Ollama is running/);
  });

  it('calls 5xx temporary', () => {
    expect(friendlyStatus(503, 'Linear')).toMatch(/temporarily unavailable/i);
  });

  it('still says something useful for an unmapped status', () => {
    expect(friendlyStatus(418, 'GitHub')).toMatch(/HTTP 418/);
  });
});

describe('mapProviderError', () => {
  it('turns a bare network failure into an actionable sentence', () => {
    const msg = mapProviderError(new TypeError('Failed to fetch'), 'GitHub');
    expect(msg).toMatch(/could not reach GitHub/i);
    // The host-permission case is indistinguishable from offline at this
    // level, so the message has to mention both.
    expect(msg).toMatch(/access/i);
  });

  it('recognises a Firefox-shaped network error', () => {
    expect(mapProviderError(new Error('NetworkError when attempting to fetch resource.'), 'Linear'))
      .toMatch(/could not reach Linear/i);
  });

  it('names an abort as a cancellation, not a failure', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(mapProviderError(err, 'Slack')).toMatch(/cancelled/i);
  });

  it('passes a real provider message through untouched', () => {
    expect(mapProviderError(new Error('Validation Failed: body is too long'), 'GitHub'))
      .toBe('Validation Failed: body is too long');
  });

  it('never returns an empty string', () => {
    expect(mapProviderError(null, 'GitHub')).toMatch(/GitHub/);
    expect(mapProviderError({}, 'GitHub')).toMatch(/GitHub/);
  });
});

describe('host patterns', () => {
  it('matches the optional_host_permissions in the manifest', () => {
    expect(PROVIDER_ORIGINS.github).toBe('https://api.github.com/*');
    expect(PROVIDER_ORIGINS.linear).toBe('https://api.linear.app/*');
    expect(PROVIDER_ORIGINS.slack).toBe('https://hooks.slack.com/*');
    expect(PROVIDER_ORIGINS.anthropic).toBe('https://api.anthropic.com/*');
    expect(PROVIDER_ORIGINS.openai).toBe('https://api.openai.com/*');
  });

  it('covers 127.0.0.1 separately from localhost', () => {
    // Match patterns cannot carry a port, so localhost/* already covers
    // Ollama's :11434 — but 127.0.0.1 is a different HOST.
    expect(PROVIDER_ORIGINS.ollama).toBe('http://localhost/*');
    expect(PROVIDER_ORIGINS.ollama127).toBe('http://127.0.0.1/*');
  });
});

describe('postGitHubIssue', () => {
  it('posts only title, body and configured labels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ html_url: 'https://github.com/acme/w/issues/4', number: 4 }));
    const res = await postGitHubIssue(
      { token: 'ghp_x', repo: 'acme/widgets', labels: ['bug'] },
      { title: 'T', body: 'B' },
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/widgets/issues');
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'T', body: 'B', labels: ['bug'] });
    expect(res).toEqual({ provider: 'github', ok: true, url: 'https://github.com/acme/w/issues/4', ref: '#4' });
  });

  it('rejects a malformed repo before touching the network', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(postGitHubIssue({ token: 't', repo: 'not a repo' }, { title: 'T', body: 'B' }))
      .rejects.toThrow(/owner\/repo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the provider message alongside the friendly one on 422', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Validation Failed' }, 422));
    await expect(postGitHubIssue({ token: 't', repo: 'a/b' }, { title: 'T', body: 'B' }))
      .rejects.toThrow(/validation.*Validation Failed/is);
  });

  it('maps 401 to re-create-the-token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ message: 'Bad credentials' }, 401));
    await expect(postGitHubIssue({ token: 't', repo: 'a/b' }, { title: 'T', body: 'B' }))
      .rejects.toThrow(/rejected the token/i);
  });
});

describe('postLinearIssue', () => {
  it('sends the team id from config, never from the payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ data: { issueCreate: { success: true, issue: { url: 'https://linear.app/i/ENG-1', identifier: 'ENG-1' } } } }),
    );
    const res = await postLinearIssue({ apiKey: 'lin_api_x', teamId: 'ENG' }, { title: 'T', body: 'B' });
    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse(init!.body as string);
    expect(sent.variables.input).toEqual({ teamId: 'ENG', title: 'T', description: 'B' });
    // Linear takes the key verbatim — no "Bearer".
    expect((init!.headers as Record<string, string>).authorization).toBe('lin_api_x');
    expect(res.ref).toBe('ENG-1');
  });

  it('throws on a 200 with a GraphQL errors array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ errors: [{ message: 'Team not found' }] }));
    await expect(postLinearIssue({ apiKey: 'k', teamId: 'X' }, { title: 'T', body: 'B' }))
      .rejects.toThrow('Team not found');
  });

  it('throws when success is false without an issue', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: { issueCreate: { success: false } } }));
    await expect(postLinearIssue({ apiKey: 'k', teamId: 'X' }, { title: 'T', body: 'B' }))
      .rejects.toThrow(/did not create/i);
  });
});

describe('postSlackMessage', () => {
  it('page path: no-cors, urlencoded, optimistic opaque success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const res = await postSlackMessage(
      { webhookUrl: 'https://hooks.slack.com/services/T/B/x' }, { text: 'hi' },
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init!.mode).toBe('no-cors');
    expect((init!.body as string).startsWith('payload=')).toBe(true);
    expect(res).toEqual({ provider: 'slack', ok: true, opaque: true });
  });

  it('worker path: JSON, real response read, no opaque flag', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const res = await postSlackMessage(
      { webhookUrl: 'https://hooks.slack.com/services/T/B/x' }, { text: 'hi' },
      undefined, { readResponse: true },
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init!.mode).toBeUndefined();
    expect(JSON.parse(init!.body as string)).toEqual({ text: 'hi' });
    // No `opaque` — this is a confirmed delivery, which is the whole point.
    expect(res).toEqual({ provider: 'slack', ok: true });
  });

  it('worker path surfaces Slack’s terse rejection reason', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid_payload', { status: 400 }));
    await expect(postSlackMessage(
      { webhookUrl: 'https://hooks.slack.com/services/T/B/x' }, { text: 'hi' },
      undefined, { readResponse: true },
    )).rejects.toThrow(/invalid_payload/);
  });

  it('worker path treats a 200 with an unexpected body as a failure', async () => {
    // A revoked webhook answers 200 with "no_service" in some cases.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no_service', { status: 200 }));
    await expect(postSlackMessage(
      { webhookUrl: 'https://hooks.slack.com/services/T/B/x' }, { text: 'hi' },
      undefined, { readResponse: true },
    )).rejects.toThrow(/no_service/);
  });

  it('refuses a webhook URL that is not Slack, on both paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(postSlackMessage({ webhookUrl: 'https://evil.example/hook' }, { text: 'x' }))
      .rejects.toThrow(/hooks\.slack\.com/);
    await expect(postSlackMessage({ webhookUrl: 'https://evil.example/hook' }, { text: 'x' },
      undefined, { readResponse: true })).rejects.toThrow(/hooks\.slack\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('callLLM', () => {
  it('sends the system prompt and the given user content to Anthropic', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ content: [{ type: 'text', text: '## Root cause\nIt broke.' }], model: 'claude-sonnet-4-6', usage: { input_tokens: 10, output_tokens: 5 } }),
    );
    const res = await callLLM(
      { provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-sonnet-4-6' }, 'why did it fail',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const sent = JSON.parse(init!.body as string);
    expect(sent.system).toMatch(/expert debugging assistant/);
    expect(sent.messages).toEqual([{ role: 'user', content: 'why did it fail' }]);
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-x');
    expect(res).toMatchObject({ provider: 'anthropic', text: '## Root cause\nIt broke.' });
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('treats an Anthropic refusal as a clear message, not an empty result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ stop_reason: 'refusal', content: [] }));
    await expect(callLLM({ provider: 'anthropic', apiKey: 'k', model: 'm' }, 'p'))
      .rejects.toThrow(/declined/i);
  });

  it('honours a custom baseUrl for Ollama', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ message: { content: 'done' }, model: 'llama3.1' }));
    await callLLM({ provider: 'ollama', apiKey: '', model: 'llama3.1', baseUrl: 'http://127.0.0.1:11434/' }, 'p');
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('defaults the base URL per provider', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ choices: [{ message: { content: 'x' } }], model: 'gpt-4o-mini' }));
    await callLLM({ provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' }, 'p');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('rejects an unknown provider without calling fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    // @ts-expect-error — deliberately out of band, as a corrupt stored config would be
    await expect(callLLM({ provider: 'gemini', apiKey: 'k', model: 'm' }, 'p'))
      .rejects.toThrow(/unknown provider/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns an empty completion into an error rather than a blank card', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ choices: [{ message: { content: '  ' } }] }));
    await expect(callLLM({ provider: 'openai', apiKey: 'k', model: 'm' }, 'p'))
      .rejects.toThrow(/empty response/i);
  });
});
