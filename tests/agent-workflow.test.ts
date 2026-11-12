import { describe, it, expect } from 'vitest';
import { agentWorkflowSteps, CHAT_WORKFLOW_STEPS } from '../src/exporters/agent-workflow';
import { generateAIPrompt, generateMcpPrompt } from '../src/exporters/ai-prompt';
import { buildReplayHtml, type BundlePayload } from '../src/exporters/html-template';
import { buildDebugPrompt } from '../cli/mcp-server';
import { matchErrorPattern, formatPatternMatch } from '../src/patterns';
import type { BugReport } from '../src/types';

// Every agent prompt must ask for the same outcome: evidence → root cause →
// explained fix → approval → regression test → run it.
const WORKFLOW = [
  /root cause/i,
  /fix you propose|propose a concrete fix/i,
  /regression test/i,
  /fail before the fix and pass after/i,
  /approval before (editing|changing)/i,
];

function expectWorkflow(text: string) {
  for (const re of WORKFLOW) expect(text).toMatch(re);
}

describe('agent prompts share one workflow', () => {
  it('the hand-off card prompt (MCP)', () => {
    const p = generateMcpPrompt('tracebug-replay-abc.html');
    expectWorkflow(p);
    expect(p).toContain('get_bug_report("tracebug-replay-abc.html")');
    expect(p).toContain('get_playwright_test("tracebug-replay-abc.html")');
  });

  it('the MCP /tracebug:debug_bug_report prompt, with and without a file', () => {
    expectWorkflow(buildDebugPrompt('r.html'));
    expect(buildDebugPrompt('r.html')).toContain('get_bug_report("r.html")');
    expectWorkflow(buildDebugPrompt());
    expect(buildDebugPrompt()).toContain('list_bug_reports');
  });

  it("the exported file's AI tab carries the same steps, filled in at view time", () => {
    const html = buildReplayHtml({
      meta: { title: 't', severity: 'low', summary: '', page: '/', generatedAt: 1, sessionId: 's', environment: '', durationMs: 0 },
      events: [], screenshots: [], consoleErrors: [], networkErrors: [],
    } as unknown as BundlePayload);
    for (const step of agentWorkflowSteps('{FILE}')) expect(html).toContain(JSON.stringify(step).slice(1, -1));
    expect(html).toContain("split('{FILE}').join(mcpFile)");
  });

  it('the Fix with AI chat prompt', () => {
    const p = generateAIPrompt({ title: 't', networkErrors: [], networkRequests: [] } as unknown as BugReport);
    expectWorkflow(p);
    for (const step of CHAT_WORKFLOW_STEPS) expect(p).toContain(step);
  });

  it('asks for approval before any edit step', () => {
    const steps = agentWorkflowSteps('r.html');
    const approval = steps.findIndex((s) => /approval before editing/i.test(s));
    const edit = steps.findIndex((s) => /apply the fix/i.test(s));
    expect(approval).toBeGreaterThan(-1);
    expect(approval).toBeLessThan(edit);
  });
});

describe('undefined-access root-cause hint', () => {
  it('sends the reader after the missing value, not straight to optional chaining', () => {
    const m = matchErrorPattern("TypeError: Cannot read properties of undefined (reading 'discount')")!;
    expect(m).not.toBeNull();
    const text = formatPatternMatch(m);
    expect(text).toMatch(/find out why the value is missing/i);
    expect(text).toMatch(/config|lookup key/i);
    expect(text).toMatch(/request/i);
    // A guard is mentioned only as secondary, never as the first instruction.
    expect(text).not.toMatch(/Try: add a null-check/i);
    expect(text).not.toMatch(/optional chaining/i);
  });
});
