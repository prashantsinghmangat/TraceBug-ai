// Phase 6: the three edge cases that were actually open.
//
//   • a 20 MB+ export, which GitHub will reject at 25 MB
//   • a canvas page, whose DOM replay shows an empty box
//   • the Jira button, which implied filing something it cannot file
//
// The Slack item in PLAN.md was already resolved by Phase 2b.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findHeavyCanvas, eventsCaptureFidelityWarning } from '../src/replay-fidelity';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUICKBUG = readFileSync(join(root, 'src', 'ui', 'quick-bug.ts'), 'utf8');
const INDEX = readFileSync(join(root, 'src', 'index.ts'), 'utf8');

/** A canvas of a given rendered size, via a stubbed bounding rect. */
function canvas(w: number, h: number, id?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  if (id) c.id = id;
  c.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(c);
  return c;
}

describe('a canvas page is warned about before the capture is wasted', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.innerWidth = 1280;
    window.innerHeight = 800;
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('says nothing on a page with no canvas', () => {
    expect(findHeavyCanvas(document)).toBeNull();
    expect(eventsCaptureFidelityWarning(document)).toBeNull();
  });

  it('ignores sparklines and icons', () => {
    // Twelve tiny charts replay fine. Warning here would be noise on every
    // dashboard in existence.
    for (let i = 0; i < 12; i++) canvas(120, 40);
    expect(findHeavyCanvas(document)).toBeNull();
  });

  it('ignores a canvas that is large in attributes but small on screen', () => {
    // A 2000x2000 backing store shown at 80x80 is an icon. The measurement is
    // the rendered rect for exactly this reason.
    const c = canvas(80, 80);
    c.width = 2000;
    c.height = 2000;
    expect(findHeavyCanvas(document)).toBeNull();
  });

  it('warns when a canvas is most of what the user sees', () => {
    canvas(1200, 700); // ~82% of 1280x800
    expect(findHeavyCanvas(document)).not.toBeNull();
    const w = eventsCaptureFidelityWarning(document);
    expect(w?.kind).toBe('canvas');
  });

  it('picks the biggest canvas when there are several', () => {
    canvas(700, 400);
    const big = canvas(1200, 700, 'the-big-one');
    expect(findHeavyCanvas(document)?.id).toBe('the-big-one');
  });

  it('never counts TraceBug\'s own draw canvas as the page content', () => {
    // The draw overlay is full-viewport by definition. Counting it would warn
    // on every single page once annotate mode had been opened.
    canvas(1280, 800, 'tracebug-draw-canvas');
    expect(findHeavyCanvas(document)).toBeNull();
  });

  it('ignores anything inside the TraceBug root', () => {
    const host = document.createElement('div');
    host.id = 'tracebug-root';
    document.body.appendChild(host);
    const c = canvas(1200, 700);
    host.appendChild(c);
    expect(findHeavyCanvas(document)).toBeNull();
  });

  it('survives a document with no view', () => {
    canvas(1200, 700);
    const detached = document.implementation.createHTMLDocument('x');
    expect(findHeavyCanvas(detached)).toBeNull();
  });

  it('says what is missing, what still works, and what fixes it', () => {
    canvas(1200, 700);
    const msg = eventsCaptureFidelityWarning(document)!.message;
    expect(msg).toMatch(/canvas/i);
    // Reassurance, so nobody stops a capture that is still worth having.
    expect(msg).toMatch(/console, network/i);
    // The one actionable fix.
    expect(msg).toMatch(/Record video too/);
    // No jargon: "rrweb" and "DOM replay" mean nothing to a tester.
    expect(msg).not.toMatch(/rrweb|DOM replay/i);
  });
});

describe('the warning never endangers the capture', () => {
  it('fires after the HUD is up, inside a try/catch', () => {
    const block = INDEX.slice(INDEX.indexOf('eventsCaptureFidelityWarning()') - 600, INDEX.indexOf('eventsCaptureFidelityWarning()') + 600);
    expect(block).toContain('showRecordingHUD');
    expect(block).toMatch(/try \{[\s\S]*eventsCaptureFidelityWarning\(\)[\s\S]*\} catch/);
  });

  it('offers Stop, and auto-dismisses', () => {
    // A capture is running. A sticky notice over the page the user is trying to
    // reproduce a bug on would be worse than the problem it describes.
    const block = INDEX.slice(INDEX.indexOf('eventsCaptureFidelityWarning()'));
    expect(block.slice(0, 500)).toContain('"Stop"');
    expect(block.slice(0, 500)).toMatch(/autoDismissMs: 12_000/);
  });
});

describe('an oversize export says so before it is built', () => {
  it('warns at 20 MB, naming GitHub\'s 25 MB cap', () => {
    expect(QUICKBUG).toContain('const EXPORT_WARN_BYTES = 20 * 1024 * 1024');
    expect(QUICKBUG).toContain('const GITHUB_ATTACHMENT_CAP = "25 MB"');
    // Warned below the real cap on purpose: the figure is an estimate.
    const notice = QUICKBUG.slice(QUICKBUG.indexOf('function _oversizeExportNotice'));
    expect(notice.slice(0, 1200)).toContain('bytes < EXPORT_WARN_BYTES');
  });

  it('offers what is actually possible on each branch', () => {
    const notice = QUICKBUG.slice(QUICKBUG.indexOf('function _oversizeExportNotice'), QUICKBUG.indexOf('function _estimateHtmlExportBytes'));
    // With a DOM replay the video is already dropped, so there is nothing to
    // drop: offer the .zip. Without one, the video IS the size.
    expect(notice).toContain('export-zip');
    expect(notice).toContain('export-no-video');
    expect(notice).toContain('download-video');
  });

  it('has a working "Export without video" path', () => {
    expect(QUICKBUG).toContain('data-action="export-no-video"');
    const handler = QUICKBUG.slice(QUICKBUG.indexOf("'[data-action=\"export-no-video\"]'"));
    expect(handler.slice(0, 1400)).toContain('includeVideo: false');
    // Still honours the footer preference and still counts as an export.
    expect(handler.slice(0, 1400)).toContain('showFooter: showExportFooter()');
    expect(handler.slice(0, 1400)).toContain('_maybeAskForReview');
  });

  it('is absent for a normal-sized export', () => {
    // Returns "" rather than an empty box, so nothing renders at all.
    const notice = QUICKBUG.slice(QUICKBUG.indexOf('function _oversizeExportNotice'));
    expect(notice.slice(0, 1200)).toMatch(/return ""/);
  });
});

describe('the Jira button no longer implies filing', () => {
  it('says "Copy for Jira"', () => {
    expect(QUICKBUG).toContain('Copy for Jira');
    // The bare label is gone — it read as "file into Jira", which TraceBug
    // cannot do (Jira Cloud is CORS-blocked for browser XHR).
    expect(QUICKBUG).not.toMatch(/role="menuitem">\$\{_ic\("ticket"\)\} Jira</);
  });

  it('explains why it is copy-only', () => {
    const btn = QUICKBUG.slice(QUICKBUG.indexOf('data-action="jira"'));
    expect(btn.slice(0, 400)).toMatch(/cannot file|CORS/i);
  });
});
