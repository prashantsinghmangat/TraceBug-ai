import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAIConfig, setAIConfig, clearAIConfig, hasAIKey,
  buildAnalysisPrompt, runLLMAnalysis, DEFAULT_MODELS,
  type AIConfig,
} from '../src/ai/llm-client';
import type { BugReport } from '../src/types';

function fakeReport(): BugReport {
  return {
    title: 'Vendor Update Fails',
    summary: 'PUT /api/vendors/42 returns 500',
    severity: 'critical',
    generatedAt: 1751790000000,
    environment: { url: '/vendors/42', browser: 'Chrome', browserVersion: '126', os: 'Windows 11', viewport: '1920x1080' },
    session: { sessionId: 's1', events: [] },
    steps: '1. Open /vendors/42\n2. Click Save',
    sessionSteps: ['1. Open /vendors/42', "2. Click 'Save'"],
    consoleErrors: [
      // Authorization header carries a bearer token that must be scrubbed before it leaves the browser.
      { message: 'Request failed: Authorization: Bearer abcdef0123456789abcdef', timestamp: 1751790001000 },
    ],
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

describe('AI config store', () => {
  it('round-trips a config and reports key presence', () => {
    expect(getAIConfig()).toBeNull();
    expect(hasAIKey()).toBe(false);
    const cfg: AIConfig = { provider: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-4-6' };
    setAIConfig(cfg);
    expect(getAIConfig()).toEqual(cfg);
    expect(hasAIKey()).toBe(true);
    clearAIConfig();
    expect(getAIConfig()).toBeNull();
  });

  it('ollama needs no key', () => {
    setAIConfig({ provider: 'ollama', apiKey: '', model: 'llama3.1' });
    expect(hasAIKey()).toBe(true);
  });

  it('ignores a saved config with no key for a key-requiring provider', () => {
    localStorage.setItem('tracebug_ai_config', JSON.stringify({ provider: 'openai', apiKey: '', model: 'gpt-4o' }));
    expect(getAIConfig()).toBeNull();
  });

  it('migrates the legacy bare-key storage to Anthropic config', () => {
    localStorage.setItem('tracebug_ai_key', 'sk-legacy');
    const cfg = getAIConfig();
    expect(cfg).toEqual({ provider: 'anthropic', apiKey: 'sk-legacy', model: DEFAULT_MODELS.anthropic });
    expect(localStorage.getItem('tracebug_ai_key')).toBeNull(); // cleared after migration
  });
});

describe('buildAnalysisPrompt', () => {
  it('scrubs secret token shapes out of the prompt', () => {
    const prompt = buildAnalysisPrompt(fakeReport());
    expect(prompt).toContain('Vendor Update Fails');
    expect(prompt).toContain('500');
    expect(prompt).not.toContain('abcdef0123456789abcdef'); // bearer token redacted
    expect(prompt).toContain('[REDACTED]');
  });
});

describe('runLLMAnalysis — provider adapters', () => {
  it('throws a helpful error when unconfigured', async () => {
    await expect(runLLMAnalysis(fakeReport())).rejects.toThrow(/configured/i);
  });

  it('calls Anthropic with the right headers and extracts the text block', async () => {
    setAIConfig({ provider: 'anthropic', apiKey: 'sk-ant-xyz', model: 'claude-sonnet-4-6' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '## Root cause\nThe 500 broke it.' }],
        usage: { input_tokens: 100, output_tokens: 40 },
      }), { status: 200 }),
    );

    const result = await runLLMAnalysis(fakeReport());
    expect(result.provider).toBe('anthropic');
    expect(result.text).toContain('Root cause');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 40 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-xyz');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.messages[0].role).toBe('user');
    expect(body.system).toContain('Root cause');
    // Prompt sent to the provider is scrubbed.
    expect(body.messages[0].content).not.toContain('abcdef0123456789abcdef');
  });

  it('surfaces an Anthropic refusal as an error', async () => {
    setAIConfig({ provider: 'anthropic', apiKey: 'sk-ant', model: 'claude-sonnet-4-6' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }), { status: 200 }),
    );
    await expect(runLLMAnalysis(fakeReport())).rejects.toThrow(/declined/i);
  });

  it('maps a 401 to a friendly key error', async () => {
    setAIConfig({ provider: 'anthropic', apiKey: 'bad', model: 'claude-sonnet-4-6' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 }),
    );
    await expect(runLLMAnalysis(fakeReport())).rejects.toThrow(/invalid x-api-key/i);
  });

  it('calls OpenAI chat completions and extracts the message', async () => {
    setAIConfig({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-4o-mini' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: '## Root cause\nBad response handling.' } }],
        usage: { prompt_tokens: 80, completion_tokens: 30 },
      }), { status: 200 }),
    );
    const result = await runLLMAnalysis(fakeReport());
    expect(result.provider).toBe('openai');
    expect(result.text).toContain('Root cause');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer sk-openai');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
  });

  it('calls a local Ollama with no key and honors a baseUrl override', async () => {
    setAIConfig({ provider: 'ollama', apiKey: '', model: 'llama3.1', baseUrl: 'http://localhost:9999/' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ model: 'llama3.1', message: { content: 'analysis here' } }), { status: 200 }),
    );
    const result = await runLLMAnalysis(fakeReport());
    expect(result.provider).toBe('ollama');
    expect(result.text).toBe('analysis here');
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:9999/api/chat');
    // No Authorization header for local.
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});
