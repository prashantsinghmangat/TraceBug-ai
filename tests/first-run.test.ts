// Phase 4 Step C: what the first run actually opens.
//
// It used to be `https://tracebug.dev/try.html?welcome=extension` — so the very
// first thing a new user saw depended on their network, and on a page that
// ships separately from the extension. It is now a bundled `welcome.html`, with
// the playground as a link from it.
//
// The existing record-opts test asserted only that ONE tab was created, which
// would keep passing if the URL regressed to the remote page. These assert the
// URL, and that the page does not hardcode anything it has no right to.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createChromeMock, loadBackground, settle, type ChromeMock } from './helpers/chrome-mock';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tracebug-extension');
const HTML = readFileSync(join(extDir, 'welcome.html'), 'utf8');
const JS = readFileSync(join(extDir, 'welcome.js'), 'utf8');

// Assertions about what the page CLAIMS have to ignore what the source
// explains. Both files document why they read the shortcut at runtime, and a
// comment naming the default is not a hardcoded default.
const VISIBLE = HTML.replace(/<!--[\s\S]*?-->/g, '');
const CODE = JS.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('first run opens the bundled welcome page', () => {
  let mock: ChromeMock;
  beforeEach(() => {
    mock = createChromeMock();
    loadBackground(mock);
  });

  it('creates one tab, pointing at welcome.html inside the extension', async () => {
    mock.events.onInstalled.emit({ reason: 'install' });
    await settle();
    expect(mock.createdTabs).toHaveLength(1);
    const url = String((mock.createdTabs[0] as { url?: string }).url);
    expect(url).toContain('welcome.html');
    // The regression that matters: a remote first run.
    expect(url).not.toContain('tracebug.dev');
    expect(url).not.toMatch(/^https?:/);
  });

  it('opens nothing on update or on a browser update', async () => {
    mock.events.onInstalled.emit({ reason: 'update' });
    mock.events.onInstalled.emit({ reason: 'chrome_update' });
    await settle();
    expect(mock.createdTabs).toHaveLength(0);
  });
});

describe('welcome.html ships nothing remote', () => {
  it('loads no external asset', () => {
    // ADR 002 in spirit: a page bundled for first run must render with the
    // network off. Inline <style> is fine (options.html and confirm-send.html
    // do the same); a <link>, external <img> or CDN <script> is not.
    expect(HTML).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(HTML).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(HTML).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(HTML).not.toMatch(/url\(\s*["']?https?:/i);
    // The only script is the local one.
    expect(HTML).toContain('<script src="welcome.js"></script>');
  });

  it('has no inline script, which the extension CSP forbids', () => {
    // script-src 'self' — an inline handler or <script> block would silently
    // not run, and the page would look fine while step 3 stayed blank.
    expect(VISIBLE).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
    expect(VISIBLE).not.toMatch(/\son(click|load|error)=/i);
  });

  it('hardcodes neither the version nor a keyboard shortcut', () => {
    // Both are read at runtime. A literal here is a claim that goes stale or
    // was never true for this user.
    expect(VISIBLE).not.toMatch(/v1\.\d+\.\d+/);
    expect(VISIBLE).not.toMatch(/Ctrl\s*\+\s*Shift/i);
    expect(VISIBLE).not.toMatch(/Alt\s*\+\s*B/i);
    expect(CODE).not.toMatch(/Alt\s*\+\s*B/i);
    expect(JS).toContain('getManifest().version');
    expect(JS).toContain('tb-quick-capture');
  });

  it('carries both shortcut states, so neither is a dead end', () => {
    expect(HTML).toContain('id="keysBound"');
    expect(HTML).toContain('id="keysNone"');
    expect(HTML).toContain('No shortcut set');
    expect(HTML).toContain('Set a shortcut');
  });

  it('branches the shortcuts page on the URL scheme, not the user agent', () => {
    // Same rule as popup.js and the rest of the extension.
    expect(JS).toContain('moz-extension://');
    expect(JS).toContain('about:addons');
    expect(JS).toContain('chrome://extensions/shortcuts');
    expect(JS).not.toMatch(/navigator\.userAgent|userAgentData/);
  });

  it('falls back to text steps when the browser refuses its own settings page', () => {
    // Firefox will not let an extension open about:addons via tabs.create. A
    // button that silently does nothing is worse than instructions.
    expect(JS).toContain('showShortcutSteps');
    expect(JS).toMatch(/Manage Extension Shortcuts/);
  });

  it('tags every outbound link, and links to no page that 404s', () => {
    expect(JS).toContain('utm_source=welcome');
    for (const target of ['try.html', '/feedback', 'github.com']) {
      expect(JS).toContain(target);
    }
    // tracebug.dev/teams does not exist. The card is built only when the
    // constant is set, and the constant must stay empty until it does.
    expect(JS).toMatch(/const TEAM_GUIDE_URL = ""/);
    expect(VISIBLE).not.toContain('/teams');
    expect(CODE).not.toContain('tracebug.dev/teams');
  });

  it('shows the three privacy chips', () => {
    for (const chip of ['No account', 'No upload', 'No telemetry']) {
      expect(HTML).toContain(chip);
    }
  });
});

describe('the build ships it', () => {
  it('lists welcome.html and welcome.js in SHARED_FILES', () => {
    // Missing here means the page exists unpacked and 404s in both store
    // builds — invisible until someone installs the zip.
    const build = readFileSync(join(extDir, 'build', 'build-ext.mjs'), 'utf8');
    const shared = build.slice(build.indexOf('const SHARED_FILES'), build.indexOf('const SHARED_DIRS'));
    expect(shared).toContain('"welcome.html"');
    expect(shared).toContain('"welcome.js"');
  });
});
