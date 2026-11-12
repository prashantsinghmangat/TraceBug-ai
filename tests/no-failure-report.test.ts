import { describe, it, expect } from 'vitest';
import { generateRootCauseHint, NO_FAILURE_HINT } from '../src/report-builder';
import { buildActionChips } from '../src/action-chips';
import { generateAIPrompt } from '../src/exporters/ai-prompt';
import { buildInvestigationGuide } from '../cli/mcp-server';
import type { BugReport, TraceBugEvent } from '../src/types';

// Playground run 2026-11-03: a session on the FIXED app (invalid coupon shown
// correctly, order placed) produced "Click on 'Place order' did not trigger any
// observable effect", dead-click flags on working buttons, and an agent that
// spent its turn proving there was no bug.

function report(over: Partial<BugReport> = {}): BugReport {
  return {
    title: 't', networkErrors: [], networkRequests: [], consoleErrors: [],
    clickedElement: { tag: 'button', text: 'Place order', page: '/' },
    ...over,
  } as unknown as BugReport;
}

function ev(type: TraceBugEvent['type'], data: Record<string, any>, timestamp: number): TraceBugEvent {
  return { id: String(timestamp), sessionId: 's', projectId: 'p', type, page: '/', timestamp, data };
}

describe('a report where nothing failed', () => {
  it('says nothing failed instead of guessing a cause', () => {
    const hint = generateRootCauseHint(report());
    expect(hint.hint.startsWith(NO_FAILURE_HINT)).toBe(true);
    expect(hint.hint).toContain("clicking 'Place order'");
    expect(hint.hint).not.toMatch(/did not trigger/);
    expect(hint.confidence).toBe('low');
  });

  it('says so with no click at all, too', () => {
    expect(generateRootCauseHint(report({ clickedElement: null } as Partial<BugReport>)).hint.startsWith(NO_FAILURE_HINT)).toBe(true);
  });

  it('a failed favicon alone still counts as nothing failed in the AI prompt', () => {
    const p = generateAIPrompt(report({
      networkErrors: [{ method: '', url: 'http://localhost/favicon.ico', status: 404 }] as BugReport['networkErrors'],
      rootCause: { hint: 'whatever', confidence: 'low' },
    }));
    expect(p).toContain('## No errors captured');
    expect(p).not.toContain('Auto-detected root cause hint');
  });

  it('a real failure keeps the root-cause hint in the AI prompt', () => {
    const p = generateAIPrompt(report({
      consoleErrors: [{ message: 'TypeError: x', timestamp: 1 }] as BugReport['consoleErrors'],
      rootCause: { hint: 'TypeError …', confidence: 'medium' },
    }));
    expect(p).toContain('Auto-detected root cause hint');
    expect(p).not.toContain('## No errors captured');
  });

  it('the MCP investigation guide says nothing failed and downgrades the generated test', () => {
    const guide = buildInvestigationGuide({
      meta: { title: 't' }, consoleErrors: [], consoleLogs: [], networkErrors: [], actionChips: [],
      playwrightTest: 'test()',
    } as never).join('\n');
    expect(guide).toMatch(/\[HIGH\] No errors or failed requests were captured/);
    expect(guide).toMatch(/ask the user what looked wrong/);
    expect(guide).toMatch(/\[LOW\] get_playwright_test/);
  });
});

describe('dead clicks', () => {
  const click = (sel: string, t: number) => ev('click', { element: { tag: 'button', text: sel, selector: sel } }, t);

  it('a pause after a click is not a dead click', () => {
    const chips = buildActionChips([click('#applyBtn', 0), click('#toast', 5000), click('#orderBtn', 9000)]);
    expect(chips.filter((c) => c.frustration === 'dead')).toHaveLength(0);
  });

  it('clicking the same element again a few seconds later is', () => {
    const chips = buildActionChips([click('#orderBtn', 0), click('#orderBtn', 3000)]);
    expect(chips[0].frustration).toBe('dead');
  });

  it('a re-click much later is not', () => {
    const chips = buildActionChips([click('#orderBtn', 0), click('#orderBtn', 60000)]);
    expect(chips.filter((c) => c.frustration === 'dead')).toHaveLength(0);
  });
});
