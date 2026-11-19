// Store builds file through the production GitHub App (ADR 010). Pure, so
// tests/github-apps.test.ts runs the exact swap build-ext.mjs --store does.

/**
 * Replace the dev app's client id and app URL in the worker bundle source.
 * Throws unless each appears exactly once, so a renamed constant can't
 * silently ship the dev app.
 * @param {string} src  tracebug-provider-api.js
 * @param {{dev:{clientId:string,slug:string}, production:{clientId:string,slug:string}}} apps
 */
export function swapGitHubApp(src, apps) {
  const devId = JSON.stringify(apps.dev.clientId);
  const devUrl = `/apps/${apps.dev.slug}/`;
  const ids = src.split(devId).length - 1;
  const urls = src.split(devUrl).length - 1;
  if (ids !== 1 || urls !== 1) {
    throw new Error(`github-apps: expected the dev client id and app URL once in tracebug-provider-api.js, found ${ids} and ${urls}`);
  }
  return src.replace(devId, JSON.stringify(apps.production.clientId)).replace(devUrl, `/apps/${apps.production.slug}/`);
}
