// Regression coverage for T-02 (docs/audit/tracebug-product-ux-final-review.md):
// the ticket modal's primary GitHub action must reflect real integration
// configuration in extension mode, not the page/SDK-only `_githubRepo` field.
//
// `_githubConfigured()` is the exact decision function quick-bug.ts's render
// code and click-handler attachment both use — see src/ui/quick-bug.ts:711-713
// and the `open-github`/`github` handler guards just below the modal's
// keydown wiring. Full DOM click-routing (confirm-send.html actually opening)
// is not covered here — that needs a real-browser/e2e harness this repo
// doesn't yet have for this interaction; see the manual-verification note in
// the final review.
import { describe, it, expect, beforeEach } from 'vitest';
import { _githubConfigured, setGithubRepo } from '../src/ui/quick-bug';
import { setTransportMode, setIntegrationStatus } from '../src/ext-transport';
import { setIntegrationsConfig, clearIntegrationsConfig } from '../src/integrations/tracker-client';

beforeEach(() => {
  setGithubRepo(null);
  setTransportMode('page');
  setIntegrationStatus(null);
  localStorage.clear();
  clearIntegrationsConfig();
});

describe('_githubConfigured (extension mode)', () => {
  it('is true when the extension reports GitHub as configured, with no _githubRepo set', () => {
    setTransportMode('extension');
    setIntegrationStatus({ github: true, linear: false, slack: false, ai: false });
    expect(_githubConfigured()).toBe(true);
  });

  it('is false when the extension reports GitHub as not configured', () => {
    setTransportMode('extension');
    setIntegrationStatus({ github: false, linear: false, slack: false, ai: false });
    expect(_githubConfigured()).toBe(false);
  });

  it('ignores a leftover page-mode _githubRepo value in extension mode', () => {
    setTransportMode('extension');
    setGithubRepo('acme/widgets'); // should never happen in practice, but must not leak through
    setIntegrationStatus({ github: false, linear: false, slack: false, ai: false });
    expect(_githubConfigured()).toBe(false);
  });
});

describe('_githubConfigured (page/SDK mode — existing behavior preserved)', () => {
  it('is true when config.githubRepo was set via setGithubRepo', () => {
    setGithubRepo('acme/widgets');
    expect(_githubConfigured()).toBe(true);
  });

  it('is false when no githubRepo is set, even if a BYO-token config exists in localStorage', () => {
    // Page mode's "configured" concept for this button is _githubRepo, same as
    // before this fix — a separately-configured BYO token does not, on its
    // own, flip the primary button to "Open in GitHub" in page/SDK mode.
    setIntegrationsConfig({ github: { token: 'ghp_x', repo: 'acme/app' } });
    expect(_githubConfigured()).toBe(false);
  });

  it('is false with no githubRepo and no integration configured', () => {
    expect(_githubConfigured()).toBe(false);
  });
});
