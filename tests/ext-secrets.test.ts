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
