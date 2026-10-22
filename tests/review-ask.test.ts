// Phase 5 / Step F: the review ask, and the export footer.
//
// A review prompt is the easiest thing in a product to get wrong, and the
// failure is reputational rather than functional: shown too early, too often,
// or impossible to dismiss, and it is nagware. So the rules PLAN.md sets are
// tested as rules, not as implementation details:
//
//   • after the 3rd successful export, and never in the user's FIRST session
//   • if dismissed, once more at the 10th, then never again
//   • acting on it ends it immediately
//   • a failed export must not count toward any of the above
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { recordExport, getExportCount, _resetReviewAsk } from '../src/ui/review-ask';
import { storeUrl, reviewUrl, firefoxStoreUrl } from '../src/links';
import { buildReplayHtml, type BundlePayload } from '../src/exporters/html-template';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARD = readFileSync(join(root, 'src', 'ui', 'review-ask.ts'), 'utf8');
const TEMPLATE = readFileSync(join(root, 'src', 'exporters', 'html-template.ts'), 'utf8');
const QUICKBUG = readFileSync(join(root, 'src', 'ui', 'quick-bug.ts'), 'utf8');

/** Export n times from one session, returning whether each asked. */
function exportsFrom(sessionId: string, n: number): boolean[] {
  return Array.from({ length: n }, () => recordExport(sessionId));
}

describe('when the review ask fires', () => {
  beforeEach(() => { _resetReviewAsk(); });

  it('never asks during the first session, however many exports', () => {
    // The rule that matters most. Three exports inside someone's first ten
    // minutes is not an opinion yet, and asking then is what makes a prompt
    // feel like nagware.
    expect(exportsFrom('session-1', 12).some(Boolean)).toBe(false);
    expect(getExportCount()).toBe(12);
  });

  it('asks on the 3rd export once a later session is in play', () => {
    recordExport('session-1');                       // first session, counts only
    expect(recordExport('session-2')).toBe(false);   // 2
    expect(recordExport('session-2')).toBe(true);    // 3 → ask
  });

  it('counts exports across sessions, not per session', () => {
    recordExport('session-1');
    recordExport('session-2');
    expect(recordExport('session-3')).toBe(true);    // 3rd overall
  });

  it('does not ask again right after being dismissed', () => {
    recordExport('session-1');
    recordExport('session-2');
    expect(recordExport('session-2')).toBe(true);    // first ask at 3
    // Simulate the card having been shown and dismissed.
    localStorage.setItem('tracebug_review_ask', 'asked1');
    for (let i = 4; i < 10; i++) {
      expect(recordExport('session-2')).toBe(false);
    }
  });

  it('asks once more at the 10th, then never again', () => {
    localStorage.setItem('tracebug_export_count', '9');
    localStorage.setItem('tracebug_review_ask', 'asked1');
    localStorage.setItem('tracebug_review_first_session', 'session-1');
    expect(recordExport('session-2')).toBe(true);    // 10th
    localStorage.setItem('tracebug_review_ask', 'done');
    for (let i = 0; i < 20; i++) {
      expect(recordExport('session-2')).toBe(false);
    }
  });

  it('stops forever once the state is done', () => {
    localStorage.setItem('tracebug_review_ask', 'done');
    expect(exportsFrom('session-2', 30).some(Boolean)).toBe(false);
    // And stops counting too — nothing left to count toward.
    expect(getExportCount()).toBe(0);
  });

  it('suppresses the ask when the session is unknown', () => {
    // Without a session id "not the first session" cannot be established, so
    // the ask is skipped rather than risked.
    expect(exportsFrom('session-1', 1)).toEqual([false]);
    expect(recordExport(null)).toBe(false);
    expect(recordExport(null)).toBe(false);
  });
});

describe('the card obeys its own guardrails', () => {
  it('shows no rating, no count and no social proof', () => {
    // PLAN.md: "no fake star ratings, no numbers, no 'everyone loves it' copy."
    expect(CARD).toContain('Did TraceBug save you time?');
    expect(CARD).toContain('A short review helps other testers find it.');
    expect(CARD).not.toMatch(/\b\d+(\.\d+)?\s*(stars?|\/\s*5)\b/i);
    expect(CARD).not.toMatch(/loved by|thousands|users? love|★|⭐/i);
    // No incentive, ever.
    expect(CARD).not.toMatch(/discount|free month|reward|giveaway|unlock/i);
  });

  it('offers a dismiss, a "Not now" and Escape — all equivalent', () => {
    expect(CARD).toContain('aria-label", "Dismiss"');
    expect(CARD).toContain('Not now');
    expect(CARD).toContain('e.key === "Escape"');
  });

  it('marks itself asked at SHOW time, not on answer', () => {
    // Someone who closes the tab without answering must not meet it again.
    const show = CARD.slice(CARD.indexOf('export function showReviewAsk'));
    expect(show).toMatch(/writeState\(readState\(\) === "asked1" \? "done" : "asked1"\)/);
  });

  it('is built as nodes, never innerHTML', () => {
    expect(CARD.replace(/^\s*\/\/.*$/gm, '')).not.toContain('innerHTML');
    expect(CARD).toContain('createElementNS');
  });

  it('links to the reviews page, tagged', () => {
    expect(CARD).toContain('reviewUrl(');
    expect(reviewUrl('review')).toContain('/reviews?utm_source=review');
  });

  it('never blocks the export it follows', () => {
    // The ask is fired from a setTimeout inside a try/catch, so a throw in the
    // card cannot turn a successful export into a failed one.
    expect(QUICKBUG).toContain('if (!recordExport(sessionId)) return;');
    expect(QUICKBUG).toMatch(/setTimeout\(\(\) => \{ try \{ showReviewAsk\(root\); \} catch/);
  });

  it('counts only exports that produced a file', () => {
    // _maybeAskForReview sits after the success toast in both paths, inside the
    // try block — a throw earlier skips it.
    const html = QUICKBUG.slice(QUICKBUG.indexOf('exportSessionAsHtml(data.currentSession'));
    expect(html.slice(0, html.indexOf('} catch'))).toContain('_maybeAskForReview');
    const zip = QUICKBUG.slice(QUICKBUG.indexOf('exportSessionAsZip(data.currentSession'));
    expect(zip.slice(0, zip.indexOf('} catch'))).toContain('_maybeAskForReview');
  });
});

describe('store links come from one place', () => {
  it('tags the export footer the way PLAN.md specifies', () => {
    const url = storeUrl('report', 'export');
    expect(url).toContain('utm_source=report');
    expect(url).toContain('utm_medium=export');
  });

  it('uses the listing id the docs use', () => {
    // A guessed or stale id is a dead link inside an exported report that may
    // be read months later. Pinned against the published docs.
    const docs = readFileSync(join(root, 'docs', 'chrome-extension.md'), 'utf8');
    const id = storeUrl('report').match(/detail\/([a-z]{32})/)?.[1];
    expect(id).toBeTruthy();
    expect(docs).toContain(String(id));
  });

  it('uses the AMO slug the docs use, and not the 404 guess', () => {
    // This assertion used to be the opposite - "declares no Firefox listing it
    // cannot verify" - because the slug was unknown. It is now verified by GUID
    // (see src/links.ts), so the risk inverts: the danger is no longer declaring
    // a link, it is declaring the WRONG one. `/addon/tracebug/` is a real 404
    // and was published in compatibility.md for weeks.
    const url = firefoxStoreUrl('report');
    expect(url).toContain('tracebug-bug-reports-for-ai');
    expect(url).not.toMatch(/addon\/tracebug[?/]/);
    const docs = readFileSync(join(root, 'docs', 'compatibility.md'), 'utf8');
    expect(docs).toContain('tracebug-bug-reports-for-ai');
  });

  it('tags the Firefox link like the Chrome one', () => {
    const url = firefoxStoreUrl('report', 'export');
    expect(url).toContain('utm_source=report');
    expect(url).toContain('utm_medium=export');
  });
});

describe('the export footer can be turned off', () => {
  it('renders by default, and when showFooter is absent', () => {
    expect(TEMPLATE).toContain('payload.showFooter === false ? "" :');
  });

  it('points "capture your own" at the store, not the marketing site', () => {
    // PLAN.md: the bar links to the Chrome Web Store listing. The old footer
    // sent people to tracebug.dev/?ref=replay, which cannot convert to an
    // install in one step.
    const footer = TEMPLATE.slice(TEMPLATE.indexOf('const footerBar ='), TEMPLATE.indexOf('const replayPath'));
    expect(footer).toContain('storeUrl("report", "export")');
    expect(footer).not.toContain('ref=replay');
  });

  it('is offered as a toggle in the export menu, defaulting on', () => {
    expect(QUICKBUG).toContain('data-action="toggle-export-footer"');
    expect(QUICKBUG).toContain('role="menuitemcheckbox"');
    // Absent key means on: only an explicit "0" turns it off.
    expect(QUICKBUG).toContain('localStorage.getItem(EXPORT_FOOTER_KEY) !== "0"');
  });

  it('passes the preference into every export path', () => {
    // Coverage, not a count: Phase 6 added a third path ("Export without
    // video") and any future one must honour the preference too. An export
    // that quietly ignores it is the bug this guards.
    const paths = ['export-replay', 'export-zip', 'export-no-video'];
    for (const action of paths) {
      const handler = QUICKBUG.slice(QUICKBUG.indexOf(`'[data-action="${action}"]'`));
      expect(handler.slice(0, 2000)).toContain('showFooter: showExportFooter()');
    }
    expect((QUICKBUG.match(/showFooter: showExportFooter\(\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(paths.length);
  });
});

describe('the exported .html report verdict links (👍/👎)', () => {
  // These aren't a static-source check like the block above — they render the
  // real template, because the thing that must hold is an OUTPUT property:
  // turning the export footer off must remove every tracebug.dev link from
  // the file, not just the visible store-CTA text. The 👍/👎 pair lives
  // inside the same conditional footerBar block in html-template.ts, so this
  // guards against a future edit that moves them out of it by accident.
  const minimalPayload = (showFooter?: boolean): BundlePayload => ({
    meta: {
      title: 'Bug', severity: 'low', summary: 'x', rootCause: 'x', page: '/',
      generatedAt: 1751790000000, sessionId: 'sess_fb_test', environment: 'Test', durationMs: 1000,
    },
    description: 'x',
    events: [],
    screenshots: [],
    showFooter,
  });

  it('includes the tracebug.dev feedback links when the footer is on (default)', () => {
    const html = buildReplayHtml(minimalPayload(true));
    expect(html).toContain('tracebug.dev/feedback');
    expect(html).toContain('👍');
    expect(html).toContain('👎');
  });

  it('includes the feedback links when showFooter is simply absent (older payload)', () => {
    const html = buildReplayHtml(minimalPayload(undefined));
    expect(html).toContain('tracebug.dev/feedback');
  });

  it('removes the feedback links entirely when the footer is turned off', () => {
    const html = buildReplayHtml(minimalPayload(false));
    expect(html).not.toContain('tracebug.dev/feedback');
    expect(html).not.toContain('tracebug.dev');
  });
});
