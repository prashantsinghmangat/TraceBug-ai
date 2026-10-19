// Phase 4 Step E: the uninstall survey, and naming the page a refusal is about.
//
// Two small things that both fail silently if they are wrong:
//
//   • setUninstallURL is the one chance to hear why someone left, and an unset
//     one loses that with no error anywhere. It must also carry the version and
//     NOTHING else — the page's fine print promises exactly that.
//   • The popup's host/path card must be ABSENT, not blank, when tab.url is
//     invisible. Since Phase 1 made `<all_urls>` optional that is the normal
//     state, so a card that renders an empty row would be the common case.
import { describe, it, expect, beforeEach } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createChromeMock, loadBackground, settle, type ChromeMock } from './helpers/chrome-mock';
import { readText } from './helpers/read-source';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'tracebug-extension');

const POPUP = readText(join(extDir, 'popup.js'));
const HTML = readText(join(extDir, 'popup.html'));

/** Load page-support.js and hand back its real describePage. */
function pageSupport() {
  const sandbox: Record<string, unknown> = { URL, chrome: undefined, console };
  const ctx = createContext(sandbox);
  runInContext(readText(join(extDir, 'page-support.js')), ctx);
  return runInContext('TraceBugPageSupport', ctx) as {
    describePage: (u?: string) => { host: string; path: string } | null;
  };
}

describe('the uninstall survey is wired, and carries only the version', () => {
  let mock: ChromeMock;
  beforeEach(async () => {
    mock = createChromeMock({ version: '1.11.0' });
    loadBackground(mock);
    await settle();
  });

  it('sets an uninstall URL at all', () => {
    // Unset is silent data loss: the browser just opens nothing.
    expect(mock.uninstallUrl).toBeTruthy();
  });

  it('points at /bye with the running version', () => {
    expect(mock.uninstallUrl).toBe('https://tracebug.dev/bye?v=1.11.0');
  });

  it('sends nothing that identifies a person or a machine', () => {
    // The page says "We only receive the version number and what you choose to
    // send." This is that claim, as a test.
    const url = new URL(String(mock.uninstallUrl));
    expect([...url.searchParams.keys()]).toEqual(['v']);
    expect(url.search).not.toMatch(/id=|uid=|install|client|user|t=/i);
  });

  it('does not wait for an install event — a worker restart re-sets it', async () => {
    // It is set at worker start, so a profile that has been running since
    // before this version still gets the survey.
    expect(mock.uninstallUrl).toBeTruthy();
    expect(mock.createdTabs).toHaveLength(0);
  });

  it('reads the version from the manifest, not a literal', () => {
    const m = createChromeMock({ version: '2.0.0' });
    loadBackground(m);
    expect(m.uninstallUrl).toContain('v=2.0.0');
  });
});

describe('describePage names the page honestly, or says nothing', () => {
  const { describePage } = pageSupport();

  it('returns null with no URL — the normal state without site access', () => {
    // This is the case that matters most: it must be null so the card is
    // absent, not an empty row.
    expect(describePage(undefined)).toBeNull();
    expect(describePage('')).toBeNull();
  });

  it('returns null rather than guessing at an unparseable URL', () => {
    expect(describePage('not a url')).toBeNull();
  });

  it('names a browser page by its surface, showing the whole URL', () => {
    // "extensions" is not a hostname anyone recognises, so the host line names
    // the surface instead — matching screens.md screen 3 variant A.
    expect(describePage('chrome://extensions')).toEqual({
      host: 'Chrome settings',
      path: 'chrome://extensions',
    });
    expect(describePage('about:addons')?.host).toBe('Browser page');
    expect(describePage('moz-extension://abc/popup.html')?.host).toBe('Extension page');
  });

  it('calls a local file a local file, and decodes its path', () => {
    const d = describePage('file:///C:/My%20Docs/index.html');
    expect(d?.host).toBe('Local file');
    expect(d?.path).toBe('/C:/My Docs/index.html');
  });

  it('keeps the query string on a normal page — often the whole repro', () => {
    expect(describePage('https://app.example.com/checkout?step=2')).toEqual({
      host: 'app.example.com',
      path: '/checkout?step=2',
    });
  });

  it('shows a bare root as "/" rather than nothing', () => {
    expect(describePage('https://example.com/')).toEqual({ host: 'example.com', path: '/' });
  });
});

describe('the popup renders the card and one glyph per reason', () => {
  it('ships the card hidden, with no copy of its own', () => {
    expect(HTML).toContain('id="pageCard"');
    expect(HTML).toContain('id="pageHost"');
    expect(HTML).toContain('id="pagePath"');
    const card = HTML.slice(HTML.indexOf('id="pageCard"') - 40, HTML.indexOf('id="pageCard"') + 40);
    expect(card).toContain('display:none');
  });

  it('hides the card when describePage says there is nothing to show', () => {
    const fn = POPUP.slice(POPUP.indexOf('function renderPageCard'), POPUP.indexOf('/**\n * Replace the four actions'));
    expect(fn).toContain('if (!described) { card.style.display = "none"; return; }');
    // Set as text — a path is attacker-influenced content on a hostile page.
    expect(fn).toContain('.textContent');
    expect(fn.replace(/^\s*\/\/.*$/gm, '')).not.toContain('innerHTML');
  });

  it('maps each screens.md variant to its own glyph', () => {
    const fn = POPUP.slice(POPUP.indexOf('function renderUnavailableGlyph'), POPUP.indexOf('function renderPageCard'));
    // Variant A: a page the browser forbids. Variant B: local files.
    // Variant C: a tab that only needs reloading.
    for (const reason of ['browser-internal', 'restricted', 'webstore', 'file-no-access', 'orphaned', 'page-moved']) {
      expect(fn).toContain(reason);
    }
    // Indigo only where one click fixes it; muted where nothing can.
    expect(fn).toContain('pg-action');
    expect(fn).toContain('pg-muted');
    // Built as nodes, so it cannot add an ext:lint UNSAFE_VAR_ASSIGNMENT.
    expect(fn.replace(/^\s*\/\/.*$/gm, '')).not.toContain('innerHTML');
  });

  it('keeps a fallback for reasons the design does not name', () => {
    // csp, needs-access and unknown have no glyph in screens.md. They must not
    // render an empty box.
    expect(HTML).toContain('id="unavailableIconFallback"');
    const fn = POPUP.slice(POPUP.indexOf('function renderUnavailableGlyph'), POPUP.indexOf('function renderPageCard'));
    expect(fn).toMatch(/return; \/\/ keep the fallback visible/);
  });

  it('passes the URL through from both call sites', () => {
    expect(POPUP).toContain('showUnavailable(verdict, tab?.url)');
    expect(POPUP).toContain('showUnavailable(verdict, currentTabUrl)');
  });
});

describe('the /bye page keeps its promises', () => {
  const FORM = readText(join(root, 'website', 'app', 'bye', 'ByeForm.tsx'));
  const PAGE = readText(join(root, 'website', 'app', 'bye', 'page.tsx'));
  const FORMS = readText(join(root, 'website', 'public', '__forms.html'));

  it('declares the uninstall form so Netlify collects it', () => {
    // Netlify scans static HTML at build time. Without this twin the POST is
    // accepted and silently discarded.
    expect(FORMS).toContain('name="uninstall"');
    for (const field of ['reason', 'message', 'email', 'version']) {
      expect(FORMS).toContain(`name="${field}"`);
      expect(FORM).toContain(`"${field}"`);
    }
  });

  it('offers all seven reasons from screens.md', () => {
    for (const r of [
      "didn't work on the site I tested",
      'Capturing or exporting broke',
      'hard to figure out',
      'permissions or privacy',
      'switched to a different tool',
      'only needed it once',
      'Something else',
    ]) {
      expect(FORM).toContain(r);
    }
  });

  it('has a Skip that reaches the thank-you state, not a dead end', () => {
    expect(FORM).toContain('Skip');
    expect(FORM).toContain('Thanks, that helps.');
    expect(FORM).toContain('Open a GitHub issue');
    expect(FORM).toContain('Reinstall TraceBug');
  });

  it('shows the thank-you state even when the POST fails', () => {
    // Someone who has already uninstalled must not be shown a retry dialog for
    // our analytics.
    expect(FORM).toMatch(/catch\s*\{[\s\S]*?\}\s*setStatus\("done"\)/);
  });

  it('validates the version it was handed instead of rendering it raw', () => {
    // ?v= comes from a URL anyone can edit, and it is both displayed and sent.
    expect(FORM).toMatch(/test\(raw\)/);
    expect(FORM).toContain('\\d+\\.\\d+\\.\\d+');
  });

  it('states what it receives, and is not indexable', () => {
    expect(FORM).toContain('No tracking on this page');
    expect(FORM).toContain('only receive the version number');
    expect(PAGE).toContain('index: false');
  });

  it('is a bare page — no navbar, no footer, nothing to sell', () => {
    // Imports and JSX, not substrings: the page's own comment explains why it
    // has no Navbar, and saying so is not rendering one.
    expect(PAGE).not.toMatch(/^import .*\b(Navbar|Footer)\b/m);
    expect(PAGE).not.toMatch(/<\s*(Navbar|Footer)\b/);
  });
});
