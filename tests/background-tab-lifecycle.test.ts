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
    expect(await ask(mock, { type: 'TB_HOST_ACCESS' })).toMatchObject({ granted: false });
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

describe('an extension update never kills a recording', () => {
  // chrome.runtime.onUpdateAvailable was unhandled before Phase 3, so an
  // auto-update mid-recording tore down the worker AND the recorder host —
  // and the video only exists in the recorder's memory until the stop
  // finalizes it. Chrome holds the update until we reload, so this is a
  // decision: reload now, or hold it until the recording has ended.

  it('reloads straight away when nothing is being recorded', async () => {
    const mock = createChromeMock();
    loadBackground(mock);
    await settle(20);

    mock.events.onUpdateAvailable.emit({ version: '1.11.1' });
    await settle(40);
    expect(mock.runtimeReloads).toBe(0); // not synchronously, mid-handler
    await settle(2200);
    expect(mock.runtimeReloads).toBe(1);
  });

  it('holds the update while a recording is in progress', async () => {
    const mock = createChromeMock({
      session: { [SESSION_KEY]: { activeTabs: [TAB], recordingTabId: TAB } },
    });
    loadBackground(mock);
    await settle(20);

    mock.events.onUpdateAvailable.emit({ version: '1.11.1' });
    await settle(2400);

    expect(mock.runtimeReloads).toBe(0);
    // And it is written down, so a worker restart mid-recording still knows.
    const saved = mock.sessionStore[SESSION_KEY] as Record<string, unknown>;
    expect(saved.updatePending).toBe(true);
    expect(saved.updatePendingFrom).toBe('1.11.0'); // the mock's manifest version
  });

  it('applies the held update once the recording ends', async () => {
    const mock = createChromeMock({
      session: { [SESSION_KEY]: { activeTabs: [TAB], recordingTabId: TAB } },
    });
    loadBackground(mock);
    await settle(20);

    mock.events.onUpdateAvailable.emit({ version: '1.11.1' });
    await settle(100);
    expect(mock.runtimeReloads).toBe(0);

    // The recording ends. Every end path clears _recordingTabId and then
    // calls persistState, which is where the held update is re-checked —
    // this one is the toolbar's ✕ / tab-disable path.
    await ask(mock, { type: 'TB_DISABLE_TAB', tabId: TAB });
    await settle(2400);

    expect(mock.runtimeReloads).toBe(1);
  });

  it('applies a held update when the recording tab is simply closed', async () => {
    // A different end path, to prove the choke point really is shared rather
    // than one hook on one handler.
    const mock = createChromeMock({
      session: { [SESSION_KEY]: { activeTabs: [TAB], recordingTabId: TAB } },
    });
    loadBackground(mock);
    await settle(20);

    mock.events.onUpdateAvailable.emit({ version: '1.11.1' });
    await settle(100);
    mock.events.onTabRemoved.emit(TAB);
    await settle(2400);

    expect(mock.runtimeReloads).toBe(1);
  });

  it('a worker restart mid-recording still remembers the held update', async () => {
    // The worker is terminated after ~30s idle and comes back with blank
    // memory. The flag is rehydrated, and nothing reloads until the
    // recording ends.
    const mock = createChromeMock({
      session: {
        [SESSION_KEY]: {
          activeTabs: [TAB],
          recordingTabId: TAB,
          updatePending: true,
          updatePendingFrom: '1.11.0',
        },
      },
    });
    loadBackground(mock);
    await settle(2400);
    expect(mock.runtimeReloads).toBe(0);

    await ask(mock, { type: 'TB_DISABLE_TAB', tabId: TAB });
    await settle(2400);
    expect(mock.runtimeReloads).toBe(1);
  });

  it('a worker restart with no recording applies the held update immediately', async () => {
    const mock = createChromeMock({
      session: { [SESSION_KEY]: { activeTabs: [], recordingTabId: null, updatePending: true, updatePendingFrom: '1.11.0' } },
    });
    loadBackground(mock);
    await settle(2400);
    expect(mock.runtimeReloads).toBe(1);
  });

  it('IGNORES a pending flag left behind by a version that already updated', async () => {
    // The reload loop this prevents: reload applies the update, a stale flag
    // survives, the new version reads it and reloads again, forever. The
    // version stamp is what breaks the cycle.
    const mock = createChromeMock({
      session: { [SESSION_KEY]: { activeTabs: [], recordingTabId: null, updatePending: true, updatePendingFrom: '1.10.1' } },
    });
    loadBackground(mock);
    await settle(2400);
    expect(mock.runtimeReloads).toBe(0);
  });

  // NOT covered here: a recording that STARTS inside the 2-second reload
  // delay. maybeApplyUpdate re-checks _recordingTabId before reloading for
  // exactly that case, but driving a successful tb:rec:start needs a working
  // offscreen/recorder host, which this fake deliberately does not model.
});

describe('the keyboard command (Phase 3)', () => {
  // Ctrl/Cmd+Shift+B was only ever a keydown handler inside the injected SDK,
  // so it did nothing on a tab TraceBug had never run on — which is the first
  // thing docs/quickstart.md tells a new user to press. It is a real browser
  // command now, and a command invocation grants activeTab, so it needs no
  // host permission.

  it('reports the bound shortcut so no UI has to hardcode the key', async () => {
    const mock = createChromeMock({
      commands: [{ name: 'tb-quick-capture', shortcut: 'Ctrl+Shift+B' }],
    });
    loadBackground(mock);
    await settle(20);
    expect(await ask(mock, { type: 'TB_HOST_ACCESS' })).toMatchObject({ shortcut: 'Ctrl+Shift+B' });
  });

  it('reports "" when the browser bound nothing', async () => {
    // The real possibility on Chrome: Ctrl+Shift+B is the bookmarks bar.
    const mock = createChromeMock({ commands: [{ name: 'tb-quick-capture', shortcut: '' }] });
    loadBackground(mock);
    await settle(20);
    expect(await ask(mock, { type: 'TB_HOST_ACCESS' })).toMatchObject({ shortcut: '' });
  });

  it('captures the active tab from a cold start, with no site access', async () => {
    const mock = createChromeMock({ commands: [{ name: 'tb-quick-capture', shortcut: 'Ctrl+Shift+B' }] });
    loadBackground(mock);
    await settle(20);
    mock.setTabLive(7, true, true);

    mock.events.onCommand.emit('tb-quick-capture');
    await settle(500);

    // Full injection into the active tab (chrome.tabs.query returns id 7)...
    expect(mock.injections.some((i) => i.target.tabId === 7 && i.files.includes('content-script.js'))).toBe(true);
    // ...then the same action the popup's screenshot button dispatches, which
    // is what the in-page shortcut does: fresh screenshot + Quick Bug modal.
    expect(mock.sentOfType('TB_CAPTURE_NOW').length).toBe(1);
  });

  it('ignores a command that is not ours', async () => {
    const mock = createChromeMock();
    loadBackground(mock);
    await settle(20);
    mock.events.onCommand.emit('some-other-command');
    await settle(200);
    expect(mock.injections.length).toBe(0);
  });

  it('explains a failure on the toolbar button, since there is no popup', async () => {
    // A service worker has nowhere to talk: no popup, and TraceBug has no
    // notifications permission. The badge and its tooltip are the whole
    // surface — documented in docs/testing/restricted-pages.md.
    const mock = createChromeMock({ commands: [{ name: 'tb-quick-capture', shortcut: 'Ctrl+Shift+B' }] });
    loadBackground(mock);
    await settle(20);
    mock.failInjection(7, 'Cannot access contents of the page.');

    mock.events.onCommand.emit('tb-quick-capture');
    await settle(400);

    expect(mock.badge.some((b) => b.text === '!')).toBe(true);
    const title = mock.titles.map((t) => String(t.title)).join(' | ');
    expect(title).toMatch(/TraceBug/);
    // The mapped sentence, not the raw browser string.
    expect(title).toMatch(/Browsers block extensions/);
    expect(title).not.toMatch(/Cannot access contents/);
  });
});

// ── Phase 4: video is opt-in ───────────────────────────────────────────────
// The popup's Capture Bug runs an events-only capture unless the user has
// turned video on. The worker is the narrow point that whole choice passes
// through, and it rebuilds the message field by field (an allowlist — a page
// must not be able to smuggle options in), so a dropped field here means the
// user's choice silently reverts. Which direction it reverts in matters: an
// undefined `video` must mean NO screen-share picker, never "default to yes".
describe('the video opt-in reaches the page', () => {
  let mock: ChromeMock;

  beforeEach(async () => {
    mock = createChromeMock();
    loadBackground(mock);
    await settle(20);
    mock.setTabLive(TAB, true, true);
  });

  it('forwards video:false when the option is off', async () => {
    await ask(mock, { type: 'TB_START_RECORDING', tabId: TAB, video: false });
    await settle(400);
    const sent = mock.sentOfType('TB_START_RECORDING');
    expect(sent.length).toBe(1);
    expect(sent[0].message.video).toBe(false);
  });

  it('defaults to video:false when the field is absent', async () => {
    // The dangerous direction. An older popup, a replayed message or a dropped
    // field must land on the quiet capture, not open a screen-share picker.
    await ask(mock, { type: 'TB_START_RECORDING', tabId: TAB });
    await settle(400);
    expect(mock.sentOfType('TB_START_RECORDING')[0].message.video).toBe(false);
  });

  it('forwards video:true with the surface and mic that only mean anything then', async () => {
    await ask(mock, {
      type: 'TB_START_RECORDING',
      tabId: TAB,
      video: true,
      withMic: true,
      surfaceMode: 'tab',
      delaySec: 3,
      blurFirst: true,
    });
    await settle(400);
    expect(mock.sentOfType('TB_START_RECORDING')[0].message).toMatchObject({
      video: true,
      withMic: true,
      surfaceMode: 'tab',
      delaySec: 3,
      blurFirst: true,
    });
  });

  it('coerces a non-boolean video field rather than passing it through', async () => {
    await ask(mock, { type: 'TB_START_RECORDING', tabId: TAB, video: 'yes' });
    await settle(400);
    expect(mock.sentOfType('TB_START_RECORDING')[0].message.video).toBe(true);
  });
});
