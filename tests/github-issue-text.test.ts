// U6 (manual pass 2026-11-24): the text of an issue TraceBug FILES on GitHub.
// Goes through the real createGitHubIssue with fetch stubbed, so the title and
// body below are exactly what would be POSTed. Linear keeps its 1.13 text
// while it is frozen (legacyText).
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createGitHubIssue } from '../src/integrations/tracker-client';
import { generateGitHubIssue } from '../src/github-issue';
import { buildReport } from '../src/report-builder';
import { _resetIssueSignature } from '../src/integrations/issue-signature';
import type { StoredSession, EnvironmentInfo, TraceBugEvent, BugReport } from '../src/types';

const env: EnvironmentInfo = {
  browser: 'Chrome', browserVersion: '149', os: 'Windows', viewport: '1280x720', screenResolution: '1920x1080',
  language: 'en', timezone: 'UTC', userAgent: 'x', url: 'https://markdownlivepreview.com/', deviceType: 'desktop',
  connectionType: '4g', timestamp: Date.now(),
};
const T0 = Date.now() - 60_000;
let n = 0;
const ev = (type: string, at: number, data: Record<string, unknown>): TraceBugEvent =>
  ({ id: 'e' + (n++), sessionId: 's1', projectId: 'p', type, page: '/', timestamp: at, data } as unknown as TraceBugEvent);
/** One click on a link, recorded twice (the <a> and its inner element). */
const linkClickTwice = [
  ev('click', T0 + 1000, { element: { tag: 'a', text: 'a', selector: 'a' } }),
  ev('click', T0 + 1004, { element: { tag: 'a', text: 'a', selector: 'a' } }),
];
function session(events: TraceBugEvent[], errorMessage: string | null = null): StoredSession {
  return {
    sessionId: 'abcdef1234', projectId: 'p', createdAt: T0, updatedAt: T0 + 5000, errorMessage, errorStack: null,
    reproSteps: null, errorSummary: null, events, annotations: [], environment: env,
  } as unknown as StoredSession;
}

let posted: { title: string; body: string } | null = null;
beforeEach(() => {
  _resetIssueSignature();
  posted = null;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    posted = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ html_url: 'https://github.com/acme/api/issues/7', number: 7 }), { status: 201, headers: { 'content-type': 'application/json' } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function file(r: BugReport) {
  await createGitHubIssue(r, { token: 'ghp_x', repo: 'acme/api' } as never);
  return posted!;
}

describe('a filed GitHub issue reads cleanly (U6)', () => {
  it('no "Low · " severity prefix in the title; severity is a line in the body', async () => {
    const r = buildReport(session(linkClickTwice));
    r.title = 'Checkout button does nothing';
    const { title, body } = await file(r);
    expect(title).toBe('Checkout button does nothing');
    expect(title).not.toMatch(/Low|Medium|High|Critical|·|[🔴🟠🟡🟢]/u);
    expect(body).toMatch(/^\*\*Severity:\*\* \S+ \w+$/m);
  });

  it('no "TL;DR: Bug report captured on /" — the bare fallback says nothing', async () => {
    const { body } = await file(buildReport(session([])));
    expect(body).not.toMatch(/TL;DR/);
    expect(body).not.toMatch(/Bug report captured on/);
  });

  it('one footer: the session and the credit on one line, never "Captured with" as well', async () => {
    const { body } = await file(buildReport(session(linkClickTwice)));
    expect(body).not.toMatch(/Captured with \[TraceBug\]/);
    expect(body.match(/Reported with TraceBug/g)).toHaveLength(1);
    expect(body.match(/^---$/gm)?.length).toBe(1);
    expect(body.trim().split('\n').pop()).toMatch(/Reported with TraceBug.*Session `abcdef12`/);
  });

  it('no "before the error" when there was no error', async () => {
    // Events, but none a step: the fallback line.
    const quiet = [ev('api_request', T0 + 500, { request: { method: 'GET', url: 'https://x.test/api', statusCode: 200, duration: 5 } })];
    const { body } = await file(buildReport(session(quiet)));
    expect(body).not.toMatch(/before the error/);
    expect(body).toMatch(/No user interactions recorded\)/);
    // …and still says it when there was one.
    expect(buildReport(session(quiet, 'TypeError: x')).steps).toMatch(/before the error/);
  });

  it('a restored draft\'s "Empty Session — No User Interactions" title gives way when the body has actions', async () => {
    const r = buildReport(session(linkClickTwice));
    r.title = 'Empty Session — No User Interactions';
    const { title, body } = await file(r);
    expect(title).not.toMatch(/No User Interactions/);
    expect(title.length).toBeGreaterThan(0);
    expect(body).toMatch(/Clicked 'a' link/);
  });

  it('the actions in words: no raw "User clicked: `<a>` "a" — `a`", one line for one click', async () => {
    const { body } = await file(buildReport(session(linkClickTwice)));
    expect(body).not.toMatch(/User clicked/);
    expect(body).not.toMatch(/`<a>`/);
    expect(body.match(/Clicked 'a' link/g)).toHaveLength(1);
  });

  it('two real clicks on the same link a while apart stay two', () => {
    const r = buildReport(session([
      ev('click', T0 + 1000, { element: { tag: 'a', text: 'a', selector: 'a' } }),
      ev('click', T0 + 4000, { element: { tag: 'a', text: 'a', selector: 'a' } }),
    ]));
    expect(r.sessionSteps.filter((s) => s === "Clicked 'a' link")).toHaveLength(2);
  });
});

describe('Linear keeps its 1.13 text while frozen (legacyText)', () => {
  it('severity prefix in the heading, the raw "User clicked" line, the "Captured with" footer', () => {
    const r = buildReport(session(linkClickTwice));
    r.title = 'Checkout button does nothing';
    const md = generateGitHubIssue(r, { legacyText: true });
    expect(md.split('\n')[0]).toMatch(/^## \S+ \w+ · Checkout button does nothing$/u);
    expect(md).toMatch(/\*\*User clicked:\*\* `<a>`/);
    expect(md).toMatch(/Captured with \[TraceBug\]/);
    expect(md).not.toMatch(/\*\*Severity:\*\*/);
  });
});
