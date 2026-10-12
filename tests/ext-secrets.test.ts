// Phase 2a: in EXTENSION mode, secrets must never enter the page world.
//
// In extension mode the SDK runs in the host page's MAIN world, so anything it
// stores in localStorage — or renders into the DOM — is readable by the site
// under test. These tests pin the three closed paths:
//   1. at rest   — nothing written to / read from page localStorage
//   2. at entry  — no token field, and no pre-filled value, in page DOM
//   3. status    — "configured?" still answers synchronously, from booleans
// plus the lazy migration of pre-1.11 page-stored keys.
//
// SDK (npm) mode must keep its existing behaviour throughout.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setTransportMode, isExtensionMode, setIntegrationStatus, getIntegrationStatus,
  setHostAccess, getHostAccess, isCaptureLimitedToThisPage, shouldShowPageOnlyNotice,
  setBoundShortcut, getBoundShortcut, browserOwnsQuickCapture,
} from '../src/ext-transport';
import {
  getIntegrationsConfig, setIntegrationsConfig, clearIntegrationsConfig,
  hasIntegration, createTrackerIssue, STORAGE_KEY as INT_STORAGE_KEY,
} from '../src/integrations/tracker-client';
import {
  getAIConfig, setAIConfig, clearAIConfig, hasAIKey,
} from '../src/ai/llm-client';

const AI_STORAGE_KEY = 'tracebug_ai_config';

// The id the SDK generated for the in-flight bridge request, captured so the
// test can answer it the way the content script would.
let _lastRequestId = '';
const lastId = () => _lastRequestId;
if (typeof window !== 'undefined') {
  window.addEventListener('tracebug-provider-request', (e) => {
    _lastRequestId = ((e as CustomEvent).detail || {}).id || '';
  });
}

/** Minimal report the markdown builders can render without throwing. */
function buildFakeReport() {
  return {
    title: 'Login fails',
    severity: 'high',
    steps: '1. click login',
    consoleErrors: [],
    networkErrors: [],
    environment: {},
  } as never;
}

const GH_TOKEN = 'ghp_pleaseDoNotLeakMe0123456789';
const AI_TOKEN = 'sk-ant-pleaseDoNotLeakMe0123456789';

afterEach(() => {
  // Leave every test in SDK mode so one failure can't mask another file's.
  setTransportMode('page');
  setIntegrationStatus(null);
  setHostAccess(undefined);
  localStorage.clear();
});

describe('extension mode — transport flag', () => {
  it('defaults to page (SDK) mode', () => {
    expect(isExtensionMode()).toBe(false);
  });

  it('is set only by an explicit "extension" transport', () => {
    setTransportMode('extension');
    expect(isExtensionMode()).toBe(true);
    setTransportMode(undefined);
    expect(isExtensionMode()).toBe(false);
    // Anything unrecognized must fail closed to page mode, not extension mode.
    setTransportMode('nonsense' as unknown as 'page');
    expect(isExtensionMode()).toBe(false);
  });
});

describe('extension mode — no secret at rest in page localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    setTransportMode('extension');
  });

  it('refuses to write integration tokens to page localStorage', () => {
    setIntegrationsConfig({ github: { token: GH_TOKEN, repo: 'o/r' } });
    expect(localStorage.getItem(INT_STORAGE_KEY)).toBeNull();
    // And nothing anywhere in page storage contains the token.
    expect(JSON.stringify(localStorage)).not.toContain(GH_TOKEN);
  });

  it('refuses to write the AI key to page localStorage', () => {
    setAIConfig({ provider: 'anthropic', apiKey: AI_TOKEN, model: 'claude-sonnet-4-6' });
    expect(localStorage.getItem(AI_STORAGE_KEY)).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain(AI_TOKEN);
  });

  it('never returns a token even if one is already sitting in page storage', () => {
    // Simulates a pre-1.11 page that still holds secrets before migration runs.
    localStorage.setItem(INT_STORAGE_KEY, JSON.stringify({ github: { token: GH_TOKEN, repo: 'o/r' } }));
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify({ provider: 'anthropic', apiKey: AI_TOKEN, model: 'm' }));

    expect(getIntegrationsConfig()).toEqual({});
    expect(getAIConfig()).toBeNull();
    expect(JSON.stringify(getIntegrationsConfig())).not.toContain(GH_TOKEN);
  });

  it('refuses to send when nothing is configured, and points at settings', async () => {
    setIntegrationStatus({ github: false, linear: false, slack: false, ai: false });
    await expect(createTrackerIssue('github', {} as never)).rejects.toThrow(/TraceBug settings/i);
  });

  it('never fetches from the page world — the send goes over the bridge', async () => {
    // Phase 2b: the page-world path must not make the provider call itself,
    // because the token is deliberately out of its reach. It hands CONTENT to
    // the background worker over a CustomEvent and waits. The token is never
    // needed here, so a page that monkey-patched fetch() learns nothing.
    setIntegrationStatus({ github: false, linear: false, slack: true, ai: false });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const dispatched: string[] = [];
    const spy = (e: Event) => {
      dispatched.push(e.type);
      const detail = (e as CustomEvent).detail;
      // Only content crosses: no webhook URL, no token, no destination.
      expect(Object.keys(detail.data)).toEqual(['provider', 'payload']);
      expect(detail.data.provider).toBe('slack');
      expect(Object.keys(detail.data.payload)).toEqual(['text']);
      expect(JSON.stringify(detail)).not.toContain('hooks.slack.com');
    };
    window.addEventListener('tracebug-provider-request', spy);
    try {
      const pending = createTrackerIssue('slack', buildFakeReport());
      // Settle it the way the content script would after a cancel, so the
      // promise does not dangle for the test's lifetime.
      window.dispatchEvent(new CustomEvent('tracebug-provider-result', {
        detail: { id: (dispatched.length ? lastId() : ''), cancelled: true, error: 'Send cancelled.' },
      }));
      await expect(pending).rejects.toThrow(/cancelled/i);
    } finally {
      window.removeEventListener('tracebug-provider-request', spy);
      fetchMock.mockRestore();
    }
    expect(dispatched).toEqual(['tracebug-provider-request']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('extension mode — status snapshot answers synchronously', () => {
  beforeEach(() => {
    localStorage.clear();
    setTransportMode('extension');
  });

  it('reports configured providers from the pushed booleans', () => {
    setIntegrationStatus({ github: true, linear: false, slack: true, ai: true });
    expect(hasIntegration('github')).toBe(true);
    expect(hasIntegration('linear')).toBe(false);
    expect(hasIntegration('slack')).toBe(true);
    expect(hasAIKey()).toBe(true);
  });

  it('coerces a hostile or malformed snapshot to plain booleans', () => {
    // A page could write anything into the bridge attribute; the value must
    // never survive as a string that could be mistaken for a token.
    setIntegrationStatus({ github: GH_TOKEN as unknown as boolean });
    expect(getIntegrationStatus().github).toBe(true);
    expect(getIntegrationStatus().github).not.toBe(GH_TOKEN);
    expect(JSON.stringify(getIntegrationStatus())).not.toContain(GH_TOKEN);

    setIntegrationStatus(null);
    expect(getIntegrationStatus()).toEqual({ github: false, linear: false, slack: false, ai: false });
    expect(hasIntegration('github')).toBe(false);
  });

  it('does not consult page localStorage for status', () => {
    localStorage.setItem(INT_STORAGE_KEY, JSON.stringify({ github: { token: GH_TOKEN, repo: 'o/r' } }));
    setIntegrationStatus({ github: false, linear: false, slack: false, ai: false });
    // Page storage says configured; the snapshot says no. The snapshot wins.
    expect(hasIntegration('github')).toBe(false);
  });
});

describe('SDK (npm) mode — behaviour unchanged', () => {
  beforeEach(() => {
    localStorage.clear();
    setTransportMode('page');
  });

  it('still round-trips integration config through localStorage', () => {
    setIntegrationsConfig({ github: { token: GH_TOKEN, repo: 'o/r' } });
    expect(localStorage.getItem(INT_STORAGE_KEY)).toContain(GH_TOKEN);
    expect(getIntegrationsConfig().github?.token).toBe(GH_TOKEN);
    expect(hasIntegration('github')).toBe(true);
    clearIntegrationsConfig();
    expect(localStorage.getItem(INT_STORAGE_KEY)).toBeNull();
  });

  it('still round-trips the AI key through localStorage', () => {
    setAIConfig({ provider: 'anthropic', apiKey: AI_TOKEN, model: 'claude-sonnet-4-6' });
    expect(getAIConfig()?.apiKey).toBe(AI_TOKEN);
    expect(hasAIKey()).toBe(true);
    clearAIConfig();
    expect(getAIConfig()).toBeNull();
  });

  it('ignores the extension status snapshot entirely', () => {
    setIntegrationStatus({ github: true, linear: true, slack: true, ai: true });
    // Nothing configured locally, so SDK mode must still report false.
    expect(hasIntegration('github')).toBe(false);
    expect(hasAIKey()).toBe(false);
  });
});

// ── Phase 1: cross-site capture access ─────────────────────────────────────
// <all_urls> is an OPTIONAL host permission from 1.11, so "will capture
// survive a navigation?" has three answers, and the third one is "we don't
// know". A wrong "you have no access" hint is worse than no hint, so unknown
// must stay silent.
describe('cross-site capture access', () => {
  it('starts unknown, and unknown is not a limitation', () => {
    setTransportMode('extension');
    expect(getHostAccess()).toBeUndefined();
    expect(isCaptureLimitedToThisPage()).toBe(false);
  });

  it('reports a limitation only when access is explicitly withheld', () => {
    setTransportMode('extension');
    setHostAccess(false);
    expect(getHostAccess()).toBe(false);
    expect(isCaptureLimitedToThisPage()).toBe(true);

    setHostAccess(true);
    expect(isCaptureLimitedToThisPage()).toBe(false);
  });

  it('treats a missing or non-boolean value as unknown', () => {
    setTransportMode('extension');
    setHostAccess(false);
    // JSON.stringify drops an undefined key, so the attribute simply omits it.
    setHostAccess(undefined);
    expect(getHostAccess()).toBeUndefined();
    setHostAccess(null);
    expect(getHostAccess()).toBeUndefined();
    // A hostile page can rewrite data-tb-caps; a truthy non-boolean must not
    // become `true`, and must not become a limitation claim either.
    setHostAccess('yes' as unknown as boolean);
    expect(getHostAccess()).toBeUndefined();
    expect(isCaptureLimitedToThisPage()).toBe(false);
  });

  it('never claims a limitation in SDK (npm) mode', () => {
    // Page-mode capture has no extension permission in the picture at all.
    setHostAccess(false);
    expect(isCaptureLimitedToThisPage()).toBe(false);
  });
});

describe('the page-only notice fires once, and only when access is withheld', () => {
  // Phase 3. The "capturing this page only" toast (noteCaptureIsPageOnly in
  // src/dashboard.ts) has to be a once-per-page instruction: it fires on the
  // keyboard-shortcut path, which a user may hit repeatedly, and repeating an
  // instruction they have already read is noise. The decision lives in
  // ext-transport so it is reachable from here — the withheld-access path
  // cannot be driven end-to-end by any harness, because granting an optional
  // permission needs a native dialog (Phase 1's open issue).

  it('shows once, then never again for that page', () => {
    setTransportMode('extension');
    setHostAccess(false);
    expect(shouldShowPageOnlyNotice()).toBe(true);
    expect(shouldShowPageOnlyNotice()).toBe(false);
    expect(shouldShowPageOnlyNotice()).toBe(false);
  });

  it('stays silent when access is granted', () => {
    setTransportMode('extension');
    setHostAccess(true);
    expect(shouldShowPageOnlyNotice()).toBe(false);
  });

  it('stays silent when access is UNKNOWN', () => {
    // A wrong "you have no access" hint is worse than no hint, and `undefined`
    // is a real state: a pre-1.11 content script, or a page that stripped the
    // attribute.
    setTransportMode('extension');
    setHostAccess(undefined);
    expect(shouldShowPageOnlyNotice()).toBe(false);
  });

  it('stays silent in SDK (npm) mode even with access withheld', () => {
    setTransportMode('page');
    setHostAccess(false);
    expect(shouldShowPageOnlyNotice()).toBe(false);
  });

  it('does not burn its one chance while access is still unknown', () => {
    // Ordering that really happens: the shortcut is pressed before the
    // content script has published data-tb-caps. The early call must not
    // consume the notice, or the user never sees it.
    setTransportMode('extension');
    setHostAccess(undefined);
    expect(shouldShowPageOnlyNotice()).toBe(false);
    setHostAccess(false);
    expect(shouldShowPageOnlyNotice()).toBe(true);
  });

  it('re-arms on a fresh init', () => {
    setTransportMode('extension');
    setHostAccess(false);
    expect(shouldShowPageOnlyNotice()).toBe(true);
    // A new page load re-runs init(), and the notice is per page.
    setTransportMode('extension');
    setHostAccess(false);
    expect(shouldShowPageOnlyNotice()).toBe(true);
  });
});

describe('one Ctrl+Shift+B press never fires both handlers', () => {
  // Phase 3 made the combo a real browser `commands` entry so it works on a
  // tab TraceBug has never run on — which is what docs/quickstart.md has been
  // telling new users to press. That gives the key two possible owners, and
  // the rule has to be deterministic rather than relying on the modal's
  // isQuickBugOpen() race guard.

  it('stands down when the browser bound this exact combo', () => {
    setTransportMode('extension');
    setBoundShortcut('Ctrl+Shift+B');
    expect(browserOwnsQuickCapture()).toBe(true);
  });

  it('accepts the macOS spellings of the same combo', () => {
    setTransportMode('extension');
    // chrome.commands.getAll() reports either form depending on platform.
    for (const key of ['Command+Shift+B', 'Cmd+Shift+B', '⌘⇧B', 'MacCtrl+Shift+B']) {
      setBoundShortcut(key);
      expect(browserOwnsQuickCapture(), key).toBe(true);
    }
  });

  it('keeps the in-page handler when the user rebound the command', () => {
    // The browser no longer owns Ctrl+Shift+B, so the page handler is the
    // only thing that would answer it — silencing it would lose the key.
    setTransportMode('extension');
    for (const key of ['Alt+Shift+B', 'Ctrl+Shift+Y', 'Ctrl+Shift+B+K', 'Ctrl+B']) {
      setBoundShortcut(key);
      expect(browserOwnsQuickCapture(), key).toBe(false);
    }
  });

  it('keeps the in-page handler when NOTHING is bound', () => {
    // The likely case on Chrome: Ctrl+Shift+B is the bookmarks bar, so the
    // suggested key may never have bound. The page handler must still work.
    setTransportMode('extension');
    setBoundShortcut('');
    expect(browserOwnsQuickCapture()).toBe(false);
    setBoundShortcut(undefined);
    expect(browserOwnsQuickCapture()).toBe(false);
    setBoundShortcut(null);
    expect(getBoundShortcut()).toBe('');
    expect(browserOwnsQuickCapture()).toBe(false);
  });

  it('never stands down in SDK (npm) mode', () => {
    // No browser command exists there at all, whatever the attribute says.
    setTransportMode('page');
    setBoundShortcut('Ctrl+Shift+B');
    expect(browserOwnsQuickCapture()).toBe(false);
  });

  it('forgets the shortcut on a fresh init', () => {
    // Until the content script republishes, we know nothing — and claiming a
    // key is bound would silence the in-page handler for no reason.
    setTransportMode('extension');
    setBoundShortcut('Ctrl+Shift+B');
    setTransportMode('extension');
    expect(getBoundShortcut()).toBe('');
    expect(browserOwnsQuickCapture()).toBe(false);
  });

  it('coerces a hostile non-string to ""', () => {
    // data-tb-caps is page-writable; a rewritten shortcut must not become a
    // reason to disable the only working handler.
    setTransportMode('extension');
    setBoundShortcut({ toString: () => 'Ctrl+Shift+B' } as unknown as string);
    expect(getBoundShortcut()).toBe('');
    expect(browserOwnsQuickCapture()).toBe(false);
  });
});
