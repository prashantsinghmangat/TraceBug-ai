import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getIntegrationsConfig, setIntegrationsConfig, clearIntegrationsConfig, hasIntegration,
  createGitHubIssue, createLinearIssue, sendSlackMessage, createTrackerIssue,
  type IntegrationsConfig,
} from '../src/integrations/tracker-client';
import type { BugReport } from '../src/types';

function fakeReport(): BugReport {
  return {
    title: 'Vendor Update Fails',
    summary: 'PUT /api/vendors/42 returns 500',
    severity: 'critical',
    generatedAt: 1751790000000,
    environment: { url: '/vendors/42', browser: 'Chrome', browserVersion: '126', os: 'Windows 11', viewport: '1920x1080', deviceType: 'desktop' },
    session: { sessionId: 's1', events: [] },
    steps: '1. Open /vendors/42\n2. Click Save',
    sessionSteps: ['1. Open /vendors/42', "2. Click 'Save'"],
    timeline: [],
    consoleErrors: [],
    consoleLogs: [],
    networkErrors: [{ method: 'PUT', url: '/api/vendors/42', status: 500, duration: 300, timestamp: 1751790000800, response: '{"error":"boom"}' }],
    networkRequests: [],
    screenshots: [],
    annotations: [],
    rootCause: { hint: 'PUT returned 500', confidence: 'high' },
  } as unknown as BugReport;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('integrations config store', () => {
  it('round-trips config and reports per-provider readiness', () => {
    expect(getIntegrationsConfig()).toEqual({});
    expect(hasIntegration('github')).toBe(false);

    const cfg: IntegrationsConfig = {
      github: { token: 'ghp_x', repo: 'acme/app', labels: ['bug'] },
      slack: { webhookUrl: 'https://hooks.slack.com/services/T/B/x' },
    };
    setIntegrationsConfig(cfg);
    expect(getIntegrationsConfig()).toEqual(cfg);
    expect(hasIntegration('github')).toBe(true);
    expect(hasIntegration('slack')).toBe(true);
    expect(hasIntegration('linear')).toBe(false); // not configured

    clearIntegrationsConfig();
    expect(getIntegrationsConfig()).toEqual({});
  });

  it('github needs both token and repo to be ready', () => {
    setIntegrationsConfig({ github: { token: 'ghp_x', repo: '' } });
    expect(hasIntegration('github')).toBe(false);
  });
});

describe('createGitHubIssue', () => {
  it('POSTs to the repo issues endpoint with auth + returns the created url', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/acme/app/issues/7', number: 7 }), { status: 201 }),
    );
    const result = await createGitHubIssue(fakeReport(), { token: 'ghp_secret', repo: 'acme/app', labels: ['bug'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/acme/app/issues');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer ghp_secret');
    const body = JSON.parse(init!.body as string);
    expect(body.title).toContain('Vendor Update Fails');
    expect(body.body).toContain('Steps to Reproduce'); // full report body, not URL-capped
    expect(body.labels).toEqual(['bug']);
    expect(result).toEqual({ provider: 'github', ok: true, url: 'https://github.com/acme/app/issues/7', ref: '#7' });
  });

  it('rejects an invalid repo format before calling the API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createGitHubIssue(fakeReport(), { token: 't', repo: 'not-a-repo' })).rejects.toThrow(/owner\/repo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the GitHub error message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 }),
    );
    await expect(createGitHubIssue(fakeReport(), { token: 'bad', repo: 'acme/app' })).rejects.toThrow('Bad credentials');
  });
});

describe('createLinearIssue', () => {
  it('sends a GraphQL issueCreate mutation and returns the issue url + identifier', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { issueCreate: { success: true, issue: { id: 'i1', identifier: 'ENG-42', url: 'https://linear.app/acme/issue/ENG-42' } } } }), { status: 200 }),
    );
    const result = await createLinearIssue(fakeReport(), { apiKey: 'lin_api_key', teamId: 'team_1' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.linear.app/graphql');
    expect((init!.headers as Record<string, string>).authorization).toBe('lin_api_key'); // no "Bearer"
    const body = JSON.parse(init!.body as string);
    expect(body.query).toContain('issueCreate');
    expect(body.variables.input.teamId).toBe('team_1');
    expect(result).toEqual({ provider: 'linear', ok: true, url: 'https://linear.app/acme/issue/ENG-42', ref: 'ENG-42' });
  });

  it('throws when Linear returns GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'Invalid team' }] }), { status: 200 }),
    );
    await expect(createLinearIssue(fakeReport(), { apiKey: 'k', teamId: 'bad' })).rejects.toThrow('Invalid team');
  });
});

describe('sendSlackMessage', () => {
  it('POSTs a urlencoded payload in no-cors mode and reports opaque success', async () => {
    // no-cors yields an opaque response in the browser; the adapter never reads it.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const result = await sendSlackMessage(fakeReport(), { webhookUrl: 'https://hooks.slack.com/services/T/B/x' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/T/B/x');
    expect(init!.mode).toBe('no-cors');
    expect((init!.body as string).startsWith('payload=')).toBe(true);
    expect(result).toEqual({ provider: 'slack', ok: true, opaque: true });
  });

  it('rejects a non-Slack webhook URL', async () => {
    await expect(sendSlackMessage(fakeReport(), { webhookUrl: 'https://evil.example/hook' })).rejects.toThrow(/hooks\.slack\.com/);
  });
});

describe('createTrackerIssue dispatch', () => {
  it('throws a helpful error when the provider is unconfigured', async () => {
    await expect(createTrackerIssue('github', fakeReport())).rejects.toThrow(/not configured/i);
  });

  it('routes to the configured provider', async () => {
    setIntegrationsConfig({ github: { token: 'ghp_x', repo: 'acme/app' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/acme/app/issues/9', number: 9 }), { status: 201 }),
    );
    const result = await createTrackerIssue('github', fakeReport());
    expect(result.url).toBe('https://github.com/acme/app/issues/9');
  });
});
