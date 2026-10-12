// Phase 3: "TraceBug can't run on this page", and every other way an action
// can fail without becoming a no-op.
//
// Two decisions, both shipped in tracebug-extension/page-support.js and both
// tested here against the REAL file in a node:vm sandbox (same pattern as
// tests/provider-bridge.test.ts and tests/secret-migration.test.ts), so this
// covers the artifact rather than a copy of it:
//
//   classifyPage()          — before injecting, from tab.url
//   explainInjectionError() — after a failure, from the browser's own string
//
// The regression this file exists to prevent: a missing tab.url must NOT be
// treated as a restricted page. Phase 1 made <all_urls> optional, so an
// unknown URL is now the normal state on a tab the user hasn't acted on — the
// old inline guard in popup.js would have shown "Can't run on this page" on
// literally every page.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const sandbox: Record<string, unknown> = { URL };
const ctx = createContext(sandbox);
runInContext(readFileSync(join(extDir, 'page-support.js'), 'utf8'), ctx);

interface Verdict {
  ok: boolean;
  reason?: string;
  title?: string;
  detail?: string;
  action?: string | null;
  url?: string;
}

const P = sandbox.TraceBugPageSupport as {
  BLOCKED_SCHEMES: string[];
  BLOCKED_HOSTS: string[];
  DEMO_URL: string;
  classifyPage: (url: string | undefined, opts?: { fileAccess?: boolean }) => Verdict;
  explainInjectionError: (err: unknown) => Verdict;
};

describe('classifyPage — browser-internal schemes', () => {
  const blocked = [
    'chrome://extensions',
    'chrome://newtab/',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html',
    'chrome-untrusted://print',
    'edge://settings',
    'about:debugging',
    'about:addons',
    'about:blank',
    'moz-extension://11111111-2222-3333-4444-555555555555/options.html',
    'resource://gre/modules/XPCOMUtils.jsm',
    'view-source:https://example.com/',
    'devtools://devtools/bundled/inspector.html',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      const v = P.classifyPage(url);
      expect(v.ok).toBe(false);
      expect(v.reason).toBe('browser-internal');
      // Every blocked page offers the demo page — the panel must never be a
      // dead end (Phase 3's acceptance criterion).
      expect(v.action).toBe('demo');
      expect(v.url).toBe('https://tracebug.dev/try.html');
      expect(v.detail).toBeTruthy();
    });
  }

  it('is case-insensitive about the scheme', () => {
    expect(P.classifyPage('CHROME://extensions').ok).toBe(false);
    expect(P.classifyPage('About:Config').ok).toBe(false);
  });

  it('allows an ordinary https page', () => {
    expect(P.classifyPage('https://example.com/app')).toEqual({ ok: true });
  });

  it('allows http and localhost', () => {
    expect(P.classifyPage('http://localhost:3000/').ok).toBe(true);
    expect(P.classifyPage('http://127.0.0.1:8080/x').ok).toBe(true);
  });
});

describe('classifyPage — extension galleries', () => {
  // The audit's own first-run scenario: the brand-new user still has the store
  // page open when they click the toolbar icon for the first time.
  const stores = [
    'https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj',
    'https://chrome.google.com/webstore/category/extensions',
    'https://addons.mozilla.org/en-US/firefox/addon/tracebug/',
    'https://accounts.firefox.com/signin',
    'https://microsoftedge.microsoft.com/addons/detail/abc',
    'https://addons.opera.com/en/extensions/',
  ];

  for (const url of stores) {
    it(`blocks ${new URL(url).hostname}`, () => {
      const v = P.classifyPage(url);
      expect(v.ok).toBe(false);
      expect(v.reason).toBe('webstore');
      expect(v.action).toBe('demo');
    });
  }

  it('blocks a subdomain of a blocked host', () => {
    expect(P.classifyPage('https://services.addons.mozilla.org/x').ok).toBe(false);
  });

  it('does NOT block a lookalike host', () => {
    // Substring matching would have blocked these. Hostname matching must not.
    expect(P.classifyPage('https://chromewebstore.google.com.evil.test/').ok).toBe(true);
    expect(P.classifyPage('https://notaddons.mozilla.org.evil.test/').ok).toBe(true);
    expect(P.classifyPage('https://example.com/?u=chromewebstore.google.com').ok).toBe(true);
  });
});

describe('classifyPage — file:// and the file-URL grant', () => {
  it('explains how to turn file access on when it is known to be OFF', () => {
    const v = P.classifyPage('file:///C:/tmp/report.html', { fileAccess: false });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('file-no-access');
    expect(v.action).toBe('file-access');
    expect(v.detail).toMatch(/Allow access to file URLs/);
  });

  it('allows file:// when access is granted', () => {
    expect(P.classifyPage('file:///tmp/x.html', { fileAccess: true }).ok).toBe(true);
  });

  it('allows file:// when the grant could not be asked (Firefox)', () => {
    // isAllowedFileSchemeAccess() does not exist in Firefox. An UNKNOWN grant
    // must not be reported as a denial — let the injection error speak.
    expect(P.classifyPage('file:///tmp/x.html').ok).toBe(true);
    expect(P.classifyPage('file:///tmp/x.html', {}).ok).toBe(true);
    expect(P.classifyPage('file:///tmp/x.html', { fileAccess: undefined }).ok).toBe(true);
  });
});

describe('classifyPage — a missing URL is not a restriction', () => {
  // THE regression guard for this file. With <all_urls> optional, tab.url is
  // undefined on a tab the user hasn't acted on. Calling that "restricted"
  // breaks every page.
  it('allows an undefined url', () => {
    expect(P.classifyPage(undefined)).toEqual({ ok: true });
  });
  it('allows an empty url', () => {
    expect(P.classifyPage('')).toEqual({ ok: true });
  });
  it('allows a non-string url', () => {
    expect(P.classifyPage(null as unknown as string)).toEqual({ ok: true });
    expect(P.classifyPage(42 as unknown as string)).toEqual({ ok: true });
  });
});

describe('explainInjectionError — the real browser strings', () => {
  const cases: Array<[string, string, string | null]> = [
    // Chrome, no activeTab and no host permission.
    ['Missing host permission for the tab', 'needs-access', 'retry'],
    ['Extension does not have permission to access this page', 'needs-access', 'retry'],
    // Orphaned tab — the silent failure Phase 3 is here to kill.
    ['Extension context invalidated.', 'orphaned', 'reload'],
    ['Could not establish connection. Receiving end does not exist.', 'orphaned', 'reload'],
    // Walled-off pages we could not detect from the URL (PDF viewer, gallery).
    // Chrome words a chrome:// refusal as a permission problem, but no grant
    // can ever open a browser page — so the scheme in the message wins.
    ['Cannot access contents of the page at chrome://extensions/. Extension manifest must request permission to access this host.', 'restricted', 'demo'],
    ['Cannot access contents of url "https://example.com/doc.pdf".', 'restricted', 'demo'],
    ['The extensions gallery cannot be scripted.', 'restricted', 'demo'],
    ['Cannot access a chrome:// URL', 'restricted', 'demo'],
    ['Cannot access contents of the page. Extension manifest must request permission to access the respective host.', 'needs-access', 'retry'],
    // Tab moved under us.
    ['No tab with id: 418.', 'page-moved', 'retry'],
    ['Frame with ID 0 was removed.', 'page-moved', 'retry'],
    // Strict CSP.
    ["Refused to execute inline script because it violates the following Content Security Policy directive", 'csp', null],
  ];

  for (const [msg, reason, action] of cases) {
    it(`${reason}: ${msg.slice(0, 44)}…`, () => {
      const v = P.explainInjectionError(msg);
      expect(v.ok).toBe(false);
      expect(v.reason).toBe(reason);
      expect(v.action).toBe(action);
      expect(v.title).toBeTruthy();
      expect(v.detail).toBeTruthy();
    });
  }

  it('reads the message off an Error', () => {
    expect(P.explainInjectionError(new Error('Extension context invalidated')).reason).toBe('orphaned');
  });

  it('a scheme in the message outranks the permission wording', () => {
    // Chrome words both of these as "must request permission". Only one of
    // them is fixable by granting access, and the difference is the scheme.
    expect(
      P.explainInjectionError(
        'Cannot access contents of url "chrome://extensions/". Extension manifest must request permission to access this host.',
      ).reason,
    ).toBe('restricted');
    expect(
      P.explainInjectionError(
        'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      ).reason,
    ).toBe('needs-access');
  });

  it('passes an unrecognised message through instead of hiding it', () => {
    const v = P.explainInjectionError('Something nobody has seen before (code 7)');
    expect(v.reason).toBe('unknown');
    expect(v.detail).toBe('Something nobody has seen before (code 7)');
    expect(v.action).toBe('reload');
  });

  it('still returns something actionable for an empty error', () => {
    const v = P.explainInjectionError(undefined);
    expect(v.reason).toBe('unknown');
    expect(v.detail).toMatch(/Reload the tab/);
    expect(v.action).toBe('reload');
  });

  it('never returns ok:true — this function is only called on failure', () => {
    for (const input of ['', 'anything', new Error('x'), null, 0]) {
      expect(P.explainInjectionError(input).ok).toBe(false);
    }
  });
});
