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
    // The one actionable fix — in the npm SDK, where video works.
    expect(msg).toMatch(/Record video too/);
    // No jargon: "rrweb" and "DOM replay" mean nothing to a tester.
    expect(msg).not.toMatch(/rrweb|DOM replay/i);
  });

  it('does not point an extension user at a checkbox 1.11 removed', () => {
    // isExtensionContext() reads window.__TRACEBUG_INITIALIZED__, and in the
    // extension "Record video too" is not in the popup at all (video is paused
    // behind VIDEO_ENABLED_IN_EXTENSION). Advice to tick it would send the user
    // hunting for a control that does not exist.
    const w = window as Window & { __TRACEBUG_INITIALIZED__?: boolean };
    w.__TRACEBUG_INITIALIZED__ = true;
    try {
      canvas(1200, 700);
      const msg = eventsCaptureFidelityWarning(document)!.message;
      expect(msg).not.toMatch(/Record video too/);
      expect(msg).toMatch(/1\.11\.1/);
      // The reassurance must survive the branch.
      expect(msg).toMatch(/console, network/i);
    } finally {
      delete w.__TRACEBUG_INITIALIZED__;
    }
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

// ── Manual-testing findings (2026-10-13) ───────────────────────────────────
// Three bugs found by actually using the thing on figma.com. Each is the kind
// that unit tests miss because it only shows up inside a real, hostile page.
describe('copying a ticket does not destroy it', () => {
  const SRC = readFileSync(join(root, 'src', 'ui', 'quick-bug.ts'), 'utf8');

  /** The handler body for one action, up to the next listener registration. */
  function handler(action: string): string {
    const i = SRC.indexOf(`'[data-action="${action}"]'`);
    expect(i, `no handler for ${action}`).toBeGreaterThan(-1);
    // Without the paren: the next registration may be
    // `modal.querySelector<HTMLButtonElement>(`, and the generic breaks a
    // substring match on `modal.querySelector(` - which ran the Jira slice on
    // into the Save Ticket block and its legitimate _clearDraft().
    const next = SRC.indexOf('modal.querySelector', i + 10);
    return SRC.slice(i, next > 0 ? next : i + 3000);
  }

  it.each(['github', 'jira', 'slack'])('copy action "%s" leaves the modal open', (action) => {
    // Copying is not filing. The user may paste it, decide it needs an edit,
    // and copy again - or copy AND export. Closing destroyed unsaved work.
    const body = handler(action);
    expect(body).not.toContain('setTimeout(close, 300)');
    expect(body).not.toContain('_clearDraft()');
  });

  it('still closes after the ticket is actually FILED', () => {
    // The distinction that makes the above safe: opening a prefilled issue
    // page, or creating one through the API, does finish the ticket.
    const filed = SRC.slice(SRC.indexOf('function _fileViaTracker'));
    expect(filed.slice(0, 3000)).toContain('setTimeout(close, 300)');
  });
});

describe('scrollable UI survives a host page that eats the wheel', () => {
  const SRC = readFileSync(join(root, 'src', 'ui', 'quick-bug.ts'), 'utf8');

  it('scrolls by setting scrollTop, not by relying on the default', () => {
    // A canvas app preventDefaults wheel from a capture-phase window listener,
    // which beats anything registered later. stopPropagation cannot help; only
    // doing the scroll ourselves can.
    const fn = SRC.slice(SRC.indexOf('function _ownWheelScroll'), SRC.indexOf('// \u2500\u2500 AI prompt popover'));
    expect(fn).toContain('el.scrollTop = before');
    expect(fn).toContain('{ passive: false }');
    // And hands the event back at its own limits, so the user is not trapped.
    expect(fn).toContain('if (el.scrollTop !== before)');
  });

  it('is applied to the AI preview and the ticket modal panels', () => {
    expect(SRC).toContain('_ownWheelScroll(preview)');
    expect(SRC).toContain('.tb-qb-tabpanels');
    expect(SRC).toContain('.tb-qb-left');
  });
});
