// ADR 010: which GitHub App a build files through. Unpacked/dev builds use
// "TraceBug Dev"; store builds (`npm run zip:ext` → build-ext.mjs --store)
// swap in the production app. tracebug-extension/build/github-apps.json is
// what build-ext reads; it must agree with the TypeScript constants, and the
// swap must find exactly one dev id and one dev app URL in the worker bundle.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OAUTH_CLIENTS, GITHUB_APP_INSTALL_URL, TODO_OWNER_CLIENT_ID } from '../src/providers/oauth-clients';
// @ts-expect-error — plain .mjs build helper, no types
import { swapGitHubApp } from '../tracebug-extension/build/github-app-swap.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apps = JSON.parse(readFileSync(join(root, 'tracebug-extension', 'build', 'github-apps.json'), 'utf8'));

describe('GitHub App ids per build', () => {
  it('the dev app in github-apps.json is the one the code uses', () => {
    expect(OAUTH_CLIENTS.github).toBe(apps.dev.clientId);
    expect(GITHUB_APP_INSTALL_URL).toBe(`https://github.com/apps/${apps.dev.slug}/installations/new`);
  });

  it('the production app is a public id or the placeholder — never anything secret-shaped', () => {
    const id = apps.production.clientId;
    expect(id === TODO_OWNER_CLIENT_ID || /^Iv[0-9A-Za-z.]{10,40}$/.test(id)).toBe(true);
    expect(apps.production.clientId).not.toBe(apps.dev.clientId);
    expect(apps.production.slug).toMatch(/^[a-z0-9-]+$/);
    expect(Object.keys(apps.production).sort()).toEqual(['clientId', 'name', 'slug']);
    expect(Object.keys(apps.dev).sort()).toEqual(['clientId', 'name', 'slug']);
  });

  it('the worker bundle carries the dev id and app URL exactly once (what --store replaces)', () => {
    const bundle = join(root, 'tracebug-extension', 'tracebug-provider-api.js');
    if (!existsSync(bundle)) return; // built by `npm run build`, which the gates run first
    const src = readFileSync(bundle, 'utf8');
    expect(src.split(JSON.stringify(apps.dev.clientId)).length - 1).toBe(1);
    expect(src.split(`/apps/${apps.dev.slug}/`).length - 1).toBe(1);
    // …and the store swap on the real bundle leaves no trace of the dev app.
    const store = swapGitHubApp(src, apps) as string;
    expect(store).not.toContain(apps.dev.clientId);
    expect(store).not.toContain(`/apps/${apps.dev.slug}/`);
    expect(store).toContain(JSON.stringify(apps.production.clientId));
    expect(store).toContain(`https://github.com/apps/${apps.production.slug}/installations/new`);
  });

  it('refuses to build a store package when the dev id is missing or doubled', () => {
    const fake = { dev: { clientId: 'Iv23devdevdevdev', slug: 'x-dev' }, production: { clientId: 'Iv23prodprodprod', slug: 'x' } };
    expect(() => swapGitHubApp('const a = 1;', fake)).toThrow(/expected the dev client id/);
    expect(() => swapGitHubApp('"Iv23devdevdevdev" "Iv23devdevdevdev" /apps/x-dev/', fake)).toThrow();
    expect(swapGitHubApp('id:"Iv23devdevdevdev",u:"https://github.com/apps/x-dev/installations/new"', fake))
      .toBe('id:"Iv23prodprodprod",u:"https://github.com/apps/x/installations/new"');
  });
});
