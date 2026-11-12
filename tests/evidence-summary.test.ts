import { describe, it, expect, beforeEach } from 'vitest';
import { summarizeEvidence, formatEvidenceMarkdown } from '../src/evidence-summary';
import { collectConsoleWarnings, resetConsoleCapped, getConsoleCapped } from '../src/collectors';
import { generateRootCauseHint, NO_FAILURE_HINT } from '../src/report-builder';
import { generateAIPrompt } from '../src/exporters/ai-prompt';
import { buildInvestigationGuide } from '../cli/mcp-server';
import type { BugReport, TraceBugEvent } from '../src/types';

function ev(type: TraceBugEvent['type'], page = '/', ts = 1): TraceBugEvent {
  return { id: String(ts), sessionId: 's', projectId: 'p', type, page, timestamp: ts, data: {} };
}

function report(over: Partial<BugReport> = {}, session: Record<string, unknown> = {}): BugReport {
  return {
    title: 't', networkErrors: [], networkRequests: [], consoleErrors: [], screenshots: [],
    clickedElement: { tag: 'button', text: 'Save', page: '/' },
    session: { sessionId: 's', events: [ev('click'), ev('input')], consoleLevel: 'warnings', ...session },
    ...over,
  } as unknown as BugReport;
}

beforeEach(() => resetConsoleCapped());

describe('summarizeEvidence', () => {
  it('lists what was captured and is complete on a clean session', () => {
    const s = summarizeEvidence(report({
      networkRequests: [{ method: 'GET', url: '/a', status: 200 }, { method: 'POST', url: '/b', status: 500 }],
      networkErrors: [{ method: 'POST', url: '/b', status: 500, response: 'boom' }],
    } as Partial<BugReport>));
    expect(s.captured).toContain('2 user actions');
    expect(s.captured).toContain('0 errors');
    expect(s.captured).toContain('2 network requests (1 failed)');
    expect(s.dropped).toEqual([]);
    expect(s.complete).toBe(true);
  });

  it('always says what is never captured', () => {
    const s = summarizeEvidence(report());
    const text = s.notCaptured.join(' | ');
    expect(text).toContain('request and response bodies');
    expect(text).toContain('headers');
    expect(text).toContain('iframes');
    expect(text).toContain('events-only capture');
    expect(text).toContain('console info and logs');
  });

  it('evicted events make the capture incomplete', () => {
    const s = summarizeEvidence(report({}, { droppedEvents: 12 }));
    expect(s.complete).toBe(false);
    expect(s.dropped.join(' ')).toContain('12 oldest events');
  });

  it('console capture off makes the capture incomplete', () => {
    const s = summarizeEvidence(report({}, { consoleLevel: 'none' }));
    expect(s.complete).toBe(false);
    expect(s.notCaptured.join(' ')).toContain('console capture was off');
  });

  it('flags failed requests with no response body', () => {
    const s = summarizeEvidence(report({
      networkErrors: [{ method: 'GET', url: '/x', status: 502 }],
    } as Partial<BugReport>));
    expect(s.dropped.join(' ')).toContain('response body of 1 failed request');
  });

  it('flags a video that hit the 2-minute cutoff and a replay covering only the last page', () => {
    const s = summarizeEvidence(report({
      video: { sizeBytes: 10, durationMs: 120_000, rrwebEvents: [{}] },
    } as unknown as Partial<BugReport>, { events: [ev('click', '/cart', 1), ev('route_change', '/checkout', 2)] }));
    const dropped = s.dropped.join(' ');
    expect(dropped).toContain('2 minutes');
    expect(dropped).toContain('replay covers only /checkout');
    expect(s.captured).toContain('DOM replay of /checkout');
  });

  it('formats as markdown with Dropped only when something was dropped', () => {
    expect(formatEvidenceMarkdown(summarizeEvidence(report()))).not.toContain('**Dropped:**');
    expect(formatEvidenceMarkdown(summarizeEvidence(report({}, { droppedEvents: 3 })))).toContain('**Dropped:**');
  });
});

describe('console caps', () => {
  it('a level that passes 50 messages is reported as dropped', () => {
    const restore = collectConsoleWarnings(() => {});
    try {
      for (let i = 0; i < 51; i++) console.warn('w' + i);
    } finally { restore(); }
    expect(getConsoleCapped()).toEqual(['warn']);
    expect(summarizeEvidence(report()).dropped.join(' ')).toContain('console.warn output after the first 50');
  });

  it('50 messages exactly is not a cap', () => {
    const restore = collectConsoleWarnings(() => {});
    try { for (let i = 0; i < 50; i++) console.warn('w' + i); } finally { restore(); }
    expect(getConsoleCapped()).toEqual([]);
  });
});

describe('"no errors captured" is conditional on a complete capture', () => {
  it('the hint adds a caveat when the capture is incomplete', () => {
    const r = report({}, { droppedEvents: 5 });
    r.evidence = summarizeEvidence(r);
    const hint = generateRootCauseHint(r).hint;
    expect(hint.startsWith(NO_FAILURE_HINT)).toBe(true);
    expect(hint).toContain('The capture is incomplete');
  });

  it('no caveat on a complete capture', () => {
    const r = report();
    r.evidence = summarizeEvidence(r);
    expect(generateRootCauseHint(r).hint).not.toContain('incomplete');
  });

  it('the AI prompt carries an Evidence coverage section and the caveat', () => {
    const r = report({}, { droppedEvents: 5 });
    r.evidence = summarizeEvidence(r);
    const p = generateAIPrompt(r);
    expect(p).toContain('## Evidence coverage');
    expect(p).toContain('**Dropped:**');
    expect(p).toContain('The capture is incomplete');
  });

  it('the MCP guide notes an incomplete capture and lists the gaps', () => {
    const r = report({}, { droppedEvents: 5 });
    const evidence = summarizeEvidence(r);
    const guide = buildInvestigationGuide({
      meta: { title: 't' }, consoleErrors: [], consoleLogs: [], networkErrors: [], actionChips: [],
      evidence,
    } as never).join('\n');
    expect(guide).toContain('INCOMPLETE');
    expect(guide).toContain('[MEDIUM] Evidence gaps');
  });
});
