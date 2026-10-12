// Phase 3: the service worker's tab lifecycle, tested against the real
// tracebug-extension/background.js (loaded in a node:vm context with a
// recording fake `chrome` — see tests/helpers/chrome-mock.ts).
//
// Two things here had no automated coverage at all before this file, and both
// are the kind that fail silently in production:
//
//   1. ORPHANED TABS. A tab left open across an extension update keeps a dead
//      content script. content-script.js suppresses the orphan errors on
//      purpose (a clean host-page console) and handleComboAction used to
//      swallow the dispatch rejection, so a popup action just did nothing.
//
//   2. THE DECLINED-HOST-ACCESS PATH. Phase 1 made <all_urls> optional and
//      recorded this as its open issue: granting an optional permission needs
//      a native dialog no test runner can click, so every e2e harness tests
//      the GRANTED state. With chrome.permissions mocked to false, the parts
//      that do not need a dialog become testable — and the most dangerous one
//      is re-injection after navigation, because `tab.url` is undefined
//      without site access and the old `!tab.url` guard would have killed it.
import { describe, it, expect, beforeEach } from 'vitest';
import { createChromeMock, loadBackground, settle, type ChromeMock } from './helpers/chrome-mock';

const TAB = 7;
const SESSION_KEY = 'tb_sw_state_v1';

/** Fire tabs.onUpdated the way Chrome does on a completed navigation. */
function navigate(mock: ChromeMock, tabId: number, tab: Record<string, unknown> = {}) {
  return Promise.all(mock.events.onTabUpdated.emit(tabId, { status: 'complete' }, tab));
}

/** Call the worker's onMessage listeners and resolve what sendResponse got. */
function ask(mock: ChromeMock, message: Record<string, unknown>, sender: Record<string, unknown> = {}) {
  return new Promise<Record<string, unknown> | undefined>((resolve) => {
    let answered = false;
    const sendResponse = (r: Record<string, unknown> | undefined) => {
      if (!answered) { answered = true; resolve(r); }
    };
    mock.events.onMessage.emit(message, sender, sendResponse);
    // A handler that never answers must not hang the suite.
    setTimeout(() => sendResponse(undefined), 800);
  });
}

describe('re-injection after navigation with site access DECLINED', () => {
  let mock: ChromeMock;

  beforeEach(async () => {
    // grantedOrigins is empty — chrome.permissions.contains answers false for
    // <all_urls>, i.e. the user declined, which is also a fresh 1.11 install.
    mock = createChromeMock({ session: { [SESSION_KEY]: { activeTabs: [TAB], recordingTabId: null } } });
    loadBackground(mock);
    await settle(20);
  });

  it('reports host access as withheld', async () => {
    // This is the answer that reaches the SDK as data-tb-caps.hostAccess and
    // drives the "capturing this page only" notice.
    expect(await ask(mock, { type: 'TB_HOST_ACCESS' })).toEqual({ granted: false });
  });

  it('still ATTEMPTS re-injection, with the right tabId, when tab.url is undefined', async () => {
    // THE regression guard. Without <all_urls>, `tab` carries no url — and
    // activeTab still covers a same-origin navigation, so skipping the
    // re-injection here would break a case that works today.
    await navigate(mock, TAB, {});
    await settle(60);

    const targeted = mock.injections.filter((i) => i.target.tabId === TAB);
    expect(targeted.length).toBeGreaterThan(0);
    expect(targeted[0].files).toContain('content-script.js');
    // No injection may be aimed anywhere else.
    expect(mock.injections.every((i) => i.target.tabId === TAB)).toBe(true);
  });

  it('swallows the re-injection failure silently', async () => {
    // A restricted page, or a tab that closed mid-navigation. This path has no
    // user waiting on it (nobody clicked anything), so it must not reject —
    // an unhandled rejection in a service worker is a console error on every
    // navigation. The .catch(() => {}) in the onUpdated listener is
    // load-bearing; assert it rather than reading it.
    const unhandled: unknown[] = [];
    const onUnhandled = (e: PromiseRejectionEvent) => { unhandled.push(e.reason); };
    process.on('unhandledRejection', onUnhandled as never);

    mock.failInjection(TAB, 'Cannot access contents of the page.');
    await expect(navigate(mock, TAB, {})).resolves.toBeDefined();
    await settle(80);

    process.off('unhandledRejection', onUnhandled as never);
    expect(unhandled).toEqual([]);
    // It really did try before failing.
    expect(mock.injections.some((i) => i.target.tabId === TAB)).toBe(true);
  });

  it('does not re-inject a tab the user never turned on', async () => {
    await navigate(mock, 1234, {});
    await settle(60);
    expect(mock.injections.some((i) => i.target.tabId === 1234)).toBe(false);
  });

  it('re-injects the tab being recorded even when it is not in activeTabs', async () => {
    const rec = createChromeMock({ session: { [SESSION_KEY]: { activeTabs: [], recordingTabId: 42 } } });
    loadBackground(rec);
    await settle(20);
    await navigate(rec, 42, {});
    await settle(60);
    expect(rec.injections.some((i) => i.target.tabId === 42)).toBe(true);
  });
});

describe('orphaned tabs — ping, repair, or say so', () => {
  let mock: ChromeMock;

  beforeEach(async () => {
    mock = createChromeMock();
    loadBackground(mock);
    await settle(20);
  });

  it('pings before dispatching, and dispatches when the tab answers', async () => {
    // First action on a fresh tab: full injection, then the action message.
    mock.setTabLive(TAB, true, true);
    const res = await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    expect(res).toEqual({ ok: true });
    expect(mock.sentOfType('TB_CAPTURE_NOW').length).toBe(1);
  });

  it('repairs an orphaned tab by replacing the BRIDGE ONLY', async () => {
    // Set the tab up as injected-but-orphaned: the worker believes it is
    // loaded (first action succeeded), then the content script dies while the
    // page-world SDK keeps running — exactly what an extension update does.
    mock.setTabLive(TAB, true, true);
    await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    const before = mock.injections.length;
    mock.setTabLive(TAB, false, true); // orphaned, page SDK still alive
    const res = await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    expect(res).toEqual({ ok: true });
    const repair = mock.injections.slice(before);
    expect(repair.length).toBeGreaterThan(0);
    // The bridge is replaced...
    expect(repair.some((i) => i.files.includes('content-script.js'))).toBe(true);
    // ...and the page world is NOT, or a second toolbar mounts on top of the
    // first. This is why the ping answer carries `pageSdk`.
    expect(repair.some((i) => i.world === 'MAIN')).toBe(false);
  });

  it('re-injects the page world too when the page has no SDK left', async () => {
    mock.setTabLive(TAB, true, true);
    await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    const before = mock.injections.length;
    mock.setTabLive(TAB, false, false); // orphaned AND the page was reloaded
    await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    const repair = mock.injections.slice(before);
    expect(repair.some((i) => i.files.includes('content-script.js'))).toBe(true);
    expect(repair.some((i) => i.world === 'MAIN' && i.files.includes('tracebug-sdk.js'))).toBe(true);
  });

  it('answers with an error the popup can map when the repair fails', async () => {
    mock.setTabLive(TAB, true, true);
    await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    mock.setTabLive(TAB, false, false);
    mock.failInjection(TAB, 'Cannot access contents of the page.');
    const res = await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    // NOT {ok:true}, and not silence — the popup needs a string to explain.
    expect(res?.error).toBeTruthy();
    expect(typeof res?.error).toBe('string');
  });

  it('a tab that injects fine but never answers reports the reload wording', async () => {
    // executeScript resolves and the tab STILL does not respond. This is the
    // one state where there is nothing left for the worker to try, and the
    // error it raises is the exact string page-support.js maps to
    // "Reload this tab to capture" with a Reload tab button.
    mock.setTabLive(TAB, true, true);
    await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(400);

    mock.setTabLive(TAB, false, false);
    mock.setNeverRevive(TAB);
    const res = await ask(mock, { type: 'TB_CAPTURE_NOW', tabId: TAB });
    await settle(500);

    expect(res?.error).toBeTruthy();
    expect(String(res?.error)).toMatch(/Receiving end does not exist|Could not establish connection/i);
    // And it did attempt the repair rather than giving up on the ping alone.
    expect(mock.injections.some((i) => i.files.includes('content-script.js'))).toBe(true);
  });
});
