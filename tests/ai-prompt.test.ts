import { describe, it, expect } from 'vitest';
import { generateAIPrompt } from '../src/exporters/ai-prompt';
import type { BugReport } from '../src/types';

const report = (networkErrors: Array<Record<string, unknown>>) =>
  ({ title: 'Checkout fails', networkErrors, networkRequests: [] }) as unknown as BugReport;

describe('generateAIPrompt network failures', () => {
  it('leaves failed page assets out and says how many were omitted', () => {
    const prompt = generateAIPrompt(report([
      { method: '', url: 'http://localhost:3000/favicon.ico', status: 404 },
      { method: 'POST', url: 'http://localhost:3000/api/orders', status: 500 },
    ]));
    expect(prompt).toContain('POST http://localhost:3000/api/orders → 500');
    expect(prompt).not.toContain('favicon.ico');
    expect(prompt).toContain('1 failed page-asset request, e.g. favicon or images, omitted');
  });

  it('adds no omission note when every failure is real', () => {
    const prompt = generateAIPrompt(report([{ method: 'GET', url: '/api/cart', status: 503 }]));
    expect(prompt).toContain('GET /api/cart → 503');
    expect(prompt).not.toContain('omitted');
  });
});
